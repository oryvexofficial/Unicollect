// The composer. The textarea stays the real input (caret, IME, selection,
// a11y) but in "ink" mode its glyphs are transparent and a pixel-identical
// mirror paints the text underneath; freshly typed characters fade in like
// ink soaking into paper. Height glides, the placeholder blurs away, the send
// button morphs into a stop button while busy and the border runs an ink
// sweep while the models think. Huge texts fall back to plain rendering.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../icons.jsx';
import { REDUCED, escapeHtml, fa, textDir } from '../util.js';

const INK_MS = 380, INK_MAX_LEN = 5000, MAX_TA_H = 200;

const Composer = forwardRef(function Composer({ maxLength, placeholder, busy, onSend, onStop, leftSlot, ariaLabel, onTooLong }, ref) {
  const ta = useRef(null), mirror = useRef(null), inner = useRef(null), wrap = useRef(null);
  const st = useRef({ h: 0, prev: '', fresh: [], cleanup: 0, dir: 'rtl', long: false, instant: false, raf: 0 });
  const [len, setLen] = useState(0);
  const [canSend, setCanSend] = useState(false);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(true);
  // Ink mirror is off: painting typed Persian through a transparent textarea +
  // a mirror broke letter joins and showed doubled / wrong-colour glyphs on some
  // fonts and zoom levels. The textarea now renders its own text.
  const ink = false;

  const syncScroll = () => { if (mirror.current && ta.current && mirror.current.scrollTop !== ta.current.scrollTop) mirror.current.scrollTop = ta.current.scrollTop; };

  const trackInsert = (a, b) => {
    const now = performance.now(), s0 = st.current;
    let p = 0; const minLen = Math.min(a.length, b.length);
    while (p < minLen && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    let s = 0;
    while (s < minLen - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    const removed = a.length - p - s, inserted = b.length - p - s, delta = inserted - removed;
    const next = [];
    for (const r of s0.fresh) {
      if (now - r.t >= INK_MS) continue;
      if (r.e <= p) next.push(r);
      else if (r.s >= p + removed) next.push({ s: r.s + delta, e: r.e + delta, t: r.t });
    }
    if (inserted > 0) next.push({ s: p, e: p + inserted, t: now });
    next.sort((x, y) => x.s - y.s);
    s0.fresh = next;
  };

  const renderMirror = () => {
    const el = ta.current, inn = inner.current, s0 = st.current;
    if (!el || !inn) return;
    const v = el.value, dir = textDir(v);
    if (dir !== s0.dir) { s0.dir = dir; el.dir = dir; inn.dir = dir; }
    wrap.current.classList.toggle('ink', ink && !s0.long);
    if (s0.long) { inn.textContent = ''; return; }
    const now = performance.now();
    let html = '', pos = 0;
    const live = ink ? s0.fresh.filter(r => now - r.t < INK_MS) : [];
    for (const r of live) {
      if (r.s < pos) continue;
      html += escapeHtml(v.slice(pos, r.s));
      html += `<span class="ink-new" style="animation-delay:${-Math.round(now - r.t)}ms">${escapeHtml(v.slice(r.s, r.e))}</span>`;
      pos = r.e;
    }
    html += escapeHtml(v.slice(pos));
    if (!v || v.endsWith('\n')) html += '\u200b';
    inn.innerHTML = html;
    clearTimeout(s0.cleanup);
    if (live.length) s0.cleanup = setTimeout(() => { s0.fresh = []; renderMirror(); }, INK_MS + 20);
    syncScroll();
  };

  const syncSize = first => {
    const el = ta.current, w = wrap.current, inn = inner.current, s0 = st.current;
    if (!el || !w || !inn) return;
    const contentH = s0.long ? MAX_TA_H + 1 : inn.scrollHeight;
    const h = Math.max(Math.min(contentH, MAX_TA_H), 0) || el.offsetHeight;
    if (h !== s0.h) {
      s0.h = h;
      el.style.height = h + 'px';
      if (first || s0.instant) { w.style.transition = 'none'; w.style.height = h + 'px'; void w.offsetHeight; w.style.transition = ''; }
      else w.style.height = h + 'px';
      el.style.overflowY = contentH > MAX_TA_H ? 'auto' : 'hidden';
      syncScroll();
    }
    s0.instant = false;
  };

  const onInput = instant => {
    const el = ta.current, s0 = st.current, v = el.value;
    s0.long = v.length > INK_MAX_LEN;
    if (ink && !instant && !s0.long) trackInsert(s0.prev, v); else s0.fresh = [];
    s0.prev = v; s0.instant = !!instant;
    renderMirror(); syncSize();
    setLen(v.length); setEmpty(!v.length); setCanSend(/\S/.test(v));
  };

  useImperativeHandle(ref, () => ({
    focus: () => ta.current && ta.current.focus({ preventScroll: true }),
    value: () => (ta.current ? ta.current.value : ''),
    set: v => { if (!ta.current) return; ta.current.value = v; onInput(true); },
    clear: () => { if (!ta.current) return; ta.current.value = ''; onInput(true); },
    insert: text => {
      const el = ta.current; el.focus();
      const room = maxLength - (el.value.length - (el.selectionEnd - el.selectionStart));
      const chunk = text.slice(0, Math.max(0, room));
      if (!chunk) return false;
      el.setRangeText(chunk, el.selectionStart, el.selectionEnd, 'end');
      onInput(false);
      return true;
    }
  }));

  useLayoutEffect(() => { st.current.prev = ta.current.value; renderMirror(); syncSize(true); }, []);
  useEffect(() => {
    if (!window.ResizeObserver) return;
    const ro = new ResizeObserver(() => {
      const s0 = st.current;
      if (s0.raf) return;
      s0.raf = requestAnimationFrame(() => { s0.raf = 0; syncSize(); });
    });
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  const send = () => {
    if (busy) return onStop();
    const v = ta.current.value;
    if (v.trim().length > maxLength) { onTooLong && onTooLong(); return; }
    onSend(v);
  };
  const onKey = e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      if (!busy) send();
    }
  };
  const active = busy || canSend;

  return (
    <div className={'composer' + (focused ? ' focused' : '') + (busy ? ' busy ink-border' : '')}>
      <div className="ta-wrap" ref={wrap}>
        <div className="ta-mirror" ref={mirror} aria-hidden="true"><div className="ta-mirror-inner" ref={inner} /></div>
        <div className={'ta-ph' + (empty ? '' : ' off')} aria-hidden="true">{placeholder}</div>
        <textarea ref={ta} rows={1} dir="rtl" maxLength={maxLength} aria-label={ariaLabel || placeholder} spellCheck="false" autoComplete="off" enterKeyHint="send"
          onInput={() => onInput(false)} onKeyDown={onKey} onScroll={syncScroll} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      </div>
      <div className="composer-row">
        <div className="cr-start">{leftSlot}</div>
        <div className="cr-end">
          <AnimatePresence>
            {len > 200 && (
              <motion.span className="counter" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .9 }}>
                {fa(len)} / {fa(maxLength)}
              </motion.span>
            )}
          </AnimatePresence>
          <motion.button className={'send-btn' + (busy ? ' busy' : '') + (active ? ' on' : '')} onClick={send} disabled={!active}
            title={busy ? 'توقف' : 'ارسال'} aria-label={busy ? 'توقف' : 'ارسال'}
            whileTap={active ? { scale: .88 } : undefined}
            animate={{ scale: active ? 1 : .92 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
            <AnimatePresence mode="popLayout" initial={false}>
              {busy
                ? <motion.span key="stop" className="sb-ico" initial={{ scale: .3, opacity: 0, rotate: -90 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: .3, opacity: 0 }}><i className="stop-sq" /></motion.span>
                : <motion.span key="send" className="sb-ico" initial={{ scale: .3, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: .3, opacity: 0, y: -10 }}><Icon name="arrowup" /></motion.span>}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>
    </div>
  );
});
export default Composer;
