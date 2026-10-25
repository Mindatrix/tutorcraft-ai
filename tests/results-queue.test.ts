import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine';
import { createSessionService, type PersistOutcome } from '../src/server/sessionService';
import { MemorySessionStore } from '../src/server/sessionStore';
import type { LoadedBattle } from '../src/server/battles';

// Battle results must never be lost silently: a failed write is kept on the session
// (resultSaved = false) and retried by the student's next submit or the server sweep.

function battle(n = 4): LoadedBattle {
  return {
    id: 'queue-1',
    code: 'QUE234',
    topic: 'Queue',
    config: { ...E.DEMO_CONFIG, classCode: 'K1' },
    boss: E.DEMO_BOSS,
    questions: E.fallbackPayload(n, 'queue').questions,
    tutorName: 'Cô Lan',
  };
}

function setup(outcomes: PersistOutcome[]) {
  let clock = 2_000_000;
  const b = battle();
  const store = new MemorySessionStore();
  const writes: string[] = [];
  let call = 0;
  const svc = createSessionService({
    loadBattle: async (id) => (id === b.id ? b : null),
    storeFor: () => store,
    persistResult: async ({ rec }) => {
      const out = outcomes[Math.min(call++, outcomes.length - 1)];
      if (out === true) writes.push(rec.id);
      return out;
    },
    now: () => clock,
  });
  const play = async () => {
    const { token, view } = await svc.start({ battleId: b.id, variant: null, nickname: 'Kid', avatar: '🦊', studentKey: 'k' });
    let q = view.question;
    while (q) {
      clock += E.minPlausibleMs({ question: q.question, options: q.options, skill_tag: 'grammar' }) + 1500;
      const qid = q.id;
      const r = await svc.act(token, { kind: 'answer', questionId: qid, chosenIdx: b.questions.find((x) => x.id === qid)!.correct_idx });
      clock += E.FEEDBACK_MS;
      q = r.view.question;
    }
    return token;
  };
  return { svc, store, writes, play };
}

test('failed write → pending, the next submit retries it, then it is saved exactly once', async () => {
  const t = setup([false, true]);
  const token = await t.play();
  const first = await t.svc.finalize(token);
  assert.equal(first.saved, false);
  assert.equal(first.pending, true, 'tells the client the result is queued');
  assert.equal(first.score?.correct, 4, 'student still sees the score');

  const again = await t.svc.finalize(token);
  assert.equal(again.saved, true, 'repeat submit is the retry (not a fake "saved")');
  assert.equal(again.pending, false);
  assert.equal(again.score?.gems, first.score?.gems, 'same score, rebuilt from the log');

  const third = await t.svc.finalize(token);
  assert.equal(third.saved, true);
  assert.deepEqual(t.writes.length, 1, 'never written twice');
});

test('server sweep saves results whose final submit never arrived', async () => {
  const t = setup([true]);
  await t.play(); // the browser closed before calling finalize
  const pending = await t.store.listPending(10, 0);
  assert.equal(pending.length, 1, 'the finished match is in the queue');
  assert.equal(pending[0].status, 'active');

  const out = await t.svc.retryPending(10, 0);
  assert.deepEqual(out, { tried: 1, saved: 1, flagged: 0 });
  assert.equal(t.writes.length, 1);
  assert.equal((await t.store.listPending(10, 0)).length, 0, 'queue drained');
  assert.equal((await t.svc.retryPending(10, 0)).tried, 0);
});

test('server sweep keeps retrying a failed write until the database is back', async () => {
  const t = setup([false, false, true]);
  const token = await t.play();
  assert.equal((await t.svc.finalize(token)).pending, true);
  assert.deepEqual(await t.svc.retryPending(10, 0), { tried: 1, saved: 0, flagged: 0 });
  assert.deepEqual(await t.svc.retryPending(10, 0), { tried: 1, saved: 1, flagged: 0 });
  assert.equal((await t.svc.finalize(token)).saved, true);
  assert.equal(t.writes.length, 1);
});

test('unfinished matches are not swept; demo battles (skipped) are not queued', async () => {
  const t = setup(['skipped']);
  const b = battle();
  const { token } = await t.svc.start({ battleId: b.id, variant: null, nickname: 'Kid', avatar: '🦊', studentKey: 'k' });
  assert.equal((await t.store.listPending(10, 0)).length, 0, 'still playing → not pending');
  void token;

  const done = await t.play();
  const res = await t.svc.finalize(done);
  assert.equal(res.saved, false);
  assert.equal(res.pending, false, 'nothing to retry for a battle that is never stored');
  assert.equal((await t.svc.finalize(done)).saved, false, 'a repeat submit does not claim it was saved');
  assert.equal((await t.store.listPending(10, 0)).length, 0);
});
