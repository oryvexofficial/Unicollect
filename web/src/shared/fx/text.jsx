// Text effects. Persian letters join, so nothing here ever splits a word into
// per-letter boxes: BlurText/RotatingText animate whole words, DecryptedText
// rewrites a single text node (shaping stays intact).
import { useEffect, useRef, useState, Fragment } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { REDUCED, splitWords, faDigits } from '../util.js';
import { useInView } from '../hooks.js';

/** words blur + rise into place, staggered. `parts` lets one word carry <em>. */
export function BlurText({ as: Tag = 'span', text, parts, className = '', delay = 0, stagger = 70, trigger = 'view' }) {
  const [ref, inView] = useInView();
  const [on, setOn] = useState(false);
  useEffect(() => { if (trigger === 'mount' || inView) setOn(true); }, [inView, trigger]);
  const segs = parts || [{ t: text }];
  let i = 0;
  return (
    <Tag ref={ref} className={`blur-text ${on ? 'in' : ''} ${className}`} style={{ '--d': delay + 'ms' }}>
      {segs.map((s, si) => {
        const words = splitWords(s.t);
        const inner = words.map((w, wi) => <span key={wi} className="w" style={{ '--i': i++, animationDuration: undefined }}>{w}</span>);
        return s.em ? <em key={si}>{inner}</em> : <Fragment key={si}>{inner}</Fragment>;
      })}
    </Tag>
  );
}
BlurText.defaultStagger = 70;

export function ShinyText({ children, accent = false, className = '', as: Tag = 'span' }) {
  return <Tag className={`shiny ${accent ? 'accent' : ''} ${className}`}>{children}</Tag>;
}

/** crossfades through values with a blur, word-staggered (hero prompts, thinking phases) */
export function RotatingText({ value, className = '', y = 10 }) {
  if (REDUCED) return <span className={className}>{value}</span>;
  return (
    <span className={'rot ' + className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={value} className="rot-in" style={{ display: 'inline-block' }}>
          {splitWords(value).map((w, i) => (
            <motion.span key={i} style={{ display: 'inline-block', whiteSpace: 'pre' }}
              initial={{ opacity: 0, y, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: .45, delay: i * .045, ease: [.22, 1, .36, 1] } }}
              exit={{ opacity: 0, y: -y * .7, filter: 'blur(6px)', transition: { duration: .22, delay: i * .02 } }}>
              {w}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/_-.#$%&*';
const PER = 'ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی';
/** scramble -> resolve, left-to-right in reading order, one text node */
export function DecryptedText({ text, className = '', speed = 28, start = 'view', revealFrom = 0, as: Tag = 'span', onDone }) {
  const [ref, inView] = useInView();
  const [out, setOut] = useState(text);
  const ran = useRef(false);
  useEffect(() => {
    if (REDUCED) { setOut(text); return; }
    if (start === 'view' && !inView) return;
    ran.current = true;
    const chars = Array.from(text);
    const pool = /[\u0600-\u06FF]/.test(text) ? PER : LAT;
    let frame = 0, raf = 0, last = 0;
    const tick = now => {
      raf = requestAnimationFrame(tick);
      if (now - last < speed) return;
      last = now; frame++;
      const done = Math.min(chars.length, revealFrom + Math.floor(frame / 1.6));
      const s = chars.map((c, i) => (i < done || c === ' ' ? c : pool[(Math.random() * pool.length) | 0])).join('');
      setOut(s);
      if (done >= chars.length) { cancelAnimationFrame(raf); setOut(text); onDone && onDone(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, inView, start]);
  return <Tag ref={ref} className={'decrypt ' + className}>{out}</Tag>;
}

/** eased count-up when scrolled into view, Persian digits */
export function CountUp({ to, from = 0, duration = 1400, decimals = 0, className = '', suffix = '' }) {
  const [ref, inView] = useInView();
  const [v, setV] = useState(to);
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!REDUCED) { setArmed(true); setV(from); } }, []);
  useEffect(() => {
    if (!armed || !inView) return;
    let raf = 0; const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - k, 4);
      setV(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [armed, inView, to]);
  return <span ref={ref} className={'count-up ' + className}>{faDigits(Number(v).toFixed(decimals))}{suffix}</span>;
}

/** words appear one by one at a steady pace; returns when done (Claude-like) */
export function StreamWords({ text, cps = 70, maxMs = 1600, dot = false, onDone, className = '' }) {
  const words = useRef(splitWords(text)).current;
  const [n, setN] = useState(REDUCED ? words.length : 0);
  useEffect(() => {
    if (REDUCED) { onDone && onDone(); return; }
    const rate = Math.max(cps, text.length / Math.max(.1, maxMs / 1000));
    let raf = 0, t0 = 0, shown = 0, idx = 0;
    const lens = words.map(w => w.length);
    const step = now => {
      if (!t0) t0 = now;
      const due = ((now - t0) / 1000) * rate;
      while (idx < words.length && shown < due) { shown += lens[idx]; idx++; }
      setN(idx);
      if (idx < words.length) raf = requestAnimationFrame(step);
      else setTimeout(() => onDone && onDone(), 380);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);
  const doneAll = n >= words.length;
  return (
    <span className={'stream-words ' + className}>
      {words.slice(0, n).map((w, i) => <span key={i} className="tw">{w}</span>)}
      {dot && !doneAll ? <span className="stream-dot" /> : null}
    </span>
  );
}
