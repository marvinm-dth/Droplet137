from __future__ import annotations

import os
import re
import sys
import time
import shutil
import threading
import subprocess
from pathlib import Path
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

from flask import make_response, request, send_from_directory
from werkzeug.utils import secure_filename

from app import app


MEDIA_PUBLIC_BASE = os.getenv("PUBLIC_BASE", "").strip()
MEDIA_WEB_ORIGIN = os.getenv("WEB_ORIGIN") or os.getenv("CORS_ALLOW_ORIGIN", "*")
MAX_THUMB_WORKERS = max(1, int(os.getenv("THUMB_WORKERS", "2") or "2"))

MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", "/var/sql/recorder"))
PHOTO_DIR = Path(os.getenv("PHOTO_DIR", str(MEDIA_ROOT / "photos")))
VIDEO_DIR = Path(os.getenv("VIDEO_DIR", str(MEDIA_ROOT / "videos")))
IMAGE_DIR = Path(os.getenv("IMAGE_DIR", str(MEDIA_ROOT / "images")))
THUMB_DIR = Path(os.getenv("THUMB_DIR", str(MEDIA_ROOT / "thumbs")))

_ONE_YEAR_CACHE = "public, max-age=31536000, immutable"
_VALID_NAME = re.compile(r"^[\w.\-]+$")
_EXIF_DATE_RE = re.compile(
    r"^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:([+-]\d{2}:?\d{2})|Z)?$"
)

ARGV = set(sys.argv[1:])
FORCE_MODE = os.getenv("FORCE_MODE", "0") == "1" or "-force" in ARGV or "--force" in ARGV


