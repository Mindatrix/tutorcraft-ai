import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as E from '../src/engine';
import { MemoryBroadcaster } from '../src/server/matchBroadcast';
import { MemoryMatchStore } from '../src/server/matchStore';
import { createMatchService, MatchError, type StudentSession } from '../src/server/matchService';
import { createSessionService } from '../src/server/sessionService';
import { MemorySessionStore } from '../src/server/sessionStore';
import type { LoadedBattle } from '../src/server/battles';

// Owner decisions of 03/11 for class matches:
//  1. out of HP, the student plays on until the match clock ends;
//  2. questions follow each student's own level (recent accuracy in the class);
//  3. when the match ends, the server stores every student's result itself.

const T0 = 20_000_000;
const STAGE = 300_000;
const time = (over: Partial<E.MatchTime> = {}): E.MatchTime => ({ status: 'running', startedAt: T0, pausedAt: null, pausedMs: 0, endedAt: null, stageMs: STAGE, coreStages: 6, extraStages: 2, extended: false, ...over });

function battle(n: number, mode: 'standard' | 'gamified' = 'standard'): LoadedBattle {
  const questions = E.fallbackPayload(Math.min(n, E.FALLBACK_BANK_SIZE), 'end').questions;
  // Enough questions for the large pace (≥ 60): the pick then follows the student's level.
  const many = Array.from({ length: n }, (_, i) => ({ ...questions[i % questions.length], id: i + 1, difficulty: (['easy', 'medium', 'hard'] as const)[i % 3] }));
  return { id: 'end-1', code: 'END111', topic: 'End', config: { ...E.DEMO_CONFIG, mode, level: 3, classCode: 'L5B' }, boss: E.DEMO_BOSS, questions: many, tutorName: 'Thầy Nam' };
}

function sessionsFor(b: LoadedBattle, clockOf: () => E.MatchTime, skills: Record<string, number> = {}) {
  let clock = T0 - 1_000;
  const store = new MemorySessionStore();
  const persisted: string[] = [];
  const svc = createSessionService({
    loadBattle: async (id) => (id === b.id ? b : null),
    storeFor: () => store,
    persistResult: async ({ rec }) => (persisted.push(rec.id), true),
    classSchedule: async (id, sid) => (id === 'm1' ? { time: clockOf(), seedKey: 'end-seed', skill: skills[sid] ?? null } : null),
    now: () => clock,
  });
  const join = async (name: string) => {
    const { token } = await svc.start({ battleId: b.id, variant: null, nickname: name, avatar: '🦊', studentKey: `k-${name}` });
    const sid = (await svc.student(token)).id;
    const rec = (await store.get(sid))!;
    await store.update({ ...rec, matchId: 'm1' }, rec.version);
    return { token, sid };
  };
  return { svc, store, persisted, join, at: (ms: number) => void (clock = T0 + ms) };
}

const rightOf = (b: LoadedBattle, q: E.PublicQuestion) => {
  const src = b.questions.find((x) => x.id === E.originalQuestionId(q.id))!;
  return q.options!.indexOf(src.options[src.correct_idx]);
};

describe('1. out of HP is not the end in a class match', () => {
  it('the reducer only ends on HP when keepPlaying is off', () => {
    const b = battle(4, 'gamified');
    const base = { questions: b.questions, config: b.config, scaling: E.computeScaling(b.config, 4, b.questions) };
    for (const keepPlaying of [false, true]) {
      const ctx = { ...base, keepPlaying };
      const reduce = E.battleReducer(ctx);
      let s = reduce(E.initialBattleState(ctx), { type: 'START' });
      s = reduce({ ...s, hp: 1 }, { type: 'ANSWER', idx: (b.questions[0].correct_idx + 1) % b.questions[0].options.length });
      s = reduce({ ...s, hp: 0 }, { type: 'NEXT' });
      assert.strictEqual(s.phase, keepPlaying ? 'playing' : 'result', `keepPlaying=${keepPlaying}`);
    }
  });

  it('a gamified class session keeps serving points after every answer is wrong', async () => {
    const b = battle(20, 'gamified');
    const t = sessionsFor(b, () => time());
    const { token } = await t.join('An');
    const plan = E.schedulePlanFor(time(), 'end-seed', 20);
    const points = E.matchSlots(plan).filter((s) => s.kind === 'point').slice(0, 12);
    for (const p of points) {
      t.at(p.atMs + 500);
      const v = await t.svc.current(token);
      if (!v.question) continue;
      const wrong = (rightOf(b, v.question) + 1) % v.question.options!.length;
      await t.svc.act(token, { kind: 'answer', questionId: v.question.id, chosenIdx: wrong });
    }
    const after = await t.svc.current(token);
    assert.ok(after.state.hp <= 0 || after.state.answers.length >= 10, 'took a lot of damage');
    assert.strictEqual(after.state.phase, 'playing', 'still in the match');
  });
});

