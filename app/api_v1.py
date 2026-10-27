"""
Unicollect Guard public API, version 1  (mounted at /api/v1)

Every endpoint returns JSON. Errors use real HTTP status codes and one shape:
    {"error": {"code": "text_too_long", "message": "...", "status": 413}}

Interactive docs: /docs (Swagger), /redoc, and the Persian guide at /api-docs.
"""
import os
import time
import uuid
from typing import Dict, List, Optional, Union

from anyio import to_thread
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import engine
from app import consensus as C
from app.consensus import detect_script, SEVERITY
from app.fingilish import (
    fingilish_to_persian, looks_like_fingilish, find_profane, mask_profane,
    normalize_text,
)

router = APIRouter(prefix="/api/v1")


# ------------------------------------------------------------------
# Errors
# ------------------------------------------------------------------
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, extra: Optional[Dict] = None):
        self.status, self.code, self.message, self.extra = status, code, message, extra or {}


def error_body(status: int, code: str, message: str, extra: Optional[Dict] = None):
    body = {"error": {"code": code, "message": message, "status": status}}
    if extra:
        body["error"].update(extra)
    return body


def api_error_response(exc: ApiError):
    return JSONResponse(error_body(exc.status, exc.code, exc.message, exc.extra), status_code=exc.status)


# ------------------------------------------------------------------
# Optional API keys
#   GUARD_API_KEYS="key1,key2"  -> every POST /api/v1/* needs one of them
#   GUARD_ADMIN_KEY="secret"    -> needed for admin endpoints (cache clear)
# Send as  X-API-Key: key   or   Authorization: Bearer key
# ------------------------------------------------------------------
def _keys():
    raw = os.environ.get("GUARD_API_KEYS", "")
    return {k.strip() for k in raw.split(",") if k.strip()}


def _presented_key(x_api_key: Optional[str], authorization: Optional[str]) -> str:
    if x_api_key:
        return x_api_key.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return ""


def require_key(x_api_key: Optional[str] = Header(None),
                authorization: Optional[str] = Header(None)):
    keys = _keys()
    if not keys:
        return
    if _presented_key(x_api_key, authorization) not in keys:
        raise ApiError(401, "unauthorized", "Missing or invalid API key (X-API-Key header).")


def require_admin(x_api_key: Optional[str] = Header(None),
                  authorization: Optional[str] = Header(None)):
    admin = os.environ.get("GUARD_ADMIN_KEY", "")
    if not admin:
        raise ApiError(403, "admin_disabled", "Set GUARD_ADMIN_KEY on the server to enable admin endpoints.")
    if _presented_key(x_api_key, authorization) != admin:
        raise ApiError(401, "unauthorized", "Invalid admin key.")


def auth_enabled() -> bool:
    return bool(_keys())


# ------------------------------------------------------------------
# Shared helpers
# ------------------------------------------------------------------
def _track(endpoint: str):
    engine.stats["requests"] += 1
    by = engine.stats["by_endpoint"]
    by[endpoint] = by.get(endpoint, 0) + 1


def _ensure_ready():
    if not engine.is_ready():
        raise ApiError(503, "not_ready", "Models are still loading. Retry in a few seconds.",
                       {"errors": dict(engine.state["errors"])})


def _validate_text(text: str, field: str = "text"):
    if text is None or not str(text).strip():
        raise ApiError(400, "empty_text", f"'{field}' is empty.")
    if len(text) > engine.MAX_TEXT_LENGTH:
        raise ApiError(413, "text_too_long",
                       f"'{field}' has {len(text)} characters; max is {engine.MAX_TEXT_LENGTH}.",
                       {"max_length": engine.MAX_TEXT_LENGTH})


def _slim(result: Dict, detailed: bool) -> Dict:
    if detailed or "decision" not in result:
        return result
    keys = ("decision", "is_toxic", "flagged", "severity", "confidence", "max_raw",
            "votes_count", "total_models", "script", "reason", "fingilish_detected",
            "fingilish_text", "decided_by", "cached", "latency_ms")
    return {k: result.get(k) for k in keys}


def _predict_locked(text: str, use_cache: bool = True) -> Dict:
    with engine.Busy():
        return engine.predict(text, use_cache=use_cache)


