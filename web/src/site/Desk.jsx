// The home page's review desk: a letter types itself, five voter meters
// fill, then the verdict stamp slams down (with an ink splash). Cycles through
// samples; the form sends your own text to the live service.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../shared/icons.jsx';
import { useInView } from '../shared/hooks.js';
import { REDUCED, fa, sleep } from '../shared/util.js';
import { useLive } from './live.jsx';

const MODELS = ['فارسی', 'پرو', 'سریع', 'گسترده', 'انگلیسی'];
const MODEL_KEYS = ['persian', 'textdetox_lg', 'textdetox_sm', 'multilingual', 'twitter_off'];
const WORD = { safe: 'ایمن', suspect: 'مشکوک', toxic: 'سمی' };
export const EX = [
  { t: 'میشه لطفاً فردا ساعت ۵ وقت بذاریم صحبت کنیم؟', lang: ['فارسی'], v: 'safe', s: 4, m: [3, 6, 4, 7, null], chip: 'دوستانه' },
  { t: 'اصلاً حواست به کارت هست یا نه؟ این دومین باره.', lang: ['فارسی'], v: 'suspect', s: 61, m: [61, 48, 35, 22, null], chip: 'لحن تند' },
  { t: 'خیلی احمقی، دیگه هیچ‌وقت بهم پیام نده.', lang: ['فارسی'], v: 'toxic', s: 96, m: [97, 93, 95, 88, null], chip: 'توهین' },
  { t: 'salam, mamnoon az komaket, kheili lotf kardi', lang: ['فینگیلیش', 'سلام، ممنون از کمکت…'], v: 'safe', s: 3, m: [2, 4, 3, 5, 6], chip: 'فینگیلیش' },
  { t: 'khafe sho ahmagh', lang: ['فینگیلیش', 'خفه شو احمق'], v: 'toxic', s: 91, m: [94, 89, 77, 41, 70], chip: 'فینگیلیش تند' }
];
const colorOf = v => (v == null ? 'var(--ink-3)' : v >= 50 ? 'var(--toxic)' : v >= 30 ? 'var(--suspect)' : 'var(--safe)');
const ltr = t => /[a-z]/i.test(t) && !/[\u0600-\u06FF]/.test(t);

function fromApi(text, d) {
  const raw = d.raw_scores || {}, fing = d.fingilish_detected && d.fingilish_text;
  return {
    t: text, lang: fing ? ['فینگیلیش', d.fingilish_text] : [{ fa: 'فارسی', en: 'انگلیسی', mixed: 'ترکیبی' }[d.script] || 'خودکار'],
    v: String(d.decision || 'SAFE').toLowerCase(), s: Math.round((d.max_raw != null ? d.max_raw : 0) * 100),
    m: MODEL_KEYS.map(k => (raw[k] == null ? null : Math.round(raw[k] * 100)))
  };
}

