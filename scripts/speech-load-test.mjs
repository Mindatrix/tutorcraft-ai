#!/usr/bin/env node
// Speech load test (pronunciation layer, 03/11/2026): N virtual students in one class send voice /
// typed attempts to POST /api/session/speech at the anti-cheat rate (6 per student per minute), the
// way a class using the Phonetic Stones would. Reports latency (avg, p50, p95, p99), status codes,
// refusal reasons, rate-limit behaviour, server memory, and (optionally) what reached the database.
//
//   node scripts/speech-load-test.mjs [--url http://localhost:3000] [--students 50] [--duration 60]
//        [--rate 6] [--battle demo-kayak_rush] [--answers 4] [--probe 2] [--pid <server pid>]
//        [--distinct-ip] [--db]
//
//  --battle       demo-<game> (default demo-kayak_rush): sessions and attempts live in server memory,
//                 nothing is written to the database (the shared rate limiter still uses rate_limits).
//                 A real battle id writes real rows: only with --db, on a database you may fill.
//  --answers      questions each student answers first (each answer unlocks 1–2 speech targets).
//  --probe        extra students who send faster than the limit (one every 2 s) to check the 429.
//  --pid          server process id for memory sampling (default: found with lsof on the URL's port).
//  --distinct-ip  one IP per student (x-forwarded-for) instead of one school Wi-Fi IP for everyone.
//  --db           after the run, count speech_attempts and 'speech' coin_ledger rows of this run with
//                 the service-role key from .env.local and compare with the replies. Refused on demo
//                 battles (nothing is stored there by design).
//
// Run against a production build (npm run build && npm start): dev mode compiles on first hit and
// its numbers are not representative.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const URL_ = String(opt('url', 'http://localhost:3000')).replace(/\/$/, '');
const STUDENTS = Number(opt('students', 50));
const DURATION_S = Number(opt('duration', 60));
const RATE = Number(opt('rate', 6));
const BATTLE = String(opt('battle', 'demo-kayak_rush'));
const ANSWERS = Number(opt('answers', 4));
const PROBES = Number(opt('probe', 2));
const DISTINCT_IP = !!opt('distinct-ip', false);
const DB = !!opt('db', false);
const RUN = `lt${Date.now().toString(36)}`;
const isDemo = BATTLE === 'demo' || BATTLE.startsWith('demo-');

