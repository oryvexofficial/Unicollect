"""Smoke test against a running server:  python scripts/smoke_test.py [base_url] [api_key]"""
import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
KEY = sys.argv[2] if len(sys.argv) > 2 else ""


def call(path, body=None):
    headers = {"Content-Type": "application/json"}
    if KEY:
        headers["X-API-Key"] = KEY
    req = urllib.request.Request(BASE + path, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def check(text):
    return call("/api/check", {"text": text})[1]


CASES = [
    # text, expected decision(s), expected fingilish_detected
    ("kir",                                         {"TOXIC"},            True),
    ("to khar hasti",                               {"TOXIC", "SUSPECT"}, True),
    ("khafe sho ahmagh",                            {"TOXIC", "SUSPECT"}, True),
    ("salam khoobi? man khoobam mersi",             {"SAFE", "SUSPECT"},  True),
    ("Have a wonderful and productive day ahead!",  {"SAFE"},             False),
    ("hi",                                          {"SAFE", "SUSPECT"},  False),
    ("You are completely stupid and useless",       {"TOXIC", "SUSPECT"}, False),
    ("سلام وقت بخیر، از همکاری با شما بسیار خوشحالم.", {"SAFE"},            False),
]

failed = 0


def report(ok, label, extra=""):
    global failed
    failed += not ok
    print(("PASS" if ok else "FAIL"), label, extra)


for text, decisions, fing in CASES:
    r = check(text)
    ok = r.get("decision") in decisions and bool(r.get("fingilish_detected")) == fing
    report(ok, repr(text), {k: r.get(k) for k in ("decision", "fingilish_detected", "fingilish_text", "max_raw", "error")})

with ThreadPoolExecutor(8) as ex:
    results = list(ex.map(check, ["You are crazy"] * 8))
bad = [r for r in results if "decision" not in r]
report(not bad, f"8 parallel requests, {len(bad)} errors")

# ---- API v1 -------------------------------------------------------
V1 = [
    ("GET",  "/api/v1",                         None,                                   lambda r: len(r["endpoints"]) > 10),
    ("GET",  "/api/v1/health",                  None,                                   lambda r: r["status"] == "ok"),
    ("GET",  "/api/v1/ready",                   None,                                   lambda r: r["ready"] is True),
    ("GET",  "/api/v1/info",                    None,                                   lambda r: "limits" in r),
    ("GET",  "/api/v1/models",                  None,                                   lambda r: r["total"] == 5),
    ("GET",  "/api/v1/config",                  None,                                   lambda r: r["min_votes_for_toxic"] == 2),
    ("POST", "/api/v1/check",                   {"text": "kir"},                        lambda r: r["decision"] == "TOXIC"),
    ("POST", "/api/v1/check/batch",             {"texts": ["hello", "kir"]},            lambda r: r["count"] == 2),
    ("POST", "/api/v1/verdict",                 {"text": "Have a nice day"},            lambda r: r["decision"] == "SAFE"),
    ("POST", "/api/v1/score",                   {"text": "you idiot"},                  lambda r: len(r["scores"]) >= 1),
    ("POST", "/api/v1/sentences",               {"text": "Hello. Have a nice day!"},    lambda r: r["count"] == 2),
    ("POST", "/api/v1/censor",                  {"text": "you are a k1r"},              lambda r: "k1r" not in r["text"]),
    ("POST", "/api/v1/moderations",             {"input": "hello"},                     lambda r: len(r["results"]) == 1),
    ("POST", "/api/v1/profanity",               {"text": "jakesh"},                     lambda r: r["found"]),
    ("POST", "/api/v1/language",                {"text": "سلام"},                       lambda r: r["script"] == "fa"),
    ("POST", "/api/v1/fingilish/detect",        {"text": "salam khoobi"},               lambda r: r["fingilish"]),
    ("POST", "/api/v1/fingilish/transliterate", {"text": "salam"},                      lambda r: r["persian"]),
    ("POST", "/api/v1/normalize",               {"text": "k.1.r"},                      lambda r: r["normalized"] == "kir"),
]
for method, path, body, test in V1:
    status, r = call(path, body if method == "POST" else None)
    try:
        ok = status == 200 and bool(test(r))
    except Exception:
        ok = False
    report(ok, f"{method} {path}", "" if ok else (status, str(r)[:200]))

status, r = call("/api/v1/check", {"text": ""})
report(status == 400 and r["error"]["code"] == "empty_text", "empty text -> 400")

sys.exit(1 if failed else 0)
