/* Unicollect Chat: the LLM chat served by app/chat_app.py (Ollama proxy).
   Same shell as the Guard panel (sidebar, composer, search, toasts) with real
   token streaming over SSE, markdown + math, and visible thinking steps:
   read -> recall the thread -> think (until the first token) -> write. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../shared/icons.jsx';
import useThreads from '../shared/chat/useThreads.js';
import Sidebar from '../shared/chat/Sidebar.jsx';
import SearchModal from '../shared/chat/SearchModal.jsx';
import Modal from '../shared/chat/Modal.jsx';
import Composer from '../shared/chat/Composer.jsx';
import { useConfirm, useToast } from '../shared/chat/Toast.jsx';
import { ThinkingBlock, ThoughtLine, usePhaseClock } from '../shared/chat/Thinking.jsx';
import { UserTurn, IconAction } from '../shared/chat/Turns.jsx';
import { Hero, useHeroLines } from '../shared/chat/Hero.jsx';
import { StreamWords } from '../shared/fx/text.jsx';
import { useEvent } from '../shared/hooks.js';
import { CAN_HOVER, REDUCED, copyText, download, fa, newId, sleep, store, textDir } from '../shared/util.js';
import Md from './Markdown.jsx';

const STORAGE_KEY = 'unicollect_chat_threads_v1';      // same key as the old UI: history survives
const UI_KEY = 'unicollect_chat_ui_v1';
const MAX_TEXT = 8000, MAX_HISTORY_TURNS = 16, REQUEST_TIMEOUT_MS = 180000;
const STEPS = ['خواندن پیام', 'مرور گفتگو', 'فکر کردن', 'نوشتن پاسخ'];
const PROMPTS = ['امروز چطور کمکت کنم؟', 'چه کمکی از دستم برمیاد؟', 'بگو چی لازم داری', 'آماده‌ام، چی تو ذهنته؟', 'بریم سراغ یه کار جدید', 'چه چیزی رو باهم بنویسیم؟', 'چه سوالی داری؟', 'بگو تا کمکت کنم', 'امروز رو با چی شروع کنیم؟', 'منتظر پیامتم…'];
const STARTERS = [
  ['edit', 'یک ایمیل رسمی بنویس', 'یک ایمیل کوتاه و رسمی بنویس که جلسه‌ی فردا را یک ساعت عقب بیندازم.'],
  ['book', 'یک مفهوم را ساده کن', 'یادگیری ماشین را برای یک نوجوان با یک مثال ساده توضیح بده.'],
  ['lang', 'ترجمه کن', 'این جمله را به انگلیسی روان ترجمه کن: «هر روز یک قدم کوچک، از یک جهش بزرگ بهتر است.»'],
  ['sparkles', 'ایده بده', 'پنج ایده‌ی خلاقانه برای اسم یک کافه‌ی کتاب در تهران بده.']
];

/* replies saved while the server had the Latin-1 charset bug ("Ø³ÙØ§Ù") */
const MOJIBAKE_RE = /[\u00C2-\u00C3\u00D8-\u00DB\u00E2\u00F0][\u0080-\u00BF]/;
function fixMojibake(s) {
  if (typeof s !== 'string' || !MOJIBAKE_RE.test(s)) return s;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xFF) return s;
  const bytes = Uint8Array.from(s, ch => ch.charCodeAt(0));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (e) { const out = new TextDecoder('utf-8').decode(bytes).replace(/\uFFFD/g, ''); return /[\u0600-\u06FF]/.test(out) ? out : s; }
}
const repair = threads => threads.forEach(t => t.messages.forEach(m => { if (m && typeof m.reply === 'string') m.reply = fixMojibake(m.reply); }));

function historyFor(thread) {
  const flat = [];
  thread.messages.filter(m => !m.error && m.reply).slice(-MAX_HISTORY_TURNS).forEach(m => {
    flat.push({ role: 'user', content: m.text });
    flat.push({ role: 'assistant', content: m.reply });
  });
  return flat;
}

