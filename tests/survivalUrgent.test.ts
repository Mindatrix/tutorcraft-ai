import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as E from '../src/engine';
import { createSessionService } from '../src/server/sessionService';
import { MemorySessionStore } from '../src/server/sessionStore';
import { urgentWindowsOf } from '../src/server/sessions';
import type { LoadedBattle } from '../src/server/battles';

// River Survival in a class match (03/11 fix): "Né lưới" (6 s) and "Cướp lưới" (8 s) are won by
// answering a question inside the window, but class sessions only open questions at schedule
// points (~30 s apart). While a window is open, the student's next question is served at once.

const T0 = 40_000_000;
const time = (): E.MatchTime => ({ status: 'running', startedAt: T0, pausedAt: null, pausedMs: 0, endedAt: null, stageMs: 300_000, coreStages: 6, extraStages: 2, extended: false });

function setup(urgent: E.UrgentWindow[] = []) {
  let clock = T0;
  let windows = urgent;
  const questions = E.fallbackPayload(20, 'surv').questions;
  const b = { id: 'surv-1', code: 'SRV111', topic: 'S', config: { ...E.DEMO_CONFIG, mode: 'standard', level: 3, classCode: 'L5' }, boss: E.DEMO_BOSS, questions, tutorName: 'Cô Hà' } as LoadedBattle;
  const store = new MemorySessionStore();
  const svc = createSessionService({
    loadBattle: async () => b,
    storeFor: () => store,
    persistResult: async () => 'skipped',
    classSchedule: async () => ({ time: time(), seedKey: 'surv-seed', urgent: windows }),
    now: () => clock,
  });
  return {
    svc,
    b,
    store,
    at: (ms: number) => void (clock = T0 + ms),
    setWindows: (w: E.UrgentWindow[]) => void (windows = w),
    join: async () => {
      const { token } = await svc.start({ battleId: b.id, variant: null, nickname: 'An', avatar: '🏃', studentKey: 'k' });
      const sid = (await svc.student(token)).id;
      const rec = (await store.get(sid))!;
      await store.update({ ...rec, matchId: 'm1' }, rec.version);
      return token;
    },
  };
}

const right = (b: LoadedBattle, q: E.PublicQuestion) => {
  const src = b.questions.find((x) => x.id === E.originalQuestionId(q.id))!;
  return q.options!.indexOf(src.options[src.correct_idx]);
};

describe('dodge / snatch windows serve the next question at once', () => {
  it('between points: no question, an answer is refused', async () => {
    const t = setup();
    const tok = await t.join();
    const s1 = E.stageSlots(E.schedulePlanFor(time(), 'surv-seed', 20), 1)[0];
    t.at(s1.closesMs + 2_000); // after point 1, before point 2
    const v = await t.svc.current(tok);
    assert.strictEqual(v.question, null);
    assert.strictEqual(v.slot?.open, false);
  });

  it('a dodge window opens the coming question now; answering it counts (inside 6 s) and uses that point', async () => {
    const t = setup();
    const tok = await t.join();
    const [s1, s2] = E.stageSlots(E.schedulePlanFor(time(), 'surv-seed', 20), 1);
    const at = T0 + s1.closesMs + 2_000;
    t.at(s1.closesMs + 2_000);
    t.setWindows([{ kind: 'dodge', at, until: at + 6_000 }]);
    const v = await t.svc.current(tok);
    assert.strictEqual(v.slot?.open, true);
    assert.strictEqual(v.slot?.urgent, 'dodge');
    assert.strictEqual(v.slot?.closesAt, at + 6_000);
    assert.strictEqual(v.slot?.id, s2.id, 'the next point’s question, served early');
    t.at(s1.closesMs + 4_000);
    const res = await t.svc.act(tok, { kind: 'answer', questionId: v.question!.id, chosenIdx: right(t.b, v.question!) });
    assert.strictEqual(res.scored?.correct, true, 'answered inside the window: the server dodge uses this answer');
    // Window over, point 2 now opens: already answered, the student waits for point 3.
    t.setWindows([]);
    t.at(s2.atMs + 1_000);
    const after = await t.svc.current(tok);
    assert.strictEqual(after.slot?.id, E.stageSlots(E.schedulePlanFor(time(), 'surv-seed', 20), 1)[2].id);
    assert.strictEqual(after.question, null);
    assert.strictEqual(after.state.answers.length, 2, 'point 1 timed out, point 2 answered early');
  });

  it('the server reads the windows of THIS student from the match state', () => {
    const state = {
      pendingTags: [{ escaper: 'p1', by: 'p9', at: 10, until: 6_010 }, { escaper: 'p2', by: 'p9', at: 10, until: 6_010 }],
      pendingSnatches: [{ escaper: 'p1', target: 'p9', at: 20, until: 8_020 }],
    };
    assert.deepStrictEqual(urgentWindowsOf(state, 'p1'), [{ kind: 'dodge', at: 10, until: 6_010 }, { kind: 'snatch', at: 20, until: 8_020 }]);
    assert.deepStrictEqual(urgentWindowsOf(state, 'p3'), []);
    assert.deepStrictEqual(urgentWindowsOf({}, 'p1'), []);
  });
});
