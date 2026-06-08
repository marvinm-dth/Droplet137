import io
import os
import re
import uuid
import json
import threading
import time
import logging
import mimetypes
import hashlib
import queue
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta, date, time as dt_time
from urllib import request as urlrequest
import urllib.request
from flask import abort, redirect, render_template, request, send_file, url_for, make_response, has_request_context, g
from sqlalchemy import inspect, text, func
from sqlalchemy.orm import selectinload
from app import app

# Import your design (sample preview)
from ticket_engine.designs import work_ticket_v1 as work_ticket_design
from ticket_engine.designs import ticket_tracking_v1
from ticket_engine.designs import ticket_tracking_v1
from app.models import (
    ChecklistItem,
    Project,
    User,
    UserSession,
    Ticket,
    TicketDependency,
    TicketChecklistStatus,
    TicketImage,
    TicketSubmission,
    Attachment,
    Thumbnail,
    Template,
    DB_PATH,
    ensure_designs,
    ensure_project_templates,
    ensure_template_metadata,
    ensure_tracking_ticket,
    engine,
    get_session,
    create_ticket,
)
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from openai import OpenAI
from werkzeug.routing import BuildError
from app.pdf_generator import generate_ticket_pdf_for_ticket

IMAGE_UPLOAD_DIR = Path("data/images")
IMAGE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ATTACHMENT_UPLOAD_DIR = Path("data/attachments")
ATTACHMENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAIL_UPLOAD_DIR = Path("data/thumbnails")
THUMBNAIL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAIL_MAX_SIZE = (320, 320)
THUMBNAIL_ON_READ = os.getenv("THUMBNAIL_ON_READ", "0") == "1"
THUMBNAIL_ASYNC = os.getenv("THUMBNAIL_ASYNC", "1") == "1"
THUMBNAIL_QUEUE_MAX = int(os.getenv("THUMBNAIL_QUEUE_MAX", "1000") or "1000")
THUMBNAIL_ENQUEUE_ON_READ = os.getenv("THUMBNAIL_ENQUEUE_ON_READ", "1") == "1"
THUMBNAIL_FALLBACK_TO_SOURCE = os.getenv("THUMBNAIL_FALLBACK_TO_SOURCE", "1") == "1"
MID_IMAGE_DIR = Path("data/mid_images")
MID_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
MID_IMAGE_MAX_EDGE = max(1, int(os.getenv("MID_IMAGE_MAX_EDGE", "1600") or "1600"))
MID_IMAGE_ON_READ = os.getenv("MID_IMAGE_ON_READ", "1") == "1"
MID_IMAGE_FALLBACK_TO_SOURCE = os.getenv("MID_IMAGE_FALLBACK_TO_SOURCE", "1") == "1"


def _ensure_upload_dir(path: Path) -> None:
    try:
        path.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        app.logger.warning("[uploads] failed to ensure dir %s: %s", path, exc)

API_KEY = (
    os.getenv("API_KEY")
    or os.getenv("X_API_KEY")
    or os.getenv("AUTH_TOKEN")
    or os.getenv("BEARER_TOKEN")
)
BRIDGE_API_KEY = os.getenv("BRIDGE_API_KEY") or os.getenv("FLASK_API_KEY")
CORS_ALLOW_ORIGIN = os.getenv("CORS_ALLOW_ORIGIN", "*")
BRIDGE_CACHE_MODE = os.getenv("BRIDGE_CACHE_MODE", "off").strip().lower()
BRIDGE_PENDING_ON_MISS = os.getenv("BRIDGE_PENDING_ON_MISS", "0") == "1"
USER_AUTH_REQUIRED = os.getenv("USER_AUTH_REQUIRED", "0") == "1"
USER_AUTH_TTL_HOURS = int(os.getenv("USER_AUTH_TTL_HOURS", "168") or "168")

SERVER_PUSH_URL = os.getenv("SERVER_PUSH_URL", "")
SERVER_POLL_URL = os.getenv("SERVER_POLL_URL", "")
POLL_INTERVAL_SEC = 0.5
BRIDGE_PENDING_URL = os.getenv("BRIDGE_PENDING_URL", "")
BRIDGE_ONLY_PRINT = os.getenv("BRIDGE_ONLY_PRINT", "1") == "1"

# Ensure verbose logging (INFO) for polling visibility
app.logger.setLevel(logging.INFO)
if not app.logger.handlers:
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    handler.setFormatter(formatter)
    app.logger.addHandler(handler)

_PENDING_REQUESTS: set[str] = set()
_TICKETS_BY_UUID: dict[str, dict] = {}
_TICKETS_BY_ID: dict[str, dict] = {}
_THUMBNAIL_QUEUE: "queue.Queue[int]" = queue.Queue(maxsize=THUMBNAIL_QUEUE_MAX)
_THUMBNAIL_PENDING: set[int] = set()
_THUMBNAIL_LOCK = threading.Lock()


def _cache_enabled() -> bool:
    return BRIDGE_CACHE_MODE in {"prefer", "fallback"}


def _store_ticket_payload(payload: dict) -> bool:
    if not payload or not isinstance(payload, dict):
        return False
    ticket = payload.get("ticket") or {}
    ticket_uuid = ticket.get("uuid")
    ticket_id = ticket.get("id")
    if not ticket_uuid and ticket_id is None:
        return False
    if _cache_enabled():
        if ticket_uuid:
            _TICKETS_BY_UUID[str(ticket_uuid)] = payload
        if ticket_id is not None:
            _TICKETS_BY_ID[str(ticket_id)] = payload
    return True


def _get_cached_ticket(ticket_ref: str) -> dict | None:
    if not _cache_enabled():
        return None
    key = str(ticket_ref)
    return _TICKETS_BY_UUID.get(key) or _TICKETS_BY_ID.get(key)


def _refresh_ticket_cache(ticket: Ticket) -> None:
    if not _cache_enabled():
        return
    payload = _build_ticket_payload_full(ticket)
    _store_ticket_payload(payload)


def _add_pending_request(ticket_ref: str) -> None:
    if not ticket_ref:
        return
    ref = str(ticket_ref)
    _PENDING_REQUESTS.add(ref)
    app.logger.info(
        "[bridge] pending request added ticketRef=%s total=%s",
        ref,
        len(_PENDING_REQUESTS),
    )


def _pending_response(ticket_ref: str, kind: str):
    payload: dict = {
        "status": "pending",
        "ticketRef": str(ticket_ref),
        "retryAfterMs": 500,
    }
    if kind == "checklist":
        payload["checklist"] = []
    elif kind == "images":
        payload["ticketId"] = None
        payload["images"] = []
    resp = make_response(payload, 202)
    resp.headers["Retry-After"] = "1"
    return resp


def _save_attachment_upload(upload) -> dict | None:
    filename = secure_filename(upload.filename or "")
    if not filename:
        return None
    save_name = f"{uuid.uuid4().hex}_{filename}"
    _ensure_upload_dir(ATTACHMENT_UPLOAD_DIR)
    save_path = ATTACHMENT_UPLOAD_DIR / save_name
    upload.save(save_path)
    return {
        "file_path": str(save_path),
        "file_name": filename,
        "mime_type": upload.mimetype,
    }


def _get_attachment_upload():
    return (
        request.files.get("file")
        or request.files.get("attachment")
        or request.files.get("video")
        or request.files.get("photo")
        or request.files.get("image")
    )


def _save_thumbnail_upload(upload, attachment: Attachment) -> dict | None:
    filename = secure_filename(upload.filename or "")
    if not filename:
        return None
    ext = Path(filename).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = ".jpg"
    if not attachment.uuid:
        attachment.uuid = str(uuid.uuid4())
    save_name = f"{attachment.uuid}_thumb{ext}"
    _ensure_upload_dir(THUMBNAIL_UPLOAD_DIR)
    save_path = THUMBNAIL_UPLOAD_DIR / save_name
    upload.save(save_path)
    return {"file_path": str(save_path)}


def _path_ext(file_path: str | None, file_name: str | None) -> str | None:
    for value in (file_path, file_name):
        if not value:
            continue
        ext = Path(value).suffix.lower()
        if ext:
            return ext
    return None


def _normalize_mime_type(
    mime_type: str | None,
    file_name: str | None,
    file_path: str | None,
) -> str | None:
    if mime_type and mime_type != "application/octet-stream":
        return mime_type
    guess = mimetypes.guess_type(file_name or file_path or "")[0]
    return guess or mime_type


def _looks_like_image_header(file_path: str) -> bool:
    try:
        with open(file_path, "rb") as handle:
            header = handle.read(16)
    except Exception:
        return False
    if header.startswith(b"\xFF\xD8\xFF"):
        return True  # JPEG
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if header[:6] in {b"GIF87a", b"GIF89a"}:
        return True
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return True
    if header[:2] == b"BM":
        return True  # BMP
    if header[:4] in {b"II*\x00", b"MM\x00*"}:
        return True  # TIFF
    if len(header) >= 12 and header[4:8] == b"ftyp":
        brand = header[8:12]
        if brand in {b"heic", b"heif", b"hevc", b"heix", b"mif1", b"msf1", b"avif"}:
            return True
    return False


def _is_probably_image(
    mime_type: str | None,
    file_path: str | None,
    file_name: str | None = None,
) -> bool:
    if mime_type and mime_type.startswith("image/"):
        return True
    ext = _path_ext(file_path, file_name)
    if ext in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic", ".heif", ".avif"}:
        return True
    if not file_path:
        return False
    return _looks_like_image_header(file_path)


def _is_probably_video(
    mime_type: str | None,
    file_path: str | None,
    file_name: str | None = None,
) -> bool:
    if mime_type and mime_type.startswith("video/"):
        return True
    ext = _path_ext(file_path, file_name)
    if not ext:
        return False
    return ext in {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".mpg", ".mpeg", ".3gp"}


def _ensure_attachment_thumbnail(session, attachment: Attachment) -> Thumbnail | None:
    if not attachment or not attachment.file_path:
        return None
    if not attachment.uuid:
        attachment.uuid = str(uuid.uuid4())
    existing = (
        session.query(Thumbnail)
        .filter(Thumbnail.attachment_id == attachment.id)
        .order_by(Thumbnail.id.asc())
        .first()
    )
    if existing:
        return existing
    if not _is_probably_image(attachment.mime_type, attachment.file_path, attachment.file_name):
        return None
    src_path = Path(attachment.file_path)
    if not src_path.exists() or not src_path.is_file():
        return None
    try:
        from PIL import Image  # type: ignore
    except Exception as exc:
        app.logger.warning("Thumbnail skipped (PIL unavailable): %s", exc)
        return None
    try:
        with Image.open(src_path) as img:
            img.thumbnail(THUMBNAIL_MAX_SIZE)
            use_png = img.mode in {"RGBA", "LA", "P"}
            fmt = "PNG" if use_png else "JPEG"
            ext = ".png" if use_png else ".jpg"
            if not use_png and img.mode not in {"RGB", "L"}:
                img = img.convert("RGB")
            save_name = f"{attachment.uuid}_thumb{ext}"
            _ensure_upload_dir(THUMBNAIL_UPLOAD_DIR)
            save_path = THUMBNAIL_UPLOAD_DIR / save_name
            if fmt == "JPEG":
                img.save(save_path, fmt, quality=82, optimize=True)
            else:
                img.save(save_path, fmt, optimize=True)
            width, height = img.size
    except Exception as exc:
        app.logger.warning("Thumbnail creation failed for %s: %s", src_path, exc)
        return None
    thumb = Thumbnail(
        attachment_id=attachment.id,
        file_path=str(save_path),
        width=width,
        height=height,
    )
    session.add(thumb)
    return thumb


def _ensure_thumbnail_for_path(file_path: str | None) -> str | None:
    if not file_path or not _is_probably_image(None, file_path):
        return None
    src_path = Path(file_path)
    if not src_path.exists() or not src_path.is_file():
        return None
    try:
        from PIL import Image  # type: ignore
    except Exception:
        return None
    try:
        stat = src_path.stat()
        key = f"{file_path}:{stat.st_mtime}".encode("utf-8")
        digest = hashlib.sha1(key).hexdigest()
        save_name = f"thumb_{digest}.jpg"
        _ensure_upload_dir(THUMBNAIL_UPLOAD_DIR)
        save_path = THUMBNAIL_UPLOAD_DIR / save_name
        if save_path.exists():
            return str(save_path)
        with Image.open(src_path) as img:
            img.thumbnail(THUMBNAIL_MAX_SIZE)
            if img.mode not in {"RGB", "L"}:
                img = img.convert("RGB")
            img.save(save_path, "JPEG", quality=82, optimize=True)
        return str(save_path)
    except Exception as exc:
        app.logger.warning("Thumbnail fallback failed for %s: %s", src_path, exc)
        return None


def _ensure_mid_image_for_path(file_path: str | None) -> str | None:
    if not file_path or not _is_probably_image(None, file_path):
        return None
    src_path = Path(file_path)
    if not src_path.exists() or not src_path.is_file():
        return None
    try:
        from PIL import Image  # type: ignore
    except Exception:
        return None
    try:
        stat = src_path.stat()
        key = f"{file_path}:{stat.st_mtime}".encode("utf-8")
        digest = hashlib.sha1(key).hexdigest()
        save_name = f"mid_{digest}.jpg"
        _ensure_upload_dir(MID_IMAGE_DIR)
        save_path = MID_IMAGE_DIR / save_name
        if save_path.exists():
            return str(save_path)
        with Image.open(src_path) as img:
            img.thumbnail((MID_IMAGE_MAX_EDGE, MID_IMAGE_MAX_EDGE))
            if img.mode not in {"RGB", "L"}:
                img = img.convert("RGB")
            img.save(save_path, "JPEG", quality=82, optimize=True)
        return str(save_path)
    except Exception as exc:
        app.logger.warning("Mid image generation failed for %s: %s", src_path, exc)
        return None


def _generate_attachment_thumbnail(attachment_id: int) -> None:
    session = get_session()
    try:
        attachment = session.get(Attachment, attachment_id)
        if attachment is None:
            return
        _ensure_attachment_thumbnail(session, attachment)
        session.commit()
    finally:
        session.close()


def _enqueue_attachment_thumbnail(attachment_id: int) -> None:
    if not attachment_id:
        return
    if not THUMBNAIL_ASYNC:
        try:
            _generate_attachment_thumbnail(attachment_id)
        except Exception as exc:
            app.logger.warning("Thumbnail sync failed for attachment=%s: %s", attachment_id, exc)
        return
    with _THUMBNAIL_LOCK:
        if attachment_id in _THUMBNAIL_PENDING:
            return
        _THUMBNAIL_PENDING.add(attachment_id)
    try:
        _THUMBNAIL_QUEUE.put_nowait(attachment_id)
    except queue.Full:
        with _THUMBNAIL_LOCK:
            _THUMBNAIL_PENDING.discard(attachment_id)
        app.logger.warning("Thumbnail queue full; skipped attachment=%s", attachment_id)


def _thumbnail_worker() -> None:
    app.logger.info("Thumbnail worker started")
    while True:
        attachment_id = _THUMBNAIL_QUEUE.get()
        try:
            _generate_attachment_thumbnail(attachment_id)
        except Exception as exc:
            app.logger.warning("Thumbnail worker failed for attachment=%s: %s", attachment_id, exc)
        finally:
            with _THUMBNAIL_LOCK:
                _THUMBNAIL_PENDING.discard(attachment_id)
            _THUMBNAIL_QUEUE.task_done()


def _extract_api_token() -> str | None:
    header_key = request.headers.get("x-api-key")
    auth_header = request.headers.get("authorization", "")
    bearer = (
        auth_header[7:].strip()
        if auth_header.lower().startswith("bearer ")
        else None
    )
    return header_key or bearer


def _extract_user_token() -> str | None:
    header_key = request.headers.get("x-auth-token") or request.headers.get("x-session-token")
    if header_key:
        return header_key
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def _hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _validate_user_token(token: str | None) -> bool:
    if not token:
        return False
    token_hash = _hash_session_token(token)
    now = datetime.now(timezone.utc)
    session = get_session()
    try:
        session_row = (
            session.query(UserSession)
            .options(selectinload(UserSession.user))
            .filter(UserSession.token_hash == token_hash)
            .one_or_none()
        )
        if session_row is None:
            return False
        if session_row.revoked_at is not None:
            return False
        if session_row.expires_at and session_row.expires_at <= now:
            return False
        user = session_row.user
        if user is None or not user.is_active:
            return False
        session_row.last_seen_at = now
        session.commit()
        g.current_user = {
            "id": user.id,
            "username": user.username,
            "role": user.role,
        }
        g.current_session_id = session_row.id
        return True
    finally:
        session.close()


@app.before_request
def _bridge_middleware():
    if request.path.startswith("/api"):
        body_info = ""
        if request.method not in {"GET", "HEAD"}:
            try:
                data = request.get_json(silent=True)
                if data is None:
                    data = request.data.decode("utf-8", errors="ignore")
                body_info = f" body={json.dumps(data)[:200]}"
            except Exception:
                body_info = ""
        path = request.path
        if request.query_string:
            path = f"{path}?{request.query_string.decode('utf-8', errors='ignore')}"
        app.logger.info("[bridge] inbound %s %s%s", request.method, path, body_info)
    if request.method == "OPTIONS":
        return ("", 204)
    if request.path.startswith("/api/bridge") and BRIDGE_API_KEY:
        token = _extract_api_token()
        if token != BRIDGE_API_KEY:
            return {"error": "unauthorized"}, 401
    if request.path.startswith("/api") and not request.path.startswith("/api/bridge"):
        if request.path.startswith("/api/auth"):
            return None
        api_token = _extract_api_token()
        user_token = _extract_user_token()
        authorized = False
        if API_KEY:
            authorized = api_token == API_KEY or _validate_user_token(user_token)
        elif USER_AUTH_REQUIRED:
            authorized = _validate_user_token(user_token)
        else:
            authorized = True
        if not authorized:
            return {"error": "unauthorized"}, 401
    return None