def _has_cmd(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def _magick_bin() -> str | None:
    if _has_cmd("magick"):
        return "magick"
    if _has_cmd("convert"):
        return "convert"
    return None


MAGICK_BIN = _magick_bin()
HAVE_MAGICK = MAGICK_BIN is not None
HAVE_GM = _has_cmd("gm")
HAVE_FFMPEG = _has_cmd("ffmpeg")
HAVE_FFPROBE = _has_cmd("ffprobe")
HAVE_IDENTIFY = _has_cmd("identify")

try:  # Optional, but in requirements
    from PIL import Image, ImageOps, ExifTags  # type: ignore

    HAVE_PIL = True
    _EXIF_TAGS = {name: tag_id for tag_id, name in ExifTags.TAGS.items()}
except Exception as exc:  # pragma: no cover - best effort import
    HAVE_PIL = False
    Image = None
    ImageOps = None
    ExifTags = None
    _EXIF_TAGS = {}
    app.logger.warning("[MEDIA] PIL not available: %s", exc)


def _ensure_media_dirs() -> bool:
    global MEDIA_READY
    ok = True
    for folder in (PHOTO_DIR, VIDEO_DIR, IMAGE_DIR, THUMB_DIR):
        try:
            folder.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            app.logger.warning("[MEDIA] failed to ensure dir %s: %s", folder, exc)
            ok = False
    if not IMAGE_DIR.exists() or not IMAGE_DIR.is_dir():
        app.logger.warning("[MEDIA] IMAGE_DIR not accessible: %s", IMAGE_DIR)
        ok = False
    MEDIA_READY = ok
    return ok


MEDIA_READY = _ensure_media_dirs()


def _media_base_url() -> str:
    if MEDIA_PUBLIC_BASE:
        return MEDIA_PUBLIC_BASE.rstrip("/")
    try:
        return request.url_root.rstrip("/")
    except Exception:
        return ""


def _make_url(prefix: str, name: str) -> str:
    base = _media_base_url()
    if not base:
        return f"{prefix}/{name}"
    return f"{base}{prefix}/{name}"


def _run_cmd(args: list[str]) -> str:
    result = subprocess.run(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"{args[0]} exit {result.returncode}: {result.stderr.decode('utf-8', errors='ignore')}"
        )
    return result.stdout.decode("utf-8", errors="ignore")


def _robust_mtime_ms(st) -> int:
    try:
        if hasattr(st, "st_mtime_ns"):
            return int(st.st_mtime_ns / 1_000_000)
    except Exception:
        pass
    try:
        return int(st.st_mtime * 1000)
    except Exception:
        return int(time.time() * 1000)


def _parse_date_to_ms(value: str | None) -> int | None:
    if not value:
        return None
    if isinstance(value, bytes):
        try:
            value = value.decode("utf-8", errors="ignore")
        except Exception:
            return None
    value = str(value).strip()
    if not value:
        return None
    match = _EXIF_DATE_RE.match(value)
    if match:
        year, month, day, hour, minute, second, tz = match.groups()
        tzinfo = timezone.utc
        if tz and tz != "Z":
            sign = 1 if tz.startswith("+") else -1
            parts = tz[1:].replace(":", "")
            try:
                tzh = int(parts[:2])
                tzm = int(parts[2:4] or 0)
                tzinfo = timezone(sign * timedelta(hours=tzh, minutes=tzm))
            except Exception:
                tzinfo = timezone.utc
        dt = datetime(
            int(year),
            int(month),
            int(day),
            int(hour),
            int(minute),
            int(second),
            tzinfo=tzinfo,
        )
        return int(dt.timestamp() * 1000)
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def _is_temp(name: str) -> bool:
    return name.lower().endswith((".temp", ".tmp"))


def _is_photo_file(name: str) -> bool:
    return bool(re.search(r"\.(jpe?g|png|webp|heic)$", name, re.IGNORECASE))


def _is_video_file(name: str) -> bool:
    return bool(re.search(r"\.(mp4|mov|webm|mkv)$", name, re.IGNORECASE))


def _get_photo_capture_ms(abs_path: Path) -> int | None:
    if HAVE_PIL and Image is not None:
        try:
            with Image.open(abs_path) as img:
                exif = img.getexif()
                if exif:
                    candidates = [
                        exif.get(_EXIF_TAGS.get("DateTimeOriginal")),
                        exif.get(_EXIF_TAGS.get("DateTimeDigitized")),
                        exif.get(_EXIF_TAGS.get("DateTime")),
                        exif.get(_EXIF_TAGS.get("CreateDate")),
                        exif.get(_EXIF_TAGS.get("ModifyDate")),
                    ]
                    for c in candidates:
                        ts = _parse_date_to_ms(c)
                        if ts and ts > 0:
                            return ts
        except Exception as exc:
            app.logger.warning("[MEDIA][EXIF] parse failed for %s: %s", abs_path, exc)
    if HAVE_IDENTIFY:
        try:
            out = _run_cmd(
                [
                    "identify",
                    "-format",
                    "%[EXIF:DateTimeOriginal]\n%[EXIF:CreateDate]\n%[date:create]\n%[date:modify]",
                    str(abs_path),
                ]
            )
            for line in [l for l in out.splitlines() if l.strip()]:
                ts = _parse_date_to_ms(line)
                if ts and ts > 0:
                    return ts
        except Exception as exc:
            app.logger.warning("[MEDIA][identify] failed for %s: %s", abs_path, exc)
    return None


def _get_video_capture_ms(abs_path: Path) -> int | None:
    if HAVE_FFPROBE:
        try:
            out = _run_cmd(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "format_tags=creation_time",
                    "-of",
                    "default=nw=1:nk=1",
                    str(abs_path),
                ]
            )
            ts = _parse_date_to_ms(out.strip())
            if ts and ts > 0:
                return ts
        except Exception:
            pass
    return None


def _resize_with_pil(img, width: int) -> object:
    if img is None:
        return None
    img = ImageOps.exif_transpose(img) if ImageOps is not None else img
    w, h = img.size
    if w <= 0 or h <= 0:
        return img
    scale = min(1.0, width / float(w))
    if scale < 1.0:
        new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
        img = img.resize(new_size, Image.LANCZOS)
    return img


