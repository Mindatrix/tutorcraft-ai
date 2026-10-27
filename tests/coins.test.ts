import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CONSEQUENCE_GAMES,
  COIN_LIMITS,
  ConsequenceSystem,
  GAME_MODES,
  GameMode,
  HINT_AFTER_MS,
  HOOK_NAMES,
  OUTCOME_KINDS,
  QUESTION_RULES,
  RESCUE,
  answerCoins,
  boxCoins,
  gameConsequences,
  gameTasks,
  hintFor,
  newRescueState,
  podiumOf,
  rescueAnswer,
  rescueApplies,
  rescueExpire,
  rescueOnAnswer,
  standardConsequences,
  streakMultiplier,
  type ConsequenceHooks,
  type ConsequencePlan,
  type Question,
} from '../src/engine';
import { MemoryCoinStore } from '../src/server/coinStore';
import { RewardError, createRewardService, type QuestionContext } from '../src/server/rewardService';
import { MemoryBroadcaster } from '../src/server/matchBroadcast';
import { MemoryMatchStore } from '../src/server/matchStore';
import { createMatchService, MatchError, type RescueBroadcast, type StudentSession } from '../src/server/matchService';
import type { LoadedBattle } from '../src/server/battles';

const mcq = (id: number, correct = id % 4, difficulty: Question['difficulty'] = 'easy'): Question => ({
  id,
  question: `Pick the word for "con mèo" #${id}`,
  options: [`cat-${id}`, `dog-${id}`, `cow-${id}`, `pig-${id}`],
  correct_idx: correct,
  difficulty,
  topic: 'animals',
  skill_tag: 'vocabulary',
  hint: `con vật kêu meo meo`,
  explanation: `SECRET-EXPLANATION-${id}`,
});

function rewardsAt(start = 1_000_000) {
  let clock = start;
  const coins = new MemoryCoinStore();
  const svc = createRewardService({ coins, now: () => clock });
  return { coins, svc, tick: (ms: number) => (clock += ms), now: () => clock };
}

// ------------------------------------------------------------------------------------------- C4.16

test('C4.16 coin rules: right 10, +5 under 5 s, streak up to ×2, golden ×2; wrong is always 0', () => {
  assert.equal(answerCoins({ correct: true, timeMs: 8000, rightInRow: 1 }).total, 10);
  assert.equal(answerCoins({ correct: true, timeMs: 3000, rightInRow: 1 }).total, 15);
  assert.equal(streakMultiplier(1), 1);
  assert.equal(streakMultiplier(3), 1.5);
  assert.equal(streakMultiplier(5), 2);
  assert.equal(streakMultiplier(40), 2, 'never above ×2');
  assert.equal(answerCoins({ correct: true, timeMs: 3000, rightInRow: 9 }).total, 30);
  assert.equal(answerCoins({ correct: true, timeMs: 3000, rightInRow: 9, golden: true }).total, 60);
  assert.equal(COIN_LIMITS.maxPerAnswer, 60);
  for (const golden of [false, true]) assert.equal(answerCoins({ correct: false, timeMs: 100, rightInRow: 0, golden }).total, 0);
  // A negative or absurd time from anywhere gives no fast bonus.
  assert.equal(answerCoins({ correct: true, timeMs: -50, rightInRow: 1 }).fast, 0);
});

