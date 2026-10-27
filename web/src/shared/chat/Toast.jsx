// Feedback layer shared by the panel, the chat and the site.
//   toast(text, ms | { type, ms, action: { label, onClick } })
//     stacked purple cards, typed icon, countdown bar (pauses on hover), undo-style action
//   const ask = useConfirm(); await ask({ title, text, type, confirmText, cancelText })
//     SweetAlert-style dialog: the icon ring draws itself, then the glyph; resolves true/false
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../icons.jsx';

const ToastCtx = createContext(() => {});
const ConfirmCtx = createContext(async () => false);
export const useToast = () => useContext(ToastCtx);
export const useConfirm = () => useContext(ConfirmCtx);

const ERR = /(خطا|نشد|نیست|نمی‌شود|ممکن نیست|معتبر نیست|آفلاین|offline|error)/i;
const WARN = /(صبر کنید|طولانی|حداکثر|پر است|انتخاب نشده|متوقف)/;
const guessType = t => (ERR.test(t) ? 'error' : WARN.test(t) ? 'warn' : 'success');
const ICON = { success: 'check', error: 'x', warn: 'alert', info: 'info' };
const MAX = 3;
const spring = { type: 'spring', stiffness: 460, damping: 36, mass: .9 };

function ToastItem({ t, onClose }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(t.ms), started = useRef(Date.now()), timer = useRef(0);
  useEffect(() => {
    if (paused) { left.current -= Date.now() - started.current; return; }
    started.current = Date.now();
    timer.current = setTimeout(onClose, Math.max(0, left.current));
    return () => clearTimeout(timer.current);
  }, [paused]);
  return (
    <motion.div layout className={'toast t-' + t.type} role={t.type === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -24, scale: .9, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: .92, y: -10, filter: 'blur(6px)', transition: { duration: .22, ease: [.4, 0, .2, 1] } }}
      transition={spring} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <motion.span className="toast-ic" initial={{ scale: .3, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 520, damping: 18, delay: .06 }}>
        <Icon name={ICON[t.type] || 'check'} />
      </motion.span>
      <span className="toast-text">{t.text}</span>
      {t.action && (
        <button className="toast-act" type="button" onClick={() => { t.action.onClick(); onClose(); }}>{t.action.label}</button>
      )}
      <button className="toast-x" type="button" onClick={onClose} aria-label="بستن"><Icon name="x" /></button>
      <span className="toast-bar" style={{ animationDuration: t.ms + 'ms', animationPlayState: paused ? 'paused' : 'running' }} />
    </motion.div>
  );
}

/* ---------------- SweetAlert-style dialog ---------------- */
const GLYPH = {
  danger: ['M30 30l20 20', 'M50 30L30 50'],
  warn: ['M40 24v20', 'M40 55v.5'],
  success: ['M27 41l9 9 18-19'],
  info: ['M40 26v.5', 'M40 37v18'],
  question: ['M33 31a7.5 7.5 0 1 1 10.5 7c-2.2 1-3.5 2.7-3.5 5v2', 'M40 54v.5']
};

function Dialog({ d, onDone }) {
  const ok = useRef(null);
  const type = d.type || 'warn';
  useEffect(() => {
    const prev = document.activeElement;
    const f = setTimeout(() => ok.current && ok.current.focus({ preventScroll: true }), 60);
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone(false); }
      else if (e.key === 'Tab') {
        const els = [...document.querySelectorAll('.swal-card button')];
        if (!els.length) return;
        const i = els.indexOf(document.activeElement);
        e.preventDefault();
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length].focus();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { clearTimeout(f); window.removeEventListener('keydown', key, true); prev && prev.focus && prev.focus({ preventScroll: true }); };
  }, []);
  const draw = (delay, dur = .45) => ({ initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { pathLength: { delay, duration: dur, ease: [.65, 0, .35, 1] }, opacity: { delay, duration: .01 } } });
  return (
    <motion.div className="swal" onMouseDown={e => { if (e.target === e.currentTarget && d.cancelText !== null) onDone(false); }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .22, delay: .04 } }}>
      <motion.div className={'swal-card s-' + type} role="alertdialog" aria-modal="true" aria-labelledby="swal-t" aria-describedby="swal-d"
        initial={{ opacity: 0, scale: .82, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: .9, y: 12, transition: { duration: .2, ease: [.4, 0, .2, 1] } }}
        transition={{ type: 'spring', stiffness: 360, damping: 24 }}>
        <div className="swal-glow" aria-hidden="true" />
        <motion.div className="swal-icon" aria-hidden="true" initial={{ scale: .6 }} animate={{ scale: [0.6, 1.08, 1] }} transition={{ duration: .55, times: [0, .6, 1], ease: 'easeOut' }}>
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" className="sw-track" />
            <motion.circle cx="40" cy="40" r="34" className="sw-ring" {...draw(.08, .6)} style={{ rotate: -90, transformOrigin: '40px 40px' }} />
            <g className="sw-glyph">
              {(GLYPH[type] || GLYPH.warn).map((dd, i) => <motion.path key={i} d={dd} {...draw(.48 + i * .14, .32)} />)}
            </g>
          </svg>
        </motion.div>
        <motion.h3 id="swal-t" className="swal-title" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .14, duration: .35, ease: [.22, 1, .36, 1] }}>{d.title}</motion.h3>
        {d.text && <motion.p id="swal-d" className="swal-text" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, duration: .35, ease: [.22, 1, .36, 1] }}>{d.text}</motion.p>}
        <motion.div className="swal-btns" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .26, duration: .35, ease: [.22, 1, .36, 1] }}>
          <motion.button ref={ok} type="button" className={'swal-ok' + (type === 'danger' ? ' danger' : '')} whileTap={{ scale: .95 }} onClick={() => onDone(true)}>
            {d.confirmIcon && <Icon name={d.confirmIcon} />}<span>{d.confirmText || 'تأیید'}</span>
          </motion.button>
          {d.cancelText !== null && <motion.button type="button" className="swal-cancel" whileTap={{ scale: .95 }} onClick={() => onDone(false)}>{d.cancelText || 'انصراف'}</motion.button>}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const [dlg, setDlg] = useState(null);
  const resolver = useRef(null);
  const close = useCallback(id => setList(l => l.filter(t => t.id !== id)), []);
  const show = useCallback((text, opts) => {
    const o = typeof opts === 'number' ? { ms: opts } : opts || {};
    const t = { id: Date.now() + Math.random(), text, type: o.type || guessType(String(text)), ms: o.ms || (o.action ? 5000 : 2600), action: o.action };
    setList(l => {
      const same = l.find(x => x.text === text && !x.action);
      const rest = same ? l.filter(x => x !== same) : l;
      return [t, ...rest].slice(0, MAX);
    });
    return t.id;
  }, []);
  const ask = useCallback(d => new Promise(res => {
    if (resolver.current) resolver.current(false);
    resolver.current = res;
    setDlg({ ...d, k: Date.now() });
  }), []);
  const done = v => { const r = resolver.current; resolver.current = null; setDlg(null); r && r(v); };
  return (
    <ConfirmCtx.Provider value={ask}>
      <ToastCtx.Provider value={show}>
        {children}
        <div className="toast-host" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map(t => <ToastItem key={t.id} t={t} onClose={() => close(t.id)} />)}
          </AnimatePresence>
        </div>
        <AnimatePresence>{dlg && <Dialog key={dlg.k} d={dlg} onDone={done} />}</AnimatePresence>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}
