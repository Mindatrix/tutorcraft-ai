import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SURVIVAL, newSurvivalState, survivalAct, survivalAnswer, survivalResult, survivalSettle, type SurvivalState } from '../src/engine';

const T = 1_000_000;
const ctx = (now: number, stage = 2) => ({ now, stage, level: 3 });

function base(): SurvivalState {
  return newSurvivalState([
    { id: 'e1', team: 'escapers' },
    { id: 'e2', team: 'escapers' },
    { id: 'e3', team: 'escapers' },
    { id: 'p1', team: 'pursuers' },
    { id: 'p2', team: 'pursuers' },
  ]);
}

function ok(r: ReturnType<typeof survivalAct>) {
  assert.ok(r.ok, r.ok ? '' : r.reason);
  return r;
}

const charge = (s: SurvivalState, id: string, now: number) => survivalAnswer(s, id, { correct: true, stars: 2 }, ctx(now)).state;

test('B2.7 no net charge, no throw; a right answer charges it', () => {
  let s = base();
  const r = survivalAct(s, 'p1', { type: 'tag', targets: ['e1'] }, ctx(T));
  assert.equal(r.ok, false);
  assert.equal(r.state.rejected.p1, 1, 'refusal counted');
  s = charge(s, 'p1', T);
  assert.equal(s.players.p1.charge, 1);
  assert.equal(s.players.p1.stars, 2);
  const t = ok(survivalAct(s, 'p1', { type: 'tag', targets: ['e1'] }, ctx(T + 1000)));
  assert.equal(t.state.players.p1.charge, 0);
  assert.deepEqual(t.events.map((e) => e.t), ['tag', 'dodge_window']);
});

test('B2.7 Né lưới: right answer within 6 s escapes, silence or a wrong answer = caught; once per stage', () => {
  let s = charge(charge(base(), 'p1', T), 'p1', T);
  s = ok(survivalAct(s, 'p1', { type: 'tag', targets: ['e1'] }, ctx(T + 1000))).state;
  const dodged = survivalAnswer(s, 'e1', { correct: true, stars: 3 }, ctx(T + 4000));
  assert.equal(dodged.state.players.e1.free, true);
  assert.equal(dodged.state.players.e1.dodges, 1);
  assert.ok(dodged.events.some((e) => e.t === 'dodged'));
  // Immune for 5 s, then a second throw in the same stage catches at once (dodge used).
  assert.equal(survivalAct(dodged.state, 'p1', { type: 'tag', targets: ['e1'] }, ctx(T + 7000)).ok, false);
  const again = ok(survivalAct(dodged.state, 'p1', { type: 'tag', targets: ['e1'] }, ctx(T + 10_000)));
  assert.equal(again.state.players.e1.free, false);
  assert.equal(again.state.players.p1.captures, 1);
  // Next stage: the dodge is available again.
  let s2 = charge(again.state, 'p1', T + 11_000);
  s2 = ok(survivalAct(s2, 'p1', { type: 'tag', targets: ['e2'] }, ctx(T + 16_000, 3))).state;
  assert.equal(survivalSettle(s2, ctx(T + 16_000 + SURVIVAL.dodgeWindowMs, 3)).state.players.e2.free, false, 'no answer in 6 s');
  const wrong = survivalAnswer(s2, 'e2', { correct: false, stars: 0 }, ctx(T + 18_000, 3));
  assert.equal(wrong.state.players.e2.free, false, 'wrong answer');
});

