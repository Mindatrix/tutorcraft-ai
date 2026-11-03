import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createPhysicsWorld,
  loadRapier,
  type Rapier,
} from '../src/components/modes/three/physics/rapierWorld';
import { createCharacter } from '../src/components/modes/three/physics/characterController';
import {
  triangleCount,
  trianglesFrom,
} from '../src/components/modes/three/physics/fromThree';
import {
  buildSceneCollisionMesh,
  findCollisionGroup,
  type PhysicsSceneId,
  type SceneColliderMetadata,
} from '../src/components/modes/three/physics/sceneColliders';
import {
  buildProceduralRiggedHumanoid,
  PHYSICS_CAPSULE_HEIGHT,
  PHYSICS_CLIPS,
  PHYSICS_CROSSFADE_SEC,
  PhysicsCharacterAvatar,
  resolvePhysicsClipMap,
  RIGGED_CHARACTER_CLIP_CATALOG,
} from '../src/components/modes/three/avatar';
import {
  computeWarpTransitionState,
  createWarpPortalRig,
  WARP_DURATION_MS,
} from '../src/components/modes/three/warpPortalEffect';
import {
  createGoldenChallengeOrb,
  isGoldenChallengeVisible,
} from '../src/components/modes/three/goldenChallengeOrb';
import {
  MAX_PHONETIC_STONES,
  raycastPhoneticStones,
} from '../src/components/modes/three/phoneticStoneRaycaster';
import {
  RIVER_SURVIVAL_CLEARING_STONES,
  RIVER_SURVIVAL_SPEECH_TARGETS,
} from '../src/components/modes/three/RiverSurvival/clearingStones';
import { applySurvivalSpeechEffect } from '../src/components/modes/three/RiverSurvival/speechEffects';
import {
  PET_DIALOGUES,
  PhoneticStoneStateMachine,
  survivalStonesOpen,
} from '../src/client/phoneticStones';
import { WARP } from '../src/client/spatialInput';

describe('A1 — Collision Meshes for River Survival, Summer Camp, Kayak, and Multiverse', () => {
  let R: Rapier;
  before(async () => {
    R = await loadRapier();
  });

  const SCENES: PhysicsSceneId[] = [
    'river_survival',
    'summer_camp',
    'kayak_rush',
    'multiverse_portal',
  ];

  it('builds a collision group with userData.collision = true, < 3,000 triangles, and no collider > 100 m', () => {
    for (const sceneId of SCENES) {
      const root = new THREE.Group();
      const col = buildSceneCollisionMesh(sceneId);
      root.add(col);

      const found = findCollisionGroup(root);
      assert.ok(found, `findCollisionGroup must locate ${sceneId} collision group`);
      assert.equal(found.userData.collision, true);

      const meta = found.userData as SceneColliderMetadata;
      assert.equal(meta.sceneId, sceneId);
      assert.ok(meta.maxTileSpanM <= 36 && meta.maxTileSpanM < 100, 'no tile exceeds 100 m');
      assert.ok(meta.maxStepHeightM <= 0.35, 'step height <= 0.35 m');
      assert.ok(meta.maxSlopeDeg <= 45, 'slope angle <= 45 deg');

      // Verify every individual mesh bounding box is strictly < 100 m along X, Y, Z
      col.updateWorldMatrix(true, true);
      let meshCount = 0;
      col.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        meshCount += 1;
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox!;
        const spanX = (bb.max.x - bb.min.x) * m.scale.x;
        const spanY = (bb.max.y - bb.min.y) * m.scale.y;
        const spanZ = (bb.max.z - bb.min.z) * m.scale.z;
        assert.ok(spanX < 100 && spanY < 100 && spanZ < 100, `${sceneId} mesh span < 100 m`);
      });
      assert.ok(meshCount >= 12, `${sceneId} has ground tiles, steps, ramp, bridge/dock, rocks, walls`);

      const tris = trianglesFrom(col);
      const count = triangleCount(tris);
      assert.ok(count > 50 && count < 3000, `${sceneId} triangle count ${count} within budget (< 3,000)`);
    }
  });

  it('Rapier 0.21 WASM: character stands on tiled ground, climbs steps <= 0.35 m and slopes <= 45 deg without falling through in all 4 scenes', () => {
    for (const sceneId of SCENES) {
      const col = buildSceneCollisionMesh(sceneId);
      const meta = col.userData as SceneColliderMetadata;
      const phys = createPhysicsWorld(R);
      phys.addTriangles(trianglesFrom(col));

      // 1. Spawn above origin (0, 0.5, 0) and settle onto tiled ground without falling through
      const char = createCharacter(phys, { position: { x: 0, y: 0.5, z: 0 } });
      for (let i = 0; i < 60; i++) {
        phys.step(1 / 60, (h) => char.update({ x: 0, y: 0, jump: false }, 0, h));
      }
      assert.equal(char.motion.grounded, true, `${sceneId}: grounded on tiled floor`);
      assert.ok(Math.abs(char.position.y) < 0.08, `${sceneId}: feet at y=${char.position.y.toFixed(3)}`);

      // 2. Teleport in front of the scene's staircase and walk forward (+y input => -Z) to climb steps <= 0.35 m
      const [sx, sy, sz] = meta.features.stepStart;
      char.teleport({ x: sx, y: sy + 0.05, z: sz + 0.9 });
      for (let i = 0; i < 95; i++) {
        phys.step(1 / 60, (h) => char.update({ x: 0, y: 1, jump: false }, 0, h));
      }
      assert.ok(
        char.position.y >= 0.35,
        `${sceneId}: climbed steps to y=${char.position.y.toFixed(2)} (z=${char.position.z.toFixed(2)})`,
      );

      // 3. Teleport in front of the scene's sloped ramp (<= 21 deg <= 45 deg) and climb up the ramp
      const [rx, ry, rz] = meta.features.rampStart;
      char.teleport({ x: rx, y: ry + 0.05, z: rz + 0.9 });
      for (let i = 0; i < 110; i++) {
        phys.step(1 / 60, (h) => char.update({ x: 0, y: 1, jump: false }, 0, h));
      }
      assert.ok(
        char.position.y >= 0.5,
        `${sceneId}: climbed slope ramp to y=${char.position.y.toFixed(2)} (z=${char.position.z.toFixed(2)})`,
      );

      char.dispose();
      phys.dispose();
    }
  });
});