@app.after_request
def _apply_cors_headers(response):
    if request.path.startswith("/api"):
        response.headers.setdefault("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN)
        response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS")
        response.headers.setdefault(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-API-Key, X-Auth-Token, X-Session-Token",
        )
        response.headers.setdefault(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0",
        )
        response.headers.setdefault("Pragma", "no-cache")
        response.headers.setdefault("Expires", "0")
    return response


@app.context_processor
def _inject_users_url():
    try:
        users_url = url_for("user_management")
    except BuildError:
        users_url = "/users"
    return {"users_url": users_url}


def _jsonify(value):
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date, dt_time)):
        return str(value)
    if isinstance(value, dict):
        return {key: _jsonify(val) for key, val in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonify(item) for item in value]
    return str(value)


def _build_page_data(page: str, **kwargs):
    payload = {"page": page}
    payload.update(kwargs)
    return _jsonify(payload)


# -----------------------------
# Dashboard
# -----------------------------
@app.route("/")
def dashboard():
    try:
        users_url = url_for("user_management")
    except BuildError:
        users_url = "/users"
    return render_template(
        "dashboard.html",
        page_data=_build_page_data(
            "dashboard",
            urls={
                "ticket_fill": url_for("ticket_fill"),
                "projects": url_for("projects"),
                "template_new": url_for("template_new"),
                "template_edit": url_for("template_edit"),
                "dbview": url_for("dbview"),
                "users": users_url,
            },
        ),
    )


@app.route("/ticket_pdfs")
def ticket_pdfs():
    session = get_session()
    try:
        rows = (
            session.query(Attachment, Ticket, Project)
            .join(Ticket, Attachment.ticket_id == Ticket.id)
            .outerjoin(Project, Ticket.project_id == Project.id)
            .filter(
                Attachment.mime_type == "application/pdf",
                Attachment.description == "ticket_pdf",
            )
            .order_by(Attachment.uploaded_at.desc().nullslast(), Attachment.id.desc())
            .all()
        )
        pdfs = []
        for attachment, ticket, project in rows:
            pdfs.append(
                {
                    "ticketId": ticket.id,
                    "ticketUuid": ticket.uuid,
                    "ticketTitle": (ticket.name or ticket.dth_number or "").strip(),
                    "projectCode": project.project_code if project else "",
                    "uploadedAt": _iso(attachment.uploaded_at),
                    "fileUrl": _attachment_file_url(attachment),
                }
            )
    finally:
        session.close()

    return render_template(
        "ticket_pdfs.html",
        pdfs=pdfs,
        page_data=_build_page_data("ticket_pdfs", pdfs=pdfs),
    )


@app.route("/dbview")
def dbview():
    inspector = inspect(engine)
    tables = []
    with engine.connect() as conn:
        for table_name in inspector.get_table_names():
            error_msg = None
            rows = []
            columns = []
            try:
                if table_name == "checklist_items":
                    columns = [
                        "uuid",
                        "ticket_uuid",
                        "order_on_list",
                        "text_en",
                        "text_cn",
                        "status",
                        "updated_when",
                        "updated_by",
                        "attachments_uuid",
                        "thumbnail_uuid",
                    ]
                    result = conn.execute(
                        text(
                            """
                            SELECT
                                ci.uuid AS uuid,
                                COALESCE(NULLIF(tcs.ticket_uuid, ''), t.uuid) AS ticket_uuid,
                                ci.order_index AS order_on_list,
                                COALESCE(NULLIF(tcs.text_en, ''), ci.text_en) AS text_en,
                                COALESCE(NULLIF(tcs.text_cn, ''), ci.text_cn) AS text_cn,
                                tcs.status AS status,
                                tcs.checked_at AS updated_when,
                                tcs.checked_by AS updated_by,
                                attachments_agg.attachments_uuid AS attachments_uuid,
                                thumbnails_agg.thumbnail_uuid AS thumbnail_uuid
                            FROM checklist_items AS ci
                            LEFT JOIN ticket_checklist_statuses AS tcs
                                ON tcs.checklist_item_id = ci.id
                            LEFT JOIN tickets AS t
                                ON t.id = tcs.ticket_id
                            LEFT JOIN (
                                SELECT
                                    ticket_id,
                                    group_concat(uuid, ',') AS attachments_uuid
                                FROM attachments
                                GROUP BY ticket_id
                            ) AS attachments_agg
                                ON attachments_agg.ticket_id = t.id
                            LEFT JOIN (
                                SELECT
                                    a.ticket_id AS ticket_id,
                                    group_concat(th.uuid, ',') AS thumbnail_uuid
                                FROM attachments AS a
                                JOIN thumbnails AS th
                                    ON th.attachment_id = a.id
                                GROUP BY a.ticket_id
                            ) AS thumbnails_agg
                                ON thumbnails_agg.ticket_id = t.id
                            ORDER BY ci.id, tcs.ticket_uuid
                            LIMIT 50
                            """
                        )
                    )
                else:
                    columns = [col["name"] for col in inspector.get_columns(table_name)]
                    escaped_table_name = table_name.replace('"', '""')
                    quoted_table = f"\"{escaped_table_name}\""
                    result = conn.execute(text(f"SELECT * FROM {quoted_table} LIMIT 50"))
                rows = [dict(row._mapping) for row in result]
            except Exception as exc:  # pragma: no cover - safety for malformed tables
                error_msg = str(exc)

            tables.append(
                {
                    "name": table_name,
                    "columns": columns,
                    "rows": rows,
                    "error": error_msg,
                }
            )

    return render_template(
        "dbview.html",
        tables=tables,
        page_data=_build_page_data("dbview", tables=tables),
    )


@app.route("/db_view")
def db_view_alias():
    """Legacy alias for dbview."""
    return redirect(url_for("dbview"))


@app.route("/env_check")
def env_check():
    """
    Debug: return whether OPENAI_API_KEY is visible to the server (no key exposed).
    Also tells you where the server thinks the project root is and whether .env exists.
    """
    base_dir = Path(__file__).resolve().parent.parent
    env_path = base_dir / ".env"
    return {
        "openai_key_present": bool(os.getenv("OPENAI_API_KEY")),
        "cwd": str(Path().resolve()),
        "base_dir": str(base_dir),
        "env_path": str(env_path),
        "env_exists": env_path.exists(),
    }


# -----------------------------
# Ticket preview (for testing design)
# -----------------------------
@app.route("/preview")
def preview():
    img = work_ticket_design.render_sample_ticket()

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


@app.route("/preview/<design_id>")
def preview_design(design_id: str):
    """
    Preview a specific design. Defaults to work_ticket_v1 if unknown.
    """
    design_map = {
        "work_ticket_v1": work_ticket_design,
        "ticket_tracking_v1": ticket_tracking_v1,
    }
    design = design_map.get(design_id, work_ticket_design)
    render_fn = getattr(design, "render_sample_ticket", None)
    if render_fn is None:
        abort(404)
    img = render_fn()
    action = request.args.get("action")
    if action == "print":
        print_error = _print_ticket_image(img)
        if print_error:
            return {"error": print_error}, 500
        return {"status": "sent to printer"}
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return send_file(buf, mimetype="image/png")


# -----------------------------
# Users (mock management)
# -----------------------------
@app.route("/users", methods=["GET", "POST"])
def user_management():
    errors: list[str] = []
    message = request.args.get("message")
    form_data = {
        "username": "",
        "display_name": "",
        "email": "",
        "role": "user",
        "is_active": "true",
        "password": "",
    }

    if request.method == "POST":
        action = request.form.get("action", "create")
        if action == "create":
            form_data = {
                "username": request.form.get("username", "").strip(),
                "display_name": request.form.get("display_name", "").strip(),
                "email": request.form.get("email", "").strip(),
                "role": request.form.get("role", "").strip() or "user",
                "is_active": request.form.get("is_active", "true"),
                "password": "",
            }
            password = request.form.get("password", "")
            password_value = password.strip() if isinstance(password, str) else ""
            if not form_data["username"]:
                errors.append("Username is required.")
            if not form_data["role"]:
                errors.append("Role is required.")
            is_active = _coerce_bool(form_data["is_active"], default=None)
            if is_active is None:
                errors.append("Active status is invalid.")

            session = get_session()
            try:
                if not errors:
                    existing = (
                        session.query(User)
                        .filter(User.username == form_data["username"])
                        .one_or_none()
                    )
                    if existing:
                        errors.append("That username already exists.")
                if not errors and form_data["email"]:
                    existing = (
                        session.query(User)
                        .filter(User.email == form_data["email"])
                        .one_or_none()
                    )
                    if existing:
                        errors.append("That email already exists.")
                if not errors:
                    user = User(
                        username=form_data["username"],
                        display_name=form_data["display_name"] or None,
                        email=form_data["email"] or None,
                        role=form_data["role"],
                        is_active=bool(is_active),
                    )
                    if password_value:
                        user.password_hash = generate_password_hash(password_value)
                    session.add(user)
                    session.commit()
                    return redirect(url_for("user_management", message="User created"))
            except Exception:
                session.rollback()
                errors.append("Failed to create user.")
            finally:
                session.close()
        elif action == "update":
            user_id_raw = request.form.get("user_id")
            try:
                user_id = int(user_id_raw)
            except (TypeError, ValueError):
                errors.append("Invalid user id.")
                user_id = None

            username = request.form.get("username", "").strip()
            display_name = request.form.get("display_name", "").strip()
            email = request.form.get("email", "").strip()
            role = request.form.get("role", "").strip() or "user"
            is_active = _coerce_bool(request.form.get("is_active"), default=None)
            password = request.form.get("password", "")
            password_value = password.strip() if isinstance(password, str) else ""

            if not username:
                errors.append("Username is required.")
            if not role:
                errors.append("Role is required.")
            if is_active is None:
                errors.append("Active status is invalid.")

            session = get_session()
            try:
                user = session.get(User, user_id) if user_id else None
                if user is None:
                    errors.append("User not found.")
                if user and not errors:
                    if username != user.username:
                        existing = (
                            session.query(User)
                            .filter(User.username == username, User.id != user.id)
                            .one_or_none()
                        )
                        if existing:
                            errors.append("That username already exists.")
                    if email and email != (user.email or ""):
                        existing = (
                            session.query(User)
                            .filter(User.email == email, User.id != user.id)
                            .one_or_none()
                        )
                        if existing:
                            errors.append("That email already exists.")
                if user and not errors:
                    user.username = username
                    user.display_name = display_name or None
                    user.email = email or None
                    user.role = role
                    user.is_active = bool(is_active)
                    if password_value:
                        user.password_hash = generate_password_hash(password_value)
                    session.commit()
                    return redirect(url_for("user_management", message="User updated"))
            except Exception:
                session.rollback()
                errors.append("Failed to update user.")
            finally:
                session.close()
        elif action == "delete":
            user_id_raw = request.form.get("user_id")
            try:
                user_id = int(user_id_raw)
            except (TypeError, ValueError):
                errors.append("Invalid user id.")
                user_id = None

            session = get_session()
            try:
                user = session.get(User, user_id) if user_id else None
                if user is None:
                    errors.append("User not found.")
                else:
                    session.delete(user)
                    session.commit()
                    return redirect(url_for("user_management", message="User deleted"))
            except Exception:
                session.rollback()
                errors.append("Failed to delete user.")
            finally:
                session.close()
        elif action == "logout":
            user_id_raw = request.form.get("user_id")
            try:
                user_id = int(user_id_raw)
            except (TypeError, ValueError):
                errors.append("Invalid user id.")
                user_id = None

            session = get_session()
            try:
                if user_id is None:
                    errors.append("User not found.")
                else:
                    now = datetime.now(timezone.utc)
                    revoked = (
                        session.query(UserSession)
                        .filter(
                            UserSession.user_id == user_id,
                            UserSession.revoked_at.is_(None),
                        )
                        .update({UserSession.revoked_at: now}, synchronize_session=False)
                    )
                    session.commit()
                    msg = "User logged out" if revoked else "No active sessions to revoke"
                    return redirect(url_for("user_management", message=msg))
            except Exception:
                session.rollback()
                errors.append("Failed to log out user.")
            finally:
                session.close()
        else:
            errors.append("Unknown action.")

    session = get_session()
    try:
        users = session.query(User).order_by(User.id.asc()).all()
        now = datetime.now(timezone.utc)
        session_counts = dict(
            session.query(UserSession.user_id, func.count(UserSession.id))
            .filter(UserSession.revoked_at.is_(None))
            .filter((UserSession.expires_at.is_(None)) | (UserSession.expires_at > now))
            .group_by(UserSession.user_id)
            .all()
        )
    finally:
        session.close()

    return render_template(
        "users.html",
        users=users,
        session_counts=session_counts,
        errors=errors,
        message=message,
        form_data=form_data,
        page_data=_build_page_data(
            "users",
            users=[
                {
                    "id": user.id,
                    "username": user.username,
                    "display_name": user.display_name or "",
                    "email": user.email or "",
                    "role": user.role,
                    "is_active": bool(user.is_active),
                }
                for user in users
            ],
            session_counts=session_counts,
            errors=errors,
            message=message,
            form_data=form_data,
            urls={"user_management": url_for("user_management")},
        ),
    )


# -----------------------------
# Projects
# -----------------------------
def _serialize_datetime(value):
    if value is None:
        return None
    return value.isoformat()


def _serialize_template(template):
    if template is None:
        return None
    return {
        "id": template.id,
        "template_id": template.template_id,
        "template_code": template.template_code,
        "design_id": template.design_id,
        "name": template.name,
        "job_type_en": template.job_type_en,
        "job_type_cn": template.job_type_cn,
    }


def _serialize_ticket(ticket):
    if ticket is None:
        return None
    payload = {
        "id": ticket.id,
        "uuid": ticket.uuid,
        "template_id": ticket.template_id,
        "project_id": ticket.project_id,
        "dth_number": ticket.dth_number,
        "name": ticket.name,
        "status": ticket.status,
        "created_at": _serialize_datetime(ticket.created_at),
        "printed_at": _serialize_datetime(ticket.printed_at),
        "printed_by": ticket.printed_by,
        "template": _serialize_template(ticket.template),
    }
    if has_request_context():
        payload["detail_url"] = url_for("ticket_detail", uuid=ticket.uuid)
        payload["delete_url"] = url_for("ticket_delete", uuid=ticket.uuid)
    return payload


def _serialize_project(project):
    if project is None:
        return None
    payload = {
        "id": project.id,
        "project_uuid": project.project_uuid,
        "project_code": project.project_code,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "created_at": _serialize_datetime(project.created_at),
        "updated_at": _serialize_datetime(project.updated_at),
    }
    if has_request_context():
        payload["url"] = url_for("project_detail", project_code=project.project_code)
    payload["has_tickets"] = bool(getattr(project, "tickets", None))
    return payload


def _build_projects_page_data(
    *,
    projects_list,
    archived_projects,
    selected_project,
    project_tickets,
    templates,
    form_data,
    message,
    errors,
):
    def _project_payload(project):
        return {
            "id": project.id,
            "projectCode": project.project_code,
            "name": project.name or project.project_code,
            "description": project.description or "",
            "status": project.status,
            "tickets": [t.id for t in getattr(project, "tickets", [])],
        }

    active_projects = [_project_payload(p) for p in projects_list]
    archived_projects_payload = [_project_payload(p) for p in archived_projects]

    selected_payload = None
    if selected_project:
        selected_payload = {
            "id": selected_project.id,
            "projectCode": selected_project.project_code,
            "name": selected_project.name or selected_project.project_code,
            "description": selected_project.description or "",
            "status": selected_project.status,
        }

    ticket_payloads = []
    for ticket in project_tickets or []:
        checklist_total = len(getattr(ticket, "checklist_statuses", []) or [])
        checklist_done = sum(1 for cs in getattr(ticket, "checklist_statuses", []) if cs.status == "complete")
        attachments_count = len(getattr(ticket, "attachments", []) or [])
        dependencies = []
        for dep in getattr(ticket, "dependencies", []) or []:
            dep_ticket = getattr(dep, "depends_on", None)
            if dep_ticket is None:
                continue
            if dep_ticket.project_id != ticket.project_id:
                continue
            dep_name = ""
            if getattr(dep_ticket, "template", None) is not None:
                dep_name = dep_ticket.template.name or dep_ticket.template.template_code or ""
            if not dep_name:
                dep_name = dep_ticket.name or "Ticket"
            dependencies.append(
                {
                    "id": dep_ticket.id,
                    "number": dep_ticket.ticket_number,
                    "name": dep_name,
                    "status": dep_ticket.status or "new",
                }
            )
        blocked = any(dep.get("status") != "complete" for dep in dependencies)
        edited_since_print = False
        if ticket.printed_at and ticket.updated_at:
            edited_since_print = ticket.updated_at > ticket.printed_at
        ticket_payloads.append(
            {
                "id": ticket.id,
                "uuid": ticket.uuid,
                "templateName": ticket.template.name if ticket.template else "",
                "templateCode": ticket.template.template_code if ticket.template else "",
                "ticketNumber": ticket.ticket_number,
                "worker": ticket.name or "",
                "section": ticket.ticket_section or "General",
                "status": ticket.status or "new",
                "checklistTotal": checklist_total,
                "checklistDone": checklist_done,
                "checklistHours": 0,
                "ticketHours": ticket.ticket_hours or 0,
                "loggedHours": ticket.logged_hours or 0,
                "attachments": attachments_count,
                "dependencies": dependencies,
                "blocked": blocked,
                "hasIssue": ticket.status == "issue",
                "editedSincePrint": edited_since_print,
            }
        )

    section_labels = []
    for t in ticket_payloads:
        label = t["section"] or "General"
        if label not in section_labels:
            section_labels.append(label)
    if not section_labels:
        section_labels = ["General"]
    sections = []
    for label in section_labels:
        section_tickets = [t for t in ticket_payloads if t["section"] == label]
        sections.append({"label": label, "tickets": section_tickets, "count": len(section_tickets)})

    worker_options = sorted({t["worker"] for t in ticket_payloads if t["worker"]})
    status_options = ["issue", "in_progress", "open", "upcoming", "new", "complete"]

    templates_payload = [
        {
            "id": tpl.id,
            "templateCode": tpl.template_code,
            "name": tpl.name or "",
        }
        for tpl in templates
    ]

    return _build_page_data(
        "projects",
        projects=active_projects,
        archivedProjects=archived_projects_payload,
        selectedProject=selected_payload,
        sections=sections,
        templates=templates_payload,
        sectionLabels=section_labels,
        statusOptions=status_options,
        workerOptions=worker_options,
        message=message,
        errors=errors or [],
        formData=form_data,
        urls={
            "projects": url_for("projects"),
            "projectDetail": url_for("project_detail", project_code="__CODE__"),
            "ticketDetail": url_for("ticket_detail", uuid="__UUID__"),
        },
    )