describe('2. each student gets questions for their own level', () => {
  it('personalLevel moves the class level by recent accuracy, clamped 0..5', () => {
    assert.strictEqual(E.personalLevel(3, null), 3);
    assert.strictEqual(E.personalLevel(3, 0.6), 3);
    assert.strictEqual(E.personalLevel(3, 1), 5);
    assert.strictEqual(E.personalLevel(3, 0.2), 1);
    assert.strictEqual(E.personalLevel(0, 0), 0);
    assert.strictEqual(E.personalLevel(5, 1), 5);
  });

  it('same point, same class: a weak student gets easier questions than a strong one', async () => {
    const b = battle(90);
    const t = sessionsFor(b, () => time(), {});
    const weak = await t.join('Weak');
    const strong = await t.join('Strong');
    const skills: Record<string, number> = { [weak.sid]: 0.1, [strong.sid]: 1 };
    const t2 = { ...t, svc: createSessionService({ loadBattle: async () => b, storeFor: () => t.store, persistResult: async () => true, classSchedule: async (_id, sid) => ({ time: time(), seedKey: 'end-seed', skill: skills[sid] }), now: () => T0 + E.STAGE_INTRO_MS + 500 }) };
    const rank = (d: E.Difficulty) => ['easy', 'medium', 'hard'].indexOf(d);
    const vw = await t2.svc.current(weak.token);
    const vs = await t2.svc.current(strong.token);
    assert.strictEqual(vw.slot?.id, vs.slot?.id, 'same point for both');
    assert.ok(rank(vw.question!.difficulty) < rank(vs.question!.difficulty), `${vw.question!.difficulty} < ${vs.question!.difficulty}`);
  });
});

describe('3. the server stores results when the match ends', () => {
  it('finalizeMatch scores every class session once (no browser needed)', async () => {
    const b = battle(20);
    let clock = time();
    const t = sessionsFor(b, () => clock);
    const a = await t.join('An');
    const c = await t.join('Chi');
    const first = E.stageSlots(E.schedulePlanFor(clock, 'end-seed', 20), 1)[0];
    t.at(first.atMs + 500);
    const v = await t.svc.current(a.token);
    await t.svc.act(a.token, { kind: 'answer', questionId: v.question!.id, chosenIdx: rightOf(b, v.question!) });
    clock = time({ status: 'ended', endedAt: T0 + first.closesMs + 1_000 });
    t.at(first.closesMs + 2_000);
    const players = [{ sessionId: a.sid, skill: 0.6 }, { sessionId: c.sid, skill: 0.6 }, { sessionId: null, skill: 0.6 }];
    const r = await t.svc.finalizeMatch({ matchId: 'm1', time: clock, seedKey: 'end-seed', players });
    assert.deepStrictEqual(r, { tried: 2, saved: 2, flagged: 0, failed: 0 });
    assert.deepStrictEqual(t.persisted.sort(), [a.sid, c.sid].sort());
    assert.strictEqual((await t.store.get(a.sid))!.status, 'finished');
    assert.strictEqual((await t.store.get(a.sid))!.result?.correct, 1);
    // Again (a retry, or the student's own submit): nothing is written twice.
    await t.svc.finalizeMatch({ matchId: 'm1', time: clock, seedKey: 'end-seed', players });
    assert.strictEqual(t.persisted.length, 2);
    const own = await t.svc.finalize(a.token);
    assert.strictEqual(own.score?.correct, 1);
    assert.strictEqual(t.persisted.length, 2);
  });

  it('the match service calls onEnded once with every player when the tutor ends the match', async () => {
    let clock = 30_000_000;
    const ended: { matchId: string; players: { sessionId: string | null }[]; status: string }[] = [];
    const sessions = new Map<string, StudentSession>();
    const b = { id: 'b1', code: 'ABC123', tutorId: 't1', config: { scenario: E.GAME_MODES[E.GameMode.RIVER_FISHING].scenarios[0], gameMode: E.GameMode.RIVER_FISHING, level: 3, classCode: 'LOP5A' } } as unknown as LoadedBattle;
    const svc = createMatchService({
      store: new MemoryMatchStore(),
      broadcaster: new MemoryBroadcaster(),
      now: () => clock,
      loadBattle: async (id) => (id === 'b1' ? b : null),
      session: async (token) => {
        const s = sessions.get(String(token));
        if (!s) throw new MatchError(401, 'bad token');
        return s;
      },
      scenario: async () => ({ tags: [], species: [] }),
      onEnded: (info) => void ended.push({ matchId: info.matchId, players: info.players, status: info.time.status }),
    });
    const { view } = await svc.create('t1', 'b1');
    for (const i of [1, 2]) {
      sessions.set(`tok${i}`, { id: `sess-${i}`, battleId: 'b1', studentKey: `k${i}`, nickname: `Em ${i}`, avatar: '🐣' });
      await svc.join(`tok${i}`);
    }
    await svc.control('t1', view.id, 'start');
    clock += 60_000;
    await svc.control('t1', view.id, 'end');
    await assert.rejects(svc.control('t1', view.id, 'end'));
    assert.strictEqual(ended.length, 1);
    assert.strictEqual(ended[0].status, 'ended');
    assert.deepStrictEqual(ended[0].players.map((p) => p.sessionId).sort(), ['sess-1', 'sess-2']);
  });
});