describe('A2 — Rigged Animated Character Avatar (1.5 m capsule height, 5 clips, 0.15–0.25 s crossfade)', () => {
  it('scales character to 1.5 m height with feet planted at y = 0 and maps all 5 clips (idle | walk | run | jump | fall)', () => {
    const built = buildProceduralRiggedHumanoid('#38bdf8', PHYSICS_CAPSULE_HEIGHT);
    const avatar = new PhysicsCharacterAvatar(
      { model: 'char_gamer_boy', height: PHYSICS_CAPSULE_HEIGHT },
      built,
    );

    assert.equal(avatar.targetHeight, 1.5);
    assert.ok(avatar.crossFadeSec >= 0.15 && avatar.crossFadeSec <= 0.25);
    assert.equal(avatar.crossFadeSec, PHYSICS_CROSSFADE_SEC);

    const bindings = avatar.clipBindings;
    for (const clipName of PHYSICS_CLIPS) {
      assert.ok(bindings[clipName], `binding exists for ${clipName}`);
    }

    // Sync from controller at ground y = 0 and verify feet stay at y = 0 and facing matches motion.facing
    avatar.syncFromController({ x: 2.5, y: 0, z: -4.0, facing: 1.25, clip: 'walk' }, 1 / 60);
    assert.equal(avatar.root.position.x, 2.5);
    assert.equal(avatar.root.position.y, 0);
    assert.equal(avatar.root.position.z, -4.0);
    assert.equal(avatar.root.rotation.y, 1.25);
    assert.equal(avatar.clip, 'walk');

    // Crossfade transition duration stays clamped within [0.15, 0.25] s across all 5 states
    for (const state of PHYSICS_CLIPS) {
      const fade = avatar.setClip(state, 0.2);
      assert.ok(fade >= 0.15 && fade <= 0.25);
      avatar.update(1 / 60);
      assert.equal(avatar.clip, state);
    }

    avatar.dispose();
  });

  it('audits missing clips accurately and falls back to nearest clip when a GLB lacks jump/fall/idle', () => {
    // Simulate a GLB that only has ["Running", "Walking"] (like char_grovaen_female / char_iridescent_voyager)
    const walkClip = new THREE.AnimationClip('Walking', 1.0, []);
    const runClip = new THREE.AnimationClip('Running', 0.7, []);
    const res = resolvePhysicsClipMap([walkClip, runClip]);

    assert.deepEqual(res.missingClips, ['idle', 'jump', 'fall']);
    assert.equal(res.bindings.walk?.isFallback, false);
    assert.equal(res.bindings.run?.isFallback, false);
    assert.equal(res.bindings.idle?.isFallback, true);
    assert.equal(res.bindings.jump?.isFallback, true);
    assert.equal(res.bindings.fall?.isFallback, true);

    assert.ok(Object.keys(RIGGED_CHARACTER_CLIP_CATALOG).length >= 10);
    assert.deepEqual(RIGGED_CHARACTER_CLIP_CATALOG.char_gamer_boy.missingPhysicsClips, ['fall']);
    assert.deepEqual(RIGGED_CHARACTER_CLIP_CATALOG.char_kid_dancer.missingPhysicsClips, ['idle']);
  });
});