def _ensure_thumb_for_photo(photo_name: str) -> Path | None:
    try:
        THUMB_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        app.logger.warning("[MEDIA] failed to ensure thumb dir %s: %s", THUMB_DIR, exc)
    src = PHOTO_DIR / photo_name
    out_webp = THUMB_DIR / f"{photo_name}.webp"
    out_jpg = THUMB_DIR / f"{photo_name}.jpg"

    try:
        if out_webp.exists() and out_webp.stat().st_size > 0:
            return out_webp
    except Exception:
        pass
    try:
        if out_jpg.exists() and out_jpg.stat().st_size > 0:
            return out_jpg
    except Exception:
        pass

    if HAVE_PIL and Image is not None:
        try:
            with Image.open(src) as img:
                img = _resize_with_pil(img, 300)
                try:
                    img.save(out_webp, "WEBP", quality=70, method=6)
                    return out_webp
                except Exception:
                    pass
                if img.mode not in {"RGB", "L"}:
                    img = img.convert("RGB")
                img.save(out_jpg, "JPEG", quality=70)
                return out_jpg
        except Exception as exc:
            app.logger.warning("[MEDIA][thumb][pil] failed for %s: %s", photo_name, exc)

    if HAVE_MAGICK and MAGICK_BIN:
        try:
            _run_cmd([MAGICK_BIN, str(src), "-auto-orient", "-resize", "300x", "-quality", "70", str(out_jpg)])
            return out_jpg
        except Exception as exc:
            app.logger.warning("[MEDIA][thumb][magick] failed for %s: %s", photo_name, exc)

    if HAVE_GM:
        try:
            _run_cmd(["gm", "convert", str(src), "-auto-orient", "-resize", "300x", "-quality", "70", str(out_jpg)])
            return out_jpg
        except Exception as exc:
            app.logger.warning("[MEDIA][thumb][gm] failed for %s: %s", photo_name, exc)

    if HAVE_FFMPEG:
        try:
            _run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(src),
                    "-ss",
                    "0",
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale='min(300,iw)':'-1':flags=lanczos",
                    str(out_jpg),
                ]
            )
            return out_jpg
        except Exception as exc:
            app.logger.warning("[MEDIA][thumb][ffmpeg-img] failed for %s: %s", photo_name, exc)

    try:
        shutil.copyfile(src, out_jpg)
        return out_jpg
    except Exception as exc:
        app.logger.warning("[MEDIA][thumb][copy] failed for %s: %s", photo_name, exc)
        return None


def _ensure_thumb_for_video(video_name: str) -> Path | None:
    try:
        THUMB_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        app.logger.warning("[MEDIA] failed to ensure thumb dir %s: %s", THUMB_DIR, exc)
    src = VIDEO_DIR / video_name
    out_jpg = THUMB_DIR / f"{video_name}.jpg"
    try:
        if out_jpg.exists() and out_jpg.stat().st_size > 0:
            return out_jpg
    except Exception:
        pass

    if HAVE_FFMPEG:
        try:
            _run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(src),
                    "-ss",
                    "0.5",
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale='min(300,iw)':'-1':flags=lanczos",
                    str(out_jpg),
                ]
            )
        except Exception:
            _run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(src),
                    "-ss",
                    "0",
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale='min(300,iw)':'-1':flags=lanczos",
                    str(out_jpg),
                ]
            )
        return out_jpg

    try:
        shutil.copyfile(src, out_jpg)
        return out_jpg
    except Exception as exc:
        app.logger.warning("[MEDIA][vthumb][copy] failed for %s: %s", video_name, exc)
        return None


_MEDIA_THUMB_EXECUTOR = ThreadPoolExecutor(max_workers=MAX_THUMB_WORKERS)
_MEDIA_THUMB_PENDING: set[str] = set()
_MEDIA_THUMB_LOCK = threading.Lock()


