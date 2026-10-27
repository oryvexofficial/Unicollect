// Live service status for the public site. The tunnel link changes every run,
// so it is read from api/links.json (fallback assets/status.json), then the
// service itself is pinged. Served by the service (/site/*) = same origin.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fa } from '../shared/util.js';

export const PLACEHOLDER = 'https://YOUR-LINK.trycloudflare.com';
export const LINK_PATHS = { panel: '', api: '/api/v1', swagger: '/docs', redoc: '/redoc', openapi: '/openapi.json', health: '/api/v1/health', guide: '/api-docs' };

const Ctx = createContext(null);
export const useLive = () => useContext(Ctx);

const decode = v => { if (!v) return ''; try { return decodeURIComponent(escape(atob(v))); } catch (e) { try { return atob(v); } catch (e2) { return ''; } } };

export function relTimeIso(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!(d >= 0)) return '';
  if (d < 60) return 'همین الان';
  if (d < 3600) return fa(Math.round(d / 60)) + ' دقیقه پیش';
  if (d < 86400) return fa(Math.round(d / 3600)) + ' ساعت پیش';
  return fa(Math.round(d / 86400)) + ' روز پیش';
}

export function LiveProvider({ root, children }) {
  // SSR + first client render: "checking" (identical markup, no hydration mismatch)
  const [live, setLive] = useState({ url: '', status: 'unknown', updated: null, ms: null, health: 'checking', pagesUrl: 'https://USER.github.io/REPO/' });
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return; busy.current = true;
    try {
      const rootAbs = new URL(root || './', location.href).href;
      const served = location.pathname === '/site' || location.pathname.indexOf('/site/') === 0;
      const pagesUrl = served || !/^https?:/i.test(rootAbs) ? 'https://USER.github.io/REPO/' : rootAbs;
      let url = '', status = 'offline', updated = null;
      if (served) { url = location.origin; status = 'online'; }
      else {
        const bust = '?t=' + Date.now();
        try {
          const r = await fetch(rootAbs + 'api/links.json' + bust, { cache: 'no-store' });
          if (!r.ok) throw 0;
          const d = await r.json();
          url = (d.base_url || '').replace(/\/+$/, ''); status = d.status || 'offline'; updated = d.updated_at;
        } catch (e) {
          try {
            const r = await fetch(rootAbs + 'assets/status.json' + bust, { cache: 'no-store' });
            const d = await r.json();
            url = decode(d.url_payload).replace(/\/+$/, ''); status = d.status || 'offline'; updated = d.updated_at;
          } catch (e2) { url = ''; status = 'offline'; }
        }
      }
      if (status === 'offline') url = '';
      setLive(l => ({ ...l, url, status, updated, pagesUrl, health: url ? 'checking' : (status === 'starting' ? 'starting' : 'offline') }));
      if (!url) return;
      const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 8000), t0 = performance.now();
      let health = 'down', ms = null;
      try {
        const r = await fetch(url + '/health', { cache: 'no-store', signal: ctrl.signal });
        ms = Math.round(performance.now() - t0);
        const h = r.ok ? await r.json() : null;
        health = h && h.status === 'ok' ? 'ok' : h ? 'loading' : 'down';
      } catch (e) { health = 'down'; }
      finally { clearTimeout(to); }
      setLive(l => ({ ...l, health, ms }));
    } finally { busy.current = false; }
  }, [root]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const view = statusView(live);
  return <Ctx.Provider value={{ ...live, ...view, reload: load, link: k => (live.url ? live.url + (LINK_PATHS[k] || '') : null) }}>{children}</Ctx.Provider>;
}

export function statusView(l) {
  if (l.health === 'checking') return { dot: 'warn', label: 'در حال بررسی…' };
  if (l.health === 'ok') return { dot: 'ok', label: 'آنلاین' };
  if (l.health === 'loading') return { dot: 'warn', label: 'در حال بارگذاری مدل‌ها' };
  if (l.health === 'starting') return { dot: 'warn', label: 'در حال راه‌اندازی' };
  if (l.health === 'down' && l.url) return { dot: 'warn', label: 'آنلاین (پاسخ نداد)' };
  return { dot: 'bad', label: 'آفلاین' };
}

/** <a> that only gets an href once the live link is known */
export function LiveLink({ k, className = '', children, ...rest }) {
  const L = useLive();
  const href = L.link(k);
  return href
    ? <a className={className} href={href} target="_blank" rel="noopener" {...rest}>{children}</a>
    : <a className={className} aria-disabled="true" {...rest}>{children}</a>;
}
