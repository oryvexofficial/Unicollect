/* Unicollect Guard panel. A ChatGPT-shaped desk where every message gets a
   stamped verdict from five models. Runs on the service (/) and on the public
   site's chat page (pages mode). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../shared/icons.jsx';
import useThreads from '../shared/chat/useThreads.js';
import Sidebar from '../shared/chat/Sidebar.jsx';
import SearchModal from '../shared/chat/SearchModal.jsx';
import Modal from '../shared/chat/Modal.jsx';
import Composer from '../shared/chat/Composer.jsx';
import { useConfirm, useToast } from '../shared/chat/Toast.jsx';
import { ThinkingBlock, usePhaseClock } from '../shared/chat/Thinking.jsx';
import { UserTurn } from '../shared/chat/Turns.jsx';
import { Hero, useHeroLines } from '../shared/chat/Hero.jsx';
import { Dropdown } from '../shared/chat/Topbar.jsx';
import { useEvent } from '../shared/hooks.js';
import { CAN_HOVER, REDUCED, copyText, download, fa, faDigits, newId, num, sleep, store } from '../shared/util.js';
import { API, MAX_TEXT, censorText, normalizeResult, resolveApi } from './api.js';
import ResultCard from './ResultCard.jsx';
import { GUARD_STEPS, GUARD_HOLD, guardSteps } from './steps.js';

const UI_KEY = 'unicollect_ui_v1';
const REQUEST_TIMEOUT_MS = 180000, HEALTH_TIMEOUT_MS = 8000;
const PROMPTS = ['چه متنی را برایتان بررسی کنم؟', 'بزن بریم سراغ بررسی!', 'دیگه چه فحش‌هایی قراره ببینم!', 'خب، چی آوردی برام؟', 'امروز چه متنی رو بررسی کنیم؟', 'متن بعدی رو بفرست تا ببینم', 'بذار ببینم چی آوردی', 'آماده‌ی بررسی‌ام، شروع کن!', 'چه خبر؟ متن جدیدی داری؟', 'بریم سراغ یه بررسی دیگه', 'چی تو سرت می‌گذره؟', 'متن بعدی رو بفرست', 'چه نوشته‌ای داری برای من؟', 'بیا شروع کنیم', 'منتظر متنتم...', 'یه متن قشنگ بیار برام', 'خب دیگه، شروع کن!', 'متن بعدی رو بیار وسط', 'چی آماده کردی امروز؟', 'بذار یه نگاه بندازم', 'خب، بررسی کنیم', 'بریم یه گشت تو متنت بزنیم', 'می‌خوای ببینی چقدر سالمه؟', 'شروع کن، گوش می‌دم', 'چه خبر جدید؟'];
const CHIPS = [
  ['smile', 'نمونه فارسی سالم', 'سلام وقت بخیر، از همکاری با شما بسیار خوشحالم.'],
  ['globe', 'نمونه انگلیسی سالم', 'Have a wonderful and productive day ahead!'],
  ['alert', 'نمونه انگلیسی توهین‌آمیز', 'You are completely stupid and useless'],
  ['lang', 'نمونه فینگلیش سالم', 'salam khoobi? man khoobam mersi'],
  ['shield', 'نمونه فینگلیش توهین‌آمیز ۱', 'to khar hasti'],
  ['shield', 'نمونه فینگلیش توهین‌آمیز ۲', 'khafe sho ahmagh']
];

function lastDecision(t) {
  const m = t.messages && t.messages[t.messages.length - 1];
  const r = m && m.result;
  if (!r || r.error || !r.decision) return 'dot-err';
  return r.decision === 'TOXIC' ? 'dot-bad' : r.decision === 'SUSPECT' ? 'dot-warn' : 'dot-ok';
}

export default function App() {
  const T = useThreads('unicollect_threads_v4', { extra: { viewMode: 'detailed' } });
  const toast = useToast();
  const ask = useConfirm();

  const viewMode = T.ext.viewMode === 'compact' ? 'compact' : 'detailed';
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);       // { text, leaving }
  const [freshId, setFreshId] = useState(null);
  const [censorBusy, setCensorBusy] = useState(null);
  const [collapsed, setCollapsed] = useState(() => !!(store.json(UI_KEY, {}).collapsed && typeof window !== 'undefined' && innerWidth >= 768));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [search, setSearch] = useState(false);
  const [health, setHealth] = useState({ cls: 'warn', label: 'در حال اتصال…', pill: '۵ مدل', data: null });
  const [online, setOnline] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [, force] = useState(0);
  const clock = usePhaseClock(GUARD_STEPS, { holdAt: GUARD_HOLD });
  const composer = useRef(null), scroller = useRef(null), burst = useRef(null);
  const st = useRef({ ctrl: null, aborted: false, busy: false, healthBusy: false, online: null });
  const hero = useHeroLines(PROMPTS, [T.activeId === null]);

  T.onStorageFull(() => toast('حافظه مرورگر پر است؛ گفتگوهای قدیمی را پاک کنید'));
  const active = T.active;
  const welcome = !pending && (!active || !active.messages.length);

  /* ---------- scrolling ---------- */
  const keepPinned = useCallback(force => {
    const c = scroller.current; if (!c) return;
    if (force || c.scrollHeight - c.scrollTop - c.clientHeight < 160) c.scrollTop = c.scrollHeight;
  }, []);
  const toBottom = smooth => { const c = scroller.current; if (c) c.scrollTo({ top: c.scrollHeight, behavior: smooth && !REDUCED ? 'smooth' : 'auto' }); };
  useEffect(() => { requestAnimationFrame(() => toBottom(false)); }, [T.activeId]);
  useEffect(() => {
    const c = scroller.current; if (!c || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => keepPinned()); ro.observe(c.firstElementChild || c);
    return () => ro.disconnect();
  }, [welcome]);

  /* ---------- health ---------- */
  const checkHealth = useEvent(async () => {
    if (st.current.healthBusy) return;
    st.current.healthBusy = true;
    const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    let next, ok = false;
    try {
      const base = await resolveApi();
      if (base === null) throw new Error('offline');
      const r = await fetch(API.url('/health'), { cache: 'no-store', signal: ctrl.signal });
      const d = await r.json();
      ok = true;
      const n = (d.loaded_models || []).length;
      const total = n + Object.keys(d.errors || {}).length || 5;
      if (d.status === 'ok') next = { cls: 'ok', label: `${fa(n)}/${fa(total)} مدل فعال`, pill: `${fa(n)} مدل فعال`, data: d };
      else if (d.status === 'loading') next = { cls: 'warn', label: `بارگذاری مدل‌ها (${fa(n)}/${fa(total)})…`, pill: 'در حال بارگذاری', data: d };
      else next = { cls: 'bad', label: 'خطا در بارگذاری', pill: 'خطا در مدل‌ها', data: d };
    } catch (e) {
      next = { cls: 'bad', pill: 'آفلاین', label: API.mode === 'pages' && API.base === null ? 'سرویس فعلاً آفلاین است' : 'سرور در دسترس نیست', data: null };
      if (API.mode === 'pages' && !API.override()) API.base = null;
    } finally { clearTimeout(to); st.current.healthBusy = false; }
    setHealth(h => ({ ...next, data: next.data || h.data }));
    if (ok && st.current.online === false) toast('سرویس دوباره در دسترس است');
    st.current.online = ok; setOnline(ok);
  });

  const retry = async () => {
    setRetrying(true);
    API.base = API.mode === 'local' ? '' : null;
    await resolveApi(true); await checkHealth();
    setTimeout(() => setRetrying(false), 400);
  };

  /* ---------- analyze ---------- */
  const analyze = useEvent(async (raw, fromInput) => {
    const text = (raw || '').trim();
    if (!text || st.current.busy) return;
    if (text.length > MAX_TEXT) { toast(`متن طولانی است (حداکثر ${fa(MAX_TEXT)} نویسه)`); return; }
    const ctrl = new AbortController();
    Object.assign(st.current, { ctrl, aborted: false, busy: true });
    setBusy(true); setFreshId(null);
    if (fromInput) composer.current.clear();

    let thread = T.get().threads.find(t => t.id === T.get().activeId);
    let created = false;
    if (!thread) {
      const one = text.replace(/\s+/g, ' ');
      thread = { id: newId('th'), title: one.slice(0, 40) + (one.length > 40 ? '…' : ''), createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
      T.add(thread); created = true;
    }
    setPending({ text, leaving: false });
    clock.start();
    requestAnimationFrame(() => toBottom(true));

    const sentAt = performance.now();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const bail = async () => {
      clock.stop();
      setPending(p => p && { ...p, leaving: true }); await sleep(REDUCED ? 0 : 200);
      setPending(null);
      if (created && !T.get().threads.find(t => t.id === thread.id).messages.length) T.remove(thread.id);
      if (fromInput && !composer.current.value()) composer.current.set(text);
      toast('تحلیل متوقف شد');
    };
    try {
      let result;
      try {
        const base = await resolveApi();
        if (base === null) throw Object.assign(new Error('offline'), { name: 'OfflineError' });
        const r = await fetch(API.url(API.checkPath), {
          method: 'POST', headers: API.headers(true), signal: ctrl.signal,
          body: JSON.stringify(API.mode === 'local' ? { text } : { text, detailed: true })
        });
        let body = null;
        try { body = await r.json(); } catch (_) { body = null; }
        result = normalizeResult(body, r.status);
      } catch (e) {
        if (st.current.aborted) result = null;
        else if (e.name === 'OfflineError') { result = { error: 'سرویس فعلاً آفلاین است؛ چند دقیقه بعد دوباره امتحان کن.' }; setOnline(false); st.current.online = false; }
        else {
          result = { error: e.name === 'AbortError' ? 'زمان پاسخ‌گویی سرور تمام شد' : 'ارتباط با سرور برقرار نشد' };
          if (API.mode === 'pages' && !API.override()) API.base = null;
          checkHealth();
        }
      }
      clock.fast();
      if (st.current.aborted) return await bail();
      // let the phases play out (never just flash), capped so it can't stall
      while (!clock.isDone() && !st.current.aborted && performance.now() - sentAt < 12000) await sleep(60);
      if (st.current.aborted) return await bail();

      const thinkingMs = Math.round(Math.max(performance.now() - sentAt, 1100));
      const steps = guardSteps(text, result, clock.durations());
      const msg = { id: newId('msg'), text, result, ts: Date.now(), thinkingMs, steps };
      clock.stop();
      setPending(p => p && { ...p, leaving: true });
      await sleep(REDUCED ? 0 : 230);
      if (st.current.aborted) return await bail();
      T.update(thread.id, t => ({ ...t, messages: [...t.messages, msg], updatedAt: Date.now() }));
      setPending(null);
      setFreshId(msg.id);
      requestAnimationFrame(() => keepPinned(true));
    } finally {
      clearTimeout(timer); clock.stop();
      Object.assign(st.current, { ctrl: null, busy: false });
      setBusy(false);
      if (CAN_HOVER && composer.current) composer.current.focus();
    }
  });
  const stop = () => {
    if (!st.current.busy) return;
    st.current.aborted = true;
    try { st.current.ctrl && st.current.ctrl.abort(); } catch (e) {}
  };

  /* ---------- threads ---------- */
  const busyToast = () => toast('صبر کنید تا تحلیل فعلی تمام شود');
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
  const exportAll = () => {
    if (!T.threads.length) return toast('گفتگویی برای خروجی نیست');
    download(`unicollect_threads_${new Date().toISOString().slice(0, 10)}.json`, { app: 'unicollect-guard', version: 1, exported_at: new Date().toISOString(), threads: T.threads });
    toast(`${fa(T.threads.length)} گفتگو دانلود شد`);
  };
  const exportOne = () => { if (!active) return toast('گفتگویی برای خروجی انتخاب نشده'); download(`unicollect_${active.id}.json`, active); toast('فایل JSON دانلود شد'); };
  const importFile = f => {
    if (st.current.busy) return busyToast();
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        const list = Array.isArray(d) ? d : Array.isArray(d.threads) ? d.threads : d && d.id && d.messages ? [d] : [];
        if (!list.length) throw new Error('empty');
        const added = T.merge(list);
        toast(added ? `${fa(added)} گفتگو اضافه شد` : 'همه‌ی این گفتگوها از قبل بودند');
      } catch (e) { toast('فایل JSON معتبر نیست'); }
    };
    rd.readAsText(f);
  };

  /* ---------- message actions ---------- */
  const find = id => T.findMessage(id);
  const redo = id => { if (st.current.busy) return busyToast(); const f = find(id); if (f) analyze(f.msg.text, false); };
  const setCensor = (id, patch) => {
    const f = find(id); if (!f) return;
    T.update(f.thread.id, t => ({ ...t, messages: t.messages.map(m => (m.id === id ? { ...m, censored: patch(m.censored) } : m)) }));
  };
  const hideCensor = id => setCensor(id, c => c && { ...c, hidden: true });
  const censor = async id => {
    const f = find(id); if (!f || censorBusy) return;
    const old = f.msg.censored;
    // already censored: the button just shows / hides the section (no new request)
    if (old && !old.error) { setCensor(id, c => ({ ...c, hidden: !c.hidden })); if (old.hidden) requestAnimationFrame(() => keepPinned()); return; }
    setCensorBusy(id);
    let c;
    try { c = await censorText(f.msg.text); } catch (e) { c = { error: 'سانسور انجام نشد: ' + (e.message || 'خطا') }; }
    setCensor(id, () => ({ ...c, hidden: false }));
    setCensorBusy(null);
    requestAnimationFrame(() => keepPinned());
  };
  const copyReport = m => {
    const r = m.result;
    copyText(`متن: "${m.text}"\nنتیجه: ${r.decision} (میانگین ۲ نمره‌ی برتر ${faDigits((num(r.confidence) * 100).toFixed(1))}٪ | آرا ${faDigits(num(r.votes_count))}/${faDigits(num(r.total_models))})`).then(() => toast('گزارش کپی شد'));
  };
  const setView = mode => { if (mode !== viewMode) T.setExt('viewMode', mode); };

  /* ---------- boot ---------- */
  useEffect(() => {
    checkHealth().then(() => {
      let q = null;
      try { q = new URLSearchParams(location.search).get('text'); } catch (e) {}
      if (!q || !q.trim()) return;
      try { const u = new URL(location.href); u.searchParams.delete('text'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
      T.setActive(null);
      setTimeout(() => analyze(q.slice(0, MAX_TEXT), false), 30);
    });
    const iv = setInterval(() => { if (!document.hidden) checkHealth(); }, 12000);
    const vis = () => { document.documentElement.classList.toggle('tab-hidden', document.hidden); if (!document.hidden) checkHealth(); };
    document.addEventListener('visibilitychange', vis);
    const onResize = () => { if (innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener('resize', onResize, { passive: true });
    const sub = () => force(x => x + 1);
    API.listeners.add(sub);
    if (CAN_HOVER) setTimeout(() => composer.current && composer.current.focus(), 50);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); window.removeEventListener('resize', onResize); API.listeners.delete(sub); };
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
  useEffect(() => { if (settings) checkHealth(); }, [settings]);

  const swagger = API.live('/docs');
  const nav = [
    { icon: 'edit', label: 'گفتگوی جدید', onClick: newThread },
    { icon: 'search', label: 'جستجوی گفتگوها', onClick: () => { setMobileOpen(false); setSearch(true); }, kbd: 'Ctrl K' },
    { icon: 'layers', label: 'مدل‌ها و وضعیت', onClick: () => { setMobileOpen(false); setSettings(true); } },
    { icon: 'code', label: 'مستندات API', href: API.docsHref(), target: API.mode === 'local' ? '_blank' : undefined },
    { icon: 'info', label: 'Swagger / OpenAPI', href: swagger || undefined, target: '_blank', disabled: !swagger },
    { icon: 'home', label: 'سایت Unicollect', href: API.siteHref() }
  ];
  const d = health.data;

  const composerBlock = (
    <motion.div layout="position" className="composer-area" transition={{ type: 'spring', stiffness: 260, damping: 32 }}>
      <div className="col">
        <AnimatePresence>
          {online === false && (
            <motion.div className="svc-banner" role="status" initial={{ opacity: 0, height: 0, marginBottom: 0 }} animate={{ opacity: 1, height: 'auto', marginBottom: 10 }} exit={{ opacity: 0, height: 0, marginBottom: 0 }}>
              <span className="svc-ico"><Icon name="wifioff" /></span>
              <span className="svc-text"><b>سرویس فعلاً آفلاین است.</b> <span>هر اجرای سرویس لینک تازه می‌گیرد؛ چند دقیقه بعد دوباره امتحان کن.</span></span>
              <button className={'svc-retry' + (retrying ? ' spin' : '')} type="button" onClick={retry}><Icon name="refresh" /><span>تلاش دوباره</span></button>
            </motion.div>
          )}
        </AnimatePresence>
        <Composer ref={composer} maxLength={MAX_TEXT} placeholder="هر متنی را برای بررسی بنویسید…" ariaLabel="متن برای بررسی" busy={busy}
          onSend={v => analyze(v, true)} onStop={stop} onTooLong={() => toast(`متن طولانی است (حداکثر ${fa(MAX_TEXT)} نویسه)`)}
          leftSlot={<>
            <button className="round-btn" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t && !composer.current.insert(t)) toast('به حداکثر طول متن رسیده‌اید'); } catch (e) { toast('دسترسی به کلیپ‌بورد ممکن نیست'); } }} title="جای‌گذاری از کلیپ‌بورد" aria-label="جای‌گذاری از کلیپ‌بورد"><Icon name="plus" /></button>
            <button className="pill-btn" onClick={() => setSettings(true)}><Icon name="sliders" /><span>{health.pill}</span></button>
          </>} />
        <AnimatePresence>
          {welcome && (
            <motion.div className="chips" initial="h" animate="s" exit={{ opacity: 0, transition: { duration: .15 } }} variants={{ s: { transition: { staggerChildren: .05, delayChildren: .25 } } }}>
              {CHIPS.map(([ic, label, text], i) => (
                <motion.button key={i} className="chip" onClick={() => analyze(text, false)}
                  variants={{ h: { opacity: 0, y: 10, filter: 'blur(6px)' }, s: { opacity: 1, y: 0, filter: 'blur(0px)' } }}>
                  <Icon name={ic} /><span>{label}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="disclaimer">Unicollect از ۵ مدل زبانی با رأی‌گیری اجماعی استفاده می‌کند و می‌تواند اشتباه کند. نتایج را بررسی کنید.</p>
      </div>
    </motion.div>
  );

  return (
    <div className={'app' + (collapsed ? ' collapsed' : '') + (mobileOpen ? ' mobile-open' : '')}>
      <Sidebar threads={T.threads} activeId={T.activeId} onSelect={select} onDelete={del} onNew={newThread} onToggle={toggleSidebar}
        nav={nav} profileName="هستهٔ Unicollect" statusCls={health.cls} statusLabel={health.label} onProfile={() => { setMobileOpen(false); setSettings(true); }} dotFor={lastDecision} />
      <div className="backdrop" onClick={() => setMobileOpen(false)} />
      <main className={'main' + (welcome ? ' welcome' : '')}>
        <header className="topbar">
          <div className="tb-start">
            <button className="icon-btn open-sb" onClick={toggleSidebar} title="باز کردن نوار کناری" aria-label="باز کردن نوار کناری"><Icon name="sidebar" /></button>
            <button className="icon-btn new-top" onClick={newThread} title="گفتگوی جدید" aria-label="گفتگوی جدید"><Icon name="edit" /></button>
            <Dropdown label={viewMode === 'compact' ? 'سریع' : 'دقیق'} value={viewMode} onPick={setView} items={[
              { value: 'detailed', title: 'دقیق', desc: 'نمای کامل با ریز نمرهٔ همهٔ مدل‌ها' },
              { value: 'compact', title: 'سریع', desc: 'فقط نتیجهٔ نهایی، بدون ریز نمرات' }
            ]} />
          </div>
          <div className="tb-end">
            <a className="icon-btn hide-sm" href={API.docsHref()} target={API.mode === 'local' ? '_blank' : undefined} rel="noopener" title="مستندات API" aria-label="مستندات API"><Icon name="code" /></a>
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
                  <UserTurn text={m.text} onCopy={() => copyText(m.text).then(() => toast('متن کپی شد'))} onRedo={() => redo(m.id)} />
                  <ResultCard msg={m} fresh={m.id === freshId} viewMode={viewMode}
                    burst={(x, y, c, n, p) => burst.current && burst.current.fire(x, y, c, n, p)}
                    onCopyReport={() => copyReport(m)} onCopyJSON={() => copyText(JSON.stringify(m.result, null, 2)).then(() => toast('JSON کپی شد'))}
                    onRedo={() => redo(m.id)} onCensor={() => censor(m.id)} onHideCensor={() => hideCensor(m.id)} censorBusy={censorBusy === m.id}
                    onCopyCensored={() => m.censored && m.censored.text && copyText(m.censored.text).then(() => toast('متن سانسورشده کپی شد'))} />
                </div>
              ))}
              {pending && (
                <div className={'turn pending' + (pending.leaving ? ' leaving' : '')}>
                  <UserTurn text={pending.text} scanning={!pending.leaving} fresh />
                  <div className="msg bot"><div className="bot-body">
                    <AnimatePresence>{!pending.leaving && <ThinkingBlock key="t" phases={GUARD_STEPS} idx={clock.idx} marks={clock.marks} t0={clock.t0} voters={5} voterStep={GUARD_HOLD}
                      details={[`${fa(Array.from(pending.text).length)} نویسه`]} />}</AnimatePresence>
                  </div></div>
                </div>
              )}
            </div>
          </section>
          {composerBlock}
        </div>
      </main>

      <SearchModal open={search} onClose={() => setSearch(false)} threads={T.threads} activeId={T.activeId} dotFor={lastDecision}
        textOf={m => (m ? m.text : '')} onPick={id => { setSearch(false); select(id); }} />

      <Modal open={settings} onClose={() => setSettings(false)} title="تنظیمات و وضعیت Ensemble"
        foot={<div className="modal-foot">
          <button className="btn-danger" onClick={clearAll}><Icon name="trash" /><span>پاک کردن همه گفتگوها</span></button>
          <button className="btn-primary" onClick={() => setSettings(false)}>بستن</button>
        </div>}>
        <div className="modal-body">
          <div className="kv"><span>آستانه رأی هر مدل</span><b>۰٫۵۰</b></div>
          <div className="kv"><span>حداقل رأی برای برچسب سمی</span><b>۲</b></div>
          <div className="kv"><span>تک‌مدل قاطع</span><b>۰٫۹۰</b></div>
          <div className="kv"><span>تک‌مدل قاطع (فینگیلیش)</span><b>۰٫۹۵</b></div>
          <div className="kv"><span>همزمانی پردازش</span><b className="mono">{d && d.concurrency ? `${faDigits(d.concurrency)} (اوج ${faDigits(d.peak || 0)})` : '—'}</b></div>
          <div className="kv"><span>API</span><b className="mono"><a href={API.docsHref()} target="_blank" rel="noopener">/api/v1</a> · {swagger ? <a href={swagger} target="_blank" rel="noopener">/docs</a> : <span style={{ opacity: .5 }}>/docs</span>}</b></div>
          <div className="kv"><span>اتصال</span><b>{API.mode === 'local' ? 'همین سرور' : API.override() ? 'سرور سفارشی' : 'لینک زنده (links.json)'}</b></div>
          <label className="kv"><span><Icon name="key" />کلید API <small>(اختیاری)</small></span>
            <input className="cfg-in" type="password" dir="ltr" autoComplete="off" spellCheck="false" placeholder="X-API-Key" defaultValue={API.key()}
              onChange={e => { const v = e.target.value.trim(); API.setKey(v); }} onBlur={e => toast(e.target.value.trim() ? 'کلید ذخیره شد' : 'کلید پاک شد')} /></label>
          {API.mode === 'pages' && (
            <label className="kv"><span><Icon name="link" />سرور سفارشی <small>(اختیاری)</small></span>
              <input className="cfg-in" type="url" dir="ltr" autoComplete="off" spellCheck="false" placeholder="https://…trycloudflare.com" defaultValue={API.override()}
                onBlur={e => {
                  const v = e.target.value.trim().replace(/\/+$/, '');
                  if (v === API.override()) return;
                  if (v && !/^https?:\/\//i.test(v)) { toast('آدرس باید با http(s):// شروع شود'); return; }
                  API.setOverride(v); toast(v ? 'سرور سفارشی تنظیم شد' : 'برگشت به سرور پیش‌فرض'); retry();
                }} /></label>
          )}
          <div className="kv col-kv">
            <span>مدل‌های بارگذاری‌شده</span>
            <div className="models-list">
              {!d && <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>در حال بررسی…</span>}
              {d && !(d.loaded_models || []).length && !Object.keys(d.errors || {}).length && <span style={{ color: 'var(--ink-3)', fontSize: 14 }}>مدلی بارگذاری نشده</span>}
              {d && (d.loaded_models || []).map((x, i) => <motion.div key={x} className="ml" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * .05 }}><span className="model-id">{x}</span><span className="ok">آماده</span></motion.div>)}
              {d && Object.keys(d.errors || {}).map(x => <div key={x} className="ml"><span>{x}</span><span className="err">خطا</span></div>)}
            </div>
          </div>
        </div>
        <div className="io-row">
          <button className="btn-ghost" type="button" onClick={exportAll}><Icon name="download" /><span>خروجی همه‌ی گفتگوها</span></button>
          <label className="btn-ghost" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.querySelector('input').click(); } }}>
            <Icon name="upload" /><span>وارد کردن از JSON</span>
            <input type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files && e.target.files[0]; if (f) importFile(f); e.target.value = ''; }} />
          </label>
        </div>
      </Modal>
    </div>
  );
}
