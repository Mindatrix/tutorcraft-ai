import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine';
import type { BattleCtx, BattleState, Question } from '../src/engine';

const wrong = (q: Question) => (q.correct_idx + 1) % q.options.length;

function ctxFor(n: number, mode: 'gamified' | 'standard' = 'gamified', questions?: Question[]): BattleCtx {
  const qs = questions ?? E.fallbackPayload(n, 'engine-test').questions;
  const config = { ...E.DEMO_CONFIG, mode };
  return { questions: qs, config, scaling: E.computeScaling(config, qs.length), boss: E.DEMO_BOSS };
}

function play(ctx: BattleCtx, picks: ('ok' | 'bad' | E.SkillId)[]): BattleState {
  const red = E.battleReducer(ctx);
  let s = red(E.initialBattleState(ctx), { type: 'START' });
  for (const p of picks) {
    if (p === 'shield' || p === 'freeze' || p === 'eye_of_truth') {
      s = red(s, { type: 'CAST', skill: p });
      continue;
    }
    const q = ctx.questions[s.idx];
    s = red(s, { type: 'ANSWER', idx: p === 'ok' ? q.correct_idx : wrong(q) });
    s = red(s, { type: 'NEXT' });
  }
  return s;
}

test('duration scaling follows the blueprint formula', () => {
  assert.equal(E.totalQuestions(1), 2);
  assert.equal(E.totalQuestions(10), 15);
  assert.equal(E.totalQuestions(30), 45);
  assert.equal(E.totalQuestions(99), 45);
  assert.equal(E.bossHp(15), 1500);
  assert.equal(E.bossHp(15, 4), 6000);
  assert.deepEqual([E.timeLimitFor('easy'), E.timeLimitFor('medium'), E.timeLimitFor('hard')], [30, 45, 60]);
  assert.equal(E.computeScaling({ durationMinutes: 10, scenario: 'homework', teamSize: 1 }, 7).bossHp, 700);
});

test('skills, variants, SM-2, codes', () => {
  assert.deepEqual([E.SKILLS.shield.cost, E.SKILLS.freeze.cost, E.SKILLS.eye_of_truth.cost], [50, 40, 60]);
  const qs = E.fallbackPayload(15, 't').questions;
  const v1 = E.buildVariant(qs, 'b1', 101);
  assert.deepEqual(v1, E.buildVariant(qs, 'b1', 101));
  assert.notDeepEqual(v1.map((q) => q.id), E.buildVariant(qs, 'b1', 102).map((q) => q.id));
  for (const q of v1) {
    const o = qs.find((x) => x.id === q.id)!;
    assert.equal(q.options[q.correct_idx], o.options[o.correct_idx]);
  }
  let r = E.nextReview(null, 1);
  const ladder = [r.interval_days];
  for (let i = 0; i < 4; i++) ladder.push((r = E.nextReview(r, 5)).interval_days);
  assert.deepEqual(ladder, [1, 3, 7, 14, 14]);
  for (let i = 0; i < 100; i++) {
    const c = E.generateBattleCode();
    assert.equal(E.normalizeBattleCode(c), c);
  }
  assert.equal(E.normalizeBattleCode(' k7q-2xm '), 'K7Q2XM');
});

test('combo critical, shield, DDA buff, timeout', () => {
  const ctx = ctxFor(6);
  let s = play(ctx, ['ok', 'ok', 'ok']);
  assert.equal(s.bossHp, ctx.scaling.bossHp - 350);
  // 10 + 20 + 30 from combos, plus quest rewards: Lightning (+20, instant answers) and
  // Unbreakable (+40, phase 2 reached without damage) — capped at MAX_MP.
  assert.equal(s.quests.find((q) => q.id === 'lightning')?.status, 'done');
  assert.equal(s.quests.find((q) => q.id === 'unbreakable')?.status, 'done');
  assert.equal(s.mp, E.MAX_MP);
  s = play(ctx, ['ok', 'ok', 'ok', 'shield', 'bad']);
  assert.equal(s.hp, 100);
  s = play(ctx, ['bad', 'bad']);
  assert.ok(s.miracle && s.removed.length === 2 && s.hintUnlocked);
  assert.ok(!s.removed.includes(ctx.questions[s.idx].correct_idx));
});

test('boss enters phase 2 at 50% HP with a story beat', () => {
  const ctx = ctxFor(6); // boss 600 HP
  const red = E.battleReducer(ctx);
  let s = red(E.initialBattleState(ctx), { type: 'START' });
  for (let i = 0; i < 3; i++) {
    s = red(s, { type: 'ANSWER', idx: ctx.questions[s.idx].correct_idx });
    if (i < 2) s = red(s, { type: 'NEXT' });
  }
  // 100 + 100 + 150 = 350 damage -> 250/600 left
  assert.equal(s.bossPhase, 2);
  assert.ok(s.event?.beats?.some((b) => b.kind === 'phase' && b.text.includes(E.DEMO_BOSS.phase2_name)));
});

