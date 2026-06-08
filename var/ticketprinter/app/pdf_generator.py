from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List

from PIL import Image, ImageDraw, ImageFont, ImageOps
from sqlalchemy.orm import Session, selectinload

from app.models import Attachment, Ticket, TicketChecklistStatus, get_session

PDF_DIR = Path("data/ticket_pdfs")
PDF_DIR.mkdir(parents=True, exist_ok=True)

PAGE_SIZE = (3300, 2550)  # landscape letter at ~300 DPI
MARGIN = 90
GAP = 40
FOOTER_HEIGHT = 360
BORDER_WIDTH = 6
SLOT_BORDER_WIDTH = 5
BORDER_COLOR = (0, 0, 0)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff"}


@dataclass
class ImageSpec:
    path: str
    timestamp: datetime


@dataclass
class PageSpec:
    ticket_title: str
    checklist_title: str
    page_date: datetime
    images: List[ImageSpec]


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except Exception:
        try:
            font_path = Path(ImageFont.__file__).resolve().parent / "fonts" / "DejaVuSans.ttf"
            return ImageFont.truetype(str(font_path), size)
        except Exception:
            return ImageFont.load_default()


def _format_dt(dt: datetime) -> str:
    if dt.tzinfo is not None:
        try:
            dt = dt.astimezone()
        except Exception:
            pass
    return dt.strftime("%Y-%m-%d %H:%M")