@app.route("/projects", methods=["GET", "POST"])
def projects():
    errors: list[str] = []
    message = request.args.get("message")
    form_data = {"project_code": "", "description": ""}

    if request.method == "POST":
        action = request.form.get("action", "create")
        if action == "create":
            form_data = {
                "project_code": request.form.get("project_code", "").strip(),
                "description": request.form.get("description", "").strip(),
            }
            if not form_data["project_code"]:
                errors.append("Project code (DTH number) is required.")

            if not errors:
                session = get_session()
                try:
                    existing = (
                        session.query(Project)
                        .filter(Project.project_code == form_data["project_code"])
                        .one_or_none()
                    )
                    if existing:
                        errors.append("That project already exists.")
                    else:
                        now = datetime.now(timezone.utc)
                        project = Project(
                            project_code=form_data["project_code"],
                            name=form_data["project_code"],
                            description=form_data["description"],
                            status="active",
                            created_at=now,
                            updated_at=now,
                        )
                        session.add(project)
                        session.flush()
                        ensure_designs(session)
                        base_templates = (
                            session.query(Template)
                            .filter(Template.design_id == "work_ticket_v1")
                            .all()
                        )
                        ensure_project_templates(session, project, base_templates)
                        session.commit()
                        return redirect(url_for("projects", message="Project created"))
                except Exception:
                    session.rollback()
                    errors.append("Failed to create project.")
                finally:
                    session.close()
        elif action == "update":
            project_id = request.form.get("project_id")
            name = request.form.get("name", "").strip()
            description = request.form.get("description", "").strip()
            status = request.form.get("status", "").strip() or "active"
            new_project_code = request.form.get("project_code", "").strip()
            if not new_project_code and name:
                new_project_code = name  # keep code in sync with name when code not provided
            session = get_session()
            try:
                proj = session.get(Project, int(project_id)) if project_id else None
                if proj is None:
                    errors.append("Project not found.")
                else:
                    if not new_project_code:
                        errors.append("Project code is required.")
                    else:
                        existing_code = (
                            session.query(Project)
                            .filter(Project.project_code == new_project_code, Project.id != proj.id)
                            .one_or_none()
                        )
                        if existing_code:
                            errors.append("Another project already uses that code.")
                    if not errors:
                        old_code = proj.project_code
                        proj.project_code = new_project_code
                        proj.name = name or proj.project_code
                        proj.description = description
                        proj.status = status
                        proj.updated_at = datetime.now(timezone.utc)
                        session.query(Ticket).filter(Ticket.project_id == proj.id).update({Ticket.dth_number: new_project_code})
                        session.commit()
                        return redirect(url_for("project_detail", project_code=proj.project_code, message="Project updated"))
            except Exception:
                session.rollback()
                errors.append("Failed to update project.")
            finally:
                session.close()
        elif action == "update_ticket":
            ticket_id = request.form.get("ticket_id")
            project_code_param = request.form.get("project_code")
            ticket_name = request.form.get("ticket_name", "").strip()
            ticket_status = request.form.get("ticket_status", "").strip() or "open"
            ticket_section = request.form.get("ticket_section", "").strip()
            ticket_number_raw = request.form.get("ticket_number")
            ticket_hours_raw = request.form.get("ticket_hours") if "ticket_hours" in request.form else None
            logged_hours_raw = request.form.get("logged_hours") if "logged_hours" in request.form else None
            dependencies_present = "dependencies_present" in request.form
            dependency_ids_raw = request.form.getlist("dependencies[]") if dependencies_present else []
            allowed_status = {"upcoming", "in_progress", "complete", "open", "new", "issue"}
            is_fetch = request.headers.get("X-Requested-With") == "fetch"
            if ticket_status not in allowed_status:
                if is_fetch:
                    return {"error": "Invalid ticket status."}, 400
                errors.append("Invalid ticket status.")
            ticket_number = None
            if ticket_number_raw not in (None, ""):
                try:
                    ticket_number = int(ticket_number_raw)
                except (TypeError, ValueError):
                    if is_fetch:
                        return {"error": "Ticket number must be a whole number."}, 400
                    errors.append("Ticket number must be a whole number.")
            ticket_hours = None
            if ticket_hours_raw is not None:
                if ticket_hours_raw == "":
                    ticket_hours = None
                else:
                    try:
                        ticket_hours = float(ticket_hours_raw)
                    except (TypeError, ValueError):
                        if is_fetch:
                            return {"error": "Ticket hours must be a number."}, 400
                        errors.append("Ticket hours must be a number.")
            logged_hours = None
            if logged_hours_raw is not None:
                if logged_hours_raw == "":
                    logged_hours = None
                else:
                    try:
                        logged_hours = float(logged_hours_raw)
                    except (TypeError, ValueError):
                        if is_fetch:
                            return {"error": "Logged hours must be a number."}, 400
                        errors.append("Logged hours must be a number.")
            skip_update = bool(errors)
            session = get_session()
            try:
                if not skip_update:
                    ticket = session.get(Ticket, int(ticket_id)) if ticket_id else None
                    if ticket is None:
                        if is_fetch:
                            return {"error": "Ticket not found."}, 404
                        errors.append("Ticket not found.")
                    else:
                        ticket.name = ticket_name
                        ticket.status = ticket_status
                        ticket.ticket_number = ticket_number
                        if "ticket_section" in request.form:
                            ticket.ticket_section = ticket_section or None
                        if ticket_hours_raw is not None:
                            ticket.ticket_hours = ticket_hours
                        if logged_hours_raw is not None:
                            ticket.logged_hours = logged_hours
                        if dependencies_present:
                            dep_ids = []
                            for raw_id in dependency_ids_raw:
                                try:
                                    dep_id = int(raw_id)
                                except (TypeError, ValueError):
                                    continue
                                if ticket.id and dep_id == ticket.id:
                                    continue
                                dep_ids.append(dep_id)
                            dep_ids = sorted(set(dep_ids))
                            ticket.dependencies = []
                            if dep_ids:
                                dep_tickets = (
                                    session.query(Ticket)
                                    .filter(Ticket.id.in_(dep_ids))
                                    .all()
                                )
                                for dep_ticket in dep_tickets:
                                    if dep_ticket.project_id != ticket.project_id:
                                        continue
                                    ticket.dependencies.append(TicketDependency(depends_on=dep_ticket))
                        ticket.updated_at = datetime.now(timezone.utc)
                        session.commit()
                        _refresh_ticket_cache(ticket)
                        if is_fetch:
                            return {"ok": True}
                        if project_code_param:
                            return redirect(url_for("project_detail", project_code=project_code_param, message="Ticket updated"))
                        return redirect(url_for("projects", message="Ticket updated"))
            except Exception:
                session.rollback()
                if is_fetch:
                    return {"error": "Failed to update ticket."}, 500
                errors.append("Failed to update ticket.")
            finally:
                session.close()
        elif action == "add_ticket":
            project_id = request.form.get("project_id")
            template_id = request.form.get("template_id")
            ticket_section = request.form.get("ticket_section", "").strip()
            ticket_name = request.form.get("ticket_name", "").strip()
            blank_ticket = request.form.get("blank_ticket") == "1"
            if not project_id or not template_id:
                errors.append("Project and template are required.")
            session = get_session()
            try:
                proj = session.get(Project, int(project_id)) if project_id else None
                template = session.get(Template, int(template_id)) if template_id else None
                if proj is None or template is None:
                    errors.append("Project or template not found.")
                else:
                    proj.updated_at = datetime.now(timezone.utc)
                    create_ticket(
                        session,
                        template_id=template.id,
                        project_id=proj.id,
                        dth_number=proj.project_code,
                        name=ticket_name or "",
                        ticket_section=ticket_section or "General",
                        status="new",
                        checklist_statuses=[] if blank_ticket else None,
                    )
                    return redirect(url_for("project_detail", project_code=proj.project_code, message="Ticket created"))
            except Exception:
                session.rollback()
                errors.append("Failed to add ticket.")
            finally:
                session.close()
        elif action == "print_both":
            ticket_id = request.form.get("ticket_id")
            project_code_param = request.form.get("project_code")
            session = get_session()
            try:
                ticket = session.get(Ticket, int(ticket_id)) if ticket_id else None
                if ticket is None:
                    errors.append("Ticket not found.")
                else:
                    try:
                        _enqueue_pending_ticket(ticket.uuid)
                    except Exception:
                        pass
                    try:
                        _push_ticket_to_server(ticket)
                    except Exception:
                        pass
                    slots = _slots_from_ticket(ticket)
                    img = _render_design_image(ticket.template.design_id if ticket.template else "work_ticket_v1", slots)
                    err = _print_ticket_image(img)
                    if err:
                        errors.append(err)
                    if not errors:
                        try:
                            ensure_tracking_ticket(session, ticket, qr_payload=_build_ticket_qr_url(ticket))
                            session.commit()
                        except Exception:
                            session.rollback()
                        t_slots = _slots_from_ticket(ticket)
                        t_img = _render_design_image("ticket_tracking_v1", t_slots)
                        t_err = _print_ticket_image(t_img)
                        if t_err:
                            errors.append(f"Tracking ticket print error: {t_err}")
                    if not errors:
                        msg = "Ticket (and tracking ticket) sent to printer."
                        if project_code_param:
                            return redirect(url_for("project_detail", project_code=project_code_param, message=msg))
                        return redirect(url_for("projects", message=msg))
            except Exception as exc:
                errors.append(f"Failed to print: {exc}")
            finally:
                session.close()
        elif action == "delete":
            project_id = request.form.get("project_id")
            session = get_session()
            try:
                proj = session.get(Project, int(project_id)) if project_id else None
                if proj is None:
                    errors.append("Project not found.")
                else:
                    has_tickets = session.query(Ticket).filter(Ticket.project_id == proj.id).count() > 0
                    if has_tickets:
                        errors.append("Cannot delete a project that has tickets.")
                    else:
                        session.delete(proj)
                        session.commit()
                        return redirect(url_for("projects", message="Project deleted"))
            except Exception:
                session.rollback()
                errors.append("Failed to delete project.")
            finally:
                session.close()
        elif action == "archive":
            project_id = request.form.get("project_id")
            session = get_session()
            try:
                proj = session.get(Project, int(project_id)) if project_id else None
                if proj is None:
                    errors.append("Project not found.")
                else:
                    proj.status = "archived"
                    proj.updated_at = datetime.now(timezone.utc)
                    session.commit()
                    return redirect(url_for("projects", message="Project archived"))
            except Exception:
                session.rollback()
                errors.append("Failed to archive project.")
            finally:
                session.close()
        elif action == "activate":
            project_id = request.form.get("project_id")
            session = get_session()
            try:
                proj = session.get(Project, int(project_id)) if project_id else None
                if proj is None:
                    errors.append("Project not found.")
                else:
                    proj.status = "active"
                    proj.updated_at = datetime.now(timezone.utc)
                    session.commit()
                    return redirect(url_for("projects", message="Project activated"))
            except Exception:
                session.rollback()
                errors.append("Failed to activate project.")
            finally:
                session.close()
        elif action == "clone":
            source_id = request.form.get("source_project_id")
            new_code = request.form.get("new_project_code", "").strip()
            if not source_id or not new_code:
                errors.append("Source project and new project code are required for cloning.")
            if not errors:
                session = get_session()
                try:
                    source_proj = session.get(Project, int(source_id))
                    if not source_proj:
                        errors.append("Source project not found.")
                    else:
                        if session.query(Project).filter(Project.project_code == new_code).one_or_none():
                            errors.append("A project with that code already exists.")
                        else:
                            now = datetime.now(timezone.utc)
                            new_proj = Project(
                                project_code=new_code,
                                name=new_code,
                                description=f"Cloned from {source_proj.project_code}",
                                status="active",
                                created_at=now,
                                updated_at=now,
                            )
                            session.add(new_proj)
                            session.flush()
                            source_tickets = (
                                session.query(Ticket)
                                .options(selectinload(Ticket.images))
                                .filter(Ticket.project_id == source_proj.id)
                                .all()
                            )
                            for t in source_tickets:
                                imgs = [{"file_path": img.file_path, "caption": img.caption, "order_index": img.order_index} for img in t.images]
                                create_ticket(
                                    session,
                                    template_id=t.template_id,
                                    project_id=new_proj.id,
                                    dth_number=new_proj.project_code,
                                    name=t.name,
                                    notes_en=t.notes_en,
                                    notes_cn=t.notes_cn,
                                    status="new",
                                    printed_by=None,
                                    images=imgs,
                                )
                            session.commit()
                            return redirect(url_for("projects", project_code=new_proj.project_code, message="Project cloned"))
                except Exception:
                    session.rollback()
                    errors.append("Failed to clone project.")
                finally:
                    session.close()

    selected_code = request.args.get("project_code")
    session = get_session()
    try:
        projects_list = (
            session.query(Project)
            .options(selectinload(Project.tickets).selectinload(Ticket.template))
            .filter(Project.status != "archived")
            .order_by(Project.updated_at.desc().nullslast(), Project.id.desc())
            .all()
        )
        archived_projects = (
            session.query(Project)
            .options(selectinload(Project.tickets).selectinload(Ticket.template))
            .filter(Project.status == "archived")
            .order_by(Project.updated_at.desc().nullslast(), Project.id.desc())
            .all()
        )
        selected_project = None
        project_tickets = []
        ticket_pairs = []
        if selected_code:
            selected_project = (
                session.query(Project)
                .filter(Project.project_code == selected_code)
                .one_or_none()
            )
            if selected_project:
                project_tickets = (
                    session.query(Ticket)
                    .options(
                        selectinload(Ticket.template),
                        selectinload(Ticket.checklist_statuses),
                        selectinload(Ticket.attachments),
                        selectinload(Ticket.dependencies)
                        .selectinload(TicketDependency.depends_on)
                        .selectinload(Ticket.template),
                    )
                    .filter(Ticket.project_id == selected_project.id)
                    .all()
                )
                project_tickets = sorted(
                    project_tickets,
                    key=lambda t: (t.template.template_code if t.template else "", t.id),
                )
                for t in project_tickets:
                    if t.template and t.template.design_id != "work_ticket_v1":
                        continue
                    ticket_pairs.append({"base": t, "tracking": None})
        templates = (
            session.query(Template)
            .filter(Template.design_id == "work_ticket_v1", Template.is_active.is_(True))
            .order_by(Template.template_code.asc())
            .all()
        )
    finally:
        session.close()

    return render_template(
        "projects.html",
        projects=projects_list,
        archived_projects=archived_projects,
        selected_project=selected_project,
        ticket_pairs=ticket_pairs,
        message=message,
        errors=errors,
        form_data=form_data,
        page_data=_build_projects_page_data(
            projects_list=projects_list,
            archived_projects=archived_projects,
            selected_project=selected_project,
            project_tickets=project_tickets,
            templates=templates,
            form_data=form_data,
            message=message,
            errors=errors,
        ),
    )


@app.route("/projects/<project_code>")
def project_detail(project_code: str):
    session = get_session()
    try:
        projects_list = (
            session.query(Project)
            .options(selectinload(Project.tickets).selectinload(Ticket.template))
            .filter(Project.status != "archived")
            .order_by(Project.updated_at.desc().nullslast(), Project.id.desc())
            .all()
        )
        archived_projects = (
            session.query(Project)
            .options(selectinload(Project.tickets).selectinload(Ticket.template))
            .filter(Project.status == "archived")
            .order_by(Project.updated_at.desc().nullslast(), Project.id.desc())
            .all()
        )
        selected_project = (
            session.query(Project)
            .filter(Project.project_code == project_code)
            .one_or_none()
        )
        if selected_project is None:
            abort(404)
        project_tickets = (
            session.query(Ticket)
            .options(
                selectinload(Ticket.template),
                selectinload(Ticket.checklist_statuses),
                selectinload(Ticket.attachments),
                selectinload(Ticket.dependencies)
                .selectinload(TicketDependency.depends_on)
                .selectinload(Ticket.template),
            )
            .filter(Ticket.project_id == selected_project.id)
            .all()
        )
        project_tickets = sorted(
            project_tickets,
            key=lambda t: (t.template.template_code if t.template else "", t.id),
        )
        ticket_pairs = []
        for t in project_tickets:
            if t.template and t.template.design_id != "work_ticket_v1":
                continue
            ticket_pairs.append({"base": t, "tracking": None})
        templates = (
            session.query(Template)
            .filter(Template.design_id == "work_ticket_v1", Template.is_active.is_(True))
            .order_by(Template.template_code.asc())
            .all()
        )
    finally:
        session.close()

    return render_template(
        "projects.html",
        projects=projects_list,
        archived_projects=archived_projects,
        selected_project=selected_project,
        ticket_pairs=ticket_pairs,
        message=request.args.get("message"),
        errors=[],
        form_data={"project_code": "", "description": ""},
        page_data=_build_projects_page_data(
            projects_list=projects_list,
            archived_projects=archived_projects,
            selected_project=selected_project,
            project_tickets=project_tickets,
            templates=templates,
            form_data={"project_code": "", "description": ""},
            message=request.args.get("message"),
            errors=[],
        ),
    )


def _slots_from_ticket(ticket: Ticket) -> dict:
    slots = {
        "template_code": ticket.template.template_code if ticket.template else "",
        "job_type_en": ticket.template.job_type_en if ticket.template else "",
        "job_type_cn": ticket.template.job_type_cn if ticket.template else "",
        "checklist_items": [
            {
                "en": cs.text_en or (cs.checklist_item.text_en if cs.checklist_item else ""),
                "cn": cs.text_cn or (cs.checklist_item.text_cn if cs.checklist_item else ""),
            }
            for cs in ticket.checklist_statuses
        ],
        "dth_number": ticket.dth_number or "",
        "name": ticket.name or "",
        "notes_en": ticket.notes_en or "",
        "notes_cn": ticket.notes_cn or "",
        "image_paths": [img.file_path for img in ticket.images],
    }
    slots["qr_data"] = _build_ticket_qr_url(ticket)
    return slots


