import logging

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from . import config, db

log = logging.getLogger(__name__)
ph = PasswordHasher()


def hash_password(password):
    return ph.hash(password)


def verify_password(password_hash, password):
    try:
        ph.verify(password_hash, password)
        return True
    except (VerifyMismatchError, InvalidHashError):
        return False


def seed_admin():
    with db.get_conn() as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (0x564D41,))
        try:
            row = conn.execute("SELECT id FROM admin_account WHERE id = 1").fetchone()
            if row is None:
                if not config.ADMIN_INITIAL_PASSWORD:
                    raise RuntimeError("ADMIN_INITIAL_PASSWORD must be set on first run")
                conn.execute(
                    "INSERT INTO admin_account (id, password_hash) VALUES (1, %s)",
                    (hash_password(config.ADMIN_INITIAL_PASSWORD),),
                )
                log.info("seeded admin account from ADMIN_INITIAL_PASSWORD")
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (0x564D41,))
            conn.commit()
