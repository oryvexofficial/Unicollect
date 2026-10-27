#!/usr/bin/env bash
set -euo pipefail

STATUS="${1:?status required}"
URL="${2:-}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Publishes the current Guard link to the gh-pages branch:
#   assets/status.json  - used by the site (status pill, muvixo dialog)
#   api/links.json      - public machine-readable links (base URL + every endpoint)
#   api/links.txt       - just the base URL, for `curl -s .../api/links.txt`
#
# بررسی وضعیت فعلی در gh-pages برای جلوگیری از بازنویسی اطلاعات جدید توسط وورک‌فلوی قدیمی
OLD_RUN=0
OLD_STATUS=""
if git ls-remote --exit-code --heads "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" gh-pages > /dev/null 2>&1; then
    cd "$OUT"
    git init -q
    git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
    git fetch -q --depth 1 origin gh-pages
    git checkout -q -b gh-pages origin/gh-pages
    if [ -f "assets/status.json" ]; then
        OLD_RUN=$(python3 -c "import json; print(json.load(open('assets/status.json')).get('run_number', 0))" 2>/dev/null || echo "0")
        OLD_STATUS=$(python3 -c "import json; print(json.load(open('assets/status.json')).get('status', ''))" 2>/dev/null || echo "")
    fi
    find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
else
    cd "$OUT"
    git init -q
    git checkout -q -b gh-pages
fi

# اگر این وورک فلو از وورک فلو منتشر شده قدیمی‌تر است، لغو کن
CURRENT_RUN="${GITHUB_RUN_NUMBER:-0}"
if [ "$CURRENT_RUN" -lt "$OLD_RUN" ]; then
    echo "Current run ($CURRENT_RUN) is older than published run ($OLD_RUN). Aborting to prevent overwriting."
    exit 0
fi

# Zero-downtime handoff: while an older run is still serving (status online),
# a new run must not flip the site to "starting"; it publishes "online" once
# its own tunnel works and the old run then retires.
if [ "$STATUS" = "starting" ] && [ "$OLD_STATUS" = "online" ] && [ "$CURRENT_RUN" -gt "$OLD_RUN" ]; then
    echo "Run $OLD_RUN is still online; keeping its link until run $CURRENT_RUN is ready."
    exit 0
fi
# an older run may only take itself offline, never a newer run's link
if [ "$STATUS" = "offline" ] && [ "$CURRENT_RUN" -ne "$OLD_RUN" ] && [ "$OLD_RUN" != "0" ]; then
    echo "Published link belongs to run $OLD_RUN, not $CURRENT_RUN; leaving it alone."
    exit 0
fi

# the chat page is generated from app/static (single source of truth)
python3 "$ROOT/scripts/sync_chat.py" >/dev/null || echo "::warning::sync_chat.py failed; publishing the committed chat copy"
cp -R "$ROOT/pages/." .
touch .nojekyll

# 404.html is served for every missing path, so pin its <base> to the site
# root (otherwise its CSS/JS 404 too on nested paths). PAGES_BASE overrides
# it, e.g. "/" for a custom domain.
OWNER="${GITHUB_REPOSITORY%%/*}"; REPO_NAME="${GITHUB_REPOSITORY#*/}"
if [ -z "${PAGES_BASE:-}" ]; then
  if [ -f CNAME ] || [ "${REPO_NAME,,}" = "${OWNER,,}.github.io" ]; then PAGES_BASE="/"; else PAGES_BASE="/${REPO_NAME}/"; fi
fi
[ -f 404.html ] && sed -i "s#__PAGES_BASE__#${PAGES_BASE}#" 404.html
mkdir -p assets

mkdir -p api
python3 - "assets/status.json" "api/links.json" "api/links.txt" "$STATUS" "$URL" <<'PY'
import base64, datetime, json, os, sys
status_path, links_path, txt_path, status, url = sys.argv[1:6]
server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
repo = os.environ["GITHUB_REPOSITORY"]
run_id = os.environ.get("GITHUB_RUN_ID", "")
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
run_url = f"{server}/{repo}/actions/runs/{run_id}" if run_id else None
run_number = int(os.environ.get("GITHUB_RUN_NUMBER", 0))
commit = os.environ.get("GITHUB_SHA", "")[:7]
url = (url or "").rstrip("/")

with open(status_path, "w", encoding="utf-8") as f:
    json.dump({
        "status": status,
        "url_payload": base64.b64encode(url.encode()).decode() if url else None,
        "updated_at": now, "run_url": run_url, "run_number": run_number, "commit": commit,
    }, f, ensure_ascii=False, indent=2)

endpoints = [
    ("GET", "/api/v1"), ("GET", "/api/v1/health"), ("GET", "/api/v1/ready"),
    ("GET", "/api/v1/info"), ("GET", "/api/v1/models"), ("GET", "/api/v1/config"),
    ("GET", "/api/v1/stats"), ("GET", "/api/v1/check"), ("POST", "/api/v1/check"),
    ("POST", "/api/v1/check/batch"), ("POST", "/api/v1/verdict"), ("POST", "/api/v1/score"),
    ("POST", "/api/v1/sentences"), ("POST", "/api/v1/censor"), ("POST", "/api/v1/moderations"),
    ("POST", "/api/v1/profanity"), ("POST", "/api/v1/language"),
    ("POST", "/api/v1/fingilish/detect"), ("POST", "/api/v1/fingilish/transliterate"),
    ("POST", "/api/v1/normalize"), ("POST", "/api/check"), ("GET", "/health"),
]
online = bool(url) and status == "online"
links = {
    "service": "unicollect-guard",
    "status": status,
    "online": online,
    "base_url": url or None,
    "links": {
        "panel": url or None,
        "api": f"{url}/api/v1" if url else None,
        "health": f"{url}/api/v1/health" if url else None,
        "swagger": f"{url}/docs" if url else None,
        "redoc": f"{url}/redoc" if url else None,
        "openapi": f"{url}/openapi.json" if url else None,
        "guide": f"{url}/api-docs" if url else None,
    },
    "endpoints": [{"method": m, "path": p, "url": (url + p) if url else None} for m, p in endpoints],
    "updated_at": now, "run_url": run_url, "run_number": run_number, "commit": commit,
}
with open(links_path, "w", encoding="utf-8") as f:
    json.dump(links, f, ensure_ascii=False, indent=2)
with open(txt_path, "w", encoding="utf-8") as f:
    f.write((url or "offline") + "\n")
PY

git add -A
if git diff --cached --quiet; then
    echo "Status unchanged; nothing to publish."
    exit 0
fi
git -c user.name="github-actions[bot]" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -q -m "status: ${STATUS} ${URL}"
    
for attempt in 1 2 3; do
    if git push -q "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" gh-pages; then
        echo "Published '${STATUS}' ${URL} to gh-pages (Run $CURRENT_RUN)"
        exit 0
    fi
    sleep $((attempt * 3))
done
echo "::warning::Could not push status page to gh-pages"
exit 1