test('C4.16 coins cannot be farmed: once per question, 8 awards a minute, a match cap, never below 0', async () => {
  const { svc, coins, tick } = rewardsAt();
  const base = { studentKey: 'em-1', sessionId: 's1', matchId: 'm1', correct: true, timeMs: 6000, rightInRow: 1 };
  const first = await svc.answer({ ...base, qid: 1 });
  assert.equal(first.awarded, 10);
  // Replaying the same answer (retry, double click, scripted resend) pays nothing more.
  const again = await svc.answer({ ...base, qid: 1 });
  assert.equal(again.awarded, 0);
  assert.equal(again.refused, 'duplicate');
  // A script answering as fast as the API allows: at most 8 paid per minute.
  let paid = 0;
  for (let q = 2; q < 30; q++) paid += (await svc.answer({ ...base, qid: q })).awarded > 0 ? 1 : 0;
  assert.equal(paid, COIN_LIMITS.answerAwardsPerMinute - 1);
  // Wrong answers never take coins away.
  const before = await coins.balance('em-1');
  for (let q = 100; q < 110; q++) await svc.answer({ ...base, qid: q, correct: false });
  assert.equal(await coins.balance('em-1'), before);
  // Match cap: even over a long time, one match pays at most COIN_LIMITS.perMatch.
  for (let q = 200; q < 400; q++) {
    tick(10_000);
    await svc.answer({ ...base, qid: q, rightInRow: 9, timeMs: 1000 });
  }
  const earned = coins.rows.filter((r) => r.studentKey === 'em-1' && r.matchId === 'm1' && r.delta > 0).reduce((s, r) => s + r.delta, 0);
  assert.equal(earned, COIN_LIMITS.perMatch);
  // Spending more than the balance is refused (hint store path).
  const poor = await coins.apply({ studentKey: 'em-2', delta: -5, reason: 'hint', ref: 'x' }, {}, 0);
  assert.equal(poor.code, 'funds');
  assert.equal(await coins.balance('em-2'), 0);
});

test('C4.16 the API takes no amount: the server computes coins from its own grading and timing', () => {
  // rewardService.answer() has no amount field; its inputs come from sessionService.act()
  // (server clock, server grading, the session's own streak). The route strips the internals.
  const route = readFileSync('app/api/session/answer/route.ts', 'utf8');
  assert.match(route, /answerCoins\(res\)/);
  assert.doesNotMatch(route, /body\.coins|body\.amount|body\.golden/);
  assert.match(route, /studentKey: _key, streak: _streak/);
});

// ------------------------------------------------------------------------------------- C4.11–C4.12

function ctxFor(q: Question | null, issuedAt: number, extra: Partial<QuestionContext> = {}): QuestionContext {
  return { sessionId: 'sess-hint', studentKey: 'em-h', matchId: null, game: GameMode.DINO_JOURNEY, question: q, issuedAt, wrongInRow: 0, ...extra };
}

test('C4.12 hints: 8 s wait, tier 1 = Vietnamese meaning for 3 coins, tier 2 = two wrong options for 5', async () => {
  const { svc, coins, now, tick } = rewardsAt();
  await coins.apply({ studentKey: 'em-h', delta: 20, reason: 'box', ref: 'seed' }, {}, now());
  const q = mcq(7, 2);
  const issued = now();
  await assert.rejects(svc.hint(ctxFor(q, issued), 1), (e: RewardError) => e.status === 409 && (e.extra?.retryAfterMs as number) > 0);
  assert.equal(await coins.balance('em-h'), 20, 'nothing charged before the button shows');
  tick(HINT_AFTER_MS);
  const t1 = await svc.hint(ctxFor(q, issued), 1);
  assert.equal(t1.cost, QUESTION_RULES.hintCost[1]);
  assert.deepEqual(t1.hint, { tier: 1, meaning: 'con vật kêu meo meo' });
  assert.match(t1.line, /Cha|con vật kêu meo meo/, 'whispered by the companion');
  const t2 = await svc.hint(ctxFor(q, issued), 2);
  assert.equal(t2.cost, QUESTION_RULES.hintCost[2]);
  assert.equal(t2.hint.tier, 2);
  if (t2.hint.tier === 2) {
    assert.equal(t2.hint.remove.length, 2);
    assert.ok(!t2.hint.remove.includes(q.correct_idx));
  }
  assert.equal(await coins.balance('em-h'), 20 - 3 - 5);
  // Asking again: same hint, no second charge.
  const again = await svc.hint(ctxFor(q, issued), 2);
  assert.equal(again.cost, 0);
  assert.equal(await coins.balance('em-h'), 12);
  // Not enough coins: refused with the price, nothing taken.
  const q2 = mcq(8, 1);
  await coins.apply({ studentKey: 'em-h', delta: -12, reason: 'hint', ref: 'drain' }, {}, now());
  await assert.rejects(svc.hint(ctxFor(q2, issued), 2), (e: RewardError) => e.status === 402);
  // C4.8 after two wrong answers in a row the tier-1 hint is free.
  const free = await svc.hint(ctxFor(q2, issued, { wrongInRow: 2 }), 1);
  assert.equal(free.free, true);
  assert.equal(free.cost, 0);
  // Tier 2 needs options to fade.
  await assert.rejects(svc.hint(ctxFor({ ...q2, type: 'matching', options: [], correct_idx: -1 }, issued, { wrongInRow: 2 }), 2), (e: RewardError) => e.status === 400);
});

