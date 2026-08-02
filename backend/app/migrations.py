import logging
import os

from . import db

log = logging.getLogger(__name__)

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations")
ADVISORY_LOCK_KEY = 0x564D4D  # "VMM"


def run_migrations():
    with db.get_conn() as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (ADVISORY_LOCK_KEY,))
        try:
            conn.execute(
                """CREATE TABLE IF NOT EXISTS schema_migrations (
                       filename text PRIMARY KEY,
                       applied_at timestamptz NOT NULL DEFAULT now()
                   )"""
            )
            conn.commit()
            applied = {
                r["filename"]
                for r in conn.execute("SELECT filename FROM schema_migrations").fetchall()
            }
            for fname in sorted(os.listdir(MIGRATIONS_DIR)):
                if not fname.endswith(".sql") or fname in applied:
                    continue
                path = os.path.join(MIGRATIONS_DIR, fname)
                with open(path, encoding="utf-8") as f:
                    sql = f.read()
                conn.execute(sql)
                conn.execute("INSERT INTO schema_migrations (filename) VALUES (%s)", (fname,))
                conn.commit()
                log.info("applied migration %s", fname)
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (ADVISORY_LOCK_KEY,))
            conn.commit()