def _build_ticket_media(
    session,
    ticket: Ticket,
    generate_thumbs: bool | None = None,
    fallback_to_source: bool | None = None,
) -> tuple[dict, bool]:
    if generate_thumbs is None:
        generate_thumbs = THUMBNAIL_ON_READ
    if fallback_to_source is None:
        fallback_to_source = THUMBNAIL_FALLBACK_TO_SOURCE
    created_thumbs = False

    def _attachment_view(att: Attachment) -> dict:
        nonlocal created_thumbs
        thumb_path = None
        thumb = None
        if getattr(att, "thumbnails", None):
            thumb = att.thumbnails[0]
        elif generate_thumbs:
            thumb = _ensure_attachment_thumbnail(session, att)
            if thumb:
                created_thumbs = True
        elif THUMBNAIL_ASYNC and THUMBNAIL_ENQUEUE_ON_READ and att.id:
            _enqueue_attachment_thumbnail(att.id)
        if thumb:
            thumb_path = thumb.file_path
        if (
            not thumb_path
            and fallback_to_source
            and _is_probably_image(att.mime_type, att.file_path, att.file_name)
        ):
            thumb_path = att.file_path
        return {
            "id": att.id,
            "uuid": att.uuid,
            "file_path": att.file_path,
            "file_name": att.file_name or (Path(att.file_path).name if att.file_path else ""),
            "mime_type": att.mime_type,
            "description": att.description,
            "uploaded_at": att.uploaded_at.isoformat() if att.uploaded_at else None,
            "uploaded_by": att.uploaded_by,
            "thumbnail_path": thumb_path,
            "is_image": _is_probably_image(att.mime_type, att.file_path, att.file_name),
            "is_video": _is_probably_video(att.mime_type, att.file_path, att.file_name),
        }

    attachments_unassigned_all = [
        _attachment_view(att)
        for att in ticket.attachments
        if att.checklist_status_id is None
    ]
    attachment_thumb_by_path = {
        att["file_path"]: att["thumbnail_path"]
        for att in attachments_unassigned_all
        if att.get("file_path") and att.get("thumbnail_path")
    }
    image_paths = {img.file_path for img in ticket.images if img.file_path}
    attachments_unassigned = [
        att for att in attachments_unassigned_all if att.get("file_path") not in image_paths
    ]
    media_images = []
    for img in ticket.images:
        thumb_path = attachment_thumb_by_path.get(img.file_path)
        if not thumb_path and generate_thumbs and img.file_path:
            generated_thumb = _ensure_thumbnail_for_path(img.file_path)
            if generated_thumb:
                thumb_path = generated_thumb
        if not thumb_path and fallback_to_source and img.file_path:
            thumb_path = img.file_path
        media_images.append(
            {
                "file_path": img.file_path,
                "caption": img.caption,
                "thumbnail_path": thumb_path,
            }
        )
    media = {
        "images": media_images,
        "checklist_statuses": [
            {
                "id": cs.id,
                "status": cs.status,
                "attachments": [_attachment_view(att) for att in getattr(cs, "attachments", [])],
                "checklist_item": {
                    "text_en": cs.text_en or (cs.checklist_item.text_en if cs.checklist_item else ""),
                    "text_cn": cs.text_cn or (cs.checklist_item.text_cn if cs.checklist_item else ""),
                },
            }
            for cs in ticket.checklist_statuses
        ],
        "attachments_unassigned": attachments_unassigned,
    }
    return media, created_thumbs


@app.route("/ticket/<uuid>", methods=["GET", "POST"])
def ticket_detail(uuid: str):
    action = request.form.get("action") if request.method == "POST" else request.args.get("action")
    session = get_session()
    try:
        ticket = (
            session.query(Ticket)
            .options(
                selectinload(Ticket.template),
                selectinload(Ticket.project),
                selectinload(Ticket.images),
                selectinload(Ticket.checklist_statuses).selectinload(TicketChecklistStatus.checklist_item),
                selectinload(Ticket.checklist_statuses)
                .selectinload(TicketChecklistStatus.attachments)
                .selectinload(Attachment.thumbnails),
                selectinload(Ticket.attachments).selectinload(Attachment.thumbnails),
            )
            .filter(Ticket.uuid == uuid)
            .one_or_none()
        )
        if ticket is None:
            abort(404)

        if request.method == "POST":
            if action == "update_ticket":
                new_name = request.form.get("ticket_name", "").strip()
                new_status = request.form.get("ticket_status", ticket.status).strip() or ticket.status
                if new_name:
                    ticket.name = new_name
                ticket.status = new_status
                session.commit()
                _refresh_ticket_cache(ticket)
                _push_ticket_to_server(ticket)
                return redirect(url_for("ticket_detail", uuid=uuid, message="Ticket updated"))
            if action == "update_checklist":
                ids = request.form.getlist("cs_id[]")
                statuses = request.form.getlist("cs_status[]")
                allowed = {"pending", "in_progress", "complete", "not_started"}
                template_items_by_text = {}
                if ticket.template_id:
                    template_items = (
                        session.query(ChecklistItem)
                        .filter(ChecklistItem.template_id == ticket.template_id)
                        .order_by(ChecklistItem.order_index.asc(), ChecklistItem.id.asc())
                        .all()
                    )
                    for item in template_items:
                        key = ((item.text_en or "").strip(), (item.text_cn or "").strip())
                        if key != ("", "") and key not in template_items_by_text:
                            template_items_by_text[key] = item
                for cs_id, status in zip(ids, statuses):
                    if status not in allowed:
                        continue
                    try:
                        cid_int = int(cs_id)
                    except (TypeError, ValueError):
                        continue
                    cs_obj = session.get(TicketChecklistStatus, cid_int)
                    if cs_obj and cs_obj.ticket_id == ticket.id:
                        if status != cs_obj.status:
                            cs_obj.status = status
                            cs_obj.checked_at = datetime.now(timezone.utc)
                            if ticket.name:
                                cs_obj.checked_by = ticket.name
                        if not cs_obj.ticket_uuid:
                            cs_obj.ticket_uuid = ticket.uuid
                        if cs_obj.checklist_item_id is None:
                            key = ((cs_obj.text_en or "").strip(), (cs_obj.text_cn or "").strip())
                            match = template_items_by_text.get(key)
                            if match:
                                cs_obj.checklist_item_id = match.id
                                if not cs_obj.text_en:
                                    cs_obj.text_en = match.text_en or ""
                                if not cs_obj.text_cn:
                                    cs_obj.text_cn = match.text_cn or ""
                session.commit()
                _refresh_ticket_cache(ticket)
                _push_ticket_to_server(ticket)
                return redirect(url_for("ticket_detail", uuid=uuid, message="Checklist updated"))

        # Snapshot ticket data to avoid lazy-loading after session close
        media, created_thumbs = _build_ticket_media(
            session,
            ticket,
            generate_thumbs=True,
            fallback_to_source=False,
        )
        ticket_data = {
            "id": ticket.id,
            "uuid": ticket.uuid,
            "dth_number": ticket.dth_number,
            "name": ticket.name,
            "status": ticket.status,
            "created_at": ticket.created_at,
            "notes_en": ticket.notes_en,
            "notes_cn": ticket.notes_cn,
            "project": {"project_code": ticket.project.project_code, "id": ticket.project.id} if ticket.project else None,
            "template": {
                "template_id": ticket.template.template_id,
                "template_code": ticket.template.template_code,
                "job_type_en": ticket.template.job_type_en,
                "job_type_cn": ticket.template.job_type_cn,
            }
            if ticket.template
            else None,
        }
        ticket_data.update(media)
        if created_thumbs:
            session.commit()
        design_id = ticket.template.design_id if ticket.template else "work_ticket_v1"
        if action == "print":
            slots = _slots_from_ticket(ticket)
            try:
                _enqueue_pending_ticket(uuid)
            except Exception:
                pass
            try:
                _push_ticket_to_server(ticket)
            except Exception:
                pass
            img = _render_design_image(design_id, slots)
            print_error = _print_ticket_image(img)
            if print_error:
                return redirect(url_for("ticket_detail", uuid=uuid, message=print_error))
            if design_id == "work_ticket_v1":
                try:
                    ensure_tracking_ticket(session, ticket, qr_payload=_build_ticket_qr_url(ticket))
                    session.commit()
                except Exception:
                    session.rollback()
                tracking_img = _render_design_image("ticket_tracking_v1", slots)
                tracking_error = _print_ticket_image(tracking_img)
                if tracking_error:
                    return redirect(
                        url_for(
                            "ticket_detail",
                            uuid=uuid,
                            message=f"Tracking ticket print error: {tracking_error}",
                        )
                    )
                return redirect(
                    url_for(
                        "ticket_detail",
                        uuid=uuid,
                        message="Ticket (and tracking ticket) sent to printer.",
                    )
                )
            return redirect(url_for("ticket_detail", uuid=uuid, message="Ticket sent to printer"))
        if action == "preview":
            slots = _slots_from_ticket(ticket)
            img = _render_design_image(design_id, slots)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            buf.seek(0)
            return send_file(buf, mimetype="image/png")
    finally:
        session.close()

    ticket_page = dict(ticket_data)
    ticket_page["detail_url"] = url_for("ticket_detail", uuid=uuid)
    template_id = ""
    project_id = ""
    if ticket_data.get("template"):
        template_id = ticket_data["template"].get("template_id") or ""
    if ticket_data.get("project"):
        project_id = ticket_data["project"].get("id") or ""
    ticket_page["edit_url"] = url_for("ticket_fill", template_id=template_id, project_id=project_id)
    if ticket_data.get("project") and ticket_data["project"].get("project_code"):
        ticket_page["back_url"] = url_for("projects", project_code=ticket_data["project"]["project_code"])
    else:
        ticket_page["back_url"] = url_for("projects")

    return render_template(
        "ticket_detail.html",
        ticket=ticket_data,
        message=request.args.get("message"),
        page_data=_build_page_data(
            "ticket_detail",
            ticket=ticket_page,
            message=request.args.get("message"),
            urls={
                "image_thumb": url_for("image_thumb"),
                "attachment_file_template": url_for("attachment_file", attachment_ref="ATTACHMENT_REF"),
            },
        ),
    )


@app.route("/translate", methods=["POST"])
def translate_text():
    try:
        payload = request.get_json(silent=True) or {}
        texts = payload.get("texts")
        if not texts or not isinstance(texts, list):
            return {"error": "Invalid payload"}, 400
        client = _get_openai_client()
        if client is None:
            return {"error": "OPENAI_API_KEY is not set on the server."}, 400
        print(f"[translate] request count={len(texts)}")  # lightweight trace
        translations = []
        for text in texts:
            if not text:
                translations.append("")
                continue
            resp = client.chat.completions.create(
                model=os.getenv("OPENAI_TRANSLATE_MODEL", "gpt-4o-mini"),
                messages=[
                    {
                        "role": "system",
                        "content": "Translate the user's text to Simplified Chinese. Return only the translation text.",
                    },
                    {"role": "user", "content": text},
                ],
                temperature=0.2,
                max_tokens=200,
            )
            translations.append(resp.choices[0].message.content.strip())
        return {"translations": translations}
    except Exception as exc:
        return {"error": str(exc)}, 500


@app.route("/ticket/<uuid>/delete", methods=["POST"])
def ticket_delete(uuid: str):
    session = get_session()
    try:
        ticket = session.query(Ticket).filter(Ticket.uuid == uuid).one_or_none()
        if ticket is None:
            return redirect(url_for("projects", message="Ticket not found"))
        project_code = ticket.project.project_code if ticket.project else None
        session.delete(ticket)
        session.commit()
        if project_code:
            return redirect(url_for("project_detail", project_code=project_code, message="Ticket deleted"))
        return redirect(url_for("projects", message="Ticket deleted"))
    finally:
        session.close()


# -----------------------------
# Template fill & previFFdew
# -----------------------------
def _render_ticket_image(slots):
    render_fn = getattr(work_ticket_design, "render_ticket", None)
    if render_fn is None:
        raise RuntimeError(
            "render_ticket is not available in the design module. Please add it to ticket_engine/designs/work_ticket_v1.py."
        )
    return render_fn(slots)


def _slugify(value: str) -> str:
    """Create a simple lowercase slug for template IDs."""
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    if not value:
        value = "template"
    return value


def _print_ticket_image(img):
    """
    Send a PIL image to the ESC/POS printer.

    Returns None on success, or an error message string on failure.
    """
    if BRIDGE_ONLY_PRINT:
        return None
    try:
        from escpos.printer import File  # type: ignore
    except Exception as exc:  # pragma: no cover - best effort import
        return f"ESC/POS printer module not available: {exc}"

    device_path = os.getenv("PRINTER_DEVICE", "/dev/usb/lp0")
    try:
        printer = File(device_path)
    except Exception as exc:
        return f"Could not open printer device {device_path}: {exc}"

    try:
        printer.image(img)
        printer.cut()
    except Exception as exc:
        return f"Failed to print: {exc}"
    finally:
        try:
            printer.close()
        except Exception:
            pass
    return None


def _render_design_image(design_id: str, slots: dict):
    if design_id == "ticket_tracking_v1":
        return ticket_tracking_v1.render_ticket(slots)
    return _render_ticket_image(slots)


def _build_ticket_qr_url(ticket: Ticket) -> str:
    """
    Build the QR payload for a ticket.
    Default: just the ticket UUID (no protocol/host). Optional override via QR_PATH.
    """
    ticket_uuid = ticket.uuid
    ticket_id = getattr(ticket, "id", None)
    qr_uuid = getattr(ticket, "qr_source_ticket_uuid", None)
    qr_id = getattr(ticket, "qr_source_ticket_id", None)
    if qr_uuid:
        ticket_uuid = qr_uuid
    if qr_id is not None:
        ticket_id = qr_id
    path_template = os.getenv("QR_PATH")
    if not path_template:
        return ticket_uuid
    try:
        return path_template.format(id=ticket_id, uuid=ticket_uuid, ticket=ticket_uuid)
    except Exception:
        return path_template


def _ensure_tracking_template(session, base_template: Template) -> Template:
    tracking_template_id = f"tracking-{base_template.template_id}"
    existing = (
        session.query(Template)
        .filter(Template.template_id == tracking_template_id, Template.design_id == "ticket_tracking_v1")
        .one_or_none()
    )
    if existing:
        return existing
    now = datetime.now(timezone.utc)
    tracking_tpl = Template(
        template_id=tracking_template_id,
        name=f"{base_template.name} Tracking",
        design_id="ticket_tracking_v1",
        template_code=f"{base_template.template_code}-T",
        job_type_en=base_template.job_type_en,
        job_type_cn=base_template.job_type_cn,
        created_at=now,
        updated_at=now,
        is_active=True,
    )
    session.add(tracking_tpl)
    session.flush()
    return tracking_tpl


def _get_openai_client() -> OpenAI | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        return OpenAI(api_key=api_key)
    except TypeError as exc:
        # Happens when openai pins an httpx version that differs from ours; disable translation gracefully.
        app.logger.warning("OpenAI client init failed (likely httpx mismatch): %s", exc)
    except Exception:
        # Catch-all so UI keeps working even if OpenAI fails to initialize.
        app.logger.exception("OpenAI client init failed unexpectedly.")
    return None


@app.route("/image_thumb")
def image_thumb():
    """
    Serve image files (used for thumbnails) but only from the data directory for safety.
    """
    path = request.args.get("path", "")
    if not path:
        abort(404)
    try:
        resolved = Path(path).resolve()
    except Exception:
        abort(404)
    data_root = Path("data").resolve()
    try:
        resolved.relative_to(data_root)
    except Exception:
        abort(404)
    if not resolved.exists() or not resolved.is_file():
        abort(404)
    return send_file(resolved, conditional=True)


@app.route("/attachments/<attachment_ref>/file")
def attachment_file(attachment_ref: str):
    """
    Serve original attachment files with proper MIME types and range support.
    """
    session = get_session()
    try:
        attachment = None
        if str(attachment_ref).isdigit():
            attachment = session.get(Attachment, int(attachment_ref))
        if attachment is None:
            attachment = (
                session.query(Attachment)
                .filter(Attachment.uuid == str(attachment_ref))
                .one_or_none()
            )
        if attachment is None:
            abort(404)
        file_path = attachment.file_path
        file_name = attachment.file_name
        mime_type = attachment.mime_type
    finally:
        session.close()

    if not file_path:
        abort(404)
    try:
        resolved = Path(file_path).resolve()
    except Exception:
        abort(404)
    data_root = Path("data").resolve()
    try:
        resolved.relative_to(data_root)
    except Exception:
        abort(404)
    if not resolved.exists() or not resolved.is_file():
        abort(404)

    mime = (mime_type or "").strip()
    if not mime or mime == "application/octet-stream":
        guessed = mimetypes.guess_type(file_name or str(resolved))[0]
        if guessed:
            mime = guessed
    if not mime:
        mime = "application/octet-stream"
    response = send_file(resolved, mimetype=mime, conditional=True)
    response.headers.setdefault("Accept-Ranges", "bytes")
    return response


@app.route("/designs")
def designs_gallery():
    """
    Lightweight page to show available ticket designs.
    """
    designs = [
        {
            "id": "work_ticket_v1",
            "name": "Work Ticket v1",
            "description": "Default receipt design used by work tickets.",
            "preview_url": url_for("preview_design", design_id="work_ticket_v1"),
        },
        {
            "id": "ticket_tracking_v1",
            "name": "Ticket Tracking v1",
            "description": "Tracking ticket header/crop to top section for quick status capture.",
            "preview_url": url_for("preview_design", design_id="ticket_tracking_v1"),
        },
    ]
    return render_template(
        "designs.html",
        designs=designs,
        page_data=_build_page_data("designs", designs=designs),
    )


@app.route("/templates")
def templates_home():
    """Landing page to choose between creating or editing templates."""
    return render_template(
        "templates_home.html",
        page_data=_build_page_data(
            "templates_home",
            urls={
                "template_new": url_for("template_new"),
                "template_edit": url_for("template_edit"),
            },
        ),
    )


