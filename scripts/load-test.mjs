#!/usr/bin/env node
// Load test: N virtual students join one battle at the same time, answer every question and
// submit — the way a real class does. Reports latency (p50/p95/max) per endpoint and errors.
//
//   node scripts/load-test.mjs [--url http://localhost:3000] [--battle demo | --code ABC234]
//        [--students 40] [--ramp 5] [--think 4000] [--same-ip] [--essays] [--fast]
//
//  --same-ip   every student behind ONE IP (school Wi-Fi / NAT) instead of one IP each
//  --essays    really write essay / reading answers (calls the AI grader: uses Gemini quota)
//  --fast      no thinking time (results will be flagged as too fast — pure throughput test)
//  --no-submit play to the end but never send the final submit (students who close the tab):
//              the server's retry queue must still save these results
// The demo battle ("--battle demo", default) keeps sessions in memory and is never saved.

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const URL_ = String(opt('url', 'http://localhost:3000')).replace(/\/$/, '');
const STUDENTS = Number(opt('students', 40));
const RAMP_S = Number(opt('ramp', 5));
const THINK = opt('fast', false) ? 0 : Number(opt('think', 4000));
const SAME_IP = !!opt('same-ip', false);
const ESSAYS = !!opt('essays', false);
const CODE = opt('code', null);
const BATTLE = String(opt('battle', 'demo'));
const NO_SUBMIT = !!opt('no-submit', false);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = new Map(); // endpoint → { ms: [], codes: Map }
function record(name, ms, status) {
  const s = stats.get(name) ?? { ms: [], codes: new Map() };
  s.ms.push(ms);
  s.codes.set(status, (s.codes.get(status) ?? 0) + 1);
  stats.set(name, s);
}

async function call(name, path, { method = 'GET', body, token, ip } = {}) {
  const t = performance.now();
  let status = 0;
  let data = null;
  try {
    const res = await fetch(`${URL_}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': ip,
        ...(token ? { 'x-battle-session': token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    data = await res.json().catch(() => null);
  } catch {
    status = 0;
  }
  record(name, performance.now() - t, status);
  return { status, data };
}

const ESSAY = 'In my opinion, learning English with games is very useful for students because it keeps them motivated. ' +
  'When lessons feel like a challenge, we practise more often and remember new words longer. ' +
  'However, teachers should still explain grammar clearly, so that games support real understanding instead of guessing.';

function answerFor(q) {
  if (q.type === 'mcq') return { chosenIdx: Math.floor(Math.random() * Math.max(1, q.options.length)) };
  if ((q.type === 'essay' || q.type === 'reading') && ESSAYS) return { response: ESSAY };
  if (q.type === 'cloze') return { response: Array.from({ length: q.gapCount ?? 1 }, () => 'was') };
  if (q.type === 'transform') return { response: 'The letter was written by Tom.' };
  if (q.type === 'reorder') return { response: (q.chips ?? []).map((c) => c.id) };
  return { chosenIdx: -1 }; // matching / unwritten essays: let the question time out
}

async function student(n) {
  const ip = SAME_IP ? '198.18.0.1' : `198.18.${Math.floor(n / 250)}.${(n % 250) + 1}`;
  let battleId = BATTLE;
  if (CODE) {
    const r = await call('GET /api/battles?code', `/api/battles?code=${encodeURIComponent(CODE)}`, { ip });
    if (r.status !== 200) return { n, ok: false, stage: 'lookup', status: r.status };
    battleId = r.data.battle_id ?? r.data.id;
  }
  const start = await call('POST /api/session', '/api/session', { method: 'POST', ip, body: { battleId, variant: null, nickname: `Load${n}`, avatar: '🐣', studentKey: `load-${n}-${Date.now()}` } });
  if (start.status !== 200) return { n, ok: false, stage: 'start', status: start.status };
  const token = start.data.token;
  let q = start.data.view.question;
  let answered = 0;
  while (q) {
    const words = ESSAYS && (q.type === 'essay' || q.type === 'reading') ? ESSAY.split(' ').length : 0;
    await sleep(THINK ? THINK * (0.7 + Math.random() * 0.6) + words * 220 : 0);
    const r = await call(`POST /api/session/answer (${q.type})`, '/api/session/answer', { method: 'POST', token, ip, body: { questionId: q.id, ...answerFor(q) } });
    if (r.status !== 200) return { n, ok: false, stage: `answer ${answered + 1}`, status: r.status };
    answered += 1;
    q = r.data.view.question;
    if (q && THINK) await sleep(1200); // the answer feedback the student reads
  }
  if (NO_SUBMIT) return { n, ok: true, stage: 'closed tab', status: 0, answered };
  const fin = await call('POST /api/battle-result', '/api/battle-result', { method: 'POST', token, ip, body: {} });
  const ok = fin.status === 200 || fin.status === 422;
  return { n, ok, stage: 'finalize', status: fin.status, saved: fin.data?.saved, pending: fin.data?.pending, flagged: fin.data?.flagged, answered };
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

console.log(`Load test → ${URL_} · ${CODE ? `code ${CODE}` : `battle ${BATTLE}`} · ${STUDENTS} students over ${RAMP_S}s · ${SAME_IP ? 'ONE shared IP (school Wi-Fi)' : 'one IP each'} · think ${THINK}ms${ESSAYS ? ' · AI-graded essays' : ''}`);
const t0 = performance.now();
const results = await Promise.all(Array.from({ length: STUDENTS }, async (_, n) => {
  await sleep((RAMP_S * 1000 * n) / Math.max(1, STUDENTS));
  return student(n).catch((e) => ({ n, ok: false, stage: 'crash', status: String(e) }));
}));
const secs = (performance.now() - t0) / 1000;

console.log('\nendpoint'.padEnd(46) + 'calls   p50ms   p95ms   maxms   status codes');
let calls = 0;
for (const [name, s] of [...stats].sort()) {
  calls += s.ms.length;
  const codes = [...s.codes].map(([c, k]) => `${c}×${k}`).join(' ');
  console.log(`${name.padEnd(45)} ${String(s.ms.length).padStart(5)} ${pct(s.ms, 50).toFixed(0).padStart(7)} ${pct(s.ms, 95).toFixed(0).padStart(7)} ${Math.max(...s.ms).toFixed(0).padStart(7)}   ${codes}`);
}
const ok = results.filter((r) => r.ok);
const failed = results.filter((r) => !r.ok);
console.log(`\n${ok.length}/${STUDENTS} students finished · ${calls} requests in ${secs.toFixed(1)}s (${(calls / secs).toFixed(1)} req/s)`);
if (NO_SUBMIT) console.log(`${ok.length} students closed the tab before submitting — check that the server saves them (retry queue).`);
else console.log(`results: saved ${ok.filter((r) => r.saved).length} · pending (queued) ${ok.filter((r) => r.pending).length} · flagged ${ok.filter((r) => r.flagged).length} · not stored (demo) ${ok.filter((r) => !r.saved && !r.pending && !r.flagged).length}`);
if (failed.length) {
  const byStage = new Map();
  for (const f of failed) byStage.set(`${f.stage} → ${f.status}`, (byStage.get(`${f.stage} → ${f.status}`) ?? 0) + 1);
  console.log('failures:', [...byStage].map(([k, v]) => `${k} ×${v}`).join(' · '));
}
process.exit(failed.length ? 1 : 0);