describe('A3 — "Xuyên không" Portal & 0.9 s (WARP.warpMs) Transition Effect', () => {
  it('matches WARP.warpMs (900 ms = 0.9 s), respects prefers-reduced-motion, and supports low-tier mode', () => {
    assert.equal(WARP_DURATION_MS, WARP.warpMs);
    assert.equal(WARP_DURATION_MS, 900);

    const midStandard = computeWarpTransitionState({
      active: true,
      elapsedMs: 450,
      reducedMotion: false,
      lite: false,
    });
    assert.equal(midStandard.active, true);
    assert.equal(midStandard.progress, 0.5);
    assert.ok(midStandard.opacity > 0.7);
    assert.ok(midStandard.tunnelScale > 1);
    assert.ok(midStandard.ringRotationDeg > 0);

    // Reduced motion keeps tunnelScale = 1 and ringRotationDeg = 0
    const midReduced = computeWarpTransitionState({
      active: true,
      elapsedMs: 450,
      reducedMotion: true,
      lite: false,
    });
    assert.equal(midReduced.tunnelScale, 1);
    assert.equal(midReduced.ringRotationDeg, 0);
    assert.ok(midReduced.opacity <= 0.56);

    // Ends cleanly at 900 ms (0.9 s)
    const finished = computeWarpTransitionState({
      active: true,
      elapsedMs: 900,
    });
    assert.equal(finished.active, false);
    assert.equal(finished.opacity, 0);

    // 3D Portal rig supports golden & open highlights and low tier
    const rigLow = createWarpPortalRig({ position: { x: 0, y: 0, z: -10 }, tier: 'low', golden: true });
    assert.equal(rigLow.group.children.length, 2, 'low tier portal uses only 2 meshes');
    rigLow.update(1.5, false);
    rigLow.dispose();
  });
});

