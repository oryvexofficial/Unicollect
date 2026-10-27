// Site frame: floating header (hides on scroll down, ink pill follows the
// pointer across the nav, reading-progress hairline), mobile drawer, the
// footer card and the secret "muvixo" access dialog.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { Icon } from '../shared/icons.jsx';
import PetalMark from '../shared/PetalMark.jsx';
import { useToast } from '../shared/chat/Toast.jsx';
import { copyText } from '../shared/util.js';
import { scrollToY } from '../shared/fx/SmoothScroll.jsx';
import { LiveLink, useLive } from './live.jsx';

export const NAV = [
  { key: 'home', href: '', label: 'خانه', icon: 'home' },
  { key: 'chat', href: 'chat/', label: 'چت', icon: 'msg' },
  { key: 'api', href: 'api/', label: 'API', icon: 'code' },
  { key: 'how', href: 'how-it-works/', label: 'فرآیند', icon: 'layers' },
  { key: 'about', href: 'about/', label: 'درباره', icon: 'info' },
  { key: 'privacy', href: 'privacy/', label: 'حریم خصوصی', icon: 'lock' }
];
export const href = (root, p) => (root + p) || './';

function Brand({ root, small }) {
  return (
    <a className="brand" href={href(root, '')} aria-label="Unicollect Guard، صفحه اصلی">
      <span className="logo"><PetalMark mode="intro" /></span><span>Unicollect</span>{!small && <small>Guard</small>}
    </a>
  );
}

function StatusPill({ root, className = 'pill' }) {
  const L = useLive();
  return (
    <a className={className} href={href(root, 'api/#links')}>
      <span className={'dot ' + L.dot} /><span>{L.label}</span>
    </a>
  );
}

