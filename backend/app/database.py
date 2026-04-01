from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import Settings
from .seed_data import TIMELINE_SEED_ITEMS


SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
    title TEXT NOT NULL DEFAULT '',
    communication_date TEXT NULL,
    description TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '',
    extraction_error TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_job_created_at
ON documents (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS timeline_items (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('due-date', 'handover-letter', 'chase', 'conversation', 'letter', 'other')),
    subtype TEXT NULL CHECK (subtype IN ('email', 'sms', 'whatsapp', 'facebook', 'voicemail', 'home-visit', 'phone', 'in-person')),
    sender TEXT NULL CHECK (sender IN ('you', 'collexis')),
    date TEXT NOT NULL,
    short_description TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_items_job_date
ON timeline_items (job_id, date ASC, created_at ASC);

CREATE TABLE IF NOT EXISTS document_timeline_items (
    document_id TEXT NOT NULL,
    timeline_item_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (document_id, timeline_item_id),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (timeline_item_id) REFERENCES timeline_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_timeline_items_timeline_item
ON document_timeline_items (timeline_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_plan_steps (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('email', 'sms', 'whatsapp', 'call', 'letter-warning', 'letter-of-claim', 'initiate-legal-action')),
    sender TEXT NOT NULL CHECK (sender IN ('you', 'collexis')),
    headline TEXT NOT NULL,
    scheduled_for TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_plan_steps_job_scheduled
ON outreach_plan_steps (job_id, scheduled_for ASC, created_at ASC);
"""


def init_db(settings: Settings) -> None:
    if settings.uses_supabase:
        return

    settings.ensure_directories()
    with connect(settings) as conn:
        conn.executescript(SCHEMA)
        migrate_timeline_items(conn)
        migrate_outreach_plan_steps(conn)
        migrate_outreach_plan_drafts_table(conn)
        create_outreach_plan_drafts_table(conn)
        now = "2026-03-29T00:00:00+00:00"
        conn.executemany(
            """
            INSERT OR IGNORE INTO timeline_items (
                id, job_id, category, subtype, sender, date, short_description, details, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    item["id"],
                    item["job_id"],
                    item["category"],
                    item["subtype"],
                    item["sender"],
                    item["date"],
                    item["short_description"],
                    item["details"],
                    now,
                    now,
                )
                for item in TIMELINE_SEED_ITEMS
            ],
        )
        conn.commit()


def migrate_timeline_items(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        """
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'timeline_items'
        """
    ).fetchone()
    table_sql = str(row["sql"]) if row and row["sql"] else ""
    has_sms = "'sms'" in table_sql
    has_handover_letter = "'handover-letter'" in table_sql
    if has_sms and has_handover_letter:
        conn.execute(
            """
            UPDATE timeline_items
            SET subtype = 'sms'
            WHERE subtype = 'text'
            """
        )
        conn.execute(
            """
            UPDATE timeline_items
            SET category = 'handover-letter'
            WHERE category = 'collexis-handover'
            """
        )
        conn.commit()
        return

    conn.executescript(
        """
        PRAGMA foreign_keys = OFF;

        ALTER TABLE document_timeline_items RENAME TO document_timeline_items_legacy;
        ALTER TABLE timeline_items RENAME TO timeline_items_legacy;

        CREATE TABLE timeline_items (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('due-date', 'handover-letter', 'chase', 'conversation', 'letter', 'other')),
            subtype TEXT NULL CHECK (subtype IN ('email', 'sms', 'whatsapp', 'facebook', 'voicemail', 'home-visit', 'phone', 'in-person')),
            sender TEXT NULL CHECK (sender IN ('you', 'collexis')),
            date TEXT NOT NULL,
            short_description TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_timeline_items_job_date
        ON timeline_items (job_id, date ASC, created_at ASC);

        CREATE TABLE document_timeline_items (
            document_id TEXT NOT NULL,
            timeline_item_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (document_id, timeline_item_id),
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY (timeline_item_id) REFERENCES timeline_items(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_document_timeline_items_timeline_item
        ON document_timeline_items (timeline_item_id, created_at DESC);

        INSERT INTO timeline_items (
            id, job_id, category, subtype, sender, date, short_description, details, created_at, updated_at
        )
        SELECT
            id,
            job_id,
            CASE WHEN category = 'collexis-handover' THEN 'handover-letter' ELSE category END,
            CASE WHEN subtype = 'text' THEN 'sms' ELSE subtype END,
            sender,
            date,
            short_description,
            details,
            created_at,
            updated_at
        FROM timeline_items_legacy;

        INSERT INTO document_timeline_items (
            document_id, timeline_item_id, created_at
        )
        SELECT document_id, timeline_item_id, created_at
        FROM document_timeline_items_legacy;

        DROP TABLE document_timeline_items_legacy;
        DROP TABLE timeline_items_legacy;

        PRAGMA foreign_keys = ON;
        """
    )


def create_outreach_plan_drafts_table(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS outreach_plan_drafts (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            plan_step_id TEXT NOT NULL UNIQUE,
            subject TEXT NULL,
            body TEXT NOT NULL,
            is_user_edited INTEGER NOT NULL DEFAULT 0 CHECK (is_user_edited IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (plan_step_id) REFERENCES outreach_plan_steps(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_outreach_plan_drafts_job_updated
        ON outreach_plan_drafts (job_id, updated_at DESC);
        """
    )


def migrate_outreach_plan_drafts_table(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'outreach_plan_drafts'
        """
    ).fetchone()
    if not row:
        return

    foreign_keys = conn.execute("PRAGMA foreign_key_list('outreach_plan_drafts')").fetchall()
    if any(str(foreign_key["table"]) != "outreach_plan_steps" for foreign_key in foreign_keys):
        conn.executescript(
            """
            PRAGMA foreign_keys = OFF;

            ALTER TABLE outreach_plan_drafts RENAME TO outreach_plan_drafts_legacy;

            CREATE TABLE outreach_plan_drafts (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                plan_step_id TEXT NOT NULL UNIQUE,
                subject TEXT NULL,
                body TEXT NOT NULL,
                is_user_edited INTEGER NOT NULL DEFAULT 0 CHECK (is_user_edited IN (0, 1)),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (plan_step_id) REFERENCES outreach_plan_steps(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_outreach_plan_drafts_job_updated
            ON outreach_plan_drafts (job_id, updated_at DESC);

            INSERT INTO outreach_plan_drafts (
                id, job_id, plan_step_id, subject, body, is_user_edited, created_at, updated_at
            )
            SELECT
                id, job_id, plan_step_id, subject, body, is_user_edited, created_at, updated_at
            FROM outreach_plan_drafts_legacy;

            DROP TABLE outreach_plan_drafts_legacy;

            PRAGMA foreign_keys = ON;
            """
        )


def migrate_outreach_plan_steps(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        """
        SELECT sql
        FROM sqlite_master
        WHERE type = 'table' AND name = 'outreach_plan_steps'
        """
    ).fetchone()
    table_sql = str(row["sql"]) if row and row["sql"] else ""
    if "'sms'" in table_sql and "whatsapp" in table_sql:
        conn.execute(
            """
            UPDATE outreach_plan_steps
            SET type = 'sms'
            WHERE type = 'text'
            """
        )
        conn.commit()
        return

    conn.executescript(
        """
        ALTER TABLE outreach_plan_steps RENAME TO outreach_plan_steps_legacy;

        CREATE TABLE outreach_plan_steps (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('email', 'sms', 'whatsapp', 'call', 'letter-warning', 'letter-of-claim', 'initiate-legal-action')),
            sender TEXT NOT NULL CHECK (sender IN ('you', 'collexis')),
            headline TEXT NOT NULL,
            scheduled_for TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        INSERT INTO outreach_plan_steps (
            id, job_id, type, sender, headline, scheduled_for, created_at, updated_at
        )
        SELECT
            id,
            job_id,
            CASE WHEN type = 'text' THEN 'sms' ELSE type END,
            sender,
            headline,
            scheduled_for,
            created_at,
            updated_at
        FROM outreach_plan_steps_legacy;

        DROP TABLE outreach_plan_steps_legacy;

        CREATE INDEX IF NOT EXISTS idx_outreach_plan_steps_job_scheduled
        ON outreach_plan_steps (job_id, scheduled_for ASC, created_at ASC);
        """
    )


@contextmanager
def connect(settings: Settings) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()
