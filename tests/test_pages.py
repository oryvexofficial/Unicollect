"""Static checks for the public site (pages/). No server, no browser."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "pages"
HTML = sorted(p for p in PAGES.rglob("*.html"))
SITE = [p for p in HTML if p.parent.name != "chat"]


def test_chat_page_in_sync_with_panel():
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / "sync_chat.py"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_chat_page_runs_in_pages_mode():
    s = (PAGES / "chat" / "index.html").read_text(encoding="utf-8")
    assert 'data-api="pages"' in s and 'data-root="../"' in s
    assert not re.search(r'(?:href|src)="/static/', s), "chat page must not depend on the service's /static"
    assert "../assets/chat.js" in s and "../assets/chat.css" in s


def test_every_site_page_has_floating_header_and_footer():
    for p in SITE:
        s = p.read_text(encoding="utf-8")
        assert s.count("data-top") == 1, p
        assert "data-foot" in s and "foot-card" in s, p
        assert 'data-nav-key="chat"' in s, f"{p}: nav has no chat link"


def test_relative_links_resolve():
    bad = []
    for p in SITE:
        if p.name == "404.html":
            continue                       # uses a pinned <base>
        s = p.read_text(encoding="utf-8")
        for href in re.findall(r'(?:href|src)="([^"#?]+)', s):
            if re.match(r"^(https?:|mailto:|data:|//)", href) or href.startswith("/"):
                continue
            t = (p.parent / href).resolve()
            if t.is_dir():
                t = t / "index.html"
            if not t.exists():
                bad.append(f"{p.relative_to(PAGES)} -> {href}")
    assert not bad, bad


def test_api_docs_accordion_ids_match_toc():
    s = (PAGES / "api" / "index.html").read_text(encoding="utf-8")
    ids = set(re.findall(r'<details class="ep[^"]*" id="([^"]+)"', s))
    toc = set(re.findall(r'href="#(ep-[^"]+)"', s))
    assert ids and toc <= ids, toc - ids
    assert 'data-ep-all="open"' in s and 'data-ep-all="close"' in s
