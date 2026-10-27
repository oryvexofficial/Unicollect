import { useId } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../icons.jsx';
import PetalMark from '../PetalMark.jsx';
import { groupThreads } from './useThreads.js';

const EASE = [.22, 1, .36, 1];

export default function Sidebar({ threads, activeId, onSelect, onDelete, onNew, onToggle, nav, profileName, statusCls, statusLabel, onProfile, dotFor }) {
  const sorted = [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const groups = groupThreads(sorted);
  const inkId = useId();
  return (
    <aside className="sidebar" aria-label="نوار کناری">
      <div className="sidebar-inner">
        <div className="sb-top">
          <button className="icon-btn logo-btn" onClick={onNew} title="Unicollect" aria-label="گفتگوی جدید"><PetalMark /></button>
          <button className="icon-btn" onClick={onToggle} title="بستن نوار کناری" aria-label="بستن نوار کناری"><Icon name="sidebar" /></button>
        </div>
        <nav className="sb-nav">
          {nav.map((it, i) => it.href
            ? <a key={i} className="sb-item" href={it.href} target={it.target} rel={it.target ? 'noopener' : undefined} aria-disabled={it.disabled ? 'true' : undefined}><Icon name={it.icon} /><span>{it.label}</span></a>
            : <button key={i} className="sb-item" onClick={it.onClick}><Icon name={it.icon} /><span>{it.label}</span>{it.kbd && <kbd className="kbd sb-kbd">{it.kbd}</kbd>}</button>)}
        </nav>
        <div className="sb-label">گفتگوها</div>
        <div className="sb-threads">
          <AnimatePresence initial={false}>
            {!sorted.length && (
              <motion.div key="empty" className="sb-empty" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: .25, duration: .3 } }} exit={{ opacity: 0, transition: { duration: .12 } }}>
                هنوز گفتگویی ثبت نشده است
              </motion.div>
            )}
            {groups.map(([label, items]) => (
              <motion.div key={label} className="sb-group" style={{ overflow: 'hidden' }}
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0, transition: { opacity: { duration: .18 }, height: { delay: .14, duration: .32, ease: EASE } } }}
                transition={{ duration: .32, ease: EASE }}>
                <div className="sb-group-label">{label}</div>
                <AnimatePresence initial={false}>
                  {items.map(t => (
                    <motion.div key={t.id} className="thread-row"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', transition: { height: { duration: .3, ease: EASE }, opacity: { duration: .25, delay: .08 } } }}
                      exit={{ opacity: 0, height: 0, transition: { opacity: { duration: .2 }, height: { delay: .12, duration: .3, ease: EASE } } }}>
                      <motion.div
                        className={'thread' + (t.id === activeId ? ' active' : '')} role="button" tabIndex={0}
                        initial={{ x: 18, filter: 'blur(4px)' }} animate={{ x: 0, filter: 'blur(0px)' }}
                        exit={{ x: 36, scale: .96, filter: 'blur(4px)', transition: { duration: .26, ease: EASE } }}
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        onClick={() => onSelect(t.id)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t.id); } }}>
                        {t.id === activeId && <motion.span layoutId={'thread-ink-' + inkId} className="thread-ink" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                        <span className="t-left"><span className={'t-dot ' + dotFor(t)} /><span className="t-title" dir="auto">{t.title || 'گفتگوی جدید'}</span></span>
                        <button className="t-del" onClick={e => { e.stopPropagation(); onDelete(t.id); }} title="حذف" aria-label="حذف گفتگو"><Icon name="trash" /></button>
                      </motion.div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="sb-footer">
          <button className="profile" onClick={onProfile}>
            <span className="avatar"><PetalMark mode={statusCls === 'warn' ? 'live' : ''} /></span>
            <span className="profile-text">
              <span className="profile-name">{profileName}</span>
              <span className="profile-status"><span className={'sdot ' + statusCls} /><span>{statusLabel}</span></span>
            </span>
          </button>
          <div className="creator-watermark">ساخته شده توسط موویکسو</div>
        </div>
      </div>
    </aside>
  );
}