test('C4.12 network check: no hint reply ever carries the answer key', async () => {
  const { svc, coins, now, tick } = rewardsAt();
  await coins.apply({ studentKey: 'em-h', delta: 1000, reason: 'box', ref: 'seed' }, {}, now());
  const issued = now();
  tick(HINT_AFTER_MS);
  for (let id = 1; id <= 120; id++) {
    const q = mcq(id, id % 4);
    for (const tier of [1, 2] as const) {
      const reply = await svc.hint(ctxFor(q, issued, { sessionId: `s-${id}` }), tier);
      const wire = JSON.stringify(reply);
      assert.doesNotMatch(wire, /correct|explanation|SECRET|answers|sample/i, wire);
      assert.ok(!wire.includes(q.options[q.correct_idx]), `right option text leaked: ${wire}`);
      if (reply.hint.tier === 2) {
        assert.ok(!reply.hint.remove.includes(q.correct_idx));
        assert.equal(q.options.length - reply.hint.remove.length, 2, 'two options left, the right one among them');
      }
    }
  }
  // A 3-option question loses only one wrong option (never down to the answer alone).
  const three = { ...mcq(500, 0), options: ['a', 'b', 'c'] };
  const h = hintFor(three, 2, 'x');
  assert.ok(h && h.tier === 2 && h.remove.length === 1 && !h.remove.includes(0));
});

// ------------------------------------------------------------------------------------------- C4.18

test('C4.18 gift box: coins only, 20–100, once per match, at most 5 a day', async () => {
  const amounts = Array.from({ length: 400 }, (_, i) => boxCoins(`m${i}:em`));
  for (const a of amounts) assert.ok(a >= 20 && a <= 100 && a % 5 === 0, String(a));
  assert.ok(amounts.filter((a) => a < 50).length > amounts.length * 0.4, 'small boxes are common');
  assert.ok(amounts.some((a) => a >= 90), 'big ones exist');
  const { svc } = rewardsAt(Date.UTC(2026, 9, 27, 8));
  const one = await svc.openBox({ studentKey: 'em-b', matchId: 'm-1' });
  const same = await svc.openBox({ studentKey: 'em-b', matchId: 'm-1' });
  assert.equal(same.again, true);
  assert.equal(same.coins, one.coins);
  assert.equal(same.balance, one.balance, 'opening twice pays once');
  for (let i = 2; i <= 5; i++) await svc.openBox({ studentKey: 'em-b', matchId: `m-${i}` });
  await assert.rejects(svc.openBox({ studentKey: 'em-b', matchId: 'm-6' }), (e: RewardError) => e.status === 429);
});

// ------------------------------------------------------------------------------------------- C4.14

