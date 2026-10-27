"""
Unicollect Guard engine: model loading, scoring and the 5-model ensemble.

Everything HTTP-related lives in app/main.py and app/api_v1.py; this module
only knows about text in, verdict out, so it can be reused from scripts.

Set GUARD_DEMO_MODE=1 to run WITHOUT torch / transformers / downloaded
models. A small dictionary-based scorer stands in for the five checkpoints,
so the web panel, the API and the docs can be developed and tested on any
laptop or CI box in seconds. /health reports "mode": "demo" so it can never
be mistaken for the real thing.
"""
import os

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import hashlib
import re
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, Iterable, List, Optional

from app.fingilish import (
    fingilish_to_persian, looks_like_fingilish, find_profane,
)
from app.consensus import (
    PER_MODEL_VOTE_THRESHOLD, MIN_VOTES_FOR_TOXIC, SEVERITY,
    detect_script, decide, worst,
)

VERSION = "2.2.0"
DEMO_MODE = os.environ.get("GUARD_DEMO_MODE", "").lower() in ("1", "true", "yes")

if not DEMO_MODE:
    import torch  # noqa: E402
    torch.set_num_threads(1)
    from transformers import AutoModelForSequenceClassification, AutoTokenizer  # noqa: E402

# ------------------------------------------------------------------
# Limits / concurrency
# ------------------------------------------------------------------
CPU_COUNT = os.cpu_count() or 4
MAX_CONCURRENT_INFERENCES = max(2, CPU_COUNT)
MAX_THREADPOOL_TOKENS = 200

# The tokenizer truncates to 512 tokens anyway, so anything beyond a few
# thousand characters adds no signal - it only ties up a worker.
MAX_TEXT_LENGTH = int(os.environ.get("GUARD_MAX_TEXT_LENGTH", "20000"))
MAX_BATCH_ITEMS = int(os.environ.get("GUARD_MAX_BATCH", "32"))
MAX_SENTENCES = int(os.environ.get("GUARD_MAX_SENTENCES", "40"))
CACHE_SIZE = int(os.environ.get("GUARD_CACHE_SIZE", "1024"))

infer_sem = threading.Semaphore(MAX_CONCURRENT_INFERENCES)
_counter_lock = threading.Lock()

BASE_DIR = Path(__file__).resolve().parent
MODELS_ROOT = Path(os.environ.get("MODELS_ROOT") or (BASE_DIR.parent / "models"))

state = {"models": {}, "errors": {}, "ready": False, "inflight": 0, "peak": 0,
         "started_at": time.time(), "loaded_at": None}

stats = {
    "requests": 0, "texts": 0, "cache_hits": 0,
    "decisions": {"SAFE": 0, "SUSPECT": 0, "TOXIC": 0},
    "fingilish": 0, "errors": 0, "latency_total_ms": 0,
    "by_endpoint": {},
}

MODEL_SPECS = {
    # The Persian checkpoint is a multi-label classifier with a single
    # output logit: scored with sigmoid, NOT softmax (softmax over one logit
    # is always 1.0 -> "everything is 100% toxic").
    "persian":      {"dir": MODELS_ROOT / "persian",           "mode": "multilabel", "weight": 2.0, "lang": "fa",    "label": "Unicollect فارسی",           "label_en": "Unicollect Persian",            "env": "PERSIAN_MODEL_ID"},
    "textdetox_lg": {"dir": MODELS_ROOT / "textdetox_large",   "mode": "binary",     "weight": 2.0, "lang": "multi", "label": "Unicollect چندزبانه پرو",    "label_en": "Unicollect Multilingual Pro",   "env": "TEXTDETOX_LARGE_ID"},
    "textdetox_sm": {"dir": MODELS_ROOT / "textdetox_base",    "mode": "binary",     "weight": 1.5, "lang": "multi", "label": "Unicollect چندزبانه سریع",   "label_en": "Unicollect Multilingual Swift", "env": "TEXTDETOX_BASE_ID"},
    "multilingual": {"dir": MODELS_ROOT / "multilingual",      "mode": "multilabel", "weight": 1.0, "lang": "multi", "label": "Unicollect چندزبانه گسترده", "label_en": "Unicollect Multilingual Broad", "env": "MULTILINGUAL_MODEL_ID"},
    "twitter_off":  {"dir": MODELS_ROOT / "twitter_offensive", "mode": "binary",     "weight": 1.0, "lang": "en",    "label": "Unicollect انگلیسی",         "label_en": "Unicollect English",            "env": "TWITTER_OFFENSIVE_ID"},
}

# ------------------------------------------------------------------
# Which output index is the "toxic/offensive" class?
# ------------------------------------------------------------------
_TOXIC_KEYWORDS = ("toxic", "offens", "hate", "abuse", "insult",
                   "profan", "vulgar", "obscen", "hateful", "harass")
