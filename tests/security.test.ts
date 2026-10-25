import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import * as E from '../src/engine';
import { open, seal } from '../src/server/crypto';
import { createSessionService, SessionError } from '../src/server/sessionService';
import { MemorySessionStore } from '../src/server/sessionStore';
import type { LoadedBattle } from '../src/server/battles';

// ---------- helpers ----------

function battle(n = 6, id = 'battle-1'): LoadedBattle {
  return {
    id,
    code: 'ABC234',
    topic: 'Test',
    config: { ...E.DEMO_CONFIG, classCode: 'K1' },
    boss: E.DEMO_BOSS,
    questions: E.fallbackPayload(n, 'security').questions.map((q) => ({ ...q, explanation: 'SECRET_EXPLANATION' })),
    tutorName: 'Cô Lan',
  };
}

function setup(b = battle()) {
  let clock = 1_000_000;
  const store = new MemorySessionStore();
  const persisted: unknown[] = [];
  const svc = createSessionService({
    loadBattle: async (id) => (id === b.id ? b : null),
    storeFor: () => store,
    persistResult: async (r) => {
      persisted.push(r);
      return true;
    },
    now: () => clock,
  });
  return {
    svc,
    b,
    persisted,
    advance: (ms: number) => (clock += ms),
    start: () => svc.start({ battleId: b.id, variant: null, nickname: 'Kid', avatar: '🦊', studentKey: 'k' }),
  };
}

/** Recursively collect every key in a JSON value. */
function keysOf(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysOf(x, out);
    }
  }
  return out;
}

const correctOf = (b: LoadedBattle, qid: number) => b.questions.find((q) => q.id === qid)!.correct_idx;
const humanDelay = (q: E.PublicQuestion) => E.minPlausibleMs({ question: q.question, options: q.options, skill_tag: 'grammar' }) + 1500;

// ---------- token encryption ----------

test('AES-256-GCM token: round trip, opaque, tamper-proof, key-bound', () => {
  const key = randomBytes(32);
  const tok = seal({ sid: 'abc', bid: 'battle-xyz', exp: 1 }, key);
  assert.deepEqual(open(tok, key), { sid: 'abc', bid: 'battle-xyz', exp: 1 });
  assert.ok(!Buffer.from(tok.slice(3), 'base64url').toString('latin1').includes('battle-xyz'), 'payload must not be readable');
  const flipped = tok.slice(0, -2) + (tok.at(-2) === 'A' ? 'B' : 'A') + tok.at(-1);
  assert.equal(open(flipped, key), null, 'edited token must fail');
  assert.equal(open(tok, randomBytes(32)), null, 'other key must fail');
  assert.equal(open('v1.garbage', key), null);
  assert.equal(open({}, key), null);
});

// ---------- answer hiding ----------

test('session start never exposes correct answers or explanations', async () => {
  const { start } = setup();
  const { token, view } = await start();
  const keys = keysOf(view);
  assert.ok(!keys.has('correct_idx') && !keys.has('correctIdx') && !keys.has('explanation'));
  assert.ok(!JSON.stringify(view).includes('SECRET_EXPLANATION'));
  assert.equal(view.question?.hint, undefined, 'hint hidden until unlocked');
  assert.equal(typeof token, 'string');
});

test('answer is checked server-side and only then revealed', async () => {
  const { svc, start, advance, b } = setup();
  const { token, view } = await start();
  const q = view.question!;
  advance(humanDelay(q));
  const res = await svc.act(token, { kind: 'answer', questionId: q.id, chosenIdx: correctOf(b, q.id) });
  assert.equal(res.reveal?.correctIdx, correctOf(b, q.id));
  assert.equal(res.reveal?.explanation, 'SECRET_EXPLANATION');
  assert.ok(!JSON.stringify(res.view).includes('SECRET_EXPLANATION'), 'next question still hidden');
  assert.equal(res.view.question?.index, 1);
});

// ---------- tampering ----------

