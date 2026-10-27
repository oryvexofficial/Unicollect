// <Ballot/>: the consensus as a ballot box. Five model slips, one per voter.
// Each round the slips are re-cast one after another: a toxic vote is a
// solid black slip, a clean vote stays white, and the tally card at the
// bottom stamps the verdict (2+ = toxic, 1 = suspect, 0 = safe).
// Solid inks only: black, white, pastel purple. Replaces the old VoteOrbit.
import { useEffect, useState } from 'react';
import { REDUCED } from '../util.js';
import { useInView } from '../hooks.js';

const MODELS = ['فارسی', 'پرو', 'سریع', 'گسترده', 'انگلیسی'];
const ROUNDS = [[1, 1, 0, 1, 0], [0, 0, 0, 1, 0], [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [0, 1, 0, 0, 1]];
const WORD = { toxic: 'سمی', suspect: 'مشکوک', safe: 'ایمن' };

export default function Ballot({ className = '', interval = 3400 }) {
  const [ref, inView] = useInView({ once: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!inView || REDUCED) return;
    const t = setInterval(() => setTick(k => k + 1), interval);
    return () => clearInterval(t);
  }, [inView, interval]);
  const votes = ROUNDS[tick % ROUNDS.length];
  const n = votes.reduce((a, b) => a + b, 0);
  const v = n >= 2 ? 'toxic' : n === 1 ? 'suspect' : 'safe';
  return (
    <div ref={ref} className={'ballot ' + v + ' ' + className} aria-hidden="true">
      <ol className="ballot-slips">
        {MODELS.map((m, i) => (
          <li key={i + '-' + tick} className={'slip' + (votes[i] ? ' on' : '')} style={{ '--i': i }}>
            <span className="slip-name">{m}</span>
            <span className="slip-vote">{votes[i] ? 'سمی' : 'سالم'}</span>
            <span className="slip-box"><i /></span>
          </li>
        ))}
      </ol>
      <div className="ballot-tally" key={'t' + tick}>
        <span className="tally-n mono" dir="ltr">{n}/5</span>
        <span className="tally-word">{WORD[v]}</span>
        <span className="tally-rule">{n >= 2 ? 'دو رأی یا بیشتر' : n === 1 ? 'فقط یک رأی' : 'بدون رأی سمی'}</span>
      </div>
    </div>
  );
}
