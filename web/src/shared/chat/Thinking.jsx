// "Thinking" UI shared by the Guard panel and the chat.
//
// While working: the petal mark breathes, the current step's label shimmers
// (mask sweep, so the text never loses its colour), and every step is listed
// underneath: done steps get a check + their real duration, the live one a
// spinning ink ring, the rest wait dimmed. The Guard variant adds five voter
// pips (the five models deliberating) on the "ask the models" step.
//
// When done: <ThoughtLine> collapses it to "thought for 2.1s · 5 steps"; a
// click unfolds the same steps again, now with the real details (language,
// votes, verdict...) filled in from the answer.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import PetalMark from '../PetalMark.jsx';
import { Icon } from '../icons.jsx';
import { RotatingText } from '../fx/text.jsx';
import { fa } from '../util.js';

const secs = ms => (ms / 1000).toLocaleString('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function StepIcon({ state }) {
  if (state === 'done') return <span className="st-ic done"><Icon name="check" /></span>;
  if (state === 'error') return <span className="st-ic error"><Icon name="x" /></span>;
  if (state === 'active') return <span className="st-ic active"><i /></span>;
  return <span className="st-ic wait" />;
}

/** a vertical list of steps; each step: { label, detail?, ms?, state } */
export function StepList({ steps, voters = 0, voterStep = -1, live = false }) {
  return (
    <ol className={'think-steps' + (live ? ' live' : '')}>
      {steps.map((s, i) => (
        <motion.li key={i} className={'think-step ' + s.state}
          initial={live ? { opacity: 0, x: 8, filter: 'blur(4px)' } : false}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ delay: live ? i * .06 : 0, duration: .35, ease: [.22, 1, .36, 1] }}>
          <StepIcon state={s.state} />
          <span className="st-body">
            <span className="st-label">{s.label}</span>
            {s.detail ? <span className="st-detail" dir="auto">{s.detail}</span> : null}
          </span>
          {i === voterStep && s.state === 'active' && voters > 0 && (
            <span className="voter-pips" aria-hidden="true">
              {Array.from({ length: voters }, (_, k) => <i key={k} style={{ '--i': k }} />)}
            </span>
          )}
          {typeof s.ms === 'number' && s.state !== 'wait' && <span className="st-time mono">{secs(s.ms)}ث</span>}
        </motion.li>
      ))}
    </ol>
  );
}

export function ThinkingBlock({ phase, phases, idx = 0, marks = [], t0, voters = 0, voterStep = -1, details = [] }) {
  const [now, setNow] = useState(() => performance.now());
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, [t0]);
  const sec = Math.max(0, Math.floor((now - t0) / 1000));
  const list = phases || [phase];
  const steps = list.map((label, i) => ({
    label,
    detail: details[i],
    state: i < idx ? 'done' : i === idx ? 'active' : 'wait',
    ms: i < idx ? (marks[i + 1] || now) - (marks[i] || t0) : i === idx ? now - (marks[i] || t0) : undefined
  }));
  return (
    <motion.div className="thinking-block" role="status" aria-live="polite"
      initial={{ opacity: 0, y: 6, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: .97, filter: 'blur(6px)', transition: { duration: .2 } }}>
      <button type="button" className="thinking-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <PetalMark mode="live" />
        <span className="thinking-label shiny"><RotatingText value={list[idx] || phase} /></span>
        {sec >= 1 && <motion.span className="thinking-time mono" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{fa(sec)} ثانیه</motion.span>}
        <motion.span className="thinking-chev" animate={{ rotate: open ? 180 : 0 }}><Icon name="chevron" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && list.length > 1 && (
          <motion.div key="steps" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: .32, ease: [.22, 1, .36, 1] }} style={{ overflow: 'hidden' }}>
            <StepList steps={steps} voters={voters} voterStep={voterStep} live />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/** phase clock: advances one phase per 'dwell'; brisk once the answer is in.
    Records when each phase started (marks) so the steps can show real timings. */
export function usePhaseClock(phases, { holdAt = null } = {}) {
  const [idx, setIdx] = useState(0);
  const [marks, setMarks] = useState([]);
  const st = useRef({ timer: 0, done: false, fast: false, idx: 0, running: false, t0: 0, marks: [], hold: holdAt });
  const dwell = () => (st.current.fast ? 220 + Math.random() * 120 : 550 + Math.random() * 550);
  const go = i => {
    const s = st.current;
    s.idx = i; s.marks = [...s.marks.slice(0, i), performance.now()];
    setIdx(i); setMarks(s.marks);
  };
  const next = () => {
    const s = st.current;
    if (!s.running) return;
    // without an answer yet, park on step `holdAt` (e.g. "asking the models")
    const cap = s.fast || s.hold == null ? phases.length - 1 : Math.min(s.hold, phases.length - 1);
    if (s.idx >= cap) {
      if (s.idx >= phases.length - 1) { s.timer = setTimeout(() => { s.done = true; }, dwell()); return; }
      s.timer = setTimeout(next, 120);
      return;
    }
    go(s.idx + 1);
    s.timer = setTimeout(next, dwell());
  };
  return {
    phase: phases[idx],
    idx,
    marks,
    get t0() { return st.current.t0; },
    start() {
      const s = st.current; clearTimeout(s.timer);
      Object.assign(s, { idx: 0, done: false, fast: false, running: true, t0: performance.now(), marks: [performance.now()] });
      setIdx(0); setMarks(s.marks); s.timer = setTimeout(next, dwell());
    },
    stop() { const s = st.current; clearTimeout(s.timer); s.running = false; },
    fast() { st.current.fast = true; },
    /** jump straight to step i (e.g. first token arrived) */
    jump(i) { const s = st.current; if (i > s.idx) go(Math.min(i, phases.length - 1)); },
    /** durations (ms) of every step up to now */
    durations() {
      const s = st.current, end = performance.now();
      return phases.map((_, i) => (i <= s.idx ? (s.marks[i + 1] || end) - (s.marks[i] || s.t0) : 0));
    },
    isDone: () => st.current.done
  };
}

/** collapsed "thought for Xs" line; unfolds into the recorded steps */
export function ThoughtLine({ ms, fresh, steps }) {
  const [open, setOpen] = useState(false);
  if (typeof ms !== 'number') return null;
  const has = Array.isArray(steps) && steps.length > 0;
  return (
    <div className={'thought' + (open ? ' open' : '')}>
      <button type="button" className={'thought-line' + (fresh ? ' fresh' : '')} onClick={() => has && setOpen(o => !o)}
        aria-expanded={has ? open : undefined} disabled={!has} title={has ? 'نمایش مراحل فکر کردن' : 'زمان صرف‌شده'}>
        <PetalMark mode={fresh ? 'intro' : ''} />
        <span>{secs(ms)} ثانیه فکر کرد</span>
        {has && <span className="thought-count">· {fa(steps.length)} مرحله</span>}
        {has && <motion.span className="thinking-chev" animate={{ rotate: open ? 180 : 0 }}><Icon name="chevron" /></motion.span>}
      </button>
      <AnimatePresence initial={false}>
        {open && has && (
          <motion.div key="s" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: .32, ease: [.22, 1, .36, 1] }} style={{ overflow: 'hidden' }}>
            <StepList steps={steps.map(s => ({ ...s, state: s.state || 'done' }))} live />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
