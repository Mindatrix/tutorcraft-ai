import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine';
import type { AnswerRecord } from '../src/engine';

test('5 levels: level 3 keeps legacy behaviour, others scale monotonically', () => {
  assert.deepEqual(E.LEVEL_IDS, [1, 2, 3, 4, 5]);
  assert.deepEqual([E.timeLimitFor('easy', 3), E.timeLimitFor('medium', 3), E.timeLimitFor('hard', 3)], [30, 45, 60]);
  assert.equal(E.timeLimitFor('medium'), E.timeLimitFor('medium', 3));
  const t = E.LEVEL_IDS.map((l) => E.timeLimitFor('medium', l));
  for (let i = 1; i < t.length; i++) assert.ok(t[i] < t[i - 1], 'time shrinks as level rises');
  const p = E.LEVEL_IDS.map((l) => E.wrongPenalty(20, l));
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1], 'mistakes cost more as level rises');
  assert.equal(E.wrongPenalty(15), E.wrongPenalty(15, 3));
  for (const l of E.LEVEL_IDS) {
    const m = E.LEVELS[l].mix;
    assert.ok(Math.abs(m.easy + m.medium + m.hard - 1) < 1e-9);
  }
});

test('normalizeConfig clamps level and defaults to 3', () => {
  const base = { topic: 'x', scenario: 'homework' };
  assert.equal(E.normalizeConfig({ ...base }).level, 3);
  assert.equal(E.normalizeConfig({ ...base, level: 5 }).level, 5);
  assert.equal(E.normalizeConfig({ ...base, level: 99 }).level, 3);
  assert.equal(E.normalizeConfig({ ...base, level: 'abc' }).level, 3);
  assert.equal(E.normalizeConfig({ scenario: 'boat_race' }).scenario, 'boat_race');
});

test('bot plan is deterministic and stronger at higher levels', () => {
  const seed = E.raceSeed('b1', 2, 3);
  assert.deepEqual(E.botPlan(seed, 20, 3), E.botPlan(seed, 20, 3));
  const acc = (lv: 1 | 2 | 3 | 4 | 5) => {
    let n = 0;
    for (let s = 0; s < 40; s++) n += E.botPlan(`seed${s}`, 30, lv).filter((x) => x.correct).length;
    return n / (40 * 30);
  };
  assert.ok(acc(1) < acc(3) && acc(3) < acc(5));
});

test('race outcome: more correct wins, tie goes to the faster boat, server caps time', () => {
  const qs = E.fallbackPayload(8, 'race-test').questions;
  const seed = E.raceSeed('b1', null, 1);
  const perfect: AnswerRecord[] = qs.map((q) => ({ questionId: q.id, chosenIdx: q.correct_idx, timeMs: 1000 }));
  const win = E.raceOutcome(qs, perfect, seed, 1);
  assert.equal(win.playerDistance, qs.length);
  assert.ok(win.botDistance <= qs.length);
  assert.ok(win.result === 'win');
  const none: AnswerRecord[] = qs.map((q) => ({ questionId: q.id, chosenIdx: (q.correct_idx + 1) % q.options.length, timeMs: 1000 }));
  const lose = E.raceOutcome(qs, none, E.raceSeed('b1', null, 5), 5);
  assert.equal(lose.result, 'lose');
  // duplicates ignored, absurd times capped
  const dup = E.raceOutcome(qs, [...perfect, ...perfect, { questionId: qs[0].id, chosenIdx: 0, timeMs: 9e12 }], seed, 1);
  assert.equal(dup.playerDistance, qs.length);
  assert.equal(dup.playerTimeMs, qs.length * 1000);
});

test('bot position advances over time and never passes the finish', () => {
  const plan = E.botPlan('p', 10, 4);
  const ms = E.botStepTimes(plan, plan.map(() => 30));
  const total = ms.reduce((a, b) => a + b, 0);
  const correct = plan.filter((s) => s.correct).length;
  let prev = 0;
  for (let t = 0; t <= total; t += total / 20) {
    const d = E.botPosition(plan, ms, t);
    assert.ok(d >= prev - 1e-9 && d <= correct + 1e-9);
    prev = d;
  }
  assert.equal(E.botPosition(plan, ms, total + 1), correct);
});

test('boat race: a player at 0 HP is not knocked out', () => {
  const config = { ...E.DEMO_CONFIG, scenario: 'boat_race' as const, level: 5 as const };
  const qs = E.fallbackPayload(6, 'race-hp').questions;
  const ctx = { questions: qs, config, scaling: E.computeScaling(config, qs.length), boss: E.DEMO_BOSS };
  const step = E.battleReducer(ctx);
  let s = step(E.initialBattleState(ctx), { type: 'START' });
  for (let i = 0; i < qs.length; i++) {
    s = step(s, { type: 'ANSWER', idx: (qs[s.idx].correct_idx + 1) % 4 });
    s = step(s, { type: 'NEXT' });
  }
  assert.equal(s.phase, 'result');
  assert.equal(s.answers.length, qs.length, 'all stretches rowed even with HP gone');
});

test('team race: even split by join order, scored per member', () => {
  const row = (n: string, correct: number, gems = 0) => ({ nickname: n, avatar: '🐣', correct, gems });
  const r = E.teamRace([row('a', 5), row('b', 3), row('c', 5), row('d', 3), row('e', 5)]);
  assert.equal(r.teams[0].members.length, 3);
  assert.equal(r.teams[1].members.length, 2);
  assert.equal(r.teams[0].distance, 5); // 15 / 3, odd head-count is not an advantage
  assert.equal(r.winner, 'A');
  assert.equal(E.teamRace([row('a', 4, 10), row('b', 4, 20)]).winner, 'B'); // tie → speed bonus
  assert.equal(E.teamRace([row('a', 4, 10), row('b', 4, 10)]).winner, 'draw');
  assert.ok(Math.abs(E.teamRace(Array.from({ length: 9 }, (_, i) => row(String(i), 1))).teams[0].members.length - 4) <= 1);
});
