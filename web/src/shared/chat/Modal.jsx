import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../icons.jsx';
import { CAN_HOVER } from '../util.js';

export default function Modal({ open, onClose, title, className = '', children, foot, label, bare = false }) {
  const last = useRef(null);
  useEffect(() => {
    if (open) last.current = document.activeElement;
    else if (last.current && last.current.focus && CAN_HOVER) last.current.focus({ preventScroll: true });
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className={'modal ' + className} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .18 } }}>
          <motion.div className={bare ? 'modal-bare' : 'modal-card'} role="dialog" aria-modal="true" aria-label={label || title}
            initial={{ opacity: 0, scale: .94, y: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: .97, y: 6, filter: 'blur(4px)', transition: { duration: .16 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            {!bare && (
              <div className="modal-head">
                <h3>{title}</h3>
                <button className="icon-btn" onClick={onClose} aria-label="بستن" title="بستن"><Icon name="x" /></button>
              </div>
            )}
            {children}
            {foot}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
