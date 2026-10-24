import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine';
import type { BattleCtx, Grade, Question } from '../src/engine';
import { createSessionService, phraseHash } from '../src/server/sessionService';
import { MemorySessionStore } from '../src/server/sessionStore';
import type { LoadedBattle } from '../src/server/battles';

const byType = (t: E.QuestionType, topic?: string) =>
  ({ ...E.TYPED_BANK.find((q) => q.type === t && (!topic || q.topic === topic))!, id: 1 }) as Question;

// ---------- normalization (IV) ----------

test('normalization: spaces, case, smart quotes, contractions, punctuation', () => {
  assert.equal(E.normalizeText('  I   DIDN’T\tgo!! '), "I DIDN'T go!!");
  assert.equal(E.normalizeForCompare('  I   DIDN’T\tgo!! '), 'i did not go');
  assert.equal(E.normalizeForCompare("This school was built in 1998."), E.normalizeForCompare('this school WAS built in 1998'));
  assert.equal(E.normalizeForCompare("won't"), 'will not');
  assert.equal(E.normalizeForCompare('well-known'), 'well-known');
  assert.equal(E.wordCount('  one, two  three. '), 3);
  assert.equal(E.normalizeText(42), '');
});

// ---------- weights / Boss HP ----------

test('Boss HP: mcq stays Q×100, essays/reading weigh 2–3×, difficulty scales open formats', () => {
  const mcq = E.fallbackPayload(5, 'w').questions;
  assert.equal(E.bossHpForQuestions(mcq), 500);
  const essay = { type: 'essay', difficulty: 'medium' } as const;
  assert.equal(E.questionShare(essay), 300);
  assert.equal(E.questionShare({ type: 'essay', difficulty: 'hard' }), 375);
  assert.equal(E.questionShare({ type: 'reading', difficulty: 'medium' }), 250);
  assert.equal(E.questionShare({ type: 'mcq', difficulty: 'hard' }), 100, 'mcq ignores difficulty');
  assert.equal(E.computeScaling(E.DEMO_CONFIG, 2, [essay, { type: 'mcq', difficulty: 'easy' }]).bossHp, 400);
  assert.equal(E.plannedQuestionCount(10, ['mcq']), 15, 'blueprint formula unchanged');
  assert.ok(E.plannedQuestionCount(10, ['mcq', 'essay']) < 15);
  assert.ok(E.questionTimeLimit(essay) > E.questionTimeLimit({ type: 'mcq', difficulty: 'medium' }));
});

// ---------- graders ----------

test('cloze grader: per-gap, case-insensitive', () => {
  const q = byType('cloze', 'past simple');
  assert.equal(E.gradeCloze(q, ['WENT', ' played ']).score, 1);
  assert.equal(E.gradeCloze(q, ['went', 'play']).score, 0.5);
  assert.equal(E.gradeCloze(q, 'nope').score, 0);
});

test('transform grader: exact variants, partial credit, cue word required', () => {
  const q = byType('transform', 'passive voice');
  assert.equal(E.gradeTransform(q, 'this school was built in 1998').score, 1);
  assert.equal(E.gradeTransform(q, 'This school was built by them in 1998!').score, 1);
  const partial = E.gradeTransform(q, 'This school was build in 1998.');
  assert.ok(partial.score > 0.3 && partial.score < 1, `partial ${partial.score}`);
  const noCue = E.gradeTransform(q, 'This school is from 1998.');
  assert.ok(noCue.score <= 0.5);
  assert.equal(E.gradeTransform(q, '').score, 0);
  assert.deepEqual(E.matchedKeyPhrases(q.key_phrases!, 'this school WAS BUILT'), ['this school', 'was built']);
});

