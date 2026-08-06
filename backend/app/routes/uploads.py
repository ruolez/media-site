import hashlib
import os
import re
import shutil
import uuid
from urllib.parse import quote

from flask import Blueprint, Response, request

from .. import config, db, utils

bp = Blueprint("uploads", __name__, url_prefix="/api/upload")

STORAGE_NAME_RE = re.compile(r"^[0-9a-f]{32}$")


class UploadError(Exception):
    def __init__(self, message, status=400, **extra):
        self.message = message
        self.status = status
        self.extra = extra


@bp.errorhandler(UploadError)
def handle_upload_error(e):
    return utils.json_error(e.message, e.status, **e.extra)


def _resolve_link(conn, token):
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = conn.execute(
        """SELECT * FROM upload_links
           WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > now()""",
        (token_hash,),
    ).fetchone()
    if not row:
        raise UploadError("not found", 404)
    return row


def _file_path(storage_name):
    return os.path.join(config.UPLOADS_DIR, storage_name)


@bp.get("/<token>/session")
def get_session(token):
    with db.get_conn() as conn:
        link = _resolve_link(conn, token)
        files = conn.execute(
            """SELECT id, client_name, total_bytes, bytes_received, fingerprint, status
               FROM upload_files WHERE link_id = %s ORDER BY created_at""",
            (link["id"],),
        ).fetchall()
    return {
        "label": link["label"],
        "expires_at": link["expires_at"].isoformat(),
        "max_bytes": link["max_bytes"],
        "max_files": link["max_files"],
        "bytes_used": sum(f["bytes_received"] for f in files),
        "files": files,
    }


@bp.get("/<token>/files/<int:file_id>/download")
def download_file(token, file_id):
    with db.get_conn() as conn:
        link = _resolve_link(conn, token)
        row = conn.execute(
            """SELECT client_name, storage_name FROM upload_files
               WHERE id = %s AND link_id = %s AND status = 'complete'""",
            (file_id, link["id"]),
        ).fetchone()
    if not row or not STORAGE_NAME_RE.match(row["storage_name"]):
        raise UploadError("not found", 404)

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


@bp.post("/<token>/files")
def register_file(token):
    data = request.get_json(silent=True) or {}
    name = utils.clean_display_name(str(data.get("name", "")))
    fingerprint = str(data.get("fingerprint", "")).strip()[:128]
    try:
        size = int(data.get("size"))
    except (TypeError, ValueError):
        raise UploadError("invalid size")
    if size < 0 or not fingerprint:
        raise UploadError("invalid registration")

    with db.get_conn() as conn:
        link = _resolve_link(conn, token)

        existing = conn.execute(
            "SELECT * FROM upload_files WHERE link_id = %s AND fingerprint = %s",
            (link["id"], fingerprint),
        ).fetchone()
        if existing:
            return {
                "file_id": existing["id"],
                "offset": existing["bytes_received"],
                "status": existing["status"],
            }

        stats = conn.execute(
            """SELECT count(*) AS n, COALESCE(SUM(total_bytes), 0) AS declared
               FROM upload_files WHERE link_id = %s""",
            (link["id"],),
        ).fetchone()
        if stats["n"] >= link["max_files"]:
            raise UploadError("file limit for this link reached")
        if stats["declared"] + size > link["max_bytes"]:
            raise UploadError("size limit for this link exceeded")

        storage_name = uuid.uuid4().hex
        row = conn.execute(
            """INSERT INTO upload_files (link_id, client_name, storage_name, total_bytes,
                                         fingerprint)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (link_id, fingerprint) DO NOTHING
               RETURNING id""",
            (link["id"], name, storage_name, size, fingerprint),
        ).fetchone()
        if row is None:  # concurrent register won the race
            existing = conn.execute(
                "SELECT * FROM upload_files WHERE link_id = %s AND fingerprint = %s",
                (link["id"], fingerprint),
            ).fetchone()
            return {
                "file_id": existing["id"],
                "offset": existing["bytes_received"],
                "status": existing["status"],
            }

    os.makedirs(config.UPLOADS_DIR, exist_ok=True)
    open(_file_path(storage_name), "wb").close()
    return {"file_id": row["id"], "offset": 0, "status": "uploading"}


