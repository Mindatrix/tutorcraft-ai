import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { GAME_MODES, GameMode } from '../src/engine';
import { connectMatch } from '../src/client/matchChannel';
import { MemoryBroadcaster, signMatchMessage } from '../src/server/matchBroadcast';
import { MemoryMatchStore } from '../src/server/matchStore';
import { createMatchService, MatchError } from '../src/server/matchService';
import type { LoadedBattle } from '../src/server/battles';

/** A device talking to a real (in-memory) match service through a fake fetch. */
async function rig() {
  const radio = new MemoryBroadcaster();
  const battle = { id: 'b1', code: 'C1', tutorId: 't1', config: { scenario: GAME_MODES[GameMode.SUMMER_CAMP_QUESTS].scenarios[0], gameMode: GameMode.SUMMER_CAMP_QUESTS, scenarioKey: 'camp-01', level: 2, classCode: 'C1' } } as unknown as LoadedBattle;
  const svc = createMatchService({
    store: new MemoryMatchStore(),
    broadcaster: radio,
    loadBattle: async () => battle,
    session: async (t) => {
      const i = String(t).replace('tok', '');
      if (!/^\d+$/.test(i)) throw new MatchError(401, 'bad');
      return { id: `s${i}`, battleId: 'b1', studentKey: `k${i}`, nickname: `Em ${i}`, avatar: '🦕' };
    },
  });
  const fake: typeof fetch = async (input, init) => {
    const url = String(input);
    const token = new Headers(init?.headers).get('x-battle-session');
    try {
      const body = url.endsWith('/join') ? await svc.join(token) : await svc.state(token);
      return new Response(JSON.stringify(body), { status: 200 });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: (e as MatchError).status ?? 500 });
    }
  };
  const { view } = await svc.create('t1', 'b1');
  return { svc, radio, view, fake };
}

test('B2.4 device: signed server messages are applied; forged, replayed and foreign ones are dropped', async () => {
  const { svc, radio, view, fake } = await rig();
  const conn = await connectMatch({ token: 'tok1', fetch: fake, supabase: null, events: null, pollMs: 60_000 });
  try {
    await svc.join('tok2');
    await svc.control('t1', view.id, 'start');
    await svc.onAnswer('s1', { correct: true, stars: 3 });
    const byType = (t: string) => radio.sent.filter((x) => JSON.parse(x.b).t === t);
    const roster = byType('roster').at(-1)!;
    const state = byType('state').at(-1)!;
    const scores = byType('scores').at(-1)!;
    assert.equal(await conn.receive(roster), true);
    assert.equal(await conn.receive(state), true);
    assert.equal(conn.snapshot().view?.status, 'running');
    assert.equal(await conn.receive(scores), true);
    assert.equal(conn.snapshot().me?.stars, 3, 'own stars from the scoreboard');

    assert.equal(await conn.receive(scores), false, 'replayed message');
    const forgedText = { b: scores.b.replace('"t":"scores"', '"t":"ended"'), g: scores.g };
    assert.equal(await conn.receive(forgedText), false, 'edited text, old signature');
    // Signed with another key (what a student could produce).
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const b = JSON.stringify({ m: view.id, s: 999, t: 'ended', at: Date.now(), d: { result: null, time: {} } });
    const g = sign('sha256', Buffer.from(b), { key: createPrivateKey(privateKey.export({ format: 'pem', type: 'pkcs8' })), dsaEncoding: 'ieee-p1363' }).toString('base64url');
    assert.equal(await conn.receive({ b, g }), false, 'other key');
    // Genuine signature, but for another match.
    assert.equal(await conn.receive(signMatchMessage({ m: 'other-match', s: 1000, t: 'ended', at: 0, d: {} })), false, 'other match');
    assert.equal(await conn.receive({ hello: 1 }), false, 'garbage');
    assert.equal(conn.snapshot().view?.status, 'running', 'nothing fake got through');
    assert.equal(conn.snapshot().dropped, 4, 'forged, other key, other match, garbage');
    assert.equal(conn.snapshot().stale, 1, 'the replay');

    // Clock: the device's server time is within a few ms of the server.
    const c = conn.clock();
    assert.equal(c?.stage, 1);
  } finally {
    conn.close();
  }
});

test('B2.5 device: an old message arriving after a fresher authoritative state is ignored', async () => {
  const { svc, radio, view, fake } = await rig();
  const conn = await connectMatch({ token: 'tok1', fetch: fake, supabase: null, events: null, pollMs: 60_000 });
  try {
    await svc.control('t1', view.id, 'start');
    await svc.control('t1', view.id, 'pause');
    const pauseMsg = radio.sent.at(-1)!;
    await svc.control('t1', view.id, 'resume');
    await conn.refresh(); // back online: the poll brings "running"
    assert.equal(conn.snapshot().view?.status, 'running');
    assert.equal(await conn.receive(pauseMsg), false, 'late "paused" must not undo the newer state');
    assert.equal(conn.snapshot().view?.status, 'running');
  } finally {
    conn.close();
  }
});

test('B2.4 device: a jump in message numbers (a missed broadcast) makes it ask the server at once', async () => {
  const { svc, radio, view, fake } = await rig();
  let polls = 0;
  const counting: typeof fetch = (input, init) => {
    if (String(input).endsWith('/state')) polls += 1;
    return fake(input, init);
  };
  const syncs: number[] = [];
  const conn = await connectMatch({ token: 'tok1', fetch: counting, supabase: null, events: null, pollMs: 60_000, onSync: (s) => syncs.push(s) });
  try {
    await svc.control('t1', view.id, 'start');
    await svc.control('t1', view.id, 'pause');
    await svc.control('t1', view.id, 'resume');
    const states = radio.sent.filter((x) => JSON.parse(x.b).t === 'state');
    const before = polls;
    // "pause" never arrives; "resume" does: the device sees the gap.
    assert.equal(await conn.receive(states[0]), true);
    assert.equal(await conn.receive(states[2]), true);
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(polls, before + 1, 'one immediate state request');
    assert.ok(syncs.at(-1)! >= JSON.parse(states[2].b).s, 'state caught up');
  } finally {
    conn.close();
  }
});

test('C3.2 device: the class mute arrives with the state message', async () => {
  const { svc, radio, view, fake } = await rig();
  const conn = await connectMatch({ token: 'tok1', fetch: fake, supabase: null, events: null, pollMs: 60_000 });
  try {
    assert.equal(conn.snapshot().view?.muted, false);
    await svc.control('t1', view.id, 'mute');
    const msg = radio.sent.filter((x) => JSON.parse(x.b).t === 'state').at(-1)!;
    assert.equal(await conn.receive(msg), true);
    assert.equal(conn.snapshot().view?.muted, true);
  } finally {
    conn.close();
  }
});

