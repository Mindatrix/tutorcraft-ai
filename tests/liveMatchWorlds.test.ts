import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { CAMP_STATIONS, DEFAULT_SPEECH_RULES, GAME_MODES, GameMode, applyCampStation, campStationFor, emptyCampQuest, speechGameEffect, stationsNeeded, type Question } from '../src/engine';
import { connectMatch } from '../src/client/matchChannel';
import { tentQuestOf } from '../src/client/useTentQuest';
import { fishingLineState, FISHING_CAST_SEC } from '../src/components/modes/three/phoneticStones';
import { MemoryBroadcaster } from '../src/server/matchBroadcast';
import { MemoryMatchStore } from '../src/server/matchStore';
import { createMatchService, MatchError } from '../src/server/matchService';
import { campQuestTask } from '../src/server/matches';
import { MemorySpeechStore, createSpeechService, type SpeechContext } from '../src/server/speech';
import type { LoadedBattle } from '../src/server/battles';

// 03/11 live match: Summer Camp stations / tent Quest Board and the River Fishing catch bonus,
// decided on the server; the 3D scenes only draw them.

const base = { success: true, prevBestStars: 0, bestStars: 1, alreadyDone: false, doneBefore: 0, flagged: false };

describe('server effects for the two worlds', () => {
  it('stones fill the 4 hub stations in turn; word and sentence of a question share one', () => {
    assert.deepStrictEqual(['q1w', 'q2w', 'q3w', 'q4w', 'q5w'].map(campStationFor), [...CAMP_STATIONS, CAMP_STATIONS[0]]);
    assert.strictEqual(campStationFor('q7w'), campStationFor('q7s'));
    assert.ok(CAMP_STATIONS.includes(campStationFor('odd-id')));
  });

  it('summer_camp: a first pass completes the stone at its station; again = nothing', () => {
    assert.deepStrictEqual(speechGameEffect({ ...base, game: 'summer_camp', targetId: 'q2w', doneBefore: 3 }), { kind: 'camp_station', stationId: 'camp_tent_station', solved: 4, pet: 'celebrate' });
    assert.strictEqual(speechGameEffect({ ...base, game: 'summer_camp', targetId: 'q2w', alreadyDone: true }), null);
    assert.strictEqual(speechGameEffect({ ...base, game: 'summer_camp', targetId: 'q2w', success: false }), null);
  });

  it('river_fishing: catch bonus pass ×1.0, 2★ ×1.1, 3★ ×1.2, only when the stars go up', () => {
    const fx = (prev: number, best: number) => speechGameEffect({ ...base, game: 'river_fishing', prevBestStars: prev, bestStars: best });
    assert.deepStrictEqual(fx(0, 1), { kind: 'catch_bonus', multiplier: 1.0, stars: 1, pet: 'celebrate' });
    assert.deepStrictEqual(fx(1, 2), { kind: 'catch_bonus', multiplier: 1.1, stars: 2, pet: 'celebrate' });
    assert.deepStrictEqual(fx(0, 3), { kind: 'catch_bonus', multiplier: 1.2, stars: 3, pet: 'celebrate' });
    assert.strictEqual(fx(3, 3), null, 'no farming the same stone');
    assert.strictEqual(fx(0, 0), null);
  });

  it('the speech service gives camp stones their station and returns the effects (typed counts too)', async () => {
    const questions = ['fish', 'river', 'tent', 'light'].map((w, i) => ({ id: i + 1, question: `Which word is "${w}"?`, options: [w, 'x'], correct_idx: 0, difficulty: 'easy', topic: 'v', skill_tag: 'vocabulary' })) as Question[];
    const ctx = (game: string): SpeechContext => ({ sessionId: `s-${game}`, battleId: `demo-${game}`, studentKey: 'k', matchId: null, status: 'active', level: 1, questions, answeredIds: [1, 2, 3, 4], game });
    const svc = createSpeechService({ storeFor: () => new MemorySpeechStore(), rewards: () => null, rules: () => DEFAULT_SPEECH_RULES, voiceEnabled: () => false });
    const camp = await svc.targets(ctx('summer_camp'));
    assert.ok(camp.targets.length > 0);
    for (const t of camp.targets) assert.strictEqual((t as { stationId?: string }).stationId, campStationFor(t.targetId));
    assert.ok(camp.targets.every((t) => !t.modes.includes('shadow')), 'voice off in a class: typed / repeat only');
    const fish = await svc.targets(ctx('river_fishing'));
    assert.ok(fish.targets.every((t) => !('stationId' in t)));
    const r = await svc.submit(ctx('summer_camp'), { targetId: 'q3w', mode: 'dictate', typed: 'tent' });
    assert.strictEqual(r.effect?.kind, 'camp_station');
    const f = await svc.submit(ctx('river_fishing'), { targetId: 'q1w', mode: 'dictate', typed: 'fish' });
    assert.strictEqual(f.effect?.kind, 'catch_bonus');
  });
});

