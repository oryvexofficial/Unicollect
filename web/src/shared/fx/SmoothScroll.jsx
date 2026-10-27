// <SmoothScroll/>: Lenis-style inertial wheel scrolling for the public site,
// dependency-free. The page still scrolls the real window (so sticky, motion's
// useScroll and IntersectionObserver keep working); we only ease the wheel.
// Off on touch / pen, under reduced motion, inside scrollable children, while
// a modal or drawer locks the body, and for ctrl/pinch-zoom wheels.
import { useEffect } from 'react';
import { REDUCED } from '../util.js';

const scrollableParent = (el, dy) => {
  for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el.hasAttribute && el.hasAttribute('data-native-scroll')) return true;
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if ((dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) || (dy < 0 && el.scrollTop > 0)) return true;
    }
  }
  return false;
};

export function scrollToY(y, opts = {}) {
  const api = window.__smooth;
  if (api) api.to(y, opts); else window.scrollTo({ top: y, behavior: REDUCED ? 'auto' : 'smooth' });
}

export default function SmoothScroll({ ease = 0.1, multiplier = 1 }) {
  useEffect(() => {
    const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (REDUCED || !fine) return;
    const root = document.documentElement;
    root.classList.add('smooth-on');
    let target = window.scrollY, current = window.scrollY, raf = 0, ownScroll = false, lerp = ease, done = null;
    const max = () => root.scrollHeight - window.innerHeight;
    const tick = () => {
      current += (target - current) * lerp;
      if (Math.abs(target - current) < 0.4) current = target;
      ownScroll = true; window.scrollTo(0, current);
      if (current !== target) raf = requestAnimationFrame(tick);
      else { raf = 0; lerp = ease; if (done) { const d = done; done = null; d(); } }
    };
    const go = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const locked = () => document.body.style.overflow === 'hidden';
    const onWheel = e => {
      if (e.ctrlKey || e.defaultPrevented || locked()) return;
      let dy = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (Math.abs(e.deltaX) > Math.abs(dy)) return;               // horizontal trackpad swipes stay native
      if (scrollableParent(e.target, dy)) return;
      e.preventDefault();
      if (!raf) { current = window.scrollY; target = current; }
      target = Math.max(0, Math.min(max(), target + dy * multiplier));
      lerp = ease; go();
    };
    // keyboard, scrollbar drags, find-in-page: resync instead of fighting them
    const onScroll = () => {
      if (ownScroll) { ownScroll = false; return; }
      if (!raf) { current = target = window.scrollY; }
    };
    const onKey = () => { cancelAnimationFrame(raf); raf = 0; current = target = window.scrollY; };
    // in-page anchors get the same glide
    const onClick = e => {
      const a = e.target.closest && e.target.closest('a[href*="#"]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const url = new URL(a.href, location.href);
      if (url.pathname !== location.pathname || !url.hash || url.hash === '#') return;
      const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (!el) return;
      e.preventDefault();
      const pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
      api.to(el.getBoundingClientRect().top + window.scrollY - pad, { done: () => { if (location.hash !== url.hash) { history.pushState(null, '', url.hash); window.dispatchEvent(new HashChangeEvent('hashchange')); } } });
    };
    const api = {
      to(y, { done: d } = {}) { current = window.scrollY; target = Math.max(0, Math.min(max(), y)); lerp = 0.085; done = d || null; go(); }
    };
    window.__smooth = api;
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      cancelAnimationFrame(raf); delete window.__smooth; root.classList.remove('smooth-on');
      window.removeEventListener('wheel', onWheel); window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick);
    };
  }, [ease, multiplier]);
  return null;
}
