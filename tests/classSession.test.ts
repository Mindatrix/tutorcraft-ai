import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as E from '../src/engine';
import { createSessionService } from '../src/server/sessionService';
import { MemorySessionStore } from '../src/server/sessionStore';
import type { LoadedBattle } from '../src/server/battles';

// WP7: inside a class match, a student's session follows the question schedule (C4.6–C4.10):
// questions open at the schedule's points (same second on every device), the server picks the
// question per student, a missed point is a timeout, and the golden challenge swaps in a harder one.

const T0 = 10_000_000;
const STAGE = 300_000;

function battle(): LoadedBattle {
  const questions = E.fallbackPayload(20, 'wp7').questions.map((q, i) => ({ ...q, difficulty: (['easy', 'medium', 'hard'] as const)[i % 3] }));
  return { id: 'class-1', code: 'WP7AAA', topic: 'WP7', config: { ...E.DEMO_CONFIG, mode: 'standard', classCode: 'L5A' }, boss: E.DEMO_BOSS, questions, tutorName: 'Cô Lan' };
}

const timeOf = (over: Partial<E.MatchTime> = {}): E.MatchTime => ({ status: 'running', startedAt: T0, pausedAt: null, pausedMs: 0, endedAt: null, stageMs: STAGE, coreStages: 6, extraStages: 2, extended: false, ...over });

/** A seed key whose stage 1 has a golden point (about 2 stages in 3 have one). */
function goldenSeed(): { seedKey: string; slot: E.QuestionSlot } {
  for (let i = 0; i < 200; i++) {
    const seedKey = `seed-${i}`;
    const slot = E.stageSlots(E.schedulePlanFor(timeOf(), seedKey, 20), 1).find((s) => s.golden);
    if (slot) return { seedKey, slot };
  }
  throw new Error('no golden seed');
}

function setup(seedKey = 'seed-x') {
  let clock = T0 - 1_000;
  let time = timeOf();
  const b = battle();
  const store = new MemorySessionStore();
  const svc = createSessionService({
    loadBattle: async (id) => (id === b.id ? b : null),
    storeFor: () => store,
    persistResult: async () => 'skipped',
    classSchedule: async (id) => (id === 'm1' ? { time, seedKey } : null),
    now: () => clock,
  });
  const join = async (name: string) => {
    const { token } = await svc.start({ battleId: b.id, variant: null, nickname: name, avatar: '🦊', studentKey: `k-${name}` });
    const sid = (await svc.student(token)).id;
    const rec = (await store.get(sid))!;
    await store.update({ ...rec, matchId: 'm1' }, rec.version);
    return token;
  };
  const key = (qid: number) => b.questions.find((q) => q.id === E.originalQuestionId(qid))!;
  return {
    svc,
    b,
    join,
    key,
    at: (ms: number) => void (clock = T0 + ms),
    setTime: (over: Partial<E.MatchTime>) => void (time = timeOf(over)),
    plan: () => E.schedulePlanFor(time, seedKey, 20),
  };
}

/** The right option of the question on screen (reviews come back with options reordered). */
function rightIdx(t: ReturnType<typeof setup>, view: { question: E.PublicQuestion | null }): number {
  const q = view.question!;
  const src = t.key(q.id);
  return q.options!.indexOf(src.options[src.correct_idx]);
}

