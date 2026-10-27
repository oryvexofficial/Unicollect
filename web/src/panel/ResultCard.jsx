// One Guard verdict. On a fresh answer: title/subtitle stream in word by
// word, the rubber stamp slams onto the card (ink splash + a tiny shake),
// then meter, stats, model bars and actions cascade in.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '../shared/icons.jsx';
import { ThoughtLine } from '../shared/chat/Thinking.jsx';
import { IconAction } from '../shared/chat/Turns.jsx';
import { StreamWords, CountUp, DecryptedText } from '../shared/fx/text.jsx';
import { REDUCED, fa, faDigits, num } from '../shared/util.js';

export const DECISIONS = {
  TOXIC: { icon: 'shieldx', word: 'سمی', title: 'محتوای سمی شناسایی شد', text: 'بر اساس رأی‌گیری اجماعی مدل‌ها، این متن حاوی الفاظ توهین‌آمیز یا سمی است.' },
  SUSPECT: { icon: 'shieldalert', word: 'مشکوک', title: 'محتوای مشکوک', text: 'برخی مدل‌ها احتمال سمیت متوسطی دیده‌اند اما اجماع کافی نیست؛ بازبینی انسانی پیشنهاد می‌شود.' },
  SAFE: { icon: 'shield', word: 'ایمن', title: 'محتوای سالم', text: 'هیچ‌یک از مدل‌ها نشانه‌ای از توهین یا سمیت در این متن پیدا نکردند.' }
};
const scriptLabel = s => (s === 'fa' ? 'فارسی' : s === 'en' ? 'انگلیسی' : 'مختلط');
const VAR = { TOXIC: '--toxic', SUSPECT: '--suspect', SAFE: '--safe' };

export function errorText(r) {
  const e = r && r.error ? (typeof r.error === 'string' ? r.error : JSON.stringify(r.error)) : 'پاسخی از سرور دریافت نشد';
  return 'خطا در پردازش: ' + e;
}