test('forged / edited tokens are rejected', async () => {
  const { svc, start } = setup();
  const { token } = await start();
  await assert.rejects(() => svc.current(token.slice(0, -3) + 'AAA'), (e: SessionError) => e.status === 401);
  await assert.rejects(() => svc.current(seal({ sid: 'nope', bid: 'battle-1', exp: Date.now() * 2 })), (e: SessionError) => e.status === 404);
  await assert.rejects(() => svc.current(undefined), (e: SessionError) => e.status === 401);
});

test('cannot answer the same question twice or a future question', async () => {
  const { svc, start, advance, b } = setup();
  const { token, view } = await start();
  const q = view.question!;
  advance(humanDelay(q));
  await svc.act(token, { kind: 'answer', questionId: q.id, chosenIdx: 0 });
  // Retry the same question with the right answer after seeing the reveal:
  await assert.rejects(() => svc.act(token, { kind: 'answer', questionId: q.id, chosenIdx: correctOf(b, q.id) }), (e: SessionError) => e.status === 409);
  await assert.rejects(() => svc.act(token, { kind: 'answer', questionId: 999, chosenIdx: 0 }), (e: SessionError) => e.status === 409);
});

test('skills need MP the server has seen earned', async () => {
  const { svc, start } = setup();
  const { token } = await start();
  await assert.rejects(() => svc.act(token, { kind: 'cast', skill: 'shield' }), (e: SessionError) => e.status === 409);
  await assert.rejects(() => svc.act(token, { kind: 'cast', skill: 'nuke' }), (e: SessionError) => e.status === 400);
});

test('Eye of Truth is resolved server-side and never removes the correct option', async () => {
  const { svc, start, advance, b } = setup();
  const { token } = await start();
  let v = (await svc.current(token)).question!;
  for (let i = 0; i < 3; i++) {
    advance(humanDelay(v));
    const r = await svc.act(token, { kind: 'answer', questionId: v.id, chosenIdx: correctOf(b, v.id) });
    advance(E.FEEDBACK_MS);
    v = r.view.question!;
  }
  const res = await svc.act(token, { kind: 'cast', skill: 'eye_of_truth' });
  assert.equal(res.view.state.removed.length, 2);
  assert.ok(!res.view.state.removed.includes(correctOf(b, v.id)));
});

test('late answers count as timeouts on the server clock', async () => {
  const { svc, start, advance, b } = setup();
  const { token, view } = await start();
  const q = view.question!;
  advance((view.state.questionTime + 10) * 1000);
  const res = await svc.act(token, { kind: 'answer', questionId: q.id, chosenIdx: correctOf(b, q.id) });
  assert.equal(res.afterAnswer?.answers.at(-1)?.chosenIdx, -1, 'correct click after the deadline does not score');
});

// ---------- server-side truth & speed-hack ----------

async function playAll(ctx: ReturnType<typeof setup>, delay: (q: E.PublicQuestion) => number) {
  const { svc, start, advance, b } = ctx;
  const { token, view } = await start();
  let q = view.question;
  while (q) {
    advance(delay(q));
    const r = await svc.act(token, { kind: 'answer', questionId: q.id, chosenIdx: correctOf(b, q.id) });
    advance(E.FEEDBACK_MS);
    q = r.view.question;
  }
  return token;
}

test('bot speed run is flagged and never saved', async () => {
  const ctx = setup(battle(10));
  const token = await playAll(ctx, () => 120);
  const res = await ctx.svc.finalize(token);
  assert.equal(res.flagged, true);
  assert.equal(res.score, null);
  assert.equal(ctx.persisted.length, 0);
  assert.equal((await ctx.svc.finalize(token)).flagged, true, 'stays flagged');
});

test('human run is scored from the server log, saved once, idempotent', async () => {
  const ctx = setup(battle(6));
  const token = await playAll(ctx, humanDelay);
  const res = await ctx.svc.finalize(token);
  assert.equal(res.flagged, false);
  assert.equal(res.score?.correct, 6);
  assert.equal(res.hpRemaining, 100);
  assert.equal(ctx.persisted.length, 1);
  const again = await ctx.svc.finalize(token);
  assert.equal(again.score?.gems, res.score?.gems);
  assert.equal(ctx.persisted.length, 1, 'second submit does not pay out again');
});

