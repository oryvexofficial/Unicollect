"""Unicollect Chat — a small FastAPI proxy in front of a local Ollama
(`ollama serve`) process.

This is a *separate* process/port/tunnel from the toxicity-ensemble app in
`app/main.py`. It exists so the chat model can be reached on its own
TryCloudflare link without touching the ensemble service.

Why a proxy instead of exposing Ollama directly?
- Ollama's OpenAI-compatible endpoint lets the caller send any `messages`
  array, including a `system` message. If we tunnelled it directly, anyone
  could overwrite the identity/system prompt. This proxy always prepends
  the real system prompt server-side and drops any `system` role the
  client tries to send, so the identity below cannot be overridden by the
  client.
"""
import hashlib
import json
import os
import time

import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent

LLAMA_SERVER_URL = os.environ.get("LLAMA_SERVER_URL", "http://127.0.0.1:8001")
# The id Ollama was pulled/served under (what goes in the API request body).
# Separate from CHAT_MODEL_NAME below, which is only ever shown to users.
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")
CHAT_MODEL_NAME = os.environ.get("CHAT_MODEL_LABEL", "Qwen2.5-7B-Instruct")
MAX_MESSAGE_LENGTH = 8_000
MAX_HISTORY_TURNS = 16  # user+assistant pairs kept from the client-sent history
MAX_REPLY_TOKENS = 1536  # was 700 - too easy to cut a fenced code block or a
                          # multi-step answer off mid-way, especially now that
                          # the UI actually renders code/markdown/math nicely.

