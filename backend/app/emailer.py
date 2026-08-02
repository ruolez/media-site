import logging
import smtplib
import threading
from email.message import EmailMessage

from . import db

log = logging.getLogger(__name__)


def smtp_configured(settings):
    return bool(settings.get("smtp_host"))


def send_mail(settings, to_addr, subject, body):
    """Send synchronously; raises on failure."""
    host = settings["smtp_host"]
    port = int(settings.get("smtp_port") or 587)
    user = settings.get("smtp_user", "")
    password = settings.get("smtp_password", "")
    use_tls = settings.get("smtp_tls", "true") == "true"
    from_addr = settings.get("smtp_from") or user or "noreply@localhost"

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(body)

    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=10)
    else:
        server = smtplib.SMTP(host, port, timeout=10)
    try:
        if use_tls and port != 465:
            server.starttls()
        if user:
            server.login(user, password)
        server.send_message(msg)
    finally:
        server.quit()


def send_inquiry_email_async(settings, inquiry_id, to_addr, subject, body):
    def worker():
        try:
            send_mail(settings, to_addr, subject, body)
            db.execute("UPDATE inquiries SET email_sent = true WHERE id = %s", (inquiry_id,))
        except Exception as e:
            log.warning("inquiry email failed: %s", e)
            db.execute(
                "UPDATE inquiries SET email_error = %s WHERE id = %s",
                (str(e)[:500], inquiry_id),
            )

    threading.Thread(target=worker, daemon=True).start()
