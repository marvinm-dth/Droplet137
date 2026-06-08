"""
Ticket Tracking Design v1 (standalone)

Compact tracking ticket that mirrors only the top portion of the work ticket:
- Header: DRAGON TINY HOMES + JOB TRACKING TICKET (no number box).
- DTH row.
- Name row.
- Job Type row (EN + CN).
No notes, checklist, signature, or images.
"""
from __future__ import annotations

from typing import Dict, Any
from PIL import Image, ImageDraw, ImageFont

from ticket_engine.designs.work_ticket_v1 import (
    PRINTER_WIDTH,
    _load_font_english,
    _load_font_chinese,
)

DESIGN_ID = "ticket_tracking_v1"


def _line_height(font: ImageFont.ImageFont) -> int:
    bbox = font.getbbox("Hg")
    return bbox[3] - bbox[1]


def _fonts() -> Dict[str, ImageFont.ImageFont]:
    return {
        "brand": _load_font_english(46, bold=True),
        "title": _load_font_english(38, bold=True),
        "dth": _load_font_english(54, bold=True),
        "label": _load_font_english(30, bold=True),
        "label_cn": _load_font_chinese(28, bold=True),
        "value": _load_font_english(30, bold=True),
        "value_cn": _load_font_chinese(28, bold=False),
    }


def render_ticket(slots: Dict[str, Any], printer_width: int = PRINTER_WIDTH) -> Image.Image:
    fonts = _fonts()
    img_height = 520 + 75  # add extra padding at bottom for printing
    img = Image.new("L", (printer_width, img_height), 255)
    draw = ImageDraw.Draw(img)

    y = 12
    # Header
    draw.text((printer_width // 2, y), "DRAGON TINY HOMES", font=fonts["brand"], fill=0, anchor="mt")
    y += _line_height(fonts["brand"]) + 10
    draw.text((printer_width // 2, y), "JOB TRACKING TICKET", font=fonts["title"], fill=0, anchor="mt")
    y += _line_height(fonts["title"]) + 14
    draw.line((0, y, printer_width, y), fill=0, width=2)
    y += 10

    box_margin = 18
    # DTH row
    dth_row_h = 120
    label_text = "DTH"
    label_w = min((printer_width - 2 * box_margin) // 2, _text_width(draw, label_text, fonts["dth"]) + 48)
    draw.rectangle((box_margin, y, box_margin + label_w, y + dth_row_h), outline=0, width=2, fill=0)
    draw.text((box_margin + label_w / 2, y + dth_row_h / 2), label_text, font=fonts["dth"], fill=255, anchor="mm")
    draw.rectangle((box_margin + label_w, y, printer_width - box_margin, y + dth_row_h), outline=0, width=2, fill=255)
    draw.text((box_margin + label_w + (printer_width - box_margin - (box_margin + label_w)) / 2, y + dth_row_h / 2),
              str(slots.get("dth_number", "") or ""), font=fonts["dth"], fill=0, anchor="mm")
    y += dth_row_h + 12

    # Name row
    name_label_h = _line_height(fonts["label"]) + 12
    draw.rectangle((box_margin, y, printer_width - box_margin, y + name_label_h), outline=0, width=2, fill=0)
    draw.text((box_margin + 8, y + 6), "Name ", font=fonts["label"], fill=255)
    en_w = _text_width(draw, "Name ", fonts["label"])
    draw.text((box_margin + 8 + en_w, y + 6), "姓名", font=fonts["label_cn"], fill=255)
    y += name_label_h
    val_h = _line_height(fonts["value"]) + 18
    draw.rectangle((box_margin, y, printer_width - box_margin, y + val_h), outline=0, width=2, fill=255)
    draw.text((box_margin + 8, y + 10), str(slots.get("name", "") or ""), font=fonts["value"], fill=0)
    y += val_h + 8

    # Job Type row
    jt_label_h = _line_height(fonts["label"]) + 12
    draw.rectangle((box_margin, y, printer_width - box_margin, y + jt_label_h), outline=0, width=2, fill=0)
    draw.text((box_margin + 8, y + 6), "Job Type ", font=fonts["label"], fill=255)
    jt_en_w = _text_width(draw, "Job Type ", fonts["label"])
    draw.text((box_margin + 8 + jt_en_w, y + 6), "工作类型", font=fonts["label_cn"], fill=255)
    y += jt_label_h
    jt_val_h = _line_height(fonts["value"]) + _line_height(fonts["value_cn"]) + 16
    draw.rectangle((box_margin, y, printer_width - box_margin, y + jt_val_h), outline=0, width=2, fill=255)
    draw.text((box_margin + 8, y + 6), str(slots.get("job_type_en", "") or ""), font=fonts["value"], fill=0)
    draw.text((box_margin + 8, y + 6 + _line_height(fonts["value"]) + 4), str(slots.get("job_type_cn", "") or ""), font=fonts["value_cn"], fill=0)
    y += jt_val_h + 12

    y += 75  # extra blank space
    return img.crop((0, 0, printer_width, y))


def _text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0]


def render_sample_ticket() -> Image.Image:
    slots = {
        "template_code": "1045",
        "dth_number": "123",
        "name": "Tracking Ops",
        "job_type_en": "Tracking",
        "job_type_cn": "跟踪",
    }
    return render_ticket(slots)
