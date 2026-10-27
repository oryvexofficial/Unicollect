/* Zero-dependency dev server with a fake backend, for working on the UI
   without torch/models/Ollama:

     node build.mjs --watch      (terminal 1)
     node dev-server.mjs         (terminal 2)

     http://localhost:5173/          Guard panel   (local mode, fake /api/check)
     http://localhost:5173/site/     public site   (served like the service does)
     http://localhost:5174/          Unicollect Chat (fake streaming replies)
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const json = (res, code, obj, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Request-ID': 'req_' + Math.random().toString(16).slice(2, 10), 'X-RateLimit-Remaining': '119', ...headers }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch (e) { r({}); } }); });
function serveFile(res, file, html) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (fs.existsSync(path.join(file, 'index.html'))) file = path.join(file, 'index.html'); else return false;
  }
  let data = fs.readFileSync(file);
  if (html) data = Buffer.from(String(data).replace(/__V__/g, 'dev').replace(/__PAGES_BASE__/g, '/site/'));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(data);
  return true;
}

const MODELS = { persian: 'Persian Offensive', textdetox_lg: 'TextDetox XLM-R (large)', textdetox_sm: 'TextDetox XLM-R (base)', multilingual: 'Multilingual Toxic XLM-R', twitter_off: 'Twitter RoBERTa Offensive' };
const BAD = /(khar|ahmagh|stupid|idiot|useless|kir|k1r|احمق|خر|خفه)/i;
function fakeCheck(text) {
  const bad = BAD.test(text), fing = /^[a-z0-9\s?!.,']+$/i.test(text) && /(salam|khoob|khar|ahmagh|khafe|hasti|mersi|kir)/i.test(text);
  const base = bad ? .82 : .04;
  const raw = {}; const votes = {}; const weights = {};
  Object.keys(MODELS).forEach((k, i) => { const v = Math.max(0, Math.min(.99, base + (Math.sin(text.length * (i + 1)) * (bad ? .15 : .03)))); raw[k] = +v.toFixed(3); votes[k] = v >= .5; weights[k] = k === 'persian' ? 1.5 : 1; });
  const vc = Object.values(votes).filter(Boolean).length;
  const decision = vc >= 2 ? 'TOXIC' : vc === 1 ? 'SUSPECT' : 'SAFE';
  const sorted = Object.values(raw).sort((a, b) => b - a);
  return {
    decision, is_toxic: decision === 'TOXIC', confidence: +((sorted[0] + sorted[1]) / 2).toFixed(3), max_raw: sorted[0], votes_count: vc, total_models: 5,
    vote_threshold: .5, raw_scores: raw, votes, weights, labels: MODELS, script: /[\u0600-\u06FF]/.test(text) ? 'fa' : 'en', latency_ms: 180 + (text.length % 90),
    fingilish_detected: fing, fingilish_text: fing ? text.replace(/salam/gi, 'سلام').replace(/khoobi/gi, 'خوبی').replace(/khafe sho/gi, 'خفه شو').replace(/ahmagh/gi, 'احمق').replace(/to /gi, 'تو ').replace(/khar/gi, 'خر').replace(/hasti/gi, 'هستی') : null,
    analysis: fing ? { original: { decision: bad ? 'SUSPECT' : 'SAFE' }, fingilish: { decision } } : undefined,
    skipped_models: /[\u0600-\u06FF]/.test(text) ? ['twitter_off'] : [], reason: `${vc} of 5 models voted toxic`
  };
}

async function guard(req, res, url) {
  const p = url.pathname;
  if (p === '/health' || p === '/api/v1/health') return json(res, 200, { status: 'ok', mode: 'demo', version: 'dev', loaded_models: Object.values(MODELS), errors: {}, inflight: 0, peak: 2, concurrency: 4 });
  if ((p === '/api/check' || p === '/api/v1/check') && req.method === 'POST') { const b = await body(req); await new Promise(r => setTimeout(r, 450)); return json(res, 200, fakeCheck(b.text || '')); }
  if (p === '/api/v1/check' && req.method === 'GET') return json(res, 200, fakeCheck(url.searchParams.get('text') || ''));
  if (p === '/api/v1/censor') { const b = await body(req); const t = String(b.text || '').replace(new RegExp(BAD.source, 'gi'), m => '*'.repeat(m.length)); return json(res, 200, { text: t, masked_count: (String(b.text).match(new RegExp(BAD.source, 'gi')) || []).length, mode: b.mode || 'words' }); }
  if (p.startsWith('/api/v1')) return json(res, 200, { ok: true, path: p, note: 'dev-server fake response' });
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return res.end(); }
  if (await guard(req, res, url) !== null) return;
  const p = decodeURIComponent(url.pathname);
  if (p === '/' ) return serveFile(res, path.join(ROOT, 'app/static/index.html'), true);
  if (p.startsWith('/static/') && serveFile(res, path.join(ROOT, 'app', p), false)) return;
  if (p === '/site') { res.writeHead(302, { Location: '/site/' }); return res.end(); }
  if (p.startsWith('/site/') && serveFile(res, path.join(ROOT, 'pages', p.slice(6)), p.endsWith('/') || p.endsWith('.html'))) return;
  if (p.startsWith('/site/')) { res.statusCode = 404; return serveFile(res, path.join(ROOT, 'pages/404.html'), true); }
  json(res, 404, { error: { code: 'not_found', message: 'no route', status: 404 } });
}).listen(5173, () => console.log('guard  http://localhost:5173/   site http://localhost:5173/site/'));

const REPLY = 'سلام! من **Unicollect** هستم، دستیار گفتگومحوری که موویکسو ساخته.\n\nمی‌توانم کمکت کنم:\n\n- متن بنویسی یا خلاصه کنی\n- مفاهیم را ساده توضیح بدهم\n- ترجمه کنم\n\nیک فرمول کوچک هم: $E = mc^2$ و\n\n$$\\int_0^1 x^2\\,dx = \\tfrac{1}{3}$$\n\n| زبان | پشتیبانی |\n|---|---|\n| فارسی | کامل |\n| English | full |\n\nامروز از کجا شروع کنیم؟';
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') return json(res, 200, { status: 'ok', model: 'Qwen2.5-7B-Instruct (dev)', error: null });
  if (url.pathname === '/api/chat/stream' && req.method === 'POST') {
    await body(req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' });
    await new Promise(r => setTimeout(r, 900));
    const parts = REPLY.match(/\S+\s*|\s+/g);
    for (const t of parts) { res.write(`data: ${JSON.stringify({ t })}\n\n`); await new Promise(r => setTimeout(r, 35)); }
    res.end('data: [DONE]\n\n');
    return;
  }
  const p = decodeURIComponent(url.pathname);
  if (p === '/') return serveFile(res, path.join(ROOT, 'app/chat_static/index.html'), true);
  if (p.startsWith('/static/') && serveFile(res, path.join(ROOT, 'app/chat_static', p.slice(8)), false)) return;
  json(res, 404, { error: 'not found' });
}).listen(5174, () => console.log('chat   http://localhost:5174/'));
