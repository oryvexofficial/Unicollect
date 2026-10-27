// <InkCursor/>: a stamp-pad cursor for mouse users. A sharp ink dot tracks the
// pointer 1:1; a soft ring follows on a spring and morphs with what's under it:
//   links / buttons  -> ring swells and tints with the accent
//   text fields      -> ring collapses into a caret
//   [data-cursor]    -> ring becomes a pill carrying that label (e.g. "مُهر")
//   pressed          -> the ring "stamps" (squash + ink ring)
// Hidden on touch, reduced motion, and when the pointer leaves the window.
import { useEffect, useRef } from 'react';
import { REDUCED } from '../util.js';

const HOVER = 'a, button, [role="button"], [role="tab"], summary, label[for], select, .chip, [data-cursor]';
const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]';

export default function InkCursor() {
  const dot = useRef(null), ring = useRef(null), tag = useRef(null);
  useEffect(() => {
    const mq = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)');
    if (REDUCED || !mq || !mq.matches) return;
    const root = document.documentElement;
    root.classList.add('cursor-on');
    const D = dot.current, Rg = ring.current, T = tag.current;
    const p = { x: innerWidth / 2, y: innerHeight / 2 }, r = { x: p.x, y: p.y, w: 36, h: 36 };
    let goal = { w: 36, h: 36 }, raf = 0, seen = false, mode = '';
    const setMode = (m, label = '') => {
      if (m === mode && T.textContent === label) return;
      mode = m; Rg.dataset.mode = m; T.textContent = label;
      goal = m === 'hover' ? { w: 58, h: 58 } : m === 'text' ? { w: 3, h: 28 } : m === 'label' ? { w: Math.max(74, T.scrollWidth + 30), h: 38 } : { w: 36, h: 36 };
    };
    const loop = () => {
      r.x += (p.x - r.x) * .2; r.y += (p.y - r.y) * .2;
      r.w += (goal.w - r.w) * .22; r.h += (goal.h - r.h) * .22;
      D.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`;
      Rg.style.transform = `translate3d(${r.x}px, ${r.y}px, 0) translate(-50%, -50%)`;
      Rg.style.width = r.w + 'px'; Rg.style.height = r.h + 'px';
      raf = requestAnimationFrame(loop);
    };
    const onMove = e => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      p.x = e.clientX; p.y = e.clientY;
      if (!seen) { seen = true; r.x = p.x; r.y = p.y; root.classList.add('cursor-seen'); }
      const el = e.target instanceof Element ? e.target : null;
      const lab = el && el.closest('[data-cursor]');
      if (lab) setMode('label', lab.getAttribute('data-cursor'));
      else if (el && el.closest(TEXT)) setMode('text');
      else if (el && el.closest(HOVER)) setMode('hover');
      else setMode('');
    };
    const down = () => Rg.classList.add('down');
    const up = () => Rg.classList.remove('down');
    const out = e => { if (!e.relatedTarget) root.classList.remove('cursor-seen'), seen = false; };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    document.addEventListener('mouseout', out);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); root.classList.remove('cursor-on', 'cursor-seen');
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up); document.removeEventListener('mouseout', out);
    };
  }, []);
  return (
    <div className="ink-cursor" aria-hidden="true">
      <div ref={ring} className="ic-ring"><span ref={tag} className="ic-tag" /></div>
      <div ref={dot} className="ic-dot" />
    </div>
  );
}