def _enqueue_thumb(kind: str, name: str) -> None:
    key = f"{kind}:{name}"
    with _MEDIA_THUMB_LOCK:
        if key in _MEDIA_THUMB_PENDING:
            return
        _MEDIA_THUMB_PENDING.add(key)

    def _run() -> None:
        try:
            if kind == "photo":
                _ensure_thumb_for_photo(name)
            elif kind == "video":
                _ensure_thumb_for_video(name)
        finally:
            with _MEDIA_THUMB_LOCK:
                _MEDIA_THUMB_PENDING.discard(key)

    _MEDIA_THUMB_EXECUTOR.submit(_run)


def _list_dir_json(dir_path: Path, prefix: str, force: bool) -> list[dict]:
    is_photo_dir = dir_path == PHOTO_DIR
    is_video_dir = dir_path == VIDEO_DIR
    try:
        names = os.listdir(dir_path)
    except Exception as exc:
        raise RuntimeError(str(exc)) from exc

    items: list[dict] = []
    for name in names:
        if not _VALID_NAME.match(name):
            continue
        if _is_temp(name):
            continue
        if is_photo_dir and not _is_photo_file(name):
            continue
        if is_video_dir and not _is_video_file(name):
            continue
        fp = dir_path / name
        try:
            st = fp.stat()
        except Exception:
            continue
        if not fp.is_file():
            continue
        item = {
            "name": name,
            "url": _make_url(prefix, name),
            "size": st.st_size,
            "mtimeMs": _robust_mtime_ms(st),
        }
        if is_photo_dir:
            webp = THUMB_DIR / f"{name}.webp"
            jpg = THUMB_DIR / f"{name}.jpg"
            if webp.exists():
                item["thumbUrl"] = _make_url("/media/thumbs", webp.name)
            elif jpg.exists():
                item["thumbUrl"] = _make_url("/media/thumbs", jpg.name)
            elif force:
                try:
                    out = _ensure_thumb_for_photo(name)
                    if out:
                        item["thumbUrl"] = _make_url("/media/thumbs", out.name)
                except Exception:
                    pass
            else:
                _enqueue_thumb("photo", name)
        elif is_video_dir:
            jpg = THUMB_DIR / f"{name}.jpg"
            if jpg.exists():
                item["thumbUrl"] = _make_url("/media/thumbs", jpg.name)
            elif force:
                try:
                    out = _ensure_thumb_for_video(name)
                    if out:
                        item["thumbUrl"] = _make_url("/media/thumbs", out.name)
                except Exception:
                    pass
            else:
                _enqueue_thumb("video", name)
        items.append(item)

    items.sort(key=lambda i: i.get("mtimeMs") or 0, reverse=True)
    return items


def _session_id_from_name(name: str) -> str | None:
    underscore = name.find("_")
    if underscore < 0:
        return None
    rest = name[underscore + 1 :]
    tag = "SID-"
    i = rest.find(tag)
    j = rest.find("__")
    if i < 0 or j <= i:
        return None
    return rest[i + len(tag) : j]


def _build_missing_photo_thumbs() -> None:
    try:
        names = [
            n
            for n in os.listdir(PHOTO_DIR)
            if _VALID_NAME.match(n) and not _is_temp(n) and _is_photo_file(n)
        ]
    except Exception as exc:
        app.logger.warning("[MEDIA] could not scan photos for thumbnails: %s", exc)
        return
    if not names:
        return
    app.logger.info("[MEDIA] building missing PHOTO thumbs; files=%s", len(names))
    done = 0
    for name in names:
        try:
            _ensure_thumb_for_photo(name)
            done += 1
        except Exception:
            continue
    app.logger.info("[MEDIA] photo thumb build finished; processed=%s", done)