@app.route("/ticket_fill", methods=["GET", "POST"])
def ticket_fill():
    session = get_session()
    try:
        templates = (
            session.query(Template)
            .filter(Template.design_id == "work_ticket_v1", Template.is_active.is_(True))
            .order_by(Template.updated_at.desc().nullslast(), Template.id.asc())
            .all()
        )
        projects = (
            session.query(Project)
            .filter(Project.status != "archived")
            .order_by(Project.updated_at.desc().nullslast(), Project.id.desc())
            .all()
        )
    finally:
        session.close()

    translation_enabled = _get_openai_client() is not None
    errors = []
    message = request.args.get("message")
    template_rows: list[dict] = []
    form_data = {
        "template_id": request.args.get("template_id", "").strip(),
        "project_id": request.args.get("project_id", "").strip(),
        "dth_number": "",
        "name": "",
        "notes_en": "",
        "notes_cn": "",
        "image_paths": "",
        "checklist_rows": [],
    }

    selected_template = None
    selected_project = None
    last_ticket = None

    if form_data["template_id"]:
        session = get_session()
        try:
            selected_template = (
                session.query(Template)
                .filter(Template.template_id == form_data["template_id"], Template.is_active.is_(True))
                .one_or_none()
            )
            if selected_template:
                _ = selected_template.checklist_items  # load relationships
            if form_data["project_id"]:
                try:
                    project_id_int = int(form_data["project_id"])
                except ValueError:
                    project_id_int = None
                if project_id_int:
                    selected_project = session.get(Project, project_id_int)
            if selected_template:
                template_rows = [{"en": item.text_en, "cn": item.text_cn} for item in selected_template.checklist_items]
            if selected_template and selected_project:
                last_ticket = (
                    session.query(Ticket)
                    .filter(
                        Ticket.template_id == selected_template.id,
                        Ticket.project_id == selected_project.id,
                    )
                    .order_by(Ticket.created_at.desc().nullslast(), Ticket.id.desc())
                    .first()
                )
                if last_ticket:
                    rows_from_ticket = [
                        {
                            "en": cs.text_en or (cs.checklist_item.text_en if cs.checklist_item else ""),
                            "cn": cs.text_cn or (cs.checklist_item.text_cn if cs.checklist_item else ""),
                        }
                        for cs in last_ticket.checklist_statuses
                    ]
                    form_data["checklist_rows"] = rows_from_ticket or template_rows
                    form_data.update(
                        {
                            "dth_number": last_ticket.dth_number or selected_project.project_code,
                            "name": last_ticket.name or "",
                            "notes_en": last_ticket.notes_en or "",
                            "notes_cn": last_ticket.notes_cn or "",
                            "image_paths": ", ".join(img.file_path for img in last_ticket.images),
                            "project_id": str(selected_project.id),
                        }
                    )
                elif selected_project:
                    form_data["dth_number"] = selected_project.project_code
                    form_data["checklist_rows"] = template_rows
            elif selected_template:
                form_data["checklist_rows"] = template_rows
        finally:
            session.close()
        if selected_template is None:
            errors.append("Selected template not found.")

    # Final fallback to ensure initial load always shows template defaults
    if selected_template and template_rows and not form_data["checklist_rows"]:
        form_data["checklist_rows"] = template_rows
    if selected_template:
        if not form_data["notes_en"]:
            form_data["notes_en"] = (
                (selected_template.default_notes_en or "").strip()
                or selected_template.job_type_en
                or ""
            )
        if not form_data["notes_cn"]:
            form_data["notes_cn"] = (
                (selected_template.default_notes_cn or "").strip()
                or selected_template.job_type_cn
                or ""
            )
    if selected_project and not form_data["dth_number"]:
        form_data["dth_number"] = selected_project.project_code

    if request.method == "POST":
        form_data = {
            "template_id": request.form.get("template_id", "").strip(),
            "project_id": request.form.get("project_id", "").strip(),
            "dth_number": request.form.get("dth_number", "").strip(),
            "name": request.form.get("name", "").strip(),
            "notes_en": request.form.get("notes_en", "").strip(),
            "notes_cn": request.form.get("notes_cn", "").strip(),
            "image_paths": request.form.get("image_paths", "").strip(),
            "checklist_rows": [],
        }
        action = request.form.get("action", "preview")
        check_en = request.form.getlist("check_en[]")
        check_cn = request.form.getlist("check_cn[]")
        for en, cn in zip(check_en, check_cn):
            en = en.strip()
            cn = cn.strip()
            if not en and not cn:
                continue
            form_data["checklist_rows"].append({"en": en, "cn": cn})

        if not form_data["template_id"]:
            errors.append("Please choose a template.")
        else:
            session = get_session()
            try:
                selected_template = (
                    session.query(Template)
                    .filter(Template.template_id == form_data["template_id"], Template.is_active.is_(True))
                    .one_or_none()
                )
                if form_data["project_id"]:
                    try:
                        pid = int(form_data["project_id"])
                    except ValueError:
                        pid = None
                    if pid:
                        selected_project = session.get(Project, pid)
            finally:
                session.close()
            if not selected_template:
                errors.append("Selected template not found.")
            if form_data["project_id"] and not selected_project:
                errors.append("Selected project not found.")
        if not form_data["checklist_rows"]:
            errors.append("At least one checklist item is required.")

        if not errors and selected_template:
            image_paths = [
                val.strip()
                for val in form_data["image_paths"].split(",")
                if val.strip()
            ]
            uploaded_files = request.files.getlist("image_files")
            if uploaded_files:
                _ensure_upload_dir(IMAGE_UPLOAD_DIR)
            for f in uploaded_files:
                if f and f.filename:
                    filename = secure_filename(f.filename)
                    save_name = f"{uuid.uuid4().hex}_{filename}"
                    save_path = IMAGE_UPLOAD_DIR / save_name
                    f.save(save_path)
                    image_paths.append(str(save_path))

            session = get_session()
            try:
                # reload with session to attach objects
                template_db = (
                    session.query(Template)
                    .filter(Template.id == selected_template.id)
                    .one()
                )
                ensure_designs(session)
                ensure_template_metadata(session, template_db)
                if selected_project:
                    ensure_project_templates(session, selected_project, [template_db])
                now = datetime.now(timezone.utc)
                import uuid as _uuid

                # reuse last ticket for this project+template if exists
                existing_ticket = None
                if selected_project:
                    existing_ticket = (
                        session.query(Ticket)
                        .filter(
                            Ticket.template_id == template_db.id,
                            Ticket.project_id == selected_project.id,
                        )
                        .order_by(Ticket.created_at.desc(), Ticket.id.desc())
                        .first()
                    )
                if existing_ticket:
                    ticket = existing_ticket
                    ticket.name = form_data["name"]
                    ticket.notes_en = form_data["notes_en"]
                    ticket.notes_cn = form_data["notes_cn"]
                    ticket.dth_number = form_data["dth_number"]
                    ticket.printed_at = now
                    ticket.status = "open"
                else:
                    ticket = Ticket(
                        uuid=str(_uuid.uuid4()),
                        template_id=template_db.id,
                        project_id=selected_project.id if selected_project else None,
                        dth_number=form_data["dth_number"],
                        name=form_data["name"],
                        notes_en=form_data["notes_en"],
                        notes_cn=form_data["notes_cn"],
                        created_at=now,
                        printed_at=now,
                        status="open",
                    )
                    session.add(ticket)
                    session.flush()

                template_items = list(template_db.checklist_items)
                items_by_text = {}
                for item in template_items:
                    key = ((item.text_en or "").strip(), (item.text_cn or "").strip())
                    if key != ("", "") and key not in items_by_text:
                        items_by_text[key] = item

                # Preserve checklist status when reusing an existing ticket.
                existing_statuses: list[TicketChecklistStatus] = []
                remaining_statuses: list[TicketChecklistStatus] = []
                if existing_ticket:
                    existing_statuses = (
                        session.query(TicketChecklistStatus)
                        .filter(TicketChecklistStatus.ticket_id == ticket.id)
                        .all()
                    )
                    remaining_statuses = list(existing_statuses)

                def _pop_matching_status(match_item_id, text_key):
                    for idx, cs_row in enumerate(remaining_statuses):
                        if match_item_id is not None and cs_row.checklist_item_id == match_item_id:
                            return remaining_statuses.pop(idx)
                    for idx, cs_row in enumerate(remaining_statuses):
                        row_key = ((cs_row.text_en or "").strip(), (cs_row.text_cn or "").strip())
                        if row_key == text_key:
                            return remaining_statuses.pop(idx)
                    if remaining_statuses:
                        return remaining_statuses.pop(0)
                    return None

                # add checklist rows from form
                for idx, row in enumerate(form_data["checklist_rows"], start=1):
                    text_en = (row.get("en") or "").strip()
                    text_cn = (row.get("cn") or "").strip()
                    match = items_by_text.get((text_en, text_cn))
                    if match is None and idx <= len(template_items):
                        match = template_items[idx - 1]
                    match_id = match.id if match else None
                    cs_obj = _pop_matching_status(match_id, (text_en, text_cn)) if existing_ticket else None
                    if cs_obj is None:
                        session.add(
                            TicketChecklistStatus(
                                ticket_id=ticket.id,
                                ticket_uuid=ticket.uuid,
                                checklist_item_id=match_id,
                                status="not_started",
                                text_en=text_en,
                                text_cn=text_cn,
                            )
                        )
                    else:
                        cs_obj.text_en = text_en
                        cs_obj.text_cn = text_cn
                        if match_id is not None:
                            cs_obj.checklist_item_id = match_id
                        if not cs_obj.ticket_uuid:
                            cs_obj.ticket_uuid = ticket.uuid

                for cs_row in remaining_statuses:
                    session.delete(cs_row)

                if existing_ticket:
                    session.query(TicketImage).filter(TicketImage.ticket_id == ticket.id).delete()
                    session.query(Attachment).filter(
                        Attachment.ticket_id == ticket.id,
                        Attachment.checklist_status_id.is_(None),
                    ).delete()
                attachment_ids: list[int] = []
                for idx, path in enumerate(image_paths):
                    session.add(
                        TicketImage(
                            ticket_id=ticket.id,
                            file_path=path,
                            order_index=idx,
                        )
                    )
                    attachment_row = Attachment(
                        ticket_id=ticket.id,
                        template_id=template_db.id,
                        file_path=path,
                        file_name=Path(path).name,
                    )
                    session.add(attachment_row)
                    session.flush()
                    if attachment_row.id is not None:
                        attachment_ids.append(attachment_row.id)

                session.commit()
                for attachment_id in attachment_ids:
                    _enqueue_attachment_thumbnail(attachment_id)
                session.refresh(ticket)
                images_db = session.query(TicketImage).filter(TicketImage.ticket_id == ticket.id).order_by(TicketImage.order_index.asc()).all()
                checklist_items = list(
                    session.query(TicketChecklistStatus)
                    .filter(TicketChecklistStatus.ticket_id == ticket.id)
                    .all()
                )
                tracking_meta = None
                if template_db.design_id == "work_ticket_v1":
                    try:
                        ensure_tracking_ticket(session, ticket, qr_payload=_build_ticket_qr_url(ticket))
                        session.commit()
                    except Exception:
                        session.rollback()
                    tracking_meta = _slots_from_ticket(ticket)
                _refresh_ticket_cache(ticket)
                _push_ticket_to_server(ticket)
            except Exception as exc:
                session.rollback()
                errors.append(f"Failed to create ticket: {exc}")
                ticket = None
                images_db = []
                checklist_items = []
                tracking_meta = None
            finally:
                session.close()

            if not errors and ticket:
                if action == "save":
                    redirect_params = {"template_id": form_data["template_id"], "message": "Ticket saved."}
                    if form_data.get("project_id"):
                        redirect_params["project_id"] = form_data["project_id"]
                    return redirect(url_for("ticket_fill", **redirect_params))

                slots = {
                    "template_code": template_db.template_code,
                    "job_type_en": template_db.job_type_en,
                    "job_type_cn": template_db.job_type_cn,
                    "checklist_items": [{"en": item.text_en, "cn": item.text_cn} for item in checklist_items],
                    "dth_number": ticket.dth_number,
                    "name": ticket.name,
                    "notes_en": ticket.notes_en or "",
                    "notes_cn": ticket.notes_cn or "",
                    "image_paths": [img.file_path for img in images_db],
                    "qr_data": _build_ticket_qr_url(ticket),
                }

                try:
                    img = _render_ticket_image(slots)
                except Exception as exc:
                    errors.append(str(exc))
                    img = None

                if not errors and img is not None:
                    if action == "print":
                        try:
                            _enqueue_pending_ticket(ticket.uuid)
                        except Exception:
                            pass
                        try:
                            _push_ticket_to_server(ticket)
                        except Exception:
                            pass
                        print_error = _print_ticket_image(img)
                        if print_error:
                            errors.append(print_error)
                        if not errors:
                            if tracking_meta:
                                try:
                                    tracking_img = _render_design_image("ticket_tracking_v1", tracking_meta)
                                    t_err = _print_ticket_image(tracking_img)
                                    if t_err:
                                        errors.append(f"Tracking ticket print error: {t_err}")
                                except Exception as exc:
                                    errors.append(str(exc))
                            if not errors:
                                redirect_params = {
                                    "template_id": form_data["template_id"],
                                    "message": "Ticket sent to printer.",
                                }
                                if form_data.get("project_id"):
                                    redirect_params["project_id"] = form_data["project_id"]
                                return redirect(url_for("ticket_fill", **redirect_params))
                    else:  # preview
                        buf = io.BytesIO()
                        img.save(buf, format="PNG")
                        buf.seek(0)
                        return send_file(buf, mimetype="image/png")
                try:
                    _enqueue_pending_ticket(ticket.uuid)
                except Exception:
                    pass

    template_options = [
        {"template_id": tpl.template_id, "name": tpl.name or ""}
        for tpl in templates
    ]
    project_options = [{"id": proj.id, "project_code": proj.project_code} for proj in projects]
    selected_tpl_data = None
    if selected_template:
        selected_tpl_data = {
            "name": selected_template.name or "",
            "template_code": selected_template.template_code or "",
            "template_id": selected_template.template_id or "",
            "job_type_en": selected_template.job_type_en or "",
            "job_type_cn": selected_template.job_type_cn or "",
        }

    return render_template(
        "ticket_fill.html",
        templates=templates,
        projects=projects,
        selected_template=selected_template,
        form_data=form_data,
        errors=errors,
        message=message,
        translation_enabled=translation_enabled,
        page_data=_build_page_data(
            "ticket_fill",
            templates=template_options,
            projects=project_options,
            selected_template=selected_tpl_data,
            form_data=form_data,
            errors=errors,
            message=message,
            translation_enabled=translation_enabled,
            urls={
                "ticket_fill": url_for("ticket_fill"),
                "translate_text": url_for("translate_text"),
                "image_thumb": url_for("image_thumb"),
            },
        ),
    )


@app.route("/template_new", methods=["GET", "POST"])
def template_new():
    translation_enabled = _get_openai_client() is not None
    errors = []
    form_data = {
        "name": "",
        "template_id": "",
        "template_code": "",
        "job_type_en": "",
        "job_type_cn": "",
        "default_notes_en": "",
        "default_notes_cn": "",
        "checklist_items": "",
    }

    if request.method == "POST":
        check_en = request.form.getlist("check_en[]")
        check_cn = request.form.getlist("check_cn[]")
        form_data = {
            "name": request.form.get("name", "").strip(),
            "template_code": request.form.get("template_code", "").strip(),
            "job_type_en": request.form.get("job_type_en", "").strip(),
            "job_type_cn": request.form.get("job_type_cn", "").strip(),
            "default_notes_en": request.form.get("default_notes_en", "").strip(),
            "default_notes_cn": request.form.get("default_notes_cn", "").strip(),
            "template_id": request.form.get("template_id", "").strip(),
            "checklist_items": "",
        }

        required_fields = {
            "name": "Template Name is required.",
            "template_code": "Template Code is required.",
            "job_type_en": "Job Type (English) is required.",
            "job_type_cn": "Job Type (Chinese) is required.",
        }
        for key, msg in required_fields.items():
            if not form_data[key]:
                errors.append(msg)

        template_id = _slugify(form_data["name"] or form_data["template_code"])

        checklist_items = []
        pairs = zip(check_en, check_cn)
        for en, cn in pairs:
            en = en.strip()
            cn = cn.strip()
            if not en and not cn:
                continue
            checklist_items.append({"en": en, "cn": cn})

        if not checklist_items:
            errors.append("At least one checklist item is required.")

        if not errors:
            session = get_session()
            try:
                now = datetime.now(timezone.utc)
                ensure_designs(session)
                template = Template(
                    template_id=template_id,
                    name=form_data["name"],
                    design_id="work_ticket_v1",
                    template_code=form_data["template_code"],
                    job_type_en=form_data["job_type_en"],
                    job_type_cn=form_data["job_type_cn"],
                    default_notes_en=form_data["default_notes_en"] or None,
                    default_notes_cn=form_data["default_notes_cn"] or None,
                    created_at=now,
                    updated_at=now,
                    is_active=True,
                )
                session.add(template)
                session.flush()

                for idx, item in enumerate(checklist_items, start=1):
                    session.add(
                        ChecklistItem(
                            template_id=template.id,
                            order_index=idx,
                            text_en=item["en"],
                            text_cn=item["cn"],
                            required=True,
                        )
                    )

                session.flush()
                ensure_template_metadata(session, template)
                session.commit()
            except Exception:
                session.rollback()
                errors.append("Failed to save template.")
            finally:
                session.close()

            if not errors:
                return redirect(url_for("template_edit", message="Template created"))

    return render_template(
        "template_new.html",
        errors=errors,
        form_data=form_data,
        translation_enabled=translation_enabled,
        page_data=_build_page_data(
            "template_new",
            errors=errors,
            form_data=form_data,
            translation_enabled=translation_enabled,
            urls={"translate_text": url_for("translate_text")},
        ),
    )


