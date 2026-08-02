from flask import Blueprint, request

from .. import db, utils
from ..auth import login_required

bp = Blueprint("admin_inquiries", __name__, url_prefix="/api/admin")


@bp.get("/inquiries")
@login_required
def list_inquiries():
    sql = """SELECT id, name, email, company, message, is_read, email_sent,
                    email_error, created_at
             FROM inquiries"""
    if request.args.get("unread") == "1":
        sql += " WHERE NOT is_read"
    sql += " ORDER BY created_at DESC LIMIT 500"
    rows = db.fetch_all(sql)
    unread = db.fetch_one("SELECT count(*) AS n FROM inquiries WHERE NOT is_read")["n"]
    for r in rows:
        r["created_at"] = r["created_at"].isoformat()
    return {"inquiries": rows, "unread": unread}


@bp.put("/inquiries/<int:inquiry_id>/read")
@login_required
def mark_read(inquiry_id):
    db.execute("UPDATE inquiries SET is_read = true WHERE id = %s", (inquiry_id,))
    return utils.json_ok()


@bp.delete("/inquiries/<int:inquiry_id>")
@login_required
def delete_inquiry(inquiry_id):
    db.execute("DELETE FROM inquiries WHERE id = %s", (inquiry_id,))
    return utils.json_ok()
