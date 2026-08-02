from functools import wraps

from flask import jsonify, request, session

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("admin"):
            return jsonify({"error": "unauthorized"}), 401
        if request.method in MUTATING_METHODS and request.headers.get("X-CSRF") != "1":
            return jsonify({"error": "missing CSRF header"}), 403
        return fn(*args, **kwargs)

    return wrapper