@app.route("/template_edit")
def template_edit():
    translation_enabled = _get_openai_client() is not None
    session = get_session()
    try:
        templates = (
            session.query(Template)
            .options(selectinload(Template.tickets))
            .filter(Template.design_id == "work_ticket_v1", Template.is_active.is_(True))
            .order_by(Template.updated_at.desc().nullslast(), Template.id.asc())
            .all()
        )
        archived_templates = (
            session.query(Template)
            .options(selectinload(Template.tickets))
            .filter(Template.design_id == "work_ticket_v1", Template.is_active.is_(False))
            .order_by(Template.updated_at.desc().nullslast(), Template.id.asc())
            .all()
        )
    finally:
        session.close()
    message = request.args.get("message")
    templates_data = []
    for tpl in templates:
        tid = tpl.template_id
        templates_data.append(
            {
                "template_id": tid,
                "name": tpl.name or "",
                "template_code": tpl.template_code or "",
                "updated_at": str(tpl.updated_at) if tpl.updated_at else "",
                "has_tickets": bool(getattr(tpl, "tickets", None)),
                "edit_url": url_for("template_edit_detail", template_id=tid),
                "delete_url": url_for("template_delete", template_id=tid),
                "archive_url": url_for("template_archive", template_id=tid),
            }
        )
    archived_templates_data = [
        {
            "template_id": tpl.template_id,
            "name": tpl.name or "",
            "template_code": tpl.template_code or "",
            "updated_at": str(tpl.updated_at) if tpl.updated_at else "",
        }
        for tpl in archived_templates
    ]
    return render_template(
        "template_edit.html",
        templates=templates,
        archived_templates=archived_templates,
        message=message,
        edit_template=None,
        form_data=None,
        errors=[],
        translation_enabled=translation_enabled,
        page_data=_build_page_data(
            "template_edit",
            edit_mode=False,
            templates=templates_data,
            archived_templates=archived_templates_data,
            message=message,
            errors=[],
            translation_enabled=translation_enabled,
            urls={
                "template_new": url_for("template_new"),
                "template_edit": url_for("template_edit"),
                "translate_text": url_for("translate_text"),
            },
        ),
    )


@app.route("/template_delete/<template_id>", methods=["POST"])
def template_delete(template_id: str):
    session = get_session()
    try:
        tpl = (
            session.query(Template)
            .filter(Template.template_id == template_id, Template.is_active.is_(True))
            .one_or_none()
        )
        if tpl is None:
            return redirect(url_for("template_edit", message="Template not found"))
        has_tickets = session.query(Ticket).filter(Ticket.template_id == tpl.id).count() > 0
        if has_tickets:
            return redirect(url_for("template_edit", message="Cannot delete template with tickets"))
        tpl.is_active = False
        session.commit()
        return redirect(url_for("template_edit", message="Template deleted"))
    finally:
        session.close()


@app.route("/template_archive/<template_id>", methods=["POST"])
def template_archive(template_id: str):
    session = get_session()
    try:
        tpl = (
            session.query(Template)
            .filter(Template.template_id == template_id, Template.is_active.is_(True))
            .one_or_none()
        )
        if tpl is None:
            return redirect(url_for("template_edit", message="Template not found"))
        tpl.is_active = False
        session.commit()
        return redirect(url_for("template_edit", message="Template archived"))
    finally:
        session.close()


@app.route("/template_edit/<template_id>", methods=["GET", "POST"])
def template_edit_detail(template_id: str):
    session = get_session()
    try:
        existing = (
            session.query(Template)
            .filter(Template.template_id == template_id, Template.is_active.is_(True))
            .one_or_none()
        )
        if existing is None:
            abort(404)

        checklist_items_db = (
            session.query(ChecklistItem)
            .filter(ChecklistItem.template_id == existing.id)
            .order_by(ChecklistItem.order_index.asc(), ChecklistItem.id.asc())
            .all()
        )
    finally:
        session.close()

    errors = []
    form_data = {
        "name": existing.name,
        "template_id": existing.template_id,
        "template_code": existing.template_code,
        "job_type_en": existing.job_type_en,
        "job_type_cn": existing.job_type_cn,
        "default_notes_en": existing.default_notes_en or "",
        "default_notes_cn": existing.default_notes_cn or "",
        "checklist_items": "\n".join(
            f"{item.text_en.strip()} | {item.text_cn.strip()}" for item in checklist_items_db
        ),
    }

    if request.method == "POST":
        check_en = request.form.getlist("check_en[]")
        check_cn = request.form.getlist("check_cn[]")
        form_data = {
            "name": request.form.get("name", "").strip(),
            "template_id": request.form.get("template_id", "").strip(),
            "template_code": request.form.get("template_code", "").strip(),
            "job_type_en": request.form.get("job_type_en", "").strip(),
            "job_type_cn": request.form.get("job_type_cn", "").strip(),
            "default_notes_en": request.form.get("default_notes_en", "").strip(),
            "default_notes_cn": request.form.get("default_notes_cn", "").strip(),
            "checklist_items": "",
        }

        if form_data["template_id"] != template_id:
            errors.append("Template ID cannot be changed for existing templates.")

        required_fields = {
            "name": "Template Name is required.",
            "template_code": "Template Code is required.",
            "job_type_en": "Job Type (English) is required.",
            "job_type_cn": "Job Type (Chinese) is required.",
        }
        for key, msg in required_fields.items():
            if not form_data[key]:
                errors.append(msg)

        checklist_items = []
        for en, cn in zip(check_en, check_cn):
            en = en.strip()
            cn = cn.strip()
            if not en and not cn:
                continue
            checklist_items.append({"en": en, "cn": cn})

        if not checklist_items:
            errors.append("At least one checklist item is required.")

        if not errors:
            session = get_session()
            try:
                existing_db = (
                    session.query(Template)
                    .filter(Template.template_id == template_id, Template.is_active.is_(True))
                    .one_or_none()
                )
                if existing_db is None:
                    abort(404)
                existing_db.name = form_data["name"]
                existing_db.template_code = form_data["template_code"]
                existing_db.job_type_en = form_data["job_type_en"]
                existing_db.job_type_cn = form_data["job_type_cn"]
                existing_db.default_notes_en = form_data["default_notes_en"] or None
                existing_db.default_notes_cn = form_data["default_notes_cn"] or None
                existing_db.updated_at = datetime.now(timezone.utc)

                session.query(ChecklistItem).filter(ChecklistItem.template_id == existing_db.id).delete()
                session.flush()
                for idx, item in enumerate(checklist_items, start=1):
                    session.add(
                        ChecklistItem(
                            template_id=existing_db.id,
                            order_index=idx,
                            text_en=item["en"],
                            text_cn=item["cn"],
                            required=True,
                        )
                    )

                session.flush()
                ensure_template_metadata(session, existing_db)
                session.commit()
            except Exception:
                session.rollback()
                errors.append("Failed to update template.")
            finally:
                session.close()

            if not errors:
                return redirect(url_for("template_edit", message="Template updated"))

    translation_enabled = _get_openai_client() is not None
    return render_template(
        "template_edit.html",
        edit_template=existing,
        form_data=form_data,
        errors=errors,
        templates=None,
        message=None,
        translation_enabled=translation_enabled,
        archived_templates=[],
        page_data=_build_page_data(
            "template_edit",
            edit_mode=True,
            form_data=form_data,
            errors=errors,
            message=None,
            translation_enabled=translation_enabled,
            urls={
                "template_edit": url_for("template_edit"),
                "translate_text": url_for("translate_text"),
            },
        ),
    )


# -----------------------------
# Bridge API for external Node server / mobile app
# -----------------------------

@app.route("/api/health")
def api_health():
    now = datetime.now(timezone.utc).isoformat()
    return {
        "ok": True,
        "proxying": False,
        "flask": {"ok": True, "db_path": str(DB_PATH), "timestamp": now},
        "apiKeyProtected": bool(API_KEY),
        "timestamp": now,
        "cacheMode": BRIDGE_CACHE_MODE,
    }


# -----------------------------
# Mock user management
# -----------------------------

def _load_user(session, user_ref: str) -> User | None:
    ref = str(user_ref)
    user = None
    if ref.isdigit():
        user = session.query(User).filter(User.id == int(ref)).one_or_none()
    if user is None:
        user = session.query(User).filter(User.uuid == ref).one_or_none()
    if user is None:
        user = session.query(User).filter(User.username == ref).one_or_none()
    if user is None and "@" in ref:
        user = session.query(User).filter(User.email == ref).one_or_none()
    return user


@app.route("/api/users", methods=["GET"])
def api_users_list():
    session = get_session()
    try:
        query = session.query(User)
        active = _coerce_bool(request.args.get("active"), default=None)
        if active is True:
            query = query.filter(User.is_active.is_(True))
        elif active is False:
            query = query.filter(User.is_active.is_(False))
        q = request.args.get("q")
        if q:
            like = f"%{q.strip()}%"
            query = query.filter(
                (User.username.ilike(like))
                | (User.display_name.ilike(like))
                | (User.email.ilike(like))
            )
        users = query.order_by(User.id.asc()).all()
        return {"users": [_serialize_user(user) for user in users], "count": len(users)}
    finally:
        session.close()


@app.route("/api/users", methods=["POST"])
def api_users_create():
    payload = request.get_json(silent=True) or {}
    username_raw = payload.get("username") or payload.get("user") or payload.get("name")
    username = str(username_raw).strip() if username_raw is not None else ""
    if not username:
        return {"error": "username is required"}, 400
    display_raw = payload.get("displayName") or payload.get("display_name")
    display_name = display_raw.strip() if isinstance(display_raw, str) else display_raw
    if display_name == "":
        display_name = None
    email_raw = payload.get("email")
    email = email_raw.strip() if isinstance(email_raw, str) else email_raw
    if email == "":
        email = None
    role_raw = payload.get("role") or "user"
    role = str(role_raw).strip() if role_raw is not None else ""
    if not role:
        return {"error": "role is required"}, 400
    active_raw = payload.get("isActive") if "isActive" in payload else payload.get("is_active")
    if active_raw is None:
        is_active = True
    else:
        is_active = _coerce_bool(active_raw, default=None)
        if is_active is None:
            return {"error": "invalid isActive"}, 400
    password_raw = payload.get("password")
    password_value = None
    if password_raw is not None:
        password_value = str(password_raw).strip()
        if not password_value:
            return {"error": "password is required"}, 400

    session = get_session()
    try:
        existing = session.query(User).filter(User.username == username).one_or_none()
        if existing:
            return {"error": "username already exists"}, 409
        if email:
            existing = session.query(User).filter(User.email == email).one_or_none()
            if existing:
                return {"error": "email already exists"}, 409
        user = User(
            username=username,
            display_name=display_name,
            email=email,
            role=role,
            is_active=bool(is_active),
        )
        if password_value:
            user.password_hash = generate_password_hash(password_value)
        session.add(user)
        session.commit()
        session.refresh(user)
        return _serialize_user(user), 201
    finally:
        session.close()


@app.route("/api/users/<user_ref>", methods=["GET"])
def api_users_get(user_ref: str):
    session = get_session()
    try:
        user = _load_user(session, user_ref)
        if user is None:
            return {"error": "user not found"}, 404
        return _serialize_user(user)
    finally:
        session.close()


@app.route("/api/users/<user_ref>", methods=["PATCH"])
def api_users_update(user_ref: str):
    payload = request.get_json(silent=True) or {}
    session = get_session()
    try:
        user = _load_user(session, user_ref)
        if user is None:
            return {"error": "user not found"}, 404

        updated = False
        if "password" in payload:
            password_value = str(payload.get("password") or "").strip()
            if not password_value:
                return {"error": "password is required"}, 400
            user.password_hash = generate_password_hash(password_value)
            updated = True

        if "username" in payload or "user" in payload or "name" in payload:
            if "username" in payload:
                username_raw = payload.get("username")
            elif "user" in payload:
                username_raw = payload.get("user")
            else:
                username_raw = payload.get("name")
            username = str(username_raw).strip() if username_raw is not None else ""
            if not username:
                return {"error": "username is required"}, 400
            if username != user.username:
                existing = (
                    session.query(User)
                    .filter(User.username == username, User.id != user.id)
                    .one_or_none()
                )
                if existing:
                    return {"error": "username already exists"}, 409
                user.username = username
                updated = True

        if "displayName" in payload or "display_name" in payload:
            if "displayName" in payload:
                display_raw = payload.get("displayName")
            else:
                display_raw = payload.get("display_name")
            display_name = display_raw.strip() if isinstance(display_raw, str) else display_raw
            if display_name == "":
                display_name = None
            user.display_name = display_name
            updated = True

        if "email" in payload:
            email_raw = payload.get("email")
            email = email_raw.strip() if isinstance(email_raw, str) else email_raw
            if email == "":
                email = None
            if email and email != user.email:
                existing = (
                    session.query(User)
                    .filter(User.email == email, User.id != user.id)
                    .one_or_none()
                )
                if existing:
                    return {"error": "email already exists"}, 409
            user.email = email
            updated = True

        if "role" in payload:
            role_raw = payload.get("role")
            role = str(role_raw).strip() if role_raw is not None else ""
            if not role:
                return {"error": "role is required"}, 400
            user.role = role
            updated = True

        if "isActive" in payload or "is_active" in payload:
            if "isActive" in payload:
                active_raw = payload.get("isActive")
            else:
                active_raw = payload.get("is_active")
            is_active = _coerce_bool(active_raw, default=None)
            if is_active is None:
                return {"error": "invalid isActive"}, 400
            user.is_active = bool(is_active)
            updated = True

        if not updated:
            return {"error": "no fields to update"}, 400
        session.commit()
        session.refresh(user)
        return _serialize_user(user)
    finally:
        session.close()


@app.route("/api/users/<user_ref>", methods=["DELETE"])
def api_users_delete(user_ref: str):
    session = get_session()
    try:
        user = _load_user(session, user_ref)
        if user is None:
            return {"error": "user not found"}, 404
        payload = _serialize_user(user)
        session.delete(user)
        session.commit()
        return {"ok": True, "user": payload}
    finally:
        session.close()


@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    payload = request.get_json(silent=True) or {}
    username_raw = payload.get("username") or payload.get("user") or payload.get("email")
    password = payload.get("password")
    username = str(username_raw).strip() if username_raw is not None else ""
    if not username or not password:
        return {"error": "username and password are required"}, 400

    session = get_session()
    try:
        user = session.query(User).filter(User.username == username).one_or_none()
        if user is None and "@" in username:
            user = session.query(User).filter(User.email == username).one_or_none()
        if user is None:
            return {"error": "invalid credentials"}, 401
        if not user.is_active:
            return {"error": "user inactive"}, 403
        if not user.password_hash:
            return {"error": "password not set"}, 403
        if not check_password_hash(user.password_hash, str(password)):
            return {"error": "invalid credentials"}, 401
        token, session_row = _issue_user_session(session, user)
        return {
            "token": token,
            "user": _serialize_user(user),
            "expiresAt": _iso(session_row.expires_at),
        }
    finally:
        session.close()


@app.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    payload = request.get_json(silent=True) or {}
    token = _extract_user_token() or payload.get("token")
    if not token:
        return {"error": "token is required"}, 400
    token_hash = _hash_session_token(str(token))
    now = datetime.now(timezone.utc)
    session = get_session()
    try:
        session_row = (
            session.query(UserSession)
            .filter(
                UserSession.token_hash == token_hash,
                UserSession.revoked_at.is_(None),
            )
            .one_or_none()
        )
        if session_row is None:
            return {"ok": True, "revoked": 0}
        session_row.revoked_at = now
        session.commit()
        return {"ok": True, "revoked": 1}
    finally:
        session.close()


@app.route("/api/auth/me")
def api_auth_me():
    token = _extract_user_token()
    if not _validate_user_token(token):
        return {"error": "unauthorized"}, 401
    return {"user": g.current_user}

@app.route("/api/pending/requests", methods=["GET"])
def pending_requests():
    requests = list(_PENDING_REQUESTS)
    app.logger.info(
        "[bridge] pending poll count=%s tickets=%s",
        len(requests),
        ",".join(requests),
    )
    return {"requests": requests}


@app.route("/api/pending/requests", methods=["POST"])
def pending_requests_add():
    payload = request.get_json(silent=True) or {}
    refs = payload.get("requests")
    if not isinstance(refs, list):
        refs = []
    added = 0
    for ref in refs:
        if not ref:
            continue
        key = str(ref)
        if key not in _PENDING_REQUESTS:
            added += 1
        _add_pending_request(key)
    app.logger.info(
        "[bridge] pending add count=%s tickets=%s",
        added,
        ",".join(str(r) for r in refs),
    )
    return {"ok": True, "added": added}


@app.route("/api/pending/consume", methods=["POST"])
def pending_requests_consume():
    payload = request.get_json(silent=True) or {}
    refs = payload.get("requests")
    if not isinstance(refs, list):
        refs = []
    removed = 0
    for ref in refs:
        if not ref:
            continue
        key = str(ref)
        if key in _PENDING_REQUESTS:
            _PENDING_REQUESTS.remove(key)
            removed += 1
    app.logger.info(
        "[bridge] pending consume removed=%s tickets=%s remaining=%s",
        removed,
        ",".join(str(r) for r in refs),
        len(_PENDING_REQUESTS),
    )
    return {"ok": True, "removed": removed, "remaining": len(_PENDING_REQUESTS)}


@app.route("/api/push/tickets", methods=["POST"])
def push_ticket_payload():
    payload = request.get_json(silent=True) or {}
    ok = _store_ticket_payload(payload)
    ticket = payload.get("ticket") if isinstance(payload, dict) else None
    app.logger.info(
        "[bridge] push received ok=%s uuid=%s id=%s",
        ok,
        ticket.get("uuid") if isinstance(ticket, dict) else None,
        ticket.get("id") if isinstance(ticket, dict) else None,
    )
    if not ok:
        return {"error": "missing ticket in payload"}, 400
    return {"ok": True}


