// Turns a Guard answer into the "thinking steps" shown under the verdict:
// what was read, which language, how many models answered, the vote, the stamp.
import { fa, faDigits, num } from '../shared/util.js';

export const GUARD_STEPS = ['خواندن متن', 'تشخیص زبان و فینگیلیش', 'پرسش از پنج مدل', 'رأی‌گیری اجماعی', 'زدن مُهر'];
export const GUARD_HOLD = 2;        // park on "asking the models" until the answer is in

const SCRIPT = { fa: 'فارسی', en: 'انگلیسی', mixed: 'ترکیبی' };
const WORD = { TOXIC: 'سمی', SUSPECT: 'مشکوک', SAFE: 'ایمن' };
const pct = v => faDigits((num(v) * 100).toFixed(0)) + '٪';

export function guardSteps(text, r, durations = []) {
  const ms = i => (durations[i] > 0 ? Math.round(durations[i]) : undefined);
  const chars = Array.from(text || '').length;
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
  const read = { label: GUARD_STEPS[0], detail: `${fa(chars)} نویسه · ${fa(words)} واژه`, ms: ms(0) };
  if (!r || r.error) {
    return [read, { label: 'پاسخ سرویس', detail: String(r && r.error ? r.error : 'پاسخی نرسید'), state: 'error', ms: ms(1) }];
  }
  const lang = r.fingilish_detected && r.fingilish_text
    ? `فینگیلیش ← «${String(r.fingilish_text).slice(0, 60)}»`
    : `زبان: ${SCRIPT[r.script] || 'خودکار'}`;
  const raw = r.raw_scores || {};
  const answered = Object.keys(raw).length;
  const skipped = (r.skipped_models || []).length;
  const top = Object.entries(raw).sort((a, b) => b[1] - a[1])[0];
  const labels = r.labels || {};
  const models = `${fa(answered)} مدل پاسخ دادند` + (skipped ? ` · ${fa(skipped)} مدل نامرتبط کنار رفت` : '') +
    (top ? ` · بیشترین: ${labels[top[0]] || top[0]} ${pct(top[1])}` : '');
  const votes = `${fa(num(r.votes_count))} رأی سمی از ${fa(num(r.total_models, answered))} · آستانه ${faDigits(num(r.vote_threshold, .5).toFixed(2))}`;
  const stamp = `حکم: ${WORD[r.decision] || r.decision} · اطمینان ${pct(r.confidence)}` + (r.latency_ms != null ? ` · سرور ${fa(r.latency_ms)}ms` : '');
  return [
    read,
    { label: GUARD_STEPS[1], detail: lang, ms: ms(1) },
    { label: GUARD_STEPS[2], detail: models, ms: ms(2) },
    { label: GUARD_STEPS[3], detail: r.reason ? `${votes} · ${r.reason}` : votes, ms: ms(3) },
    { label: GUARD_STEPS[4], detail: stamp, ms: ms(4) }
  ];
}
