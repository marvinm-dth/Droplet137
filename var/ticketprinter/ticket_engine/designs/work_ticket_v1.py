"""
Work Ticket Design v1 for Dragon Tiny Homes.

This module defines ONE visual "design template" for work tickets.
It is intended to be reused by many different business ticket templates.

Conceptual layers for this design:

- DESIGN STATIC (hard-coded here, never changes per template/job):
  * Overall layout: boxes, lines, spacing, coordinates.
  * Bilingual labels like "WORK TICKET", "DTH", "Name / 姓名",
    "Job Type / 工作类型", "Notes (English)", "备注 (中文)",
    "Image Reference / 图片参考", "Checklist / 检查清单", "Signature / 签名".
  * Brand header "DRAGON TINY HOMES".

- TEMPLATE STATIC (changes when you create a new ticket template,
  but is fixed for that template):
  * template_code       -> the "work ticket number" printed in the box
                            next to WORK TICKET (e.g. "1045").
  * job_type_en         -> job type in English (e.g. "Framing").
  * job_type_cn         -> job type in Chinese (e.g. "框架施工").
  * checklist_items     -> list of checklist items, each with English
                            and Chinese text (e.g. [{"en": "...", "cn": "..."}]).

- INSTANCE DYNAMIC (filled in each time you print a ticket instance):
  * dth_number          -> DTH# value (big box row).
  * name                -> worker/customer name to show in Name box.
  * notes_en            -> notes in English.
  * notes_cn            -> notes in Chinese.
  * image_paths         -> optional list of image file paths to paste
                            into the Image Reference section.

API CONTRACT
============

DESIGN_ID = "work_ticket_v1"

Slots expected by this design:

    slots = {
        # TEMPLATE STATIC
        "template_code": str,          # e.g. "1045"
        "job_type_en": str,            # e.g. "Framing"
        "job_type_cn": str,            # e.g. "框架施工"
        "checklist_items": List[Dict], # each: {"en": <str>, "cn": <str>}

        # INSTANCE DYNAMIC
        "dth_number": str,             # e.g. "123"
        "name": str,                   # e.g. "John Smith"
        "notes_en": str,               # long English text
        "notes_cn": str,               # long Chinese text
        "image_paths": Optional[List[str]],  # optional; if None we auto-scan
    }

Functions:

    get_design_metadata() -> dict
        Returns a description of this design and its slots.
        Useful for your web GUI/editor.

    render_ticket(slots: dict, printer_width: int = PRINTER_WIDTH) -> Image.Image
        Renders a ticket image using the given slot values.
        Used for both preview and printing.

    render_sample_ticket() -> Image.Image
        Renders this design with example slot values so you can preview
        the layout without having real template/instance data yet.
"""

import os
from typing import List, Optional, Dict, Any

from PIL import Image, ImageDraw, ImageFont
import qrcode

DESIGN_ID = "work_ticket_v1"

# Width of your printer in pixels (common for 80mm)
PRINTER_WIDTH = 576


# ---------- Font helpers ----------

def _load_font_english(size: int, bold: bool = False):
    """Load a Latin font (keeps English looking consistent)."""
    path = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    )
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def _load_font_chinese(size: int, bold: bool = False):
    """
    Load a CJK-capable font for Chinese text.
    Picks common Noto/WenQuanYi paths; extend if your system differs.
    """
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Bold.otf"
        if bold
        else "/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _line_height(font: ImageFont.ImageFont) -> int:
    """Approximate line height for consistent spacing."""
    bbox = font.getbbox("Hg")
    return bbox[3] - bbox[1]


def _wrap_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.ImageFont,
    max_width: int,
) -> List[str]:
    """Return a list of wrapped lines that fit within max_width."""
    if not text:
        return []

    use_spaces = " " in text.strip()
    if use_spaces:
        tokens = text.split()
        joiner = " "
    else:
        tokens = list(text.strip())
        joiner = ""

    if not tokens:
        return []

    lines: List[str] = []
    current = tokens[0]
    for token in tokens[1:]:
        trial = current + (joiner + token if joiner else token)
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = trial
        else:
            lines.append(current)
            current = token

    lines.append(current)
    return lines