describe('class session follows the question schedule', () => {
  it('no question before the point opens; every student sees the same point at the same second', async () => {
    const t = setup();
    const a = await t.join('An');
    const b = await t.join('Binh');
    t.at(5_000); // stage intro
    const va = await t.svc.current(a);
    const vb = await t.svc.current(b);
    assert.strictEqual(va.question, null);
    assert.strictEqual(va.slot?.id, 's1-1');
    assert.strictEqual(va.slot?.open, false);
    assert.strictEqual(va.slot?.opensAt, T0 + E.STAGE_INTRO_MS);
    assert.deepStrictEqual([vb.slot?.id, vb.slot?.opensAt], [va.slot?.id, va.slot?.opensAt]);
    await assert.rejects(t.svc.act(a, { kind: 'answer', questionId: 1, chosenIdx: 0 }), /Chưa tới điểm hỏi|không phải câu hiện tại/);
    // Totals follow the schedule (6 stages, chốt ×3), not the 20 questions of the material.
    assert.strictEqual(va.totalQuestions, E.classQuestionTotal({ time: timeOf(), plan: t.plan(), studentId: 'x', level: 3 }));
  });

  it('answers inside the open point, then waits for the next point', async () => {
    const t = setup();
    const a = await t.join('An');
    t.at(E.STAGE_INTRO_MS + 2_000);
    const v = await t.svc.current(a);
    assert.strictEqual(v.slot?.open, true);
    assert.ok(v.question);
    const res = await t.svc.act(a, { kind: 'answer', questionId: v.question!.id, chosenIdx: rightIdx(t, v) });
    assert.strictEqual(res.scored?.correct, true);
    assert.strictEqual(res.view.question, null, 'next question hidden until its point');
    assert.strictEqual(res.view.slot?.id, 's1-2');
    const s12 = E.stageSlots(t.plan(), 1)[1];
    assert.strictEqual(res.view.slot?.opensAt, T0 + s12.atMs);
  });

  it('a point that closes unanswered counts as a timeout and the student moves on', async () => {
    const t = setup();
    const a = await t.join('An');
    const [, s2, s3] = E.stageSlots(t.plan(), 1);
    t.at(s3.atMs + 1_000); // s1-1 and s1-2 passed without answers
    const v = await t.svc.current(a);
    assert.strictEqual(v.slot?.id, s3.id);
    assert.strictEqual(v.state.answers.length, 2);
    assert.ok(v.state.answers.every((x) => x.chosenIdx === -1));
    assert.ok(s2.closesMs <= s3.atMs);
  });

  it('a student who joins late skips the points before they joined', async () => {
    const t = setup();
    const s4 = E.stageSlots(t.plan(), 1)[3];
    t.at(s4.atMs - 1_000);
    const late = await t.join('Late');
    const v = await t.svc.current(late);
    assert.strictEqual(v.state.answers.length, 0);
    assert.strictEqual(v.slot?.id, s4.id);
  });

  it('a wrong answer comes back later (small pace: 20 questions)', async () => {
    const t = setup();
    const a = await t.join('An');
    const slots = E.stageSlots(t.plan(), 1);
    t.at(slots[0].atMs + 1_000);
    const v1 = await t.svc.current(a);
    const firstId = v1.question!.id;
    const wrong = (rightIdx(t, v1) + 1) % v1.question!.options!.length;
    await t.svc.act(a, { kind: 'answer', questionId: firstId, chosenIdx: wrong });
    const seen: number[] = [];
    for (const s of slots.slice(1)) {
      if (s.kind === 'chot') break;
      t.at(s.atMs + 1_000);
      const v = await t.svc.current(a);
      seen.push(v.question!.id);
      await t.svc.act(a, { kind: 'answer', questionId: v.question!.id, chosenIdx: rightIdx(t, v) });
    }
    assert.ok(seen.some((id) => E.originalQuestionId(id) === firstId && id !== firstId), `wrong question ${firstId} comes back with its own id, saw ${seen.join(',')}`);
  });

  it('pause freezes the points; the tutor ending the match ends the session with the points played', async () => {
    const t = setup();
    const a = await t.join('An');
    const s1 = E.stageSlots(t.plan(), 1)[0];
    t.at(s1.atMs + 1_000);
    t.setTime({ status: 'paused', pausedAt: T0 + s1.atMs + 1_000 });
    t.at(s1.atMs + 60_000);
    const paused = await t.svc.current(a);
    assert.strictEqual(paused.slot?.open, false);
    assert.strictEqual(paused.slot?.opensAt, null);
    t.setTime({ status: 'ended', endedAt: T0 + s1.atMs + 1_000 });
    const over = await t.svc.current(a);
    assert.strictEqual(over.state.phase, 'result');
    assert.strictEqual(over.state.answers.length, 0, 'the open point at the end is not counted');
    const fin = await t.svc.finalize(a);
    assert.strictEqual(fin.flagged, false);
    assert.strictEqual(fin.score?.answered ?? 0, 0);
  });

  it('golden challenge: only at a glowing open point, once, and the question gets harder', async () => {
    const { seedKey, slot } = goldenSeed();
    const t = setup(seedKey);
    const a = await t.join('An');
    // Not at a golden point → refused.
    const first = E.stageSlots(t.plan(), 1)[0];
    t.at(first.atMs + 1_000);
    await assert.rejects(t.svc.takeGolden(a), /vật phát sáng/);
    t.at(slot.atMs + 1_000);
    const before = await t.svc.current(a);
    assert.strictEqual(before.slot?.golden, true);
    const g = await t.svc.takeGolden(a);
    assert.strictEqual(g.view.slot?.goldenTaken, true);
    assert.strictEqual(g.view.slot?.golden, false);
    const rank = (d: E.Difficulty) => ['easy', 'medium', 'hard'].indexOf(d);
    assert.ok(rank(g.view.question!.difficulty) >= rank(before.question!.difficulty), 'never easier');
    assert.ok(rank(g.view.question!.difficulty) >= 2 || g.qid !== before.question!.id);
    await assert.rejects(t.svc.takeGolden(a), /vật phát sáng/);
    // The swapped question is the one that can be answered.
    const res = await t.svc.act(a, { kind: 'answer', questionId: g.qid!, chosenIdx: rightIdx(t, g.view) });
    assert.strictEqual(res.scored?.correct, true);
  });

  it('the chốt serves 3 questions back to back inside its window', async () => {
    const t = setup();
    const a = await t.join('An');
    const chot = E.stageSlots(t.plan(), 1).find((x) => x.kind === 'chot')!;
    let ms = chot.atMs + 500;
    for (let k = 0; k < 3; k++) {
      t.at(ms);
      const v = await t.svc.current(a);
      assert.strictEqual(v.slot?.id, chot.id);
      assert.strictEqual(v.slot?.chain, k);
      assert.strictEqual(v.slot?.open, true, `chốt question ${k + 1} open`);
      const res = await t.svc.act(a, { kind: 'answer', questionId: v.question!.id, chosenIdx: rightIdx(t, v) });
      assert.strictEqual(res.scored?.correct, true);
      ms += E.FEEDBACK_MS + 2_000;
    }
    t.at(ms);
    const after = await t.svc.current(a);
    assert.strictEqual(after.slot?.id, 's2-1', 'after the chốt: the next stage');
  });

  it('solo and demo sessions keep the material order (no schedule)', async () => {
    const t = setup();
    const { token, view } = await t.svc.start({ battleId: t.b.id, variant: null, nickname: 'Solo', avatar: '🐣', studentKey: 'solo' });
    t.at(1_000);
    const v = await t.svc.current(token);
    assert.strictEqual(v.slot, undefined);
    assert.ok(v.question);
    assert.strictEqual(view.totalQuestions, 20);
  });
});