function Header({ page, root, onMenu }) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hover, setHover] = useState(null);
  const ref = useRef(null);
  const { scrollYProgress } = useScroll();
  const prog = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  useEffect(() => {
    let last = window.scrollY, travel = 0, raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = Math.max(0, window.scrollY), dy = y - last; last = y;
        setScrolled(y > 8);
        travel = (dy > 0) === (travel > 0) ? travel + dy : dy;
        const pinned = y < 140 || (ref.current && ref.current.contains(document.activeElement));
        if (pinned || travel < -24) setHidden(false); else if (travel > 36) setHidden(true);
      });
    };
    const near = e => { if (e.clientY < 24) setHidden(false); };
    window.addEventListener('scroll', on, { passive: true });
    document.addEventListener('mousemove', near, { passive: true });
    return () => { window.removeEventListener('scroll', on); document.removeEventListener('mousemove', near); };
  }, []);
  const shown = hover || page;
  return (
    <header ref={ref} className={'top' + (hidden ? ' hide' : '') + (scrolled ? ' scrolled' : '')} id="top" data-top onFocus={() => setHidden(false)}>
      <div className="top-bar">
        <Brand root={root} />
        <nav className="nav" aria-label="ناوبری اصلی" onMouseLeave={() => setHover(null)}>
          {NAV.map(n => (
            <a key={n.key} href={href(root, n.href)} aria-current={n.key === page ? 'page' : undefined} data-nav-key={n.key}
              onMouseEnter={() => setHover(n.key)} onFocus={() => setHover(n.key)} onBlur={() => setHover(null)}>
              {shown === n.key && <motion.span layoutId="nav-ink" className={'nav-ink' + (n.key !== page ? ' ghost' : '')} transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="top-end">
          <StatusPill root={root} />
          <a className="icon-btn top-chat" href={href(root, 'chat/')} aria-label="باز کردن چت" title="چت"><Icon name="msg" /></a>
          <button className="icon-btn menu-btn" type="button" onClick={onMenu} aria-label="باز کردن منو" aria-controls="drawer"><Icon name="menu" /></button>
        </div>
      </div>
      <motion.span className="top-progress" aria-hidden="true" style={{ scaleX: prog }} />
    </header>
  );
}

function Drawer({ open, onClose, page, root }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const r = () => { if (innerWidth > 900) onClose(); };
    window.addEventListener('resize', r);
    return () => { document.body.style.overflow = ''; window.removeEventListener('resize', r); };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="drawer open" id="drawer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="shade" onClick={onClose} />
          <motion.div className="sheet" role="dialog" aria-modal="true" aria-label="منو"
            initial={{ x: '-6%', opacity: 0, filter: 'blur(8px)' }} animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ x: '-4%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}>
            <div className="sheet-head"><Brand root={root} small /><button className="icon-btn" type="button" onClick={onClose} aria-label="بستن منو"><Icon name="x" /></button></div>
            <nav>
              {NAV.map((n, i) => (
                <motion.a key={n.key} href={href(root, n.href)} aria-current={n.key === page ? 'page' : undefined} onClick={onClose}
                  initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .05 + i * .04 }}>
                  <Icon name={n.icon} /><span>{n.label}</span>
                </motion.a>
              ))}
            </nav>
            <StatusPill root={root} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Footer({ root }) {
  const L = useLive();
  return (
    <footer className="foot" data-foot>
      <div className="foot-card">
        <div className="foot-top">
          <div className="foot-brand">
            <Brand root={root} />
            <p>نگهبان متن فارسی، فینگیلیش و انگلیسی؛ پنج مدل، یک مُهر.</p>
            <a className="foot-status" href={href(root, 'api/#links')}><span className={'dot ' + L.dot} /><span>{L.label}</span>{L.ms != null && <span className="mono">{L.ms}ms</span>}</a>
          </div>
          <nav className="foot-cols" aria-label="پیوندهای پایانی">
            <div><h4>محصول</h4><a href={href(root, 'chat/')}>چت نگهبان</a><a href={href(root, 'how-it-works/')}>فرآیند</a><a href={href(root, 'about/')}>درباره</a></div>
            <div><h4>توسعه‌دهنده</h4><a href={href(root, 'api/')}>مستندات API</a><a href={href(root, 'api/#console')}>کنسول</a><LiveLink k="swagger">Swagger</LiveLink><a href={href(root, 'api/links.json')} className="ltr">links.json</a></div>
            <div><h4>حقوقی</h4><a href={href(root, 'privacy/')}>حریم خصوصی</a><a href={href(root, 'api/#auth')}>کلید و محدودیت</a></div>
          </nav>
        </div>
        <div className="foot-bottom">
          <span>© Unicollect Guard · ساخته‌ی موویکسو</span>
          <span className="foot-note">Unicollect می‌تواند اشتباه کند؛ نتیجه‌های مهم را خودت هم مرور کن.</span>
          <button className="to-top" type="button" onClick={() => scrollToY(0)} aria-label="برگشت به بالا"><Icon name="up" /><span>بالا</span></button>
        </div>
      </div>
    </footer>
  );
}

/* type "muvixo" anywhere (outside inputs) */
function AccessModal({ root }) {
  const [open, setOpen] = useState(false);
  const L = useLive();
  const toast = useToast();
  useEffect(() => {
    let buf = '';
    const on = e => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (!e.key || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      if (t === 'input' || t === 'textarea' || t === 'select') return;
      buf = (buf + e.key.toLowerCase()).slice(-6);
      if (buf === 'muvixo') { buf = ''; setOpen(true); L.reload(); }
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal" id="access" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section className="modal-card" role="dialog" aria-modal="true" aria-label="دسترسی به نگهبان متن"
            initial={{ scale: .94, y: 14, filter: 'blur(8px)' }} animate={{ scale: 1, y: 0, filter: 'blur(0px)' }} exit={{ scale: .97, opacity: 0 }}>
            <div className="modal-head"><h3>دسترسی به نگهبان متن</h3><button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="بستن"><Icon name="x" /></button></div>
            <div className="base-box"><code>{L.url || 'سرویس فعلاً آنلاین نیست'}</code></div>
            <div className="actions">
              <LiveLink k="panel" className="btn btn-ink btn-sm"><Icon name="external" /><span>باز کردن پنل</span></LiveLink>
              <a className="btn btn-line btn-sm" href={href(root, 'api/')}><Icon name="code" /><span>مستندات API</span></a>
              <button className="btn btn-line btn-sm" type="button" onClick={() => L.url && copyText(L.url).then(() => toast('کپی شد'))}><Icon name="copy" /><span>کپی لینک</span></button>
            </div>
            <div className="modal-foot-note">{L.url ? `سرویس ${L.health === 'ok' ? 'آنلاین است.' : 'در حال آماده‌سازی است.'}` : 'لینک فعالی منتشر نشده است.'}</div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Layout({ page, root, children }) {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <a className="skip" href="#main">رفتن به محتوا</a>
      <Header page={page} root={root} onMenu={() => setMenu(true)} />
      <Drawer open={menu} onClose={() => setMenu(false)} page={page} root={root} />
      <main id="main">{children}</main>
      <Footer root={root} />
      <AccessModal root={root} />
    </>
  );
}
