import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOT_QUESTIONS,
  QUESTION_SLOT_MS,
  STAGE_INTRO_MS,
  STAGE_OUTRO_MS,
  adaptState,
  applyControl,
  clockOffsetNtp,
  matchSlots,
  newMatchTime,
  paceTier,
  pickForSlot,
  reviewForm,
  scheduleAt,
  schedulePlanFor,
  stageSlots,
  type AskedRecord,
  type MatchTime,
  type Question,
  type QuestionSlot,
} from '../src/engine';

const mcq = (id: number, difficulty: Question['difficulty'] = 'medium'): Question => ({
  id,
  question: `Q${id}`,
  options: [`a${id}`, `b${id}`, `c${id}`, `d${id}`],
  correct_idx: id % 4,
  difficulty,
  topic: 't',
  skill_tag: 'vocabulary',
  hint: `nghĩa ${id}`,
});
const material = (n: number) => Array.from({ length: n }, (_, i) => mcq(i + 1, (['easy', 'medium', 'hard'] as const)[i % 3]));

function running(start = 1_000_000): MatchTime {
  const r = applyControl(newMatchTime(), 'start', start);
  assert.ok(r.ok);
  return r.time;
}

test('C4.6 a stage: 20 s opening, points, a 3-question chốt, the last 25 s for the summary', () => {
  for (const n of [20, 45, 90]) {
    const plan = schedulePlanFor(newMatchTime(), 'm1', n);
    for (let stage = 1; stage <= 6; stage++) {
      const slots = stageSlots(plan, stage);
      const start = (stage - 1) * plan.stageMs;
      assert.equal(slots[0].atMs - start, STAGE_INTRO_MS, 'first point right after the opening');
      const chot = slots[slots.length - 1];
      assert.equal(chot.kind, 'chot');
      assert.equal(chot.questions, CHOT_QUESTIONS);
      assert.equal(start + plan.stageMs - chot.closesMs, STAGE_OUTRO_MS, 'summary keeps the last 25 s');
      assert.ok(chot.closesMs - chot.atMs >= CHOT_QUESTIONS * QUESTION_SLOT_MS - 1);
      // No two questions overlap: each regular point has its full 25 s + feedback.
      for (let i = 1; i < slots.length; i++) assert.ok(slots[i].atMs - slots[i - 1].atMs >= QUESTION_SLOT_MS, `${n}: ${slots[i].id}`);
    }
  }
});

test('C4.7 pace: 20 / 45 / 90 questions give the right number of points over a 30-minute match', () => {
  const report: Record<number, { perStage: number[]; avgGapS: number; total: number }> = {};
  for (const n of [20, 45, 90]) {
    const plan = schedulePlanFor(newMatchTime(), `pace-${n}`, n);
    const slots = matchSlots(plan);
    const perStage = [1, 2, 3, 4, 5, 6].map((s) => slots.filter((x) => x.stage === s).reduce((k, x) => k + x.questions, 0));
    const total = perStage.reduce((a, b) => a + b, 0);
    report[n] = { perStage, avgGapS: Math.round(((plan.stageMs - STAGE_INTRO_MS - STAGE_OUTRO_MS) / (total / 6)) / 100) / 10, total };
    assert.equal(slots[slots.length - 1].closesMs, 6 * plan.stageMs - STAGE_OUTRO_MS, 'a 30-minute match');
  }
  assert.equal(paceTier(90), 'large');
  assert.equal(paceTier(45), 'medium');
  assert.equal(paceTier(20), 'small');
  for (const k of report[90].perStage) assert.ok(k === 8 || k === 9, `90: ${k}`);
  assert.ok(report[90].avgGapS >= 27 && report[90].avgGapS <= 33, `90 → ~30 s, got ${report[90].avgGapS}`);
  for (const n of [45, 20]) for (const k of report[n].perStage) assert.equal(k, 7, `${n}: ${k}`);
  assert.ok(report[45].avgGapS >= 33 && report[45].avgGapS <= 38, `45 → ~35 s, got ${report[45].avgGapS}`);
  console.log('C4.7 pace', JSON.stringify(report));
});

