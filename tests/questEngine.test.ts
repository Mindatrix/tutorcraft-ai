import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  BASE_STONE_XP,
  calculateRequiredVocalizations,
  createQuestNodeMachineState,
  evaluateAudioThresholdFilter,
  FALLBACK_XP_MULTIPLIER,
  GAME_MODES,
  GameMode,
  initializeQuestExploration,
  QUEST_NODE_STAGES,
  recordQuestObjectInteraction,
  submitQuestPhoneticAttempt,
  submitQuestPuzzleDeduction,
  traverseStabilizedPortal,
  type MultiverseQuestsCatalog,
} from '../src/engine';
import { buildMultiversePortalEnvironment } from '../src/components/modes/three/MultiversePortal/MultiversePortalScene';
import { createSpatialPortalCollider } from '../src/components/modes/three/MultiversePortal/portalCollision';
import { createStonePositionalFormantRig } from '../src/components/modes/three/MultiversePortal/positionalFormants';
import type { LoadedBattle } from '../src/server/battles';
import { MemoryBroadcaster } from '../src/server/matchBroadcast';
import { createMatchService, MatchError, type StudentSession } from '../src/server/matchService';
import { MemoryMatchStore } from '../src/server/matchStore';

const catalog = JSON.parse(
  readFileSync(resolve(__dirname, '../../content/multiverse_quests.json'), 'utf8'),
) as MultiverseQuestsCatalog;

describe('Phase 1 & 2 — Multiverse Quest Catalog & 8-Stage Quest Node State Machine', () => {
  it('validates content/multiverse_quests.json for mv-01..mv-05 with Object Interaction Matrix, meaning_vi, IPA stress arrays, and Path A/B fallbacks', () => {
    assert.equal(catalog.routes.length, 5);
    const expectedIds = ['mv-01', 'mv-02', 'mv-03', 'mv-04', 'mv-05'];
    const expectedGrammarKeys = [
      'concession',
      'conditional',
      'past_perfect_vs_past_simple',
      'modal_certainty',
      'passive_process',
    ];

    catalog.routes.forEach((route, idx) => {
      assert.equal(route.id, expectedIds[idx]);
      assert.equal(route.grammar.key, expectedGrammarKeys[idx]);
      assert.equal(route.objects.length, 4);

      const anchors = route.objects.map((o) => o.anchor).sort();
      assert.deepEqual(anchors, ['altar', 'chest', 'portal_archway', 'stone_pedestal']);

      assert.ok(route.puzzle.prompt.length > 5);
      assert.equal(route.puzzle.options.length, 4);
      assert.ok(route.stones.length >= 2);

      for (const stone of route.stones) {
        assert.ok(stone.meaning_vi.length > 5, `${stone.targetId} meaning_vi`);
        assert.ok(stone.ipa.startsWith('/'), `${stone.targetId} ipa`);
        assert.ok(stone.stress.length >= 4, `${stone.targetId} stress syllables`);
        assert.ok(
          stone.stress.some((s) => s.stress === 'primary'),
          `${stone.targetId} primary stress`,
        );
        assert.ok(stone.fallback.dictation.answer.length > 5);
        assert.ok(stone.fallback.tiles.tiles.length >= 3);
        assert.equal(
          stone.fallback.tiles.tiles.length,
          stone.fallback.tiles.solution.length,
        );
      }
    });
  });

  it('transitions through all 8 stages (UNINITIALIZED -> EXPLORATION -> INVESTIGATION -> PUZZLE_DEDUCTION -> PHONETIC_CHALLENGE -> PORTAL_CHARGING -> PORTAL_STABILIZED -> WARP_TRANSITION) without resetting WebGL context', () => {
    const route1 = catalog.routes[0];
    const route2 = catalog.routes[1];
    let state = createQuestNodeMachineState({
      matchId: 'match-8stage',
      routeId: 'mv-01',
      squadSize: 2,
      webglContextId: 'webgl-canvas-singleton',
      stones: route1.stones,
    });
    assert.equal(state.stage, 'UNINITIALIZED');

    // 1. UNINITIALIZED -> EXPLORATION
    state = initializeQuestExploration(state, route1);
    assert.equal(state.stage, 'EXPLORATION');

    // 2. EXPLORATION -> INVESTIGATION (interact with papyrus chest)
    state = recordQuestObjectInteraction(state, route1.objects[0].objectId, 'chest');
    assert.equal(state.stage, 'INVESTIGATION');

    // 3. INVESTIGATION -> PUZZLE_DEDUCTION (inspect marble ruin altar)
    state = recordQuestObjectInteraction(state, route1.objects[1].objectId, 'altar');
    assert.equal(state.stage, 'PUZZLE_DEDUCTION');

    // 4. PUZZLE_DEDUCTION -> PHONETIC_CHALLENGE
    const puzzleRes = submitQuestPuzzleDeduction(
      state,
      route1.puzzle,
      route1.puzzle.correctIdx,
    );
    assert.equal(puzzleRes.correct, true);
    state = puzzleRes.state;
    assert.equal(state.stage, 'PHONETIC_CHALLENGE');

    // 5. PHONETIC_CHALLENGE -> PORTAL_CHARGING -> PORTAL_STABILIZED
    // Squad size = 2 => Rv = Math.ceil(2 * 0.60) = 2 vocalizations needed
    assert.equal(state.quorum.requiredVocalizations, 2);

    const p1 = submitQuestPhoneticAttempt(state, {
      studentId: 'student-1',
      stone: route1.stones[0],
      passed: true,
      score: 92,
      timestampMs: 1000,
    });
    state = p1.state;
    assert.equal(state.stage, 'PORTAL_CHARGING');
    assert.equal(state.quorum.completedCount, 1);
    assert.equal(state.quorum.stabilized, false);

    const p2 = submitQuestPhoneticAttempt(state, {
      studentId: 'student-2',
      stone: route1.stones[0],
      passed: true,
      score: 88,
      timestampMs: 1200,
    });
    state = p2.state;
    assert.equal(state.stage, 'PORTAL_STABILIZED');
    assert.equal(state.quorum.completedCount, 2);
    assert.equal(state.quorum.stabilized, true);

    // 6. PORTAL_STABILIZED -> WARP_TRANSITION (and seamless load of mv-02 on the same WebGL context)
    const warpedOnly = traverseStabilizedPortal(state);
    assert.equal(warpedOnly.stage, 'WARP_TRANSITION');
    assert.deepEqual(warpedOnly.history, [...QUEST_NODE_STAGES]);
    assert.equal(warpedOnly.webglContextId, 'webgl-canvas-singleton');
    assert.equal(warpedOnly.webglContextResetCount, 0);

    const intoRoute2 = traverseStabilizedPortal(state, route2);
    assert.equal(intoRoute2.routeId, 'mv-02');
    assert.equal(intoRoute2.stage, 'EXPLORATION');
    assert.equal(intoRoute2.webglContextId, 'webgl-canvas-singleton');
    assert.equal(intoRoute2.webglContextResetCount, 0);
  });
});

