import { useState } from 'react';
import { Icon } from '../../shared/icons.jsx';
import Reveal from '../../shared/fx/Reveal.jsx';
import { BlurText, CountUp } from '../../shared/fx/text.jsx';
import { Magnet, SpotlightCard, Tilt } from '../../shared/fx/interact.jsx';
import { ScrollInk, VelocityMarquee, VoteOrbit } from '../../shared/fx/motion-fx.jsx';
import { copyText } from '../../shared/util.js';
import { useToast } from '../../shared/chat/Toast.jsx';
import { LiveLink, PLACEHOLDER, useLive } from '../live.jsx';
import { href } from '../Layout.jsx';
import Desk from '../Desk.jsx';

const STRIP_A = [
  ['safe', 'ممنون از وقتی که گذاشتی'], ['toxic', 'خفه شو احمق'], ['safe', 'have a lovely weekend'], ['suspect', 'دیگه داری شورشو درمیاری'],
  ['safe', 'salam khoobi?'], ['toxic', 'you are useless'], ['safe', 'جلسه ساعت ۵ خوبه؟'], ['suspect', 'this is the last time']
];
const STRIP_B = [
  ['toxic', 'k.i.r'], ['safe', 'mersi azizam'], ['suspect', 'حواست کجاست؟'], ['safe', 'great job team'],
  ['toxic', 'to khar hasti'], ['safe', 'روزت بخیر'], ['suspect', 'shut it'], ['safe', 'merci, kheili khoob bood']
];
const W = { safe: 'ایمن', suspect: 'مشکوک', toxic: 'سمی' };

function Strip({ items }) {
  return items.map(([v, t], i) => (
    <span key={i} className={'strip-item ' + v}>
      <span className="si-text" dir="auto">{t}</span><span className={'mini-stamp sm ' + v + ' in'}>{W[v]}</span>
    </span>
  ));
}

const CODE = {
  curl: base => [
    'curl -X POST ', ['u', base], '/api/v1/check \\\n  -H ', ['s', '"Content-Type: application/json"'], ' \\\n  -d ', ['s', `'{"text": "to khar hasti"}'`], '\n\n',
    ['c', '# response'], '\n{\n  ', ['p', '"decision"'], ': ', ['s', '"TOXIC"'], ',\n  ', ['p', '"confidence"'], ': ', ['n', '0.91'], ',\n  ',
    ['p', '"votes_count"'], ': ', ['n', '3'], ',\n  ', ['p', '"fingilish_text"'], ': ', ['s', '"تو خر هستی"'], ',\n  ', ['p', '"reason"'], ': ', ['s', '"3 of 4 models voted toxic"'], '\n}'
  ],
  JavaScript: base => [
    ['k', 'const'], ' r = ', ['k', 'await'], ' fetch(', ['s', `"${base}/api/v1/check"`], ', {\n  method: ', ['s', '"POST"'], ',\n  headers: { ', ['s', '"Content-Type"'], ': ', ['s', '"application/json"'],
    ' },\n  body: JSON.stringify({ text: ', ['s', '"to khar hasti"'], ' })\n});\n', ['k', 'const'], ' { decision } = ', ['k', 'await'], ' r.json();  ', ['c', '// "TOXIC"']
  ],
  Python: base => [
    ['k', 'import'], ' requests\n\nr = requests.post(', ['s', `"${base}/api/v1/check"`], ',\n                  json={', ['s', '"text"'], ': ', ['s', '"to khar hasti"'], '})\n', ['k', 'print'], '(r.json()[', ['s', '"decision"'], '])  ', ['c', '# TOXIC']
  ]
};
const plain = parts => parts.map(p => (typeof p === 'string' ? p : p[1])).join('');

function CodeTeaser() {
  const L = useLive();
  const toast = useToast();
  const [tab, setTab] = useState('curl');
  const base = L.url || PLACEHOLDER;
  const parts = CODE[tab](base);
  return (
    <div className="code">
      <div className="code-bar" role="tablist">
        {Object.keys(CODE).map(k => <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{k}</button>)}
        <button className="copy" type="button" onClick={() => copyText(plain(parts)).then(() => toast('کپی شد'))}><Icon name="copy" /><span>کپی</span></button>
      </div>
      <pre><code>{parts.map((p, i) => (typeof p === 'string' ? p : <span key={i} className={p[0] === 'u' ? 'base-url' : 'tok-' + p[0]}>{p[1]}</span>))}</code></pre>
    </div>
  );
}