def _parse_exif_datetime(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def _get_image_datetime(image_path: Path, uploaded_at: datetime | None) -> datetime:
    try:
        with Image.open(image_path) as img:
            exif = img.getexif()
            if exif:
                dt_raw = exif.get(36867) or exif.get(36868) or exif.get(306)
                parsed = _parse_exif_datetime(dt_raw)
                if parsed:
                    return parsed
    except Exception:
        pass

    if uploaded_at is not None:
        return uploaded_at

    try:
        return datetime.fromtimestamp(image_path.stat().st_mtime, tz=timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def _is_image_attachment(att: Attachment) -> bool:
    mime = (att.mime_type or "").lower()
    if mime.startswith("image/"):
        return True
    ext = Path(att.file_path or "").suffix.lower()
    return ext in IMAGE_EXTENSIONS


def _overlay_timestamp(image: Image.Image, timestamp: datetime) -> Image.Image:
    text = _format_dt(timestamp)
    font = _load_font(28)
    img = image.convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    padding = 10

    x = img.width - text_w - padding * 2
    y = img.height - text_h - padding * 2
    draw.rectangle(
        [x, y, x + text_w + padding * 2, y + text_h + padding * 2],
        fill=(0, 0, 0, 170),
    )
    draw.text((x + padding, y + padding), text, font=font, fill=(255, 255, 255, 240))

    return Image.alpha_composite(img, overlay).convert("RGB")


def _prepare_image_for_slot(path: Path, timestamp: datetime, target_w: int, target_h: int) -> Image.Image:
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (target_w, target_h), "white")
        offset = ((target_w - img.width) // 2, (target_h - img.height) // 2)
        canvas.paste(img, offset)

    return _overlay_timestamp(canvas, timestamp)


def _chunked(items: List[ImageSpec], size: int) -> Iterable[List[ImageSpec]]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def _collect_pages(ticket: Ticket) -> List[PageSpec]:
    ticket_title = (ticket.name or "").strip()
    if not ticket_title:
        if ticket.template and ticket.template.name:
            ticket_title = ticket.template.name
        elif ticket.dth_number:
            ticket_title = ticket.dth_number
        else:
            ticket_title = f"Ticket {ticket.id or ticket.uuid}"

    statuses = list(ticket.checklist_statuses or [])
    statuses.sort(
        key=lambda cs: (
            cs.checklist_item.order_index if cs.checklist_item else 10_000,
            cs.id or 0,
        )
    )

    pages: List[PageSpec] = []

    for status in statuses:
        images = []
        for att in sorted(status.attachments or [], key=lambda a: a.id or 0):
            if not att.file_path or not _is_image_attachment(att):
                continue
            path = Path(att.file_path)
            if not path.exists():
                continue
            timestamp = _get_image_datetime(path, att.uploaded_at)
            images.append(ImageSpec(path=str(path), timestamp=timestamp))
        if not images:
            continue

        checklist_title = (status.text_en or "").strip()
        if not checklist_title and status.checklist_item:
            checklist_title = (status.checklist_item.text_en or "").strip()
        if not checklist_title:
            checklist_title = "Checklist Item"

        for chunk in _chunked(images, 3):
            page_date = min(img.timestamp for img in chunk)
            pages.append(
                PageSpec(
                    ticket_title=ticket_title,
                    checklist_title=checklist_title,
                    page_date=page_date,
                    images=chunk,
                )
            )

    return pages


def _render_page(spec: PageSpec, page_number: int, total_pages: int) -> Image.Image:
    page = Image.new("RGB", PAGE_SIZE, "white")
    draw = ImageDraw.Draw(page)
    width, height = PAGE_SIZE

    draw.rectangle(
        [
            MARGIN // 2,
            MARGIN // 2,
            width - MARGIN // 2,
            height - MARGIN // 2,
        ],
        outline=BORDER_COLOR,
        width=BORDER_WIDTH,
    )

    footer_top = height - MARGIN - FOOTER_HEIGHT
    image_top = MARGIN
    image_bottom = footer_top - GAP
    image_height = max(1, image_bottom - image_top)
    slot_width = int((width - 2 * MARGIN - 2 * GAP) / 3)

    for idx in range(3):
        x0 = int(MARGIN + idx * (slot_width + GAP))
        x1 = x0 + slot_width
        y0 = image_top
        y1 = image_bottom
        draw.rectangle([x0, y0, x1, y1], outline=BORDER_COLOR, width=SLOT_BORDER_WIDTH)

        if idx < len(spec.images):
            img_spec = spec.images[idx]
            prepared = _prepare_image_for_slot(
                Path(img_spec.path),
                img_spec.timestamp,
                slot_width - 16,
                image_height - 16,
            )
            paste_x = x0 + 8 + (slot_width - 16 - prepared.width) // 2
            paste_y = y0 + 8 + (image_height - 16 - prepared.height) // 2
            page.paste(prepared, (paste_x, paste_y))

    # Footer box
    draw.rectangle(
        [MARGIN, footer_top, width - MARGIN, height - MARGIN],
        outline=BORDER_COLOR,
        width=SLOT_BORDER_WIDTH,
    )

    column_width = int((width - 2 * MARGIN) / 3)
    for col in range(1, 3):
        x = MARGIN + column_width * col
        draw.line([x, footer_top, x, height - MARGIN], fill=BORDER_COLOR, width=3)

    title_font = _load_font(42)
    body_font = _load_font(36)
    small_font = _load_font(28)

    date_text = f"Date: {_format_dt(spec.page_date)}"
    ticket_text = f"Ticket Title: {spec.ticket_title}"
    checklist_text = f"Checklist Item: {spec.checklist_title}"
    page_text = f"Page {page_number} of {total_pages}"

    draw.text((MARGIN + 18, footer_top + 20), date_text, font=title_font, fill=BORDER_COLOR)
    draw.text((MARGIN + column_width + 18, footer_top + 20), ticket_text, font=body_font, fill=BORDER_COLOR)
    draw.text((MARGIN + 2 * column_width + 18, footer_top + 20), checklist_text, font=body_font, fill=BORDER_COLOR)

    page_text_w = draw.textbbox((0, 0), page_text, font=small_font)[2]
    draw.text(
        (width - MARGIN - page_text_w - 18, height - MARGIN - 44),
        page_text,
        font=small_font,
        fill=BORDER_COLOR,
    )

    return page


def _load_ticket_for_pdf(session: Session, ticket_ref: str | int) -> Ticket | None:
    base = (
        session.query(Ticket)
        .options(
            selectinload(Ticket.template),
            selectinload(Ticket.checklist_statuses).selectinload(TicketChecklistStatus.checklist_item),
            selectinload(Ticket.checklist_statuses).selectinload(TicketChecklistStatus.attachments),
        )
    )
    ticket = None
    if isinstance(ticket_ref, int) or str(ticket_ref).isdigit():
        ticket = base.filter(Ticket.id == int(ticket_ref)).one_or_none()
    if ticket is None:
        ticket = base.filter(Ticket.uuid == str(ticket_ref)).one_or_none()
    return ticket


def generate_ticket_pdf_for_ticket(ticket_ref: str | int, submitted_by: str | None = None) -> Attachment | None:
    session = get_session()
    try:
        ticket = _load_ticket_for_pdf(session, ticket_ref)
        if ticket is None:
            return None

        pages = _collect_pages(ticket)
        if not pages:
            return None

        rendered_pages = [
            _render_page(spec, idx + 1, len(pages)) for idx, spec in enumerate(pages)
        ]

        file_name = f"ticket_{ticket.uuid}.pdf"
        file_path = PDF_DIR / file_name
        rendered_pages[0].save(
            file_path,
            "PDF",
            save_all=True,
            append_images=rendered_pages[1:],
            resolution=300,
        )

        attachment = (
            session.query(Attachment)
            .filter(
                Attachment.ticket_id == ticket.id,
                Attachment.mime_type == "application/pdf",
                Attachment.description == "ticket_pdf",
            )
            .one_or_none()
        )
        if attachment is None:
            attachment = Attachment(
                ticket_id=ticket.id,
                template_id=ticket.template_id,
                file_path=str(file_path),
                file_name=file_name,
                mime_type="application/pdf",
                description="ticket_pdf",
                uploaded_by=submitted_by,
            )
            session.add(attachment)
        else:
            attachment.file_path = str(file_path)
            attachment.file_name = file_name
            attachment.uploaded_by = submitted_by or attachment.uploaded_by
            attachment.uploaded_at = datetime.now(timezone.utc)

        session.commit()
        session.refresh(attachment)
        return attachment
    finally:
        session.close()