if (DB && isDemo) {
  console.error('--db needs a real battle id: demo battles keep attempts in memory and never write to the database.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

// ---------------------------------------------------------------------------------------------
// HTTP with timing

const speech = { ms: [], codes: new Map(), reasons: new Map(), modes: new Map(), effects: new Map(), accepted: 0, coins: 0, passed: 0 };
const setup = { ms: [], errors: 0 };
const probe = { runs: [] }; // one array of status codes per probing student

async function call(path, { method = 'GET', body, token, ip } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-battle-session'] = token;
  if (ip) headers['x-forwarded-for'] = ip;
  const t = performance.now();
  try {
    const res = await fetch(URL_ + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json, ms: performance.now() - t };
  } catch (e) {
    return { status: 0, body: { error: String(e?.cause?.code ?? e) }, ms: performance.now() - t };
  }
}

// ---------------------------------------------------------------------------------------------
// Realistic attempts

const NEAR = { fish: ['fis', 'fresh'], river: ['liver', 'rivet'], tent: ['ten', 'tant'], light: ['night', 'like'], bread: ['bed', 'brad'] };
function nearMiss(text) {
  const w = text.toLowerCase().replace(/[^a-z ]/g, '');
  if (NEAR[w]) return pick(NEAR[w]);
  const words = w.split(' ');
  if (words.length > 1) {
    words.splice(Math.floor(Math.random() * words.length), 1);
    return words.join(' ');
  }
  return w.slice(0, -1) || 'uh';
}
function attemptFor(target) {
  const r = Math.random();
  const mode = r < 0.7 ? 'shadow' : r < 0.9 ? 'dictate' : 'repeat';
  if (mode === 'repeat') return { targetId: target.targetId, mode };
  const quality = Math.random(); // 55% right, 30% near miss, 15% wrong
  const said = quality < 0.55 ? target.text : quality < 0.85 ? nearMiss(target.text) : pick(['banana', 'hello', 'i do not know', '']);
  if (mode === 'dictate') return { targetId: target.targetId, mode, typed: said };
  const conf = Math.random() < 0.2 ? 0 : Number(rnd(0.4, 0.98).toFixed(2)); // Safari / some browsers: 0
  const alts = [{ transcript: said, confidence: conf }];
  const extra = Math.floor(rnd(0, 5));
  for (let k = 0; k < extra; k++) alts.push({ transcript: k % 2 ? nearMiss(target.text) : target.text, confidence: Number(rnd(0.1, 0.6).toFixed(2)) });
  // ~8% of utterances are a stray click (< 400 ms): the server must refuse them as too_short.
  const durationMs = Math.random() < 0.08 ? Math.round(rnd(80, 380)) : Math.round(rnd(450, 2600));
  return { targetId: target.targetId, mode, transcript: said, confidence: conf, alternatives: alts, durationMs };
}

function recordSpeech(r, mode) {
  speech.ms.push(r.ms);
  speech.codes.set(r.status, (speech.codes.get(r.status) ?? 0) + 1);
  speech.modes.set(mode, (speech.modes.get(mode) ?? 0) + 1);
  const b = r.body ?? {};
  if (r.status === 200 && b.accepted) {
    speech.accepted += 1;
    if (b.passed) speech.passed += 1;
    speech.coins += typeof b.coins === 'number' ? b.coins : 0;
    if (b.effect?.kind) speech.effects.set(b.effect.kind, (speech.effects.get(b.effect.kind) ?? 0) + 1);
  } else {
    const reason = b.reason ?? (r.status === 0 ? `network:${b.error}` : `http_${r.status}`);
    speech.reasons.set(reason, (speech.reasons.get(reason) ?? 0) + 1);
  }
}

// ---------------------------------------------------------------------------------------------
// One student: join, answer a few questions (unlocks targets), then speak at RATE per minute

async function join(i) {
  const ip = DISTINCT_IP ? `10.${(i >> 8) & 255}.${i & 255}.${7 + (i % 200)}` : '10.0.0.1';
  const s = await call('/api/session', { method: 'POST', ip, body: { battleId: BATTLE, nickname: `LT ${i}`, avatar: '🐣', studentKey: `${RUN}-${i}` } });
  setup.ms.push(s.ms);
  if (s.status !== 200 || !s.body?.token) {
    setup.errors += 1;
    return null;
  }
  const token = s.body.token;
  for (let k = 0; k < ANSWERS; k++) {
    const v = await call('/api/session', { token, ip });
    const view = v.body?.view;
    if (!view || view.state?.phase === 'result') break;
    if (view.state?.phase !== 'playing' || !view.question) {
      await sleep(1500);
      k--;
      continue;
    }
    await sleep(rnd(1700, 2600)); // reading time: instant answers are flagged by the anti-cheat
    const a = await call('/api/session/answer', { method: 'POST', token, ip, body: { questionId: view.question.id, chosenIdx: Math.floor(rnd(0, 3)) } });
    setup.ms.push(a.ms);
    if (a.status !== 200) setup.errors += 1;
  }
  const t = await call('/api/session/speech', { token, ip });
  const targets = t.body?.targets ?? [];
  return { token, ip, targets };
}

async function student(i, endAt) {
  await sleep(rnd(0, 5000)); // a class does not join on the same millisecond
  const s = await join(i);
  if (!s || !s.targets.length) return { i, ok: false, targets: 0 };
  const gap = 60_000 / RATE;
  await sleep(rnd(0, gap));
  while (Date.now() < endAt) {
    const target = pick(s.targets);
    const body = attemptFor(target);
    const r = await call('/api/session/speech', { method: 'POST', token: s.token, ip: s.ip, body });
    recordSpeech(r, body.mode);
    await sleep(gap + rnd(150, 900)); // a little over the limit's spacing, like a real child
  }
  return { i, ok: true, targets: s.targets.length };
}

/** Sends faster than the limit (one every 2 s): from the 7th request in a minute it must get 429. */
async function prober(i, endAt) {
  const s = await join(10_000 + i);
  if (!s || !s.targets.length) return;
  const codes = [];
  probe.runs.push(codes);
  let n = 0;
  while (Date.now() < endAt && n < 12) {
    const r = await call('/api/session/speech', { method: 'POST', token: s.token, ip: s.ip, body: { targetId: s.targets[0].targetId, mode: 'repeat' } });
    codes.push(r.status);
    n += 1;
    await sleep(2000);
  }
}

// ---------------------------------------------------------------------------------------------
// Server memory (RSS of the server process)

function serverPid() {
  if (opt('pid', null)) return Number(opt('pid'));
  try {
    const port = new URL(URL_).port || '80';
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim().split('\n')[0];
    return Number(out) || null;
  } catch {
    return null;
  }
}
function rssMb(pid) {
  try {
    return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) / 1024;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Database check (--db)

function envLocal() {
  try {
    return Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]));
  } catch {
    return {};
  }
}
async function dbCheck() {
  const env = { ...envLocal(), ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: 'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' };
  const h = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' };
  const count = async (q) => {
    const r = await fetch(`${url}/rest/v1/${q}`, { headers: h });
    return Number(r.headers.get('content-range')?.split('/')[1] ?? NaN);
  };
  const attempts = await count(`speech_attempts?select=id&student_key=like.${RUN}-*`);
  const coinRows = await fetch(`${url}/rest/v1/coin_ledger?select=delta&reason=eq.speech&student_key=like.${RUN}-*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => r.json());
  const coinSum = Array.isArray(coinRows) ? coinRows.reduce((s, r) => s + (r.delta ?? 0), 0) : NaN;
  return { attempts, coinRows: Array.isArray(coinRows) ? coinRows.length : NaN, coinSum };
}

// ---------------------------------------------------------------------------------------------

const pct = (xs, p) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
const f = (n) => (Number.isFinite(n) ? n.toFixed(0) : '–');

async function main() {
  console.log(`Speech load test → ${URL_}  battle=${BATTLE}  students=${STUDENTS}  duration=${DURATION_S}s  rate=${RATE}/min  run=${RUN}${DISTINCT_IP ? '  distinct IPs' : '  one class IP'}`);
  const pid = serverPid();
  const mem = [];
  const startRss = pid ? rssMb(pid) : null;
  const sampler = pid ? setInterval(() => mem.push(rssMb(pid)), 2000) : null;
  const t0 = Date.now();
  // Joining + answering takes ~10–20 s; the speaking window starts for each student after that.
  const endAt = t0 + 25_000 + DURATION_S * 1000;
  const results = await Promise.all([
    ...Array.from({ length: STUDENTS }, (_, i) => student(i, endAt)),
    ...Array.from({ length: PROBES }, (_, i) => prober(i, endAt)),
  ]);
  if (sampler) clearInterval(sampler);
  const wall = (Date.now() - t0) / 1000;

  const ready = results.filter((r) => r && r.ok).length;
  const total = speech.ms.length;
  console.log(`\nStudents ready to speak: ${ready}/${STUDENTS} (setup errors: ${setup.errors}; join/answer p95 ${f(pct(setup.ms, 95))} ms)`);
  console.log(`\nPOST /api/session/speech — ${total} requests in ${wall.toFixed(0)} s (${(total / wall).toFixed(1)}/s overall)`);
  const avg = speech.ms.reduce((a, b) => a + b, 0) / (total || 1);
  console.log(`  latency  avg ${f(avg)} ms · p50 ${f(pct(speech.ms, 50))} · p95 ${f(pct(speech.ms, 95))} · p99 ${f(pct(speech.ms, 99))} · max ${f(Math.max(...speech.ms))}   (target p95 ≤ 200 ms: ${pct(speech.ms, 95) <= 200 ? 'MET' : 'NOT MET'})`);
  console.log(`  status   ${[...speech.codes].map(([k, v]) => `${k}×${v}`).join('  ')}`);
  console.log(`  modes    ${[...speech.modes].map(([k, v]) => `${k}×${v}`).join('  ')}`);
  console.log(`  accepted ${speech.accepted} (passed ${speech.passed}) · coins in replies ${speech.coins} · effects ${[...speech.effects].map(([k, v]) => `${k}×${v}`).join(' ') || 'none'}`);
  console.log(`  refused  ${[...speech.reasons].map(([k, v]) => `${k}×${v}`).join('  ') || 'none'}`);
  const r429 = speech.codes.get(429) ?? 0;
  console.log(`  in-limit students hitting 429: ${r429} ${r429 ? '(expected 0 at 6/min: check the spacing / shared limiter)' : '(none, as expected)'}`);
  if (PROBES) {
    console.log(`\nRate-limit probe (${probe.runs.length} student(s), one request every 2 s, limit ${RATE}/min):`);
    for (const codes of probe.runs) {
      const first429 = codes.indexOf(429);
      console.log(`  ${codes.join(',')}  → first 429 at request #${first429 + 1} ${first429 === RATE ? '(= limit + 1: OK)' : first429 < 0 ? '(NO 429: limiter not working!)' : '(check)'}`);
    }
  }
  if (pid) {
    const vals = mem.filter((x) => x != null);
    console.log(`\nServer memory (pid ${pid}, RSS): start ${f(startRss)} MB · peak ${f(Math.max(...vals))} MB · end ${f(vals[vals.length - 1])} MB`);
  } else console.log('\nServer memory: server pid not found (pass --pid)');
  if (DB) {
    await sleep(1500);
    const d = await dbCheck();
    if (d.error) console.log(`\nDatabase: ${d.error}`);
    else {
      console.log(`\nDatabase (rows of run ${RUN}): speech_attempts ${d.attempts} (accepted replies ${speech.accepted}) ${d.attempts === speech.accepted ? 'MATCH' : 'MISMATCH'}`);
      console.log(`  coin_ledger 'speech': ${d.coinRows} rows, ${d.coinSum} coins (replies said ${speech.coins}) ${d.coinSum === speech.coins ? 'MATCH' : 'MISMATCH'}`);
    }
  } else if (isDemo) console.log('\nDatabase: demo battle → attempts kept in server memory by design (use a real battle + --db to check persistence).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
