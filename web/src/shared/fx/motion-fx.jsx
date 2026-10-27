// Scroll + ambient effects for the public site (React Bits-style, rebuilt
// for RTL Persian: whole words only, never per-letter boxes).
//   <VelocityMarquee>   rows that drift forever and speed up / reverse with scroll velocity
//   <ScrollInk>         a sentence whose words "soak in" as it scrolls through the viewport
//   <VoteOrbit>         five model nodes orbiting a seal; votes travel down the spokes
//   <ScrollLine>        a progress line that draws itself as a section scrolls by
//   <StampIn>           a rubber stamp that slams down when scrolled into view
import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationFrame, useMotionValue, useScroll, useSpring, useTransform, useVelocity } from 'motion/react';
import { REDUCED, splitWords } from '../util.js';
import { useInView } from '../hooks.js';

const wrap = (min, max, v) => { const r = max - min; return ((((v - min) % r) + r) % r) + min; };

export function VelocityMarquee({ children, base = 40, className = '', reverse = false }) {
  const x = useMotionValue(0);
  const { scrollY } = useScroll();
  const vel = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(vel, [-1000, 0, 1000], [-4, 0, 4], { clamp: false });
  const dir = useRef(reverse ? -1 : 1);
  const track = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = track.current; if (!el) return;
    const m = () => setW(el.firstElementChild ? el.firstElementChild.offsetWidth : 0);
    m(); const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect();
  }, []);
  useAnimationFrame((_, dt) => {
    if (REDUCED || !w) return;
    let move = dir.current * base * (dt / 1000);
    const f = factor.get();
    if (f < 0) dir.current = reverse ? 1 : -1; else if (f > 0) dir.current = reverse ? -1 : 1;
    move += dir.current * move * Math.abs(f);
    x.set(wrap(-w, 0, x.get() + move));
  });
  return (
    <div className={'vmarquee ' + className} dir="ltr">
      <motion.div className="vm-track" ref={track} style={{ x }}>
        <div className="vm-set">{children}</div>
        <div className="vm-set" aria-hidden="true">{children}</div>
        <div className="vm-set" aria-hidden="true">{children}</div>
      </motion.div>
    </div>
  );
}

function InkWord({ progress, range, children }) {
  const o = useTransform(progress, range, [0.14, 1]);
  const b = useTransform(progress, range, [6, 0]);
  const filter = useTransform(b, v => `blur(${v}px)`);
  return <motion.span className="si-w" style={{ opacity: o, filter }}>{children}</motion.span>;
}

export function ScrollInk({ text, as: Tag = 'p', className = '' }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.9', 'start 0.35'] });
  const words = splitWords(text);
  return (
    <Tag ref={ref} className={'scroll-ink ' + className}>
      {words.map((w, i) => {
        const a = i / words.length, b = Math.min(1, a + 1.6 / words.length);
        return <InkWord key={i} progress={scrollYProgress} range={[a, b]}>{w}</InkWord>;
      })}
    </Tag>
  );
}

