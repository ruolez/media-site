import time

from flask import Blueprint, request, session

from .. import db, security, utils
from ..auth import login_required

bp = Blueprint("admin_auth", __name__, url_prefix="/api/admin")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    password = str(data.get("password", ""))
    row = db.fetch_one("SELECT password_hash FROM admin_account WHERE id = 1")
    if not row or not security.verify_password(row["password_hash"], password):
        time.sleep(0.5)
        return utils.json_error("incorrect password", 401)
    session.permanent = True
    session["admin"] = True
    return utils.json_ok()


@bp.post("/logout")
def logout():
    session.clear()
    return utils.json_ok()


@bp.get("/me")
@login_required
def me():
    return utils.json_ok()


@bp.put("/password")
@login_required
def change_password():
    data = request.get_json(silent=True) or {}
    current = str(data.get("current", ""))
    new = str(data.get("new", ""))
    if len(new) < 8:
        return utils.json_error("new password must be at least 8 characters")
    row = db.fetch_one("SELECT password_hash FROM admin_account WHERE id = 1")
    if not security.verify_password(row["password_hash"], current):
        return utils.json_error("current password is incorrect", 401)
    db.execute(
        "UPDATE admin_account SET password_hash = %s, updated_at = now() WHERE id = 1",
        (security.hash_password(new),),
    )
    return utils.json_ok()