describe('tent Quest Board (engine/campQuest.ts)', () => {
  it('needs ceil(size/2) stones per station (1..3), one per student per station; the flag after 4 stations', () => {
    assert.deepStrictEqual([1, 2, 3, 5, 8].map(stationsNeeded), [1, 1, 2, 3, 3]);
    let s = emptyCampQuest();
    let r = applyCampStation(s, 'g1', 4, 'p1', 'camp_kitchen_station');
    assert.strictEqual(r.tent.needed, 2);
    assert.strictEqual(r.stationDone, false);
    s = r.state;
    r = applyCampStation(s, 'g1', 4, 'p1', 'camp_kitchen_station');
    assert.strictEqual(r.changed, false, 'same student, same station: once');
    r = applyCampStation(s, 'g1', 4, 'p2', 'camp_kitchen_station');
    assert.strictEqual(r.stationDone, true);
    s = r.state;
    for (const st of CAMP_STATIONS.slice(1)) {
      s = applyCampStation(s, 'g1', 4, 'p1', st).state;
      r = applyCampStation(s, 'g1', 4, 'p2', st);
      s = r.state;
    }
    assert.strictEqual(r.tent.flag, true);
    assert.strictEqual(r.flagRaised, true);
    assert.strictEqual(s.tents.g2, undefined, 'another tent is untouched');
  });
});

describe('class match: the tent board reaches every device', () => {
  it('only an accepted camp_station attempt of a Summer Camp class match counts', () => {
    const ctx = { matchId: 'm', sessionId: 's', game: 'summer_camp' };
    const ok = { accepted: true, effect: { kind: 'camp_station', stationId: 'camp_water_station' as const } };
    assert.strictEqual(typeof campQuestTask(ctx, ok), 'function');
    assert.strictEqual(campQuestTask({ ...ctx, game: 'river_fishing' }, ok), null);
    assert.strictEqual(campQuestTask({ ...ctx, matchId: null }, ok), null);
    assert.strictEqual(campQuestTask(ctx, { accepted: true }), null);
  });

  it('recordCampStation updates the tent, broadcasts camp_quest, the device shows its own tent', async () => {
    const radio = new MemoryBroadcaster();
    const battle = { id: 'b-camp', code: 'CAMP1', tutorId: 't1', config: { scenario: GAME_MODES[GameMode.SUMMER_CAMP_QUESTS].scenarios[0], gameMode: GameMode.SUMMER_CAMP_QUESTS, scenarioKey: 'camp-01', level: 2, classCode: 'L5' } } as unknown as LoadedBattle;
    const svc = createMatchService({
      store: new MemoryMatchStore(),
      broadcaster: radio,
      loadBattle: async () => battle,
      session: async (t) => {
        const i = String(t).replace('tok', '');
        if (!/^\d+$/.test(i)) throw new MatchError(401, 'bad');
        return { id: `s${i}`, battleId: 'b-camp', studentKey: `k${i}`, nickname: `Em ${i}`, avatar: '⛺' };
      },
    });
    const fake: typeof fetch = async (input, init) => {
      const token = new Headers(init?.headers).get('x-battle-session');
      try {
        const body = String(input).endsWith('/join') ? await svc.join(token) : await svc.state(token);
        return new Response(JSON.stringify(body), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: (e as MatchError).status ?? 500 });
      }
    };
    const { view } = await svc.create('t1', 'b-camp');
    const conn = await connectMatch({ token: 'tok1', fetch: fake, supabase: null, events: null, pollMs: 60_000 });
    try {
      for (const i of [2, 3, 4]) await svc.join(`tok${i}`);
      await svc.control('t1', view.id, 'start');
      for (const m of radio.sent) await conn.receive(m);
      const me = conn.snapshot().me!;
      const tent = me.grp != null ? `g${me.grp}` : 'all';
      const q = await svc.recordCampStation({ matchId: view.id, sessionId: 's1', stationId: 'camp_kitchen_station' });
      assert.ok(q);
      assert.strictEqual(q.stations.camp_kitchen_station, 1);
      const msg = radio.sent.filter((x) => JSON.parse(x.b).t === 'camp_quest').at(-1)!;
      assert.strictEqual(JSON.parse(msg.b).d.tent, tent);
      assert.strictEqual(await conn.receive(msg), true);
      assert.strictEqual(tentQuestOf(conn.snapshot())?.stations.camp_kitchen_station, 1);
      // Again by the same student: no change, no new broadcast.
      const before = radio.sent.length;
      await svc.recordCampStation({ matchId: view.id, sessionId: 's1', stationId: 'camp_kitchen_station' });
      assert.strictEqual(radio.sent.length, before);
      // A device that (re)joins sees the board in the match view.
      const st = await svc.state('tok2');
      assert.ok(st.view.campQuest && Object.keys(st.view.campQuest).length === 1);
    } finally {
      conn.close();
    }
  });
});

describe('fishing line tension = the 3D rod', () => {
  it('idle → 0; peaks mid-cast; a heavier (bonus) catch pulls harder', () => {
    assert.deepStrictEqual(fishingLineState(10, 9, 1), { phase: 'idle', progress: 0, tension: 0 });
    const mid = (scale: number) => fishingLineState(10, 10 + FISHING_CAST_SEC / 2, scale);
    assert.strictEqual(mid(1).phase, 'casting');
    assert.ok(Math.abs(mid(1).progress - 0.5) < 1e-9);
    assert.ok(mid(1.35).tension > mid(1.18).tension && mid(1.18).tension > mid(1).tension);
    assert.ok(mid(1.35).tension <= 1);
    assert.ok(fishingLineState(10, 10 + FISHING_CAST_SEC * 0.95, 1).tension < mid(1).tension, 'low at the start');
  });
});
