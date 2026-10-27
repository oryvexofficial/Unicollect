import { useEffect, useState } from 'react';
import { Icon } from '../../shared/icons.jsx';
import Reveal from '../../shared/fx/Reveal.jsx';
import { BlurText, DecryptedText } from '../../shared/fx/text.jsx';
import { SpotlightCard, Tilt } from '../../shared/fx/interact.jsx';
import { ScrollLine, StampIn } from '../../shared/fx/motion-fx.jsx';
import { LiveLink, useLive } from '../live.jsx';
import { href } from '../Layout.jsx';

/** a perforated postage stamp, the inner pages' hero art: slams in, then tilts with the pointer */
function PostStamp({ icon, word, code }) {
  return (
    <Reveal className="post-stamp-wrap" delay={250} aria-hidden="true">
      <Tilt className="post-stamp" max={10}>
        <div className="ps-paper">
          <div className="ps-in">
            <span className="ps-top mono">UNICOLLECT · GUARD</span>
            <span className="ps-icon"><Icon name={icon} /></span>
            <b className="ps-word">{word}</b>
            <span className="ps-code mono">{code}</span>
          </div>
        </div>
        <svg className="ps-mark" viewBox="0 0 220 120"><circle cx="150" cy="60" r="44" /><circle cx="150" cy="60" r="36" className="thin" />
          <path d="M0 38c14-8 26 8 40 0s26 8 40 0M0 60c14-8 26 8 40 0s26 8 40 0M0 82c14-8 26 8 40 0s26 8 40 0" />
          <text x="150" y="56" textAnchor="middle">TEHRAN</text><text x="150" y="76" textAnchor="middle" className="sm">۱۴۰۵</text></svg>
      </Tilt>
    </Reveal>
  );
}

function PageHero({ eyebrow, title, sub, art }) {
  return (
    <section className="page-hero">
      <div className="page-hero-bg" aria-hidden="true" />
      <div className={'wrap' + (art ? ' ph-grid' : '')}>
        <div className="ph-copy">
          <Reveal as="span" className="eyebrow"><span className="bar" />{eyebrow}</Reveal>
          <h1><BlurText trigger="mount" text={title} /></h1>
          <Reveal as="p" delay={350}>{sub}</Reveal>
        </div>
        {art && <PostStamp {...art} />}
      </div>
    </section>
  );
}

function QA({ items }) {
  return (
    <section className="section qa-sec"><div className="wrap qa-list">
      {items.map(([q, a, ic], i) => (
        <Reveal key={i} delay={i * 80}>
          <SpotlightCard className="qa">
            <h3><span className="qa-n" aria-hidden="true"><Icon name={ic || 'stamp'} /></span>{q}</h3>
            <div className="qa-a">{a}</div>
          </SpotlightCard>
        </Reveal>
      ))}
    </div></section>
  );
}

const STEPS = [
  ['تشخیص زبان', 'فارسی، انگلیسی، فینگیلیش یا ترکیبی.', 'lang'],
  ['پرسش از مدل‌ها', 'فقط مدل‌های مرتبط با آن زبان نظر می‌دهند.', 'layers'],
  ['رأی‌گیری', 'آستانه‌ها کنار هم؛ اجماع تصمیم می‌گیرد.', 'pulse'],
  ['مُهر نهایی', 'حکم، اطمینان، دلیل و ریزنمره‌ها.', 'stamp']
];