test('finalize before the battle ends is refused', async () => {
  const { svc, start } = setup();
  const { token } = await start();
  await assert.rejects(() => svc.finalize(token), (e: SessionError) => e.status === 409);
});

test('freeze credit only covers time actually frozen (no false speed flag)', () => {
  const b = battle(4);
  const ctx = { questions: b.questions, config: b.config, scaling: E.computeScaling(b.config, 4), boss: b.boss };
  const t0 = 0;
  const log: E.SessionLogEntry[] = [];
  let at = t0;
  // earn 60 MP with 3 human answers
  for (let i = 0; i < 3; i++) {
    at += 4000;
    log.push({ t: 'answer', qid: b.questions[i].id, chosen: b.questions[i].correct_idx, at });
    at += E.FEEDBACK_MS;
  }
  log.push({ t: 'cast', skill: 'freeze', at: at + 1000 });
  log.push({ t: 'answer', qid: b.questions[3].id, chosen: b.questions[3].correct_idx, at: at + 5000 });
  const r = E.rebuildSession(ctx, t0, log);
  const last = r.timings.at(-1)!;
  assert.ok(last.elapsedMs >= 0, `elapsed ${last.elapsedMs} must not go negative`);
});

// ---------- proxy rate limiting ----------

test('proxy: per-IP burst limit, cross-site POST block, size cap', async () => {
  const { proxy } = await import('../proxy');
  const { NextRequest } = await import('next/server');
  const mk = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? 'GET', headers: { host: 'localhost:3000', 'x-forwarded-for': '203.0.113.9', ...(init.headers ?? {}) } });

  // One session token hammering the scoring route is throttled…
  let blocked = 0;
  for (let i = 0; i < 20; i++) {
    const r = proxy(mk('/api/battle-result', { method: 'POST', headers: { 'x-battle-session': 'tok-flood-1' } }));
    if (r.status === 429) blocked++;
  }
  assert.ok(blocked >= 8, `expected per-token scoring throttling, got ${blocked} blocked`);
  // …but a class of 45 students behind one school IP can all join and submit.
  const school = { 'x-forwarded-for': '203.0.113.77' };
  for (let s = 0; s < 45; s++) {
    assert.notEqual(proxy(mk('/api/session', { method: 'POST', headers: school })).status, 429, `join #${s + 1}`);
    assert.notEqual(proxy(mk('/api/battle-result', { method: 'POST', headers: { ...school, 'x-battle-session': `tok-student-${s}` } })).status, 429, `submit #${s + 1}`);
  }
  // A single IP flooding joins is still cut off.
  let joinBlocked = 0;
  for (let i = 0; i < 200; i++) if (proxy(mk('/api/session', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.78' } })).status === 429) joinBlocked++;
  assert.ok(joinBlocked >= 40, `join flood throttled (${joinBlocked})`);
  assert.equal(proxy(mk('/api/session', { method: 'POST', headers: { origin: 'https://evil.example', 'x-forwarded-for': '198.51.100.1' } })).status, 403);
  assert.equal(proxy(mk('/api/battles', { method: 'POST', headers: { 'content-length': String(50 * 1024 * 1024), 'x-forwarded-for': '198.51.100.2' } })).status, 413);
});

import { rateLimitShared } from '../src/server/rateLimit';

test('rateLimitShared falls back to the in-memory limiter when Supabase is not configured', async () => {
  const saved = { u: process.env.NEXT_PUBLIC_SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY, a: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const key = `t-shared-${Date.now()}`;
    assert.equal((await rateLimitShared(key, 2, 60_000)).ok, true);
    assert.equal((await rateLimitShared(key, 2, 60_000)).ok, true);
    const third = await rateLimitShared(key, 2, 60_000);
    assert.equal(third.ok, false);
    assert.ok(third.retryAfterSec >= 1);
  } finally {
    if (saved.u !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.u;
    if (saved.k !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.k;
    if (saved.a !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.a;
  }
});
