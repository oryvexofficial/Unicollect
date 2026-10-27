"""
Unicollect Guard: FastAPI app.

  /                 Guard web panel (app/static)
  /api/v1/*         Public JSON API (app/api_v1.py)
  /api/check        Legacy endpoint used by the web panel (kept as-is)
  /health           Legacy health (used by the status page + workflow)
  /docs  /redoc     Interactive OpenAPI docs
  /api-docs         Persian API guide (the same page as GitHub Pages /api/)
  /site/*           The public site in pages/, served from the service too
  /chat             Redirects to /site/chat/ (the chat page of the public site)
  404               Browsers get pages/404.html, API clients get JSON
"""
import hashlib
import mimetypes
import os
import time
import traceback
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from anyio import to_thread
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import engine
from app.api_v1 import ApiError, api_error_response, error_body, router as api_v1_router

# some slim images ship without a woff2 mime type -> fonts served as text/plain
mimetypes.add_type("font/woff2", ".woff2")

BASE_DIR = Path(__file__).resolve().parent
PAGES_DIR = BASE_DIR.parent / "pages"

# Backwards compatibility for anything that imported these from app.main
state = engine.state
MODEL_SPECS = engine.MODEL_SPECS
ensemble_predict = engine.predict
MAX_TEXT_LENGTH = engine.MAX_TEXT_LENGTH


@asynccontextmanager
async def _lifespan(_app):
    to_thread.current_default_thread_limiter().total_tokens = engine.MAX_THREADPOOL_TOKENS
    print(f"[Guard] Worker ready. cpu={engine.CPU_COUNT} "
          f"parallel_inferences={engine.MAX_CONCURRENT_INFERENCES}", flush=True)
    yield


def _load_not_found() -> str:
    try:
        return (PAGES_DIR / "404.html").read_text(encoding="utf-8").replace("__PAGES_BASE__", "/site/")
    except OSError:
        return ""


_NOT_FOUND_HTML = _load_not_found()

app = FastAPI(
    title="Unicollect Guard API",
    version=engine.VERSION,
    description=(
        "Toxic / offensive text detection for **Persian**, **Fingilish** and **English**, "
        "decided by consensus voting across 5 models.\n\n"
        "Start with `POST /api/v1/check`. Errors always look like "
        "`{\"error\": {\"code\", \"message\", \"status\"}}`.\n\n"
        "Persian guide: [/api-docs](/api-docs)"
    ),
    lifespan=_lifespan,
    openapi_tags=[
        {"name": "guard", "description": "Toxicity verdicts (uses the models)."},
        {"name": "utilities", "description": "Instant text tools (no models)."},
        {"name": "discovery", "description": "Status, models, config, stats."},
        {"name": "admin", "description": "Needs GUARD_ADMIN_KEY."},
    ],
)

# The API is meant to be called from other sites (including the GitHub Pages
# "try it" console), so CORS is open. Lock it down with GUARD_CORS_ORIGINS.
_origins = [o.strip() for o in os.environ.get("GUARD_CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization", "X-Request-ID"],
    expose_headers=["X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining",
                    "X-RateLimit-Reset", "Retry-After", "X-Process-Time"],
    max_age=600,
)


# ------------------------------------------------------------------
# Rate limit (per client IP, fixed 60 s window) + request id + timing
# GUARD_RATE_LIMIT=0 disables it.
# ------------------------------------------------------------------
RATE_LIMIT = int(os.environ.get("GUARD_RATE_LIMIT", "120"))
_buckets = {}


def _client_ip(request: Request) -> str:
    for h in ("cf-connecting-ip", "x-real-ip"):
        v = request.headers.get(h)
        if v:
            return v.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def _edge(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
    limited = (RATE_LIMIT > 0 and request.method == "POST"
               and request.url.path.startswith("/api/"))
    headers = {}
    if limited:
        now = int(time.time())
        window = now - now % 60
        ip = _client_ip(request)
        w, n = _buckets.get(ip, (window, 0))
        if w != window:
            w, n = window, 0
        n += 1
        _buckets[ip] = (w, n)
        if len(_buckets) > 10_000:          # forget old windows
            for k in [k for k, (bw, _) in _buckets.items() if bw != window]:
                _buckets.pop(k, None)
        reset = w + 60 - now
        headers = {"X-RateLimit-Limit": str(RATE_LIMIT),
                   "X-RateLimit-Remaining": str(max(0, RATE_LIMIT - n)),
                   "X-RateLimit-Reset": str(reset)}
        if n > RATE_LIMIT:
            body = error_body(429, "rate_limited",
                              f"Too many requests: {RATE_LIMIT}/minute. Retry in {reset}s.")
            return JSONResponse(body, status_code=429,
                                headers={**headers, "Retry-After": str(reset), "X-Request-ID": rid})
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    response.headers["X-Process-Time"] = f"{(time.perf_counter() - t0) * 1000:.0f}ms"
    for k, v in headers.items():
        response.headers[k] = v
    if request.url.path.endswith(".woff2"):
        # versioned with ?v=, safe to cache for a year
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        response.headers["Access-Control-Allow-Origin"] = "*"
    return response


# ------------------------------------------------------------------
# One error shape everywhere under /api/v1
# ------------------------------------------------------------------
@app.exception_handler(ApiError)
async def _api_error(_request: Request, exc: ApiError):
    engine.stats["errors"] += 1
    return api_error_response(exc)


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError):
    engine.stats["errors"] += 1
    details = [{"field": ".".join(str(p) for p in e.get("loc", [])[1:]), "message": e.get("msg")}
               for e in exc.errors()]
    if request.url.path == "/api/check":
        return JSONResponse({"error": "invalid request body", "details": details}, status_code=422)
    return JSONResponse(error_body(422, "invalid_body", "Request body is invalid.", {"details": details}),
                        status_code=422)


