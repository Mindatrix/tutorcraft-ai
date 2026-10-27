import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_MODES, GameMode, SURVIVAL, matchClockAt, planRun, teamSkillGap, type MatchMessage, type SurvivalState } from '../src/engine';
import { MemoryBroadcaster, matchPublicKey, signMatchMessage, verifyMatchMessage } from '../src/server/matchBroadcast';
import { MemoryMatchStore, timeOf } from '../src/server/matchStore';
import { createMatchService, MatchError, type StudentSession } from '../src/server/matchService';
import type { LoadedBattle } from '../src/server/battles';


function setup(game: GameMode, scenarioKey = 'surv-01') {
  let clock = 10_000_000;
  const store = new MemoryMatchStore();
  const radio = new MemoryBroadcaster();
  const sessions = new Map<string, StudentSession>();
  const battle = { id: 'b1', code: 'ABC123', tutorId: 't1', config: { scenario: GAME_MODES[game].scenarios[0], gameMode: game, scenarioKey, level: 3, classCode: 'LOP5A' } } as unknown as LoadedBattle;
  const svc = createMatchService({
    store,
    broadcaster: radio,
    now: () => clock,
    loadBattle: async (id) => (id === 'b1' ? battle : null),
    session: async (token) => {
      const s = sessions.get(String(token));
      if (!s) throw new MatchError(401, 'bad token');
      return s;
    },
    scenario: async () => ({ tags: [], species: [] }),
  });
  const student = (i: number, key = `dev${i}`) => {
    const token = `tok-${i}-${key}`;
    sessions.set(token, { id: `sess-${i}-${key}`, battleId: 'b1', studentKey: key, nickname: `Em ${i}`, avatar: '🐣' });
    return token;
  };
  return { store, radio, svc, student, sessions, tick: (ms: number) => (clock += ms), now: () => clock };
}

test('B2.2 only the owner opens and drives the match; one open match per battle', async () => {
  const { svc } = setup(GameMode.RIVER_SURVIVAL);
  await assert.rejects(svc.create('someone-else', 'b1'), /Không tìm thấy/);
  const a = await svc.create('t1', 'b1');
  const b = await svc.create('t1', 'b1');
  assert.equal(a.view.id, b.view.id, 'reopening returns the same lobby');
  assert.equal(a.view.status, 'lobby');
  await assert.rejects(svc.control('someone-else', a.view.id, 'start'), /Không tìm thấy/);
  await assert.rejects(svc.control('t1', a.view.id, 'start'), /Chưa có học sinh/);
  await assert.rejects(svc.control('t1', a.view.id, 'explode'), /không hợp lệ/);
});

test('B2 49 students: Survival teams 29/20 balanced, same run plan on every device, signed broadcasts', async () => {
  const { svc, store, radio, student, tick } = setup(GameMode.RIVER_SURVIVAL);
  const { view } = await svc.create('t1', 'b1');
  const tokens = Array.from({ length: 49 }, (_, i) => student(i));
  // Mixed skill: half strong, half weak.
  tokens.forEach((_, i) => store.skills.set(`LOP5A:dev${i}`, i % 2 ? 0.9 : 0.35));
  for (const t of tokens) await svc.join(t);
  // Before the start, answers do not count.
  assert.equal(await svc.onAnswer('sess-0-dev0', { correct: true, stars: 3 }), null);

  tick(1000);
  const started = await svc.control('t1', view.id, 'start');
  assert.equal(started.view.status, 'running');
  const players = await store.players(view.id);
  const esc = players.filter((p) => p.team === 'escapers');
  const pur = players.filter((p) => p.team === 'pursuers');
  assert.deepEqual([esc.length, pur.length], [29, 20]);
  assert.equal(players.filter((p) => p.skill === 0.9).length, 24, 'skills looked up by the class code of battle_results');
  assert.ok(teamSkillGap(esc, pur) < 0.1, `skill gap ${teamSkillGap(esc, pur)}`);
  assert.ok(players.every((p) => p.grp != null), 'every student is in a squad');
  assert.equal(Object.keys((started.view.survival?.players ?? {})).length, 49);

  // B1.2: two devices get the same plan, and it is planRun() of the stored seed key.
  const a = await svc.state(tokens[0]);
  const b = await svc.state(tokens[48]);
  assert.deepEqual(a.view.runPlan, b.view.runPlan);
  const m = await store.get(view.id);
  assert.deepEqual(m!.runPlan, planRun({ game: GameMode.RIVER_SURVIVAL, scenarioId: 'surv-01', tags: [], seedKey: m!.seedKey, recent: [], species: [] }));
  assert.equal(a.channel.topic, `match:${view.id}`);
  assert.deepEqual(a.channel.publicKey, matchPublicKey());

  // Every broadcast verifies with the public key, and sequence numbers only go up.
  const msgs = radio.sent.map((s) => verifyMatchMessage(s));
  assert.ok(msgs.every(Boolean), 'all signed');
  const seqs = (msgs as MatchMessage[]).map((x) => x.s);
  assert.deepEqual(seqs, [...seqs].sort((x, y) => x - y));
  assert.ok(msgs.some((x) => x?.t === 'state'));
  // A forged message (other key or edited text) does not verify.
  const forged = signMatchMessage({ m: view.id, s: 999, t: 'ended', at: 0, d: {} });
  assert.equal(verifyMatchMessage({ b: forged.b.replace('"ended"', '"state"'), g: forged.g }), null);
});

