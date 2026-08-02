import re
import unicodedata

from flask import jsonify

from . import db

MASK = "********"
SECRET_SETTINGS = {"smtp_password"}
PUBLIC_SETTINGS = {
    "site_title",
    "tagline",
    "manifesto",
    "meta_description",
    "showreel_url",
    "hero_loop_path",
    "contact_email",
    "social_instagram",
    "social_youtube",
    "social_vimeo",
}


def json_ok(payload=None, status=200):
    body = {"ok": True}
    if payload:
        body.update(payload)
    return jsonify(body), status


def json_error(message, status=400, **extra):
    body = {"error": message}
    body.update(extra)
    return jsonify(body), status


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text or "untitled"


def unique_slug(base, exclude_id=None):
    slug = base
    n = 1
    while True:
        if exclude_id is None:
            row = db.fetch_one("SELECT id FROM projects WHERE slug = %s", (slug,))
        else:
            row = db.fetch_one(
                "SELECT id FROM projects WHERE slug = %s AND id != %s", (slug, exclude_id)
            )
        if row is None:
            return slug
        n += 1
        slug = f"{base}-{n}"


def get_settings():
    return {r["key"]: r["value"] for r in db.fetch_all("SELECT key, value FROM settings")}


def put_settings(updates):
    with db.get_conn() as conn:
        for key, value in updates.items():
            conn.execute(
                """INSERT INTO settings (key, value) VALUES (%s, %s)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""",
                (key, str(value)),
            )


def clean_display_name(name):
    return "".join(c for c in name if c.isprintable()).strip()[:255] or "unnamed"