@bp.put("/<token>/files/<int:file_id>/chunk")
def upload_chunk(token, file_id):
    try:
        offset = int(request.args.get("offset", ""))
    except ValueError:
        raise UploadError("invalid offset")

    content_length = request.content_length
    if content_length is None or content_length <= 0:
        raise UploadError("missing request body")
    if content_length > config.CHUNK_MAX_BYTES:
        raise UploadError("chunk too large", 413)

    if shutil.disk_usage(config.UPLOADS_DIR).free < config.MIN_FREE_DISK_BYTES:
        raise UploadError("server storage full", 507)

    with db.get_conn() as conn:
        link = _resolve_link(conn, token)
        f_row = conn.execute(
            "SELECT * FROM upload_files WHERE id = %s AND link_id = %s FOR UPDATE",
            (file_id, link["id"]),
        ).fetchone()
        if not f_row:
            raise UploadError("not found", 404)
        if f_row["status"] == "complete":
            raise UploadError("file already complete", 409, offset=f_row["total_bytes"])
        if offset != f_row["bytes_received"]:
            raise UploadError("offset mismatch", 409, offset=f_row["bytes_received"])
        if offset + content_length > f_row["total_bytes"]:
            raise UploadError("chunk exceeds declared file size")

        used = conn.execute(
            "SELECT COALESCE(SUM(bytes_received), 0) AS used FROM upload_files WHERE link_id = %s",
            (link["id"],),
        ).fetchone()["used"]
        if used + content_length > link["max_bytes"]:
            raise UploadError("size limit for this link exceeded")

        path = _file_path(f_row["storage_name"])
        if not os.path.exists(path):
            open(path, "wb").close()

        received = 0
        with open(path, "r+b") as f:
            f.truncate(offset)  # discard bytes from any previously crashed write
            f.seek(offset)
            while received < content_length:
                buf = request.stream.read(min(1024 * 1024, content_length - received))
                if not buf:
                    break
                f.write(buf)
                received += len(buf)
            if received != content_length:
                # client died mid-chunk: nothing committed, disk healed on next attempt
                raise UploadError("incomplete chunk body")
            f.flush()
            os.fsync(f.fileno())

        new_offset = offset + received
        conn.execute(
            "UPDATE upload_files SET bytes_received = %s WHERE id = %s",
            (new_offset, file_id),
        )
    return {"offset": new_offset}


@bp.post("/<token>/files/<int:file_id>/complete")
def complete_file(token, file_id):
    data = request.get_json(silent=True) or {}
    client_sha = str(data.get("sha256", "")).strip().lower() or None

    with db.get_conn() as conn:
        link = _resolve_link(conn, token)
        f_row = conn.execute(
            "SELECT * FROM upload_files WHERE id = %s AND link_id = %s FOR UPDATE",
            (file_id, link["id"]),
        ).fetchone()
        if not f_row:
            raise UploadError("not found", 404)
        if f_row["status"] == "complete":
            return {"status": "complete", "sha256": f_row["sha256"]}

        path = _file_path(f_row["storage_name"])
        disk_size = os.path.getsize(path) if os.path.exists(path) else 0
        if (f_row["bytes_received"] != f_row["total_bytes"]
                or disk_size < f_row["total_bytes"]):
            raise UploadError("upload incomplete", 409, offset=f_row["bytes_received"])

        h = hashlib.sha256()
        with open(path, "rb") as f:
            while True:
                buf = f.read(1024 * 1024)
                if not buf:
                    break
                h.update(buf)
        server_sha = h.hexdigest()

        if client_sha and client_sha != server_sha:
            conn.execute(
                "UPDATE upload_files SET bytes_received = 0 WHERE id = %s", (file_id,)
            )
            os.truncate(path, 0)
            raise UploadError("hash mismatch — upload reset, please retry", 409, offset=0)

        conn.execute(
            """UPDATE upload_files
               SET status = 'complete', sha256 = %s, completed_at = now()
               WHERE id = %s""",
            (server_sha, file_id),
        )
    return {"status": "complete", "sha256": server_sha}
