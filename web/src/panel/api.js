/* Where is the Guard service?
   The same bundle runs in two places:
   - "local": served by the service itself (/). Same origin; legacy
     /api/check + /health, exactly like before.
   - "pages": the chat page of the public site (GitHub Pages /chat/ or the
     service's /site/chat/). The tunnel link changes every run, so it is read
     from api/links.json (fallback assets/status.json) and re-read whenever
     the service stops answering. ?api=<url> or the settings field pins a
     custom server. */
const API_BASE_KEY = 'guard_api_base';
const API_KEY_KEY = 'guard_key';
export const MAX_TEXT = 20000;

function decodePayload(v) {
  if (!v) return '';
  try { return decodeURIComponent(escape(atob(v))); } catch (e) { try { return atob(v); } catch (e2) { return ''; } }
}
async function fetchJSON(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 8000);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const html = typeof document !== 'undefined' ? document.documentElement : { dataset: {} };
export const API = {
  mode: html.dataset.api === 'pages' ? 'pages' : 'local',
  root: html.dataset.root || './',
  base: null,
  status: 'unknown',
  updated: null,
  resolving: null,
  listeners: new Set(),
  get checkPath() { return this.mode === 'local' ? '/api/check' : '/api/v1/check'; },
  url(p) { return (this.base || '') + p; },
  override() { try { return (localStorage.getItem(API_BASE_KEY) || '').trim().replace(/\/+$/, ''); } catch (e) { return ''; } },
  setOverride(v) { try { v ? localStorage.setItem(API_BASE_KEY, v) : localStorage.removeItem(API_BASE_KEY); } catch (e) {} this.base = this.mode === 'local' && !v ? '' : null; },
  key() { try { return (sessionStorage.getItem(API_KEY_KEY) || localStorage.getItem(API_KEY_KEY) || '').trim(); } catch (e) { return ''; } },
  setKey(v) {
    try {
      if (v) { sessionStorage.setItem(API_KEY_KEY, v); localStorage.setItem(API_KEY_KEY, v); }
      else { sessionStorage.removeItem(API_KEY_KEY); localStorage.removeItem(API_KEY_KEY); }
    } catch (e) {}
  },
  headers(json) {
    const h = json ? { 'Content-Type': 'application/json' } : {};
    const k = this.key();
    if (k) h['X-API-Key'] = k;
    return h;
  },
  /** links that only make sense against the live service (Swagger, raw panel) */
  live(p) { return this.base !== null && (this.base || this.mode === 'local') ? this.url(p) : null; },
  docsHref() { return this.mode === 'local' ? '/api-docs' : this.root + 'api/'; },
  siteHref() { return this.mode === 'local' ? '/site/' : this.root; },
  emit() { this.listeners.forEach(f => f()); }
};
if (API.mode === 'local') API.base = '';
try {
  const q = new URLSearchParams(location.search).get('api');
  if (q && /^https?:\/\//i.test(q)) localStorage.setItem(API_BASE_KEY, q.replace(/\/+$/, ''));
} catch (e) {}

export async function resolveApi(force) {
  if (API.mode === 'local') { API.base = ''; return ''; }
  const pinned = API.override();
  if (pinned) { API.base = pinned; API.status = 'custom'; return pinned; }
  if (API.base && !force) return API.base;
  if (API.resolving) return API.resolving;
  API.resolving = (async () => {
    if (location.pathname === '/site' || location.pathname.indexOf('/site/') === 0) {
      API.base = location.origin; API.status = 'online'; return API.base;
    }
    const root = new URL(API.root, location.href).href;
    const bust = '?t=' + Date.now();
    try {
      const d = await fetchJSON(root + 'api/links.json' + bust);
      API.base = (d.base_url || '').replace(/\/+$/, '') || null;
      API.status = d.status || (API.base ? 'online' : 'offline');
      API.updated = d.updated_at || null;
    } catch (e) {
      try {
        const d = await fetchJSON(root + 'assets/status.json' + bust);
        API.base = decodePayload(d.url_payload).replace(/\/+$/, '') || null;
        API.status = d.status || 'offline';
        API.updated = d.updated_at || null;
      } catch (e2) { API.base = null; API.status = 'offline'; }
    }
    if (API.status === 'offline') API.base = null;
    API.emit();
    return API.base;
  })();
  try { return await API.resolving; } finally { API.resolving = null; }
}

const ERROR_TEXT = {
  rate_limited: 'درخواست‌ها زیاد شد؛ یک دقیقه صبر کن و دوباره بفرست.',
  unauthorized: 'این سرویس کلید API می‌خواهد؛ از «مدل‌ها و وضعیت» واردش کن.',
  not_ready: 'مدل‌ها هنوز در حال بارگذاری‌اند؛ چند ثانیه دیگر دوباره امتحان کن.',
  no_models: 'مدلی آماده نیست؛ کمی بعد دوباره امتحان کن.',
  text_too_long: `متن طولانی است (حداکثر ${MAX_TEXT.toLocaleString('fa-IR')} نویسه).`,
  empty_text: 'متن خالی است.'
};
export function normalizeResult(r, status) {
  if (!r || typeof r !== 'object') return { error: `پاسخ نامعتبر از سرور (HTTP ${status})` };
  if (r.error && typeof r.error === 'object' && !Array.isArray(r.error)) {
    return { error: ERROR_TEXT[r.error.code] || r.error.message || `HTTP ${status}`, code: r.error.code };
  }
  if (r.error) return r;
  if (!r.decision) {
    const d = r.detail ? (typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)) : `HTTP ${status}`;
    return { error: `پاسخ نامعتبر از سرور: ${d}` };
  }
  return r;
}

export async function censorText(text) {
  const base = await resolveApi();
  if (base === null) throw new Error('سرویس فعلاً آفلاین است');
  const call = async body => {
    const r = await fetch(API.url('/api/v1/censor'), { method: 'POST', headers: API.headers(true), body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.error) throw new Error(normalizeResult(j || {}, r.status).error || `HTTP ${r.status}`);
    return j;
  };
  // known insults first (instant); if none, mask whole toxic sentences
  let j = await call({ text, mode: 'words', include_contextual: true });
  if (!j.masked_count) {
    try { const k = await call({ text, mode: 'sentences', min_decision: 'SUSPECT' }); if (k.masked_count) j = k; } catch (e) {}
  }
  return { text: j.text, count: j.masked_count || 0, mode: j.mode };
}
