import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../icons.jsx';
import { toggleTheme } from '../theme.js';
import { useDark } from '../hooks.js';

export function ThemeButton({ className = 'icon-btn' }) {
  const dark = useDark();
  return (
    <button className={className + ' theme-btn'} onClick={e => toggleTheme(e.currentTarget)} title="تغییر حالت روز/شب" aria-label="تغییر حالت روز/شب">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={dark ? 'sun' : 'moon'} style={{ display: 'inline-flex' }}
          initial={{ rotate: -90, scale: .4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: .4, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}>
          <Icon name={dark ? 'sun' : 'moon'} />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

/** a small dropdown with a spring scale-in (no sliding) */
export function Dropdown({ label, items, value, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dd-wrap" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <button className="model-btn" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu">
        <span className="model-name">{label}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} style={{ display: 'inline-flex' }}><Icon name="chevron" className="chev" /></motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="dropdown" role="menu"
            initial={{ opacity: 0, scale: .92, y: -6, filter: 'blur(6px)' }} animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: .96, filter: 'blur(4px)', transition: { duration: .12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 32 }}>
            {items.map(it => (
              <button key={it.value} className="dd-item" role="menuitemradio" aria-checked={value === it.value} onClick={() => { onPick(it.value); setOpen(false); }}>
                <div className="dd-text"><div className="dd-title">{it.title}</div><div className="dd-desc">{it.desc}</div></div>
                <span className="dd-check">{value === it.value && <motion.span layoutId="dd-check" style={{ display: 'inline-flex' }}><Icon name="check" /></motion.span>}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
