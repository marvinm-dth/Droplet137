"""
Seed the database with required design metadata.

This script is idempotent: re-running it will not create duplicate rows.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.models import Design, DB_PATH, get_session, init_db  # noqa: E402


def main() -> None:
    init_db()
    session = get_session()
    try:
        existing = session.query(Design).filter_by(design_id="work_ticket_v1").one_or_none()
        if existing is None:
            design = Design(
                design_id="work_ticket_v1",
                name="Work Ticket Layout v1",
                module_path="ticket_engine.designs.work_ticket_v1",
                description="Work ticket layout v1 for framing/field tasks.",
                is_active=True,
            )
            session.add(design)
            session.commit()
            print("Inserted design work_ticket_v1")
        else:
            print("Design work_ticket_v1 already exists")
    finally:
        session.close()
    print(f"Database path: {DB_PATH}")


if __name__ == "__main__":
    main()
