// ClickSpark (ink flecks on every click) and InkBurst (the stamp's splash).
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { REDUCED } from '../util.js';

function useOverlay(fixed) {
  const ref = useRef(null);
  const parts = useRef([]);
  const raf = useRef(0);
  const run = () => {
    if (raf.current) return;
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const loop = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = fixed ? innerWidth : cv.clientWidth, h = fixed ? innerHeight : cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const now = performance.now();
      parts.current = parts.current.filter(p => now - p.t0 < p.life);
      for (const p of parts.current) p.draw(ctx, (now - p.t0) / p.life);
      if (parts.current.length) raf.current = requestAnimationFrame(loop);
      else { raf.current = 0; ctx.clearRect(0, 0, w, h); }
    };
    raf.current = requestAnimationFrame(loop);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { ref, parts, run };
}

const ease = k => 1 - Math.pow(1 - k, 3);

export function ClickSpark({ count = 9, size = 14, radius = 22 }) {
  const { ref, parts, run } = useOverlay(true);
  useEffect(() => {
    if (REDUCED) return;
    const on = e => {
      if (e.button !== 0) return;
      const col = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8b5cf6';
      const x = e.clientX, y = e.clientY, t0 = performance.now();
      const off = Math.random() * Math.PI;
      for (let i = 0; i < count; i++) {
        const a = off + (Math.PI * 2 * i) / count;
        parts.current.push({ t0, life: 520, draw(ctx, k) {
          const e = ease(k), d = e * radius, len = size * (1 - e);
          ctx.strokeStyle = col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
          ctx.lineTo(x + Math.cos(a) * (d + len), y + Math.sin(a) * (d + len)); ctx.stroke(); ctx.globalAlpha = 1;
        } });
      }
      run();
    };
    window.addEventListener('pointerdown', on, { passive: true });
    return () => window.removeEventListener('pointerdown', on);
  }, []);
  return <canvas ref={ref} className="spark-layer" aria-hidden="true" />;
}

/** ink droplets fly out from (x,y) and land as blots: call ref.fire(x, y, color) */
export const InkBurst = forwardRef(function InkBurst({ className = '', fixed = false }, api) {
  const { ref, parts, run } = useOverlay(fixed);
  useImperativeHandle(api, () => ({
    fire(x, y, color, n = 26, power = 1) {
      if (REDUCED) return;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = (40 + Math.random() * 120) * power, r = 1 + Math.random() * 3.6;
        const life = 700 + Math.random() * 600;
        parts.current.push({ t0, life, draw(ctx, k) {
          const e = ease(Math.min(1, k * 1.6));
          const px = x + Math.cos(a) * sp * e, py = y + Math.sin(a) * sp * e;
          ctx.fillStyle = color; ctx.globalAlpha = k < .7 ? .85 : .85 * (1 - (k - .7) / .3);
          ctx.beginPath(); ctx.ellipse(px, py, r * (1 + e * .6), r, a, 0, 6.283); ctx.fill(); ctx.globalAlpha = 1;
        } });
      }
      // a soft ring of ink soaking into the paper
      parts.current.push({ t0, life: 900, draw(ctx, k) {
        ctx.strokeStyle = color; ctx.globalAlpha = .35 * (1 - k); ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(x, y, 30 + ease(k) * 90 * power, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
      } });
      run();
    }
  }), []);
  return <canvas ref={ref} className={(fixed ? 'spark-layer ' : 'fx-canvas ') + 'ink-burst ' + className} aria-hidden="true" />;
});