def _bridge_require_api_key():
    # Auth enforced by _bridge_middleware when BRIDGE_API_KEY is set.
    return


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _parse_iso_datetime(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _coerce_bool(value: object, default: bool | None = None) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        norm = value.strip().lower()
        if norm in {"1", "true", "yes", "y", "on"}:
            return True
        if norm in {"0", "false", "no", "n", "off"}:
            return False
    return default


def _should_enqueue_pending(default: bool = True) -> bool:
    val = request.args.get("enqueue")
    if val is None:
        return default
    return str(val).lower() not in {"0", "false", "no"}


def _serialize_ticket_payload(ticket: Ticket) -> dict:
    tpl = ticket.template
    proj = ticket.project
    return {
        "ticket": {
            "id": ticket.id,
            "uuid": ticket.uuid,
            "templateId": ticket.template_id,
            "projectId": ticket.project_id,
            "dthNumber": ticket.dth_number or "",
            "name": ticket.name or "",
            "notesEn": ticket.notes_en or "",
            "notesCn": ticket.notes_cn or "",
            "status": ticket.status,
            "trackingTicketId": ticket.tracking_ticket_id,
            "createdAt": _iso(ticket.created_at),
            "printedAt": _iso(ticket.printed_at),
            "printedBy": ticket.printed_by,
        },
        "template": None
        if tpl is None
        else {
            "id": tpl.id,
            "templateId": tpl.template_id,
            "designId": tpl.design_id,
            "name": tpl.name,
            "templateCode": tpl.template_code,
            "jobTypeEn": tpl.job_type_en,
            "jobTypeCn": tpl.job_type_cn,
            "defaultNotesEn": tpl.default_notes_en,
            "defaultNotesCn": tpl.default_notes_cn,
            "isActive": bool(tpl.is_active),
            "createdAt": _iso(tpl.created_at),
            "updatedAt": _iso(tpl.updated_at),
        },
        "project": None
        if proj is None
        else {
            "id": proj.id,
            "projectCode": proj.project_code,
            "name": proj.name,
            "description": proj.description,
            "status": proj.status,
            "createdAt": _iso(proj.created_at),
            "updatedAt": _iso(proj.updated_at),
        },
    }


def _attachment_file_url(attachment: Attachment) -> str | None:
    ref = attachment.uuid or attachment.id
    if not ref:
        return None
    ref_str = str(ref)
    if has_request_context():
        return url_for("attachment_file", attachment_ref=ref_str, _external=True)
    return f"/attachments/{ref_str}/file"


def _serialize_attachment(attachment: Attachment) -> dict:
    thumb = None
    if getattr(attachment, "thumbnails", None):
        thumb = attachment.thumbnails[0]
    return {
        "id": attachment.id,
        "uuid": attachment.uuid,
        "filePath": attachment.file_path,
        "fileName": attachment.file_name,
        "fileUrl": _attachment_file_url(attachment),
        "mimeType": attachment.mime_type,
        "description": attachment.description,
        "uploadedAt": _iso(attachment.uploaded_at),
        "uploadedBy": attachment.uploaded_by,
        "checklistStatusId": attachment.checklist_status_id,
        "thumbnailPath": thumb.file_path if thumb else None,
        "thumbnailWidth": thumb.width if thumb else None,
        "thumbnailHeight": thumb.height if thumb else None,
        "isImage": _is_probably_image(attachment.mime_type, attachment.file_path, attachment.file_name),
        "isVideo": _is_probably_video(attachment.mime_type, attachment.file_path, attachment.file_name),
    }


def _serialize_checklist_status(cs: TicketChecklistStatus) -> dict:
    item = cs.checklist_item
    return {
        "statusId": cs.id,
        "ticketId": cs.ticket_id,
        "checklistItemId": cs.checklist_item_id,
        "status": cs.status,
        "textEn": cs.text_en or "",
        "textCn": cs.text_cn or "",
        "checkedAt": _iso(cs.checked_at),
        "checkedBy": cs.checked_by,
        "attachments": [_serialize_attachment(att) for att in getattr(cs, "attachments", [])],
        "checklistItem": None
        if item is None
        else {
            "orderIndex": item.order_index,
            "textEn": item.text_en,
            "textCn": item.text_cn,
            "required": bool(item.required),
            "status": getattr(item, "status", None),
        },
    }


def _serialize_submission(submission: TicketSubmission) -> dict:
    return {
        "id": submission.id,
        "ticketUuid": submission.ticket_uuid,
        "checklistStatusId": submission.checklist_status_id,
        "startedAt": _iso(submission.started_at),
        "endedAt": _iso(submission.ended_at),
        "submittedBy": submission.submitted_by,
    }


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "uuid": user.uuid,
        "username": user.username,
        "displayName": user.display_name or "",
        "email": user.email,
        "role": user.role,
        "isActive": bool(user.is_active),
        "hasPassword": bool(user.password_hash),
        "createdAt": _iso(user.created_at),
        "updatedAt": _iso(user.updated_at),
    }


def _issue_user_session(session, user: User) -> tuple[str, UserSession]:
    token = secrets.token_urlsafe(32)
    token_hash = _hash_session_token(token)
    now = datetime.now(timezone.utc)
    expires_at = None
    if USER_AUTH_TTL_HOURS > 0:
        expires_at = now + timedelta(hours=USER_AUTH_TTL_HOURS)
    session_row = UserSession(
        user_id=user.id,
        token_hash=token_hash,
        created_at=now,
        last_seen_at=now,
        expires_at=expires_at,
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent"),
    )
    session.add(session_row)
    session.commit()
    session.refresh(session_row)
    return token, session_row


def _serialize_image(img: TicketImage) -> dict:
    mid_path = None
    if MID_IMAGE_ON_READ:
        mid_path = _ensure_mid_image_for_path(img.file_path)
    if not mid_path and MID_IMAGE_FALLBACK_TO_SOURCE and img.file_path:
        mid_path = img.file_path
    return {
        "id": img.id,
        "filePath": img.file_path,
        "midPath": mid_path,
        "caption": img.caption,
        "orderIndex": img.order_index,
    }


def _build_ticket_payload_full(ticket: Ticket) -> dict:
    """
    Full ticket payload including checklist and images.
    """
    payload = _serialize_ticket_payload(ticket)
    checklist = sorted(
        ticket.checklist_statuses,
        key=lambda cs: (
            cs.checklist_item.order_index if cs.checklist_item else 999999,
            cs.id,
        ),
    )
    payload["checklist"] = [_serialize_checklist_status(cs) for cs in checklist]
    images = sorted(ticket.images, key=lambda img: (img.order_index, img.id))
    payload["images"] = [_serialize_image(img) for img in images]
    return payload


def _push_ticket_to_server(ticket: Ticket) -> None:
    """
    Best-effort push of full ticket payload to an upstream server.
    Hardcoded SERVER_PUSH_URL; optional SERVER_PUSH_KEY for auth.
    Endpoint expected: POST of full payload at SERVER_PUSH_URL.
    """
    target = SERVER_PUSH_URL
    if not target:
        return
    api_key = os.getenv("SERVER_PUSH_KEY")
    timeout_val = os.getenv("SERVER_PUSH_TIMEOUT")
    try:
        timeout = float(timeout_val) if timeout_val else 5.0
    except (TypeError, ValueError):
        timeout = 5.0

    payload = _build_ticket_payload_full(ticket)
    data = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["x-api-key"] = api_key
    req = urlrequest.Request(target, data=data, headers=headers, method="POST")
    try:
        app.logger.info("Pushing ticket %s to %s", ticket.uuid, target)
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            app.logger.info(
                "Push response status=%s length=%s body_preview=%s",
                getattr(resp, "status", None),
                len(body),
                body[:200],
            )
    except Exception as exc:  # best-effort, do not block on push failures
        app.logger.warning("Failed to push ticket to server: %s", exc)


def _poll_server_for_ticket(ticket_ref: str) -> dict | None:
    """
    Best-effort poll for ticket payload from server.
    """
    target = SERVER_PUSH_URL
    if not target:
        return None
    poll_url = target.replace("/push/tickets", f"/tickets/{ticket_ref}/full")
    try:
        app.logger.info("Polling server for ticket %s -> %s", ticket_ref, poll_url)
        with urlrequest.urlopen(poll_url, timeout=5) as resp:
            body = resp.read()
            app.logger.info(
                "Poll response status=%s length=%s body_preview=%s",
                getattr(resp, "status", None),
                len(body),
                body[:200],
            )
            if resp.getcode() == 200 and body:
                return json.loads(body.decode("utf-8"))
    except Exception as exc:
        app.logger.warning("Poll failed for ticket %s: %s", ticket_ref, exc)
    return None


def _load_ticket_for_push(ticket_ref: str) -> Ticket | None:
    """
    Fetch a ticket with related rows, by id or uuid.
    """
    session = get_session()
    try:
        base = (
            session.query(Ticket)
            .options(
                selectinload(Ticket.template),
                selectinload(Ticket.project),
                selectinload(Ticket.images),
                selectinload(Ticket.checklist_statuses).selectinload(TicketChecklistStatus.checklist_item),
                selectinload(Ticket.checklist_statuses)
                .selectinload(TicketChecklistStatus.attachments)
                .selectinload(Attachment.thumbnails),
                selectinload(Ticket.attachments).selectinload(Attachment.thumbnails),
            )
        )
        ticket = None
        if str(ticket_ref).isdigit():
            ticket = base.filter(Ticket.id == int(ticket_ref)).one_or_none()
        if ticket is None:
            ticket = base.filter(Ticket.uuid == str(ticket_ref)).one_or_none()
        return ticket
    except Exception as exc:
        app.logger.warning("Lookup failed for ticket %s: %s", ticket_ref, exc)
        return None
    finally:
        session.close()


def _poll_pending_requests_loop():
    """
    Poll the server for pending ticket requests every 500ms and push if found.
    """
    if not SERVER_POLL_URL:
        app.logger.info("Pending poll disabled (no SERVER_POLL_URL)")
        return
    app.logger.info("Starting pending poll loop -> %s", SERVER_POLL_URL)
    while True:
        try:
            with urlrequest.urlopen(SERVER_POLL_URL, timeout=5) as resp:
                body = resp.read()
                status = getattr(resp, "status", None)
                app.logger.info(
                    "Pending poll status=%s len=%s preview=%s",
                    status,
                    len(body),
                    body[:200],
                )
                if status == 200 and body:
                    try:
                        data = json.loads(body.decode("utf-8") or "{}")
                    except Exception as exc:
                        app.logger.warning("Failed to parse pending payload: %s", exc)
                        data = {}
                    requests = data.get("requests") or []
                    for ticket_ref in requests:
                        app.logger.info("Handling pending ticket request %s", ticket_ref)
                        ticket_obj = _load_ticket_for_push(str(ticket_ref))
                        if ticket_obj:
                            _push_ticket_to_server(ticket_obj)
                        else:
                            app.logger.warning("Ticket %s not found locally", ticket_ref)
        except Exception as exc:
            app.logger.warning("Pending poll failed: %s", exc)
        time.sleep(POLL_INTERVAL_SEC)


