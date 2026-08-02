import hashlib
import os
import re
import secrets
from urllib.parse import quote

from flask import Blueprint, Response, request

from .. import config, db, utils
from ..auth import login_required

bp = Blueprint("admin_upload_links", __name__, url_prefix="/api/admin")

STORAGE_NAME_RE = re.compile(r"^[0-9a-f]{32}$")


def _link_status(row):
    from datetime import datetime, timezone

    if row["revoked_at"]:
        return "revoked"
    if row["expires_at"] < datetime.now(timezone.utc):
        return "expired"
    return "active"


@bp.get("/upload-links")
@login_required
def list_links():
    rows = db.fetch_all(
        """SELECT l.id, l.label, l.max_bytes, l.max_files, l.expires_at, l.revoked_at,
                  l.created_at,
                  COUNT(f.id) AS file_count,
                  COALESCE(SUM(f.bytes_received), 0) AS bytes_used
           FROM upload_links l
           LEFT JOIN upload_files f ON f.link_id = l.id
           GROUP BY l.id
           ORDER BY l.created_at DESC"""
    )
    for r in rows:
        r["status"] = _link_status(r)
        r["expires_at"] = r["expires_at"].isoformat()
        r["created_at"] = r["created_at"].isoformat()
        r["revoked_at"] = r["revoked_at"].isoformat() if r["revoked_at"] else None
        r["bytes_used"] = int(r["bytes_used"])
    return {"links": rows}


@bp.post("/upload-links")
@login_required
def create_link():
    data = request.get_json(silent=True) or {}
    label = str(data.get("label", "")).strip()
    if not label:
        return utils.json_error("label is required")
    try:
        expiry_days = int(data.get("expiry_days") or 14)
        max_gb = float(data.get("max_gb") or 200)
        max_files = int(data.get("max_files") or 100)
    except (TypeError, ValueError):
        return utils.json_error("invalid numeric value")
    if expiry_days < 1 or max_gb <= 0 or max_files < 1:
        return utils.json_error("values must be positive")

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.fetch_one(
        """INSERT INTO upload_links (token_hash, label, max_bytes, max_files, expires_at)
           VALUES (%s, %s, %s, %s, now() + make_interval(days => %s))
           RETURNING id""",
        (token_hash, label, int(max_gb * 1024**3), max_files, expiry_days),
    )
    return utils.json_ok(
        {"id": row["id"], "url": f"{config.PUBLIC_BASE_URL}/u/{token}"}
    )


@bp.post("/upload-links/<int:link_id>/revoke")
@login_required
def revoke_link(link_id):
    db.execute("UPDATE upload_links SET revoked_at = now() WHERE id = %s", (link_id,))
    return utils.json_ok()


@bp.delete("/upload-links/<int:link_id>")
@login_required
def delete_link(link_id):
    files = db.fetch_all(
        "SELECT storage_name FROM upload_files WHERE link_id = %s", (link_id,)
    )
    db.execute("DELETE FROM upload_links WHERE id = %s", (link_id,))
    for f in files:
        path = os.path.join(config.UPLOADS_DIR, f["storage_name"])
        if os.path.isfile(path):
            os.unlink(path)
    return utils.json_ok()


@bp.get("/upload-links/<int:link_id>/files")
@login_required
def link_files(link_id):
    rows = db.fetch_all(
        """SELECT id, client_name, total_bytes, bytes_received, sha256, status,
                  created_at, completed_at
           FROM upload_files WHERE link_id = %s ORDER BY created_at""",
        (link_id,),
    )
    for r in rows:
        r["created_at"] = r["created_at"].isoformat()
        r["completed_at"] = r["completed_at"].isoformat() if r["completed_at"] else None
    return {"files": rows}


@bp.get("/upload-files/<int:file_id>/download")
@login_required
def download_file(file_id):
    row = db.fetch_one(
        "SELECT client_name, storage_name FROM upload_files WHERE id = %s", (file_id,)
    )
    if not row or not STORAGE_NAME_RE.match(row["storage_name"]):
        return utils.json_error("not found", 404)

    safe_name = row["client_name"].replace("\r", "").replace("\n", "").replace('"', "")
    ascii_fallback = safe_name.encode("ascii", "replace").decode() or "download"
    resp = Response("")
    resp.headers["X-Accel-Redirect"] = f"/protected-files/{row['storage_name']}"
    resp.headers["Content-Type"] = "application/octet-stream"
    resp.headers["Content-Disposition"] = (
        f'attachment; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(safe_name)}"
    )
    return resp


@bp.delete("/upload-files/<int:file_id>")
@login_required
def delete_file(file_id):
    row = db.fetch_one(
        "SELECT storage_name FROM upload_files WHERE id = %s", (file_id,)
    )
    if not row:
        return utils.json_error("not found", 404)
    db.execute("DELETE FROM upload_files WHERE id = %s", (file_id,))
    path = os.path.join(config.UPLOADS_DIR, row["storage_name"])
    if STORAGE_NAME_RE.match(row["storage_name"]) and os.path.isfile(path):
        os.unlink(path)
    return utils.json_ok()