def _gather_reference_images(
    inner_width: int,
    image_paths: Optional[List[str]] = None,
) -> List[dict]:
    """
    Collect image paths that should be referenced on the ticket.

    - If image_paths is provided, use those paths.
    - Otherwise, auto-scan the current directory for "job*.png/jpg/jpeg/bmp".
    """
    refs: List[dict] = []

    # If explicit paths are provided, use them.
    if image_paths:
        for path in image_paths:
            try:
                with Image.open(path) as img:
                    width, height = img.size
            except Exception:
                continue
            if width <= 0 or height <= 0:
                continue
            if width != inner_width:
                scale = inner_width / float(width)
                height = max(1, int(height * scale))
            refs.append({"path": path, "height": height})
        return refs

    # Fallback: auto-scan for images named like job*.png in this directory
    base_dir = os.path.dirname(__file__)
    if not os.path.isdir(base_dir):
        return refs
    for fname in sorted(os.listdir(base_dir)):
        lower = fname.lower()
        if not lower.startswith("job"):
            continue
        if not lower.endswith((".png", ".jpg", ".jpeg", ".bmp")):
            continue
        path = os.path.join(base_dir, fname)
        try:
            with Image.open(path) as img:
                width, height = img.size
        except Exception:
            continue
        if width <= 0 or height <= 0:
            continue
        if width != inner_width:
            scale = inner_width / float(width)
            height = max(1, int(height * scale))
        refs.append({"path": path, "height": height})
    return refs


def _create_fonts() -> Dict[str, ImageFont.ImageFont]:
    """Build the font palette for English and Chinese sections."""
    return {
        "brand_en": _load_font_english(46, bold=True),
        "title_en": _load_font_english(34, bold=True),
        "ticket_num": _load_font_english(28, bold=True),
        "dth_num": _load_font_english(54, bold=True),
        "section_en": _load_font_english(36, bold=True),
        "body_en": _load_font_english(27, bold=False),
        "section_cn": _load_font_chinese(33, bold=True),
        "body_cn": _load_font_chinese(27, bold=False),
        "check_en": _load_font_english(30, bold=False),
        "check_cn": _load_font_chinese(33, bold=False),
        "notes_en": _load_font_english(30, bold=False),
        "notes_cn": _load_font_chinese(36, bold=False),
    }


# ---------- Public metadata / API ----------

def get_design_metadata() -> Dict[str, Any]:
    """
    Describe this design and its slots.
    Useful for your future web GUI/template editor.
    """
    return {
        "design_id": DESIGN_ID,
        "description": "Work ticket layout with DTH#, name, job type, bilingual notes, images, checklist, and signature.",
        "slots": [
            # TEMPLATE STATIC
            {
                "id": "template_code",
                "label": "Work ticket code",
                "scope": "template",
                "type": "text",
                "description": "Code printed in the box next to WORK TICKET (e.g. 1045).",
            },
            {
                "id": "job_type_en",
                "label": "Job type (English)",
                "scope": "template",
                "type": "text",
                "description": "Job type shown in the Job Type section (English).",
            },
            {
                "id": "job_type_cn",
                "label": "Job type (Chinese)",
                "scope": "template",
                "type": "text",
                "description": "Job type shown in the Job Type section (Chinese).",
            },
            {
                "id": "checklist_items",
                "label": "Checklist items (bilingual)",
                "scope": "template",
                "type": "list",
                "item_schema": {"en": "str", "cn": "str"},
                "description": "List of checklist rows; each row has English and Chinese text.",
            },
            # INSTANCE DYNAMIC
            {
                "id": "dth_number",
                "label": "DTH number",
                "scope": "instance",
                "type": "text",
                "description": "DTH# value shown in the large row below the header.",
            },
            {
                "id": "name",
                "label": "Name",
                "scope": "instance",
                "type": "text",
                "description": "Name value shown in the Name/姓名 box.",
            },
            {
                "id": "notes_en",
                "label": "Notes (English)",
                "scope": "instance",
                "type": "multiline_text",
                "description": "Long English notes in the Notes (English) box.",
            },
            {
                "id": "notes_cn",
                "label": "Notes (Chinese)",
                "scope": "instance",
                "type": "multiline_text",
                "description": "Long Chinese notes in the 备注 (中文) box.",
            },
            {
                "id": "image_paths",
                "label": "Image file paths",
                "scope": "instance",
                "type": "list",
                "description": "Optional list of image file paths to paste in the Image Reference section.",
            },
        ],
    }