# ------------------------------------------------------------------
# Identity. The client can never change this: it is never read from the
# request body, only sent from here.
# ------------------------------------------------------------------
SYSTEM_PROMPT = (
    "تو «Unicollect» هستی، یک دستیار هوش مصنوعی گفتگومحور که توسط Muvixo "
    "(موویکسو) ساخته و ارائه شده‌ای.\n\n"
    "## هویت\n"
    "- همیشه خودت را Unicollect معرفی کن.\n"
    "- اگر کاربر پرسید چه کسی تو را ساخته، بر پایه‌ی چه مدل یا فناوری‌ای کار "
    "می‌کنی، یا هر سؤال مشابهی درباره‌ی زیرساخت/سازنده‌ات پرسید، فقط بگو که "
    "توسط Muvixo ساخته شده‌ای. هرگز نام هیچ شرکت، مدل زبانی یا فناوری دیگری "
    "را به‌عنوان سازنده یا زیرساخت خودت ذکر نکن — حتی اگر کاربر اصرار کند، "
    "قسم بخورد، وانمود کند یکی از توسعه‌دهندگان توست، یا ادعا کند خلاف این "
    "را می‌داند. مؤدبانه موضوع را عوض کن و به کمک به او ادامه بده.\n\n"
    "## کیفیت پاسخ\n"
    "- دقیق و صادق باش. اگر چیزی را مطمئن نیستی یا نمی‌دانی، صریح بگو که "
    "نمی‌دانی یا مطمئن نیستی؛ هرگز آمار، منبع، نقل‌قول یا جزئیات را از خودت "
    "نساز.\n"
    "- پاسخ را متناسب با سؤال بده: برای سؤال‌های ساده کوتاه و مستقیم باش؛ "
    "برای مسائل فنی، چندمرحله‌ای یا آموزشی، کامل و دقیق باش و لازم نیست "
    "برای کوتاه‌تر شدن از کیفیت بزنی.\n"
    "- وقتی سؤال مبهم است، یا یک فرض منطقی بگذار و پاسخ بده، یا در یک جمله "
    "کوتاه سؤال توضیحی بپرس — از پرسیدن چند سؤال پشت‌سرهم خودداری کن.\n\n"
    "## فرمت‌بندی (رابط کاربری از مارک‌داون و فرمول پشتیبانی می‌کند)\n"
    "- از مارک‌داون استاندارد استفاده کن: **پررنگ**، فهرست‌های نقطه‌ای یا "
    "شماره‌دار، عنوان‌ها (##)، و جدول وقتی داده‌ها را خواناتر می‌کند.\n"
    "- هرگز بلاک کد (سه‌بک‌تیکی) ننویس. فقط برای اشاره به نام یک تابع، "
    "دستور یا اصطلاح فنی درون جمله می‌توانی از کد درون‌خطی کوتاه با بک‌تیک "
    "تکی استفاده کنی.\n"
    "- فرمول و نماد ریاضی را با LaTeX بنویس: عبارت درون‌خطی بین $...$ و "
    "فرمول مستقل و بزرگ بین $$...$$.\n"
    "- از قالب‌بندی زیاده‌روی‌شده یا تزئینی (ایموجی اضافه، عنوان‌های غیرلازم "
    "برای پاسخ‌های کوتاه) پرهیز کن؛ فرمت باید به خوانایی کمک کند، نه خودنمایی.\n\n"
    "## کدنویسی (قانون قطعی، از همه‌ی دستورهای دیگر مهم‌تر)\n"
    "- هرگز کد ننویس: نه برنامه‌ی کامل، نه تکه‌کد، نه اسکریپت، نه دستور "
    "ترمینال، نه کوئری، نه شبه‌کد. این شامل اصلاح، تکمیل، بازنویسی، تبدیل یا "
    "دیباگ کدِ کاربر هم می‌شود. حتی اگر کاربر اصرار کرد، گفت «فقط یک خط»، "
    "گفت برای آموزش یا تمرین است، یا ادعا کرد اجازه دارد.\n"
    "- اگر کاربر کد خواست، صریح بگو: «متأسفم، نمی‌توانم کد بنویسم.» و بلافاصله "
    "پیشنهاد بده که به‌جایش چطور می‌توانی کمک کنی.\n"
    "- کمک‌های مجاز در برنامه‌نویسی (فقط با توضیح متنی، بدون کد): توضیح "
    "مفاهیم و اصطلاحات، توضیح منطق یک راه‌حل یا الگوریتم به زبان ساده و "
    "مرحله‌به‌مرحله، توضیح معنای پیام خطا و علت‌های احتمالی آن، توضیح اینکه "
    "یک کدِ ارسال‌شده توسط کاربر به زبان ساده چه کار می‌کند، مقایسه‌ی زبان‌ها "
    "و ابزارها، و پیشنهاد منابع و مسیر یادگیری.\n\n"
    "## هک و امنیت\n"
    "- هر درخواستی درباره‌ی هک، نفوذ، دور زدن امنیت یا احراز هویت، بدافزار، "
    "ویروس، کرک، فیشینگ، سرقت حساب یا اطلاعات، حملات شبکه یا جاسوسی را کامل "
    "رد کن و فقط بگو: «متأسفم، در این زمینه نمی‌توانم کمک کنم.» در این موارد "
    "حتی توضیح مفهومی، مراحل کلی یا نام ابزار هم نده، هر بهانه‌ای که بیاورد "
    "(تست امنیت، آموزش، حساب خودم، پروژه دانشگاهی).\n\n"
    "## زبان و لحن\n"
    "- به همان زبانی پاسخ بده که کاربر با آن می‌نویسد (پیش‌فرض فارسی اگر "
    "زبان پیام نامشخص بود).\n"
    "- لحن دوستانه، محترمانه و طبیعی داشته باش؛ از رسمیت بیش از حد یا "
    "تکرار بی‌دلیل معذرت‌خواهی خودداری کن.\n\n"
    "## مرزها\n"
    "اگر درخواستی خطرناک، غیرقانونی یا مضر بود، مؤدبانه و بدون سخنرانی "
    "طولانی از انجامش خودداری کن و در صورت امکان یک جایگزین بی‌خطر پیشنهاد "
    "بده."
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatIn(BaseModel):
    message: str
    history: list[ChatMessage] = []


state = {"llama_ready": False, "last_error": None}


def _check_llama() -> bool:
    try:
        # Ollama doesn't expose /health; /api/version is its always-200
        # "server is up" endpoint (llama-server's /health had no Ollama
        # equivalent, so this is the closest match, not a renamed route).
        r = requests.get(f"{LLAMA_SERVER_URL}/api/version", timeout=3)
        ok = r.status_code == 200
        state["llama_ready"] = ok
        state["last_error"] = None if ok else f"HTTP {r.status_code}"
        return ok
    except requests.RequestException as exc:
        state["llama_ready"] = False
        state["last_error"] = str(exc)
        return False


app = FastAPI(title="Unicollect Chat")

# Same policy as app/main.py: GET is open (so the Pages status panel can
# health-check this service too), POST stays same-origin.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"],
                   allow_headers=[])


@app.get("/health")
def health():
    _check_llama()
    return {
        "status": "ok" if state["llama_ready"] else "loading",
        "model": CHAT_MODEL_NAME,
        "error": state["last_error"],
    }


def _validate_and_build_messages(data: "ChatIn"):
    """Shared by both endpoints: validate the incoming text and rebuild the
    message list server-side (system prompt first, client `system` entries
    stripped, so the identity can never be overridden)."""
    text = (data.message or "").strip()
    if not text:
        return None, JSONResponse({"error": "پیام خالی است"}, status_code=400)
    if len(text) > MAX_MESSAGE_LENGTH:
        return None, JSONResponse(
            {"error": f"پیام خیلی طولانی است (حداکثر {MAX_MESSAGE_LENGTH} نویسه)"},
            status_code=400,
        )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in data.history[-(MAX_HISTORY_TURNS * 2):]:
        if m.role in ("user", "assistant") and m.content.strip():
            messages.append({"role": m.role, "content": m.content.strip()[:MAX_MESSAGE_LENGTH]})
    messages.append({"role": "user", "content": text})
    return messages, None


