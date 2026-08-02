import re
from urllib.parse import parse_qs, urlparse

YT_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
VIMEO_HASH = re.compile(r"^[a-f0-9]+$")


def parse_video_url(url):
    """Normalize a YouTube/Vimeo URL to (provider, embed_url). Raises ValueError."""
    url = url.strip()
    parsed = urlparse(url if "//" in url else "https://" + url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    parts = [p for p in parsed.path.split("/") if p]

    video_id = None
    if host in ("youtube.com", "m.youtube.com", "youtube-nocookie.com"):
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        elif parts and parts[0] in ("shorts", "embed", "live") and len(parts) > 1:
            video_id = parts[1]
    elif host == "youtu.be" and parts:
        video_id = parts[0]

    if video_id:
        if not YT_ID.match(video_id):
            raise ValueError("invalid YouTube video id")
        return "youtube", f"https://www.youtube-nocookie.com/embed/{video_id}"

    if host in ("vimeo.com", "player.vimeo.com"):
        nums = [p for p in parts if p.isdigit()]
        if nums:
            vid = nums[0]
            idx = parts.index(vid)
            embed = f"https://player.vimeo.com/video/{vid}"
            if len(parts) > idx + 1 and VIMEO_HASH.match(parts[idx + 1]):
                embed += f"?h={parts[idx + 1]}"
            return "vimeo", embed

    raise ValueError("unsupported video URL — use a YouTube or Vimeo link")
