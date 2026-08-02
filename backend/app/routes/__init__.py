from . import (
    admin_auth,
    admin_content,
    admin_inquiries,
    admin_upload_links,
    public,
    uploads,
)


def register_blueprints(app):
    app.register_blueprint(public.bp)
    app.register_blueprint(admin_auth.bp)
    app.register_blueprint(admin_content.bp)
    app.register_blueprint(admin_inquiries.bp)
    app.register_blueprint(admin_upload_links.bp)
    app.register_blueprint(uploads.bp)