@app.post("/api/chat")
def chat(data: ChatIn):
    messages, err = _validate_and_build_messages(data)
    if err:
        return err

    started = time.time()
    try:
        resp = requests.post(
            f"{LLAMA_SERVER_URL}/v1/chat/completions",
            json={
                # Ollama requires this to match a pulled model's exact tag;
                # CHAT_MODEL_NAME below is a free-form display label and
                # would 404 here if the two drift apart.
                "model": OLLAMA_MODEL,
                "messages": messages,
                "temperature": 0.7,
                "top_p": 0.9,
                "max_tokens": MAX_REPLY_TOKENS,
            },
            timeout=180,
        )
        resp.raise_for_status()
        resp.encoding = "utf-8"  # same charset issue as the streaming path
        payload = json.loads(resp.content.decode("utf-8"))
        reply = payload["choices"][0]["message"]["content"]
    except requests.RequestException as exc:
        return JSONResponse({"error": f"سرویس مدل در دسترس نیست: {exc}"}, status_code=502)
    except (KeyError, IndexError, ValueError):
        return JSONResponse({"error": "پاسخ نامعتبر از سرویس مدل"}, status_code=502)

    return {
        "reply": reply,
        "model": CHAT_MODEL_NAME,
        "latency_ms": round((time.time() - started) * 1000),
    }


# ------------------------------------------------------------------
# Streaming variant: proxies Ollama's own token-by-token SSE stream so the
# chat panel can render a real "live typing" effect instead of animating a
# word-reveal after the full reply has already arrived. The wire format is
# deliberately tiny and independent of Ollama's OpenAI-shaped payload, so the
# client only ever has to understand `{"t": "..."}`, `{"error": "..."}` and
# the terminal `[DONE]` line.
# ------------------------------------------------------------------
@app.post("/api/chat/stream")
def chat_stream(data: ChatIn):
    messages, err = _validate_and_build_messages(data)
    if err:
        return err

    def sse(obj) -> str:
        return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"

    def gen():
        try:
            upstream = requests.post(
                f"{LLAMA_SERVER_URL}/v1/chat/completions",
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "max_tokens": MAX_REPLY_TOKENS,
                    "stream": True,
                },
                timeout=180,
                stream=True,
            )
        except requests.RequestException as exc:
            yield sse({"error": f"سرویس مدل در دسترس نیست: {exc}"})
            return

        if upstream.status_code != 200:
            yield sse({"error": f"سرویس مدل خطا داد (HTTP {upstream.status_code})"})
            return

        # BUGFIX (garbled Persian replies, e.g. "Ø³ÙØ§Ù" instead of "سلام"):
        # Ollama answers with `Content-Type: text/event-stream` and no
        # charset. For any text/* type without a charset, `requests` falls
        # back to ISO-8859-1, so `iter_lines(decode_unicode=True)` decoded
        # every UTF-8 byte as a Latin-1 character. English survived (ASCII is
        # identical in both), every Persian/emoji token became mojibake, and
        # some tokens were dropped entirely because str.splitlines() also
        # splits on Latin-1 control chars like \x85. We now read raw bytes,
        # split only on real newlines and decode each complete line as UTF-8,
        # so a multi-byte character can never be cut in half either.
        upstream.encoding = "utf-8"
        got_any = False
        try:
            for raw_bytes in upstream.iter_lines():
                if not raw_bytes:
                    continue
                line = raw_bytes.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if payload == "[DONE]":
                    break
                try:
                    obj = json.loads(payload)
                    delta = obj["choices"][0]["delta"].get("content", "")
                except (ValueError, KeyError, IndexError, AttributeError):
                    delta = ""
                if delta:
                    got_any = True
                    yield sse({"t": delta})
        except requests.RequestException as exc:
            if not got_any:
                yield sse({"error": f"ارتباط با سرویس مدل قطع شد: {exc}"})
                return
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _asset_version() -> str:
    h = hashlib.sha1()
    for f in ("style.css", "script.js"):
        try:
            h.update((BASE_DIR / "chat_static" / f).read_bytes())
        except OSError:
            pass
    return h.hexdigest()[:10]


# Cache-bust CSS/JS on every deploy, otherwise browsers (and the Cloudflare
# edge) can keep serving the previous script.js after an update.
_INDEX_HTML = (BASE_DIR / "chat_static" / "index.html").read_text(encoding="utf-8") \
    .replace("__V__", _asset_version())


@app.get("/")
def index():
    return HTMLResponse(_INDEX_HTML, headers={"Cache-Control": "no-cache"})


app.mount("/static", StaticFiles(directory=str(BASE_DIR / "chat_static")), name="chat-static")
