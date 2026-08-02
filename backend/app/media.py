import os
import uuid

from . import config

KINDS = {
    "poster": ("posters", "image", config.IMAGE_MAX_BYTES),
    "still": ("stills", "image", config.IMAGE_MAX_BYTES),
    "preview": ("previews", "video", config.VIDEO_MAX_BYTES),
    "hero": ("hero", "video", config.VIDEO_MAX_BYTES),
    "content": ("content", "image", config.IMAGE_MAX_BYTES),
}

IMAGE_EXTS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def sniff(head):
    if head.startswith(b"\xff\xd8\xff"):
        return "image", ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", ".png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", ".webp"
    if head[4:8] == b"ftyp":
        return "video", ".mp4"
    return None, None


class MediaError(Exception):
    pass


def save_upload(file_storage, kind):
    """Validate and store an uploaded file; returns path relative to ASSETS_DIR."""
    subdir, want_type, max_bytes = KINDS[kind]

    head = file_storage.stream.read(16)
    file_storage.stream.seek(0)
    got_type, ext = sniff(head)
    if got_type != want_type:
        raise MediaError(
            "unsupported file type — expected "
            + ("JPEG/PNG/WebP image" if want_type == "image" else "MP4 video")
        )

    directory = os.path.join(config.ASSETS_DIR, subdir)
    os.makedirs(directory, exist_ok=True)
    name = uuid.uuid4().hex + ext
    tmp_path = os.path.join(directory, name + ".tmp")
    final_path = os.path.join(directory, name)

    written = 0
    try:
        with open(tmp_path, "wb") as f:
            while True:
                buf = file_storage.stream.read(1024 * 1024)
                if not buf:
                    break
                written += len(buf)
                if written > max_bytes:
                    raise MediaError(f"file too large (max {max_bytes // (1024*1024)}MB)")
                f.write(buf)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, final_path)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise

    return f"{subdir}/{name}"


def delete_asset(rel_path):
    if not rel_path:
        return
    path = os.path.normpath(os.path.join(config.ASSETS_DIR, rel_path))
    if path.startswith(config.ASSETS_DIR) and os.path.isfile(path):
        os.unlink(path)
