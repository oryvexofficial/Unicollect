import { useEffect, useRef, useState, useCallback } from 'react';
import { isDark } from './theme.js';

export function useInView(opts = {}) {
  const ref = useRef(null);
  const [inView, setIn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { setIn(true); return; }
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting || e.boundingClientRect.top < 0) { setIn(true); if (opts.once !== false) io.disconnect(); }
        else if (opts.once === false) setIn(false);
      });
    }, { rootMargin: opts.margin || '0px 0px -8% 0px', threshold: opts.threshold || 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

export function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(isDark());
    const on = () => setDark(isDark());
    window.addEventListener('themechange', on);
    return () => window.removeEventListener('themechange', on);
  }, []);
  return dark;
}

export function useInterval(fn, ms) {
  const f = useRef(fn); f.current = fn;
  useEffect(() => { if (ms == null) return; const t = setInterval(() => f.current(), ms); return () => clearInterval(t); }, [ms]);
}

export function useLatest(v) { const r = useRef(v); r.current = v; return r; }

export function useEvent(fn) {
  const r = useRef(fn); r.current = fn;
  return useCallback((...a) => r.current(...a), []);
}