def _build_missing_video_thumbs() -> None:
    try:
        names = [
            n
            for n in os.listdir(VIDEO_DIR)
            if _VALID_NAME.match(n) and not _is_temp(n) and _is_video_file(n)
        ]
    except Exception as exc:
        app.logger.warning("[MEDIA] could not scan videos for thumbnails: %s", exc)
        return
    if not names:
        return
    app.logger.info("[MEDIA] building missing VIDEO thumbs; files=%s", len(names))
    done = 0
    for name in names:
        try:
            _ensure_thumb_for_video(name)
            done += 1
        except Exception:
            continue
    app.logger.info("[MEDIA] video thumb build finished; processed=%s", done)


_MEDIA_BOOTSTRAP_STARTED = False


def _ensure_media_bootstrap() -> None:
    global _MEDIA_BOOTSTRAP_STARTED
    if _MEDIA_BOOTSTRAP_STARTED or not MEDIA_READY:
        return
    _MEDIA_BOOTSTRAP_STARTED = True
    if FORCE_MODE:
        _build_missing_photo_thumbs()
        _build_missing_video_thumbs()
        return
    threading.Thread(target=_build_missing_photo_thumbs, daemon=True).start()
    threading.Thread(target=_build_missing_video_thumbs, daemon=True).start()


def _require_media_ready() -> bool:
    if not _ensure_media_dirs():
        return False
    _ensure_media_bootstrap()
    return True


def _media_unavailable():
    return make_response({"ok": False, "error": "media storage unavailable"}, 503)


@app.after_request
def _apply_media_headers(response):
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer-when-downgrade")
    response.headers.setdefault("X-XSS-Protection", "1; mode=block")

    if request.path.startswith(("/upload/", "/list/", "/media/", "/image", "/healthz", "/admin/")):
        response.headers.setdefault("Access-Control-Allow-Origin", MEDIA_WEB_ORIGIN)
        response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        response.headers.setdefault(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, X-API-Key",
        )
    return response


@app.get("/healthz")
def media_health():
    media_ready = _ensure_media_dirs()
    return {
        "ok": True,
        "haveSharp": HAVE_PIL,
        "haveMagick": HAVE_MAGICK,
        "haveGM": HAVE_GM,
        "haveFFmpeg": HAVE_FFMPEG,
        "haveFfprobe": HAVE_FFPROBE,
        "haveExifr": HAVE_PIL,
        "haveIdentify": HAVE_IDENTIFY,
        "forceMode": FORCE_MODE,
        "mediaReady": media_ready,
    }


@app.get("/media/photos/<path:filename>")
def media_photos(filename: str):
    if not _require_media_ready():
        return _media_unavailable()
    resp = send_from_directory(PHOTO_DIR, filename, conditional=True)
    resp.headers["Cache-Control"] = _ONE_YEAR_CACHE
    return resp


@app.get("/media/videos/<path:filename>")
def media_videos(filename: str):
    if not _require_media_ready():
        return _media_unavailable()
    resp = send_from_directory(VIDEO_DIR, filename, conditional=True)
    resp.headers["Cache-Control"] = _ONE_YEAR_CACHE
    return resp


@app.get("/media/images/<path:filename>")
def media_images(filename: str):
    if not _require_media_ready():
        return _media_unavailable()
    resp = send_from_directory(IMAGE_DIR, filename, conditional=True)
    resp.headers["Cache-Control"] = _ONE_YEAR_CACHE
    return resp


@app.get("/media/thumbs/<path:filename>")
def media_thumbs(filename: str):
    if not _require_media_ready():
        return _media_unavailable()
    resp = send_from_directory(THUMB_DIR, filename, conditional=True)
    resp.headers["Cache-Control"] = _ONE_YEAR_CACHE
    return resp


@app.get("/image/<path:filename>")
def legacy_image(filename: str):
    if not _require_media_ready():
        return _media_unavailable()
    app.logger.info("[MEDIA] %s %s", request.method, request.path)
    if not _VALID_NAME.match(filename):
        return make_response("Invalid filename", 400)
    resp = send_from_directory(IMAGE_DIR, filename, conditional=True)
    resp.headers["Cache-Control"] = _ONE_YEAR_CACHE
    return resp