test('B2.4 scoreboard broadcast at most every 2 s, whatever the number of answers', async () => {
  const { svc, radio, student, tick } = setup(GameMode.SUMMER_CAMP_QUESTS, 'camp-01');
  const { view } = await svc.create('t1', 'b1');
  const tokens = Array.from({ length: 20 }, (_, i) => student(i));
  for (const t of tokens) await svc.join(t);
  await svc.control('t1', view.id, 'start');
  const scoresSent = () => radio.messages(view.id).filter((m) => m.t === 'scores').length;
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 20; i++) await svc.onAnswer(`sess-${i}-dev${i}`, { correct: i % 3 !== 0, stars: 2 });
    tick(500);
  }
  assert.equal(scoresSent(), 1, '60 answers in 1.5 s → one scoreboard');
  tick(2000);
  await svc.onAnswer('sess-1-dev1', { correct: true, stars: 3 });
  assert.equal(scoresSent(), 2);
  const last = radio.messages(view.id).filter((m) => m.t === 'scores').at(-1)!.d as { players: Record<string, number> };
  assert.equal(Object.keys(last.players).length, 20);
});

test('B2.5 reconnect keeps score, team and group; a new session of the same device takes over', async () => {
  const { svc, store, student, tick, sessions } = setup(GameMode.KAYAK_RUSH_3D, 'kayak-01');
  const { view } = await svc.create('t1', 'b1');
  const tokens = Array.from({ length: 10 }, (_, i) => student(i));
  for (const t of tokens) await svc.join(t);
  await svc.control('t1', view.id, 'start');
  for (let k = 0; k < 4; k++) {
    await svc.onAnswer('sess-3-dev3', { correct: true, stars: 2 });
    tick(3000);
  }
  const before = await svc.state(tokens[3]);
  assert.equal(before.me.stars, 8);
  // 20 s without network: nothing is lost on the server, the poll brings everything back.
  tick(20_000);
  const after = await svc.state(tokens[3]);
  assert.deepEqual([after.me.stars, after.me.team, after.me.grp], [before.me.stars, before.me.team, before.me.grp]);
  // The phone reloads the page and starts a new session: same student key → same player.
  const fresh = 'tok-3-reload';
  sessions.set(fresh, { id: 'sess-3-reload', battleId: 'b1', studentKey: 'dev3', nickname: 'Em 3', avatar: '🐣' });
  const rejoined = await svc.join(fresh);
  assert.deepEqual([rejoined.me.id, rejoined.me.stars, rejoined.me.team], [before.me.id, 8, before.me.team]);
  await svc.onAnswer('sess-3-reload', { correct: true, stars: 3 });
  assert.equal((await svc.state(fresh)).me.stars, 11);
  assert.equal(await svc.onAnswer('sess-3-dev3', { correct: true, stars: 3 }), null, 'the old session no longer scores');
  assert.equal(store.sessionTeams.get('sess-3-reload')?.team, before.me.team, 'boat-race session team follows the match team');
  // A latecomer goes to the smaller team.
  const late = student(99);
  const joined = await svc.join(late);
  const teams = (await store.players(view.id)).filter((p) => p.id !== joined.me.id).map((p) => p.team);
  const smaller = teams.filter((t) => t === 'A').length <= teams.filter((t) => t === 'B').length ? 'A' : 'B';
  assert.equal(joined.me.team, smaller);
});

