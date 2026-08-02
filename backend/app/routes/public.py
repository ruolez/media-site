import re
from xml.sax.saxutils import escape

from flask import Blueprint, Response, request

from .. import config, db, emailer, utils, videourl

bp = Blueprint("public", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@bp.get("/api/health")
def health():
    db.fetch_one("SELECT 1 AS ok")
    return utils.json_ok()


def _media_url(rel_path):
    return f"/media/{rel_path}" if rel_path else None


@bp.get("/api/site")
def site():
    settings = utils.get_settings()
    public = {k: settings.get(k, "") for k in utils.PUBLIC_SETTINGS}

    showreel_embed = ""
    if public.get("showreel_url"):
        try:
            _, showreel_embed = videourl.parse_video_url(public["showreel_url"])
        except ValueError:
            pass

    return {
        "site_title": public["site_title"],
        "tagline": public["tagline"],
        "manifesto": public["manifesto"],
        "meta_description": public["meta_description"],
        "showreel_embed": showreel_embed,
        "hero_loop": _media_url(public["hero_loop_path"]),
        "has_contact": True,
        "social": {
            "instagram": public["social_instagram"],
            "youtube": public["social_youtube"],
            "vimeo": public["social_vimeo"],
        },
        "services": db.fetch_all(
            "SELECT id, title, description FROM services ORDER BY sort_order, id"
        ),
        "clients": [
            r["name"]
            for r in db.fetch_all("SELECT name FROM clients ORDER BY sort_order, id")
        ],
        "blocks": db.fetch_all(
            """SELECT id, title, show_title, body_html FROM content_blocks
               WHERE published ORDER BY sort_order, id"""
        ),
        "categories": db.fetch_all(
            """SELECT c.id, c.name, c.slug FROM categories c
               WHERE EXISTS (SELECT 1 FROM projects p
                             WHERE p.category_id = c.id AND p.published)
               ORDER BY c.sort_order, c.id"""
        ),
    }


@bp.get("/api/projects")
def projects():
    category = request.args.get("category")
    sql = """SELECT p.id, p.slug, p.title, p.client, p.year, c.name AS category,
                    c.slug AS category_slug, p.poster_path, p.preview_path
             FROM projects p LEFT JOIN categories c ON c.id = p.category_id
             WHERE p.published"""
    params = []
    if category:
        sql += " AND c.slug = %s"
        params.append(category)
    sql += " ORDER BY p.sort_order, p.id DESC"
    rows = db.fetch_all(sql, params)
    return {
        "projects": [
            {
                **{k: r[k] for k in ("id", "slug", "title", "client", "year", "category", "category_slug")},
                "poster": _media_url(r["poster_path"]),
                "preview": _media_url(r["preview_path"]),
            }
            for r in rows
        ]
    }


@bp.get("/api/projects/<slug>")
def project_detail(slug):
    row = db.fetch_one(
        """SELECT p.*, c.name AS category FROM projects p
           LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.slug = %s AND p.published""",
        (slug,),
    )
    if not row:
        return utils.json_error("not found", 404)

    published = db.fetch_all(
        "SELECT slug FROM projects WHERE published ORDER BY sort_order, id DESC"
    )
    slugs = [r["slug"] for r in published]
    idx = slugs.index(slug)

    stills = db.fetch_all(
        "SELECT path FROM project_stills WHERE project_id = %s ORDER BY sort_order, id",
        (row["id"],),
    )
    return {
        "title": row["title"],
        "slug": row["slug"],
        "client": row["client"],
        "category": row["category"],
        "year": row["year"],
        "embed_url": row["video_embed_url"],
        "description": row["description"],
        "credits": row["credits"],
        "poster": _media_url(row["poster_path"]),
        "stills": [_media_url(s["path"]) for s in stills],
        "prev_slug": slugs[idx - 1] if idx > 0 else slugs[-1] if len(slugs) > 1 else None,
        "next_slug": slugs[idx + 1] if idx < len(slugs) - 1 else slugs[0] if len(slugs) > 1 else None,
    }


@bp.post("/api/contact")
def contact():
    data = request.get_json(silent=True) or {}
    if data.get("website"):  # honeypot
        return utils.json_ok()

    name = str(data.get("name", "")).strip()[:200]
    email = str(data.get("email", "")).strip()[:320]
    company = str(data.get("company", "")).strip()[:200]
    message = str(data.get("message", "")).strip()[:5000]

    if not name or not message or not EMAIL_RE.match(email):
        return utils.json_error("please fill in your name, a valid email and a message")

    with db.get_conn() as conn:
        row = conn.execute(
            """INSERT INTO inquiries (name, email, company, message)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (name, email, company, message),
        ).fetchone()
    inquiry_id = row["id"]

    settings = utils.get_settings()
    to_addr = settings.get("contact_email", "")
    if emailer.smtp_configured(settings) and to_addr:
        body = (
            f"New inquiry via {settings.get('site_title', 'Vova Media')}\n\n"
            f"Name: {name}\nEmail: {email}\nCompany: {company}\n\n{message}"
        )
        emailer.send_inquiry_email_async(
            settings, inquiry_id, to_addr, f"New inquiry from {name}", body
        )
    return utils.json_ok()


@bp.get("/sitemap.xml")
def sitemap():
    base = config.PUBLIC_BASE_URL
    urls = [f"{base}/"]
    for r in db.fetch_all("SELECT slug FROM projects WHERE published ORDER BY id"):
        urls.append(f"{base}/work/{r['slug']}")
    items = "".join(f"<url><loc>{escape(u)}</loc></url>" for u in urls)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{items}</urlset>"
    )
    return Response(xml, mimetype="application/xml")