def _save_upload(upload, dest_dir: Path, fallback_name: str) -> tuple[str, Path]:
    original = upload.filename or fallback_name
    safe_name = secure_filename(original) or fallback_name
    safe_name = re.sub(r"\s+", "_", safe_name)
    save_name = f"{int(time.time() * 1000)}_{safe_name}"
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        app.logger.warning("[MEDIA] failed to ensure dir %s: %s", dest_dir, exc)
    save_path = dest_dir / save_name
    upload.save(save_path)
    return save_name, save_path


def _apply_capture_time(abs_path: Path, capture_ms: int | None) -> int:
    if not capture_ms or capture_ms <= 0:
        try:
            st = abs_path.stat()
            birth = getattr(st, "st_birthtime", 0)
            capture_ms = int(birth * 1000) if birth else _robust_mtime_ms(st)
        except Exception:
            capture_ms = int(time.time() * 1000)
    try:
        os.utime(abs_path, (capture_ms / 1000, capture_ms / 1000))
    except Exception:
        pass
    return int(capture_ms)


@app.post("/upload/photo")
def upload_photo():
    if not _require_media_ready():
        return _media_unavailable()
    if request.content_length and request.content_length > 25 * 1024 * 1024:
        return {"ok": False, "error": "file too large"}, 413
    upload = request.files.get("photo")
    if not upload or not upload.filename:
        return {"ok": False, "error": "missing photo"}, 400
    name, abs_path = _save_upload(upload, PHOTO_DIR, "upload")
    try:
        if abs_path.stat().st_size > 25 * 1024 * 1024:
            abs_path.unlink(missing_ok=True)
            return {"ok": False, "error": "file too large"}, 413
    except Exception:
        pass

    cap_ms = _get_photo_capture_ms(abs_path)
    client_cap = request.form.get("capturedAt")
    try:
        client_cap_ms = int(client_cap) if client_cap is not None else None
    except Exception:
        client_cap_ms = None
    if (not cap_ms or cap_ms <= 0) and client_cap_ms and client_cap_ms > 0:
        cap_ms = client_cap_ms
    cap_ms = _apply_capture_time(abs_path, cap_ms)

    thumb_path = _ensure_thumb_for_photo(name)
    payload = {
        "ok": True,
        "url": _make_url("/media/photos", name),
        "name": name,
        "mtimeMs": cap_ms,
    }
    if thumb_path:
        payload["thumbUrl"] = _make_url("/media/thumbs", thumb_path.name)
    return payload


@app.post("/upload/video")
def upload_video():
    if not _require_media_ready():
        return _media_unavailable()
    if request.content_length and request.content_length > 1024 * 1024 * 1024:
        return {"ok": False, "error": "file too large"}, 413
    upload = request.files.get("video")
    if not upload or not upload.filename:
        return {"ok": False, "error": "missing video"}, 400
    name, abs_path = _save_upload(upload, VIDEO_DIR, "video")
    try:
        if abs_path.stat().st_size > 1024 * 1024 * 1024:
            abs_path.unlink(missing_ok=True)
            return {"ok": False, "error": "file too large"}, 413
    except Exception:
        pass

    cap_ms = _get_video_capture_ms(abs_path)
    client_cap = request.form.get("capturedAt")
    try:
        client_cap_ms = int(client_cap) if client_cap is not None else None
    except Exception:
        client_cap_ms = None
    if (not cap_ms or cap_ms <= 0) and client_cap_ms and client_cap_ms > 0:
        cap_ms = client_cap_ms
    cap_ms = _apply_capture_time(abs_path, cap_ms)

    thumb_path = _ensure_thumb_for_video(name)
    payload = {
        "ok": True,
        "url": _make_url("/media/videos", name),
        "name": name,
        "mtimeMs": cap_ms,
    }
    if thumb_path:
        payload["thumbUrl"] = _make_url("/media/thumbs", thumb_path.name)
    return payload


