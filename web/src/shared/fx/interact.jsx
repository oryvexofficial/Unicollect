// Pointer toys: Magnet, Spotlight, Tilt. All transform-only, spring-smoothed.
import { useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { REDUCED, CAN_HOVER } from '../util.js';

export function Magnet({ children, strength = 0.28, radius = 90, className = '', as = 'span' }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: .4 }), sy = useSpring(y, { stiffness: 260, damping: 18, mass: .4 });
  const ref = useRef(null);
  useEffect(() => {
    if (REDUCED || !CAN_HOVER) return;
    const onMove = e => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const near = Math.abs(dx) < r.width / 2 + radius && Math.abs(dy) < r.height / 2 + radius;
      x.set(near ? dx * strength : 0); y.set(near ? dy * strength : 0);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [strength, radius]);
  const M = motion[as] || motion.span;
  return <M ref={ref} className={'magnet ' + className} style={{ x: sx, y: sy, display: 'inline-flex' }}>{children}</M>;
}

/** sets --mx/--my on the element so .spotlight::after can follow the cursor */
export function useSpotlight() {
  return {
    onPointerMove: e => {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
      e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
  };
}

export function SpotlightCard({ as: Tag = 'div', className = '', children, ...rest }) {
  const sp = useSpotlight();
  return <Tag className={'spotlight ' + className} {...sp} {...rest}>{children}</Tag>;
}

export function Tilt({ children, className = '', max = 6, ...rest }) {
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 150, damping: 16 }), sry = useSpring(ry, { stiffness: 150, damping: 16 });
  const on = !REDUCED && CAN_HOVER;
  return (
    <motion.div className={'tilt ' + className} {...rest}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 1100 }}
      onPointerMove={on ? e => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
        rx.set(-py * max); ry.set(px * max);
      } : undefined}
      onPointerLeave={on ? () => { rx.set(0); ry.set(0); } : undefined}>
      {children}
    </motion.div>
  );
}