test('B2.7 one throw tags at most N escapers; cheating attempts are refused and counted, never applied', () => {
  let s = base();
  for (let i = 0; i < 3; i++) s = charge(s, 'p1', T);
  const before = JSON.stringify(s.players);
  const attempts: [string, Parameters<typeof survivalAct>[2]][] = [
    ['e1', { type: 'tag', targets: ['e2'] }], // escaper throwing a net
    ['p1', { type: 'tag', targets: ['e1', 'e2', 'e3'] }], // more than N
    ['p1', { type: 'tag', targets: ['p2'] }], // tagging a team mate
    ['p1', { type: 'tag', targets: ['ghost'] }],
    ['ghost', { type: 'tag', targets: ['e1'] }], // not in the match
    ['p1', { type: 'rescue' }], // pursuer opening the pen
    ['e1', { type: 'freeze', target: 'p1' }], // freezing without a net
  ];
  let state = s;
  for (const [who, a] of attempts) {
    const r = survivalAct(state, who, a, ctx(T + 1000));
    assert.equal(r.ok, false, `${who} ${JSON.stringify(a)}`);
    state = r.state;
  }
  assert.equal(JSON.stringify(state.players), before, 'no refused action changed the game');
  assert.equal(state.rejected.p1, 4);
  assert.equal(state.rejected.e1, 2);
  // Two targets is fine; a second throw within the cooldown is refused.
  const two = ok(survivalAct(state, 'p1', { type: 'tag', targets: ['e1', 'e2'], id: 'a1' }, ctx(T + 2000)));
  assert.equal(two.state.pendingTags.length, 2);
  assert.equal(survivalAct(two.state, 'p1', { type: 'tag', targets: ['e3'] }, ctx(T + 3000)).ok, false, 'cooldown');
  // The same action id sent twice (double tap / retry) is applied once.
  const dup = survivalAct(two.state, 'p1', { type: 'tag', targets: ['e1', 'e2'], id: 'a1' }, ctx(T + 2500));
  assert.ok(dup.ok && dup.duplicate);
  assert.equal(dup.state.players.p1.charge, two.state.players.p1.charge);
});

test('B2.7 Cướp lưới: right in 8 s takes the net (3 uses / 60 s), freezes and rescues; wrong reveals', () => {
  let s = charge(base(), 'p1', T);
  s = ok(survivalAct(s, 'p1', { type: 'tag', targets: ['e2'] }, ctx(T))).state;
  s = survivalSettle(s, ctx(T + 7000)).state; // e2 did not answer: caught
  assert.equal(s.players.e2.free, false);

  const fail = survivalAnswer(ok(survivalAct(s, 'e1', { type: 'snatch', target: 'p1' }, ctx(T + 8000))).state, 'e1', { correct: false, stars: 0 }, ctx(T + 9000));
  assert.equal(fail.state.players.e1.revealedUntil, T + 9000 + SURVIVAL.revealMs);
  assert.equal(fail.state.players.e1.stolenNet, null);

  s = ok(survivalAct(s, 'e1', { type: 'snatch', target: 'p1' }, ctx(T + 20_000))).state;
  s = survivalAnswer(s, 'e1', { correct: true, stars: 2 }, ctx(T + 25_000)).state;
  assert.deepEqual(s.players.e1.stolenNet, { from: 'p1', uses: 3, until: T + 25_000 + SURVIVAL.stolenNetMs });
  assert.equal(s.players.p1.netLostUntil, T + 25_000 + SURVIVAL.netLostMs);
  s = charge(s, 'p1', T + 26_000);
  assert.equal(survivalAct(s, 'p1', { type: 'tag', targets: ['e3'] }, ctx(T + 30_000)).ok, false, 'no net, no throw');

  s = ok(survivalAct(s, 'e1', { type: 'freeze', target: 'p2' }, ctx(T + 31_000))).state;
  assert.equal(s.players.p2.frozenUntil, T + 31_000 + SURVIVAL.freezeMs);
  assert.equal(survivalAct(s, 'p2', { type: 'retake', target: 'e1' }, ctx(T + 32_000)).ok, false, 'frozen');
  const rescue = ok(survivalAct(s, 'e1', { type: 'rescue' }, ctx(T + 33_000)));
  assert.equal(rescue.state.players.e2.free, true);
  assert.equal(rescue.state.players.e1.stolenNet?.uses, 1);
  // A pursuer touching the holder takes the net back; its owner can throw again.
  const back = ok(survivalAct(rescue.state, 'p1', { type: 'retake', target: 'e1' }, ctx(T + 34_000)));
  assert.equal(back.state.players.e1.stolenNet, null);
  assert.equal(back.state.players.p1.netLostUntil, T + 34_000);
  // Unused nets go back after 60 s.
  const expired = survivalSettle(rescue.state, ctx(T + 25_000 + SURVIVAL.stolenNetMs));
  assert.equal(expired.state.players.e1.stolenNet, null);
  assert.ok(expired.events.some((e) => e.t === 'net_back' && e.why === 'expired'));
});

