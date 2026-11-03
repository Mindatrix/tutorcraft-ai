import { describe, it, before } from 'node:test';
import * as assert from 'node:assert';
import * as THREE from 'three';
import { GAME_MODES, GameMode, createQuestNodeMachineState, traverseStabilizedPortal, type MultiverseQuestRoute } from '../src/engine';
import { applyListenerPose, poseFromCamera } from '../src/client/spatialAudio';
import { connectMatch } from '../src/client/matchChannel';
import { createStonePositionalFormantRig } from '../src/components/modes/three/MultiversePortal/positionalFormants';
import { createSpatialPortalCollider } from '../src/components/modes/three/MultiversePortal/portalCollision';
import { createPortalExplorer } from '../src/components/modes/three/MultiversePortal/portalExplorer';
import { createPhysicsWorld, loadRapier, type Rapier } from '../src/components/modes/three/physics/rapierWorld';
import { MemoryBroadcaster, signMatchMessage } from '../src/server/matchBroadcast';
import { MemoryMatchStore } from '../src/server/matchStore';
import { createMatchService, MatchError } from '../src/server/matchService';
import { portalResonanceTask } from '../src/server/matches';
import type { LoadedBattle } from '../src/server/battles';
import { readFileSync } from 'node:fs';

// PR #6 integration (03/11): positional formant audio on the game's bus with a listener that
// follows the camera; the portal's Box3 collider on the Rapier player (PORTAL_STABILIZED →
// WARP_TRANSITION); squad resonance from server-graded attempts reaching every device.

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

// ------------------------------------------------------------------ a tiny recording Web Audio
function fakeAudio() {
  const log: string[] = [];
  const param = (name: string) => ({
    value: 0,
    setValueAtTime(v: number) {
      log.push(`${name}=${v}`);
    },
    setTargetAtTime(v: number) {
      log.push(`${name}~${v}`);
    },
    exponentialRampToValueAtTime() {},
  });
  const node = (kind: string) => {
    const n: Record<string, unknown> = {
      kind,
      connect(to: { kind: string }) {
        log.push(`${kind}->${to.kind}`);
        return to;
      },
      start() {},
      stop() {},
      frequency: param(`${kind}.f`),
      Q: param(`${kind}.q`),
      gain: param(`${kind}.gain`),
      positionX: param('px'),
      positionY: param('py'),
      positionZ: param('pz'),
    };
    return n;
  };
  const ctx = {
    currentTime: 1,
    state: 'running',
    destination: { kind: 'destination' },
    listener: Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map((k) => [k, param(k)])),
    createOscillator: () => node('osc'),
    createPanner: () => node('panner'),
    createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'),
  };
  return { ctx: ctx as unknown as BaseAudioContext & { listener: Record<string, { value: number }> }, log, bus: { kind: 'sfx-bus' } as unknown as AudioNode };
}

