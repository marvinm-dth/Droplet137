"""
Storage helpers for work_ticket_v1 templates.

Each template is persisted as a JSON document inside TEMPLATES_DIR. This module
exposes a minimal CRUD surface to list metadata, load full template data, save
updates, and delete templates.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

TEMPLATES_DIR = Path(__file__).parent


def _current_iso_timestamp() -> str:
    """Return the current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def list_templates() -> List[Dict[str, Any]]:
    """
    Return metadata for every template file under TEMPLATES_DIR.

    Each dictionary contains the minimal identifying fields required by the
    caller (template_id, name, design_id, updated_at). Raises json.JSONDecodeError
    if any existing template file cannot be parsed.
    """

    if not TEMPLATES_DIR.exists():
        return []

    templates: List[Dict[str, Any]] = []
    for path in sorted(TEMPLATES_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        templates.append(
            {
                "template_id": data["template_id"],
                "name": data["name"],
                "design_id": data["design_id"],
                "updated_at": data["updated_at"],
            }
        )
    return templates


def load_template(template_id: str) -> Dict[str, Any]:
    """
    Load and return the full template payload for the provided template_id.

    Raises FileNotFoundError if the expected template JSON file does not exist.
    """

    template_path = TEMPLATES_DIR / f"{template_id}.json"
    data = template_path.read_text(encoding="utf-8")
    return json.loads(data)


def save_template(data: Dict[str, Any]) -> None:
    """
    Persist a template definition to disk.

    The input must include template_id and design_id. The function manages
    created_at/updated_at timestamps automatically and writes JSON with UTF-8
    encoding. Raises ValueError if required keys are missing.
    """

    template_id = data.get("template_id")
    design_id = data.get("design_id")
    if not template_id:
        raise ValueError("template_id is required")
    if not design_id:
        raise ValueError("design_id is required")

    payload = dict(data)
    timestamp = _current_iso_timestamp()
    payload.setdefault("created_at", timestamp)
    payload["updated_at"] = timestamp

    TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    template_path = TEMPLATES_DIR / f"{template_id}.json"
    template_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def delete_template(template_id: str) -> None:
    """
    Delete the JSON file for the specified template_id.

    This is a no-op if the file does not exist.
    """

    template_path = TEMPLATES_DIR / f"{template_id}.json"
    if template_path.exists():
        template_path.unlink()