test('C4.6 fifty devices see the same point in the same second (NTP offsets), through a pause and "Kéo dài"', () => {
  const start = 5_000_000;
  let t = running(start);
  const plan = schedulePlanFor(t, 'class-50', 45);
  // 50 devices, each with its own wrong local clock (±3 min) and network delays; each estimates its
  // offset with NTP like matchChannel does, then turns its local clock into server time.
  const devices = Array.from({ length: 50 }, (_, i) => {
    const skew = ((i * 7919) % 360_000) - 180_000;
    const up = 20 + ((i * 31) % 180);
    const down = 20 + ((i * 17) % 180);
    // server = local + skew
    const t0 = 0;
    const t1 = t0 + skew + up;
    const t2 = t1 + 15;
    const t3 = t2 + down - skew;
    const { offset } = clockOffsetNtp(t0, t1, t2, t3);
    return { skew, offset };
  });
  const seenOpen = (serverNow: number, time: MatchTime) =>
    devices.map((d) => {
      const local = serverNow - d.skew;
      return scheduleAt(time, local + d.offset, plan);
    });
  const firstPoint = stageSlots(plan, 2)[1];
  const opens = start + firstPoint.atMs;
  // One second after opening every device shows the same slot and the same opening instant.
  const views = seenOpen(opens + 1000, t);
  for (const v of views) {
    assert.equal(v.slot?.id, firstPoint.id);
    assert.equal(v.opensAt, opens);
  }
  const errors = devices.map((d) => Math.abs(d.offset - d.skew));
  assert.ok(Math.max(...errors) < 100, `clock error ${Math.max(...errors)} ms`);

  // Pause 47 s just before the point: it opens exactly 47 s later for everyone.
  const p = applyControl(t, 'pause', opens - 5000);
  assert.ok(p.ok);
  const paused = seenOpen(opens + 20_000, p.time);
  for (const v of paused) {
    assert.equal(v.paused, true);
    assert.equal(v.slot, null);
    assert.equal(v.next?.id, firstPoint.id);
  }
  const r = applyControl(p.time, 'resume', opens - 5000 + 47_000);
  assert.ok(r.ok);
  t = r.time;
  for (const v of seenOpen(opens + 47_000 + 1000, t)) {
    assert.equal(v.slot?.id, firstPoint.id);
    assert.equal(v.opensAt, opens + 47_000);
  }
  // "Kéo dài": stage 7 appears, no earlier point moves.
  const before = matchSlots(plan, false);
  const e = applyControl(t, 'extend', opens + 60_000);
  assert.ok(e.ok);
  const after = matchSlots(plan, true);
  assert.deepEqual(after.slice(0, before.length), before);
  assert.ok(after.some((s) => s.stage === 7) && after.some((s) => s.stage === 8));
  const s7 = stageSlots(plan, 7)[0];
  const at7 = start + 47_000 + s7.atMs + 500;
  for (const v of seenOpen(at7, e.time)) assert.equal(v.slot?.id, s7.id);
});

test('C4.6 phases: lobby, opening, between points, summary, ended', () => {
  const t = running(0);
  const plan = schedulePlanFor(t, 'phases', 20);
  assert.equal(scheduleAt(newMatchTime(), 0, plan).phase, 'lobby');
  assert.equal(scheduleAt(t, 5_000, plan).phase, 'intro');
  assert.equal(scheduleAt(t, STAGE_INTRO_MS + 500, plan).phase, 'question');
  const s1 = stageSlots(plan, 1);
  assert.equal(scheduleAt(t, s1[0].closesMs + 500, plan).phase, 'play');
  assert.equal(scheduleAt(t, s1[s1.length - 1].atMs + 100, plan).phase, 'chot');
  assert.equal(scheduleAt(t, plan.stageMs - 10_000, plan).phase, 'outro');
  assert.equal(scheduleAt(t, 6 * plan.stageMs + 1, plan).phase, 'ended');
});

test('C4.7 small tier: 3–4 new questions per stage and the wrong ones come back in another form', () => {
  const qs = material(20);
  const plan = schedulePlanFor(newMatchTime(), 'small', 20);
  const history: AskedRecord[] = [];
  const newPerStage: number[] = [];
  let reviews = 0;
  for (let stage = 1; stage <= 6; stage++) {
    let fresh = 0;
    for (const slot of stageSlots(plan, stage)) {
      for (let k = 0; k < slot.questions; k++) {
        const p = pickForSlot({ questions: qs, plan, slot, chainIndex: k, studentId: 'em-a', level: 3, history })!;
        if (!p.review) fresh += 1;
        else {
          reviews += 1;
          assert.ok(p.form);
          assert.ok(history.some((h) => h.qid === p.qid), 'a review is of a question already asked');
        }
        // This student gets every 3rd question wrong the first time.
        history.push({ qid: p.qid, slotId: slot.id, correct: p.review || p.qid % 3 !== 0 });
      }
    }
    newPerStage.push(fresh);
  }
  for (const k of newPerStage) assert.ok(k === 3 || k === 4, `new per stage ${newPerStage}`);
  assert.equal(newPerStage.reduce((a, b) => a + b, 0), 20);
  assert.ok(reviews >= 20, `${reviews} reviews`);
  assert.equal(new Set(history.map((h) => h.qid)).size, 20, 'all 20 questions asked');
  // Every question missed came back later, and the first one back was a missed one.
  for (const qid of [3, 6, 9, 12, 15, 18]) {
    const first = history.findIndex((h) => h.qid === qid);
    assert.ok(history.slice(first + 1).some((h) => h.qid === qid), `q${qid} came back`);
  }
  console.log('C4.7 small tier: new per stage', newPerStage.join(','), '· reviews', reviews);
});