function chatSteps(text, hist, t, reply, error) {
  const s = ms => (ms > 0 ? Math.round(ms) : undefined);
  const words = (reply || '').trim().split(/\s+/).filter(Boolean).length;
  const steps = [
    { label: STEPS[0], detail: `${fa(Array.from(text).length)} نویسه`, ms: s(t.d[0]) },
    { label: STEPS[1], detail: hist ? `${fa(hist)} پیام قبلی در حافظه` : 'گفتگوی تازه', ms: s(t.d[1]) },
    { label: STEPS[2], detail: t.first ? `اولین واژه پس از ${((t.first - t.t0) / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ثانیه` : 'پاسخی نرسید', ms: s((t.first || t.end) - t.m2), state: t.first ? 'done' : 'error' }
  ];
  if (t.first) steps.push({ label: STEPS[3], detail: `${fa(words)} واژه` + (error ? ' · ارتباط وسط کار قطع شد' : ''), ms: s(t.end - t.first), state: error ? 'error' : 'done' });
  else if (error) steps.push({ label: 'خطا', detail: error, state: 'error' });
  return steps;
}

function BotTurn({ m, fresh, onCopy, onRedo }) {
  if (!m.reply) {
    return (
      <motion.div className="msg bot" initial={fresh ? { opacity: 0 } : false} animate={{ opacity: 1 }}>
        <div className="bot-body">
          <ThoughtLine ms={m.thinkingMs} steps={m.steps} />
          <div className="err-line"><span className="err-icon"><Icon name="alert" /></span>
            <span className="err-text">{fresh && !REDUCED ? <StreamWords text={m.error} cps={90} maxMs={1800} /> : m.error}</span></div>
          <div className="actions"><IconAction icon="refresh" title="تلاش مجدد" onClick={onRedo} /></div>
        </div>
      </motion.div>
    );
  }
  return (
    <div className="msg bot">
      <div className="bot-body">
        <ThoughtLine ms={m.thinkingMs} fresh={fresh} steps={m.steps} />
        <div className="md" dir={textDir(m.reply)}><Md text={m.reply} /></div>
        <div className="actions">
          <IconAction icon="copy" title="کپی پاسخ" onClick={onCopy} />
          <IconAction icon="refresh" title="پاسخ دوباره" onClick={onRedo} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const T = useThreads(STORAGE_KEY, { repair });
  const toast = useToast();
  const ask = useConfirm();

  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);     // { text, reply, streaming }
  const [freshId, setFreshId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => !!(store.json(UI_KEY, {}).collapsed && typeof window !== 'undefined' && innerWidth >= 768));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [health, setHealth] = useState({ cls: 'warn', label: 'در حال اتصال…', model: 'Unicollect', data: null });
  const clock = usePhaseClock(STEPS, { holdAt: 2 });
  const composer = useRef(null), scroller = useRef(null);
  const st = useRef({ ctrl: null, aborted: false, busy: false });
  const hero = useHeroLines(PROMPTS, [T.activeId === null]);

  T.onStorageFull(() => toast('حافظه مرورگر پر است؛ گفتگوهای قدیمی را پاک کنید'));
  const active = T.active;
  const welcome = !pending && (!active || !active.messages.length);

  const keepPinned = useCallback(force => {
    const c = scroller.current; if (!c) return;
    if (force || c.scrollHeight - c.scrollTop - c.clientHeight < 160) c.scrollTop = c.scrollHeight;
  }, []);
  useEffect(() => { requestAnimationFrame(() => keepPinned(true)); }, [T.activeId]);
  useEffect(() => {
    const c = scroller.current; if (!c || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => keepPinned()); ro.observe(c.firstElementChild || c);
    return () => ro.disconnect();
  }, [welcome]);

  const checkHealth = useEvent(async () => {
    const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch('/health', { cache: 'no-store', signal: ctrl.signal });
      const d = await r.json();
      setHealth(d.status === 'ok'
        ? { cls: 'ok', label: 'آماده', model: 'Unicollect', data: d }
        : { cls: 'warn', label: 'مدل در حال بارگذاری…', model: 'Unicollect', data: d });
    } catch (e) { setHealth(h => ({ ...h, cls: 'bad', label: 'سرور در دسترس نیست' })); }
    finally { clearTimeout(to); }
  });

  /* ---------- send + stream ---------- */
  const send = useEvent(async (raw, fromInput) => {
    const text = (raw || '').trim();
    if (!text || st.current.busy) return;
    if (text.length > MAX_TEXT) { toast(`پیام طولانی است (حداکثر ${fa(MAX_TEXT)} نویسه)`); return; }
    const ctrl = new AbortController();
    Object.assign(st.current, { ctrl, aborted: false, busy: true });
    setBusy(true); setFreshId(null);
    if (fromInput) composer.current.clear();

    let thread = T.get().threads.find(t => t.id === T.get().activeId), created = false;
    if (!thread) {
      const one = text.replace(/\s+/g, ' ');
      thread = { id: newId('th'), title: one.slice(0, 40) + (one.length > 40 ? '…' : ''), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      T.add(thread); created = true;
    }
    const history = historyFor(thread);
    setPending({ text, reply: '', streaming: false });
    clock.start();
    const t = { t0: performance.now(), m2: 0, first: 0, end: 0, d: [] };
    requestAnimationFrame(() => keepPinned(true));
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let reply = '', error = null, raf = 0;
    const flush = () => { raf = 0; setPending(p => p && { ...p, reply, streaming: true }); requestAnimationFrame(() => keepPinned()); };
    try {
      try {
        const r = await fetch('/api/chat/stream', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history }), signal: ctrl.signal
        });
        if (!r.ok || !r.body) {
          let msg = `پاسخ نامعتبر از سرور (HTTP ${r.status})`;
          try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) {}
          error = msg;
        } else {
          const reader = r.body.getReader(), dec = new TextDecoder('utf-8');
          let buf = '';
          outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) !== -1) {
              const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (payload === '[DONE]') break outer;
              let obj = null; try { obj = JSON.parse(payload); } catch (e) { continue; }
              if (obj && typeof obj.t === 'string' && obj.t) {
                if (!t.first) {
                  t.first = performance.now(); t.d = clock.durations(); t.m2 = t.t0 + (t.d[0] || 0) + (t.d[1] || 0);
                  clock.fast(); clock.jump(3);
                }
                reply += obj.t;
                if (!raf) raf = requestAnimationFrame(flush);
              } else if (obj && obj.error) { error = obj.error; break outer; }
            }
          }
        }
      } catch (e) {
        if (!st.current.aborted && !reply) error = e.name === 'AbortError' ? 'زمان پاسخ‌گویی سرور تمام شد' : 'ارتباط با سرور برقرار نشد';
        else if (!st.current.aborted) error = 'ارتباط وسط پاسخ قطع شد';
        checkHealth();
      }
      cancelAnimationFrame(raf);
      t.end = performance.now();
      if (!t.first) { t.d = clock.durations(); t.m2 = t.t0 + (t.d[0] || 0) + (t.d[1] || 0); }
      clock.stop();

      if (st.current.aborted && !reply) {
        setPending(null);
        if (created && !T.get().threads.find(x => x.id === thread.id).messages.length) T.remove(thread.id);
        if (fromInput && !composer.current.value()) composer.current.set(text);
        toast('ارسال متوقف شد');
        return;
      }
      const ok = !!reply;
      const msg = {
        id: newId('msg'), text, ts: Date.now(),
        reply: ok ? reply : null,
        error: ok ? null : (error || 'پاسخی از سرور دریافت نشد'),
        thinkingMs: Math.round((t.first || t.end) - t.t0),
        steps: chatSteps(text, history.length / 2, t, reply, ok ? (st.current.aborted ? 'متوقف شد' : error) : error)
      };
      T.update(thread.id, th => ({ ...th, messages: [...th.messages, msg], updatedAt: Date.now() }));
      setPending(null);
      setFreshId(msg.id);
      requestAnimationFrame(() => keepPinned());
    } finally {
      clearTimeout(timer); clock.stop();
      Object.assign(st.current, { ctrl: null, busy: false });
      setBusy(false);
      if (CAN_HOVER && composer.current) composer.current.focus();
    }
  });
  const stop = () => { if (!st.current.busy) return; st.current.aborted = true; try { st.current.ctrl && st.current.ctrl.abort(); } catch (e) {} };

  /* ---------- threads ---------- */
  const busyToast = () => toast('صبر کنید تا پاسخ فعلی تمام شود');
  const newThread = () => { if (st.current.busy) return busyToast(); T.setActive(null); setMobileOpen(false); setFreshId(null); composer.current && composer.current.focus(); };
  const select = id => { if (st.current.busy) return busyToast(); setMobileOpen(false); if (id !== T.activeId) { setFreshId(null); T.setActive(id); } };
  const del = id => {
    if (st.current.busy && id === T.activeId) return busyToast();
    const th = T.threads.find(t => t.id === id); if (!th) return;
    const wasActive = id === T.activeId;
    T.remove(id);
    toast('گفتگو حذف شد', { type: 'info', action: { label: 'بازگردانی', onClick: () => T.restore(th, wasActive) } });
  };
  const clearAll = async () => {
    if (st.current.busy) return busyToast();
    if (!T.threads.length) return toast('تاریخچه از قبل خالی است', { type: 'info' });
    const yes = await ask({ type: 'danger', title: 'همه‌ی گفتگوها پاک شود؟', text: `${fa(T.threads.length)} گفتگو برای همیشه از این مرورگر حذف می‌شود و قابل بازگشت نیست.`, confirmText: 'بله، پاک کن', confirmIcon: 'trash', cancelText: 'انصراف' });
    if (!yes) return;
    T.clear(); setSettings(false); toast('تاریخچه پاک شد');
  };
  const toggleSidebar = () => {
    if (innerWidth < 768) return setMobileOpen(o => !o);
    setCollapsed(c => { store.set(UI_KEY, JSON.stringify({ collapsed: !c })); return !c; });
  };
  const exportOne = () => { if (!active) return toast('گفتگویی برای خروجی انتخاب نشده'); download(`unicollect_chat_${active.id}.json`, active); toast('فایل JSON دانلود شد'); };
  const redo = id => {
    if (st.current.busy) return busyToast();
    const f = T.findMessage(id); if (!f) return;
    T.update(f.thread.id, th => ({ ...th, messages: th.messages.filter(m => m.id !== id) }));
    setTimeout(() => send(f.msg.text, false), 30);
  };

  useEffect(() => {
    checkHealth();
    const iv = setInterval(() => { if (!document.hidden) checkHealth(); }, 15000);
    const onResize = () => { if (innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener('resize', onResize, { passive: true });
    if (CAN_HOVER) setTimeout(() => composer.current && composer.current.focus(), 50);
    return () => { clearInterval(iv); window.removeEventListener('resize', onResize); };
  }, []);
  useEffect(() => {
    const on = e => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); newThread(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setSettings(false); setSearch(s => !s); return; }
      if (e.key === 'Escape') { if (search) return setSearch(false); if (settings) return setSettings(false); setMobileOpen(false); }
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [search, settings]);

  const nav = [
    { icon: 'edit', label: 'گفتگوی جدید', onClick: newThread },
    { icon: 'search', label: 'جستجوی گفتگوها', onClick: () => { setMobileOpen(false); setSearch(true); }, kbd: 'Ctrl K' },
    { icon: 'info', label: 'درباره و وضعیت', onClick: () => { setMobileOpen(false); setSettings(true); } }
  ];

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '') + (mobileOpen ? ' mobile-open' : '')}>
      <Sidebar threads={T.threads} activeId={T.activeId} onSelect={select} onDelete={del} onNew={newThread} onToggle={toggleSidebar}
        nav={nav} profileName="Unicollect" statusCls={health.cls} statusLabel={health.label} onProfile={() => { setMobileOpen(false); setSettings(true); }} dotFor={() => 'dot-chat'} />
      <div className="backdrop" onClick={() => setMobileOpen(false)} />
      <main className={'main' + (welcome ? ' welcome' : '')}>
        <header className="topbar">
          <div className="tb-start">
            <button className="icon-btn open-sb" onClick={toggleSidebar} title="باز کردن نوار کناری" aria-label="باز کردن نوار کناری"><Icon name="sidebar" /></button>
            <button className="icon-btn new-top" onClick={newThread} title="گفتگوی جدید" aria-label="گفتگوی جدید"><Icon name="edit" /></button>
            <span className="model-btn static"><span className="model-name">Unicollect</span><span className={'sdot ' + health.cls} /></span>
          </div>
          <div className="tb-end">
            <button className="icon-btn" onClick={() => setSearch(true)} title="جستجو (Ctrl+K)" aria-label="جستجو"><Icon name="search" /></button>
            <button className="icon-btn" onClick={exportOne} title="خروجی JSON گفتگو" aria-label="خروجی JSON گفتگو"><Icon name="share" /></button>
          </div>
        </header>
        <div className={'body' + (welcome ? ' is-welcome' : '')}>
          <AnimatePresence initial={false}>
            {welcome && (
              <motion.div key="hero" className="hero-area" initial={{ opacity: 0, filter: 'blur(8px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, transition: { duration: .12 } }}>
                <Hero greeting={hero.g} prompt={hero.p} />
              </motion.div>
            )}
          </AnimatePresence>
          <section className="scroll" ref={scroller} hidden={welcome}>
            <div className="col stream">
              {active && active.messages.map(m => (
                <div key={m.id} className="turn">
                  <UserTurn text={m.text} onCopy={() => copyText(m.text).then(() => toast('متن کپی شد'))} onRedo={() => redo(m.id)} redoTitle="ارسال دوباره" />
                  <BotTurn m={m} fresh={m.id === freshId} onCopy={() => copyText(m.reply || '').then(() => toast('پاسخ کپی شد'))} onRedo={() => redo(m.id)} />
                </div>
              ))}
              {pending && (
                <div className="turn pending">
                  <UserTurn text={pending.text} fresh />
                  <div className="msg bot"><div className="bot-body">
                    <AnimatePresence mode="wait">
                      {!pending.streaming
                        ? <ThinkingBlock key="t" phases={STEPS} idx={clock.idx} marks={clock.marks} t0={clock.t0}
                            details={[`${fa(Array.from(pending.text).length)} نویسه`]} />
                        : <motion.div key="w" className="writing-line" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            <span className="shiny">در حال نوشتن پاسخ</span>
                          </motion.div>}
                    </AnimatePresence>
                    {pending.streaming && (
                      <div className="md live" dir={textDir(pending.reply)}><Md text={pending.reply} /><span className="stream-dot" /></div>
                    )}
                  </div></div>
                </div>
              )}
            </div>
          </section>
          <motion.div layout="position" className="composer-area" transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
            <div className="col">
              <Composer ref={composer} maxLength={MAX_TEXT} placeholder="از Unicollect بپرس…" ariaLabel="پیام" busy={busy}
                onSend={v => send(v, true)} onStop={stop} onTooLong={() => toast(`پیام طولانی است (حداکثر ${fa(MAX_TEXT)} نویسه)`)}
                leftSlot={<>
                  <button className="round-btn" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t && !composer.current.insert(t)) toast('به حداکثر طول پیام رسیده‌اید'); } catch (e) { toast('دسترسی به کلیپ‌بورد ممکن نیست'); } }} title="جای‌گذاری از کلیپ‌بورد" aria-label="جای‌گذاری از کلیپ‌بورد"><Icon name="plus" /></button>
                  <button className="pill-btn" onClick={() => setSettings(true)}><span className={'sdot ' + health.cls} /><span>{health.label}</span></button>
                </>} />
              <AnimatePresence>
                {welcome && (
                  <motion.div className="chips" initial="h" animate="s" exit={{ opacity: 0, transition: { duration: .15 } }} variants={{ s: { transition: { staggerChildren: .05, delayChildren: .25 } } }}>
                    {STARTERS.map(([ic, label, text], i) => (
                      <motion.button key={i} className="chip" onClick={() => send(text, false)}
                        variants={{ h: { opacity: 0, y: 10, filter: 'blur(6px)' }, s: { opacity: 1, y: 0, filter: 'blur(0px)' } }}>
                        <Icon name={ic} /><span>{label}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <p className="disclaimer">Unicollect ممکن است اشتباه کند؛ اطلاعات مهم را بررسی کنید.</p>
            </div>
          </motion.div>
        </div>
      </main>

      <SearchModal open={search} onClose={() => setSearch(false)} threads={T.threads} activeId={T.activeId} dotFor={() => 'dot-chat'}
        textOf={m => (m ? `${m.text} ${m.reply || ''}` : '')} onPick={id => { setSearch(false); select(id); }} />

      <Modal open={settings} onClose={() => setSettings(false)} title="Unicollect Chat"
        foot={<div className="modal-foot">
          <button className="btn-danger" onClick={clearAll}><Icon name="trash" /><span>پاک کردن همه گفتگوها</span></button>
          <button className="btn-primary" onClick={() => setSettings(false)}>بستن</button>
        </div>}>
        <div className="modal-body">
          <div className="kv"><span>وضعیت</span><b><span className={'sdot ' + health.cls} style={{ display: 'inline-block', marginInlineEnd: 8 }} />{health.label}</b></div>
          <div className="kv"><span>سازنده</span><b>موویکسو</b></div>
          <div className="kv"><span>حافظه‌ی گفتگو</span><b>{fa(MAX_HISTORY_TURNS)} نوبت آخر</b></div>
          <div className="kv"><span>حداکثر طول پیام</span><b>{fa(MAX_TEXT)} نویسه</b></div>
          <div className="kv"><span>تاریخچه</span><b>فقط در همین مرورگر</b></div>
        </div>
      </Modal>
    </div>
  );
}