function Seal({ decision, pct, fresh, onLand }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!fresh || REDUCED) return;
    const t = setTimeout(() => onLand && onLand(ref.current), 330);
    return () => clearTimeout(t);
  }, []);
  return (
    <div ref={ref} className={`seal ${decision} ${fresh ? 'slam' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="seal-ring">
        <defs><path id="sealpath" d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" /></defs>
        <circle cx="50" cy="50" r="46" /><circle cx="50" cy="50" r="40" className="thin" />
        <text><textPath href="#sealpath" startOffset="0">UNICOLLECT · GUARD · UNICOLLECT · GUARD ·</textPath></text>
      </svg>
      <b>{DECISIONS[decision] ? DECISIONS[decision].word : '؟'}</b>
      <small>{faDigits(pct.toFixed(0))}٪</small>
    </div>
  );
}

function Breakdown({ r, detailed, fresh, mode }) {
  const [open, setOpen] = useState(detailed);
  useEffect(() => { setOpen(mode === 'detailed'); }, [mode]);
  const votes = r.votes || {};
  const rows = Object.keys(r.raw_scores || {});
  return (
    <div className={'breakdown' + (open ? ' is-open' : '')}>
      <button className="bd-sum" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>ریز نمرات مدل‌ها</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 26 }} style={{ display: 'inline-flex' }}><Icon name="chevron" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="bd-card" key="bd"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: .38, ease: [.22, 1, .36, 1] }} style={{ overflow: 'hidden' }}>
            <div className="bd-inner">
              {rows.map((key, i) => {
                const raw = Math.max(0, num(r.raw_scores[key]));
                const voted = !!votes[key];
                const w = num(r.weights && r.weights[key], 1);
                const pct = Math.min(100, raw * 100);
                const cls = voted ? 'bad' : raw >= 0.35 ? 'warn' : 'ok';
                const tag = voted ? 'رأی سمی' : raw >= 0.35 ? 'مشکوک' : 'سالم';
                return (
                  <div className="mrow" key={key}>
                    <div className="mrow-top">
                      <div className="mrow-name"><span className={'tag ' + cls}>{tag}</span><span className="n">{(r.labels && r.labels[key]) || key}</span></div>
                      <div className="mrow-val"><span>{faDigits(pct.toFixed(1))}٪</span><span className="wt">×{faDigits(w)}</span></div>
                    </div>
                    <div className="bar"><motion.div className={'f-' + cls}
                      initial={fresh ? { width: 0 } : false} animate={{ width: pct + '%' }}
                      transition={{ duration: .9, delay: fresh ? .15 + i * .08 : 0, ease: [.22, 1, .36, 1] }} /></div>
                  </div>
                );
              })}
              {r.skipped_models && r.skipped_models.length ? (
                <div className="bd-foot"><Icon name="info" /><span>فیلتر زبان ({scriptLabel(r.script)}): <span className="mono">{r.skipped_models.join(', ')}</span> اجرا نشد.</span></div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CensorNote({ c, onCopy, onHide }) {
  return (
    <motion.div className="censor-wrap"
      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: { height: { duration: .34, ease: [.65, 0, .35, 1], delay: .06 }, opacity: { duration: .2 } } }}
      transition={{ height: { duration: .42, ease: [.22, 1, .36, 1] }, opacity: { duration: .3, delay: .08 } }}>
      <motion.div className="censor-note" initial={{ y: -8, filter: 'blur(6px)' }} animate={{ y: 0, filter: 'blur(0px)' }}
        exit={{ y: -6, filter: 'blur(4px)', transition: { duration: .22 } }} transition={{ duration: .42, ease: [.22, 1, .36, 1] }}>
        <div className="cn-head">
          <span className="cn-ico"><Icon name="eyeoff" /></span>
          <span className="cn-title">نسخه‌ی سانسورشده</span>
          {!c.error && <span className="cn-meta">{c.count ? `${fa(c.count)} مورد پوشانده شد` : 'چیزی برای پوشاندن پیدا نشد'}{c.mode === 'sentences' ? ' · جمله‌به‌جمله' : ''}</span>}
          <span className="cn-tools">
            {!c.error && <IconAction icon="copy" title="کپی متن سانسورشده" onClick={onCopy} />}
            <motion.button type="button" className="cn-hide" onClick={onHide} whileTap={{ scale: .94 }} title="پنهان کردن این بخش" aria-label="پنهان کردن نسخه‌ی سانسورشده">
              <Icon name="up" /><span>پنهان کردن</span>
            </motion.button>
          </span>
        </div>
        {c.error ? <span className="cn-err">{c.error}</span> : <div className="cn-text" dir="auto">{c.text}</div>}
      </motion.div>
    </motion.div>
  );
}

const Stagger = ({ show, i, children, className = '' }) => (
  <motion.div className={className} initial={show ? false : { opacity: 0, y: 10, filter: 'blur(6px)' }}
    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: .5, delay: i * .07, ease: [.22, 1, .36, 1] }}>
    {children}
  </motion.div>
);

export default function ResultCard({ msg, fresh, viewMode, burst, onCopyReport, onCensor, onCopyJSON, onRedo, onCopyCensored, onHideCensor, censorBusy }) {
  const r = msg.result;
  const [stage, setStage] = useState(fresh && !REDUCED ? 0 : 2); // 0 title typing, 1 sub typing+cascade, 2 done
  const [shake, setShake] = useState(false);

  if (!r || r.error || !r.decision) {
    const t = errorText(r);
    return (
      <motion.div className="msg bot" initial={fresh ? { opacity: 0 } : false} animate={{ opacity: 1 }}>
        <div className="bot-body">
          <ThoughtLine ms={msg.thinkingMs} fresh={fresh} steps={msg.steps} />
          <div className="err-line"><span className="err-icon"><Icon name="alert" /></span>
            <span className="err-text">{fresh && !REDUCED ? <StreamWords text={t} cps={90} maxMs={2200} /> : t}</span></div>
          <div className="actions"><IconAction icon="refresh" title="تلاش مجدد" onClick={onRedo} /></div>
        </div>
      </motion.div>
    );
  }

  const decision = DECISIONS[r.decision] ? r.decision : 'UNKNOWN';
  const meta = DECISIONS[decision] || { icon: 'info', title: 'نتیجه نامشخص', text: 'پاسخ معتبری از سرور دریافت نشد.' };
  const maxPct = Math.max(0, Math.min(100, num(r.max_raw) * 100));
  const voteThr = num(r.vote_threshold, 0.5);
  const showAll = stage >= 1;
  const cascade = !fresh || REDUCED;

  const land = el => {
    setShake(true); setTimeout(() => setShake(false), 420);
    if (!el || !burst) return;
    const b = el.getBoundingClientRect();
    const col = getComputedStyle(document.documentElement).getPropertyValue(VAR[decision] || '--accent').trim();
    burst(b.left + b.width / 2, b.top + b.height / 2, col, decision === 'TOXIC' ? 34 : 22, decision === 'TOXIC' ? 1.25 : .9);
  };

  const censorShown = !!(msg.censored && !msg.censored.hidden);
  const fing = r.fingilish_detected && r.fingilish_text;
  const chip = d => {
    if (!d) return null;
    const label = d === 'SAFE' ? 'سالم' : d === 'SUSPECT' ? 'مشکوک' : d === 'TOXIC' ? 'سمی' : 'نامشخص';
    return <span className={'tag ' + (d === 'SAFE' ? 'ok' : d === 'SUSPECT' ? 'warn' : 'bad')}>{label}</span>;
  };
  const cut = s => (s.length > 60 ? s.slice(0, 60) + '…' : s);
  let k = 0;

  return (
    <motion.div className="msg bot" initial={fresh ? { opacity: 0 } : false} animate={{ opacity: 1 }}>
      <div className="bot-body">
        <ThoughtLine ms={msg.thinkingMs} fresh={fresh} steps={msg.steps} />
        <motion.div className={`result ${decision}`} animate={shake ? { x: [0, -3, 3, -2, 1, 0], rotate: [0, -.3, .3, 0] } : { x: 0 }} transition={{ duration: .4 }}>
          <div className="res-head">
            <span className="res-ico"><Icon name={meta.icon} /></span>
            <div className="res-txt">
              <div className="res-title">{stage === 0 ? <StreamWords text={meta.title} cps={45} maxMs={900} onDone={() => setStage(1)} /> : meta.title}</div>
              <div className="res-sub">{stage === 0 ? '\u00a0' : stage === 1 && fresh && !REDUCED ? <StreamWords text={meta.text} cps={110} maxMs={1500} dot onDone={() => setStage(2)} /> : meta.text}</div>
            </div>
            {showAll && <Seal decision={decision} pct={maxPct} fresh={fresh} onLand={land} />}
          </div>
          {showAll && (
            <>
              <Stagger show={cascade} i={k++} className="meter-wrap">
                <div className="meter">
                  <motion.div className="meter-fill" initial={cascade ? false : { width: 0 }} animate={{ width: maxPct + '%' }} transition={{ duration: 1.1, delay: .2, ease: [.22, 1, .36, 1] }} />
                  <i className="tick" style={{ insetInlineStart: voteThr * 100 + '%' }} />
                  <i className="tick" style={{ insetInlineStart: '90%' }} />
                </div>
                <div className="meter-legend"><span><i className="lg" />آستانه رأی {fa(Math.round(voteThr * 100))}٪</span><span><i className="lg" />حد قاطع ۹۰٪</span></div>
              </Stagger>
              {fing && (
                <Stagger show={cascade} i={k++} className="note">
                  <span className="note-ico"><Icon name="lang" /></span>
                  <div className="note-body">
                    <div className="note-title">فینگیلیش تشخیص داده شد</div>
                    <div className="note-flow">
                      <span className="np mono" dir="ltr">{cut(msg.text)}</span>
                      <span className="arrow"><Icon name="arrowL" /></span>
                      {cascade ? <span className="np fa" dir="rtl">{cut(r.fingilish_text)}</span> : <DecryptedText className="np fa" text={cut(r.fingilish_text)} start="mount" />}
                    </div>
                    <div className="note-res">متن اصلی {chip(r.analysis && r.analysis.original && r.analysis.original.decision)} <span className="sep">·</span> نسخه‌ی فارسی {chip(r.analysis && r.analysis.fingilish && r.analysis.fingilish.decision)}</div>
                  </div>
                </Stagger>
              )}
              <Stagger show={cascade} i={k++} className="stats">
                <div className="stat"><div className="k">آرای سمیت</div><div className="v num-ltr">{faDigits(num(r.votes_count))} / {faDigits(num(r.total_models))}</div></div>
                <div className="stat" title="میانگین دو نمره‌ی بالاتر مدل‌ها"><div className="k">میانگین ۲ نمره‌ی برتر</div><div className="v">{cascade ? faDigits((num(r.confidence) * 100).toFixed(1)) : <CountUp to={num(r.confidence) * 100} decimals={1} />}٪</div></div>
                <div className="stat"><div className="k">زبان</div><div className="v">{scriptLabel(r.script)}</div></div>
                <div className="stat"><div className="k">زمان سرور</div><div className="v">{cascade ? faDigits(num(r.latency_ms)) : <CountUp to={num(r.latency_ms)} duration={900} />} میلی‌ثانیه</div></div>
              </Stagger>
              <Stagger show={cascade} i={k++}>
                <Breakdown r={r} detailed={viewMode === 'detailed'} mode={viewMode} fresh={fresh} />
              </Stagger>
            </>
          )}
        </motion.div>
        <AnimatePresence initial={false}>{msg.censored && !msg.censored.hidden && <CensorNote key="cn" c={msg.censored} onCopy={onCopyCensored} onHide={onHideCensor} />}</AnimatePresence>
        {showAll && (
          <Stagger show={cascade} i={k++} className="actions">
            <IconAction icon="copy" title="کپی گزارش" onClick={onCopyReport} />
            {decision !== 'SAFE' && <IconAction icon="eyeoff" title={censorShown ? 'پنهان کردن نسخه‌ی سانسورشده' : 'نسخه‌ی سانسورشده'} className={censorShown ? 'on' : ''} onClick={onCensor} busy={censorBusy} />}
            <IconAction icon="code" title="کپی JSON" onClick={onCopyJSON} />
            <IconAction icon="refresh" title="تحلیل مجدد" onClick={onRedo} />
          </Stagger>
        )}
      </div>
    </motion.div>
  );
}