test('reorder grader: exact, partial positions, invalid permutation', () => {
  const q = byType('reorder', 'present continuous'); // She is reading a book now.
  assert.equal(E.gradeReorder(q, [0, 1, 2, 3, 4, 5]).score, 1);
  const swapped = E.gradeReorder(q, [1, 0, 2, 3, 4, 5]);
  assert.ok(swapped.score > 0.4 && swapped.score < 0.8);
  assert.equal(E.gradeReorder(q, [0, 0, 1]).score, 0);
});

test('matching score and open-answer fallback grader', () => {
  assert.equal(E.matchingScore(4, 4, 0), 1);
  assert.equal(E.matchingScore(4, 4, 2), 0.7);
  assert.equal(E.matchingScore(4, 4, 10), 0.3);
  const reading = byType('reading');
  const good = E.gradeOpenFallback(reading, 'Patience and hard work bring results. Do not give up when others laugh, and keep learning from mistakes.');
  const weak = E.gradeOpenFallback(reading, 'The garden is nice.');
  assert.ok(good.score > weak.score, `${good.score} > ${weak.score}`);
  assert.equal(good.by, 'fallback');
  assert.equal(E.gradeOpenFallback(reading, '   ').score, 0);
});

// ---------- validation & Studio conversion ----------

test('typed validation rejects broken questions with a reason', () => {
  assert.equal(E.sanitizeQuestion({ type: 'matching', question: 'x', pairs: [{ left: 'a', right: 'b' }, { left: 'A', right: 'c' }] }, 1), null, 'duplicate lefts');
  assert.equal(E.sanitizeQuestion({ type: 'cloze', question: 'x', text: 'a {{1}} b {{2}}', gaps: [{ answers: ['x'] }] }, 1), null, 'gap count');
  const reorder = E.sanitizeQuestion({ type: 'reorder', question: 'x', answers: ['I like green tea.'] }, 1)!;
  assert.deepEqual(reorder.tokens, ['I', 'like', 'green', 'tea.']);
  const cloze = E.sanitizeQuestion({ type: 'cloze', question: 'x', text: 'I {{1}} it', gaps: [{ answers: ['like'] }], word_bank: ['love'] }, 1)!;
  assert.ok(cloze.word_bank!.includes('like'), 'answer added to word bank');
  assert.match(E.questionProblem({ ...byType('reading'), passage: 'short' })!, /đoạn văn/);
  assert.equal(E.questionProblem(byType('essay')), null);
});

test('Studio type switch carries the answer over', () => {
  const mcq = E.fallbackPayload(30, 'conv').questions.find((q) => q.question.includes('The bridge'))!;
  const cloze = E.convertQuestion(mcq, 'cloze');
  assert.equal(cloze.text, 'The bridge {{1}} in 1990.');
  assert.deepEqual(cloze.gaps, [{ answers: ['was built'] }]);
  assert.equal(E.questionProblem(cloze), null);
  const reorder = E.convertQuestion(mcq, 'reorder');
  assert.deepEqual(reorder.tokens, ['The', 'bridge', 'was', 'built', 'in', '1990.']);
  assert.equal(E.questionProblem(E.convertQuestion(mcq, 'matching')), 'Nối cặp cần ít nhất 2 cặp đầy đủ');
  assert.equal(E.convertQuestion(cloze, 'mcq').options.length, 4);
});

// ---------- reducer ----------

function ctxOf(questions: Question[]): BattleCtx {
  return { questions, config: E.DEMO_CONFIG, scaling: E.computeScaling(E.DEMO_CONFIG, questions.length, questions), boss: E.DEMO_BOSS, seed: 7 };
}