async def _predict(text: str, use_cache: bool = True) -> Dict:
    res = await to_thread.run_sync(_predict_locked, text, use_cache)
    if "error" in res:
        raise ApiError(503, "no_models", str(res["error"]), {"details": res.get("details")})
    return res


# ------------------------------------------------------------------
# Schemas (they also drive the Swagger / ReDoc docs)
# ------------------------------------------------------------------
class CheckIn(BaseModel):
    text: str = Field(..., description="Text to check (Persian, Fingilish, English or mixed).",
                      json_schema_extra={"example": "salam, mamnoon az komaket"})
    detailed: bool = Field(True, description="false -> only the verdict fields, no per-model scores.")
    use_cache: bool = Field(True, description="Reuse the verdict of an identical recent text.")


class BatchIn(BaseModel):
    texts: List[str] = Field(..., description=f"Up to {engine.MAX_BATCH_ITEMS} texts.",
                             json_schema_extra={"example": ["سلام وقت بخیر", "You are stupid", "to khar hasti"]})
    detailed: bool = False
    use_cache: bool = True


class TextIn(BaseModel):
    text: str = Field(..., json_schema_extra={"example": "to khar hasti"})


class ScoreIn(BaseModel):
    text: str
    models: Optional[List[str]] = Field(None, description="Subset of model ids; default = all applicable.")
    script: Optional[str] = Field(None, description="Force 'fa', 'en' or 'mixed' instead of auto-detect.")


class CensorIn(BaseModel):
    text: str = Field(..., json_schema_extra={"example": "you are a k1r, have a nice day"})
    char: str = Field("*", min_length=1, max_length=1, description="Mask character.")
    mode: str = Field("words", description="'words' masks known insults; 'sentences' replaces whole toxic sentences.")
    include_contextual: bool = Field(False, description="Also mask context-dependent words (e.g. 'khar').")
    keep_first_letter: bool = False
    min_decision: str = Field("TOXIC", description="Sentence threshold for 'sentences' mode: TOXIC or SUSPECT.")


class ModerationIn(BaseModel):
    input: Union[str, List[str]] = Field(..., json_schema_extra={"example": "You are completely stupid"})
    model: Optional[str] = "unicollect-guard"


# ------------------------------------------------------------------
# Discovery / status
# ------------------------------------------------------------------
ENDPOINTS = [
    ("GET",  "/api/v1",                         "This index: every endpoint, version, limits."),
    ("GET",  "/api/v1/health",                  "Liveness + model status, uptime, load."),
    ("GET",  "/api/v1/ready",                   "200 when models are loaded, 503 while loading."),
    ("GET",  "/api/v1/info",                    "Service name, version, languages, limits, auth."),
    ("GET",  "/api/v1/models",                  "All 5 models with language, weight, loaded state."),
    ("GET",  "/api/v1/models/{model_id}",       "One model."),
    ("GET",  "/api/v1/config",                  "Consensus thresholds and the decision table."),
    ("GET",  "/api/v1/stats",                   "Counters since start: decisions, latency, cache."),
    ("GET",  "/api/v1/check?text=...",          "Quick check via query string."),
    ("POST", "/api/v1/check",                   "Full verdict for one text."),
    ("POST", "/api/v1/check/batch",             "Verdicts for up to 32 texts + summary."),
    ("POST", "/api/v1/verdict",                 "Smallest answer: decision, flagged, confidence."),
    ("POST", "/api/v1/score",                   "Raw per-model scores, no voting."),
    ("POST", "/api/v1/sentences",               "Verdict for every sentence of a long text."),
    ("POST", "/api/v1/censor",                  "Return the text with insults masked."),
    ("POST", "/api/v1/moderations",             "OpenAI-compatible moderation response."),
    ("POST", "/api/v1/profanity",               "Dictionary insults with positions (no models, instant)."),
    ("POST", "/api/v1/language",                "Script detection: fa / en / mixed + Fingilish."),
    ("POST", "/api/v1/fingilish/detect",        "Is this Latin text Fingilish?"),
    ("POST", "/api/v1/fingilish/transliterate", "Fingilish -> Persian script."),
    ("POST", "/api/v1/normalize",               "De-obfuscate (k1r, k.i.r, kiiiir -> kir)."),
    ("POST", "/api/v1/cache/clear",             "Admin: empty the verdict cache."),
]


