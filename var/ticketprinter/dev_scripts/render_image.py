"""Helper script to spit out the sample ticket image for manual review."""
from __future__ import annotations

from pathlib import Path

from ticket_engine.designs.work_ticket_v1 import render_sample_ticket


def main() -> None:
    reference_dir = Path(__file__).resolve().parent
    output_path = reference_dir / "preview_ticket.png"
    img = render_sample_ticket(reference_dir=reference_dir)
    img.save(output_path)
    print(f"Saved preview to {output_path}")


if __name__ == "__main__":
    main()
