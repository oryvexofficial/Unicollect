// API docs: live links card, searchable TOC that follows the scroll, guide
// sections, 21 endpoint accordions (open AND close animate, deep-linkable,
// "copy link"), and a console that runs against the live service and can
// copy the exact request as curl.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../../shared/icons.jsx';
import Reveal from '../../shared/fx/Reveal.jsx';
import { BlurText } from '../../shared/fx/text.jsx';
import { useToast } from '../../shared/chat/Toast.jsx';
import { REDUCED, copyText, escapeHtml, fa } from '../../shared/util.js';
import { LiveLink, PLACEHOLDER, relTimeIso, useLive } from '../live.jsx';
import DATA from '../data/api_raw.json';

const cleanTitle = t => t.replace(/[۰-۹0-9]+$/, '').trim();
const EP_IDS = DATA.groups.flatMap(g => g.eps.map(e => e.id));
const EP_OPEN0 = Object.fromEntries(DATA.groups.flatMap(g => g.eps.map(e => [e.id, !!e.open])));

function useSub() {
  const L = useLive();
  return t => String(t).split(PLACEHOLDER).join(L.url || PLACEHOLDER).split('https://USER.github.io/REPO/').join(L.pagesUrl);
}

function hlJson(s) {
  return escapeHtml(s)
    .replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)/g, '<span class="tok-p">$1</span>$2')
    .replace(/(:\s*|\[\s*|,\s*|^\s+)(&quot;(?:[^&]|&(?!quot;))*?&quot;)/gm, '$1<span class="tok-s">$2</span>')
    .replace(/(:\s*)(-?\d+(?:\.\d+)?)/g, '$1<span class="tok-n">$2</span>')
    .replace(/(:\s*)(true|false|null)/g, '$1<span class="tok-k">$2</span>');
}

function CodeTabs({ tabs }) {
  const [i, setI] = useState(0);
  const sub = useSub();
  const toast = useToast();
  const text = sub(tabs[i].text);
  const isJson = /^\s*[{[]/.test(text);
  return (
    <div className="code">
      <div className="code-bar" role="tablist">
        {tabs.map((t, k) => <button key={k} type="button" role="tab" className="tab" aria-selected={k === i} onClick={() => setI(k)}>{t.label}</button>)}
        <button className="copy" type="button" onClick={() => copyText(text).then(() => toast('کپی شد'))}><Icon name="copy" /><span>کپی</span></button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.pre key={i} initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
          {isJson ? <code dangerouslySetInnerHTML={{ __html: hlJson(text) }} /> : <code>{text}</code>}
        </motion.pre>
      </AnimatePresence>
    </div>
  );
}

function Blocks({ blocks, onTry }) {
  return blocks.map((b, i) => {
    if (b.type === 'p') return <p key={i} className={b.cls || undefined} dangerouslySetInnerHTML={{ __html: b.html }} />;
    if (b.type === 'code') return <CodeTabs key={i} tabs={b.tabs} />;
    if (b.type === 'table') return (
      <div key={i} className="table-wrap"><table className={'dtable ' + (b.cls || '')}>
        <thead><tr>{b.head.map((h, k) => <th key={k}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{j === 0 ? <code className="inline-code">{String(c).replace(/<\/?code>/g, '')}</code> : <span dangerouslySetInnerHTML={{ __html: c }} />}</td>)}</tr>)}</tbody>
      </table></div>
    );
    if (b.type === 'try') return <button key={i} type="button" className="btn btn-line btn-sm try-btn" onClick={() => onTry(b.data)}><Icon name="terminal" /><span>{b.label}</span></button>;
    return null;
  });
}

