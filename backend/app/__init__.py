import logging
import os

from flask import Flask

from . import config


def create_app():
    logging.basicConfig(level=logging.INFO)

    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=config.SECRET_KEY,
        PERMANENT_SESSION_LIFETIME=config.SESSION_LIFETIME,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=config.COOKIE_SECURE,
        MAX_CONTENT_LENGTH=None,  # nginx enforces per-location body limits
        JSON_SORT_KEYS=False,
    )

    for d in ("posters", "previews", "stills", "hero", "content"):
        os.makedirs(os.path.join(config.ASSETS_DIR, d), exist_ok=True)
    os.makedirs(config.UPLOADS_DIR, exist_ok=True)

    from . import db, migrations, security

    db.open_pool()
    migrations.run_migrations()
    security.seed_admin()

    from .routes import register_blueprints

    register_blueprints(app)

    @app.after_request
    def no_store_api(resp):
        resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    return app
