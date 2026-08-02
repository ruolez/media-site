from flask import Blueprint, request

from .. import db, emailer, media, utils, videourl
from ..auth import login_required
from ..sanitize import sanitize_html

bp = Blueprint("admin_content", __name__, url_prefix="/api/admin")


# ---------- projects ----------

PROJECT_FIELDS = ("title", "client", "category_id", "year", "video_url",
                  "description", "credits", "published")


def _project_payload(data, project_id=None):
    title = str(data.get("title", "")).strip()
    if not title:
        raise ValueError("title is required")

    video_url = str(data.get("video_url", "")).strip()
    embed_url = ""
    if video_url:
        _, embed_url = videourl.parse_video_url(video_url)

    slug = str(data.get("slug", "")).strip()
    slug = utils.slugify(slug) if slug else utils.slugify(title)
    slug = utils.unique_slug(slug, exclude_id=project_id)

    year = data.get("year")
    year = int(year) if year not in (None, "") else None
    category_id = data.get("category_id")
    category_id = int(category_id) if category_id not in (None, "") else None

    return {
        "title": title,
        "slug": slug,
        "client": str(data.get("client", "")).strip(),
        "category_id": category_id,
        "year": year,
        "video_url": video_url,
        "video_embed_url": embed_url,
        "description": str(data.get("description", "")),
        "credits": str(data.get("credits", "")),
        "published": bool(data.get("published", False)),
    }


@bp.get("/projects")
@login_required
def list_projects():
    rows = db.fetch_all(
        """SELECT p.id, p.slug, p.title, p.client, p.year, p.published, p.sort_order,
                  p.poster_path, c.name AS category
           FROM projects p LEFT JOIN categories c ON c.id = p.category_id
           ORDER BY p.sort_order, p.id DESC"""
    )
    return {"projects": rows}


@bp.post("/projects")
@login_required
def create_project():
    data = request.get_json(silent=True) or {}
    try:
        p = _project_payload(data)
    except ValueError as e:
        return utils.json_error(str(e))
    row = db.fetch_one(
        """INSERT INTO projects (title, slug, client, category_id, year, video_url,
                                 video_embed_url, description, credits, published, sort_order)
           VALUES (%(title)s, %(slug)s, %(client)s, %(category_id)s, %(year)s, %(video_url)s,
                   %(video_embed_url)s, %(description)s, %(credits)s, %(published)s,
                   (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects))
           RETURNING id""",
        p,
    )
    return utils.json_ok({"id": row["id"]})


@bp.get("/projects/<int:project_id>")
@login_required
def get_project(project_id):
    row = db.fetch_one("SELECT * FROM projects WHERE id = %s", (project_id,))
    if not row:
        return utils.json_error("not found", 404)
    stills = db.fetch_all(
        "SELECT id, path FROM project_stills WHERE project_id = %s ORDER BY sort_order, id",
        (project_id,),
    )
    row["stills"] = stills
    return row


@bp.put("/projects/<int:project_id>")
@login_required
def update_project(project_id):
    if not db.fetch_one("SELECT id FROM projects WHERE id = %s", (project_id,)):
        return utils.json_error("not found", 404)
    data = request.get_json(silent=True) or {}
    try:
        p = _project_payload(data, project_id=project_id)
    except ValueError as e:
        return utils.json_error(str(e))
    p["id"] = project_id
    db.execute(
        """UPDATE projects SET title=%(title)s, slug=%(slug)s, client=%(client)s,
               category_id=%(category_id)s, year=%(year)s, video_url=%(video_url)s,
               video_embed_url=%(video_embed_url)s, description=%(description)s,
               credits=%(credits)s, published=%(published)s, updated_at=now()
           WHERE id=%(id)s""",
        p,
    )
    return utils.json_ok()


