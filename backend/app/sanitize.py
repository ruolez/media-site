import re
from html import escape
from html.parser import HTMLParser

ALLOWED = {
    "p": set(), "br": set(), "hr": set(),
    "strong": set(), "b": set(), "em": set(), "i": set(), "u": set(), "s": set(),
    "h2": set(), "h3": set(), "h4": set(),
    "ul": set(), "ol": set(), "li": set(),
    "blockquote": set(), "figure": set(), "figcaption": set(),
    "a": {"href", "title"},
    "img": {"src", "alt"},
}
VOID = {"br", "hr", "img"}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed"}
HREF_RE = re.compile(r"^(https?://|mailto:|/)", re.I)


class _Sanitizer(HTMLParser):
    """Allowlist sanitizer: unknown tags are unwrapped (text kept),
    script/style/iframe content is dropped entirely, attributes are
    stripped to the per-tag allowlist with scheme checks."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.stack = []
        self.drop_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in DROP_WITH_CONTENT:
            self.drop_depth += 1
            return
        if self.drop_depth or tag not in ALLOWED:
            return
        parts = []
        for key, value in attrs:
            if key not in ALLOWED[tag] or value is None:
                continue
            value = value.strip()
            if tag == "a" and key == "href" and not HREF_RE.match(value):
                continue
            if tag == "img" and key == "src" and not value.startswith("/media/"):
                continue
            parts.append(f' {key}="{escape(value, quote=True)}"')
        if tag == "img" and not any(p.startswith(" src=") for p in parts):
            return
        self.out.append(f"<{tag}{''.join(parts)}>")
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.drop_depth = max(0, self.drop_depth - 1)
            return
        if self.drop_depth or tag in VOID or tag not in self.stack:
            return
        while self.stack:
            open_tag = self.stack.pop()
            self.out.append(f"</{open_tag}>")
            if open_tag == tag:
                break

    def handle_data(self, data):
        if not self.drop_depth:
            self.out.append(escape(data))


def sanitize_html(html):
    s = _Sanitizer()
    s.feed(html or "")
    s.close()
    while s.stack:
        s.out.append(f"</{s.stack.pop()}>")
    return "".join(s.out).strip()