test('C4.14 class rescue with 2 students: 3 wrong in one stage → a classmate helps, both get coins', () => {
  const mates = [
    { id: 'an', online: true },
    { id: 'binh', online: true },
  ];
  let s = newRescueState();
  // Two wrong at the end of stage 1, one in stage 2: not three in one stage.
  for (const [stage, at] of [[1, 100], [1, 200], [2, 300]] as const) s = rescueOnAnswer(s, { playerId: 'an', correct: false, stage, at }, mates, 'seed').state;
  assert.equal(s.open.length, 0);
  s = rescueOnAnswer(s, { playerId: 'an', correct: false, stage: 2, at: 400 }, mates, 'seed').state;
  const r = rescueOnAnswer(s, { playerId: 'an', correct: false, stage: 2, at: 500, qid: 9 }, mates, 'seed');
  assert.equal(r.events.length, 1);
  const open = r.events[0];
  assert.ok(open.t === 'rescue_open');
  assert.equal(open.req.needy, 'an');
  assert.equal(open.req.helper, 'binh');
  // Only once per student per stage.
  assert.equal(rescueOnAnswer(r.state, { playerId: 'an', correct: false, stage: 2, at: 600 }, mates, 'seed').events.length, 0);
  // Only the chosen helper can answer it; a right answer in time pays both.
  assert.equal(rescueAnswer(r.state, { helperId: 'an', requestId: open.req.id, correct: true, at: 700 }).events.length, 0);
  const done = rescueAnswer(r.state, { helperId: 'binh', requestId: open.req.id, correct: true, at: 700 });
  assert.deepEqual(done.events[0], { t: 'rescued', req: open.req, coins: { an: RESCUE.coins, binh: RESCUE.coins } });
  assert.equal(done.state.open.length, 0);
  assert.equal(done.state.wrong.an.n, 0, 'the rescued student starts over');
  // Too late: it fails, nobody is paid.
  const late = rescueAnswer(r.state, { helperId: 'binh', requestId: open.req.id, correct: true, at: 500 + RESCUE.windowMs + 1 });
  assert.equal(late.events[0].t, 'rescue_failed');
  assert.equal(rescueExpire(r.state, 500 + RESCUE.windowMs + 1).state.open.length, 0);
  // Alone: nobody to help, no rescue. River Survival keeps its own freeze / free rules.
  let solo = newRescueState();
  for (let i = 0; i < 3; i++) solo = rescueOnAnswer(solo, { playerId: 'an', correct: false, stage: 1, at: i }, [mates[0]], 'seed').state;
  assert.equal(solo.open.length, 0);
  assert.equal(rescueApplies(GameMode.RIVER_SURVIVAL), false);
  assert.equal(rescueApplies(GameMode.DINO_JOURNEY), true);
});

function classMatch(game: GameMode = GameMode.SUMMER_CAMP_QUESTS) {
  let clock = 50_000_000;
  const store = new MemoryMatchStore();
  const radio = new MemoryBroadcaster();
  const coinStore = new MemoryCoinStore();
  const rewards = createRewardService({ coins: coinStore, now: () => clock });
  const sessions = new Map<string, StudentSession>();
  const questions = [mcq(1, 2, 'easy'), mcq(2, 1, 'medium'), mcq(3, 0, 'easy')];
  const battle = { id: 'b1', code: 'ABC123', tutorId: 't1', questions, config: { scenario: GAME_MODES[game].scenarios[0], gameMode: game, scenarioKey: 'camp-01', level: 3, classCode: 'LOP5A' } } as unknown as LoadedBattle;
  const svc = createMatchService({
    store,
    broadcaster: radio,
    rewards,
    now: () => clock,
    loadBattle: async (id) => (id === 'b1' ? battle : null),
    session: async (token) => {
      const s = sessions.get(String(token));
      if (!s) throw new MatchError(401, 'bad token');
      return s;
    },
    scenario: async () => ({ tags: [], species: [] }),
  });
  const student = (i: number) => {
    const token = `tok-${i}`;
    sessions.set(token, { id: `sess-${i}`, battleId: 'b1', studentKey: `key-${i}`, nickname: `Em ${i}`, avatar: '🐣' });
    return token;
  };
  return { store, radio, svc, student, coinStore, questions, tick: (ms: number) => (clock += ms), now: () => clock };
}