# ---------- Public rendering functions ----------

def render_ticket(slots: Dict[str, Any], printer_width: int = PRINTER_WIDTH) -> Image.Image:
    """
    Render this design to an image using the provided slot values.

    slots must contain the keys described in the module docstring / get_design_metadata().
    Missing keys will fall back to empty strings or sample defaults where possible.
    """
    fonts = _create_fonts()

    # First pass: measure height
    probe_height = 5000
    probe_img = Image.new("L", (printer_width, probe_height), 255)
    probe_draw = ImageDraw.Draw(probe_img)
    final_y = _render_ticket_layout(
        draw=probe_draw,
        fonts=fonts,
        base_img=None,
        slots=slots,
        printer_width=printer_width,
    )

    img_height = final_y + 10
    img = Image.new("L", (printer_width, img_height), 255)
    draw = ImageDraw.Draw(img)
    _render_ticket_layout(
        draw=draw,
        fonts=fonts,
        base_img=img,
        slots=slots,
        printer_width=printer_width,
    )
    return img


def render_sample_ticket() -> Image.Image:
    """
    Render a sample ticket image using example slot values.

    This is used for preview while you are still building out the
    template system. Later, your template engine will call render_ticket()
    with real slot values.
    """
    example_slots: Dict[str, Any] = {
        # TEMPLATE STATIC
        "template_code": "1045",
        "job_type_en": "Framing",
        "job_type_cn": "框架施工",
        "checklist_items": [
            {"en": "Confirm lumber on-site", "cn": "确认木料到场"},
            {"en": "Verify wall layout", "cn": "核对墙体定位"},
            {"en": "Check stud spacing", "cn": "检查立柱间距"},
            {
                "en": "Document any deviations from approved engineering drawings and obtain supervisor sign-off before proceeding with crew",
                "cn": "记录与图纸不同的内容并在继续前取得主管签字",
            },
            {"en": "Verify openings marked", "cn": "确认门窗洞口标识"},
            {"en": "Confirm header sizes", "cn": "核对过梁尺寸"},
            {"en": "Review anchor locations", "cn": "检查地脚螺栓位置"},
            {"en": "Install blocking as needed", "cn": "按需安装阻挡块"},
            {"en": "Square first wall", "cn": "校正第一面墙的方正"},
            {"en": "Inspect for plumb and level", "cn": "检查垂直与水平"},
        ],
        # INSTANCE DYNAMIC (example)
        "dth_number": "123",
        "name": "John Smith",
        "notes_en": (
            "Framing crew installed perimeter walls, verified anchor bolt locations, and staged the next bundle "
            "of kiln-dried studs for interior partitions. Remaining work includes blocking at window heads, "
            "confirming truss hangers, and cleaning the work zone so electricians can begin routing conduits "
            "without delays. Coordinate material deliveries with warehouse to maintain momentum."
        ),
        "notes_cn": (
            "框架队完成外围墙体、检查地脚螺栓并堆放下一批烘干立柱。仍需在窗头加阻挡、确认桁架吊件、"
            "清理工作区，让电工顺利铺设管线并与仓库协调补料。"
        ),
        "image_paths": None,  # or e.g. ["./job1.png", "./job2.png"]
        "qr_data": "https://example.com/api/tickets/123/full",
    }
    return render_ticket(example_slots, printer_width=PRINTER_WIDTH)


# ---------- Internal layout renderer ----------