def public_base(request: Request) -> str:
    """Public base URL, honouring Cloudflare / reverse-proxy headers."""
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    proto = request.headers.get("x-forwarded-proto")
    if not proto and "https" in (request.headers.get("cf-visitor") or ""):
        proto = "https"
    if host:
        if not proto:
            proto = "https" if host.endswith(".trycloudflare.com") else request.url.scheme
        return f"{proto}://{host}"
    return str(request.base_url).rstrip("/")


@router.get("", summary="API index", tags=["discovery"])
def index(request: Request):
    _track("index")
    base = public_base(request)
    return {
        "name": "Unicollect Guard API",
        "version": engine.VERSION,
        "base_url": base,
        "docs": {"swagger": base + "/docs", "redoc": base + "/redoc",
                 "openapi": base + "/openapi.json", "guide": base + "/api-docs"},
        "auth_required": auth_enabled(),
        "endpoints": [{"method": m, "path": p, "url": base + p.split("?")[0], "description": d}
                      for m, p, d in ENDPOINTS],
    }


@router.get("/health", summary="Health", tags=["discovery"])
def health():
    _track("health")
    s = engine.state
    status = "ok" if engine.is_ready() else ("loading" if not s["ready"] else "error")
    return {
        "status": status,
        "mode": "demo" if engine.DEMO_MODE else "production",
        "version": engine.VERSION,
        "loaded_models": list(s["models"]),
        "loaded_count": len(s["models"]),
        "total_models": len(engine.MODEL_SPECS),
        "errors": dict(s["errors"]),
        "inflight": s["inflight"],
        "peak": s["peak"],
        "concurrency": engine.MAX_CONCURRENT_INFERENCES,
        "uptime_s": round(time.time() - s["started_at"]),
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


@router.get("/ready", summary="Readiness probe", tags=["discovery"])
def ready():
    if engine.is_ready():
        return {"ready": True}
    return JSONResponse({"ready": False, "errors": dict(engine.state["errors"])}, status_code=503)


@router.get("/info", summary="Service info", tags=["discovery"])
def info():
    _track("info")
    return {
        "name": "Unicollect Guard",
        "description": "Toxic / offensive text detection for Persian, Fingilish and English by 5-model consensus.",
        "version": engine.VERSION,
        "mode": "demo" if engine.DEMO_MODE else "production",
        "languages": ["fa", "fingilish", "en", "mixed"],
        "decisions": ["SAFE", "SUSPECT", "TOXIC"],
        "limits": {
            "max_text_length": engine.MAX_TEXT_LENGTH,
            "max_batch_items": engine.MAX_BATCH_ITEMS,
            "max_sentences": engine.MAX_SENTENCES,
            "rate_limit_per_minute": int(os.environ.get("GUARD_RATE_LIMIT", "120")),
            "cache_size": engine.CACHE_SIZE,
        },
        "auth_required": auth_enabled(),
        "made_by": "Muvixo",
    }


def _model_info(name: str) -> Dict:
    spec = engine.MODEL_SPECS[name]
    loaded = name in engine.state["models"]
    return {
        "id": name,
        "label": spec["label"],
        "label_en": spec["label_en"],
        "language": spec["lang"],
        "weight": spec["weight"],
        "mode": spec["mode"],
        "loaded": loaded,
        "error": engine.state["errors"].get(name),
        "hub_id": os.environ.get(spec["env"]),
        "runs_on": {"fa": engine.applicable(spec["lang"], "fa"),
                    "en": engine.applicable(spec["lang"], "en"),
                    "mixed": True},
    }


@router.get("/models", summary="List models", tags=["discovery"])
def models():
    _track("models")
    return {"models": [_model_info(n) for n in engine.MODEL_SPECS],
            "loaded": len(engine.state["models"]), "total": len(engine.MODEL_SPECS)}


@router.get("/models/{model_id}", summary="One model", tags=["discovery"])
def model(model_id: str):
    _track("model")
    if model_id not in engine.MODEL_SPECS:
        raise ApiError(404, "unknown_model", f"No model '{model_id}'.",
                       {"available": list(engine.MODEL_SPECS)})
    return _model_info(model_id)


@router.get("/config", summary="Thresholds and decision table", tags=["discovery"])
def config():
    _track("config")
    return {
        "per_model_vote_threshold": C.PER_MODEL_VOTE_THRESHOLD,
        "min_votes_for_toxic": C.MIN_VOTES_FOR_TOXIC,
        "strong_single_model": C.STRONG_SINGLE_MODEL,
        "fingilish_strong_single": C.FINGILISH_STRONG_SINGLE,
        "weak_suspect_threshold": C.WEAK_SUSPECT_THRESHOLD,
        "solo_vote_corroboration_floor": C.SOLO_VOTE_CORROBORATION_FLOOR,
        "solo_vote_suspect_floor": C.SOLO_VOTE_SUSPECT_FLOOR,
        "specialist_safe_floor": C.SPECIALIST_SAFE_FLOOR,
        "correlated_families": C.CORRELATED_FAMILIES,
        "specialist_by_script": C.SPECIALIST_BY_SCRIPT,
        "severity": SEVERITY,
        "decision_table": [
            "2+ models score >= 0.50 -> TOXIC (3 needed if voters are one family and the specialist says clean)",
            "1 model >= 0.90 and another >= 0.30 -> TOXIC",
            "1 model >= 0.90 and another >= 0.10 -> SUSPECT",
            "1 model >= 0.90 and all others < 0.10 -> SAFE",
            "a vote and max >= 0.60 -> SUSPECT",
            "otherwise -> SAFE",
        ],
    }


@router.get("/stats", summary="Usage counters", tags=["discovery"])
def stats_view():
    st = engine.stats
    texts = max(1, st["texts"])
    return {
        "requests": st["requests"],
        "texts_checked": st["texts"],
        "decisions": dict(st["decisions"]),
        "fingilish_texts": st["fingilish"],
        "cache_hits": st["cache_hits"],
        "cache_entries": engine.cache_size(),
        "avg_latency_ms": round(st["latency_total_ms"] / texts, 1) if st["texts"] else 0,
        "by_endpoint": dict(st["by_endpoint"]),
        "uptime_s": round(time.time() - engine.state["started_at"]),
    }


# ------------------------------------------------------------------
# Checking
# ------------------------------------------------------------------
@router.get("/check", summary="Quick check (GET)", tags=["guard"], dependencies=[Depends(require_key)])
async def check_get(text: str = Query(..., description="Text to check"),
                    detailed: bool = Query(False)):
    _track("check_get")
    _ensure_ready()
    _validate_text(text)
    return _slim(await _predict(text), detailed)


@router.post("/check", summary="Check one text", tags=["guard"], dependencies=[Depends(require_key)])
async def check(body: CheckIn):
    _track("check")
    _ensure_ready()
    _validate_text(body.text)
    res = await _predict(body.text, body.use_cache)
    out = _slim(res, body.detailed)
    out["id"] = "chk_" + uuid.uuid4().hex[:16]
    return out


@router.post("/check/batch", summary="Check many texts", tags=["guard"], dependencies=[Depends(require_key)])
async def check_batch(body: BatchIn):
    _track("check_batch")
    _ensure_ready()
    if not body.texts:
        raise ApiError(400, "empty_batch", "'texts' is empty.")
    if len(body.texts) > engine.MAX_BATCH_ITEMS:
        raise ApiError(413, "batch_too_large",
                       f"{len(body.texts)} texts; max is {engine.MAX_BATCH_ITEMS}.",
                       {"max_items": engine.MAX_BATCH_ITEMS})
    t0 = time.perf_counter()
    results = []
    for i, t in enumerate(body.texts):
        try:
            _validate_text(t, f"texts[{i}]")
            r = _slim(await _predict(t, body.use_cache), body.detailed)
            r["index"] = i
            results.append(r)
        except ApiError as e:
            results.append({"index": i, "error": {"code": e.code, "message": e.message}})
    summary = {"SAFE": 0, "SUSPECT": 0, "TOXIC": 0, "errors": 0}
    for r in results:
        if "decision" in r:
            summary[r["decision"]] += 1
        else:
            summary["errors"] += 1
    return {"count": len(results), "summary": summary,
            "flagged_indexes": [r["index"] for r in results if r.get("flagged")],
            "results": results, "latency_ms": round((time.perf_counter() - t0) * 1000)}


@router.post("/verdict", summary="Minimal verdict", tags=["guard"], dependencies=[Depends(require_key)])
async def verdict(body: TextIn):
    _track("verdict")
    _ensure_ready()
    _validate_text(body.text)
    r = await _predict(body.text)
    return {"decision": r["decision"], "flagged": r["flagged"], "is_toxic": r["is_toxic"],
            "confidence": r["confidence"]}


@router.post("/score", summary="Raw per-model scores", tags=["guard"], dependencies=[Depends(require_key)])
async def score(body: ScoreIn):
    _track("score")
    _ensure_ready()
    _validate_text(body.text)
    if body.models:
        unknown = [m for m in body.models if m not in engine.MODEL_SPECS]
        if unknown:
            raise ApiError(400, "unknown_model", f"Unknown model(s): {', '.join(unknown)}",
                           {"available": list(engine.MODEL_SPECS)})
    if body.script and body.script not in ("fa", "en", "mixed"):
        raise ApiError(400, "bad_script", "script must be 'fa', 'en' or 'mixed'.")

    def run():
        with engine.Busy():
            return engine.score_models(body.text, body.script, body.models)
    t0 = time.perf_counter()
    res = await to_thread.run_sync(run)
    res["votes"] = {k: v >= C.PER_MODEL_VOTE_THRESHOLD for k, v in res["scores"].items()}
    res["latency_ms"] = round((time.perf_counter() - t0) * 1000)
    return res


@router.post("/sentences", summary="Per-sentence verdicts", tags=["guard"], dependencies=[Depends(require_key)])
async def sentences(body: TextIn):
    _track("sentences")
    _ensure_ready()
    _validate_text(body.text)
    parts = engine.split_sentences(body.text)
    if len(parts) > engine.MAX_SENTENCES:
        raise ApiError(413, "too_many_sentences",
                       f"{len(parts)} sentences; max is {engine.MAX_SENTENCES}.")
    t0 = time.perf_counter()
    out = []
    for p in parts:
        r = await _predict(p["text"])
        out.append({**p, "decision": r["decision"], "confidence": r["confidence"],
                    "max_raw": r["max_raw"], "fingilish_detected": r["fingilish_detected"]})
    overall = engine.worst([o["decision"] for o in out]) if out else "SAFE"
    return {"decision": overall, "count": len(out),
            "flagged": [o for o in out if o["decision"] != "SAFE"],
            "sentences": out, "latency_ms": round((time.perf_counter() - t0) * 1000)}


@router.post("/censor", summary="Mask insults", tags=["guard"], dependencies=[Depends(require_key)])
async def censor(body: CensorIn):
    _track("censor")
    _validate_text(body.text)
    if body.mode not in ("words", "sentences"):
        raise ApiError(400, "bad_mode", "mode must be 'words' or 'sentences'.")
    if body.min_decision not in ("TOXIC", "SUSPECT"):
        raise ApiError(400, "bad_min_decision", "min_decision must be TOXIC or SUSPECT.")

    if body.mode == "words":
        masked, hits = mask_profane(body.text, body.char, body.include_contextual, body.keep_first_letter)
        return {"mode": "words", "text": masked, "original_length": len(body.text),
                "masked_count": len(hits), "masked": hits, "changed": masked != body.text}

    _ensure_ready()
    floor = SEVERITY[body.min_decision]
    parts = engine.split_sentences(body.text)[: engine.MAX_SENTENCES]
    out, last, replaced = [], 0, []
    for p in parts:
        r = await _predict(p["text"])
        out.append(body.text[last:p["start"]])
        if SEVERITY[r["decision"]] >= floor:
            out.append(body.char * len(p["text"]))
            replaced.append({**p, "decision": r["decision"]})
        else:
            out.append(p["text"])
        last = p["end"]
    out.append(body.text[last:])
    masked = "".join(out)
    return {"mode": "sentences", "text": masked, "masked_count": len(replaced),
            "masked": replaced, "changed": masked != body.text}


@router.post("/moderations", summary="OpenAI-compatible moderation", tags=["guard"],
             dependencies=[Depends(require_key)])
async def moderations(body: ModerationIn):
    """Same response shape as OpenAI's /v1/moderations, so existing moderation
    code can point at Unicollect Guard with only a base-URL change."""
    _track("moderations")
    _ensure_ready()
    inputs = [body.input] if isinstance(body.input, str) else list(body.input)
    if len(inputs) > engine.MAX_BATCH_ITEMS:
        raise ApiError(413, "batch_too_large", f"max {engine.MAX_BATCH_ITEMS} inputs")
    results = []
    for t in inputs:
        _validate_text(t, "input")
        r = await _predict(t)
        tox = r["max_raw"]
        results.append({
            "flagged": r["decision"] == "TOXIC",
            "categories": {"harassment": r["decision"] == "TOXIC", "toxic": r["decision"] == "TOXIC",
                           "suspect": r["decision"] == "SUSPECT"},
            "category_scores": {"harassment": tox, "toxic": r["confidence"]},
            "unicollect": {"decision": r["decision"], "votes_count": r["votes_count"],
                           "script": r["script"], "fingilish_detected": r["fingilish_detected"]},
        })
    return {"id": "modr-" + uuid.uuid4().hex[:24], "model": body.model or "unicollect-guard",
            "results": results}


# ------------------------------------------------------------------
# Text utilities (no models needed: instant, work while models load)
# ------------------------------------------------------------------
@router.post("/profanity", summary="Dictionary insults", tags=["utilities"], dependencies=[Depends(require_key)])
def profanity(body: TextIn):
    _track("profanity")
    _validate_text(body.text)
    hits = find_profane(body.text)
    return {"found": bool(hits), "count": len(hits),
            "strong_count": sum(1 for h in hits if not h["contextual"]), "terms": hits}


@router.post("/language", summary="Detect script", tags=["utilities"], dependencies=[Depends(require_key)])
def language(body: TextIn):
    _track("language")
    _validate_text(body.text)
    import re
    fa = len(re.findall(r'[\u0600-\u06FF]', body.text))
    en = len(re.findall(r'[A-Za-z]', body.text))
    script = detect_script(body.text)
    fing = script == "en" and looks_like_fingilish(body.text)
    total = fa + en
    return {"script": script, "fingilish": fing,
            "language": "fingilish" if fing else {"fa": "persian", "en": "english"}.get(script, "mixed"),
            "persian_ratio": round(fa / total, 3) if total else 0.0,
            "latin_ratio": round(en / total, 3) if total else 0.0,
            "persian_chars": fa, "latin_chars": en}


@router.post("/fingilish/detect", summary="Is it Fingilish?", tags=["utilities"], dependencies=[Depends(require_key)])
def fingilish_detect(body: TextIn):
    _track("fingilish_detect")
    _validate_text(body.text)
    script = detect_script(body.text)
    is_f = script == "en" and looks_like_fingilish(body.text)
    return {"fingilish": is_f, "script": script,
            "profane_terms": [h["persian"] for h in find_profane(body.text) if h["script"] == "latin"]}


@router.post("/fingilish/transliterate", summary="Fingilish to Persian", tags=["utilities"],
             dependencies=[Depends(require_key)])
def fingilish_transliterate(body: TextIn):
    _track("fingilish_transliterate")
    _validate_text(body.text)
    fa = fingilish_to_persian(body.text)
    return {"input": body.text, "persian": fa, "fingilish": looks_like_fingilish(body.text),
            "script_after": detect_script(fa) if fa else None}


@router.post("/normalize", summary="De-obfuscate text", tags=["utilities"], dependencies=[Depends(require_key)])
def normalize(body: TextIn):
    _track("normalize")
    _validate_text(body.text)
    n = normalize_text(body.text)
    return {"input": body.text, "normalized": n, "changed": n != body.text.lower().strip()}


@router.post("/cache/clear", summary="Admin: clear cache", tags=["admin"], dependencies=[Depends(require_admin)])
def cache_clear():
    return {"cleared": engine.cache_clear()}
