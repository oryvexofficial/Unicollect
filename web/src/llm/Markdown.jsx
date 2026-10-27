// Markdown for chat replies: GFM (tables, lists, strikethrough), code blocks
// with a copy button, links that open in a new tab, and TeX ($...$ / $$...$$)
// shown as typeset-looking math chips (no CDN, no KaTeX bundle).
// react-markdown never renders raw HTML, so model output can't inject markup.
import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '../shared/icons.jsx';
import { copyText } from '../shared/util.js';

const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(^|[^\\$\w])\$([^\s$][^$\n]*?)\$(?!\$)/g;

// the few TeX commands models actually use, as unicode
const TEX = [
  [/\\(?:d|t)?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)'], [/\\sqrt\{([^{}]*)\}/g, '√($1)'],
  [/\\int/g, '∫'], [/\\sum/g, '∑'], [/\\prod/g, '∏'], [/\\infty/g, '∞'], [/\\pi/g, 'π'], [/\\alpha/g, 'α'], [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'], [/\\delta/g, 'δ'], [/\\theta/g, 'θ'], [/\\lambda/g, 'λ'], [/\\mu/g, 'μ'], [/\\sigma/g, 'σ'], [/\\omega/g, 'ω'],
  [/\\Delta/g, 'Δ'], [/\\times/g, '×'], [/\\cdot/g, '·'], [/\\div/g, '÷'], [/\\pm/g, '±'], [/\\leq?/g, '≤'], [/\\geq?/g, '≥'],
  [/\\neq/g, '≠'], [/\\approx/g, '≈'], [/\\to|\\rightarrow/g, '→'], [/\\Rightarrow/g, '⇒'], [/\\in/g, '∈'], [/\\forall/g, '∀'],
  [/\\exists/g, '∃'], [/\\partial/g, '∂'], [/\\nabla/g, '∇'], [/\\,|\\;|\\!|\\quad/g, ' '], [/\\left|\\right/g, ''],
  [/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1'], [/\^\{([^{}]*)\}/g, '^($1)'], [/_\{([^{}]*)\}/g, '_($1)']
];
const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', n: 'ⁿ', i: 'ⁱ', '+': '⁺', '-': '⁻' };
const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', n: 'ₙ', i: 'ᵢ' };
function tex(s) {
  let t = s.trim();
  for (const [re, to] of TEX) t = t.replace(re, to);
  t = t.replace(/\^([0-9ni+-])/g, (_, c) => SUP[c]).replace(/_([0-9ni])/g, (_, c) => SUB[c]);
  return t.replace(/[{}]/g, '');
}

/** split text into markdown chunks and math pieces */
function splitMath(text) {
  const out = []; let last = 0, m;
  MATH.lastIndex = 0;
  while ((m = MATH.exec(text))) {
    const pre = m[4] || '';
    const start = m.index + pre.length;
    if (start > last) out.push({ md: text.slice(last, start) });
    const display = m[1] != null || m[2] != null;
    out.push({ math: m[1] || m[2] || m[3] || m[5], display });
    last = MATH.lastIndex;
  }
  if (last < text.length) out.push({ md: text.slice(last) });
  return out;
}

function CodeBlock({ lang, code }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{lang || 'متن'}</span>
        <button type="button" className="code-copy" onClick={() => copyText(code).then(() => { setOk(true); setTimeout(() => setOk(false), 1400); })}>
          <Icon name={ok ? 'check' : 'copy'} /><span>{ok ? 'کپی شد' : 'کپی'}</span>
        </button>
      </div>
      <pre dir="ltr"><code>{code}</code></pre>
    </div>
  );
}

const components = {
  a: ({ node, ...p }) => <a {...p} target="_blank" rel="noopener noreferrer" />,
  table: ({ node, ...p }) => <div className="md-table"><table {...p} /></div>,
  code({ node, className, children, ...p }) {
    const text = String(children || '');
    const lang = /language-(\w+)/.exec(className || '');
    if (lang || text.includes('\n')) return <CodeBlock lang={lang ? lang[1] : ''} code={text.replace(/\n$/, '')} />;
    return <code className="inline-code" {...p}>{children}</code>;
  },
  pre: ({ children }) => <>{children}</>
};

// Inline math lives inside paragraphs, so the text is pre-processed: math is
// swapped for a private-use marker, rendered by the `text` hook below.
function Md({ text }) {
  const parts = splitMath(text || '');
  if (parts.every(p => p.md != null)) return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>;
  const inl = [];
  let src = '';
  const blocks = [];
  for (const p of parts) {
    if (p.md != null) src += p.md;
    else if (p.display) { blocks.push(src); blocks.push({ math: p.math }); src = ''; }
    else { inl.push(p.math); src += `\uE000${inl.length - 1}\uE001`; }
  }
  blocks.push(src);
  const withMath = {
    ...components,
    p: ({ node, children }) => <p>{expand(children)}</p>,
    li: ({ node, children }) => <li>{expand(children)}</li>,
    td: ({ node, children }) => <td>{expand(children)}</td>
  };
  function expand(children) {
    const arr = Array.isArray(children) ? children : [children];
    return arr.flatMap((c, ci) => {
      if (typeof c !== 'string' || !c.includes('\uE000')) return [c];
      return c.split(/(\uE000\d+\uE001)/).map((seg, i) => {
        const mm = /^\uE000(\d+)\uE001$/.exec(seg);
        return mm ? <span key={ci + '-' + i} className="math" dir="ltr">{tex(inl[+mm[1]])}</span> : seg;
      });
    });
  }
  return <>{blocks.map((b, i) => typeof b === 'string'
    ? (b.trim() ? <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={withMath}>{b}</ReactMarkdown> : null)
    : <div key={i} className="math math-block" dir="ltr">{tex(b.math)}</div>)}</>;
}

export default memo(Md);