export default function Desk({ root }) {
  const L = useLive();
  const [ref, inView] = useInView();
  const [typed, setTyped] = useState('');
  const [caret, setCaret] = useState(false);
  const [ex, setEx] = useState(null);           // shown verdict data (voters filled)
  const [stamp, setStamp] = useState({ v: '', state: '' });  // '', 'on', 'out'
  const [pressed, setPressed] = useState(-1);
  const [lang, setLang] = useState(null);
  const [note, setNote] = useState(null);
  const [sending, setSending] = useState(false);
  const run = useRef(0), auto = useRef(true), stampEl = useRef(null), burst = useRef(null), input = useRef(null);

  const reset = i => {
    setPressed(i); setEx(null); setLang(null);
    setStamp(s => (s.state === 'on' ? { ...s, state: 'out' } : { v: '', state: '' }));
  };
  const typeText = async (me, t, fast) => {
    setCaret(true); setTyped('');
    const chars = Array.from(t), step = fast ? Math.max(1, Math.ceil(chars.length / 60)) : 1;
    for (let c = 0; c < chars.length; c += step) {
      if (me !== run.current) return false;
      setTyped(chars.slice(0, c + step).join(''));
      await sleep(REDUCED ? 0 : fast ? 12 : chars[c] === ' ' ? 38 : 26);
    }
    return me === run.current;
  };
  const showVerdict = async (me, e) => {
    setCaret(false); setLang(e.lang); setEx(e);
    await sleep(REDUCED ? 0 : 900); if (me !== run.current) return false;
    setStamp({ v: e.v, s: e.s, state: 'on', k: Date.now() });
    setTimeout(() => {
      const el = stampEl.current; if (!el || !burst.current || REDUCED) return;
      const b = el.getBoundingClientRect(), host = el.closest('.desk').getBoundingClientRect();
      const col = getComputedStyle(document.documentElement).getPropertyValue('--' + e.v).trim();
      burst.current.fire(b.left - host.left + b.width / 2, b.top - host.top + b.height / 2, col, e.v === 'toxic' ? 30 : 18, .8);
    }, 300);
    return true;
  };
  const play = async i => {
    const me = ++run.current, e = EX[i];
    reset(i);
    if (!(await typeText(me, e.t))) return;
    await sleep(250); if (me !== run.current) return;
    if (!(await showVerdict(me, e))) return;
    if (auto.current) { await sleep(3400); if (me === run.current && auto.current) play((i + 1) % EX.length); }
  };
  useEffect(() => { if (inView) play(0); }, [inView]);
  useEffect(() => {
    const v = () => { if (document.hidden) auto.current = false; };
    document.addEventListener('visibilitychange', v);
    return () => { document.removeEventListener('visibilitychange', v); run.current++; };
  }, []);

  const tryLive = async e => {
    e.preventDefault();
    const text = (input.current.value || '').trim();
    if (!text) { input.current.focus(); return; }
    if (!L.url) { setNote({ t: 'سرویس فعلاً آنلاین نیست؛ نمونه‌ها را ببین.' }); return; }
    auto.current = false;
    const me = ++run.current; reset(-1); setSending(true);
    setNote({ t: 'در حال بررسی با پنج مدل…' });
    const req = fetch(L.url + '/api/v1/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, detailed: true }) })
      .then(r => r.json().then(j => ({ ok: r.ok, j })));
    await typeText(me, text, true);
    try {
      const x = await req;
      if (me !== run.current) return;
      if (!x.ok || x.j.error) {
        setCaret(false); setLang(['خطا', String((x.j.error && (x.j.error.message || x.j.error)) || 'خطای ناشناخته')]);
        setNote({ t: 'پاسخ نداد؛ دوباره امتحان کن.' }); return;
      }
      await showVerdict(me, fromApi(text, x.j));
      setNote({ reason: x.j.reason, ms: x.j.latency_ms, text });
    } catch (err) {
      setCaret(false); setLang(['خطا', 'درخواست به سرویس نرسید']); setNote({ t: 'سرویس در دسترس نیست.' });
    } finally { setSending(false); }
  };

  const noteView = note
    ? (note.t || <>{note.reason && <bdi dir="ltr">{note.reason}</bdi>}{note.ms != null && <span className="mono"> {fa(note.ms)}ms</span>} · <a href={(root || './') + 'chat/?text=' + encodeURIComponent(note.text)}>ادامه در چت</a></>)
    : (L.health === 'checking' ? 'در حال بررسی وضعیت سرویس…' : L.url ? 'متن خودت را روی سرویس زنده امتحان کن.' : 'سرویس فعلاً آفلاین است؛ نمونه‌ها را ببین.');

  return (
    <div ref={ref} className={'desk' + (stamp.state === 'on' ? ' stamped' : '')} aria-label="نمونه‌ی زنده‌ی حکم Unicollect">
      <div className="desk-head"><span>میز بررسی</span><span className="mono ltr">POST /api/v1/check</span></div>
      <div className="letter">
        <div className="letter-to">
          {lang ? <>{lang[0] === 'خطا' ? '' : 'زبان: '}{lang[0]}{lang[1] && <><Icon name="arrowL" /><span dir="rtl">{lang[1]}</span></>}</> : 'متن'}
        </div>
        <div className="letter-text" dir={ltr(typed) ? 'ltr' : 'rtl'} aria-live="polite">
          <span className="typed">{typed}</span>{caret && <span className="caret" />}
        </div>
        <div className="voters">
          {MODELS.map((n, i) => {
            const val = ex ? ex.m[i] : null;
            return (
              <div key={i} className="voter" style={{ opacity: ex && val == null ? .45 : 1 }}>
                <div className="meter"><i style={{ '--n': i, '--s': val == null ? 0 : (Math.max(4, val) / 100).toFixed(3), '--c': colorOf(val) }} />
                  <span style={{ color: val != null && val >= 40 ? '#fff' : undefined }}>{!ex ? '' : val == null ? '-' : fa(val)}</span></div>
                {n}
              </div>
            );
          })}
        </div>
        <div ref={stampEl} key={stamp.k || 0} className={`stamp ${stamp.v} ${stamp.state}`} aria-hidden="true">
          <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="46" className="thin" /></svg>
          <b>{stamp.v ? WORD[stamp.v] : ''}</b><small>{stamp.v ? fa(stamp.s) + '٪' : ''}</small>
        </div>
      </div>
      <div className="desk-chips" role="group" aria-label="نمونه‌ها">
        {EX.map((e, i) => (
          <button key={i} className="chip" type="button" aria-pressed={pressed === i} onClick={() => { auto.current = false; play(i); }}>
            <span className={'cd ' + e.v} />{e.chip}
          </button>
        ))}
      </div>
      <form className={'try' + (L.url ? '' : ' is-offline')} onSubmit={tryLive} autoComplete="off">
        <label className="sr-only" htmlFor="try-text">متن خودت را بنویس</label>
        <input id="try-text" ref={input} className="try-in" type="text" maxLength={2000} placeholder="متن خودت را بنویس…" spellCheck="false" />
        <button className="btn btn-ink btn-sm" type="submit" aria-disabled={sending ? 'true' : undefined}><Icon name="send" /><span>بررسی واقعی</span></button>
      </form>
      <p className="try-note" aria-live="polite">{noteView}</p>
    </div>
  );
}