def _enqueue_pending_ticket(ticket_ref: str) -> None:
    """
    Notify the bridge server that a ticket is pending print.
    """
    if not ticket_ref:
        return
    if not BRIDGE_PENDING_URL:
        _PENDING_REQUESTS.add(str(ticket_ref))
        app.logger.info("Enqueued pending ticket %s (local)", ticket_ref)
        return
    payload = json.dumps({"requests": [ticket_ref]}).encode("utf-8")
    req = urllib.request.Request(
        BRIDGE_PENDING_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp.read()
            app.logger.info("Enqueued pending ticket %s (status=%s)", ticket_ref, getattr(resp, "status", None))
    except Exception as exc:
        app.logger.warning("Failed to enqueue pending ticket %s: %s", ticket_ref, exc)


_POLL_THREAD_STARTED = False
_THUMBNAIL_THREAD_STARTED = False


def _ensure_poll_thread():
    global _POLL_THREAD_STARTED
    if _POLL_THREAD_STARTED or not SERVER_POLL_URL:
        return
    _POLL_THREAD_STARTED = True
    t = threading.Thread(target=_poll_pending_requests_loop, daemon=True)
    t.start()


def _ensure_thumbnail_thread():
    global _THUMBNAIL_THREAD_STARTED
    if _THUMBNAIL_THREAD_STARTED or not THUMBNAIL_ASYNC:
        return
    _THUMBNAIL_THREAD_STARTED = True
    t = threading.Thread(target=_thumbnail_worker, daemon=True)
    t.start()



@app.route("/api/bridge/health")
def bridge_health():
    _bridge_require_api_key()
    return {
        "ok": True,
        "db_path": str(DB_PATH),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _load_ticket_with_related(session: "Session", ticket_ref: str) -> Ticket | None:
    """
    Load a ticket by DB id (preferred) or UUID, with related rows preloaded.
    """
    def base_query():
        return (
            session.query(Ticket)
            .options(
                selectinload(Ticket.template),
                selectinload(Ticket.project),
                selectinload(Ticket.images),
                selectinload(Ticket.checklist_statuses).selectinload(TicketChecklistStatus.checklist_item),
                selectinload(Ticket.checklist_statuses)
                .selectinload(TicketChecklistStatus.attachments)
                .selectinload(Attachment.thumbnails),
                selectinload(Ticket.attachments).selectinload(Attachment.thumbnails),
            )
        )

    ticket = None
    if str(ticket_ref).isdigit():
        ticket = base_query().filter(Ticket.id == int(ticket_ref)).one_or_none()
    if ticket is None:
        ticket = base_query().filter(Ticket.uuid == ticket_ref).one_or_none()
    return ticket


def _load_payload_for_api(ticket_ref: str) -> dict | None:
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return None
        payload = _build_ticket_payload_full(ticket)
    except Exception as exc:
        if BRIDGE_CACHE_MODE == "fallback":
            cached = _get_cached_ticket(ticket_ref)
            if cached:
                app.logger.warning(
                    "[bridge] DB read failed, served cached ticketRef=%s err=%s",
                    ticket_ref,
                    exc,
                )
                return cached
        raise
    finally:
        session.close()
    if _cache_enabled():
        _store_ticket_payload(payload)
    return payload


@app.route("/api/bridge/tickets/<ticket_ref>")
def bridge_ticket(ticket_ref: str):
    _bridge_require_api_key()
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        payload = _serialize_ticket_payload(ticket)
        return payload
    finally:
        session.close()


@app.route("/api/bridge/tickets/<ticket_ref>/full")
def bridge_ticket_full(ticket_ref: str):
    _bridge_require_api_key()
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        payload = _build_ticket_payload_full(ticket)
        if _should_enqueue_pending():
            _enqueue_pending_ticket(ticket_ref)
        return payload
    finally:
        session.close()


@app.route("/api/bridge/tickets/<ticket_ref>/checklist")
def bridge_ticket_checklist(ticket_ref: str):
    _bridge_require_api_key()
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        checklist = sorted(
            ticket.checklist_statuses,
            key=lambda cs: (
                cs.checklist_item.order_index if cs.checklist_item else 999999,
                cs.id,
            ),
        )
        return {
            "ticketId": ticket.id,
            "checklist": [_serialize_checklist_status(cs) for cs in checklist],
        }
    finally:
        session.close()


@app.route("/api/bridge/tickets/<ticket_ref>/images")
def bridge_ticket_images(ticket_ref: str):
    _bridge_require_api_key()
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        images = sorted(ticket.images, key=lambda img: (img.order_index, img.id))
        return {"ticketId": ticket.id, "images": [_serialize_image(img) for img in images]}
    finally:
        session.close()


@app.route("/api/bridge/tickets/<ticket_ref>/checklist/<int:status_id>", methods=["PATCH"])
@app.route("/api/tickets/<ticket_ref>/checklist/<int:status_id>", methods=["PATCH"])
def bridge_update_checklist(ticket_ref: str, status_id: int):
    _bridge_require_api_key()
    payload = request.get_json(force=True, silent=True) or {}
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        status_row = (
            session.query(TicketChecklistStatus)
            .filter(
                TicketChecklistStatus.id == status_id,
                TicketChecklistStatus.ticket_id == ticket.id,
            )
            .one_or_none()
        )
        if status_row is None:
            return {"error": "checklist status not found"}, 404

        updated = False
        if "status" in payload:
            status_row.status = str(payload["status"])
            updated = True
        if "textEn" in payload:
            status_row.text_en = payload.get("textEn") or ""
            updated = True
        if "textCn" in payload:
            status_row.text_cn = payload.get("textCn") or ""
            updated = True
        if "checkedBy" in payload:
            status_row.checked_by = payload.get("checkedBy") or None
            updated = True

        if "checkedAt" in payload:
            val = payload.get("checkedAt")
            status_row.checked_at = datetime.fromisoformat(val) if val else None
            updated = True
        elif "status" in payload:
            status_row.checked_at = datetime.now(timezone.utc)
            updated = True

        if not updated:
            return {"error": "no fields to update"}, 400

        session.commit()
        session.refresh(status_row)
        _refresh_ticket_cache(ticket)
        _push_ticket_to_server(ticket)
        return _serialize_checklist_status(status_row)
    except Exception:
        session.rollback()
        raise


# -----------------------------
# Public API for full ticket payload (for app consumption)
# -----------------------------


@app.route("/api/tickets/<ticket_ref>")
def api_ticket(ticket_ref: str):
    payload = _load_payload_for_api(ticket_ref)
    if payload is None:
        if BRIDGE_PENDING_ON_MISS:
            _add_pending_request(ticket_ref)
            return _pending_response(ticket_ref, "ticket")
        return {"error": "ticket not found"}, 404
    return payload


@app.route("/api/tickets/<ticket_ref>/full")
def api_ticket_full(ticket_ref: str):
    payload = _load_payload_for_api(ticket_ref)
    if payload is None:
        if BRIDGE_PENDING_ON_MISS:
            _add_pending_request(ticket_ref)
            return _pending_response(ticket_ref, "full")
        return {"error": "ticket not found"}, 404
    try:
        if _should_enqueue_pending(default=False):
            _enqueue_pending_ticket(ticket_ref)
    except Exception:
        pass
    return payload


@app.route("/api/tickets/<ticket_ref>/checklist")
def api_ticket_checklist(ticket_ref: str):
    payload = _load_payload_for_api(ticket_ref)
    if payload is None:
        if BRIDGE_PENDING_ON_MISS:
            _add_pending_request(ticket_ref)
            return _pending_response(ticket_ref, "checklist")
        return {"error": "ticket not found"}, 404
    checklist = payload.get("checklist") or []
    ticket_id = (payload.get("ticket") or {}).get("id")
    return {"ticketId": ticket_id, "checklist": checklist}


@app.route("/api/tickets/<ticket_ref>/images")
def api_ticket_images(ticket_ref: str):
    payload = _load_payload_for_api(ticket_ref)
    if payload is None:
        if BRIDGE_PENDING_ON_MISS:
            _add_pending_request(ticket_ref)
            return _pending_response(ticket_ref, "images")
        return {"error": "ticket not found"}, 404
    images = payload.get("images") or []
    ticket_id = (payload.get("ticket") or {}).get("id")
    return {"ticketId": ticket_id, "images": images}


@app.route("/api/tickets/<ticket_ref>/start", methods=["POST"])
@app.route("/api/tickets/<ticket_ref>/started", methods=["POST"])
def api_ticket_start(ticket_ref: str):
    payload = request.get_json(silent=True) or {}
    started_raw = payload.get("startedAt") or payload.get("started_at")
    started_at = _parse_iso_datetime(started_raw) if started_raw else datetime.now(timezone.utc)
    if started_raw and started_at is None:
        return {"error": "invalid startedAt"}, 400
    session = get_session()
    try:
        ticket = None
        if str(ticket_ref).isdigit():
            ticket = session.query(Ticket).filter(Ticket.id == int(ticket_ref)).one_or_none()
        if ticket is None:
            ticket = session.query(Ticket).filter(Ticket.uuid == str(ticket_ref)).one_or_none()
        if ticket is None:
            return {"error": "ticket not found"}, 404
        submission = TicketSubmission(ticket_uuid=ticket.uuid, started_at=started_at)
        session.add(submission)
        session.commit()
        session.refresh(submission)
        return _serialize_submission(submission), 201
    finally:
        session.close()


@app.route("/api/tickets/<ticket_ref>/submit", methods=["POST"])
def api_ticket_submit(ticket_ref: str):
    payload = request.get_json(silent=True) or {}
    submission_id = payload.get("submissionId") or payload.get("submission_id")
    submitted_by = (
        payload.get("submittedBy")
        or payload.get("submitted_by")
        or payload.get("user")
        or payload.get("username")
    )
    ended_raw = payload.get("endedAt") or payload.get("ended_at")
    ended_at = _parse_iso_datetime(ended_raw) if ended_raw else datetime.now(timezone.utc)
    if ended_raw and ended_at is None:
        return {"error": "invalid endedAt"}, 400

    session = get_session()
    try:
        ticket = None
        if str(ticket_ref).isdigit():
            ticket = session.query(Ticket).filter(Ticket.id == int(ticket_ref)).one_or_none()
        if ticket is None:
            ticket = session.query(Ticket).filter(Ticket.uuid == str(ticket_ref)).one_or_none()
        if ticket is None:
            return {"error": "ticket not found"}, 404

        submission = None
        if submission_id is not None:
            try:
                submission_id_int = int(submission_id)
            except (TypeError, ValueError):
                return {"error": "invalid submissionId"}, 400
            submission = (
                session.query(TicketSubmission)
                .filter(
                    TicketSubmission.id == submission_id_int,
                    TicketSubmission.ticket_uuid == ticket.uuid,
                )
                .one_or_none()
            )
            if submission is None:
                return {"error": "submission not found"}, 404
        else:
            submission = (
                session.query(TicketSubmission)
                .filter(
                    TicketSubmission.ticket_uuid == ticket.uuid,
                    TicketSubmission.ended_at.is_(None),
                )
                .order_by(TicketSubmission.started_at.desc(), TicketSubmission.id.desc())
                .first()
            )

        if submission is None:
            started_raw = payload.get("startedAt") or payload.get("started_at")
            started_at = _parse_iso_datetime(started_raw) if started_raw else datetime.now(timezone.utc)
            if started_raw and started_at is None:
                return {"error": "invalid startedAt"}, 400
            submission = TicketSubmission(ticket_uuid=ticket.uuid, started_at=started_at)
            session.add(submission)
            session.flush()

        submission.ended_at = ended_at
        if submitted_by is not None:
            submission.submitted_by = str(submitted_by)
        session.commit()
        session.refresh(submission)
        ticket_uuid = ticket.uuid
        payload_out = _serialize_submission(submission)
    finally:
        session.close()

    try:
        generate_ticket_pdf_for_ticket(ticket_uuid, submitted_by=submitted_by)
    except Exception as exc:
        app.logger.warning("Ticket PDF generation failed for %s: %s", ticket_uuid, exc)

    return payload_out


@app.route("/api/tickets/<ticket_ref>/checklist/<int:status_id>/start", methods=["POST"])
def api_checklist_start(ticket_ref: str, status_id: int):
    payload = request.get_json(silent=True) or {}
    started_raw = payload.get("startedAt") or payload.get("started_at")
    started_at = _parse_iso_datetime(started_raw) if started_raw else datetime.now(timezone.utc)
    if started_raw and started_at is None:
        return {"error": "invalid startedAt"}, 400
    submitted_by = (
        payload.get("submittedBy")
        or payload.get("submitted_by")
        or payload.get("user")
        or payload.get("username")
    )
    session = get_session()
    try:
        ticket = None
        if str(ticket_ref).isdigit():
            ticket = session.query(Ticket).filter(Ticket.id == int(ticket_ref)).one_or_none()
        if ticket is None:
            ticket = session.query(Ticket).filter(Ticket.uuid == str(ticket_ref)).one_or_none()
        if ticket is None:
            return {"error": "ticket not found"}, 404
        status_row = (
            session.query(TicketChecklistStatus)
            .filter(
                TicketChecklistStatus.id == status_id,
                TicketChecklistStatus.ticket_id == ticket.id,
            )
            .one_or_none()
        )
        if status_row is None:
            return {"error": "checklist status not found"}, 404
        submission = TicketSubmission(
            ticket_uuid=ticket.uuid,
            checklist_status_id=status_row.id,
            started_at=started_at,
            submitted_by=str(submitted_by) if submitted_by is not None else None,
        )
        session.add(submission)
        session.commit()
        session.refresh(submission)
        return _serialize_submission(submission), 201
    finally:
        session.close()


@app.route("/api/tickets/<ticket_ref>/checklist/<int:status_id>/end", methods=["POST"])
def api_checklist_end(ticket_ref: str, status_id: int):
    payload = request.get_json(silent=True) or {}
    submission_id = payload.get("submissionId") or payload.get("submission_id")
    submitted_by = (
        payload.get("submittedBy")
        or payload.get("submitted_by")
        or payload.get("user")
        or payload.get("username")
    )
    ended_raw = payload.get("endedAt") or payload.get("ended_at")
    ended_at = _parse_iso_datetime(ended_raw) if ended_raw else datetime.now(timezone.utc)
    if ended_raw and ended_at is None:
        return {"error": "invalid endedAt"}, 400

    session = get_session()
    try:
        ticket = None
        if str(ticket_ref).isdigit():
            ticket = session.query(Ticket).filter(Ticket.id == int(ticket_ref)).one_or_none()
        if ticket is None:
            ticket = session.query(Ticket).filter(Ticket.uuid == str(ticket_ref)).one_or_none()
        if ticket is None:
            return {"error": "ticket not found"}, 404
        status_row = (
            session.query(TicketChecklistStatus)
            .filter(
                TicketChecklistStatus.id == status_id,
                TicketChecklistStatus.ticket_id == ticket.id,
            )
            .one_or_none()
        )
        if status_row is None:
            return {"error": "checklist status not found"}, 404

        submission = None
        if submission_id is not None:
            try:
                submission_id_int = int(submission_id)
            except (TypeError, ValueError):
                return {"error": "invalid submissionId"}, 400
            submission = (
                session.query(TicketSubmission)
                .filter(
                    TicketSubmission.id == submission_id_int,
                    TicketSubmission.ticket_uuid == ticket.uuid,
                    TicketSubmission.checklist_status_id == status_row.id,
                )
                .one_or_none()
            )
            if submission is None:
                return {"error": "submission not found"}, 404
        else:
            submission = (
                session.query(TicketSubmission)
                .filter(
                    TicketSubmission.ticket_uuid == ticket.uuid,
                    TicketSubmission.checklist_status_id == status_row.id,
                    TicketSubmission.ended_at.is_(None),
                )
                .order_by(TicketSubmission.started_at.desc(), TicketSubmission.id.desc())
                .first()
            )

        if submission is None:
            started_raw = payload.get("startedAt") or payload.get("started_at")
            started_at = _parse_iso_datetime(started_raw) if started_raw else datetime.now(timezone.utc)
            if started_raw and started_at is None:
                return {"error": "invalid startedAt"}, 400
            submission = TicketSubmission(
                ticket_uuid=ticket.uuid,
                checklist_status_id=status_row.id,
                started_at=started_at,
            )
            session.add(submission)
            session.flush()

        submission.ended_at = ended_at
        if submitted_by is not None:
            submission.submitted_by = str(submitted_by)
        session.commit()
        session.refresh(submission)
        return _serialize_submission(submission)
    finally:
        session.close()


@app.route("/api/tickets/<ticket_ref>/attachments", methods=["GET"])
def api_ticket_attachments(ticket_ref: str):
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        attachments = (
            session.query(Attachment)
            .filter(Attachment.ticket_id == ticket.id)
            .order_by(Attachment.id.asc())
            .all()
        )
        return {
            "ticketId": ticket.id,
            "attachments": [_serialize_attachment(att) for att in attachments],
        }
    finally:
        session.close()


@app.route("/api/tickets/<ticket_ref>/attachments", methods=["POST"])
def api_ticket_attachments_add(ticket_ref: str):
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404

        payload = request.get_json(silent=True) or {}
        status_id = (
            request.form.get("checklist_status_id")
            or request.form.get("checklistStatusId")
            or request.form.get("statusId")
            or request.args.get("checklist_status_id")
            or request.args.get("checklistStatusId")
            or request.args.get("statusId")
            or payload.get("checklist_status_id")
            or payload.get("checklistStatusId")
            or payload.get("statusId")
        )
        checklist_item_id = (
            request.form.get("checklist_item_id")
            or request.form.get("checklistItemId")
            or request.args.get("checklist_item_id")
            or request.args.get("checklistItemId")
            or payload.get("checklist_item_id")
            or payload.get("checklistItemId")
        )
        status_row = None
        if status_id is not None:
            try:
                status_id_int = int(status_id)
            except (TypeError, ValueError):
                return {"error": "invalid checklistStatusId"}, 400
            status_row = (
                session.query(TicketChecklistStatus)
                .filter(
                    TicketChecklistStatus.id == status_id_int,
                    TicketChecklistStatus.ticket_id == ticket.id,
                )
                .one_or_none()
            )
            if status_row is None:
                return {"error": "checklist status not found"}, 404
        elif checklist_item_id is not None:
            try:
                checklist_item_id_int = int(checklist_item_id)
            except (TypeError, ValueError):
                return {"error": "invalid checklistItemId"}, 400
            status_row = (
                session.query(TicketChecklistStatus)
                .filter(
                    TicketChecklistStatus.checklist_item_id == checklist_item_id_int,
                    TicketChecklistStatus.ticket_id == ticket.id,
                )
                .one_or_none()
            )
            if status_row is None:
                return {"error": "checklist item not found"}, 404

        upload = _get_attachment_upload()
        if upload and upload.filename:
            saved = _save_attachment_upload(upload)
            if not saved:
                return {"error": "missing attachment filename"}, 400
            file_path = saved["file_path"]
            file_name = (
                request.form.get("file_name")
                or request.form.get("fileName")
                or request.form.get("name")
                or saved["file_name"]
            )
            mime_type = request.form.get("mime_type") or request.form.get("mimeType") or saved["mime_type"]
            description = request.form.get("description")
            uploaded_by = request.form.get("uploaded_by") or request.form.get("uploadedBy")
        else:
            file_path = payload.get("filePath") or payload.get("file_path")
            if not file_path:
                return {"error": "filePath is required"}, 400
            try:
                resolved = Path(file_path).resolve()
                data_root = Path("data").resolve()
                resolved.relative_to(data_root)
            except Exception:
                return {"error": "filePath must be under data/"}, 400
            file_path = str(resolved)
            file_name = payload.get("fileName") or payload.get("file_name") or payload.get("name") or resolved.name
            mime_type = payload.get("mimeType") or payload.get("mime_type")
            description = payload.get("description")
            uploaded_by = payload.get("uploadedBy") or payload.get("uploaded_by")
        mime_type = _normalize_mime_type(mime_type, file_name, file_path)

        attachment = Attachment(
            ticket_id=ticket.id,
            template_id=ticket.template_id,
            checklist_status_id=status_row.id if status_row else None,
            file_path=file_path,
            file_name=file_name,
            mime_type=mime_type,
            description=description,
            uploaded_by=uploaded_by,
        )
        session.add(attachment)
        session.flush()
        session.commit()
        session.refresh(attachment)
        if attachment.id is not None:
            _enqueue_attachment_thumbnail(attachment.id)
        _refresh_ticket_cache(ticket)
        return _serialize_attachment(attachment), 201
    finally:
        session.close()


@app.route("/api/attachments/<attachment_ref>/thumbnail", methods=["POST"])
@app.route("/api/bridge/attachments/<attachment_ref>/thumbnail", methods=["POST"])
def api_attachment_thumbnail_upload(attachment_ref: str):
    _bridge_require_api_key()
    session = get_session()
    try:
        attachment = None
        if str(attachment_ref).isdigit():
            attachment = session.get(Attachment, int(attachment_ref))
        if attachment is None:
            attachment = (
                session.query(Attachment)
                .filter(Attachment.uuid == str(attachment_ref))
                .one_or_none()
            )
        if attachment is None:
            return {"error": "attachment not found"}, 404

        upload = request.files.get("file") or request.files.get("thumbnail")
        payload = request.get_json(silent=True) or {}
        width_val = request.form.get("width") or payload.get("width")
        height_val = request.form.get("height") or payload.get("height")
        try:
            width = int(width_val) if str(width_val).strip() != "" else None
        except (TypeError, ValueError, AttributeError):
            width = None
        try:
            height = int(height_val) if str(height_val).strip() != "" else None
        except (TypeError, ValueError, AttributeError):
            height = None

        if upload and upload.filename:
            saved = _save_thumbnail_upload(upload, attachment)
            if not saved:
                return {"error": "missing thumbnail filename"}, 400
            file_path = saved["file_path"]
        else:
            file_path = payload.get("filePath") or payload.get("file_path")
            if not file_path:
                return {"error": "thumbnail file is required"}, 400
            try:
                resolved = Path(file_path).resolve()
                data_root = Path("data").resolve()
                resolved.relative_to(data_root)
            except Exception:
                return {"error": "filePath must be under data/"}, 400
            file_path = str(resolved)

        existing = (
            session.query(Thumbnail)
            .filter(Thumbnail.attachment_id == attachment.id)
            .all()
        )
        for thumb in existing:
            if thumb.file_path:
                try:
                    resolved = Path(thumb.file_path).resolve()
                    data_root = Path("data").resolve()
                    resolved.relative_to(data_root)
                    if resolved.exists() and resolved.is_file():
                        resolved.unlink()
                except Exception:
                    pass
            session.delete(thumb)

        thumb = Thumbnail(
            attachment_id=attachment.id,
            file_path=file_path,
            width=width,
            height=height,
        )
        session.add(thumb)
        session.commit()

        attachment = (
            session.query(Attachment)
            .options(selectinload(Attachment.thumbnails))
            .filter(Attachment.id == attachment.id)
            .one()
        )
        return _serialize_attachment(attachment), 201
    finally:
        session.close()


@app.route("/api/tickets/<ticket_ref>/checklist/<int:status_id>/attachments", methods=["GET"])
def api_ticket_checklist_attachments(ticket_ref: str, status_id: int):
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        status_row = (
            session.query(TicketChecklistStatus)
            .filter(
                TicketChecklistStatus.id == status_id,
                TicketChecklistStatus.ticket_id == ticket.id,
            )
            .one_or_none()
        )
        if status_row is None:
            return {"error": "checklist status not found"}, 404
        attachments = (
            session.query(Attachment)
            .filter(Attachment.checklist_status_id == status_row.id)
            .order_by(Attachment.id.asc())
            .all()
        )
        return {
            "ticketId": ticket.id,
            "statusId": status_row.id,
            "attachments": [_serialize_attachment(att) for att in attachments],
        }
    finally:
        session.close()


@app.route("/api/tickets/<ticket_ref>/checklist/<int:status_id>/attachments", methods=["POST"])
def api_ticket_checklist_attachments_add(ticket_ref: str, status_id: int):
    session = get_session()
    try:
        ticket = _load_ticket_with_related(session, ticket_ref)
        if ticket is None:
            return {"error": "ticket not found"}, 404
        status_row = (
            session.query(TicketChecklistStatus)
            .filter(
                TicketChecklistStatus.id == status_id,
                TicketChecklistStatus.ticket_id == ticket.id,
            )
            .one_or_none()
        )
        if status_row is None:
            return {"error": "checklist status not found"}, 404

        upload = _get_attachment_upload()
        if upload and upload.filename:
            saved = _save_attachment_upload(upload)
            if not saved:
                return {"error": "missing attachment filename"}, 400
            file_path = saved["file_path"]
            file_name = (
                request.form.get("file_name")
                or request.form.get("fileName")
                or request.form.get("name")
                or saved["file_name"]
            )
            mime_type = request.form.get("mime_type") or request.form.get("mimeType") or saved["mime_type"]
            description = request.form.get("description")
            uploaded_by = request.form.get("uploaded_by") or request.form.get("uploadedBy")
        else:
            payload = request.get_json(silent=True) or {}
            file_path = payload.get("filePath") or payload.get("file_path")
            if not file_path:
                return {"error": "filePath is required"}, 400
            try:
                resolved = Path(file_path).resolve()
                data_root = Path("data").resolve()
                resolved.relative_to(data_root)
            except Exception:
                return {"error": "filePath must be under data/"}, 400
            file_path = str(resolved)
            file_name = payload.get("fileName") or payload.get("file_name") or payload.get("name") or resolved.name
            mime_type = payload.get("mimeType") or payload.get("mime_type")
            description = payload.get("description")
            uploaded_by = payload.get("uploadedBy") or payload.get("uploaded_by")
        mime_type = _normalize_mime_type(mime_type, file_name, file_path)

        attachment = Attachment(
            ticket_id=ticket.id,
            template_id=ticket.template_id,
            checklist_status_id=status_row.id,
            file_path=file_path,
            file_name=file_name,
            mime_type=mime_type,
            description=description,
            uploaded_by=uploaded_by,
        )
        session.add(attachment)
        session.flush()
        session.commit()
        session.refresh(attachment)
        if attachment.id is not None:
            _enqueue_attachment_thumbnail(attachment.id)
        _refresh_ticket_cache(ticket)
        return _serialize_attachment(attachment), 201
    finally:
        session.close()


# Kick off background threads on import
_ensure_thumbnail_thread()
_ensure_poll_thread()