describe('positional formants on the game bus, listener on the camera', () => {
  it('the listener takes the camera pose (eased AudioParams) and the legacy API on old Safari', () => {
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(1, 2, 3);
    cam.lookAt(1, 2, -10); // looking down −Z
    const pose = poseFromCamera(cam);
    assert.deepStrictEqual(pose.position, [1, 2, 3]);
    assert.ok(near(pose.forward[2], -1) && near(pose.up[1], 1));
    const { ctx, log } = fakeAudio();
    applyListenerPose(ctx as never, pose);
    assert.ok(log.includes('positionX~1') && log.includes('forwardZ~-1') && log.includes('upY~1'));
    const legacy: string[] = [];
    applyListenerPose({ currentTime: 0, listener: { setPosition: (...a: number[]) => legacy.push(`pos ${a}`), setOrientation: (...a: number[]) => legacy.push(`ori ${a}`) } }, pose);
    assert.strictEqual(legacy.length, 2);
    assert.strictEqual(legacy[0], 'pos 1,2,3');
    assert.match(legacy[1], /^ori /);
  });

  it('the resonance goes into the effects bus (not the speakers), is placed at the stone, and is silent when effects are off', () => {
    const { ctx, log, bus } = fakeAudio();
    let on = true;
    const rig = createStonePositionalFormantRig({ stonePosition: [0, 1.6, 2.2], ipa: '/ɔːlˈðəʊ/', audio: () => ({ context: ctx, output: bus, enabled: () => on }) });
    assert.strictEqual(rig.positionalAudio, null, 'no second AudioContext / THREE.AudioListener');
    rig.triggerFormantResonance({ stars: 3 });
    assert.ok(log.includes('gain->sfx-bus'), 'master → effects bus');
    assert.ok(!log.some((l) => l.endsWith('->destination')), 'never straight to the speakers');
    assert.ok(log.includes('pz=2.2'), 'panner at the stone');
    assert.strictEqual(log.filter((l) => l === 'filter->gain').length, 3, 'F1, F2, F3 band-pass');
    log.length = 0;
    on = false; // student turned effects off, or the tutor muted the class
    const report = rig.triggerFormantResonance({ stars: 2 });
    assert.strictEqual(log.length, 0);
    assert.strictEqual(report.active, true, 'the visual report still comes back');
    // Before the first tap there is no shared context: no sound, no context of its own.
    const early = createStonePositionalFormantRig({ stonePosition: [0, 0, 0], audio: () => null });
    early.triggerFormantResonance();
    assert.strictEqual(early.positionalAudio, null);
  });
});

describe('walking through the portal (Rapier player + THREE.Box3 portal plane)', () => {
  let R: Rapier;
  before(async () => {
    R = await loadRapier();
  });

  const walk = (stabilized: boolean) => {
    const phys = createPhysicsWorld(R);
    phys.addGround(0, 60);
    const collider = createSpatialPortalCollider({ center: [0, 2.2, -2.0] });
    const traverses: number[] = [];
    const explorer = createPortalExplorer(phys, {
      spawn: { x: 0, y: 0.05, z: 5.2 },
      checkPortal: (prev, next) => collider.detectStepThrough(prev, next, stabilized),
      onTraverse: () => traverses.push(1),
    });
    for (let i = 0; i < 30; i++) explorer.step(1 / 60, { x: 0, y: 0, jump: false }, 0); // settle
    let minZ = Infinity;
    for (let i = 0; i < 60 * 5; i++) {
      explorer.step(1 / 60, { x: 0, y: 1, jump: false }, 0);
      minZ = Math.min(minZ, explorer.character.position.z);
    }
    const end = { ...explorer.character.position };
    explorer.dispose();
    phys.dispose();
    return { traverses: traverses.length, minZ, end };
  };

  it('a portal that is not stabilised is just scenery: the player walks on, no warp', () => {
    const r = walk(false);
    assert.strictEqual(r.traverses, 0);
    assert.ok(r.minZ < -3, `walked past the arch: z=${r.minZ.toFixed(2)}`);
  });

  it('a stabilised portal warps once, the player arrives at the next room entry', () => {
    const r = walk(true);
    assert.ok(r.traverses >= 1, 'warp triggered');
    assert.ok(r.minZ > -3, `never got far behind the arch: z=${r.minZ.toFixed(2)}`);
  });

  it('the quest machine goes PORTAL_STABILIZED → WARP_TRANSITION → next room, same WebGL context', () => {
    const quests = JSON.parse(readFileSync('content/multiverse_quests.json', 'utf8')) as { routes: MultiverseQuestRoute[] };
    const [mv1, mv2] = quests.routes;
    const st = { ...createQuestNodeMachineState({ routeId: 'mv-01', nextRouteId: 'mv-02' }), stage: 'PORTAL_STABILIZED' as const };
    const next = traverseStabilizedPortal(st, mv2);
    assert.ok(next.history.includes('WARP_TRANSITION'));
    assert.strictEqual(next.stage, 'EXPLORATION');
    assert.strictEqual(next.routeId, 'mv-02');
    assert.strictEqual(next.webglContextId, st.webglContextId);
    assert.strictEqual(next.webglContextResetCount, 0);
    assert.strictEqual(mv1.next, 'mv-02');
    // Not stabilised: nothing happens.
    const locked = createQuestNodeMachineState({ routeId: 'mv-01', nextRouteId: 'mv-02' });
    assert.strictEqual(traverseStabilizedPortal(locked, mv2), locked);
  });
});

