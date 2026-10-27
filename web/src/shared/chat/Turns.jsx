import { motion } from 'motion/react';
import { Icon } from '../icons.jsx';
import { textDir } from '../util.js';

export function UserTurn({ text, onCopy, onRedo, redoTitle = 'تحلیل مجدد', scanning, fresh }) {
  return (
    <motion.div className="msg user" initial={fresh ? { opacity: 0, scale: .94, y: 10, filter: 'blur(6px)' } : false}
      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
      <div className="ubox">
        <div className={'bubble' + (scanning ? ' scanning' : '')} dir={textDir(text)}>{text}</div>
        {onCopy && (
          <div className="uacts">
            <button className="icon-btn sm" onClick={onCopy} title="کپی متن" aria-label="کپی متن"><Icon name="copy" /></button>
            <button className="icon-btn sm" onClick={onRedo} title={redoTitle} aria-label={redoTitle}><Icon name="refresh" /></button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function IconAction({ icon, title, onClick, className = '', id, busy }) {
  return (
    <motion.button whileTap={{ scale: .86 }} className={'icon-btn sm ' + className + (busy ? ' busy' : '')} onClick={onClick} title={title} aria-label={title} id={id}>
      <Icon name={icon} />
    </motion.button>
  );
}
