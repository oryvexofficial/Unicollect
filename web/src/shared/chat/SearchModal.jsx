import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import Modal from './Modal.jsx';
import { Icon } from '../icons.jsx';
import { fa, relTime } from '../util.js';

function snippetAround(text, q, span) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text.slice(0, span * 2);
  const start = Math.max(0, i - span);
  return (start > 0 ? '…' : '') + text.slice(start, i + q.length + span) + (i + q.length + span < text.length ? '…' : '');
}
function Hl({ text, q }) {
  if (!q) return text;
  const low = text.toLowerCase(), out = [];
  let pos = 0, i, k = 0;
  while ((i = low.indexOf(q, pos)) !== -1) {
    out.push(text.slice(pos, i), <mark key={k++}>{text.slice(i, i + q.length)}</mark>);
    pos = i + q.length;
  }
  out.push(text.slice(pos));
  return out;
}

export default function SearchModal({ open, onClose, threads, activeId, onPick, dotFor, textOf }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inp = useRef(null), box = useRef(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inp.current && inp.current.focus({ preventScroll: true }), 30); } }, [open]);
  const query = q.toLowerCase().trim();
  const items = useMemo(() => {
    const sorted = [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (!query) return sorted.slice(0, 20).map(t => ({ t, snippet: textOf(t.messages[t.messages.length - 1]) || '' }));
    const out = [];
    for (const t of sorted) {
      const inTitle = (t.title || '').toLowerCase().includes(query);
      const hit = t.messages.find(m => (textOf(m) || '').toLowerCase().includes(query));
      if (inTitle || hit) out.push({ t, snippet: hit ? snippetAround(textOf(hit), query, 40) : (t.messages[0] && t.messages[0].text) || '' });
      if (out.length >= 50) break;
    }
    return out;
  }, [threads, query, open]);
  useEffect(() => { setSel(0); }, [query]);
  useEffect(() => {
    const n = box.current && box.current.querySelectorAll('.search-item')[sel];
    if (n) n.scrollIntoView({ block: 'nearest' });
  }, [sel]);
  const onKey = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      setSel(s => (s + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const it = items[sel]; if (it) onPick(it.t.id);
    }
  };
  return (
    <Modal open={open} onClose={onClose} bare className="search-modal" label="جستجوی گفتگوها">
      <div className="search-head">
        <Icon name="search" className="search-ico" />
        <input ref={inp} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} dir="auto" placeholder="جستجو در گفتگوها…" autoComplete="off" spellCheck="false" aria-label="جستجو" />
        {q && <button className="icon-btn sm" onClick={() => { setQ(''); inp.current.focus(); }} title="پاک کردن" aria-label="پاک کردن"><Icon name="x" /></button>}
      </div>
      <div className="search-body" ref={box}>
        <div className="search-label">{items.length ? (query ? `${fa(items.length)} نتیجه` : 'گفتگوهای اخیر') : ''}</div>
        <div className="search-results" role="listbox">
          {!items.length && (
            <div className="search-empty"><Icon name={query ? 'search' : 'msg'} /><span>{query ? 'گفتگویی با این عبارت پیدا نشد' : 'هنوز گفتگویی ثبت نشده است'}</span></div>
          )}
          {items.map(({ t, snippet }, idx) => (
            <motion.button key={t.id} role="option" aria-selected={idx === sel}
              className={'search-item' + (idx === sel ? ' sel' : '') + (t.id === activeId ? ' current' : '')}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx, 10) * .025, duration: .25 }}
              onMouseMove={() => sel !== idx && setSel(idx)} onClick={() => onPick(t.id)}>
              {idx === sel && <motion.span layoutId="search-sel" className="search-sel" transition={{ type: 'spring', stiffness: 600, damping: 42 }} />}
              <span className="si-ico"><Icon name="msg" /><span className={'t-dot ' + dotFor(t)} /></span>
              <span className="si-text">
                <span className="si-title" dir="auto"><Hl text={t.title || 'گفتگوی جدید'} q={query} /></span>
                <span className="si-snip" dir="auto"><Hl text={(snippet || '').replace(/\s+/g, ' ')} q={query} /></span>
              </span>
              <span className="si-time">{relTime(t.updatedAt || t.createdAt)}</span>
            </motion.button>
          ))}
        </div>
      </div>
      <div className="search-foot">
        <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> جابه‌جایی</span>
        <span><kbd className="kbd">Enter</kbd> باز کردن</span>
        <span><kbd className="kbd">Esc</kbd> بستن</span>
      </div>
    </Modal>
  );
}
