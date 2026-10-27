import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GameMode,
  answerStars,
  applyControl,
  balanceTeams,
  clockOffset,
  clockOffsetNtp,
  matchClockAt,
  newMatchTime,
  playPlanFor,
  splitGroups,
  teamSkillGap,
  mulberry32,
  type MatchTime,
} from '../src/engine';

const MIN = 60_000;

function run(t: MatchTime, steps: [Parameters<typeof applyControl>[1], number][]): MatchTime {
  for (const [a, at] of steps) {
    const r = applyControl(t, a, at);
    assert.ok(r.ok, `${a} at ${at}: ${r.ok ? '' : r.reason}`);
    t = r.time;
  }
  return t;
}

test('B2.3 clock: 6 stages × 5 min, pauses do not count, extend adds stages 7-8', () => {
  const t0 = 1_000_000;
  const lobby = newMatchTime();
  assert.equal(matchClockAt(lobby, t0).stage, 0);
  let t = run(lobby, [['start', t0]]);
  assert.deepEqual([matchClockAt(t, t0).stage, matchClockAt(t, t0 + 4 * MIN).stage, matchClockAt(t, t0 + 5 * MIN).stage], [1, 1, 2]);
  assert.equal(matchClockAt(t, t0 + 7 * MIN).stageRemainingMs, 3 * MIN);

  // Pause 2 minutes in stage 2: the clock stands still, then carries on.
  t = run(t, [['pause', t0 + 6 * MIN]]);
  assert.equal(matchClockAt(t, t0 + 8 * MIN).elapsedMs, 6 * MIN);
  t = run(t, [['resume', t0 + 8 * MIN]]);
  assert.equal(matchClockAt(t, t0 + 9 * MIN).elapsedMs, 7 * MIN);

  // 30 playing minutes = time up (2 min of pause added).
  const end = t0 + 32 * MIN;
  assert.equal(matchClockAt(t, end - 1).stage, 6);
  assert.equal(matchClockAt(t, end - 1).over, false);
  assert.equal(matchClockAt(t, end).over, true);

  // "Kéo dài": two more stages, marked optional.
  const ext = run(t, [['extend', t0 + 20 * MIN]]);
  assert.equal(matchClockAt(ext, end).over, false);
  assert.equal(matchClockAt(ext, end + MIN).stage, 7);
  assert.equal(matchClockAt(ext, end + MIN).optional, true);
  assert.equal(matchClockAt(ext, end + 10 * MIN).over, true);
});

test('B2.3 two devices with different local clocks see the same stage and seconds left', () => {
  const t = run(newMatchTime(), [['start', 5_000_000]]);
  const server = 5_000_000 + 12 * MIN + 17_000;
  // Phone A runs 41 s fast, phone B 3 min slow; each measured its offset once (RTT 120 / 400 ms).
  const offA = clockOffset(server - 41_000 + 41_000 * 2 - 60, server, server - 41_000 + 41_000 * 2 + 60);
  const offB = clockOffset(server - 180_000 - 200, server, server - 180_000 + 200);
  const localA = server + 41_000;
  const localB = server - 180_000;
  const a = matchClockAt(t, localA + offA);
  const b = matchClockAt(t, localB + offB);
  assert.equal(a.stage, 3);
  assert.equal(b.stage, 3);
  assert.ok(Math.abs(a.stageRemainingMs - b.stageRemainingMs) < 1000, `${a.stageRemainingMs} vs ${b.stageRemainingMs}`);
});

test('B2.2 tutor controls only in order; anything else is refused', () => {
  const lobby = newMatchTime();
  for (const a of ['pause', 'resume', 'extend'] as const) assert.equal(applyControl(lobby, a, 1).ok, false, a);
  const running = run(lobby, [['start', 1000]]);
  assert.equal(applyControl(running, 'start', 2000).ok, false);
  assert.equal(applyControl(running, 'resume', 2000).ok, false);
  const ext = run(running, [['extend', 3000]]);
  assert.equal(applyControl(ext, 'extend', 4000).ok, false, 'extend once');
  const paused = run(ext, [['pause', 5000]]);
  assert.equal(applyControl(paused, 'pause', 6000).ok, false);
  const ended = run(paused, [['end', 9000]]);
  assert.equal(ended.endedAt, 5000, 'a paused match ends where it paused');
  for (const a of ['start', 'pause', 'resume', 'extend', 'end'] as const) assert.equal(applyControl(ended, a, 10_000).ok, false, a);
  // Time already up: the end time is the limit, not "now".
  const late = run(newMatchTime({ stageMs: 1000 }), [['start', 0], ['end', 99_000]]);
  assert.equal(late.endedAt, 6000);
});