test('C4.7 review form: the same question with its options moved (or cut to two), key kept right', () => {
  for (let id = 1; id <= 40; id++) {
    const q = mcq(id);
    const { form, question } = reviewForm(q, `seed-${id}`);
    assert.ok(form === 'reordered' || form === 'two_choice');
    assert.equal(question.options[question.correct_idx], q.options[q.correct_idx], 'answer key follows the option');
    assert.notEqual(question.options.join('|'), q.options.join('|'), 'another form');
    assert.ok(question.is_review);
    if (form === 'two_choice') assert.equal(question.options.length, 2);
    else assert.notEqual(question.correct_idx, q.correct_idx, 'the right option moved');
  }
});

test('C4.10 two students of different levels: same point, same second, different question', () => {
  const qs = material(45);
  const t = running(0);
  const plan = schedulePlanFor(t, 'levels', 45);
  const slot: QuestionSlot = stageSlots(plan, 2)[2];
  const at = scheduleAt(t, slot.atMs + 200, plan);
  assert.equal(at.slot?.id, slot.id);
  const low = pickForSlot({ questions: qs, plan, slot, studentId: 'em-low', level: 1, history: [] })!;
  const high = pickForSlot({ questions: qs, plan, slot, studentId: 'em-high', level: 5, history: [] })!;
  assert.equal(low.difficulty, 'easy');
  assert.equal(high.difficulty, 'hard');
  assert.notEqual(low.qid, high.qid);
  // Both from stage 2's part of the material.
  for (const p of [low, high]) assert.ok(p.qid > 7 && p.qid <= 15, `qid ${p.qid}`);
});

test('C4.8 self-balancing: 2 wrong → easier + automatic hint; 3 right → combo', () => {
  assert.deepEqual(adaptState([true, false, false]), { rightInRow: 0, wrongInRow: 2, easier: true, autoHint: true, combo: 0 });
  assert.equal(adaptState([false]).easier, false);
  assert.equal(adaptState([false, false, true]).easier, false, 'a right answer ends it');
  assert.equal(adaptState([true, true]).combo, 0);
  assert.equal(adaptState([false, true, true, true]).combo, 1);
  assert.equal(adaptState([true, true, true, true, true]).combo, 3);
  // The easier flag really picks an easier question.
  const qs = material(45);
  const plan = schedulePlanFor(newMatchTime(), 'easier', 45);
  const slot = stageSlots(plan, 1)[1];
  const normal = pickForSlot({ questions: qs, plan, slot, studentId: 'x', level: 3, history: [] })!;
  const easy = pickForSlot({ questions: qs, plan, slot, studentId: 'x', level: 3, history: [], easier: true })!;
  assert.equal(normal.difficulty, 'medium');
  assert.equal(easy.difficulty, 'easy');
});

test('C4.9 golden challenge: some points glow (never the first), taking it gives a harder question', () => {
  const plan = schedulePlanFor(newMatchTime(), 'golden', 90);
  const slots = matchSlots(plan);
  const golden = slots.filter((s) => s.golden);
  assert.ok(golden.length >= 2 && golden.length <= 6, `${golden.length} golden points`);
  for (const g of golden) {
    assert.equal(g.kind, 'point');
    assert.notEqual(g.index, 0);
  }
  for (let s = 1; s <= 6; s++) assert.ok(slots.filter((x) => x.stage === s && x.golden).length <= 1);
  const qs = material(90);
  const g = golden[0];
  const plain = pickForSlot({ questions: qs, plan, slot: g, studentId: 'em', level: 2, history: [] })!;
  const taken = pickForSlot({ questions: qs, plan, slot: g, studentId: 'em', level: 2, history: [], golden: true })!;
  assert.equal(plain.difficulty, 'medium');
  assert.equal(taken.difficulty, 'hard');
  assert.equal(taken.golden, true);
});
