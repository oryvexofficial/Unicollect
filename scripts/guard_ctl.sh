#!/usr/bin/env bash
# Unicollect Guard service control, used by .github/workflows/deploy.yml.
#
#   guard_ctl.sh retry N CMD...     run CMD up to N times with a growing back-off
#   guard_ctl.sh start              start gunicorn in the background (server.log)
#   guard_ctl.sh stop               stop gunicorn
#   guard_ctl.sh wait-healthy [S]   wait up to S seconds (default 600) for /health = ok
#   guard_ctl.sh boot [TRIES]       start + wait, restarting up to TRIES times (default 3)
#   guard_ctl.sh health             print local /health JSON (empty on failure)
#   guard_ctl.sh tunnel             (re)start the Cloudflare quick tunnel, print its URL
#   guard_ctl.sh published-run      print "<run_number> <status>" from gh-pages status.json
#
# Everything here is idempotent and safe to call again after a failure: that is
# what lets the keep-alive loop heal a crashed model server or a dead tunnel
# without restarting the whole workflow.
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-8000}"
LOCAL="http://localhost:${PORT}"

log() { echo "[guard_ctl] $*"; }

retry() {
  local n="$1"; shift
  local i
  for i in $(seq 1 "$n"); do
    if "$@"; then return 0; fi
    if [ "$i" -lt "$n" ]; then
      log "attempt ${i}/${n} failed: $*; retrying in $((i * 15))s"
      sleep $((i * 15))
    fi
  done
  log "giving up after ${n} attempts: $*"
  return 1
}

health() { curl -fs --max-time 10 "${LOCAL}/health" 2>/dev/null || true; }

is_ok() { health | grep -q '"status":"ok"'; }

start() {
  if pgrep -f "gunicorn app.main:app" >/dev/null; then log "gunicorn already running"; return 0; fi
  log "starting gunicorn"
  nohup bash scripts/start_server.sh >> server.log 2>&1 &
  sleep 2
}

stop() {
  pkill -TERM -f "gunicorn app.main:app" 2>/dev/null || true
  for _ in $(seq 1 20); do pgrep -f "gunicorn app.main:app" >/dev/null || return 0; sleep 1; done
  pkill -KILL -f "gunicorn app.main:app" 2>/dev/null || true
}

wait_healthy() {
  local limit="${1:-600}" waited=0 st=""
  while [ "$waited" -lt "$limit" ]; do
    st="$(health)"
    if echo "$st" | grep -q '"status":"ok"'; then log "healthy after ~${waited}s: $st"; return 0; fi
    if ! pgrep -f "gunicorn app.main:app" >/dev/null; then log "gunicorn exited while loading"; break; fi
    if [ $((waited % 30)) -eq 0 ]; then log "loading (${waited}s) ${st}"; fi
    sleep 3; waited=$((waited + 3))
  done
  log "not healthy after ${waited}s"
  tail -n 60 server.log 2>/dev/null || true
  return 1
}

boot() {
  local tries="${1:-3}" i
  for i in $(seq 1 "$tries"); do
    start
    if wait_healthy 600; then return 0; fi
    log "boot attempt ${i}/${tries} failed, restarting the model server"
    stop
    sleep $((i * 10))
  done
  return 1
}

tunnel() {
  pkill -f "cloudflared tunnel --url ${LOCAL}" 2>/dev/null || true
  sleep 1
  : > tunnel.log
  nohup ./cloudflared tunnel --url "${LOCAL}" --no-autoupdate > tunnel.log 2>&1 &
  local url="" i
  for i in $(seq 1 60); do
    url="$(grep -oE "https://[a-zA-Z0-9.-]+\.trycloudflare\.com" tunnel.log | head -n1 || true)"
    [ -n "$url" ] && break
    sleep 2
  done
  if [ -z "$url" ]; then log "no tunnel URL"; tail -n 40 tunnel.log >&2; return 1; fi
  # a fresh quick tunnel needs a few seconds before the edge routes it
  for i in $(seq 1 20); do
    curl -fs --max-time 10 "${url}/health" >/dev/null 2>&1 && break
    sleep 3
  done
  echo "$url"
}

published_run() {
  : "${GITHUB_REPOSITORY:?}"
  local raw
  raw="$(gh api "repos/${GITHUB_REPOSITORY}/contents/assets/status.json?ref=gh-pages" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || true)"
  [ -z "$raw" ] && { echo "0 unknown"; return 0; }
  python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(int(d.get("run_number") or 0), d.get("status") or "unknown")' "$raw" 2>/dev/null || echo "0 unknown"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  retry) retry "$@" ;;
  start) start ;;
  stop) stop ;;
  wait-healthy) wait_healthy "${1:-600}" ;;
  boot) boot "${1:-3}" ;;
  health) health; echo ;;
  ok) is_ok ;;
  tunnel) tunnel ;;
  published-run) published_run ;;
  *) echo "usage: $0 {retry|start|stop|wait-healthy|boot|health|ok|tunnel|published-run}" >&2; exit 2 ;;
esac
