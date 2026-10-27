// <DotGrid/>: a field of dots that swell and drift away from the cursor, with
// a slow idle ripple. Canvas 2D, pauses off-screen.
import { useEffect, useRef } from 'react';
import { REDUCED } from '../util.js';

export default function DotGrid({ gap = 26, radius = 1.4, reach = 140, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true;
    const m = { x: -9999, y: -9999 };
    let color = '#888', accent = '#8b5cf6';
    const readColors = () => {
      const cs = getComputedStyle(cv);
      color = cs.getPropertyValue('--ink-3').trim() || color;
      accent = cs.getPropertyValue('--accent').trim() || accent;
    };
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const frame = now => {
      ctx.clearRect(0, 0, w, h);
      const t = now / 1000;
      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) {
          const dx = x - m.x, dy = y - m.y, d = Math.sqrt(dx * dx + dy * dy);
          const k = Math.max(0, 1 - d / reach);
          const wave = REDUCED ? 0 : (Math.sin(x * .018 + y * .012 - t * 1.4) + 1) / 2;
          const push = k * k * 10;
          const px = x + (d ? dx / d : 0) * push, py = y + (d ? dy / d : 0) * push;
          ctx.globalAlpha = .18 + wave * .14 + k * .7;
          ctx.fillStyle = k > .05 ? accent : color;
          ctx.beginPath(); ctx.arc(px, py, radius + k * 2.6 + wave * .4, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    const loop = now => { raf = requestAnimationFrame(loop); frame(now); };
    const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    readColors(); size(); frame(performance.now()); start();
    const onMove = e => { const r = cv.getBoundingClientRect(); m.x = e.clientX - r.left; m.y = e.clientY - r.top; };
    const onLeave = () => { m.x = m.y = -9999; };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    const ro = new ResizeObserver(() => { size(); frame(performance.now()); }); ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }); io.observe(cv);
    const onTheme = () => setTimeout(readColors, 20);
    window.addEventListener('themechange', onTheme);
    return () => { stop(); ro.disconnect(); io.disconnect(); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerleave', onLeave); window.removeEventListener('themechange', onTheme); };
  }, [gap, radius, reach]);
  return <canvas ref={ref} className={'fx-canvas dot-grid ' + className} aria-hidden="true" />;
}