@app.get("/list/photos")
def list_photos():
    if not _require_media_ready():
        return _media_unavailable()
    force = FORCE_MODE or request.args.get("force") == "1"
    try:
        items = _list_dir_json(PHOTO_DIR, "/media/photos", force)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}, 500
    return {"ok": True, "items": items}


@app.get("/list/videos")
def list_videos():
    if not _require_media_ready():
        return _media_unavailable()
    force = FORCE_MODE or request.args.get("force") == "1"
    try:
        items = _list_dir_json(VIDEO_DIR, "/media/videos", force)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}, 500
    return {"ok": True, "items": items}


@app.get("/list/sessions")
def list_sessions():
    if not _require_media_ready():
        return _media_unavailable()
    force = FORCE_MODE or request.args.get("force") == "1"
    try:
        photos = _list_dir_json(PHOTO_DIR, "/media/photos", force)
        videos = _list_dir_json(VIDEO_DIR, "/media/videos", force)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}, 500

    by: dict[str, dict] = {}

    def add_to_session(item: dict, is_photo: bool) -> None:
        sid = _session_id_from_name(item["name"]) or "unsessioned"
        session = by.get(sid)
        if not session:
            session = by[sid] = {"id": sid, "when": item.get("mtimeMs") or 0, "photos": [], "videos": []}
        if (item.get("mtimeMs") or 0) > session["when"]:
            session["when"] = item.get("mtimeMs") or 0
        if is_photo:
            session["photos"].append(item)
        else:
            session["videos"].append(item)

    for p in photos:
        add_to_session(p, True)
    for v in videos:
        add_to_session(v, False)

    sessions = []
    for session in by.values():
        thumbs: list[str] = []
        for photo in session["photos"]:
            if len(thumbs) >= 3:
                break
            thumbs.append(photo.get("thumbUrl") or photo.get("url"))
        for video in session["videos"]:
            if len(thumbs) >= 3:
                break
            thumb_url = video.get("thumbUrl")
            if thumb_url:
                thumbs.append(thumb_url)
        sessions.append(
            {
                "id": session["id"],
                "when": int(session["when"] or 0),
                "photos": session["photos"],
                "videos": session["videos"],
                "thumbs": thumbs,
            }
        )

    sessions.sort(key=lambda s: s.get("when") or 0, reverse=True)
    return {"ok": True, "sessions": sessions}


@app.post("/admin/build-thumbs")
def admin_build_thumbs():
    if not _require_media_ready():
        return _media_unavailable()
    result = {
        "ok": True,
        "photos": {"made": 0, "skipped": 0, "failed": 0},
        "videos": {"made": 0, "skipped": 0, "failed": 0},
    }
    try:
        photo_files = [
            n
            for n in os.listdir(PHOTO_DIR)
            if _VALID_NAME.match(n) and not _is_temp(n) and _is_photo_file(n)
        ]
        video_files = [
            n
            for n in os.listdir(VIDEO_DIR)
            if _VALID_NAME.match(n) and not _is_temp(n) and _is_video_file(n)
        ]
    except Exception as exc:
        return {"ok": False, "error": str(exc)}, 500

    for name in photo_files:
        try:
            webp = THUMB_DIR / f"{name}.webp"
            jpg = THUMB_DIR / f"{name}.jpg"
            if webp.exists() or jpg.exists():
                result["photos"]["skipped"] += 1
                continue
            out = _ensure_thumb_for_photo(name)
            if out:
                result["photos"]["made"] += 1
            else:
                result["photos"]["failed"] += 1
        except Exception:
            result["photos"]["failed"] += 1

    for name in video_files:
        try:
            jpg = THUMB_DIR / f"{name}.jpg"
            if jpg.exists():
                result["videos"]["skipped"] += 1
                continue
            out = _ensure_thumb_for_video(name)
            if out:
                result["videos"]["made"] += 1
            else:
                result["videos"]["failed"] += 1
        except Exception:
            result["videos"]["failed"] += 1

    return result


_ensure_media_bootstrap()