def _render_ticket_layout(
    draw: ImageDraw.ImageDraw,
    fonts: Dict[str, ImageFont.ImageFont],
    base_img: Optional[Image.Image],
    slots: Dict[str, Any],
    printer_width: int,
) -> int:
    """
    Draw the ticket layout using fonts and slot values.
    Returns the final vertical position (y) after drawing.
    """
    y = 10
    box_margin = 18

    # Helpers for slot values with defaults
    template_code = str(slots.get("template_code", "") or "")
    dth_value = str(slots.get("dth_number", "") or "")
    name_value = str(slots.get("name", "") or "")
    job_type_en = str(slots.get("job_type_en", "") or "")
    job_type_cn = str(slots.get("job_type_cn", "") or "")
    notes_en = str(slots.get("notes_en", "") or "")
    notes_cn = str(slots.get("notes_cn", "") or "")
    image_paths: Optional[List[str]] = slots.get("image_paths")
    qr_data = str(slots.get("qr_data", "") or "")

    # Checklist items: list of {"en": "...", "cn": "..."}
    checklist_items_raw = slots.get("checklist_items") or []
    checklist_items: List[Dict[str, str]] = []
    for item in checklist_items_raw:
        if isinstance(item, dict):
            checklist_items.append(
                {
                    "en": str(item.get("en", "") or ""),
                    "cn": str(item.get("cn", "") or ""),
                }
            )
        else:
            # If item is just a string, treat it as English-only
            checklist_items.append({"en": str(item), "cn": ""})

    # Fallback sample checklist if none provided
    if not checklist_items:
        checklist_items = [
            {"en": "Confirm lumber on-site", "cn": "确认木料到场"},
            {"en": "Verify wall layout", "cn": "核对墙体定位"},
        ]

    # ----- HEADER (DESIGN STATIC) -----
    header_text = "DRAGON TINY HOMES"
    draw.text(
        (printer_width // 2, y),
        header_text,
        font=fonts["brand_en"],
        fill=0,
        anchor="mt",
    )
    y += _line_height(fonts["brand_en"]) + 10

    # ----- TITLE WITH NUMBER BOX (DESIGN STATIC + TEMPLATE STATIC) -----
    title_text = "WORK TICKET"
    title_bbox = draw.textbbox((0, 0), title_text, font=fonts["title_en"])
    title_width = title_bbox[2] - title_bbox[0]
    title_height = _line_height(fonts["title_en"])

    ticket_number = template_code  # from template slots
    if not ticket_number:
        ticket_number = ""  # avoid None

    number_bbox = draw.textbbox((0, 0), ticket_number, font=fonts["ticket_num"])
    number_width = number_bbox[2] - number_bbox[0]
    num_box_width = max(number_width + 24, 90)
    num_box_height = title_height + 12
    gap = 14
    total_width = title_width + gap + num_box_width
    start_x = (printer_width - total_width) / 2
    title_y = y

    draw.text((start_x, title_y), title_text, font=fonts["title_en"], fill=0)

    num_box_left = start_x + title_width + gap
    num_box_top = title_y - 6
    draw.rectangle(
        (num_box_left, num_box_top, num_box_left + num_box_width, num_box_top + num_box_height),
        outline=0,
        width=2,
    )
    draw.text(
        (num_box_left + num_box_width / 2, num_box_top + num_box_height / 2),
        ticket_number,
        font=fonts["ticket_num"],
        fill=0,
        anchor="mm",
    )

    y = num_box_top + num_box_height + 18

    # ----- HORIZONTAL LINE -----
    draw.line((0, y, printer_width, y), fill=0, width=2)
    y += 8

    # Prepare image refs
    inner_width = printer_width - 2 * box_margin
    image_refs = _gather_reference_images(inner_width, image_paths=image_paths)

    # ----- DTH NUMBER (INSTANCE DYNAMIC) -----
    dth_row_height = 120
    label_padding = 24
    label_text = "DTH"
    label_text_width = draw.textbbox((0, 0), label_text, font=fonts["dth_num"])[2]
    label_width = label_text_width + label_padding * 2
    max_label_width = (printer_width - 2 * box_margin) // 2
    label_width = min(max_label_width, label_width)

    qr_img = None
    qr_size = 110
    qr_gap = 12
    if qr_data:
        try:
            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_Q,
                box_size=6,
                border=1,
            )
            qr.add_data(qr_data)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white").convert("L")
            qr_img = qr_img.resize((qr_size, qr_size))
        except Exception:
            qr_img = None

    draw.rectangle(
        (box_margin, y, box_margin + label_width, y + dth_row_height),
        outline=0,
        width=2,
    )
    draw.rectangle(
        (box_margin + 1, y + 1, box_margin + label_width - 1, y + dth_row_height - 1),
        fill=0,
    )
    draw.text(
        (box_margin + label_width / 2, y + dth_row_height / 2),
        label_text,
        font=fonts["dth_num"],
        fill=255,
        anchor="mm",
    )

    value_padding = 30
    _ = value_padding  # currently unused but kept for clarity
    dth_box_left = box_margin + label_width
    qr_slot_width = (qr_size + qr_gap) if qr_img is not None else 0
    dth_box_width = printer_width - box_margin - dth_box_left - qr_slot_width
    draw.rectangle(
        (dth_box_left, y, dth_box_left + dth_box_width, y + dth_row_height),
        outline=0,
        width=2,
    )
    draw.text(
        (dth_box_left + dth_box_width / 2, y + dth_row_height / 2),
        dth_value,
        font=fonts["dth_num"],
        fill=0,
        anchor="mm",
    )

    if qr_img is not None and base_img is not None:
        qr_x = dth_box_left + dth_box_width + qr_gap
        qr_y = y + (dth_row_height - qr_size) / 2
        base_img.paste(qr_img, (int(qr_x), int(qr_y)))
        draw.rectangle(
            (qr_x, qr_y, qr_x + qr_size, qr_y + qr_size),
            outline=0,
            width=2,
        )

    y += dth_row_height

    # ----- NAME BOX (INSTANCE DYNAMIC) -----
    name_header_height = _line_height(fonts["section_en"]) + 12
    name_body_padding = 14
    name_lines = _wrap_text(
        draw,
        name_value,
        fonts["section_en"],
        printer_width - 2 * box_margin - name_body_padding * 2,
    )
    if not name_lines:
        name_lines = [""]

    line_step_name = _line_height(fonts["section_en"]) + 6
    name_body_height = name_body_padding * 2 + len(name_lines) * line_step_name
    name_box_height = name_header_height + name_body_height
    draw.rectangle(
        (box_margin, y, printer_width - box_margin, y + name_box_height),
        outline=0,
        width=2,
    )
    draw.rectangle(
        (box_margin + 1, y + 1, printer_width - box_margin - 1, y + name_header_height - 1),
        fill=0,
    )
    header_x = box_margin + 14
    draw.text(
        (header_x, y + name_header_height / 2),
        "Name",
        font=fonts["section_en"],
        fill=255,
        anchor="lm",
    )
    header_width = draw.textbbox((0, 0), "Name", font=fonts["section_en"])[2]
    draw.text(
        (header_x + header_width + 16, y + name_header_height / 2),
        "姓名",
        font=fonts["section_cn"],
        fill=255,
        anchor="lm",
    )
    body_top = y + name_header_height + name_body_padding
    for line in name_lines:
        draw.text((box_margin + name_body_padding, body_top), line, font=fonts["section_en"], fill=0)
        body_top += line_step_name
    y += name_box_height

    # ----- JOB TYPE (TEMPLATE STATIC) -----
    body_padding = 12
    english_lines = _wrap_text(
        draw,
        job_type_en,
        fonts["section_en"],
        printer_width - 2 * box_margin - body_padding * 2,
    )
    chinese_lines = _wrap_text(
        draw,
        job_type_cn,
        fonts["body_cn"],
        printer_width - 2 * box_margin - body_padding * 2,
    )
    if not english_lines:
        english_lines = [""]
    if not chinese_lines:
        chinese_lines = [""]

    line_step_en = _line_height(fonts["section_en"]) + 4
    line_step_cn = _line_height(fonts["body_cn"]) + 2
    body_height = (
        body_padding * 2
        + len(english_lines) * line_step_en
        + 4
        + len(chinese_lines) * line_step_cn
    )

    header_base_height = _line_height(fonts["section_en"]) + 12
    chinese_header = "工作类型"
    header_cn_width = draw.textbbox((0, 0), chinese_header, font=fonts["section_cn"])[2]
    header_x = box_margin + 14
    header_width_en = draw.textbbox((0, 0), "Job Type", font=fonts["section_en"])[2]
    header_right_bound = printer_width - box_margin - 14
    header_cn_x = header_x + header_width_en + 16
    same_line = header_cn_x + header_cn_width <= header_right_bound

    if same_line:
        header_height = header_base_height
        header_cn_y = y + header_height / 2
    else:
        extra_line = _line_height(fonts["section_cn"]) + 6
        header_height = header_base_height + extra_line
        header_cn_y = y + header_base_height + extra_line / 2
        header_cn_x = header_x
    job_box_height = header_height + body_height

    draw.rectangle(
        (box_margin, y, printer_width - box_margin, y + job_box_height),
        outline=0,
        width=2,
    )
    draw.rectangle(
        (box_margin + 1, y + 1, printer_width - box_margin - 1, y + header_height - 1),
        fill=0,
    )
    draw.text(
        (header_x, y + header_base_height / 2),
        "Job Type",
        font=fonts["section_en"],
        fill=255,
        anchor="lm",
    )
    draw.text(
        (header_cn_x, header_cn_y),
        chinese_header,
        font=fonts["section_cn"],
        fill=255,
        anchor="lm",
    )

    current_y = y + header_height + body_padding
    for line in english_lines:
        draw.text((box_margin + body_padding, current_y), line, font=fonts["section_en"], fill=0)
        current_y += line_step_en
    current_y += 4
    for line in chinese_lines:
        draw.text((box_margin + body_padding, current_y), line, font=fonts["body_cn"], fill=0)
        current_y += line_step_cn

    y += job_box_height + 36

    # ----- NOTES BOXES (INSTANCE DYNAMIC) -----
    notes_width = printer_width - 2 * box_margin
    notes_padding = 14
    text_spacing = 4

    # English notes
    english_lines = _wrap_text(draw, notes_en, fonts["notes_en"], notes_width - 2 * notes_padding)
    en_line_step = _line_height(fonts["notes_en"]) + text_spacing
    header_height_en = _line_height(fonts["section_en"]) + notes_padding
    english_box_height = header_height_en + 8 + len(english_lines) * en_line_step + notes_padding
    english_box = (box_margin, y, printer_width - box_margin, y + english_box_height)
    draw.rectangle(english_box, outline=0, width=2)
    header_top = english_box[1] + 1
    header_bottom = header_top + header_height_en - 2
    draw.rectangle(
        (english_box[0] + 1, header_top, english_box[2] - 1, header_bottom),
        fill=0,
    )
    draw.text(
        (english_box[0] + notes_padding, header_top + header_height_en / 2),
        "Notes (English)",
        font=fonts["section_en"],
        fill=255,
        anchor="lm",
    )
    text_y = english_box[1] + header_height_en + 8
    for line in english_lines:
        draw.text((english_box[0] + notes_padding, text_y), line, font=fonts["notes_en"], fill=0)
        text_y += en_line_step

    y = english_box[3]

    # Chinese notes
    chinese_lines = _wrap_text(draw, notes_cn, fonts["notes_cn"], notes_width - 2 * notes_padding)
    cn_line_step = _line_height(fonts["notes_cn"]) + text_spacing
    header_height_cn = _line_height(fonts["section_cn"]) + notes_padding
    chinese_box_height = header_height_cn + 8 + len(chinese_lines) * cn_line_step + notes_padding
    chinese_box = (box_margin, y, printer_width - box_margin, y + chinese_box_height)
    draw.rectangle(chinese_box, outline=0, width=2)
    header_top = chinese_box[1] + 1
    header_bottom = header_top + header_height_cn - 2
    draw.rectangle(
        (chinese_box[0] + 1, header_top, chinese_box[2] - 1, header_bottom),
        fill=0,
    )
    draw.text(
        (chinese_box[0] + notes_padding, header_top + header_height_cn / 2),
        "备注 (中文)",
        font=fonts["section_cn"],
        fill=255,
        anchor="lm",
    )
    text_y = chinese_box[1] + header_height_cn + 8
    for line in chinese_lines:
        draw.text((chinese_box[0] + notes_padding, text_y), line, font=fonts["notes_cn"], fill=0)
        text_y += cn_line_step

    y = chinese_box[3] + 34

    # ----- IMAGE REFERENCE SECTION (INSTANCE DYNAMIC / AUTO-SCAN) -----
    if image_refs:
        header_height_img = _line_height(fonts["section_en"]) + 12
        img_padding = 12
        section_height = header_height_img
        for ref in image_refs:
            section_height += img_padding + ref["height"]
        section_height += img_padding

        img_box = (box_margin, y, printer_width - box_margin, y + section_height)
        draw.rectangle(img_box, outline=0, width=2)
        draw.rectangle(
            (img_box[0] + 1, img_box[1] + 1, img_box[2] - 1, img_box[1] + header_height_img - 1),
            fill=0,
        )
        header_x = img_box[0] + 12
        draw.text(
            (header_x, img_box[1] + header_height_img / 2),
            "Image Reference",
            font=fonts["section_en"],
            fill=255,
            anchor="lm",
        )
        header_width_en = draw.textbbox((0, 0), "Image Reference", font=fonts["section_en"])[2]
        draw.text(
            (header_x + header_width_en + 16, img_box[1] + header_height_img / 2),
            "图片参考",
            font=fonts["section_cn"],
            fill=255,
            anchor="lm",
        )

        current_y = img_box[1] + header_height_img + img_padding
        inner_left = img_box[0] + 1
        for ref in image_refs:
            if base_img is not None:
                try:
                    with Image.open(ref["path"]) as loaded:
                        job_img = loaded.convert("L")
                    job_img = job_img.resize((inner_width, ref["height"]))

                    base_img.paste(job_img, (inner_left, current_y))
                except Exception:
                    pass
            current_y += ref["height"] + img_padding
        y = img_box[3] + 30

    # ----- CHECKLIST SECTION (TEMPLATE STATIC + INSTANCE CHECKBOXES) -----
    draw.text((box_margin, y), "Checklist", font=fonts["section_en"], fill=0)
    checklist_width_en = draw.textbbox((0, 0), "Checklist", font=fonts["section_en"])[2]
    draw.text(
        (
            box_margin + checklist_width_en + 12,
            y + (_line_height(fonts["section_en"]) - _line_height(fonts["check_cn"])) / 2,
        ),
        "检查清单",
        font=fonts["check_cn"],
        fill=0,
    )
    y += max(_line_height(fonts["section_en"]), _line_height(fonts["check_cn"])) + 18

    checkbox_size = 36
    text_start_x = box_margin + 52
    max_text_width = (
        printer_width - box_margin - checkbox_size - 30 - text_start_x
    )
    line_step_en = _line_height(fonts["check_en"]) + 4
    line_step_cn = _line_height(fonts["check_cn"]) + 2

    for idx, item in enumerate(checklist_items, start=1):
        eng = item.get("en", "")
        zh = item.get("cn", "")

        row_start_y = y
        if idx > 1:
            draw.line(
                (box_margin, row_start_y - 6, printer_width - box_margin, row_start_y - 6),
                fill=0,
                width=1,
            )

        draw.text((box_margin, row_start_y), f"{idx}.", font=fonts["check_en"], fill=0)

        english_lines = _wrap_text(draw, eng, fonts["check_en"], max_text_width)
        chinese_lines = _wrap_text(draw, zh, fonts["check_cn"], max_text_width)

        text_y = row_start_y
        for line in english_lines:
            draw.text((text_start_x, text_y), line, font=fonts["check_en"], fill=0)
            text_y += line_step_en

        text_y += 2
        for line in chinese_lines:
            draw.text((text_start_x, text_y), line, font=fonts["check_cn"], fill=0)
            text_y += line_step_cn

        text_y += 6
        row_height = max(text_y - row_start_y, checkbox_size)
        box_x = printer_width - box_margin - checkbox_size
        box_y = row_start_y + 4
        draw.rectangle(
            (box_x, box_y, box_x + checkbox_size, box_y + checkbox_size),
            outline=0,
            width=2,
        )

        y = row_start_y + row_height + 12

    y += 12

    # ----- SIGNATURE (DESIGN STATIC) -----
    signature_top = y
    draw.text((box_margin, signature_top), "Signature", font=fonts["section_en"], fill=0)
    draw.text((box_margin, signature_top + 34), "签名", font=fonts["section_cn"], fill=0)
    signature_box_top = signature_top + 74
    signature_box_height = 76
    draw.rectangle(
        (box_margin, signature_box_top, printer_width - box_margin, signature_box_top + signature_box_height),
        outline=0,
        width=2,
    )
    y = signature_box_top + signature_box_height + 30

    # Extra tail so the printer feeds enough paper before cutting
    y += 75


    return y