_SAFE_KEYWORDS = ("non", "not", "clean", "safe", "normal", "neutral",
                  "ok", "benign", "harmless")


def _resolve_toxic_index(model) -> int:
    """Index of the toxic class, read from config.id2label (some checkpoints
    put the offensive class at index 0)."""
    cfg = getattr(model, "config", None)
    id2label = getattr(cfg, "id2label", None) or {}
    try:
        labels = {int(k): str(v) for k, v in id2label.items()}
    except (TypeError, ValueError):
        labels = {}
    if not labels:
        return 1
    for idx, name in labels.items():
        n = name.lower()
        if any(k in n for k in _TOXIC_KEYWORDS) and not any(s in n for s in _SAFE_KEYWORDS):
            return idx
    for idx, name in labels.items():
        n = name.lower()
        if any(k in n for k in _SAFE_KEYWORDS):
            other = 1 - idx
            if other in labels:
                return other
    return 1


def _resolve_scoring(model, spec_mode: str):
    """Pick the scoring strategy from the checkpoint itself, once."""
    cfg = getattr(model, "config", None)
    n = int(getattr(cfg, "num_labels", 0) or 0)
    problem_type = getattr(cfg, "problem_type", None)
    if n == 1:
        return "sigmoid1", 0
    if problem_type == "multi_label_classification" or (spec_mode == "multilabel" and n > 2):
        id2label = getattr(cfg, "id2label", None) or {}
        try:
            labels = {int(k): str(v).lower() for k, v in id2label.items()}
        except (TypeError, ValueError):
            labels = {}
        idx = [i for i, name in labels.items() if not any(sk in name for sk in _SAFE_KEYWORDS)]
        return "sigmoid_max", (idx or list(range(n)))
    return "softmax", _resolve_toxic_index(model)


# ------------------------------------------------------------------
# Demo scorer (GUARD_DEMO_MODE=1): no torch, deterministic, dictionary based
# ------------------------------------------------------------------
_DEMO_EN = {"stupid", "idiot", "useless", "dumb", "moron", "hate", "shut",
            "loser", "trash", "ugly", "fuck", "shit", "bitch", "crazy"}
_DEMO_FA = {"احمق", "احمقی", "خفه", "بیشعور", "نفهم", "گمشو", "عوضی", "کثافت", "آشغال"}
_DEMO_BIAS = {"persian": 0.00, "textdetox_lg": 0.03, "textdetox_sm": -0.04,
              "multilingual": -0.08, "twitter_off": 0.02}


class _DemoModel:
    def __init__(self, name):
        self.name = name


def _demo_score(name: str, text: str) -> float:
    words = re.findall(r"[\w\u0600-\u06FF]+", text.lower())
    hits = sum(1 for w in words if w in _DEMO_EN or w in _DEMO_FA)
    hits += sum(1 for h in find_profane(text) if not h["contextual"]) * 2
    hits += sum(1 for h in find_profane(text) if h["contextual"]) * 0.6
    base = min(0.97, 0.03 + 0.42 * hits) if hits else 0.02
    jitter = (int(hashlib.md5((name + text).encode()).hexdigest()[:4], 16) % 7) / 100
    return max(0.0, min(0.99, base + _DEMO_BIAS.get(name, 0) + jitter))


# ------------------------------------------------------------------
# Loading - at import time, so it works with gunicorn --preload
# ------------------------------------------------------------------
MODEL_LOAD_RETRIES = max(0, int(os.environ.get("MODEL_LOAD_RETRIES", "2")))


def _load_one(name, spec):
    """Load one model, retrying transient failures (disk hiccup, a half-written
    snapshot, a brief OOM while a sibling model is still loading)."""
    for attempt in range(MODEL_LOAD_RETRIES + 1):
        _load_one_attempt(name, spec)
        if name in state["models"] or DEMO_MODE:
            state["errors"].pop(name, None)
            return
        if attempt < MODEL_LOAD_RETRIES:
            wait = 3 * (attempt + 1)
            print(f"[Guard] retrying '{name}' in {wait}s ({attempt + 1}/{MODEL_LOAD_RETRIES})", flush=True)
            time.sleep(wait)