@bp.delete("/projects/<int:project_id>")
@login_required
def delete_project(project_id):
    row = db.fetch_one(
        "SELECT poster_path, preview_path FROM projects WHERE id = %s", (project_id,)
    )
    if not row:
        return utils.json_error("not found", 404)
    stills = db.fetch_all(
        "SELECT path FROM project_stills WHERE project_id = %s", (project_id,)
    )
    db.execute("DELETE FROM projects WHERE id = %s", (project_id,))
    media.delete_asset(row["poster_path"])
    media.delete_asset(row["preview_path"])
    for s in stills:
        media.delete_asset(s["path"])
    return utils.json_ok()


@bp.put("/projects/reorder")
@login_required
def reorder_projects():
    ids = (request.get_json(silent=True) or {}).get("ids", [])
    with db.get_conn() as conn:
        for i, pid in enumerate(ids):
            conn.execute(
                "UPDATE projects SET sort_order = %s WHERE id = %s", (i + 1, int(pid))
            )
    return utils.json_ok()


# ---------- media uploads ----------

def _get_file():
    f = request.files.get("file")
    if not f:
        raise media.MediaError("no file provided")
    return f


@bp.post("/media/projects/<int:project_id>/poster")
@login_required
def upload_poster(project_id):
    row = db.fetch_one("SELECT poster_path FROM projects WHERE id = %s", (project_id,))
    if not row:
        return utils.json_error("not found", 404)
    try:
        rel = media.save_upload(_get_file(), "poster")
    except media.MediaError as e:
        return utils.json_error(str(e))
    db.execute("UPDATE projects SET poster_path = %s, updated_at = now() WHERE id = %s",
               (rel, project_id))
    media.delete_asset(row["poster_path"])
    return utils.json_ok({"path": f"/media/{rel}"})


@bp.post("/media/projects/<int:project_id>/preview")
@login_required
def upload_preview(project_id):
    row = db.fetch_one("SELECT preview_path FROM projects WHERE id = %s", (project_id,))
    if not row:
        return utils.json_error("not found", 404)
    try:
        rel = media.save_upload(_get_file(), "preview")
    except media.MediaError as e:
        return utils.json_error(str(e))
    db.execute("UPDATE projects SET preview_path = %s, updated_at = now() WHERE id = %s",
               (rel, project_id))
    media.delete_asset(row["preview_path"])
    return utils.json_ok({"path": f"/media/{rel}"})


@bp.delete("/media/projects/<int:project_id>/preview")
@login_required
def delete_preview(project_id):
    row = db.fetch_one("SELECT preview_path FROM projects WHERE id = %s", (project_id,))
    if not row:
        return utils.json_error("not found", 404)
    db.execute("UPDATE projects SET preview_path = NULL WHERE id = %s", (project_id,))
    media.delete_asset(row["preview_path"])
    return utils.json_ok()


@bp.post("/media/projects/<int:project_id>/stills")
@login_required
def upload_stills(project_id):
    if not db.fetch_one("SELECT id FROM projects WHERE id = %s", (project_id,)):
        return utils.json_error("not found", 404)
    files = request.files.getlist("file")
    if not files:
        return utils.json_error("no files provided")
    added = []
    for f in files:
        try:
            rel = media.save_upload(f, "still")
        except media.MediaError as e:
            return utils.json_error(f"{f.filename}: {e}")
        row = db.fetch_one(
            """INSERT INTO project_stills (project_id, path, sort_order)
               VALUES (%s, %s, (SELECT COALESCE(MAX(sort_order), 0) + 1
                                FROM project_stills WHERE project_id = %s))
               RETURNING id""",
            (project_id, rel, project_id),
        )
        added.append({"id": row["id"], "path": f"/media/{rel}"})
    return utils.json_ok({"stills": added})


@bp.delete("/media/stills/<int:still_id>")
@login_required
def delete_still(still_id):
    row = db.fetch_one("SELECT path FROM project_stills WHERE id = %s", (still_id,))
    if not row:
        return utils.json_error("not found", 404)
    db.execute("DELETE FROM project_stills WHERE id = %s", (still_id,))
    media.delete_asset(row["path"])
    return utils.json_ok()


