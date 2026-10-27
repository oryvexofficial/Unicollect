// Welcome hero: petal mark that pops in, a greeting by the hour and a prompt
// drawn from a shuffled bag (never the same twice in a row).
import { useEffect, useRef, useState } from 'react';
import PetalMark from '../PetalMark.jsx';
import { RotatingText } from '../fx/text.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'صبحت بخیر';
  if (h >= 12 && h < 16) return 'ظهرت بخیر';
  if (h >= 16 && h < 19) return 'عصرت بخیر';
  return 'شبت بخیر';
}

export function useHeroLines(pool, deps = []) {
  const bag = useRef([]);
  const last = useRef('');
  const pop = () => {
    if (!bag.current.length) {
      bag.current = pool.slice();
      for (let i = bag.current.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag.current[i], bag.current[j]] = [bag.current[j], bag.current[i]]; }
    }
    const b = bag.current;
    if (b.length > 1 && b[b.length - 1] === last.current) [b[b.length - 1], b[b.length - 2]] = [b[b.length - 2], b[b.length - 1]];
    last.current = b.pop();
    return last.current;
  };
  const [lines, setLines] = useState({ g: 'وقت بخیر', p: pool[0] });
  const refresh = () => setLines({ g: greeting(), p: pop() });
  useEffect(() => {
    refresh();
    const vis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, deps);
  return lines;
}

export function Hero({ greeting: g, prompt }) {
  return (
    <h1 className="hero">
      <span className="hero-mark"><PetalMark mode="intro" /></span>
      <span className="hero-greeting"><RotatingText value={g} /></span>
      <span className="hero-prompt"><RotatingText value={prompt} /></span>
    </h1>
  );
}