def _load_one_attempt(name, spec):
    try:
        if DEMO_MODE:
            state["models"][name] = (_DemoModel(name), None, ("demo", 0), spec["weight"],
                                     spec["lang"], spec["label"], spec["label_en"])
            return
        print(f"[Guard] Loading '{name}'...", flush=True)
        tok = AutoTokenizer.from_pretrained(str(spec["dir"]), local_files_only=True)
        mdl = AutoModelForSequenceClassification.from_pretrained(str(spec["dir"]), local_files_only=True)
        mdl.eval()
        id2label = getattr(mdl.config, "id2label", {}) or {}
        print(f"[Guard] '{name}' id2label={id2label} "
              f"problem_type={getattr(mdl.config, 'problem_type', None)} mode={spec['mode']}", flush=True)
        scoring = _resolve_scoring(mdl, spec["mode"])
        print(f"[Guard] '{name}' -> scoring={scoring[0]} index={scoring[1]}", flush=True)
        state["models"][name] = (mdl, tok, scoring, spec["weight"],
                                 spec["lang"], spec["label"], spec["label_en"])
        print(f"[Guard] OK '{name}' loaded", flush=True)
    except Exception as exc:
        state["errors"][name] = str(exc)
        print(f"[Guard] FAILED '{name}': {exc}", flush=True)


def bootstrap():
    if state["ready"]:
        return
    print(f"[Guard] Bootstrap starting (demo={DEMO_MODE})...", flush=True)
    workers = max(1, min(int(os.environ.get("MODEL_LOAD_WORKERS", "1")), len(MODEL_SPECS)))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="model-loader") as pool:
        futures = {pool.submit(_load_one, n, s): n for n, s in MODEL_SPECS.items()}
        for f in as_completed(futures):
            f.result()
    state["ready"] = True
    state["loaded_at"] = time.time()
    print(f"[Guard] Ready. Loaded: {list(state['models'])} Errors: {list(state['errors'])}", flush=True)


# ------------------------------------------------------------------
# Scoring
# ------------------------------------------------------------------
def _score(model, tokenizer, text, scoring):
    strategy, idx = scoring
    if strategy == "demo":
        return _demo_score(model.name, text)
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.inference_mode():
        logits = model(**inputs).logits.squeeze(0)
    if strategy == "sigmoid1":
        return float(torch.sigmoid(logits.reshape(-1)[0]).item())
    if strategy == "sigmoid_max":
        return float(torch.sigmoid(logits[idx]).max().item())
    return float(torch.softmax(logits, dim=-1)[idx].item())


def applicable(lang: str, script: str) -> bool:
    if script == "fa" and lang == "en":
        return False
    if script == "en" and lang == "fa":
        return False
    return True


def score_models(text: str, script: Optional[str] = None,
                 only: Optional[Iterable[str]] = None) -> Dict:
    """Raw per-model scores, no voting. `only` restricts to named models."""
    script = script or detect_script(text)
    wanted = set(only) if only else None
    raw, skipped = {}, []
    for name, (mdl, tok, scoring, weight, lang, _l, _le) in list(state["models"].items()):
        if wanted is not None and name not in wanted:
            continue
        if not applicable(lang, script):
            skipped.append(name)
            continue
        try:
            raw[name] = round(_score(mdl, tok, text, scoring), 4)
        except Exception as exc:
            print(f"[Guard] inference error in {name}: {exc}", flush=True)
            raw[name] = 0.0
    return {"script": script, "scores": raw, "skipped_models": skipped}


def _reason(decision, votes_count, total, max_raw, top_model, strict):
    pct = round(max_raw * 100)
    if decision == "TOXIC":
        if votes_count >= MIN_VOTES_FOR_TOXIC:
            return f"{votes_count} of {total} models voted toxic (threshold {PER_MODEL_VOTE_THRESHOLD:.2f})."
        return f"'{top_model}' is highly confident ({pct}%) and another model corroborates it."
    if decision == "SUSPECT":
        if votes_count == 1:
            return f"Only '{top_model}' voted toxic ({pct}%); needs human review."
        return f"Votes came from correlated models only; held as suspect ({pct}% max)."
    return f"No consensus for toxicity (highest score {pct}%)."


def run_ensemble(text: str, script: str, strict: bool = False) -> Dict:
    scored = score_models(text, script)
    raw = scored["scores"]
    if not raw:
        return {"error": "no models applicable", "details": dict(state["errors"])}

    weights, labels, labels_en, weighted = {}, {}, {}, {}
    for name in raw:
        _m, _t, _s, weight, _lang, label, label_en = state["models"][name]
        weights[name] = weight
        weighted[name] = round(raw[name] * weight, 4)
        labels[name] = label
        labels_en[name] = label_en

    decision, votes, votes_count, max_raw, confidence = decide(raw, strict=strict, script=script)
    top_model = max(raw, key=raw.get)
    return {
        "decision": decision,
        "max_weighted": round(max(weighted.values()), 4),
        "max_raw": round(max_raw, 4),
        "confidence": confidence,
        "votes_count": votes_count,
        "votes": votes,
        "raw_scores": raw,
        "weighted_scores": weighted,
        "weights": weights,
        "labels": labels,
        "labels_en": labels_en,
        "total_models": len(raw),
        "skipped_models": scored["skipped_models"],
        "script": script,
        "strict": strict,
        "top_model": top_model,
        "reason": _reason(decision, votes_count, len(raw), max_raw, top_model, strict),
        "vote_threshold": PER_MODEL_VOTE_THRESHOLD,
        "min_votes": MIN_VOTES_FOR_TOXIC,
        "errors": dict(state["errors"]),
    }