@app.exception_handler(StarletteHTTPException)
async def _http_error(request: Request, exc: StarletteHTTPException):
    if request.url.path.startswith("/api/"):
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(error_body(exc.status_code, code, str(exc.detail)), status_code=exc.status_code)
    # Browsers get the site's styled 404 page (assets pinned to /site/);
    # scripts and API clients keep the JSON body.
    if exc.status_code == 404 and _NOT_FOUND_HTML and "text/html" in request.headers.get("accept", ""):
        return HTMLResponse(_NOT_FOUND_HTML, status_code=404)
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    engine.stats["errors"] += 1
    print(f"[Guard] {request.url.path} EXC:\n{traceback.format_exc()}", flush=True)
    return JSONResponse(error_body(500, "internal_error", f"{type(exc).__name__}: {exc}"), status_code=500)


app.include_router(api_v1_router)


# ------------------------------------------------------------------
# Legacy endpoints (the web panel and old integrations use these)
# ------------------------------------------------------------------
class TextIn(BaseModel):
    text: str


@app.get("/health", tags=["discovery"], summary="Legacy health")
def health():
    s = engine.state
    return {
        "status": "ok" if engine.is_ready() else ("loading" if not s["ready"] else "error"),
        "mode": "demo" if engine.DEMO_MODE else "production",
        "version": engine.VERSION,
        "loaded_models": [engine.MODEL_SPECS[n]["label"] for n in s["models"]],
        "errors": dict(s["errors"]),
        "inflight": s["inflight"],
        "peak": s["peak"],
        "concurrency": engine.MAX_CONCURRENT_INFERENCES,
    }


@app.post("/api/check", tags=["guard"], summary="Legacy check (always HTTP 200)")
def check(data: TextIn):
    """Kept for the web panel: errors come back as {"error": "..."} with HTTP 200.
    New integrations should use POST /api/v1/check."""
    try:
        if not engine.is_ready():
            return {"error": engine.state["errors"] or "no models loaded yet"}
        if len(data.text) > engine.MAX_TEXT_LENGTH:
            return {"error": f"text too long ({len(data.text)} chars, max {engine.MAX_TEXT_LENGTH})"}
        if not data.text.strip():
            return {"error": "text is empty"}
        engine.stats["requests"] += 1
        with engine.Busy():
            return engine.predict(data.text)
    except Exception as exc:
        print(f"[Guard] /api/check EXC:\n{traceback.format_exc()}", flush=True)
        return {"error": f"{type(exc).__name__}: {exc}"}


# ------------------------------------------------------------------
# Web panel + docs pages
# ------------------------------------------------------------------
def _asset_version() -> str:
    h = hashlib.sha1()
    for f in ("style.css", "script.js"):
        try:
            h.update((BASE_DIR / "static" / f).read_bytes())
        except OSError:
            pass
    return h.hexdigest()[:10]


_INDEX_HTML = (BASE_DIR / "static" / "index.html").read_text(encoding="utf-8") \
    .replace("__V__", _asset_version())


@app.get("/", include_in_schema=False)
def index():
    return HTMLResponse(_INDEX_HTML, headers={"Cache-Control": "no-cache"})


@app.get("/api-docs", include_in_schema=False)
@app.get("/api-docs/", include_in_schema=False)
def api_docs():
    if PAGES_DIR.is_dir():
        return RedirectResponse("/site/api/")
    return RedirectResponse("/docs")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # browsers ask for /favicon.ico regardless of <link rel=icon>; avoid a 404 per page view
    return RedirectResponse("/static/favicon.svg", status_code=301)


@app.get("/site", include_in_schema=False)
def site_root():
    return RedirectResponse("/site/")


@app.get("/chat", include_in_schema=False)
@app.get("/chat/", include_in_schema=False)
def chat_page():
    # the public site's chat page (same UI as /, but in the site's frame)
    return RedirectResponse("/site/chat/")


@app.get("/api", include_in_schema=False)
def api_root():
    return RedirectResponse("/api/v1")


app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
if PAGES_DIR.is_dir():
    app.mount("/site", StaticFiles(directory=str(PAGES_DIR), html=True), name="site")
