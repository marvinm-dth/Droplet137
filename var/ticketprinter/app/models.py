"""
Database models and helpers for the ticket system.

Uses SQLite (data/app.db) via SQLAlchemy. This module is intentionally
decoupled from Flask extensions to keep it lightweight; callers can create a
Session with `get_session()` and are responsible for closing it.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, text
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker
from sqlalchemy import inspect


def _utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""
    return datetime.now(timezone.utc)


DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", future=True, echo=False)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)

Base = declarative_base()


class Design(Base):
    __tablename__ = "designs"

    id = Column(Integer, primary_key=True)
    design_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    module_path = Column(String(255))
    description = Column(Text)
    is_active = Column(Boolean, default=True, nullable=False)

    templates = relationship("Template", back_populates="design", cascade="all, delete-orphan")
    ticket_designs = relationship("TicketDesign", back_populates="design", cascade="all, delete-orphan")


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True)
    template_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    design_id = Column(String(64), ForeignKey("designs.design_id"), nullable=False, index=True)
    template_code = Column(String(64), nullable=False)
    job_type_en = Column(String(255), nullable=False)
    job_type_cn = Column(String(255), nullable=False)
    default_notes_en = Column(Text)
    default_notes_cn = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    design = relationship("Design", back_populates="templates")
    checklist_items = relationship("ChecklistItem", back_populates="template", cascade="all, delete-orphan", order_by="ChecklistItem.order_index")
    tickets = relationship("Ticket", back_populates="template")
    template_checklist_items = relationship("TemplateChecklistItem", back_populates="template", cascade="all, delete-orphan", order_by="TemplateChecklistItem.order_index")
    work_ticket_meta = relationship("TemplateWorkTicket", back_populates="template", cascade="all, delete-orphan", uselist=False)
    tracking_links = relationship("TemplateTrackingTicket", foreign_keys="TemplateTrackingTicket.base_template_id", back_populates="base_template", cascade="all, delete-orphan")
    tracking_as_target = relationship("TemplateTrackingTicket", foreign_keys="TemplateTrackingTicket.tracking_template_id", back_populates="tracking_template")
    project_links = relationship("ProjectTemplate", back_populates="template", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="template", cascade="all, delete-orphan")


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False, index=True)
    order_index = Column(Integer, default=0, nullable=False)
    text_en = Column(Text, nullable=False)
    text_cn = Column(Text, nullable=False)
    required = Column(Boolean, default=False, nullable=False)
    status = Column(String(64), default="active", nullable=False)

    template = relationship("Template", back_populates="checklist_items")
    ticket_statuses = relationship("TicketChecklistStatus", back_populates="checklist_item")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    project_uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    project_code = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(String(64), nullable=False, default="active")
    job_tickets_uuid = Column(Text)
    tracking_tickets_uuid = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    tickets = relationship("Ticket", back_populates="project")
    template_links = relationship("ProjectTemplate", back_populates="project", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    username = Column(String(128), unique=True, nullable=False, index=True)
    display_name = Column(String(255))
    email = Column(String(255), unique=True, index=True)
    role = Column(String(64), default="user", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    password_hash = Column(String(255))
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    last_seen_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    revoked_at = Column(DateTime(timezone=True))
    ip_address = Column(String(64))
    user_agent = Column(Text)

    user = relationship("User", back_populates="sessions")

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    dth_number = Column(String(64))
    name = Column(String(255))
    ticket_number = Column(Integer)
    ticket_section = Column(String(128))
    ticket_hours = Column(Float)
    logged_hours = Column(Float)
    notes_en = Column(Text)
    notes_cn = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)
    printed_at = Column(DateTime(timezone=True))
    printed_by = Column(String(128))
    status = Column(String(64), default="new", nullable=False)
    tracking_ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True, index=True)
    qr_source_ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True, index=True)
    qr_source_ticket_uuid = Column(String(64), index=True)

    template = relationship("Template", back_populates="tickets")
    project = relationship("Project", back_populates="tickets")
    checklist_statuses = relationship("TicketChecklistStatus", back_populates="ticket", cascade="all, delete-orphan")
    images = relationship("TicketImage", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketImage.order_index")
    designs_override = relationship("TicketDesign", back_populates="ticket", cascade="all, delete-orphan")
    qr_codes = relationship("QrCode", back_populates="ticket", cascade="all, delete-orphan")
    tracking_events = relationship("TicketTracking", back_populates="ticket", cascade="all, delete-orphan")
    attachments = relationship("Attachment", back_populates="ticket", cascade="all, delete-orphan")
    dependencies = relationship(
        "TicketDependency",
        foreign_keys="TicketDependency.ticket_id",
        back_populates="ticket",
        cascade="all, delete-orphan",
    )


class TicketDependency(Base):
    __tablename__ = "ticket_dependencies"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    depends_on_ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("ticket_id", "depends_on_ticket_id", name="ux_ticket_dependencies"),)

    ticket = relationship("Ticket", foreign_keys=[ticket_id], back_populates="dependencies")
    depends_on = relationship("Ticket", foreign_keys=[depends_on_ticket_id])


class TicketChecklistStatus(Base):
    __tablename__ = "ticket_checklist_statuses"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    ticket_uuid = Column(String(64), index=True)
    checklist_item_id = Column(Integer, ForeignKey("checklist_items.id"), nullable=True, index=True)
    status = Column(String(64), default="pending", nullable=False)
    text_en = Column(Text, default="", nullable=False)
    text_cn = Column(Text, default="", nullable=False)
    checked_at = Column(DateTime(timezone=True))
    checked_by = Column(String(128))

    ticket = relationship("Ticket", back_populates="checklist_statuses")
    checklist_item = relationship("ChecklistItem", back_populates="ticket_statuses")
    attachments = relationship("Attachment", back_populates="checklist_status", cascade="all, delete-orphan")


class TicketImage(Base):
    __tablename__ = "ticket_images"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    file_path = Column(Text, nullable=False)
    caption = Column(Text)
    order_index = Column(Integer, default=0, nullable=False)

    ticket = relationship("Ticket", back_populates="images")


class TicketSubmission(Base):
    __tablename__ = "ticket_submissions"

    id = Column(Integer, primary_key=True)
    ticket_uuid = Column(String(64), nullable=False, index=True)
    checklist_status_id = Column(Integer, ForeignKey("ticket_checklist_statuses.id"), index=True)
    started_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    ended_at = Column(DateTime(timezone=True))
    submitted_by = Column(String(128))

class TemplateChecklistItem(Base):
    __tablename__ = "template_checklist_items"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False, index=True)
    template_ticket_uuid = Column(String(64), index=True)
    design_ticket_uuid = Column(String(64), index=True)
    order_index = Column(Integer, default=0, nullable=False)
    text_en = Column(Text, default="", nullable=False)
    text_cn = Column(Text, default="", nullable=False)
    required = Column(Boolean, default=False, nullable=False)
    status = Column(String(64), default="active", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)
    updated_when = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    template = relationship("Template", back_populates="template_checklist_items")


class TemplateWorkTicket(Base):
    __tablename__ = "template_work_tickets"

    id = Column(Integer, primary_key=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False, unique=True, index=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    work_ticket_number = Column(String(64))
    design_ticket_uuid = Column(String(64))
    name = Column(String(255))
    job_type_en = Column(String(255))
    job_type_cn = Column(String(255))
    notes_en = Column(Text)
    notes_cn = Column(Text)
    checklist_item_uuids = Column(Text)  # stored as a delimited or JSON string
    tracking_ticket_template_uuid = Column(String(64))
    attachments_meta = Column(Text)  # JSON or delimited attachment identifiers
    version = Column(String(64))
    is_default = Column(Boolean, default=False, nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    template = relationship("Template", back_populates="work_ticket_meta")


class ProjectTemplate(Base):
    __tablename__ = "project_templates"
    __table_args__ = (UniqueConstraint("project_id", "template_id", name="ux_project_template"),)

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False, index=True)
    status = Column(String(64), default="active", nullable=False)
    template_name = Column(String(255))
    template_description = Column(Text)
    work_ticket_template_uuid = Column(String(64))
    tracking_ticket_template_uuid = Column(String(64))
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    project = relationship("Project", back_populates="template_links")
    template = relationship("Template", back_populates="project_links")


class TemplateTrackingTicket(Base):
    __tablename__ = "template_tracking_tickets"
    __table_args__ = (UniqueConstraint("base_template_id", "tracking_template_id", name="ux_template_tracking_pair"),)

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    base_template_id = Column(Integer, ForeignKey("templates.id"), nullable=False, index=True)
    tracking_template_id = Column(Integer, ForeignKey("templates.id"), nullable=False, index=True)
    template_ticket_uuid = Column(String(64), index=True)
    design_ticket_uuid = Column(String(64), index=True)
    work_ticket_number = Column(String(64))
    name = Column(String(255))
    job_type_en = Column(String(255))
    job_type_cn = Column(String(255))
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    base_template = relationship("Template", foreign_keys=[base_template_id], back_populates="tracking_links")
    tracking_template = relationship("Template", foreign_keys=[tracking_template_id], back_populates="tracking_as_target")


class TicketDesign(Base):
    __tablename__ = "ticket_designs"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    design_id = Column(String(64), ForeignKey("designs.design_id"), nullable=False, index=True)
    rendered_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    rendered_by = Column(String(128))
    notes = Column(Text)

    ticket = relationship("Ticket", back_populates="designs_override")
    design = relationship("Design", back_populates="ticket_designs")


class QrCode(Base):
    __tablename__ = "qr_codes"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), index=True)
    ticket_uuid = Column(String(64), index=True)
    payload = Column(Text, nullable=False)
    image_path = Column(Text)
    file_location = Column(Text)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    ticket = relationship("Ticket", back_populates="qr_codes")


class TicketTracking(Base):
    __tablename__ = "tracking_tickets"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    project_code = Column(String(64))
    project_name = Column(String(255))
    qr_payload = Column(Text)
    status = Column(String(64), default="pending", nullable=False)
    location = Column(String(255))
    notes = Column(Text)
    recorded_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    recorded_by = Column(String(128))

    ticket = relationship("Ticket", back_populates="tracking_events")
    project = relationship("Project")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), index=True)
    checklist_status_id = Column(Integer, ForeignKey("ticket_checklist_statuses.id"), index=True)
    file_path = Column(Text, nullable=False)
    file_name = Column(String(255))
    mime_type = Column(String(128))
    description = Column(Text)
    uploaded_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    uploaded_by = Column(String(128))

    ticket = relationship("Ticket", back_populates="attachments")
    template = relationship("Template", back_populates="attachments")
    checklist_status = relationship("TicketChecklistStatus", back_populates="attachments")
    thumbnails = relationship("Thumbnail", back_populates="attachment", cascade="all, delete-orphan")


class Thumbnail(Base):
    __tablename__ = "thumbnails"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(64), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    attachment_id = Column(Integer, ForeignKey("attachments.id"), nullable=False, index=True)
    file_path = Column(Text, nullable=False)
    width = Column(Integer)
    height = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    attachment = relationship("Attachment", back_populates="thumbnails")


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------
def init_db() -> None:
    """Create all tables if they do not exist."""
    Base.metadata.create_all(bind=engine)
    _ensure_extra_columns()


def get_session() -> Session:
    """Return a new SQLAlchemy Session (caller is responsible for closing)."""
    return SessionLocal()


def _ensure_extra_columns() -> None:
    """
    Lightweight migration helpers to add new columns when missing.
    Currently ensures ticket_checklist_statuses has text_en/text_cn and nullable checklist_item_id.
    """
    with engine.begin() as conn:
        tmpl_cols = {col["name"] for col in inspect(conn).get_columns("templates")}
        if "default_notes_en" not in tmpl_cols:
            conn.execute(text("ALTER TABLE templates ADD COLUMN default_notes_en TEXT"))
        if "default_notes_cn" not in tmpl_cols:
            conn.execute(text("ALTER TABLE templates ADD COLUMN default_notes_cn TEXT"))

        inspector = inspect(conn)
        table_names = set(inspector.get_table_names())
        checklist_cols = {col["name"] for col in inspector.get_columns("checklist_items")}
        if "uuid" not in checklist_cols:
            conn.execute(text("ALTER TABLE checklist_items ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM checklist_items WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE checklist_items SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_checklist_items_uuid ON checklist_items (uuid)"))
        if "status" not in checklist_cols:
            conn.execute(text("ALTER TABLE checklist_items ADD COLUMN status VARCHAR(64) DEFAULT 'active'"))
            conn.execute(
                text(
                    "UPDATE checklist_items SET status = 'active' WHERE status IS NULL OR status = ''"
                )
            )
        ticket_cols = {col["name"] for col in inspector.get_columns("tickets")}
        if "qr_source_ticket_id" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN qr_source_ticket_id INTEGER"))
            ticket_cols.add("qr_source_ticket_id")
        if "qr_source_ticket_uuid" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN qr_source_ticket_uuid VARCHAR(64)"))
            ticket_cols.add("qr_source_ticket_uuid")
        if "ticket_number" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN ticket_number INTEGER"))
            ticket_cols.add("ticket_number")
        if "ticket_section" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN ticket_section VARCHAR(128)"))
            ticket_cols.add("ticket_section")
        if "ticket_hours" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN ticket_hours REAL"))
            ticket_cols.add("ticket_hours")
        if "logged_hours" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN logged_hours REAL"))
            ticket_cols.add("logged_hours")
        if "updated_at" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN updated_at DATETIME"))
            conn.execute(text("UPDATE tickets SET updated_at = created_at WHERE updated_at IS NULL"))
            ticket_cols.add("updated_at")
        if "qr_source_ticket_id" in ticket_cols and "qr_source_ticket_uuid" in ticket_cols:
            conn.execute(
                text(
                    """
                    UPDATE tickets
                    SET qr_source_ticket_id = COALESCE(
                        qr_source_ticket_id,
                        (SELECT id FROM tickets base WHERE base.tracking_ticket_id = tickets.id LIMIT 1)
                    ),
                        qr_source_ticket_uuid = COALESCE(
                        NULLIF(qr_source_ticket_uuid, ''),
                        (SELECT uuid FROM tickets base WHERE base.tracking_ticket_id = tickets.id LIMIT 1)
                    )
                    WHERE EXISTS (SELECT 1 FROM tickets base WHERE base.tracking_ticket_id = tickets.id)
                    """
                )
            )
        cols = {col["name"] for col in inspector.get_columns("ticket_checklist_statuses")}
        if "ticket_uuid" not in cols:
            conn.execute(text("ALTER TABLE ticket_checklist_statuses ADD COLUMN ticket_uuid VARCHAR(64)"))
            conn.execute(
                text(
                    """
                    UPDATE ticket_checklist_statuses
                    SET ticket_uuid = (
                        SELECT uuid FROM tickets WHERE tickets.id = ticket_checklist_statuses.ticket_id
                    )
                    WHERE ticket_uuid IS NULL OR ticket_uuid = ''
                    """
                )
            )
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ticket_checklist_statuses_ticket_uuid ON ticket_checklist_statuses (ticket_uuid)"))
        if "text_en" not in cols:
            conn.execute(text("ALTER TABLE ticket_checklist_statuses ADD COLUMN text_en TEXT DEFAULT ''"))
        if "text_cn" not in cols:
            conn.execute(text("ALTER TABLE ticket_checklist_statuses ADD COLUMN text_cn TEXT DEFAULT ''"))
        # Ensure checklist_item_id is nullable (was NOT NULL in earlier schema)
        table_info = conn.execute(text("PRAGMA table_info(ticket_checklist_statuses)")).fetchall()
        needs_nullable = False
        for col in table_info:
            # PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
            if col[1] == "checklist_item_id" and col[3] == 1:
                needs_nullable = True
                break
        if needs_nullable:
            raw = conn.connection
            raw.executescript(
                """
                PRAGMA foreign_keys=off;
                CREATE TABLE ticket_checklist_statuses_new (
                    id INTEGER PRIMARY KEY,
                    ticket_id INTEGER NOT NULL,
                    checklist_item_id INTEGER,
                    status VARCHAR(64) NOT NULL DEFAULT 'pending',
                    text_en TEXT NOT NULL DEFAULT '',
                    text_cn TEXT NOT NULL DEFAULT '',
                    checked_at DATETIME,
                    checked_by VARCHAR(128)
                );
                INSERT INTO ticket_checklist_statuses_new (id, ticket_id, checklist_item_id, status, text_en, text_cn, checked_at, checked_by)
                SELECT id, ticket_id, checklist_item_id, status, COALESCE(text_en, ''), COALESCE(text_cn, ''), checked_at, checked_by
                FROM ticket_checklist_statuses;
                DROP TABLE ticket_checklist_statuses;
                ALTER TABLE ticket_checklist_statuses_new RENAME TO ticket_checklist_statuses;
                CREATE INDEX IF NOT EXISTS ix_ticket_checklist_statuses_ticket_id ON ticket_checklist_statuses (ticket_id);
                CREATE INDEX IF NOT EXISTS ix_ticket_checklist_statuses_checklist_item_id ON ticket_checklist_statuses (checklist_item_id);
                PRAGMA foreign_keys=on;
                """
            )
        if "users" in table_names:
            user_cols = {col["name"] for col in inspector.get_columns("users")}
            if "password_hash" not in user_cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))
        ticket_cols = {col["name"] for col in inspector.get_columns("tickets")}
        if "tracking_ticket_id" not in ticket_cols:
            conn.execute(text("ALTER TABLE tickets ADD COLUMN tracking_ticket_id INTEGER"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tickets_tracking_ticket_id ON tickets (tracking_ticket_id)"))

        project_cols = {col["name"] for col in inspector.get_columns("projects")}
        if "project_uuid" not in project_cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN project_uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM projects WHERE project_uuid IS NULL OR project_uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE projects SET project_uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_project_uuid ON projects (project_uuid)"))
        if "job_tickets_uuid" not in project_cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN job_tickets_uuid TEXT"))
        if "tracking_tickets_uuid" not in project_cols:
            conn.execute(text("ALTER TABLE projects ADD COLUMN tracking_tickets_uuid TEXT"))

        tmpl_check_cols = {col["name"] for col in inspector.get_columns("template_checklist_items")}
        if "uuid" not in tmpl_check_cols:
            conn.execute(text("ALTER TABLE template_checklist_items ADD COLUMN uuid VARCHAR(64)"))
            # Backfill with generated UUIDs so the column is non-empty for existing rows
            rows = conn.execute(text("SELECT id FROM template_checklist_items WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE template_checklist_items SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_template_checklist_items_uuid ON template_checklist_items (uuid)"))
        if "template_ticket_uuid" not in tmpl_check_cols:
            conn.execute(text("ALTER TABLE template_checklist_items ADD COLUMN template_ticket_uuid VARCHAR(64)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_template_checklist_items_template_ticket_uuid ON template_checklist_items (template_ticket_uuid)"))
        if "design_ticket_uuid" not in tmpl_check_cols:
            conn.execute(text("ALTER TABLE template_checklist_items ADD COLUMN design_ticket_uuid VARCHAR(64)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_template_checklist_items_design_ticket_uuid ON template_checklist_items (design_ticket_uuid)"))
        if "status" not in tmpl_check_cols:
            conn.execute(text("ALTER TABLE template_checklist_items ADD COLUMN status VARCHAR(64) DEFAULT 'active'"))
        if "updated_when" not in tmpl_check_cols:
            conn.execute(text("ALTER TABLE template_checklist_items ADD COLUMN updated_when DATETIME"))

        work_tmpl_cols = {col["name"] for col in inspector.get_columns("template_work_tickets")}
        if "uuid" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM template_work_tickets WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE template_work_tickets SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_template_work_tickets_uuid ON template_work_tickets (uuid)"))
        if "work_ticket_number" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN work_ticket_number VARCHAR(64)"))
        if "design_ticket_uuid" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN design_ticket_uuid VARCHAR(64)"))
        if "name" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN name VARCHAR(255)"))
        if "job_type_en" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN job_type_en VARCHAR(255)"))
        if "job_type_cn" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN job_type_cn VARCHAR(255)"))
        if "notes_en" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN notes_en TEXT"))
        if "notes_cn" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN notes_cn TEXT"))
        if "checklist_item_uuids" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN checklist_item_uuids TEXT"))
        if "tracking_ticket_template_uuid" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN tracking_ticket_template_uuid VARCHAR(64)"))
        if "attachments_meta" not in work_tmpl_cols:
            conn.execute(text("ALTER TABLE template_work_tickets ADD COLUMN attachments_meta TEXT"))

        tracking_cols = {col["name"] for col in inspector.get_columns("template_tracking_tickets")}
        if "uuid" not in tracking_cols:
            conn.execute(text("ALTER TABLE template_tracking_tickets ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM template_tracking_tickets WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE template_tracking_tickets SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_template_tracking_tickets_uuid ON template_tracking_tickets (uuid)"))
        if "template_ticket_uuid" not in tracking_cols:
            conn.execute(text("ALTER TABLE template_tracking_tickets ADD COLUMN template_ticket_uuid VARCHAR(64)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_template_tracking_tickets_template_ticket_uuid ON template_tracking_tickets (template_ticket_uuid)"))
        if "design_ticket_uuid" not in tracking_cols:
            conn.execute(text("ALTER TABLE template_tracking_tickets ADD COLUMN design_ticket_uuid VARCHAR(64)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_template_tracking_tickets_design_ticket_uuid ON template_tracking_tickets (design_ticket_uuid)"))
        if "work_ticket_number" not in tracking_cols:
            conn.execute(text("ALTER TABLE template_tracking_tickets ADD COLUMN work_ticket_number VARCHAR(64)"))
        if "name" not in tracking_cols:
            conn.execute(text("ALTER TABLE template_tracking_tickets ADD COLUMN name VARCHAR(255)"))
        if "job_type_en" not in tracking_cols:
            conn.execute(text("ALTER TABLE template_tracking_tickets ADD COLUMN job_type_en VARCHAR(255)"))
        if "job_type_cn" not in tracking_cols:
            conn.execute(text("ALTER TABLE template_tracking_tickets ADD COLUMN job_type_cn VARCHAR(255)"))

        tracking_ticket_cols = {col["name"] for col in inspector.get_columns("tracking_tickets")}
        if "uuid" not in tracking_ticket_cols:
            conn.execute(text("ALTER TABLE tracking_tickets ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM tracking_tickets WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE tracking_tickets SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_tracking_tickets_uuid ON tracking_tickets (uuid)"))
        if "project_id" not in tracking_ticket_cols:
            conn.execute(text("ALTER TABLE tracking_tickets ADD COLUMN project_id INTEGER"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tracking_tickets_project_id ON tracking_tickets (project_id)"))
        if "project_code" not in tracking_ticket_cols:
            conn.execute(text("ALTER TABLE tracking_tickets ADD COLUMN project_code VARCHAR(64)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tracking_tickets_project_code ON tracking_tickets (project_code)"))
        if "project_name" not in tracking_ticket_cols:
            conn.execute(text("ALTER TABLE tracking_tickets ADD COLUMN project_name VARCHAR(255)"))
        if "qr_payload" not in tracking_ticket_cols:
            conn.execute(text("ALTER TABLE tracking_tickets ADD COLUMN qr_payload TEXT"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tracking_tickets_qr_payload ON tracking_tickets (qr_payload)"))

        table_info = conn.execute(text("PRAGMA table_info(tracking_tickets)")).fetchall()
        needs_nullable = False
        for col in table_info:
            if col[1] == "ticket_id" and col[3] == 1:
                needs_nullable = True
                break
        if needs_nullable:
            raw = conn.connection
            raw.executescript(
                """
                PRAGMA foreign_keys=off;
                CREATE TABLE tracking_tickets_new (
                    id INTEGER PRIMARY KEY,
                    uuid VARCHAR(64),
                    ticket_id INTEGER,
                    project_id INTEGER,
                    project_code VARCHAR(64),
                    project_name VARCHAR(255),
                    qr_payload TEXT,
                    status VARCHAR(64) NOT NULL DEFAULT 'pending',
                    location VARCHAR(255),
                    notes TEXT,
                    recorded_at DATETIME,
                    recorded_by VARCHAR(128)
                );
                INSERT INTO tracking_tickets_new (
                    id, uuid, ticket_id, project_id, project_code, project_name, qr_payload,
                    status, location, notes, recorded_at, recorded_by
                )
                SELECT
                    id, uuid, ticket_id, project_id, project_code, project_name, qr_payload,
                    status, location, notes, recorded_at, recorded_by
                FROM tracking_tickets;
                DROP TABLE tracking_tickets;
                ALTER TABLE tracking_tickets_new RENAME TO tracking_tickets;
                CREATE UNIQUE INDEX IF NOT EXISTS ux_tracking_tickets_uuid ON tracking_tickets (uuid);
                CREATE INDEX IF NOT EXISTS ix_tracking_tickets_ticket_id ON tracking_tickets (ticket_id);
                CREATE INDEX IF NOT EXISTS ix_tracking_tickets_project_id ON tracking_tickets (project_id);
                CREATE INDEX IF NOT EXISTS ix_tracking_tickets_project_code ON tracking_tickets (project_code);
                CREATE INDEX IF NOT EXISTS ix_tracking_tickets_qr_payload ON tracking_tickets (qr_payload);
                PRAGMA foreign_keys=on;
                """
            )

        proj_tmpl_cols = {col["name"] for col in inspector.get_columns("project_templates")}
        if "uuid" not in proj_tmpl_cols:
            conn.execute(text("ALTER TABLE project_templates ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM project_templates WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE project_templates SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_project_templates_uuid ON project_templates (uuid)"))
        if "status" not in proj_tmpl_cols:
            conn.execute(text("ALTER TABLE project_templates ADD COLUMN status VARCHAR(64) DEFAULT 'active'"))
        if "template_name" not in proj_tmpl_cols:
            conn.execute(text("ALTER TABLE project_templates ADD COLUMN template_name VARCHAR(255)"))
        if "template_description" not in proj_tmpl_cols:
            conn.execute(text("ALTER TABLE project_templates ADD COLUMN template_description TEXT"))
        if "work_ticket_template_uuid" not in proj_tmpl_cols:
            conn.execute(text("ALTER TABLE project_templates ADD COLUMN work_ticket_template_uuid VARCHAR(64)"))
        if "tracking_ticket_template_uuid" not in proj_tmpl_cols:
            conn.execute(text("ALTER TABLE project_templates ADD COLUMN tracking_ticket_template_uuid VARCHAR(64)"))

        qr_cols = {col["name"] for col in inspector.get_columns("qr_codes")}
        if "uuid" not in qr_cols:
            conn.execute(text("ALTER TABLE qr_codes ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM qr_codes WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE qr_codes SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_qr_codes_uuid ON qr_codes (uuid)"))
        if "ticket_uuid" not in qr_cols:
            conn.execute(text("ALTER TABLE qr_codes ADD COLUMN ticket_uuid VARCHAR(64)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_qr_codes_ticket_uuid ON qr_codes (ticket_uuid)"))
        if "file_location" not in qr_cols:
            conn.execute(text("ALTER TABLE qr_codes ADD COLUMN file_location TEXT"))

        attachment_cols = {col["name"] for col in inspector.get_columns("attachments")}
        if "uuid" not in attachment_cols:
            conn.execute(text("ALTER TABLE attachments ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM attachments WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE attachments SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_attachments_uuid ON attachments (uuid)"))
        if "checklist_status_id" not in attachment_cols:
            conn.execute(text("ALTER TABLE attachments ADD COLUMN checklist_status_id INTEGER"))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_attachments_checklist_status_id ON attachments (checklist_status_id)"
                )
            )

        thumbnail_cols = {col["name"] for col in inspector.get_columns("thumbnails")}
        if "uuid" not in thumbnail_cols:
            conn.execute(text("ALTER TABLE thumbnails ADD COLUMN uuid VARCHAR(64)"))
            rows = conn.execute(text("SELECT id FROM thumbnails WHERE uuid IS NULL OR uuid = ''")).fetchall()
            for row in rows:
                conn.execute(
                    text("UPDATE thumbnails SET uuid = :uuid WHERE id = :id"),
                    {"uuid": str(uuid.uuid4()), "id": row.id},
                )
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_thumbnails_uuid ON thumbnails (uuid)"))

        if "ticket_submissions" in table_names:
            submission_cols = {col["name"] for col in inspector.get_columns("ticket_submissions")}
            if "checklist_status_id" not in submission_cols:
                conn.execute(text("ALTER TABLE ticket_submissions ADD COLUMN checklist_status_id INTEGER"))
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_ticket_submissions_checklist_status_id ON ticket_submissions (checklist_status_id)"
                    )
                )


# ---------------------------------------------------------------------------
# Template metadata helpers
# ---------------------------------------------------------------------------
def _is_empty(value: str | None) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def ensure_designs(session: Session) -> None:
    _ensure_design(
        session,
        design_id="work_ticket_v1",
        name="Work Ticket Layout v1",
        module_path="ticket_engine.designs.work_ticket_v1",
        description="Work ticket layout v1 for framing/field tasks.",
    )
    _ensure_design(
        session,
        design_id="ticket_tracking_v1",
        name="Ticket Tracking Layout v1",
        module_path="ticket_engine.designs.ticket_tracking_v1",
        description="Compact tracking ticket layout for quick status capture.",
    )


def _ensure_design(
    session: Session,
    *,
    design_id: str,
    name: str,
    module_path: str,
    description: str,
) -> None:
    existing = session.query(Design).filter(Design.design_id == design_id).one_or_none()
    if existing is not None:
        return
    session.add(
        Design(
            design_id=design_id,
            name=name,
            module_path=module_path,
            description=description,
            is_active=True,
        )
    )


def ensure_template_metadata(
    session: Session,
    template: Template,
) -> tuple["TemplateWorkTicket | None", "Template | None", "TemplateTrackingTicket | None"]:
    """
    Ensure template metadata tables are populated for a work template.

    Returns (work_meta, tracking_template, tracking_link). For non-work templates
    returns (None, None, None).
    """
    if template.design_id != "work_ticket_v1":
        return None, None, None

    work_meta = _ensure_template_work_meta(session, template)
    _ensure_template_checklist_items(session, template, work_meta)
    tracking_template = _ensure_tracking_template(session, template)
    tracking_link = _ensure_template_tracking_link(session, template, tracking_template, work_meta)
    return work_meta, tracking_template, tracking_link


def _ensure_template_work_meta(session: Session, template: Template) -> TemplateWorkTicket:
    work_meta = session.query(TemplateWorkTicket).filter(TemplateWorkTicket.template_id == template.id).one_or_none()
    if work_meta is None:
        work_meta = TemplateWorkTicket(
            template_id=template.id,
            work_ticket_number=template.template_code,
            name=template.name,
            job_type_en=template.job_type_en,
            job_type_cn=template.job_type_cn,
            notes_en=template.default_notes_en,
            notes_cn=template.default_notes_cn,
        )
        session.add(work_meta)
        session.flush()
        return work_meta

    if _is_empty(work_meta.work_ticket_number):
        work_meta.work_ticket_number = template.template_code
    if _is_empty(work_meta.name):
        work_meta.name = template.name
    if _is_empty(work_meta.job_type_en):
        work_meta.job_type_en = template.job_type_en
    if _is_empty(work_meta.job_type_cn):
        work_meta.job_type_cn = template.job_type_cn
    if _is_empty(work_meta.notes_en):
        work_meta.notes_en = template.default_notes_en
    if _is_empty(work_meta.notes_cn):
        work_meta.notes_cn = template.default_notes_cn
    return work_meta


def _ensure_template_checklist_items(
    session: Session,
    template: Template,
    work_meta: TemplateWorkTicket | None,
) -> None:
    checklist = (
        session.query(ChecklistItem)
        .filter(ChecklistItem.template_id == template.id)
        .order_by(ChecklistItem.order_index.asc(), ChecklistItem.id.asc())
        .all()
    )
    for item in checklist:
        existing = (
            session.query(TemplateChecklistItem)
            .filter(
                TemplateChecklistItem.template_id == template.id,
                TemplateChecklistItem.order_index == item.order_index,
                TemplateChecklistItem.text_en == item.text_en,
                TemplateChecklistItem.text_cn == item.text_cn,
            )
            .one_or_none()
        )
        if existing is not None:
            continue
        session.add(
            TemplateChecklistItem(
                template_id=template.id,
                template_ticket_uuid=work_meta.uuid if work_meta else None,
                order_index=item.order_index,
                text_en=item.text_en or "",
                text_cn=item.text_cn or "",
                required=bool(item.required),
                status=item.status or "active",
            )
        )


def _ensure_tracking_template(session: Session, base_template: Template) -> Template:
    tracking_template_id = f"tracking-{base_template.template_id}"
    tracking_template = (
        session.query(Template)
        .filter(Template.template_id == tracking_template_id, Template.design_id == "ticket_tracking_v1")
        .one_or_none()
    )
    if tracking_template is not None:
        return tracking_template

    now = _utcnow()
    tracking_template = Template(
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
    session.add(tracking_template)
    session.flush()
    return tracking_template


def _ensure_template_tracking_link(
    session: Session,
    base_template: Template,
    tracking_template: Template,
    work_meta: TemplateWorkTicket | None,
) -> TemplateTrackingTicket:
    link = (
        session.query(TemplateTrackingTicket)
        .filter(
            TemplateTrackingTicket.base_template_id == base_template.id,
            TemplateTrackingTicket.tracking_template_id == tracking_template.id,
        )
        .one_or_none()
    )
    if link is None:
        link = TemplateTrackingTicket(
            base_template_id=base_template.id,
            tracking_template_id=tracking_template.id,
            template_ticket_uuid=work_meta.uuid if work_meta else None,
            work_ticket_number=base_template.template_code,
            name=base_template.name,
            job_type_en=base_template.job_type_en,
            job_type_cn=base_template.job_type_cn,
            is_active=True,
        )
        session.add(link)
        session.flush()
    else:
        if _is_empty(link.template_ticket_uuid) and work_meta:
            link.template_ticket_uuid = work_meta.uuid
        if _is_empty(link.work_ticket_number):
            link.work_ticket_number = base_template.template_code
        if _is_empty(link.name):
            link.name = base_template.name
        if _is_empty(link.job_type_en):
            link.job_type_en = base_template.job_type_en
        if _is_empty(link.job_type_cn):
            link.job_type_cn = base_template.job_type_cn

    if work_meta and _is_empty(work_meta.tracking_ticket_template_uuid):
        work_meta.tracking_ticket_template_uuid = link.uuid
    return link


def ensure_project_templates(session: Session, project: Project, base_templates: Iterable[Template]) -> None:
    for template in base_templates:
        if template.design_id != "work_ticket_v1":
            continue
        work_meta, _tracking_template, tracking_link = ensure_template_metadata(session, template)
        existing = (
            session.query(ProjectTemplate)
            .filter(ProjectTemplate.project_id == project.id, ProjectTemplate.template_id == template.id)
            .one_or_none()
        )
        if existing is None:
            session.add(
                ProjectTemplate(
                    project_id=project.id,
                    template_id=template.id,
                    status="active",
                    template_name=template.name,
                    template_description=None,
                    work_ticket_template_uuid=work_meta.uuid if work_meta else None,
                    tracking_ticket_template_uuid=tracking_link.uuid if tracking_link else None,
                    is_default=False,
                )
            )
            continue

        if _is_empty(existing.template_name):
            existing.template_name = template.name
        if _is_empty(existing.work_ticket_template_uuid) and work_meta:
            existing.work_ticket_template_uuid = work_meta.uuid
        if _is_empty(existing.tracking_ticket_template_uuid) and tracking_link:
            existing.tracking_ticket_template_uuid = tracking_link.uuid


def ensure_tracking_ticket(
    session: Session,
    base_ticket: Ticket,
    tracking_template: Optional[Template] = None,
    qr_payload: Optional[str] = None,
) -> TicketTracking:
    del tracking_template
    qr_value = qr_payload or base_ticket.uuid
    project_id = base_ticket.project_id
    project_code = base_ticket.dth_number or ""
    project_name = None
    if project_id:
        project = session.get(Project, project_id)
        if project:
            project_code = project.project_code or project_code
            project_name = project.name

    existing = (
        session.query(TicketTracking)
        .filter(TicketTracking.qr_payload == qr_value)
        .one_or_none()
    )
    if existing:
        if not existing.project_id and project_id:
            existing.project_id = project_id
        if not existing.project_code and project_code:
            existing.project_code = project_code
        if not existing.project_name and project_name:
            existing.project_name = project_name
        if not existing.qr_payload:
            existing.qr_payload = qr_value
        return existing

    tracking_ticket = TicketTracking(
        ticket_id=None,
        project_id=project_id,
        project_code=project_code or None,
        project_name=project_name,
        qr_payload=qr_value,
    )
    session.add(tracking_ticket)
    session.flush()
    return tracking_ticket


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------
def create_template(
    session: Session,
    template_data: dict,
    checklist_items: Optional[Iterable[dict]] = None,
) -> Template:
    """
    Create a template row (and optional checklist items).

    template_data must include: template_id, name, design_id, template_code,
    job_type_en, job_type_cn. checklist_items may be an iterable of dicts with
    text_en, text_cn, order_index (optional), required (optional).
    """
    required_keys = ["template_id", "name", "design_id", "template_code", "job_type_en", "job_type_cn"]
    missing = [key for key in required_keys if not template_data.get(key)]
    if missing:
        raise ValueError(f"Missing required template fields: {', '.join(missing)}")

    design = session.query(Design).filter_by(design_id=template_data["design_id"]).one_or_none()
    if design is None:
        raise ValueError(f"Design with design_id '{template_data['design_id']}' not found")

    now = _utcnow()
    template = Template(
        template_id=template_data["template_id"],
        name=template_data["name"],
        design_id=template_data["design_id"],
        template_code=template_data["template_code"],
        job_type_en=template_data["job_type_en"],
        job_type_cn=template_data["job_type_cn"],
        default_notes_en=template_data.get("default_notes_en"),
        default_notes_cn=template_data.get("default_notes_cn"),
        created_at=template_data.get("created_at", now),
        updated_at=template_data.get("updated_at", now),
        is_active=bool(template_data.get("is_active", True)),
    )
    session.add(template)
    session.flush()

    if checklist_items:
        for idx, item in enumerate(checklist_items):
            template.checklist_items.append(
                ChecklistItem(
                    order_index=item.get("order_index", idx),
                    text_en=item.get("text_en") or item.get("en") or "",
                    text_cn=item.get("text_cn") or item.get("cn") or "",
                    required=bool(item.get("required", False)),
                )
            )

    session.commit()
    session.refresh(template)
    return template


def list_templates(session: Session, design_id: Optional[str] = None, only_active: bool = True) -> List[Template]:
    """
    Return templates sorted by updated_at (descending if present).
    """
    query = session.query(Template)
    if design_id:
        query = query.filter(Template.design_id == design_id)
    if only_active:
        query = query.filter(Template.is_active.is_(True))
    return query.order_by(Template.updated_at.desc().nullslast(), Template.id.asc()).all()


def create_ticket(
    session: Session,
    *,
    template_id: int,
    project_id: Optional[int] = None,
    dth_number: Optional[str] = None,
    name: Optional[str] = None,
    ticket_number: Optional[int] = None,
    ticket_section: Optional[str] = None,
    ticket_hours: Optional[float] = None,
    logged_hours: Optional[float] = None,
    notes_en: Optional[str] = None,
    notes_cn: Optional[str] = None,
    status: str = "new",
    printed_by: Optional[str] = None,
    checklist_statuses: Optional[Iterable[dict]] = None,
    images: Optional[Iterable[dict]] = None,
) -> Ticket:
    """
    Create a ticket and related checklist status rows and images.

    If checklist_statuses is not provided, a pending status row is created for
    every checklist item on the template. image dicts can include file_path,
    caption, and order_index.
    """
    template = session.get(Template, template_id)
    if template is None:
        raise ValueError(f"Template id {template_id} not found")

    ticket = Ticket(
        uuid=str(uuid.uuid4()),
        template=template,
        project_id=project_id,
        dth_number=dth_number or "",
        name=name or "",
        ticket_number=ticket_number,
        ticket_section=ticket_section or None,
        ticket_hours=ticket_hours,
        logged_hours=logged_hours,
        notes_en=notes_en or "",
        notes_cn=notes_cn or "",
        status=status,
        printed_by=printed_by,
    )
    session.add(ticket)
    session.flush()

    if checklist_statuses is not None:
        for cs in checklist_statuses:
            checklist_item_id = cs.get("checklist_item_id")
            if checklist_item_id is None:
                continue
            status_value = cs.get("status", "pending")
            ticket.checklist_statuses.append(
                TicketChecklistStatus(
                    checklist_item_id=checklist_item_id,
                    status=status_value,
                    checked_at=cs.get("checked_at"),
                    checked_by=cs.get("checked_by"),
                    ticket_uuid=ticket.uuid,
                )
            )
    else:
        for item in template.checklist_items:
            ticket.checklist_statuses.append(
                TicketChecklistStatus(
                    checklist_item_id=item.id,
                    status="pending",
                    ticket_uuid=ticket.uuid,
                )
            )

    if images:
        for idx, img in enumerate(images):
            file_path = img.get("file_path") or ""
            ticket.images.append(
                TicketImage(
                    file_path=file_path,
                    caption=img.get("caption"),
                    order_index=img.get("order_index", idx),
                )
            )
            if file_path:
                ticket.attachments.append(
                    Attachment(
                        file_path=file_path,
                        file_name=Path(file_path).name,
                        mime_type=img.get("mime_type"),
                        description=img.get("caption"),
                    )
                )

    session.commit()
    session.refresh(ticket)
    return ticket