test('C4.14 through the match service: rescue broadcast without the key, helper graded on the server, both paid', async () => {
  const { svc, student, radio, coinStore, questions, tick, now } = classMatch();
  const a = student(1);
  const b = student(2);
  const m = await svc.create('t1', 'b1');
  await svc.join(a, {});
  await svc.join(b, {});
  await svc.control('t1', m.view.id, 'start');
  tick(60_000);
  // Em 2 is active (answered recently), so the server sees them online and able to help.
  await svc.onAnswer('sess-2', { correct: true, stars: 2 });
  // Three wrong answers of Em 1 inside stage 1 (server times from the session log).
  const wrongAt = [now() - 20_000, now() - 10_000, now()];
  for (let i = 0; i < 3; i++) await svc.onAnswer('sess-1', { correct: false, stars: 0, wrongAt: wrongAt.slice(0, i + 1) });
  const msg = radio.messages().find((x) => x.t === 'rescue');
  assert.ok(msg, 'the class is told');
  const d = msg!.d as RescueBroadcast;
  const open = d.events.find((e) => e.t === 'rescue_open');
  assert.ok(open && open.t === 'rescue_open');
  assert.equal(JSON.stringify(d).includes('correct_idx'), false);
  assert.equal(JSON.stringify(d).includes('SECRET'), false);
  const q = questions.find((x) => x.id === d.question!.id)!;
  assert.equal(q.difficulty, 'easy', 'an easy rescue question');
  // Em 1 cannot answer their own rescue; Em 2 (the helper) can.
  await assert.rejects(svc.answerRescue(a, open.req.id, q.correct_idx), (e: MatchError) => e.status === 404);
  const res = await svc.answerRescue(b, open.req.id, q.correct_idx);
  assert.equal(res.correct, true);
  assert.equal(res.coins, RESCUE.coins);
  assert.equal(await coinStore.balance('key-1'), RESCUE.coins);
  assert.equal(await coinStore.balance('key-2'), RESCUE.coins);
  // Replaying the helper's answer pays nothing more.
  await assert.rejects(svc.answerRescue(b, open.req.id, q.correct_idx), (e: MatchError) => e.status === 404);
  assert.equal(await coinStore.balance('key-2'), RESCUE.coins);
});

test('C4.18 box through the match service: only after the match ended, only for a student who answered', async () => {
  const { svc, student, store, tick } = classMatch();
  const a = student(1);
  const b = student(2);
  const m = await svc.create('t1', 'b1');
  await svc.join(a, {});
  await svc.join(b, {});
  await svc.control('t1', m.view.id, 'start');
  tick(10_000);
  await svc.onAnswer('sess-1', { correct: true, stars: 3 });
  await assert.rejects(svc.openBox(a), (e: MatchError) => e.status === 409);
  await svc.control('t1', m.view.id, 'end');
  const box = await svc.openBox(a);
  assert.ok(box.coins >= 20 && box.coins <= 100);
  await assert.rejects(svc.openBox(b), (e: MatchError) => e.status === 409, 'Em 2 never answered');
  assert.ok(store);
});

// ------------------------------------------------------------------------------------------- C4.19

test('C4.19 top 3 frames: gold, silver, bronze by stars, ties by correct answers, the same on every screen', () => {
  const scores = { players: { a: 12, b: 30, c: 12, d: 0, e: 7 }, correct: { a: 4, c: 6, b: 10, e: 3 } };
  assert.deepEqual(podiumOf(scores), { b: 'gold', c: 'silver', a: 'bronze' });
  assert.deepEqual(podiumOf({ players: { x: 0, y: 0 } }), {}, 'no frame for 0 stars');
  assert.deepEqual(podiumOf({ players: { z: 5, y: 5 } }), { y: 'gold', z: 'silver' }, 'stable order');
});

// ------------------------------------------------------------------------------------------- C4.13

test('C4.13 every game registers the four hooks; content has all four outcomes for every task', () => {
  assert.equal(CONSEQUENCE_GAMES.length, 6);
  const sys = standardConsequences<null>(() => undefined);
  assert.deepEqual(sys.registered().sort(), [...CONSEQUENCE_GAMES].sort());
  for (const g of CONSEQUENCE_GAMES) {
    assert.ok(gameConsequences(g)?.companion.name, `${g} companion`);
    for (const task of gameTasks(g)) for (const k of OUTCOME_KINDS) assert.ok(gameConsequences(g)!.tasks[task][k], `${g}/${task}/${k}`);
  }
  assert.throws(() => new ConsequenceSystem().register(GameMode.KAYAK_RUSH_3D, { onCorrect() {}, onWrong() {}, onWrongStreak() {} } as unknown as ConsequenceHooks<unknown>), /recover/);
  assert.deepEqual(HOOK_NAMES, ['onCorrect', 'onWrong', 'onWrongStreak', 'recover']);
});