test('B2.7 head count at the end: free majority, caught majority, exactly half → stars; MVP bonus', () => {
  const s = base();
  s.players.e1.stars = 5;
  s.players.p1.stars = 2;
  s.players.p1.actionPoints = 100;
  let r = survivalResult(s);
  assert.deepEqual([r.winner, r.why, r.free, r.caught], ['escapers', 'free_majority', 3, 0]);
  assert.equal(r.mvp?.id, 'e1');
  assert.equal(r.mvp?.bonus, Math.round((2 * 100 + 100) * 0.2));
  assert.equal(r.braveFace, 'p1');

  s.players.e1.free = false;
  s.players.e2.free = false;
  r = survivalResult(s);
  assert.deepEqual([r.winner, r.why], ['pursuers', 'caught_majority']);

  const even = newSurvivalState([{ id: 'a', team: 'escapers' }, { id: 'b', team: 'escapers' }, { id: 'p', team: 'pursuers' }]);
  even.players.a.free = false;
  even.players.p.stars = 4;
  even.players.b.stars = 3;
  assert.deepEqual([survivalResult(even).winner, survivalResult(even).why], ['pursuers', 'stars']);
  even.players.b.stars = 4;
  assert.equal(survivalResult(even).winner, 'draw');
  assert.equal(survivalResult(even).mvp, null);
});

test('B2.7 1-5 students: slow bot pursuers throw on their own, one at a time, never awarded', () => {
  let s = newSurvivalState([{ id: 'e1', team: 'escapers' }, { id: 'e2', team: 'escapers' }], { bots: 2, seed: 7, now: T });
  assert.equal(survivalSettle(s, ctx(T + 10_000)).events.length, 0, 'not yet');
  const first = survivalSettle(s, ctx(T + SURVIVAL.botIntervalMs[3]));
  assert.deepEqual(first.events.map((e) => e.t), ['tag', 'dodge_window']);
  s = first.state;
  const target = s.pendingTags[0].escaper;
  s = survivalAnswer(s, target, { correct: true, stars: 3 }, ctx(T + SURVIVAL.botIntervalMs[3] + 2000)).state;
  assert.equal(s.players[target].free, true);
  // A bot cannot be played by a student, and the result ignores bots for awards.
  assert.equal(survivalAct(s, 'bot-1', { type: 'tag', targets: ['e1'] }, ctx(T)).ok, false);
  s.players['bot-1'].stars = 99;
  const r = survivalResult(s);
  assert.equal(r.points['bot-1'], undefined);
  assert.ok(r.mvp?.id !== 'bot-1' && r.braveFace !== 'bot-1');
});

test('B2.7 durable decisions: an answer inside the window decides it even if read later; answers before it do not count', () => {
  let s = charge(base(), 'p1', T);
  s = ok(survivalAct(s, 'p1', { type: 'tag', targets: ['e1', 'e2'] }, ctx(T + 1000))).state;
  // e1 answered right at +3 s, e2 answered right BEFORE the throw: read only at +30 s.
  const late = survivalSettle(s, ctx(T + 30_000), { e1: { at: T + 3000, correct: true }, e2: { at: T + 500, correct: true } });
  assert.equal(late.state.players.e1.free, true, 'right answer inside the 6 s window = dodged');
  assert.equal(late.state.players.e1.immuneUntil, T + 3000 + SURVIVAL.immuneMs, 'immunity from the answer time');
  assert.equal(late.state.players.e2.free, false, 'an answer from before the throw does not dodge');
  assert.equal(late.state.pendingTags.length, 0);
  // Same facts, same decision, whatever the order the server learns them in.
  const live = survivalAnswer(s, 'e1', { correct: true, stars: 2 }, ctx(T + 3000));
  assert.equal(live.state.players.e1.free, late.state.players.e1.free);
});