test('stars: 3 fast, 2 normal, 1 slow, 0 wrong; partial written answers lose one', () => {
  const s = (correct: boolean, timeMs: number, score?: number) => answerStars({ correct, timeMs, limitMs: 20_000, score });
  assert.deepEqual([s(true, 5000), s(true, 12_000), s(true, 19_000), s(false, 1000)], [3, 2, 1, 0]);
  assert.equal(s(true, 5000, 0.6), 2);
  assert.equal(s(true, 19_000, 0.6), 1);
});

test('B2.6 teams: 49 students → 25/24 (equal) or 29/20 (Survival 60/40), mean skill within 10%', () => {
  const rand = mulberry32(42);
  for (let trial = 0; trial < 20; trial++) {
    const players = Array.from({ length: 49 }, (_, i) => ({ id: `s${i}`, skill: 0.2 + rand() * 0.75 }));
    const [a, b] = balanceTeams(players);
    assert.deepEqual([a.length, b.length], [25, 24]);
    assert.ok(teamSkillGap(a, b) < 0.1, `gap ${teamSkillGap(a, b)}`);
    const [esc, pur] = balanceTeams(players, 0.6);
    assert.deepEqual([esc.length, pur.length], [29, 20]);
    assert.ok(teamSkillGap(esc, pur) < 0.1, `60/40 gap ${teamSkillGap(esc, pur)}`);
    assert.equal(new Set([...esc, ...pur].map((p) => p.id)).size, 49, 'nobody lost or doubled');
  }
  // Same players, same split (every server instance agrees).
  const p = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, skill: (i * 7) % 10 / 10 }));
  assert.deepEqual(balanceTeams(p).map((t) => t.map((x) => x.id)), balanceTeams([...p].reverse()).map((t) => t.map((x) => x.id)));
  assert.deepEqual(balanceTeams([{ id: 'solo', skill: 1 }]).map((t) => t.length), [1, 0]);
  assert.deepEqual(balanceTeams(p.slice(0, 2), 0.6).map((t) => t.length), [1, 1], 'at least one per team');
});

test('squads: sizes differ by at most 1, strong and weak spread across squads', () => {
  const players = Array.from({ length: 29 }, (_, i) => ({ id: `s${i}`, skill: i / 29 }));
  const g = splitGroups(players, 5);
  assert.equal(g.length, 6);
  const sizes = g.map((x) => x.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, String(sizes));
  const means = g.map((x) => x.reduce((s, p) => s + p.skill, 0) / x.length);
  assert.ok(Math.max(...means) - Math.min(...means) < 0.15, String(means));
  assert.equal(splitGroups(players, 0).length, 1);
});

test('B1.4 play mode follows the class size', () => {
  assert.equal(playPlanFor(GameMode.DINO_JOURNEY, 1).mode, 'solo');
  assert.deepEqual([playPlanFor(GameMode.DINO_JOURNEY, 4).mode, playPlanFor(GameMode.DINO_JOURNEY, 4).groupSize], ['class', 0]);
  assert.equal(playPlanFor(GameMode.DINO_JOURNEY, 12).groupSize, 4);
  assert.deepEqual([playPlanFor(GameMode.DINO_JOURNEY, 40).groupSize, playPlanFor(GameMode.DINO_JOURNEY, 40).lanes], [5, 2]);
  assert.deepEqual([playPlanFor(GameMode.RIVER_SURVIVAL, 3).mode, playPlanFor(GameMode.RIVER_SURVIVAL, 3).bots], ['solo', 3]);
  assert.deepEqual([playPlanFor(GameMode.RIVER_SURVIVAL, 30).mode, playPlanFor(GameMode.RIVER_SURVIVAL, 30).teamRatio], ['teams', 0.6]);
  assert.equal(playPlanFor(GameMode.KAYAK_RUSH_3D, 20).mode, 'teams');
  assert.equal(playPlanFor(GameMode.SUMMER_CAMP_QUESTS, 20).mode, 'class');
});

test('B2.3 clock sync: four NTP stamps cancel the server processing time (slow join under load)', () => {
  // Phone 2 min fast; 80 ms up, 6 s of server work, 120 ms down.
  const skew = 120_000;
  const serverArrive = 50_000_000;
  const t0 = serverArrive - 80 + skew;
  const t1 = serverArrive;
  const t2 = serverArrive + 6000;
  const t3 = t2 + 120 + skew;
  const ntp = clockOffsetNtp(t0, t1, t2, t3);
  assert.ok(Math.abs(ntp.offset - -skew) <= 25, `offset ${ntp.offset}`);
  assert.equal(ntp.delay, 200, 'network only');
  // The single-stamp estimate is off by about half the processing time.
  assert.ok(Math.abs(clockOffset(t0, t2, t3) - -skew) > 2900);
});