test('C4.13 the right hook fires: correct, first wrong, wrong streak, recover gate, timeout = light wrong', async () => {
  const plans: ConsequencePlan[] = [];
  const sys = standardConsequences<null>((p) => void plans.push(p));
  const kayak = GameMode.KAYAK_RUSH_3D;
  await sys.answer(kayak, 'gate', { playerId: 'em', correct: true, seed: 1 }, null);
  await sys.answer(kayak, 'gate', { playerId: 'em', correct: false, rightAnswer: 'apple', seed: 2 }, null);
  await sys.answer(kayak, 'gate', { playerId: 'em', correct: false, rightAnswer: 'banana', seed: 3 }, null);
  assert.equal(sys.needsRecover('em'), true);
  await sys.beforeQuestion(kayak, 'gate', 'em', 4, null);
  await sys.answer(kayak, 'gate', { playerId: 'em', correct: true, seed: 5 }, null);
  await sys.answer(kayak, 'gate', { playerId: 'em', correct: false, timeout: true, rightAnswer: 'pear', seed: 6 }, null);
  await sys.answer(kayak, 'gate', { playerId: 'em', correct: false, timeout: true, rightAnswer: 'kiwi', seed: 7 }, null);
  assert.deepEqual(plans.map((p) => p.kind), ['correct', 'wrong', 'wrongStreak', 'recover', 'correct', 'wrong', 'wrong']);
  assert.equal(plans[0].effect, 'gate_open_nitro');
  assert.deepEqual(plans[0].avatar, ['correct', 'happy']);
  assert.equal(plans[0].sign, null, 'no sign when right');
  assert.equal(plans[1].sign?.text, 'apple', 'the right answer shows as a sign in the scene');
  assert.match(plans[1].sign!.style, /biển gỗ/);
  assert.equal(plans[2].effect, 'boat_flip_drift_back');
  assert.equal(plans[2].camera, 'shake_big');
  assert.equal(plans[3].effect, 'rescue_buoy_gate_easy');
  assert.equal(plans[5].camera, null, 'a timeout is a light wrong: no camera shake');
  for (const p of plans) assert.ok(p.durationMs >= 1500 && p.durationMs <= 2400, `${p.kind} ${p.durationMs}`);
  // Every game: a plan with an effect and a sound for each kind.
  for (const g of CONSEQUENCE_GAMES) {
    const task = gameTasks(g)[0];
    const seen: ConsequencePlan[] = [];
    const s2 = standardConsequences<null>((p) => void seen.push(p));
    await s2.answer(g, task, { playerId: 'x', correct: true, seed: 1 }, null);
    await s2.answer(g, task, { playerId: 'x', correct: false, rightAnswer: 'ok', seed: 1 }, null);
    await s2.answer(g, task, { playerId: 'x', correct: false, rightAnswer: 'ok', seed: 1 }, null);
    await s2.beforeQuestion(g, task, 'x', 1, null);
    assert.deepEqual(seen.map((p) => p.kind), ['correct', 'wrong', 'wrongStreak', 'recover'], g);
    for (const p of seen) assert.ok(p.effect && p.sfx && p.caption, `${g} ${p.kind}`);
  }
});

test('C4.17 migration: RLS on every new table, no path from coins to ranking points', () => {
  const sql = readFileSync('supabase/migrations/20261027_coins_seasons.sql', 'utf8');
  for (const t of ['coin_wallets', 'coin_ledger', 'character_inventory', 'seasons', 'season_scores']) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`), t);
  }
  const fn = (name: string) => sql.slice(sql.indexOf(`function public.${name}(`), sql.indexOf('$$;', sql.indexOf(`function public.${name}(`)));
  assert.doesNotMatch(fn('coin_apply'), /season/);
  assert.doesNotMatch(fn('season_add_points'), /coin/);
  assert.match(sql, /revoke insert, update, delete, truncate on public\.coin_wallets/);
  assert.match(sql, /grant execute on function public\.coin_apply\([^)]*\) to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.coin_apply\([^)]*\) to (anon|authenticated)/);
  // The ledger keeps its rule: one row per event, never paid twice.
  assert.match(sql, /constraint coin_ledger_once unique \(student_key, reason, ref\)/);
});