@bp.post("/media/hero-loop")
@login_required
def upload_hero_loop():
    old = utils.get_settings().get("hero_loop_path", "")
    try:
        rel = media.save_upload(_get_file(), "hero")
    except media.MediaError as e:
        return utils.json_error(str(e))
    utils.put_settings({"hero_loop_path": rel})
    media.delete_asset(old)
    return utils.json_ok({"path": f"/media/{rel}"})


@bp.delete("/media/hero-loop")
@login_required
def delete_hero_loop():
    old = utils.get_settings().get("hero_loop_path", "")
    utils.put_settings({"hero_loop_path": ""})
    media.delete_asset(old)
    return utils.json_ok()


# ---------- categories / services / clients ----------

def _simple_crud(table, fields):
    def list_items():
        cols = ", ".join(("id",) + fields + ("sort_order",))
        return {"items": db.fetch_all(f"SELECT {cols} FROM {table} ORDER BY sort_order, id")}

    def create_item():
        data = request.get_json(silent=True) or {}
        values = {f: str(data.get(f, "")).strip() for f in fields}
        if not values[fields[0]]:
            return utils.json_error(f"{fields[0]} is required")
        if table == "categories":
            values["slug"] = utils.slugify(values["name"])
            if db.fetch_one("SELECT id FROM categories WHERE slug = %s", (values["slug"],)):
                return utils.json_error("a category with this name already exists")
        cols = ", ".join(values)
        placeholders = ", ".join(f"%({f})s" for f in values)
        row = db.fetch_one(
            f"""INSERT INTO {table} ({cols}, sort_order)
                VALUES ({placeholders}, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM {table}))
                RETURNING id""",
            values,
        )
        return utils.json_ok({"id": row["id"]})

    def update_item(item_id):
        data = request.get_json(silent=True) or {}
        values = {f: str(data.get(f, "")).strip() for f in fields}
        if not values[fields[0]]:
            return utils.json_error(f"{fields[0]} is required")
        if table == "categories":
            values["slug"] = utils.slugify(values["name"])
            other = db.fetch_one(
                "SELECT id FROM categories WHERE slug = %s AND id != %s",
                (values["slug"], item_id),
            )
            if other:
                return utils.json_error("a category with this name already exists")
        sets = ", ".join(f"{f} = %({f})s" for f in values)
        values["id"] = item_id
        db.execute(f"UPDATE {table} SET {sets} WHERE id = %(id)s", values)
        return utils.json_ok()

    def delete_item(item_id):
        db.execute(f"DELETE FROM {table} WHERE id = %s", (item_id,))
        return utils.json_ok()

    def reorder_items():
        ids = (request.get_json(silent=True) or {}).get("ids", [])
        with db.get_conn() as conn:
            for i, iid in enumerate(ids):
                conn.execute(
                    f"UPDATE {table} SET sort_order = %s WHERE id = %s", (i + 1, int(iid))
                )
        return utils.json_ok()

    bp.add_url_rule(f"/{table}", f"list_{table}", login_required(list_items), methods=["GET"])
    bp.add_url_rule(f"/{table}", f"create_{table}", login_required(create_item), methods=["POST"])
    bp.add_url_rule(f"/{table}/reorder", f"reorder_{table}", login_required(reorder_items), methods=["PUT"])
    bp.add_url_rule(f"/{table}/<int:item_id>", f"update_{table}", login_required(update_item), methods=["PUT"])
    bp.add_url_rule(f"/{table}/<int:item_id>", f"delete_{table}", login_required(delete_item), methods=["DELETE"])


_simple_crud("categories", ("name",))
_simple_crud("services", ("title", "description"))
_simple_crud("clients", ("name",))


# ---------- content blocks (rich page sections) ----------

@bp.get("/blocks")
@login_required
def list_blocks():
    return {
        "blocks": db.fetch_all(
            """SELECT id, title, show_title, published, sort_order, updated_at
               FROM content_blocks ORDER BY sort_order, id"""
        )
    }


@bp.get("/blocks/<int:block_id>")
@login_required
def get_block(block_id):
    row = db.fetch_one("SELECT * FROM content_blocks WHERE id = %s", (block_id,))
    if not row:
        return utils.json_error("not found", 404)
    return row