test('B2.3 pause freezes the clock and the scores; time up ends the match once, for everyone', async () => {
  const { svc, radio, student, tick } = setup(GameMode.SUMMER_CAMP_QUESTS, 'camp-01');
  const { view } = await svc.create('t1', 'b1', { stageMs: 10_000 });
  const tok = student(1);
  await svc.join(tok);
  await svc.control('t1', view.id, 'start');
  tick(12_000);
  assert.equal((await svc.state(tok)).view.time.status, 'running');
  assert.ok(radio.messages(view.id).some((m) => m.t === 'stage' && (m.d as { stage: number }).stage === 2), 'stage 2 announced');
  await svc.control('t1', view.id, 'pause');
  assert.equal(await svc.onAnswer('sess-1-dev1', { correct: true, stars: 3 }), null, 'no scoring while paused');
  tick(60_000);
  const paused = await svc.state(tok);
  assert.equal(matchClockAt(paused.view.time, paused.view.serverNow).elapsedMs, 12_000);
  await svc.control('t1', view.id, 'resume');
  await svc.control('t1', view.id, 'extend');
  await assert.rejects(svc.control('t1', view.id, 'extend'), /kéo dài/);
  tick(80_000); // 12 + 80 = 92 s ≥ 8 stages × 10 s
  const ended = await svc.state(tok);
  assert.equal(ended.view.status, 'ended');
  assert.equal(ended.view.result?.kind, 'class');
  await svc.state(tok);
  assert.equal(radio.messages(view.id).filter((m) => m.t === 'ended').length, 1, 'ended once');
  await assert.rejects(svc.join(student(2)), /kết thúc/);
  await assert.rejects(svc.control('t1', view.id, 'end'), /kết thúc/);
});

test('B2.7 through the API: no charge no net, a right answer charges it, refusals are counted for the tutor', async () => {
  const { svc, store, student, tick } = setup(GameMode.RIVER_SURVIVAL);
  const { view } = await svc.create('t1', 'b1');
  const tokens = Array.from({ length: 10 }, (_, i) => student(i));
  for (const t of tokens) await svc.join(t);
  await svc.control('t1', view.id, 'start');
  const players = await store.players(view.id);
  const pursuer = players.find((p) => p.team === 'pursuers')!;
  const escaper = players.find((p) => p.team === 'escapers')!;
  const tokOf = (id: string) => tokens[players.findIndex((p) => p.id === id)];
  tick(1000);
  await assert.rejects(svc.action(tokOf(pursuer.id), { type: 'tag', targets: [escaper.id] }), /chưa được nạp/);
  await assert.rejects(svc.action(tokOf(escaper.id), { type: 'tag', targets: [pursuer.id] }), /Săn Tìm/);
  await assert.rejects(svc.action(tokOf(escaper.id), { type: 'nuke' }), /không hợp lệ/);
  await svc.onAnswer(pursuer.sessionId!, { correct: true, stars: 3 });
  const tagged = await svc.action(tokOf(pursuer.id), { type: 'tag', targets: [escaper.id], id: 'x1' });
  assert.ok(tagged.events.some((e) => e.t === 'dodge_window'));
  // The escaper answers right within 6 s: free.
  tick(2000);
  await svc.onAnswer(escaper.sessionId!, { correct: true, stars: 2 });
  const s = (await store.get(view.id))!.state as unknown as SurvivalState;
  assert.equal(s.players[escaper.id].free, true);
  assert.equal(s.players[escaper.id].dodges, 1);
  const tutor = await svc.tutorMatch('t1', { matchId: view.id });
  assert.equal(tutor?.players.find((p) => p.id === pursuer.id)?.refused, 1);
  assert.equal(tutor?.players.find((p) => p.id === escaper.id)?.refused, 1, 'the unknown action type is refused before the rules');
  // Ending: head count with stars from the answers.
  await svc.control('t1', view.id, 'end');
  const end = await svc.state(tokens[0]);
  assert.equal(end.view.result?.kind, 'survival');
  assert.equal(SURVIVAL.maxTargets, 2);
  void timeOf;
});

test('B1.4 Dino Journey: one student plays solo, a class plays as a herd in groups', async () => {
  const solo = setup(GameMode.DINO_JOURNEY, 'dino-01');
  const { view: v1 } = await solo.svc.create('t1', 'b1');
  await solo.svc.join(solo.student(1));
  assert.equal((await solo.svc.control('t1', v1.id, 'start')).view.play?.mode, 'solo');

  const herd = setup(GameMode.DINO_JOURNEY, 'dino-01');
  const { view } = await herd.svc.create('t1', 'b1');
  for (let i = 0; i < 12; i++) await herd.svc.join(herd.student(i));
  const started = await herd.svc.control('t1', view.id, 'start');
  assert.deepEqual([started.view.play?.mode, started.view.play?.groupSize], ['class', 4]);
  const groups = new Set((await herd.store.players(view.id)).map((p) => p.grp));
  assert.equal(groups.size, 3);
});

