#!/usr/bin/env node
// Live attack checks against a running TutorCraft server (default http://localhost:3000).
// Usage: npm run test:security [-- http://host:port]
// Uses the built-in demo battle, so no database rows are created.
import { readFileSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const H = 'x-battle-session';
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keysOf = (v, out = new Set()) => {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysOf(x, out);
    }
  }
  return out;
};
// Answer-key fields that must never appear in what a student's browser receives.
const SECRET_KEYS = ['correct_idx', 'correctIdx', 'explanation', 'pairs', 'answers', 'tokens', 'key_phrases', 'key_points', 'sample_answer', 'rubric', 'deep_insight', 'gaps', 'word_bank'];
// The whole view must never carry the classic key; the public QUESTION must carry none of the
// answer-key fields (state.answers is the student's own answer log, so it isn't scanned for "answers").
const leaksAnswers = (view) => {
  if (!view) return false;
  const q = view.question ?? (view.type ? view : null);
  return ['correct_idx', 'correctIdx', 'explanation'].some((k) => keysOf(view).has(k)) || (q ? SECRET_KEYS.some((k) => keysOf(q).has(k)) : false);
};
// Everything a student must read, in any format (mirror of engine/anticheat readableText).
const readable = (q) =>
  [q.question, ...(q.options ?? []), q.passage, q.source, q.clozeText, q.hub, ...(q.leftItems ?? []), ...(q.rightItems ?? []).map((r) => r.text), ...(q.chips ?? []).map((c) => c.text)]
    .filter(Boolean)
    .join(' ');
// Mirror of engine/anticheat minPlausibleMs (+ typing time), plus margin, to play "like a human".
const humanMs = (q, typed = 0) => Math.min(q.type === 'reading' ? 12000 : 6000, Math.max(700, 400 + readable(q).split(/\s+/).length * 60 * (q.type === 'reading' ? 1.5 : 1))) + typed * 200 + 900;
/** A plausible (not necessarily right) answer for any format. Matching gives up (keeps matched pairs). */
const payloadFor = (q, pick = 0) => {
  switch (q.type) {
    case 'essay': return { response: 'Last weekend I visited my grandparents and we cooked lunch together.' };
    case 'reading': return { response: 'Keep working hard and never give up.' };
    case 'transform': return { response: q.source ?? 'x' };
    case 'cloze': return { response: Array.from({ length: q.gapCount ?? 1 }, () => 'went') };
    case 'reorder': return { response: (q.chips ?? []).map((c) => c.id) };
    case 'matching': return { chosenIdx: -1 };
    default: return { chosenIdx: pick };
  }
};
const typedWords = (p) => (typeof p.response === 'string' ? p.response.split(/\s+/).length : 0);
const json = (r) => r.json().catch(() => ({}));
const post = (path, body, headers = {}) =>
  fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
// Each scenario uses its own fake client IP so per-IP limits don't interfere.
let ipN = 10;
const ip = () => ({ 'x-forwarded-for': `203.0.113.${ipN++}` });

async function start(extra = {}) {
  const r = await post('/api/session', { battleId: 'demo', nickname: 'sec-check', avatar: '🤖', studentKey: 'sec-check' }, extra);
  return { status: r.status, ...(await json(r)) };
}

console.log(`Security checks against ${BASE}\n`);

// 1. Public battle lookup carries no questions or answers
{
  const r = await fetch(`${BASE}/api/battles?id=demo`, { headers: ip() });
  const b = await json(r);
  check('GET /api/battles exposes no questions/answers', r.ok && !leaksAnswers(b) && !('questions' in b), `keys: ${Object.keys(b).join(',')}`);
}

// 2. Session start: opaque token, first question without answer
const s1 = await start(ip());
check('POST /api/session returns sealed token', s1.status === 200 && /^v1\./.test(s1.token ?? ''));
check('session view has no correct answer / explanation', !leaksAnswers(s1.view));
check('token payload is not readable', !Buffer.from(String(s1.token).slice(3), 'base64url').toString('latin1').includes('demo'));