def _block_payload(data):
    title = str(data.get("title", "")).strip()
    if not title:
        raise ValueError("title is required")
    return {
        "title": title,
        "show_title": bool(data.get("show_title", True)),
        "body_html": sanitize_html(str(data.get("body_html", ""))),
        "published": bool(data.get("published", False)),
    }


@bp.post("/blocks")
@login_required
def create_block():
    try:
        p = _block_payload(request.get_json(silent=True) or {})
    except ValueError as e:
        return utils.json_error(str(e))
    row = db.fetch_one(
        """INSERT INTO content_blocks (title, show_title, body_html, published, sort_order)
           VALUES (%(title)s, %(show_title)s, %(body_html)s, %(published)s,
                   (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM content_blocks))
           RETURNING id""",
        p,
    )
    return utils.json_ok({"id": row["id"]})


@bp.put("/blocks/<int:block_id>")
@login_required
def update_block(block_id):
    if not db.fetch_one("SELECT id FROM content_blocks WHERE id = %s", (block_id,)):
        return utils.json_error("not found", 404)
    try:
        p = _block_payload(request.get_json(silent=True) or {})
    except ValueError as e:
        return utils.json_error(str(e))
    p["id"] = block_id
    db.execute(
        """UPDATE content_blocks
           SET title=%(title)s, show_title=%(show_title)s, body_html=%(body_html)s,
               published=%(published)s, updated_at=now()
           WHERE id=%(id)s""",
        p,
    )
    return utils.json_ok({"body_html": p["body_html"]})


@bp.delete("/blocks/<int:block_id>")
@login_required
def delete_block(block_id):
    db.execute("DELETE FROM content_blocks WHERE id = %s", (block_id,))
    return utils.json_ok()


@bp.put("/blocks/reorder")
@login_required
def reorder_blocks():
    ids = (request.get_json(silent=True) or {}).get("ids", [])
    with db.get_conn() as conn:
        for i, bid in enumerate(ids):
            conn.execute(
                "UPDATE content_blocks SET sort_order = %s WHERE id = %s", (i + 1, int(bid))
            )
    return utils.json_ok()


@bp.post("/media/content-image")
@login_required
def upload_content_image():
    try:
        rel = media.save_upload(_get_file(), "content")
    except media.MediaError as e:
        return utils.json_error(str(e))
    return utils.json_ok({"path": f"/media/{rel}"})


# ---------- settings ----------

@bp.get("/settings")
@login_required
def get_settings():
    settings = utils.get_settings()
    for key in utils.SECRET_SETTINGS:
        if settings.get(key):
            settings[key] = utils.MASK
    return settings


@bp.put("/settings")
@login_required
def put_settings():
    data = request.get_json(silent=True) or {}
    known = utils.PUBLIC_SETTINGS | {
        "smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_tls", "smtp_from"
    }
    updates = {}
    for key, value in data.items():
        if key not in known or key == "hero_loop_path":
            continue
        if key in utils.SECRET_SETTINGS and value == utils.MASK:
            continue
        if key == "showreel_url" and str(value).strip():
            try:
                videourl.parse_video_url(str(value))
            except ValueError as e:
                return utils.json_error(str(e))
        updates[key] = str(value)
    utils.put_settings(updates)
    return utils.json_ok()


@bp.post("/settings/test-smtp")
@login_required
def test_smtp():
    settings = utils.get_settings()
    if not emailer.smtp_configured(settings):
        return utils.json_error("SMTP host is not configured")
    data = request.get_json(silent=True) or {}
    to_addr = str(data.get("to", "")).strip() or settings.get("contact_email", "")
    if not to_addr:
        return utils.json_error("no recipient — set a contact email or provide one")
    try:
        emailer.send_mail(
            settings, to_addr, "Vova Media — SMTP test",
            "This is a test message. Your SMTP settings work.",
        )
    except Exception as e:
        return utils.json_error(f"send failed: {e}")
    return utils.json_ok({"sent_to": to_addr})