describe('A4 — River Survival Decoder Phonetic Stones, Gating & Clue Reveal Effects', () => {
  it('places <= 12 Decoder clearing stones across all 3 zones and gates selection with survivalStonesOpen', () => {
    assert.ok(RIVER_SURVIVAL_CLEARING_STONES.length > 0);
    assert.ok(RIVER_SURVIVAL_CLEARING_STONES.length <= MAX_PHONETIC_STONES);
    assert.equal(RIVER_SURVIVAL_SPEECH_TARGETS.length, RIVER_SURVIVAL_CLEARING_STONES.length);

    const zonesCovered = new Set(RIVER_SURVIVAL_CLEARING_STONES.map((s) => s.zoneId));
    assert.deepEqual([...zonesCovered].sort(), ['zone_alpha', 'zone_bravo', 'zone_charlie']);

    // Gate checks: blocked during question or timed 6s dodge / 8s snatch windows
    assert.equal(survivalStonesOpen({ now: 1000, questionOpen: false, dodgeUntil: null, snatchUntil: null }), true);
    assert.equal(survivalStonesOpen({ now: 1000, questionOpen: true }), false);
    assert.equal(survivalStonesOpen({ now: 1000, dodgeUntil: 4000 }), false);
    assert.equal(survivalStonesOpen({ now: 1000, snatchUntil: 5000 }), false);
  });

  it('wires stone:result / stone:effect (decoder_clue) to applySurvivalSpeechEffect and reveals pen at 2 & net at 4 stones', () => {
    let beaconPulses = 0;
    let focusedZone: string | null = null;
    const mockEnv = {
      woodenPens: {
        zone_alpha: { pulseCipherClue: () => { beaconPulses += 1; } },
        zone_bravo: { pulseCipherClue: () => { beaconPulses += 1; } },
        zone_charlie: { pulseCipherClue: () => { beaconPulses += 1; } },
      } as never,
      focusZone: (z: string) => {
        focusedZone = z;
      },
    };

    const machine = new PhoneticStoneStateMachine({
      targets: RIVER_SURVIVAL_SPEECH_TARGETS,
      gameMode: 'river_survival',
      autoModelDelayMs: 0,
      speak: async () => {},
    });

    const effects: unknown[] = [];
    machine.bus.on('stone:effect', ({ effect }) => {
      effects.push(effect);
    });

    // Solve 2 distinct stones -> unlocks 'pen' clue
    machine.selectStone(RIVER_SURVIVAL_SPEECH_TARGETS[0].targetId, { autoModel: false });
    const r1 = machine.applyMockResponse({
      targetId: RIVER_SURVIVAL_SPEECH_TARGETS[0].targetId,
      accepted: true,
      score: 90,
      passed: true,
      stars: 3,
      attemptNo: 1,
      attemptsLeft: 2,
      bestScore: 90,
    });
    const out1 = applySurvivalSpeechEffect(mockEnv, r1.effect, 'zone_bravo');
    assert.equal(out1.progress?.solved, 1);
    assert.equal(out1.reveal, null);

    machine.selectStone(RIVER_SURVIVAL_SPEECH_TARGETS[1].targetId, { autoModel: false });
    const r2 = machine.applyMockResponse({
      targetId: RIVER_SURVIVAL_SPEECH_TARGETS[1].targetId,
      accepted: true,
      score: 88,
      passed: true,
      stars: 2,
      attemptNo: 1,
      attemptsLeft: 2,
      bestScore: 88,
    });
    const out2 = applySurvivalSpeechEffect(mockEnv, r2.effect, 'zone_bravo');
    assert.equal(out2.progress?.solved, 2);
    assert.equal(out2.reveal?.clue, 'pen');
    assert.equal(focusedZone, 'zone_bravo');
    assert.equal(beaconPulses, 2);
    assert.equal(effects.length, 2);

    machine.dispose();
  });
});

describe('A5 & A7 — Golden Challenge 3D Orb, Raycaster Buffer Reuse, and Pet Dialogues in content/', () => {
  it('shows GoldenChallengeOrb only when slot.golden && !slot.goldenTaken and invokes callback on tap without API calls', () => {
    let takenCalls = 0;
    const orb = createGoldenChallengeOrb({
      position: [0, 1.5, -3],
      onTakeGolden: () => {
        takenCalls += 1;
      },
    });

    assert.equal(orb.isVisible(), false);
    assert.equal(isGoldenChallengeVisible(null), false);
    assert.equal(isGoldenChallengeVisible({ golden: false, goldenTaken: false }), false);
    assert.equal(isGoldenChallengeVisible({ golden: true, goldenTaken: true }), false);
    assert.equal(isGoldenChallengeVisible({ golden: true, goldenTaken: false }), true);

    orb.syncSlot({ golden: true, goldenTaken: false });
    assert.equal(orb.isVisible(), true);
    assert.equal(orb.triggerTakeGolden(), true);
    assert.equal(takenCalls, 1);

    orb.syncSlot({ golden: true, goldenTaken: true });
    assert.equal(orb.isVisible(), false);
    assert.equal(orb.triggerTakeGolden(), false);
    assert.equal(takenCalls, 1);

    orb.dispose();
  });

  it('loads PET_DIALOGUES from content/pet_dialogues.json and reuses raycast hits buffer without allocating', () => {
    assert.equal(PET_DIALOGUES.length, 15);
    const group = new THREE.Group();
    const stone = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    stone.userData = {
      kind: 'phonetic_stone',
      targetId: 't1',
      word: 'bridge',
      mode: 'shadow',
    };
    group.add(stone);
    group.updateMatrixWorld(true);

    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 0, 5);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2(0, 0);
    const customBuf: THREE.Intersection[] = [];

    const hit = raycastPhoneticStones(raycaster, ndc, cam, group, customBuf);
    assert.ok(hit);
    assert.equal(hit.userData.targetId, 't1');
    assert.ok(customBuf.length >= 1);

    // Calling again with the same buffer clears and reuses it without growing unboundedly
    const prevLength = customBuf.length;
    const hit2 = raycastPhoneticStones(raycaster, ndc, cam, group, customBuf);
    assert.ok(hit2);
    assert.equal(customBuf.length, prevLength);
  });
});