def _summary_of(result):
    if not result or "decision" not in result:
        return {"error": result.get("error") if result else "no result"}
    return {k: result[k] for k in ("decision", "confidence", "max_raw", "votes_count",
                                   "total_models", "script", "reason")}


# ------------------------------------------------------------------
# Small LRU cache: the same text always gets the same verdict
# ------------------------------------------------------------------
_cache: "OrderedDict[str, Dict]" = OrderedDict()
_cache_lock = threading.Lock()


def _cache_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def cache_clear() -> int:
    with _cache_lock:
        n = len(_cache)
        _cache.clear()
        return n


def cache_size() -> int:
    return len(_cache)


def predict(text: str, use_cache: bool = True) -> Dict:
    """Full Guard verdict for one text (original + Fingilish reading)."""
    key = _cache_key(text)
    if use_cache and CACHE_SIZE > 0:
        with _cache_lock:
            hit = _cache.get(key)
            if hit is not None:
                _cache.move_to_end(key)
                stats["cache_hits"] += 1
                out = dict(hit)
                out["cached"] = True
                out["latency_ms"] = 0
                return out

    t0 = time.perf_counter()
    script_original = detect_script(text)

    has_fingilish, persian_text = False, ""
    if script_original == "en" and looks_like_fingilish(text):
        persian_text = fingilish_to_persian(text)
        has_fingilish = persian_text.strip() != "" and detect_script(persian_text) == "fa"

    result_original = run_ensemble(text, script_original)
    result_fingilish = run_ensemble(persian_text, "fa", strict=True) if has_fingilish else None

    candidates = [r for r in (result_original, result_fingilish) if r and "decision" in r]
    if not candidates:
        return {"error": "no models applicable", "details": dict(state["errors"])}

    final = worst(r["decision"] for r in candidates)
    primary = next((r for r in candidates if r["decision"] == final), candidates[0])

    resp = dict(primary)
    resp["decision"] = final
    resp["is_toxic"] = final == "TOXIC"
    resp["flagged"] = final != "SAFE"
    resp["severity"] = SEVERITY[final]
    resp["fingilish_detected"] = has_fingilish
    resp["fingilish_text"] = persian_text if has_fingilish else None
    resp["decided_by"] = "fingilish" if (result_fingilish is not None and primary is result_fingilish) else "original"
    resp["analysis"] = {
        "original": _summary_of(result_original),
        "fingilish": _summary_of(result_fingilish) if result_fingilish else None,
    }
    resp["profane_terms"] = [h["persian"] for h in find_profane(text)]
    resp["text_length"] = len(text)
    resp["cached"] = False
    resp["latency_ms"] = round((time.perf_counter() - t0) * 1000)

    stats["texts"] += 1
    stats["decisions"][final] += 1
    stats["fingilish"] += int(has_fingilish)
    stats["latency_total_ms"] += resp["latency_ms"]

    if CACHE_SIZE > 0:
        with _cache_lock:
            _cache[key] = resp
            while len(_cache) > CACHE_SIZE:
                _cache.popitem(last=False)
    return resp


class Busy:
    """Context manager that counts in-flight inferences and limits parallelism."""

    def __enter__(self):
        infer_sem.acquire()
        with _counter_lock:
            state["inflight"] += 1
            state["peak"] = max(state["peak"], state["inflight"])
        return self

    def __exit__(self, *exc):
        with _counter_lock:
            state["inflight"] -= 1
        infer_sem.release()
        return False


def is_ready() -> bool:
    return bool(state["ready"] and state["models"])


# Sentences: split on . ! ? ؟ ; newline, keep the delimiter with the sentence.
_SENT_RE = re.compile(r"[^.!?؟;\n]+[.!?؟;]*", re.UNICODE)


def split_sentences(text: str) -> List[Dict]:
    out = []
    for m in _SENT_RE.finditer(text):
        s = m.group(0)
        if s.strip():
            lead = len(s) - len(s.lstrip())
            out.append({"text": s.strip(), "start": m.start() + lead,
                        "end": m.start() + lead + len(s.strip())})
    return out


if os.environ.get("GUARD_LAZY_LOAD", "").lower() not in ("1", "true", "yes"):
    bootstrap()