test('essay: graded score → damage, ≥90% is CRITICAL, low score chips + boss hits back', () => {
  const essay = { ...byType('essay'), id: 1 };
  const ctx = ctxOf([essay, { ...byType('essay'), id: 2 }]);
  const red = E.battleReducer(ctx);
  let s = red(E.initialBattleState(ctx), { type: 'START' });
  const share = E.questionShare(essay);
  s = red(s, { type: 'ANSWER', idx: 0, grade: { score: 0.95, by: 'ai' }, response: 'text' });
  assert.equal(s.event?.kind, 'critical');
  assert.equal(s.answers[0].damage, Math.round(share * 0.95 * 1.5));
  assert.equal(s.answers[0].response, 'text');
  s = red(s, { type: 'NEXT' });
  s = red(s, { type: 'ANSWER', idx: 0, grade: { score: 0.4, by: 'ai' } });
  assert.equal(s.event?.kind, 'wrong');
  assert.equal(s.answers[1].damage, Math.round(share * 0.4 * 0.5));
  assert.equal(s.hp, 100 - ctx.scaling.wrongPenalty);
});

test('matching: each right pair is a combo hit, wrong pair is blocked, last pair fires the Ultimate', () => {
  const m = { ...byType('matching', 'past simple'), id: 1 }; // 4 pairs
  const ctx = ctxOf([m, { ...byType('cloze'), id: 2 }]);
  const red = E.battleReducer(ctx);
  let s = red(E.initialBattleState(ctx), { type: 'START' });
  s = red(s, { type: 'PAIR', left: 0, right: 1 });
  assert.equal(s.event?.kind, 'miss');
  assert.equal(s.match?.wrong, 1);
  for (const i of [0, 1, 2]) {
    s = red(s, { type: 'PAIR', left: i, right: i });
    assert.equal(s.event?.kind, 'correct');
  }
  assert.equal(s.combo, 3);
  assert.equal(red(s, { type: 'PAIR', left: 0, right: 0 }), s, 'already matched = no-op');
  s = red(s, { type: 'PAIR', left: 3, right: 3 });
  assert.equal(s.event?.kind, 'ultimate');
  assert.notEqual(s.selected, null, 'question locked in');
  assert.equal(s.answers[0].score, 0.85);
  assert.equal(ctx.scaling.bossHp - s.bossHp, s.answers[0].damage, 'recorded damage = all hits');
});

test('Eye of Truth on an open question unlocks the hint instead of removing options', () => {
  const qs = [E.fallbackPayload(3, 'eye').questions[0], E.fallbackPayload(3, 'eye').questions[1], E.fallbackPayload(3, 'eye').questions[2], { ...byType('transform'), id: 9 }];
  const ctx = ctxOf(qs.map((q, i) => ({ ...q, id: i + 1 })));
  const red = E.battleReducer(ctx);
  let s = red(E.initialBattleState(ctx), { type: 'START' });
  for (let i = 0; i < 3; i++) {
    s = red(s, { type: 'ANSWER', idx: ctx.questions[s.idx].correct_idx });
    s = red(s, { type: 'NEXT' });
  }
  assert.equal(E.questionType(ctx.questions[s.idx]), 'transform');
  s = red(s, { type: 'CAST', skill: 'eye_of_truth' });
  assert.equal(s.hintUnlocked, true);
  assert.deepEqual(s.removed, []);
});

test('scoring: Gems/EXP scale with format weight and graded score', () => {
  const essay = { ...byType('essay'), id: 1 };
  const one = E.scoreBattle([essay], [{ questionId: 1, chosenIdx: 0, timeMs: 60000, score: 1, damage: 300 }], E.DEMO_CONFIG, 2);
  assert.equal(one.correct, 1);
  assert.equal(one.damage, 300);
  assert.equal(one.gems, 30 + 5 + 50, 'weight 3 × 10 + combo + boss defeated');
  assert.equal(one.exp, 45);
});

// ---------- server: hidden answers, mapping, grading, paste detection ----------

const FORBIDDEN = ['correct_idx', 'correctIdx', 'explanation', 'pairs', 'answers', 'tokens', 'key_phrases', 'sample_answer', 'rubric', 'deep_insight', 'gaps', 'word_bank', 'key_points'];

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