test('C2.1 looks: template + one of 12 colours, unique per match, a taken one comes back with a free suggestion', async () => {
  const herd = setup(GameMode.DINO_JOURNEY, 'dino-01');
  await herd.svc.create('t1', 'b1');
  const a = await herd.svc.join(herd.student(0), { species: 'trex', color: '#E53935', name: '  Mốc   nhỏ ' });
  assert.deepEqual([a.me.species, a.me.color], ['trex', '#e53935']);
  assert.equal(a.view.roster.find((p) => p.id === a.me.id)?.nickname, 'Mốc nhỏ', 'display name set at join');
  const taken = await herd.svc.join(herd.student(1), { species: 'trex', color: '#e53935' }).then(() => null, (e: MatchError) => e);
  assert.ok(taken instanceof MatchError && taken.status === 409);
  assert.deepEqual(taken.extra?.suggest, { template: 'trex', color: '#fb8c00' }, 'same species, next free colour');
  await herd.svc.join(herd.student(1), { species: 'trex', color: '#fb8c00' });
  await assert.rejects(herd.svc.join(herd.student(2), { species: 'unicorn', color: '#fb8c00' }), /không hợp lệ/);
  await assert.rejects(herd.svc.join(herd.student(2), { species: 'trex', color: '#123456' }), /không hợp lệ/, 'colour outside the palette');
  // Re-joining keeps your own look (it is not "taken" by yourself).
  const again = await herd.svc.join(herd.student(0), { species: 'trex', color: '#e53935' });
  assert.equal(again.me.id, a.me.id);
  // Other worlds pick a journey character; dinosaurs are not offered there.
  const camp = setup(GameMode.SUMMER_CAMP_QUESTS, 'camp-01');
  await camp.svc.create('t1', 'b1');
  assert.equal((await camp.svc.join(camp.student(0), { species: 'sunny', color: '#1e5bd8' })).me.species, 'sunny');
  await assert.rejects(camp.svc.join(camp.student(1), { species: 'trex', color: '#1e5bd8' }), /không hợp lệ/);
});

test('C3.2 the tutor mutes the whole class with one switch (signed broadcast, in every view)', async () => {
  const { svc, radio, student } = setup(GameMode.SUMMER_CAMP_QUESTS, 'camp-01');
  const { view } = await svc.create('t1', 'b1');
  const tok = student(1);
  await svc.join(tok);
  await assert.rejects(svc.control('someone-else', view.id, 'mute'), /Không tìm thấy/);
  const r = await svc.control('t1', view.id, 'mute');
  assert.equal(r.view.muted, true);
  const msg = radio.messages(view.id).filter((m) => m.t === 'state').at(-1)!;
  assert.equal((msg.d as { muted: boolean }).muted, true);
  assert.equal((await svc.state(tok)).view.muted, true);
  await svc.control('t1', view.id, 'unmute');
  assert.equal((await svc.state(tok)).view.muted, false);
});

test('B2.7 a dodge answered right is never lost: decided from the stored last answer at the next poll', async () => {
  const { svc, store, student, tick, now } = setup(GameMode.RIVER_SURVIVAL);
  const { view } = await svc.create('t1', 'b1');
  const tokens = Array.from({ length: 10 }, (_, i) => student(i));
  for (const t of tokens) await svc.join(t);
  await svc.control('t1', view.id, 'start');
  const players = await store.players(view.id);
  const pursuer = players.find((p) => p.team === 'pursuers')!;
  const escaper = players.find((p) => p.team === 'escapers')!;
  const tokOf = (id: string) => tokens[players.findIndex((p) => p.id === id)];
  await svc.onAnswer(pursuer.sessionId!, { correct: true, stars: 3 });
  assert.equal((await store.player(pursuer.id))!.charge, 1, 'charge counted in the database');
  await svc.action(tokOf(pursuer.id), { type: 'tag', targets: [escaper.id] });
  assert.equal((await store.player(pursuer.id))!.charge, 0, 'the throw spent it');
  // The escaper answers right 2 s later, but the rule-state write at that moment is lost:
  // only the counters (match_answer) reach the database.
  tick(2000);
  assert.ok(await store.answer(escaper.sessionId!, true, 2, 2000, now()), 'counted in match_players');
  tick(20_000); // the window is long over when the next poll comes
  const after = await svc.state(tokens[0]);
  assert.equal(after.view.survival?.players[escaper.id].free, true, 'dodged, not caught');
  // A refused throw gives the charge back.
  await svc.onAnswer(pursuer.sessionId!, { correct: true, stars: 3 });
  await assert.rejects(svc.action(tokOf(pursuer.id), { type: 'tag', targets: [pursuer.id] }));
  assert.equal((await store.player(pursuer.id))!.charge, 1, 'refunded');
});