describe('PORTAL_RESONANCE_UPDATE reaches every device', () => {
  it('only server-graded, accepted attempts of a Multiverse class match feed the quorum', () => {
    const ctx = { matchId: 'm1', sessionId: 's1', game: 'multiverse_portal' };
    const reply = { accepted: true, targetId: 'mv01_stone_although', score: 91, passed: true };
    assert.strictEqual(typeof portalResonanceTask(ctx, reply, 'shadow'), 'function');
    assert.strictEqual(portalResonanceTask({ ...ctx, game: 'kayak_rush' }, reply, 'shadow'), null);
    assert.strictEqual(portalResonanceTask({ ...ctx, matchId: null }, reply, 'shadow'), null);
    assert.strictEqual(portalResonanceTask(ctx, { ...reply, accepted: false }, 'shadow'), null);
  });

  it('a device applies the signed resonance update (quorum progress), drops forged ones', async () => {
    const radio = new MemoryBroadcaster();
    const battle = { id: 'b-mv', code: 'MV1', tutorId: 't1', config: { scenario: GAME_MODES[GameMode.MULTIVERSE_PORTAL_RPG].scenarios[0], gameMode: GameMode.MULTIVERSE_PORTAL_RPG, scenarioKey: 'mv-01', level: 3, classCode: 'L5' } } as unknown as LoadedBattle;
    const svc = createMatchService({
      store: new MemoryMatchStore(),
      broadcaster: radio,
      loadBattle: async () => battle,
      session: async (t) => {
        const i = String(t).replace('tok', '');
        if (!/^\d+$/.test(i)) throw new MatchError(401, 'bad');
        return { id: `s${i}`, battleId: 'b-mv', studentKey: `k${i}`, nickname: `Em ${i}`, avatar: '🚀' };
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
    const { view } = await svc.create('t1', 'b-mv');
    const conn = await connectMatch({ token: 'tok1', fetch: fake, supabase: null, events: null, pollMs: 60_000 });
    try {
      for (const i of [2, 3, 4, 5]) await svc.join(`tok${i}`);
      await svc.control('t1', view.id, 'start');
      for (const m of radio.sent) await conn.receive(m);
      // 5 students → 3 needed. Two speak (server-graded).
      for (const sid of ['s1', 's2']) {
        await svc.recordPortalResonance({ matchId: view.id, studentId: sid, targetId: 'mv01_stone_although', mode: 'shadow', score: 90, passed: true });
      }
      const updates = radio.sent.filter((x) => JSON.parse(x.b).t === 'portal_resonance');
      assert.strictEqual(updates.length, 2);
      for (const u of updates) assert.strictEqual(await conn.receive(u), true);
      const pr = conn.snapshot().portalResonance!;
      assert.strictEqual(pr.type, 'PORTAL_RESONANCE_UPDATE');
      assert.strictEqual(pr.quorum.squadSize, 5);
      assert.strictEqual(pr.quorum.requiredVocalizations, 3);
      assert.strictEqual(pr.quorum.completedCount, 2);
      assert.strictEqual(pr.quorum.stabilized, false);
      // A forged "stabilised" message (edited text, old signature) is dropped.
      const last = updates.at(-1)!;
      const forged = { ...last, b: last.b.replace('"stabilized":false', '"stabilized":true') };
      assert.strictEqual(await conn.receive(forged), false);
      // Third student → stabilised on every device.
      await svc.recordPortalResonance({ matchId: view.id, studentId: 's3', targetId: 'mv01_stone_although', mode: 'dictate', score: 100, passed: true });
      assert.strictEqual(await conn.receive(radio.sent.at(-1)!), true);
      assert.strictEqual(conn.snapshot().portalResonance!.quorum.stabilized, true);
      // Unsigned / foreign-match messages never count.
      assert.strictEqual(await conn.receive(signMatchMessage({ m: 'other', s: 1e9, t: 'portal_resonance', at: 0, d: {} })), false);
    } finally {
      conn.close();
    }
  });
});