function typedBattle(): LoadedBattle {
  return {
    id: 'typed-1',
    code: 'TYP234',
    topic: 'Formats',
    config: { ...E.DEMO_CONFIG, classCode: 'K1' },
    boss: E.DEMO_BOSS,
    questions: E.demoQuestions(),
    tutorName: 'Cô Lan',
  };
}

function setupTyped(gradeOpen?: (q: Question, t: string) => Promise<Grade>) {
  let clock = 5_000_000;
  const b = typedBattle();
  const persisted: unknown[] = [];
  const svc = createSessionService({
    loadBattle: async () => b,
    storeFor: () => store,
    persistResult: async (r) => (persisted.push(r), true),
    gradeOpen,
    now: () => clock,
  });
  const store = new MemorySessionStore();
  return { svc, b, persisted, advance: (ms: number) => (clock += ms), start: () => svc.start({ battleId: b.id, variant: null, nickname: 'K', avatar: '🦊', studentKey: 'k' }) };
}

/** Correct payload for the current public question, using only what the server keeps. */
function rightAnswer(b: LoadedBattle, pq: E.PublicQuestion): Record<string, unknown> {
  const q = b.questions.find((x) => x.id === pq.id)!;
  switch (pq.type) {
    case 'mcq': return { chosenIdx: q.correct_idx };
    case 'cloze': return { response: q.gaps!.map((g) => g.answers[0]) };
    case 'transform': return { response: q.answers![0] };
    case 'reorder': {
      const used = new Set<number>();
      return { response: q.tokens!.map((tok) => { const c = pq.chips!.find((x) => x.text === tok && !used.has(x.id))!; used.add(c.id); return c.id; }) };
    }
    default: return { response: q.sample_answer ?? 'An answer.' };
  }
}

/** Answer correctly, at human pace, until a question of `type` comes up. */
async function playUntil(t: ReturnType<typeof setupTyped>, token: string, first: E.PublicQuestion, type: E.QuestionType): Promise<E.PublicQuestion> {
  let pq = first;
  while (pq.type !== type) {
    t.advance(30_000);
    let res;
    if (pq.type === 'matching') {
      const q = t.b.questions.find((x) => x.id === pq.id)!;
      for (let left = 0; left < q.pairs!.length; left++) {
        res = await t.svc.act(token, { kind: 'pair', questionId: pq.id, left, right: pq.rightItems!.find((r) => r.text === q.pairs![left].right)!.id });
      }
    } else {
      res = await t.svc.act(token, { kind: 'answer', questionId: pq.id, ...rightAnswer(t.b, pq) });
    }
    t.advance(E.FEEDBACK_MS);
    pq = res!.view.question!;
  }
  return pq;
}

test('every format: the public view never carries the answer key', async () => {
  const t = setupTyped(async () => ({ score: 0.95, by: 'ai' }));
  const { token, view } = await t.start();
  let pq = view.question;
  let seen = 0;
  while (pq) {
    const leaked = FORBIDDEN.filter((k) => keysOf(pq).has(k));
    assert.deepEqual(leaked, [], `${pq.type} leaks ${leaked.join(',')}`);
    if (pq.type === 'reorder') assert.notDeepEqual(pq.chips!.map((c) => c.text), t.b.questions.find((q) => q.id === pq!.id)!.tokens, 'chips are shuffled');
    if (pq.type === 'transform') assert.equal(pq.keyHashes![0], phraseHash(pq.salt!, t.b.questions.find((q) => q.id === pq!.id)!.key_phrases![0]));
    seen++;
    t.advance(30_000);
    let res;
    if (pq.type === 'matching') {
      const q = t.b.questions.find((x) => x.id === pq!.id)!;
      for (let left = 0; left < q.pairs!.length; left++) {
        const right = pq.rightItems!.find((r) => r.text === q.pairs![left].right)!.id;
        res = await t.svc.act(token, { kind: 'pair', questionId: pq.id, left, right });
      }
      assert.equal(res!.afterAnswer?.event?.kind, 'ultimate');
      assert.ok(res!.reveal?.deepInsight);
    } else {
      res = await t.svc.act(token, { kind: 'answer', questionId: pq.id, ...rightAnswer(t.b, pq) });
      assert.ok((res.reveal?.score ?? 0) >= E.PASS_SCORE, `${pq.type} graded ${res.reveal?.score}`);
    }
    t.advance(E.FEEDBACK_MS);
    pq = res!.view.question;
  }
  assert.equal(seen, 8);
  const fin = await t.svc.finalize(token);
  assert.equal(fin.flagged, false);
  assert.equal(fin.score?.correct, 8);
  assert.equal(fin.score?.bossDefeated, true);
});