describe('Phase 3 & 4 — QA Automated Test Suite (QA-P01, QA-P02, QA-P03, QA-P04)', () => {
  it('QA-P01: Background noise / audio threshold filter rejects ambient noise without penalizing attempts', () => {
    const lowRms = evaluateAudioThresholdFilter({
      rms: 0.012,
      durationMs: 600,
      dominantFreqHz: 220,
      snrDb: 12,
    });
    assert.equal(lowRms.passedGate, false);
    assert.equal(lowRms.reason, 'rms_below_threshold');

    const shortClick = evaluateAudioThresholdFilter({
      rms: 0.18,
      durationMs: 110,
      dominantFreqHz: 240,
      snrDb: 15,
    });
    assert.equal(shortClick.passedGate, false);
    assert.equal(shortClick.reason, 'duration_too_short');

    const outOfBand = evaluateAudioThresholdFilter({
      rms: 0.15,
      durationMs: 500,
      dominantFreqHz: 5200,
      snrDb: 14,
    });
    assert.equal(outOfBand.passedGate, false);
    assert.equal(outOfBand.reason, 'out_of_voice_band');

    const cleanVoice = evaluateAudioThresholdFilter({
      rms: 0.16,
      durationMs: 640,
      dominantFreqHz: 210,
      snrDb: 14,
    });
    assert.equal(cleanVoice.passedGate, true);

    // Verify Quest State Machine ignores filtered noise without incrementing failedSpeechAttempts
    const route = catalog.routes[0];
    const stone = route.stones[0];
    let state = initializeQuestExploration(
      createQuestNodeMachineState({ routeId: 'mv-01', stones: route.stones }),
      route,
    );

    const noisyAttempt = submitQuestPhoneticAttempt(state, {
      studentId: 'student-1',
      stone,
      passed: false,
      score: 10,
      audioSample: { rms: 0.008, durationMs: 400 },
    });
    assert.equal(noisyAttempt.noiseFiltered, true);
    assert.equal(noisyAttempt.accepted, false);
    assert.equal(
      noisyAttempt.state.fallbackByStone[stone.targetId].failedSpeechAttempts,
      0,
    );
    state = noisyAttempt.state;
  });

  it('QA-P02: Mic permission denied -> instant fallback transition + 3-attempt non-blocking fallback at 80% base XP', () => {
    const route = catalog.routes[0];
    const stone = route.stones[0];
    let state = initializeQuestExploration(
      createQuestNodeMachineState({ routeId: 'mv-01', stones: route.stones }),
      route,
    );

    // 1. Instant fallback when mic permission is denied
    const denied = submitQuestPhoneticAttempt(state, {
      studentId: 'student-mic-denied',
      stone,
      passed: false,
      score: 0,
      micDenied: true,
    });
    assert.equal(denied.fallbackActivated, true);
    assert.equal(denied.state.fallbackByStone[stone.targetId].micPermissionDenied, true);
    assert.equal(denied.state.fallbackByStone[stone.targetId].fallbackActive, true);

    // Complete via Path A (Typed Dictation) -> unlocks stone at 80% base XP (80 XP)
    const solvedDictation = submitQuestPhoneticAttempt(denied.state, {
      studentId: 'student-mic-denied',
      stone,
      passed: true,
      score: 100,
      fallbackSubmission: {
        path: 'PATH_A_DICTATION',
        typedText: stone.fallback.dictation.answer,
      },
    });
    assert.equal(solvedDictation.stoneUnlocked, true);
    assert.equal(solvedDictation.awardedXp, Math.round(BASE_STONE_XP * FALLBACK_XP_MULTIPLIER));
    assert.equal(solvedDictation.awardedXp, 80);

    // 2. 3 failed speech evaluation attempts -> automatic fallback -> Path B (Syntactic Tile Sort) at 80% base XP
    const stone2 = route.stones[1];
    for (let i = 1; i <= 3; i++) {
      const miss = submitQuestPhoneticAttempt(state, {
        studentId: 'student-3miss',
        stone: stone2,
        passed: false,
        score: 35,
      });
      state = miss.state;
      assert.equal(state.fallbackByStone[stone2.targetId].failedSpeechAttempts, i);
      assert.equal(miss.fallbackActivated, i === 3);
    }

    const solvedTiles = submitQuestPhoneticAttempt(state, {
      studentId: 'student-3miss',
      stone: stone2,
      passed: true,
      score: 100,
      fallbackSubmission: {
        path: 'PATH_B_TILE_SORT',
        orderedTiles: stone2.fallback.tiles.solution,
      },
    });
    assert.equal(solvedTiles.stoneUnlocked, true);
    assert.equal(solvedTiles.awardedXp, 80);
  });

  it('QA-P03: 45 concurrent student vocalizations / quorum aggregation (Rv = Math.ceil(45 * 0.60) = 27) across engine and matchService', async () => {
    const N = 45;
    const expectedRv = Math.ceil(N * 0.60);
    assert.equal(expectedRv, 27);
    assert.equal(calculateRequiredVocalizations(N), 27);

    // Set up authoritative MatchService with 45 joined students in MULTIVERSE_PORTAL_RPG
    let clock = 20_000_000;
    const store = new MemoryMatchStore();
    const radio = new MemoryBroadcaster();
    const sessions = new Map<string, StudentSession>();
    const battle = {
      id: 'b-mv',
      code: 'MV2026',
      tutorId: 'tutor-1',
      config: {
        scenario: GAME_MODES[GameMode.MULTIVERSE_PORTAL_RPG].scenarios[0],
        gameMode: GameMode.MULTIVERSE_PORTAL_RPG,
        scenarioKey: 'mv-01',
        level: 3,
      },
    } as unknown as LoadedBattle;

    const svc = createMatchService({
      store,
      broadcaster: radio,
      now: () => clock,
      loadBattle: async (id) => (id === 'b-mv' ? battle : null),
      session: async (token) => {
        const s = sessions.get(String(token));
        if (!s) throw new MatchError(401, 'invalid token');
        return s;
      },
      scenario: async () => ({ tags: [], species: [] }),
    });

    const created = await svc.create('tutor-1', 'b-mv');
    const matchId = created.view.id;

    const playerIds: string[] = [];
    for (let i = 1; i <= N; i++) {
      const tok = `tok-mv-${i}`;
      sessions.set(tok, {
        id: `sess-mv-${i}`,
        battleId: 'b-mv',
        studentKey: `stu-${i}`,
        nickname: `Explorer ${i}`,
        avatar: '🚀',
      });
      const joined = await svc.join(tok);
      playerIds.push(joined.me.id);
    }

    await svc.control('tutor-1', matchId, 'start');

    // Submit 26 vocalizations first -> quorum not yet stabilized (26 / 27)
    let latestQuorum = null;
    for (let i = 0; i < 26; i++) {
      clock += 20;
      latestQuorum = await svc.recordPortalResonance({
        matchId,
        studentId: playerIds[i],
        routeId: 'mv-01',
        targetId: 'mv01_stone_although',
        mode: 'shadow',
        score: 85 + (i % 15),
        passed: true,
      });
    }
    assert.ok(latestQuorum);
    assert.equal(latestQuorum.squadSize, 45);
    assert.equal(latestQuorum.requiredVocalizations, 27);
    assert.equal(latestQuorum.completedCount, 26);
    assert.equal(latestQuorum.stabilized, false);

    // 27th distinct student vocalizes -> quorum reaches 27/27 (60%) and stabilizes the portal!
    clock += 20;
    const stabilizedQuorum = await svc.recordPortalResonance({
      matchId,
      studentId: playerIds[26],
      routeId: 'mv-01',
      targetId: 'mv01_stone_although',
      mode: 'shadow',
      score: 94,
      passed: true,
    });
    assert.ok(stabilizedQuorum);
    assert.equal(stabilizedQuorum.completedCount, 27);
    assert.equal(stabilizedQuorum.resonanceProgress, 1);
    assert.equal(stabilizedQuorum.stabilized, true);

    const resonanceBroadcasts = radio.messages(matchId).filter((m) => m.t === 'portal_resonance');
    assert.equal(resonanceBroadcasts.length, 27);
  });

  it('QA-P04: Portal plane diagonal step-through collision at 45° triggers WARP_TRANSITION without resetting WebGL context, plus Web Audio 3D Formants', () => {
    // 1. Verify Web Audio API 3D Positional Formants at Phonetic Stone coordinates
    let createdOscillators = 0;
    let createdBiquadFilters = 0;
    let createdPanners = 0;

    const mockAudioContext = {
      currentTime: 0,
      destination: {},
      createOscillator() {
        createdOscillators += 1;
        return {
          type: 'sawtooth',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        };
      },
      createBiquadFilter() {
        createdBiquadFilters += 1;
        return {
          type: 'bandpass',
          frequency: { setValueAtTime() {} },
          Q: { setValueAtTime() {} },
          connect() {},
        };
      },
      createPanner() {
        createdPanners += 1;
        return {
          panningModel: 'HRTF',
          distanceModel: 'inverse',
          refDistance: 2.5,
          maxDistance: 24,
          positionX: { setValueAtTime() {} },
          positionY: { setValueAtTime() {} },
          positionZ: { setValueAtTime() {} },
          connect() {},
        };
      },
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      },
    } as unknown as BaseAudioContext;

    const formantRig = createStonePositionalFormantRig({
      stonePosition: [0, 1.62, 2.2],
      ipa: '/ɔːlˈðəʊ/',
      audioContext: mockAudioContext,
    });
    const pulse = formantRig.triggerFormantResonance({ stars: 3, durationMs: 360 });
    assert.equal(pulse.active, true);
    assert.equal(pulse.preset, 'open_o');
    assert.equal(pulse.filterBandCount, 3);
    assert.equal(createdOscillators, 1);
    assert.equal(createdBiquadFilters, 3);
    assert.equal(createdPanners, 1);
    formantRig.dispose();

    // 2. QA-P04: Diagonal step-through at 45° across the Render Target Portal plane (z = -2.0)
    // Moving from (-1.0, 0, -1.0) to (1.0, 0, -3.0): dx = +2.0, dz = -2.0 => exact 45° angle!
    const collider = createSpatialPortalCollider({
      center: [0, 2.2, -2.0],
      width: 3.6,
      height: 4.4,
      thickness: 0.65,
    });

    const lockedStep = collider.detectStepThrough([-1.0, 0, -1.0], [1.0, 0, -3.0], false);
    assert.equal(lockedStep.collided, true);
    assert.equal(lockedStep.crossedPlane, true);
    assert.equal(lockedStep.approachAngleDeg, 45);
    assert.equal(lockedStep.triggeredWarp, false, 'does not warp while portal is unstabilized');

    // Now test on the full MultiversePortalSceneHandle: unlock/stabilize portal and traverse at 45°
    const sceneHandle = buildMultiversePortalEnvironment(() => true, {
      sceneId: 'mv-01',
      tier: 'high',
      loadGlb: false,
    });
    const rootUuidBefore = sceneHandle.root.uuid;
    assert.equal(sceneHandle.getSceneId(), 'mv-01');

    sceneHandle.triggerPortalOpening(3);
    assert.equal(sceneHandle.getVortexState(), 'PORTAL_STABILIZED');

    const stepResult = sceneHandle.checkPortalStepThrough(
      [-1.0, 0, -1.0],
      [1.0, 0, -3.0],
      true,
    );
    assert.equal(stepResult.collided, true);
    assert.equal(stepResult.crossedPlane, true);
    assert.equal(stepResult.approachAngleDeg, 45);
    assert.equal(stepResult.triggeredWarp, true);
    assert.deepEqual(stepResult.intersectionPoint, [0, 0, -2]);

    // Scene seamlessly transitioned from mv-01 to mv-02 on the exact same root/WebGL context
    assert.equal(sceneHandle.getSceneId(), 'mv-02');
    assert.equal(sceneHandle.root.uuid, rootUuidBefore);

    sceneHandle.dispose();
  });
});
