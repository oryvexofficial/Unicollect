// <Backdrop/>: the page's paper. A fixed layer behind everything: two slow
// drifting ink clouds (violet stamp-pad + airmail red), a faint postal grid
// that fades out toward the edges, and a cursor-following glow. CSS-only
// motion (transform/opacity), one rAF for the glow, paused in hidden tabs.
import { useEffect, useRef } from 'react';
import { REDUCED, CAN_HOVER } from '../util.js';

export default function Backdrop() {
  const glow = useRef(null);
  useEffect(() => {
    if (REDUCED || !CAN_HOVER) return;
    const g = glow.current; let x = innerWidth * .6, y = innerHeight * .3, tx = x, ty = y, raf = 0;
    const loop = () => {
      x += (tx - x) * .06; y += (ty - y) * .06;
      g.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .5 ? requestAnimationFrame(loop) : 0;
    };
    const on = e => { tx = e.clientX; ty = e.clientY; if (!raf) raf = requestAnimationFrame(loop); };
    window.addEventListener('pointermove', on, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', on); };
  }, []);
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="bd-cloud a" /><div className="bd-cloud b" /><div className="bd-cloud c" />
      <div className="bd-grid" />
      <div ref={glow} className="bd-glow" />
      <div className="bd-grain" />
    </div>
  );
}