const MODELS = ['فارسی', 'پرو', 'سریع', 'گسترده', 'انگلیسی'];
const ROUNDS = [[1, 1, 0, 1, 0], [0, 0, 0, 1, 0], [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [0, 1, 0, 0, 1]];
const VO = { c: 160, R: 96, node: 17, seal: 38, label: 34 };
/** the consensus, drawn: five voters on an orbit, each vote travels down its
    spoke into the seal; two or more toxic votes = toxic, one = suspect. */
export function VoteOrbit({ className = '' }) {
  const [ref, inView] = useInView({ once: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!inView || REDUCED) return;
    const t = setInterval(() => setTick(k => k + 1), 3200);
    return () => clearInterval(t);
  }, [inView]);
  const { c, R, node, seal, label } = VO;
  const pts = MODELS.map((_, i) => {
    const a = (-90 + i * 72) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    return {
      x: c + cos * R, y: c + sin * R, cos, sin,
      // spoke runs from the node's rim to the seal's rim, never through either
      x1: c + cos * (R - node - 3), y1: c + sin * (R - node - 3), x2: c + cos * (seal + 5), y2: c + sin * (seal + 5),
      lx: c + cos * (R + node + label * .62), ly: c + sin * (R + node + label * .62) + 1,
      anchor: Math.abs(cos) < .3 ? 'middle' : cos > 0 ? 'start' : 'end'
    };
  });
  const votes = ROUNDS[tick % ROUNDS.length];
  const toxic = votes.reduce((a, b) => a + b, 0);
  const v = toxic >= 2 ? 'toxic' : toxic === 1 ? 'suspect' : 'safe';
  const word = { toxic: 'سمی', suspect: 'مشکوک', safe: 'ایمن' }[v];
  const anim = inView && !REDUCED;
  return (
    <div ref={ref} className={'vote-orbit ' + v + ' ' + className} aria-hidden="true">
      <svg viewBox="-28 0 376 320" role="presentation">
        <defs>
          <radialGradient id="vo-glow"><stop offset="0" stopColor="var(--c)" stopOpacity=".35" /><stop offset="1" stopColor="var(--c)" stopOpacity="0" /></radialGradient>
        </defs>
        <circle className="vo-halo" cx={c} cy={c} r="78" fill="url(#vo-glow)" />
        <circle className="vo-ring" cx={c} cy={c} r={R} />
        <circle className="vo-ring thin" cx={c} cy={c} r={R + 30} />
        {pts.map((p, i) => (
          <line key={'s' + i} className={'vo-spoke' + (votes[i] ? ' on' : '')} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} style={{ transitionDelay: i * 140 + 'ms' }} />
        ))}
        {anim && pts.map((p, i) => (
          <circle key={tick + '-p' + i} className={'vo-pulse' + (votes[i] ? ' on' : '')} cx={p.x1} cy={p.y1} r={votes[i] ? 4 : 2.6}
            style={{ '--dx': (p.x2 - p.x1).toFixed(2) + 'px', '--dy': (p.y2 - p.y1).toFixed(2) + 'px', animationDelay: 120 + i * 140 + 'ms' }} />
        ))}
        {pts.map((p, i) => (
          <g key={'n' + i} className={'vo-voter' + (votes[i] ? ' on' : '')} style={{ transitionDelay: i * 140 + 'ms' }}>
            <circle className="vo-node" cx={p.x} cy={p.y} r={node} style={{ transitionDelay: i * 140 + 'ms' }} />
            <circle className="vo-core" cx={p.x} cy={p.y} r="5" style={{ transitionDelay: i * 140 + 'ms' }} />
            <text className="vo-label" x={p.lx} y={p.ly} textAnchor={p.anchor} dominantBaseline="middle">{MODELS[i]}</text>
          </g>
        ))}
        <motion.g key={tick} initial={REDUCED ? false : { scale: 1.5, opacity: 0, rotate: -22 }} animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ delay: .95, type: 'spring', stiffness: 460, damping: 18 }} style={{ transformOrigin: `${c}px ${c}px`, transformBox: 'view-box' }}>
          <circle className="vo-seal" cx={c} cy={c} r={seal} />
          <circle className="vo-seal-in" cx={c} cy={c} r={seal - 7} />
          <text className="vo-word" x={c} y={c - 2} textAnchor="middle" dominantBaseline="middle">{word}</text>
          <text className="vo-count" x={c} y={c + 17} textAnchor="middle" dominantBaseline="middle">{toxic}/5</text>
        </motion.g>
      </svg>
      <div className="vo-legend">
        {[['safe', '۰', 'ایمن'], ['suspect', '۱', 'مشکوک'], ['toxic', '۲+', 'سمی']].map(([k, n, w]) => (
          <span key={k} className={'vo-key ' + k + (v === k ? ' on' : '')}><i />{w}<small><bdi dir="ltr">{n}</bdi> رأی</small></span>
        ))}
      </div>
    </div>
  );
}

export function ScrollLine({ className = '' }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.75', 'end 0.6'] });
  const s = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  return (
    <div ref={ref} className={'scroll-line ' + className} aria-hidden="true">
      <motion.i style={{ scaleY: s }} />
    </div>
  );
}

export function StampIn({ kind = 'safe', children, delay = 0, className = '' }) {
  const [ref, inView] = useInView();
  return (
    <span ref={ref} className={`mini-stamp ${kind} ${inView ? 'in' : ''} ${className}`} style={{ '--sd': delay + 'ms' }}>{children}</span>
  );
}