test('3 wrong in a row enrages the boss and unlocks the next hint', () => {
  const ctx = ctxFor(15); // big enough to survive 3 misses
  const red = E.battleReducer(ctx);
  let s = red(E.initialBattleState(ctx), { type: 'START' });
  for (let i = 0; i < 3; i++) {
    s = red(s, { type: 'ANSWER', idx: wrong(ctx.questions[s.idx]) });
    if (i === 2) {
      assert.ok(s.enraged);
      assert.ok(s.event?.beats?.some((b) => b.kind === 'enrage'));
    }
    s = red(s, { type: 'NEXT' });
  }
  assert.ok(s.hintUnlocked);
  s = red(s, { type: 'ANSWER', idx: ctx.questions[s.idx].correct_idx });
  assert.equal(s.enraged, false);
});

test('side quest: perfect 3 on one topic frees the spirit beast', () => {
  const base = E.fallbackPayload(6, 'quest').questions;
  const qs = base.map((q, i) => ({ ...q, topic: i < 3 ? 'sentence transformation' : q.topic }));
  const ctx = ctxFor(6, 'gamified', qs);
  const quests = E.initialBattleState(ctx).quests;
  assert.ok(quests.find((q) => q.id === 'spirit_beast'));
  const s = play(ctx, ['ok', 'ok', 'ok']);
  const beast = s.quests.find((q) => q.id === 'spirit_beast')!;
  assert.equal(beast.status, 'done');
  assert.equal(E.questGems(s.quests) >= 30, true);
  const failed = play(ctx, ['ok', 'bad']).quests.find((q) => q.id === 'spirit_beast')!;
  assert.equal(failed.status, 'failed');
  // Standard mode has no quests (distraction-free)
  assert.equal(E.initialBattleState(ctxFor(6, 'standard', qs)).quests.length, 0);
});

test('quest gems are added to the score', () => {
  const qs = E.fallbackPayload(4, 's').questions;
  const cfg = E.DEMO_CONFIG;
  const plain = E.scoreBattle(qs, [], cfg);
  const bonus = E.scoreBattle(qs, [], cfg, E.DEFAULT_EXPECTED_ACCURACY, 30);
  assert.equal(bonus.gems - plain.gems, 30);
  assert.equal(bonus.questGems, 30);
});

test('boss validation fills phase fields', () => {
  const fb = E.defaultBoss('Past Simple', ['genshin']);
  const b = E.sanitizeBoss({ boss_name: 'X', boss_avatar: 'unicorn', phase2_name: 'Y' }, fb);
  assert.equal(b.boss_avatar, fb.boss_avatar);
  assert.equal(b.phase2_name, 'Y');
  assert.equal(b.enrage_dialogue, fb.enrage_dialogue);
  assert.ok(E.GEMINI_RESPONSE_SCHEMA.properties.enrage_dialogue);
});

test('animation profiles: validation clamps, keyframes derive timing', () => {
  const p = E.validateAnimationProfile({ id: 'x', heroAttack: { windupMs: -50, travelMs: 99999 }, camera: { critical: { zoom: 9 } } });
  assert.equal(p.heroAttack.windupMs, 0);
  assert.equal(p.heroAttack.travelMs, 1500);
  assert.equal(p.camera.critical.zoom, 1.6);
  const derived = E.profileFromKeyframes(
    [
      { t: 1000, type: 'attack_start' },
      { t: 1500, type: 'hitframe' },
      { t: 3000, type: 'attack_start' },
      { t: 3500, type: 'hitframe' },
      { t: 1510, type: 'shake', value: 14, durationMs: 300 },
      { t: 3510, type: 'zoom', value: 1.2, durationMs: 500, focus: 'hero' },
    ],
    { id: 'clip', name: 'Clip' },
  );
  assert.equal(derived.bossAttack.windupMs + derived.bossAttack.travelMs, 500);
  assert.equal(derived.shake.playerHit.magnitude, 14);
  assert.equal(derived.camera.critical.zoom, 1.2);
  assert.equal(derived.camera.critical.focus, 'hero');
  assert.equal(derived.keyframes?.length, 6);
  assert.equal(E.animationFor('golem').id, 'golem');
});

test('anti-cheat: human timing passes, bot timing is flagged', () => {
  const q = { question: 'She _____ to London three times this year.', options: ['has been', 'went', 'has gone', 'is going'], skill_tag: 'grammar' as const };
  const min = E.minPlausibleMs(q);
  assert.ok(min >= 700 && min <= 6000);
  const human = Array.from({ length: 10 }, (_, i) => ({ questionId: i, elapsedMs: min + 2000, minPlausibleMs: min, timedOut: false }));
  assert.equal(E.assessTimings(human).flagged, false);
  const bot = Array.from({ length: 10 }, (_, i) => ({ questionId: i, elapsedMs: 150, minPlausibleMs: min, timedOut: false }));
  const v = E.assessTimings(bot);
  assert.equal(v.flagged, true);
  assert.ok(v.reasons.length >= 2);
  // timeouts are never "too fast"
  const timeouts = bot.map((t) => ({ ...t, timedOut: true }));
  assert.equal(E.assessTimings(timeouts).flagged, false);
});
