import os
from datetime import timedelta

DATABASE_URL = os.environ["DATABASE_URL"]
SECRET_KEY = os.environ["SECRET_KEY"]
ADMIN_INITIAL_PASSWORD = os.environ.get("ADMIN_INITIAL_PASSWORD", "")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080").rstrip("/")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "false").lower() == "true"

DATA_DIR = os.environ.get("DATA_DIR", "/data")
ASSETS_DIR = os.path.join(DATA_DIR, "assets")
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")

CHUNK_MAX_BYTES = 33 * 1024 * 1024  # 32MB chunk + slack
IMAGE_MAX_BYTES = 20 * 1024 * 1024
VIDEO_MAX_BYTES = 200 * 1024 * 1024
MIN_FREE_DISK_BYTES = 1 * 1024 * 1024 * 1024

SESSION_LIFETIME = timedelta(days=7)