test('client-sent score is ignored; essay uses the server grader', async () => {
  const t = setupTyped(async () => ({ score: 0.2, by: 'ai', feedback: 'x' }));
  const { token, view } = await t.start();
  const pq = await playUntil(t, token, view.question!, 'essay');
  t.advance(60_000);
  const res = await t.svc.act(token, { kind: 'answer', questionId: pq.id, response: 'My weekend was great.', score: 1 } as never);
  assert.equal(res.reveal?.score, 0.2);
});

test('pasted essay (100 words in 3 s) is flagged as too fast to type', async () => {
  const t = setupTyped(async () => ({ score: 1, by: 'ai' }));
  const { token, view } = await t.start();
  const pq = await playUntil(t, token, view.question!, 'essay');
  t.advance(3000);
  const essay = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
  await t.svc.act(token, { kind: 'answer', questionId: pq.id, response: essay });
  const fin = await t.svc.finalize(token);
  assert.equal(fin.flagged, true);
  assert.equal(t.persisted.length, 0);
});

test('matching pairs are checked on the server with shuffled display ids', async () => {
  const t = setupTyped();
  const { token, view } = await t.start();
  t.advance(30_000);
  const first = await t.svc.act(token, { kind: 'answer', questionId: view.question!.id, chosenIdx: 0 });
  t.advance(E.FEEDBACK_MS);
  const pq = first.view.question!;
  assert.equal(pq.type, 'matching');
  // id === left index must not imply a match (ids are positions in the shuffled list)
  const q = t.b.questions.find((x) => x.id === pq.id)!;
  const wrongId = pq.rightItems!.find((r) => r.text !== q.pairs![0].right)!.id;
  const miss = await t.svc.act(token, { kind: 'pair', questionId: pq.id, left: 0, right: wrongId });
  assert.equal(miss.view.state.event?.kind, 'miss');
  assert.equal(miss.afterAnswer, null);
  const rightId = pq.rightItems!.find((r) => r.text === q.pairs![0].right)!.id;
  const hit = await t.svc.act(token, { kind: 'pair', questionId: pq.id, left: 0, right: rightId });
  assert.deepEqual(hit.view.question!.matched, [{ left: 0, right: rightId }]);
  await assert.rejects(() => t.svc.act(token, { kind: 'pair', questionId: pq.id, left: 0, right: rightId }), (e: { status: number }) => e.status === 409);
});

test('AI format plan: every chosen format appears, writing tasks capped and spread', () => {
  assert.deepEqual(E.planQuestionTypes(['mcq'], 3), ['mcq', 'mcq', 'mcq']);
  const plan = E.planQuestionTypes(['mcq', 'cloze', 'matching', 'essay'], 7);
  for (const t of ['mcq', 'cloze', 'matching', 'essay'] as const) assert.ok(plan.includes(t), `${t} missing`);
  assert.ok(plan.filter((t) => t === 'essay').length <= 2);
  assert.notEqual(plan[0], 'essay', 'battle does not open with a writing task');
  assert.deepEqual(E.planQuestionTypes(['essay', 'reading'], 3).length, 3);
});
