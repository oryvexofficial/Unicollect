// Small, dependency-free helpers shared by the site, the Guard panel and the chat.
export const isBrowser = typeof window !== 'undefined';
export const REDUCED = isBrowser && !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
export const CAN_HOVER = isBrowser && !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);

const FA = '۰۱۲۳۴۵۶۷۸۹';
export const faDigits = v => String(v).replace(/[0-9]/g, d => FA[+d]);
export const fa = n => Number(n).toLocaleString('fa-IR');
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const RTL_CH = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const LTR_CH = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;
/** first strong character decides (like dir=auto); empty -> rtl */
export function textDir(v) {
  v = v || '';
  for (let i = 0; i < v.length && i < 400; i++) {
    const c = v[i];
    if (RTL_CH.test(c)) return 'rtl';
    if (LTR_CH.test(c)) return 'ltr';
  }
  return 'rtl';
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function relTime(ts) {
  if (!ts) return '';
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const diff = Date.now() - t, m = 60000, h = 60 * m, d = 24 * h;
  if (!(diff >= 0)) return '';
  if (diff < m) return 'همین الان';
  if (diff < h) return `${fa(Math.floor(diff / m))} دقیقه پیش`;
  if (diff < d) return `${fa(Math.floor(diff / h))} ساعت پیش`;
  if (diff < 7 * d) return `${fa(Math.floor(diff / d))} روز پیش`;
  try { return new Date(t).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
}

export function copyText(s) {
  const legacy = () => {
    const ta = document.createElement('textarea');
    ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(s).catch(legacy);
  }
  legacy();
  return Promise.resolve();
}

export function download(name, data) {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500); // revoking at once breaks Firefox
}

let seq = 0;
export const newId = prefix => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export const store = {
  get(k, fb = null) { try { const v = localStorage.getItem(k); return v == null ? fb : v; } catch (e) { return fb; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  json(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
};

/** word segments that keep trailing spaces/punctuation, so Persian shaping is never broken */
const SEG = isBrowser && window.Intl && Intl.Segmenter ? new Intl.Segmenter('fa', { granularity: 'word' }) : null;
export function splitWords(text) {
  if (!text) return [];
  if (SEG) {
    const out = [];
    for (const { segment, isWordLike } of SEG.segment(text)) {
      if (isWordLike || !out.length) out.push(segment);
      else out[out.length - 1] += segment;
    }
    return out;
  }
  return text.match(/\S+\s*|\s+/g) || [text];
}