export function How({ root }) {
  return (
    <>
      <PageHero eyebrow="فرآیند" title="از متن تا مُهر، چهار مرحله." sub="معمولاً در کمتر از چند ثانیه؛ هر مرحله را در پنل هم زنده می‌بینی."
        art={{ icon: 'layers', word: 'فرآیند', code: '4 STEPS · 5 VOTES' }} />
      <section className="section steps-sec"><div className="wrap">
        <div className="steps-wrap">
          <ScrollLine />
          <ol className="steps">
            {STEPS.map(([b, s, ic], i) => (
              <Reveal as="li" key={i} delay={i * 90}>
                <span className="step-dot"><Icon name={ic} /></span>
                <span className="step-n mono" aria-hidden="true">{'0' + (i + 1)}</span>
                <b>{b}</b><span className="step-s">{s}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </div></section>
      <section className="section band"><div className="wrap">
        <div className="sec-head"><Reveal as="span" className="eyebrow"><span className="bar" />سه حکم</Reveal><Reveal as="h2" className="h2">هر پاسخ یکی از این سه مُهر را دارد.</Reveal></div>
        <div className="legend">
          {[['safe', 'ایمن', 'هیچ مدلی آن را سمی نمی‌داند.', 0], ['suspect', 'مشکوک', 'یک رأی یا نمره‌ی مرزی؛ یک نگاه دوم بینداز.', 180], ['toxic', 'سمی', 'دست‌کم دو مدل هم‌نظرند.', 360]].map(([k, w, d, dl]) => (
            <Reveal key={k} className={'legend-card ' + k} delay={dl}>
              <StampIn kind={k} delay={dl + 200}>{w}</StampIn>
              <p>{d}</p>
            </Reveal>
          ))}
        </div>
      </div></section>
      <section className="section"><div className="wrap">
        <div className="sec-head"><Reveal as="span" className="eyebrow"><span className="bar" />جدول تصمیم</Reveal><Reveal as="h2" className="h2">قانون‌ها، دقیق.</Reveal></div>
        <Reveal className="table-wrap"><table className="dtable">
          <thead><tr><th>شرط</th><th>حکم</th></tr></thead>
          <tbody>
            <tr><td>دو مدل یا بیشتر نمره‌ی <span className="inline-code">≥ 0.50</span></td><td><span className="tag toxic">TOXIC</span></td></tr>
            <tr><td>یک مدل <span className="inline-code">≥ 0.90</span> و مدل دوم <span className="inline-code">≥ 0.30</span></td><td><span className="tag toxic">TOXIC</span></td></tr>
            <tr><td>یک مدل <span className="inline-code">≥ 0.90</span> و مدل دوم بین <span className="inline-code">0.10</span> و <span className="inline-code">0.30</span></td><td><span className="tag suspect">SUSPECT</span></td></tr>
            <tr><td>یک رأی و بیشترین نمره <span className="inline-code">≥ 0.60</span></td><td><span className="tag suspect">SUSPECT</span></td></tr>
            <tr><td>رأی‌ها فقط از یک خانواده‌ی مدل و متخصص زبان مخالف</td><td>سه رأی لازم است</td></tr>
            <tr><td>بقیه‌ی حالت‌ها</td><td><span className="tag safe">SAFE</span></td></tr>
          </tbody>
        </table></Reveal>
        <p className="muted-note">برای فینگیلیش، نسخه‌ی فارسی‌شده هم بررسی می‌شود و حکم بدتر می‌ماند؛ آنجا یک مدل تنها به <span className="inline-code">0.95</span> نیاز دارد.</p>
        <a className="btn btn-line" href={href(root, 'api/#ep-config')}><Icon name="code" /><span>همین جدول از API</span></a>
      </div></section>
    </>
  );
}

export function About({ root }) {
  return (
    <>
      <PageHero eyebrow="درباره" title="یک نگهبان کوچک برای گفت‌وگوی سالم‌تر." sub="پروژه‌ای مستقل از موویکسو."
        art={{ icon: 'shield', word: 'نگهبان', code: 'BY MUVIXO' }} />
      <QA items={[
        ['چرا ساخته شد؟', <><p>تصمیم درباره‌ی یک متن نباید دست یک مدل یا یک نمره باشد. Unicollect چند دیدگاه را کنار هم می‌گذارد و نتیجه را قابل فهم نگه می‌دارد.</p><p>جای قضاوت انسان را نمی‌گیرد؛ یک نگاه دوم است.</p></>, 'info'],
        ['برای چه کسی؟', <p>برای هرکسی که قبل از فرستادن پیام می‌خواهد بداند لحنش چطور خوانده می‌شود، و برای تیم‌هایی که یک لایه‌ی بررسی شفاف در محصولشان می‌خواهند.</p>, 'smile'],
        ['چطور وصلش کنم؟', <><p>با API نسخه‌ی ۱. یک درخواست <span className="inline-code">POST</span> کافی است.</p><a className="btn btn-ink btn-sm" href={href(root, 'api/')}><Icon name="code" /><span>مستندات API</span></a></>, 'code'],
        ['چه کسی پشتش است؟', <p>موویکسو، که Unicollect را می‌سازد و نگه می‌دارد.</p>, 'stamp']
      ]} />
    </>
  );
}

export function Privacy() {
  return (
    <>
      <PageHero eyebrow="حریم خصوصی" title="متن تو، برای تصمیم تو." sub="فقط همان متنی که می‌فرستی تحلیل می‌شود."
        art={{ icon: 'lock', word: 'محرمانه', code: 'RAM ONLY · NO DISK' }} />
      <QA items={[
        ['چه چیزی بررسی می‌شود؟', <p>فقط متنی که خودت وارد می‌کنی یا از API می‌فرستی. نه فایل، نه مخاطب، نه چیز دیگری از دستگاهت.</p>, 'search'],
        ['متن ذخیره می‌شود؟', <p>روی سرور فقط یک حافظه‌ی موقت در RAM برای پاسخ سریع‌تر به متن تکراری نگه داشته می‌شود و با هر راه‌اندازی دوباره پاک می‌شود. چیزی در دیسک یا پایگاه‌داده نوشته نمی‌شود.</p>, 'eyeoff'],
        ['تاریخچه‌ی پنل کجاست؟', <p>گفت‌وگوهای پنل در حافظه‌ی همین مرورگر (localStorage) می‌مانند و از تنظیمات پنل پاک می‌شوند.</p>, 'panel'],
        ['لینک سرویس چرا عوض می‌شود؟', <p>سرویس روی تونل موقت اجرا می‌شود و هر بار لینک تازه می‌گیرد. لینک فعلی همیشه در صفحه‌ی API و در <span className="inline-code">api/links.json</span> هست.</p>, 'link']
      ]} />
    </>
  );
}

const GUESS = [[/^(api\/)?v1|^docs|^redoc|^openapi/, 'service'], [/api|endpoint|doc|swagger/, 'api/'], [/chat|goftego|panel|talk/, 'chat/'],
  [/how|work|process|farayand/, 'how-it-works/'], [/about|darbare/, 'about/'], [/priv|harim/, 'privacy/']];

export function NotFound({ root }) {
  const L = useLive();
  const [path, setPath] = useState('');
  const [guess, setGuess] = useState(null);
  useEffect(() => {
    const base = document.querySelector('base');
    const rootPath = base ? new URL(base.href).pathname : '/';
    const full = location.pathname + location.search;
    const rel = full.indexOf(rootPath) === 0 ? full.slice(rootPath.length) : full.replace(/^\//, '');
    setPath('/' + rel);
    const low = rel.toLowerCase();
    const g = GUESS.find(([re]) => re.test(low));
    if (g) setGuess({ to: g[1], rel });
  }, []);
  return (
    <section className="nf">
      <div className="wrap nf-wrap">
        <div className="nf-stamp" aria-hidden="true">
          <b><DecryptedText text="۴۰۴" start="mount" speed={60} /></b><small>NOT FOUND</small>
        </div>
        <div className="nf-copy">
          <span className="eyebrow"><span className="bar" />خطای ۴۰۴</span>
          <h1 className="display"><BlurText trigger="mount" parts={[{ t: 'این نامه ' }, { t: 'مُهر', em: true }, { t: ' نخورد.' }]} /></h1>
          <p className="lead">صفحه‌ای با این نشانی نداریم: <code className="inline-code ltr">{path}</code></p>
          {guess && (
            <p className="nf-guess">
              {guess.to === 'service'
                ? (L.url ? <>این مسیر مال سرویس زنده است: <a className="inline-code" target="_blank" rel="noopener" href={L.url + '/' + (/^v1/.test(guess.rel) ? 'api/' + guess.rel : guess.rel)}>{'/' + guess.rel}</a></> : 'این مسیر روی سرویس زنده است که الان آفلاین است.')
                : <>شاید دنبال <a className="inline-code" href={href(root, guess.to)}>{guess.to}</a> بودی؟</>}
            </p>
          )}
          <div className="cta">
            <a className="btn btn-ink" href={href(root, '')}><Icon name="home" /><span>صفحه اصلی</span></a>
            <a className="btn btn-line" href={href(root, 'api/')}><Icon name="code" /><span>مستندات API</span></a>
            <LiveLink k="panel" className="btn btn-line"><Icon name="external" /><span>{L.url ? 'باز کردن پنل' : 'پنل فعلاً آفلاین است'}</span></LiveLink>
          </div>
        </div>
      </div>
    </section>
  );
}