export default function Home({ root }) {
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="hero-copy">
            <Reveal as="span" className="eyebrow"><span className="bar" />نگهبان متن فارسی، فینگیلیش و انگلیسی</Reveal>
            <h1 className="display">
              <BlurText trigger="mount" parts={[{ t: 'قبل از ارسال، ' }, { t: 'مُهر', em: true }, { t: ' بگیر.' }]} />
            </h1>
            <Reveal as="p" className="lead" delay={500}>پنج مدل متن را جداگانه می‌خوانند و با رأی‌گیری یک حکم روشن می‌دهند: ایمن، مشکوک یا سمی.</Reveal>
            <Reveal className="cta" delay={650}>
              <Magnet><a className="btn btn-ink btn-lg" data-cursor="بزن بریم" href={href(root, 'chat/')}><Icon name="msg" /><span>شروع چت</span></a></Magnet>
              <Magnet strength={.18}><a className="btn btn-line btn-lg" href={href(root, 'api/')}><Icon name="code" /><span>مستندات API</span></a></Magnet>
            </Reveal>
            <Reveal className="meta-row" delay={800}>
              <span><b><CountUp to={5} /></b> مدل رأی‌دهنده</span>
              <span><b><CountUp to={3} /></b> زبان</span>
              <span><b><CountUp to={22} /></b> مسیر API</span>
              <LiveLink k="panel" className="meta-link"><span>باز کردن پنل زنده</span><Icon name="external" /></LiveLink>
            </Reveal>
          </div>
          <Reveal className="hero-desk" delay={300}><Desk root={root} /></Reveal>
        </div>
      </section>

      <section className="strips" aria-label="نمونه‌ی حکم‌ها">
        <VelocityMarquee base={34}><Strip items={STRIP_A} /></VelocityMarquee>
        <VelocityMarquee base={28} reverse><Strip items={STRIP_B} /></VelocityMarquee>
      </section>

      <section className="section band">
        <div className="wrap">
          <div className="sec-head">
            <Reveal as="span" className="eyebrow"><span className="bar" />چرا قابل اعتماد است</Reveal>
            <ScrollInk as="h2" className="manifesto" text="یک مدل اشتباه کند، حکم عوض نمی‌شود. پنج نظر، یک مُهر." />
          </div>
          <div className="pillars">
            <Reveal className="pillar-main">
              <Tilt className="card feature spotlight-wrap" max={3}>
                <SpotlightCard className="feature-in">
                  <div className="feature-text">
                    <span className="glyph"><Icon name="layers" /></span>
                    <h3>رأی اجماعی</h3>
                    <p>هیچ مدلی به‌تنهایی نمی‌تواند متنی را سمی اعلام کند؛ دست‌کم یک مدل دیگر باید تأیید کند.</p>
                    <div className="big mono" dir="ltr"><span>5</span><i aria-hidden="true" /><span>1</span></div>
                    <span className="big-cap">پنج رأی مستقل، یک حکم</span>
                  </div>
                  <VoteOrbit />
                </SpotlightCard>
              </Tilt>
            </Reveal>
            <Reveal className="pillar-side" delay={120}><SpotlightCard className="card"><span className="glyph"><Icon name="lang" /></span><h3>ساخته برای فارسی</h3><p>فینگیلیش به فارسی برگردانده و دوباره بررسی می‌شود؛ <span className="inline-code">k1r</span> و <span className="inline-code">k.i.r</span> هم لو می‌روند.</p></SpotlightCard></Reveal>
            <Reveal className="pillar-side" delay={220}><SpotlightCard className="card"><span className="glyph"><Icon name="pulse" /></span><h3>شفاف</h3><p>نمره‌ی هر مدل، تعداد رأی‌ها و دلیل حکم در هر پاسخ هست؛ مراحل فکر کردن هم جلوی چشمت.</p></SpotlightCard></Reveal>
          </div>
        </div>
      </section>

      <section className="section api-sec">
        <div className="wrap api-teaser">
          <Reveal>
            <div className="v1">API v1</div>
            <h2 className="h2">نگهبان را به محصول خودت وصل کن.</h2>
            <ul className="bullets">
              <li>بررسی تکی و دسته‌ای تا ۳۲ متن</li>
              <li>سانسور خودکار و حکم جمله‌به‌جمله</li>
              <li>سازگار با Moderation API اوپن‌ای‌آی</li>
              <li>لینک زنده همیشه در <span className="inline-code">api/links.json</span></li>
            </ul>
            <a className="btn btn-ink" href={href(root, 'api/')}><Icon name="arrowL" /><span>دیدن همه‌ی مسیرها</span></a>
          </Reveal>
          <Reveal delay={150}><CodeTeaser /></Reveal>
        </div>
      </section>

      <section className="section closing">
        <div className="wrap">
          <Reveal className="closing-card">
            <h2 className="h2"><BlurText parts={[{ t: 'متن بعدی‌ات را ' }, { t: 'مُهر', em: true }, { t: ' بزن.' }]} /></h2>
            <p>رایگان، بدون ثبت‌نام، همین حالا.</p>
            <Magnet><a className="btn btn-ink btn-lg" data-cursor="مُهر بزن" href={href(root, 'chat/')}><Icon name="stamp" /><span>باز کردن چت نگهبان</span></a></Magnet>
          </Reveal>
        </div>
      </section>
    </>
  );
}