// 3. Tampered token
{
  const bad = String(s1.token).slice(0, -4) + 'AAAA';
  const r = await fetch(`${BASE}/api/session`, { headers: { [H]: bad, ...ip() } });
  check('tampered token rejected', r.status === 401, `status ${r.status}`);
}

// 4. Answering a question that isn't current
{
  const r = await post('/api/session/answer', { questionId: 9999, chosenIdx: 0 }, { [H]: s1.token, ...ip() });
  check('answer for non-current question rejected', r.status === 409, `status ${r.status}`);
}

// 5. Casting without earned MP
{
  const r = await post('/api/session/cast', { skill: 'shield' }, { [H]: s1.token, ...ip() });
  check('skill cast without MP rejected', r.status === 409, `status ${r.status}`);
}

// 6. Speed-hack: bot answers every question instantly
{
  const s = await start(ip());
  let q = s.view.question;
  const hdr = { [H]: s.token, ...ip() };
  while (q) {
    if (leaksAnswers(q)) check(`${q.type} question leaks its answer key`, false);
    const r = await json(await post('/api/session/answer', { questionId: q.id, ...payloadFor(q) }, hdr));
    q = r.view?.question;
  }
  const r = await post('/api/battle-result', { gems: 99999 }, hdr);
  const body = await json(r);
  check('instant answers flagged and rejected (422)', r.status === 422 && body.flagged === true, body.reasons?.[0] ?? `status ${r.status}`);
}

// 7. Human-paced run: forged score fields ignored, double submit idempotent
{
  const s = await start(ip());
  let q = s.view.question;
  const hdr = { [H]: s.token, ...ip() };
  let revealedBefore = false;
  const formats = new Set();
  while (q) {
    formats.add(q.type);
    const p = payloadFor(q, 1);
    await sleep(humanMs(q, typedWords(p)));
    const r = await json(await post('/api/session/answer', { questionId: q.id, ...p }, hdr));
    if (leaksAnswers(r.view)) revealedBefore = true;
    q = r.view?.question;
    if (q) await sleep(1450);
  }
  check('next question never leaks its answer (all formats)', !revealedBefore, [...formats].join(','));
  const r1 = await post('/api/battle-result', { gems: 99999, exp: 99999, hpRemaining: 100, correct: 6 }, hdr);
  const b1 = await json(r1);
  const r2 = await post('/api/battle-result', {}, hdr);
  const b2 = await json(r2);
  check('forged gems/EXP in body ignored', r1.ok && b1.score && b1.score.gems < 1000 && b1.score.exp < 1000, `server gems=${b1.score?.gems} exp=${b1.score?.exp}`);
  check('second submit returns the same result', r2.ok && b2.score?.gems === b1.score?.gems);
}

// 8. Cross-site POST
{
  const r = await post('/api/session', { battleId: 'demo' }, { origin: 'https://evil.example', ...ip() });
  check('cross-site POST blocked', r.status === 403, `status ${r.status}`);
}

// 9. Security headers
{
  const r = await fetch(`${BASE}/`);
  check('X-Frame-Options: DENY on pages', r.headers.get('x-frame-options') === 'DENY');
}

// 10. Supabase: anon key must not read answers directly
try {
  const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
  );
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    for (const table of ['battles', 'battle_results', 'battle_sessions']) {
      const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
      const rows = await json(r);
      check(`anon key cannot read ${table}`, !Array.isArray(rows) || rows.length === 0, Array.isArray(rows) ? `${rows.length} row(s) visible` : `status ${r.status}`);
    }
  }
} catch {
  console.log('… skipped Supabase anon check (.env.local not found)');
}

// 11. Flood: one IP hammering the scoring route (last — it throttles that IP for a minute)
{
  const flood = { 'x-forwarded-for': '203.0.113.250' };
  const statuses = await Promise.all(Array.from({ length: 30 }, () => post('/api/battle-result', {}, flood).then((r) => r.status)));
  const limited = statuses.filter((s) => s === 429).length;
  check('scoring-route flood is rate limited', limited >= 15, `${limited}/30 got 429`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