function LinksCard() {
  const L = useLive();
  const toast = useToast();
  const rows = [
    ['panel', 'پنل نگهبان متن', 'panel', ''], ['api', 'فهرست API', 'braces', '/api/v1'], ['swagger', 'Swagger (تعاملی)', 'code', '/docs'],
    ['redoc', 'ReDoc', 'book', '/redoc'], ['openapi', 'OpenAPI JSON', 'braces', '/openapi.json'], ['health', 'سلامت سرویس', 'pulse', '/api/v1/health']
  ];
  const when = L.status === 'online' ? 'آنلاین' + (L.updated ? ' · به‌روزرسانی ' + relTimeIso(L.updated) : '')
    : L.status === 'starting' ? 'در حال راه‌اندازی سرویس…' : L.status === 'unknown' ? 'در حال دریافت وضعیت…' : 'آفلاین' + (L.updated ? ' · آخرین تغییر ' + relTimeIso(L.updated) : '');
  const short = (L.url || PLACEHOLDER).replace(/^https?:\/\//, '');
  return (
    <section aria-labelledby="links-title" className="links-card" id="links">
      <div className="links-top">
        <h2 id="links-title"><span className={'dot ' + L.dot} />لینک‌های زنده</h2>
        <span className="when">{when}</span>
      </div>
      <div className="base-box">
        <code>{L.url || 'سرویس فعلاً آنلاین نیست'}</code>
        <button className="btn btn-line btn-sm" type="button" onClick={() => L.url && copyText(L.url).then(() => toast('کپی شد'))}><Icon name="copy" /><span>کپی</span></button>
        <LiveLink k="panel" className="btn btn-ink btn-sm"><Icon name="external" /><span>باز کردن</span></LiveLink>
      </div>
      <div className="link-grid">
        <a className="link-item" href="../chat/"><span className="li-ico"><Icon name="msg" /></span><span><span className="li-t">چت نگهبان (همین سایت)</span><span className="li-u">chat/</span></span></a>
        {rows.map(([k, t, ic, p]) => (
          <LiveLink key={k} k={k} className="link-item"><span className="li-ico"><Icon name={ic} /></span><span><span className="li-t">{t}</span><span className="li-u">{short + p}</span></span></LiveLink>
        ))}
      </div>
      <p className="links-note">لینک با هر اجرای سرویس عوض می‌شود. برنامه‌ات آن را از <a className="inline-code" href="links.json">api/links.json</a> یا <a className="inline-code" href="links.txt">api/links.txt</a> بخواند.</p>
    </section>
  );
}

function Console({ pick }) {
  const L = useLive();
  const toast = useToast();
  const EPS = DATA.eps_console;
  const [sel, setSel] = useState(0);
  const [body, setBody] = useState(() => JSON.stringify(EPS[0].b || {}, null, 2));
  const [key, setKey] = useState('');
  const [resp, setResp] = useState(null);
  const [busy, setBusy] = useState(false);
  const ep = EPS[sel];
  const choose = i => { setSel(i); setBody(EPS[i].m === 'POST' ? JSON.stringify(EPS[i].b || {}, null, 2) : ''); };
  useEffect(() => { try { setKey(sessionStorage.getItem('guard_key') || ''); } catch (e) {} }, []);
  useEffect(() => {
    if (!pick) return;
    const i = EPS.findIndex(x => x.m === pick.m && x.p.split('?')[0] === pick.p.split('?')[0]);
    if (i >= 0) choose(i);
  }, [pick]);
  const send = async () => {
    if (!L.url) { toast('سرویس فعلاً آنلاین نیست'); return; }
    let payload;
    if (ep.m === 'POST') { try { payload = JSON.stringify(JSON.parse(body || '{}')); } catch (e) { toast('JSON نامعتبر است'); return; } }
    const headers = { 'Content-Type': 'application/json' };
    if (key.trim()) headers['X-API-Key'] = key.trim();
    try { sessionStorage.setItem('guard_key', key.trim()); } catch (e) {}
    setBusy(true); setResp({ status: '…', url: ep.m + ' ' + ep.p, out: '', hdrs: [] });
    const t0 = performance.now();
    try {
      const r = await fetch(L.url + ep.p, { method: ep.m, headers, body: payload });
      const t = await r.text();
      let pretty = t; try { pretty = JSON.stringify(JSON.parse(t), null, 2); } catch (e) {}
      const hs = [['X-Request-ID', 'request id'], ['X-RateLimit-Remaining', 'باقی‌مانده'], ['X-Process-Time', 'سرور'], ['Retry-After', 'صبر']]
        .map(([h, l]) => [l, r.headers.get(h)]).filter(x => x[1]);
      setResp({ status: r.status, ok: r.ok, ms: Math.round(performance.now() - t0), url: ep.m + ' ' + ep.p, out: pretty, hdrs: hs });
    } catch (err) {
      setResp({ status: 'ERR', ok: false, url: ep.m + ' ' + ep.p, out: 'درخواست نرسید: ' + (err && err.message ? err.message : 'network error'), hdrs: [], raw: true });
    } finally { setBusy(false); }
  };
  const curl = () => {
    const q = v => "'" + String(v).replace(/'/g, "'\\''") + "'";
    let cmd = 'curl' + (ep.m === 'POST' ? ' -X POST' : '') + ' ' + q((L.url || PLACEHOLDER) + ep.p);
    if (key.trim()) cmd += ' \\\n  -H ' + q('X-API-Key: ' + key.trim());
    if (ep.m === 'POST') { let b; try { b = JSON.stringify(JSON.parse(body || '{}')); } catch (e) { toast('JSON نامعتبر است'); return; } cmd += " \\\n  -H 'Content-Type: application/json' \\\n  -d " + q(b); }
    copyText(cmd).then(() => toast('curl کپی شد'));
  };
  return (
    <section className="doc-sec" id="console">
      <h2>کنسول</h2>
      <p>مستقیم روی سرویس زنده اجرا می‌شود. <bdi dir="ltr"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></bdi> می‌فرستد؛ دکمه‌ی curl همین درخواست را کپی می‌کند.</p>
      <div className={'console' + (busy ? ' ink-border' : '')}>
        <div className="console-row">
          <select aria-label="مسیر" className="field" value={sel} onChange={e => choose(+e.target.value)}>
            {EPS.map((x, i) => <option key={i} value={i}>{x.m}  {x.p.replace(/=.*/, '=…')}</option>)}
          </select>
          <input aria-label="کلید API" autoComplete="off" className="field key" placeholder="X-API-Key (optional)" spellCheck="false" type="text" value={key} onChange={e => setKey(e.target.value)} />
          <button className="btn btn-line" type="button" onClick={curl} title="کپی همین درخواست به‌صورت curl"><Icon name="terminal" /><span>curl</span></button>
          <button className="btn btn-ink" type="button" onClick={send} aria-disabled={busy ? 'true' : undefined}><Icon name="send" /><span>ارسال</span></button>
        </div>
        <textarea aria-label="بدنه‌ی درخواست" className="field" rows={5} spellCheck="false" dir="ltr" value={body} disabled={ep.m !== 'POST'}
          placeholder={ep.m === 'POST' ? '' : 'GET: بدنه ندارد'} onChange={e => setBody(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send(); }} />
        <AnimatePresence>
          {resp && (
            <motion.div className="resp" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <div className="resp-head">
                <span className={'status-code ' + (resp.status === '…' ? '' : resp.ok ? 'ok' : 'err')}>{resp.status}</span>
                {resp.ms != null && <span>{fa(resp.ms)} میلی‌ثانیه</span>}
                <span className="mono ltr">{resp.url}</span>
              </div>
              {resp.hdrs.length > 0 && <div className="resp-hdrs">{resp.hdrs.map(([l, v]) => <span key={l} className="hdr"><b>{l}</b><span className="mono">{v}</span></span>)}</div>}
              <div className="code" style={{ marginTop: 10 }}>
                <div className="code-bar"><span className="tab" aria-selected="true">response</span>
                  <button className="copy" type="button" onClick={() => copyText(resp.out).then(() => toast('کپی شد'))}><Icon name="copy" /><span>کپی</span></button></div>
                <pre>{resp.raw ? <code>{resp.out}</code> : <code dangerouslySetInnerHTML={{ __html: hlJson(resp.out) }} />}</pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

function Endpoint({ ep, open, flash, onToggle, onTry }) {
  const toast = useToast();
  return (
    <details className={'ep acc' + (open ? ' is-open' : '') + (flash ? ' flash' : '')} id={ep.id} open>
      <summary onClick={e => { e.preventDefault(); onToggle(); }}>
        <span className={'method ' + ep.method.toLowerCase()}>{ep.method}</span>
        <span className="ep-path mono">{ep.path}</span>
        <span className="ep-desc">{ep.desc}</span>
        <button type="button" className="ep-link" aria-label="کپی لینک این مسیر" title="کپی لینک"
          onClick={e => { e.preventDefault(); e.stopPropagation(); copyText(location.href.replace(/#.*$/, '') + '#' + ep.id).then(() => toast('لینک کپی شد')); }}><Icon name="link" /></button>
        <motion.span className="chev" animate={{ rotate: open ? 180 : 0 }}><Icon name="chevron" /></motion.span>
      </summary>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="ep-body" key="b" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: REDUCED ? 0 : .38, ease: [.22, 1, .36, 1] }} style={{ overflow: 'hidden' }}>
            <div className="ep-inner"><Blocks blocks={ep.blocks} onTry={onTry} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </details>
  );
}

function Toc({ active }) {
  const [tocOpen, setTocOpen] = useState(false);
  const [q, setQ] = useState('');
  const input = useRef(null);
  useEffect(() => {
    const on = e => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      if (t === 'input' || t === 'textarea' || t === 'select') return;
      e.preventDefault(); input.current.focus(); input.current.select();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);
  const norm = x => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const nq = norm(q);
  const groups = DATA.toc.map(g => ({ ...g, items: g.items.filter(it => !nq || norm(it.p + ' ' + it.href + ' ' + it.m).includes(nq)) }));
  const any = groups.some(g => g.items.length);
  return (
    <aside className={'toc' + (tocOpen ? ' open' : '')} aria-label="فهرست مستندات">
      <button type="button" className="toc-toggle" aria-expanded={tocOpen} onClick={() => setTocOpen(o => !o)}>
        <Icon name="menu" /><span>فهرست مسیرها</span><span className="toc-cur mono ltr">{active}</span><span className="toc-chev"><Icon name="chevron" /></span>
      </button>
      <label className="toc-search"><Icon name="search" />
        <input ref={input} type="search" placeholder="جستجوی مسیر…" value={q} onChange={e => setQ(e.target.value)} aria-label="جستجوی مسیر"
          onKeyDown={e => {
            if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); }
            if (e.key === 'Enter') { const f = groups.flatMap(g => g.items)[0]; if (f) { location.hash = f.href; e.currentTarget.blur(); } }
          }} />
        <kbd className="kbd">/</kbd></label>
      <nav onClick={e => { if (e.target.closest('a')) setTocOpen(false); }}>
        {groups.map(g => g.items.length ? (
          <Fragment key={g.title}>
            <h4>{g.title}</h4>
            {g.items.map(it => (
              <a key={it.href} href={it.href} className={active === it.href.slice(1) ? 'active' : undefined}>
                {it.m && <span className={'m ' + it.m.toLowerCase()}>{it.m}</span>}<span className={it.m ? 'mono ltr' : undefined}>{it.p}</span>
                {active === it.href.slice(1) && <motion.span layoutId="toc-ink" className="toc-ink" />}
              </a>
            ))}
          </Fragment>
        ) : null)}
        {!any && <p className="toc-empty">مسیری پیدا نشد</p>}
      </nav>
    </aside>
  );
}

export default function Api() {
  const [open, setOpen] = useState(EP_OPEN0);
  const [flash, setFlash] = useState(null);
  const [active, setActive] = useState('links');
  const [pick, setPick] = useState(null);
  const n = Object.values(open).filter(Boolean).length;

  const openEp = (id, scroll) => {
    if (!(id in EP_OPEN0)) return;
    setOpen(o => ({ ...o, [id]: true }));
    setFlash(id); setTimeout(() => setFlash(f => (f === id ? null : f)), 1500);
    if (scroll) setTimeout(() => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); }, 30);
  };
  useEffect(() => {
    const fromHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (id) openEp(id, true); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    const ids = ['links', ...DATA.sections.map(s => s.id), 'console', ...EP_IDS];
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-20% 0px -70% 0px' });
    ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => { window.removeEventListener('hashchange', fromHash); io.disconnect(); };
  }, []);
  const toggle = id => setOpen(o => {
    const v = !o[id];
    if (v) try { history.replaceState(null, '', '#' + id); } catch (e) {}
    return { ...o, [id]: v };
  });
  const all = v => { setOpen(Object.fromEntries(EP_IDS.map(id => [id, v]))); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} };
  const tryIt = d => { setPick({ ...d, t: Date.now() }); document.getElementById('console').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); };

  return (
    <div className="wrap docs">
      <Toc active={active} />
      <div className="docs-main">
        <header className="docs-hero">
          <Reveal as="span" className="eyebrow"><span className="bar" />Unicollect Guard API · v1</Reveal>
          <h1><BlurText trigger="mount" text="مستندات API" /></h1>
          <Reveal as="p" delay={250}>هر پاسخ JSON است. همه‌ی مسیرها از هر دامنه‌ای (CORS) قابل فراخوانی‌اند.</Reveal>
        </header>
        <LinksCard />
        {DATA.sections.map(s => (
          <section key={s.id} className="doc-sec" id={s.id}>
            <h2>{s.title}</h2>
            <Blocks blocks={s.blocks} onTry={tryIt} />
          </section>
        ))}
        <Console pick={pick} />
        <div aria-label="کنترل مسیرها" className="ep-tools" role="toolbar">
          <span className="lbl">همه‌ی مسیرها <span className="mono">{fa(n)} / {fa(EP_IDS.length)} باز</span></span>
          <button className="btn btn-line btn-sm" data-ep-all="open" type="button" onClick={() => all(true)}><Icon name="expand" /><span>باز کردن همه</span></button>
          <button className="btn btn-line btn-sm" data-ep-all="close" type="button" onClick={() => all(false)}><Icon name="collapse" /><span>بستن همه</span></button>
        </div>
        {DATA.groups.map(g => (
          <section key={g.id} className="doc-sec ep-group" id={g.id}>
            <h2>{cleanTitle(g.title)} <span className="count mono">{fa(g.eps.length)}</span></h2>
            {g.eps.map(ep => <Endpoint key={ep.id} ep={ep} open={!!open[ep.id]} flash={flash === ep.id} onToggle={() => toggle(ep.id)} onTry={tryIt} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
