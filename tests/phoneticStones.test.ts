import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  findPhoneticStoneAncestor,
  raycastPhoneticStones,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  TapGestureTracker,
  type PhoneticStoneUserData,
} from '../src/components/modes/three/phoneticStoneRaycaster';
import {
  applyCampStoneResult,
  applyFishingDockStoneResult,
  CAMP_STATION_LAYOUT,
  castFishingRodWithMultiplier,
  createInitialCampQuestBoard,
  createInitialFishingDockState,
  fishingWeightMultiplier,
  MOCK_SPEECH_RESPONSES,
  MOCK_SPEECH_TARGETS,
  PhoneticStoneEventBus,
  PhoneticStoneStateMachine,
  RIVER_FISHING_TARGETS,
  SUMMER_CAMP_TARGETS,
  type PhoneticStoneState,
} from '../src/client/phoneticStones';

test('Phonetic Stones 3D: TapGestureTracker detects taps within 300ms and ≤ 8px movement', () => {
  const tracker = new TapGestureTracker();
  assert.equal(TAP_MAX_DURATION_MS, 300);
  assert.equal(TAP_MAX_MOVE_PX, 8);

  // Fast tap (180ms, 3px drift) -> true
  tracker.onPointerDown(100, 200, 1000, 1);
  tracker.onPointerMove(102, 202, 1);
  assert.equal(tracker.onPointerUp(103, 200, 1180, 1), true);

  // Exact boundary (300ms, 8px) -> true
  tracker.onPointerDown(50, 50, 2000, 2);
  assert.equal(tracker.onPointerUp(58, 50, 2300, 2), true);

  // Hold longer than 300ms (305ms) -> false
  tracker.onPointerDown(50, 50, 3000, 3);
  assert.equal(tracker.onPointerUp(50, 50, 3305, 3), false);

  // Camera drag (> 8px movement before pointerup) -> cancelled even if quick
  tracker.onPointerDown(100, 100, 4000, 4);
  tracker.onPointerMove(112, 100, 4); // 12px > 8px
  assert.equal(tracker.onPointerUp(100, 100, 4120, 4), false);
});

test('Phonetic Stones 3D: Raycaster targets interactiveGroup children with userData.kind === phonetic_stone', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const interactiveGroup = new THREE.Group();
  scene.add(interactiveGroup);

  // A stone group at the origin with child mesh
  const stoneGroup = new THREE.Group();
  const userData: PhoneticStoneUserData = {
    kind: 'phonetic_stone',
    targetId: 'q1w',
    ipa: '/θriː/',
    word: 'three',
    mode: 'shadow',
  };
  stoneGroup.userData = userData;
  const childMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  );
  stoneGroup.add(childMesh);
  interactiveGroup.add(stoneGroup);

  // A non-stone prop outside interactiveGroup at the same position (must be ignored)
  const decoy = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial(),
  );
  scene.add(decoy);

  scene.updateMatrixWorld(true);

  assert.equal(findPhoneticStoneAncestor(childMesh), stoneGroup);
  assert.equal(findPhoneticStoneAncestor(decoy), null);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(0, 0); // centre of screen

  const hit = raycastPhoneticStones(raycaster, ndc, camera, interactiveGroup);
  assert.ok(hit, 'Expected raycast to hit the phonetic stone at NDC (0,0)');
  assert.equal(hit.stone, stoneGroup);
  assert.equal(hit.userData.kind, 'phonetic_stone');
  assert.equal(hit.userData.targetId, 'q1w');
  assert.equal(hit.userData.word, 'three');

  // Raycast off to the corner where no stone sits -> null
  const miss = raycastPhoneticStones(raycaster, new THREE.Vector2(0.95, 0.95), camera, interactiveGroup);
  assert.equal(miss, null);
});

test('Phonetic Stones State Machine: idle -> selected -> modeling -> ready -> listening -> scoring -> passed -> idle', async () => {
  const bus = new PhoneticStoneEventBus();
  const transitions: Array<[PhoneticStoneState, PhoneticStoneState]> = [];
  const petStates: string[] = [];
  let modeledTargetId: string | null = null;
  let resultEvent: { passed: boolean; score: number; stars: number; attempt: number } | null = null;

  bus.on('state:change', ({ prev, next }) => {
    transitions.push([prev, next]);
  });
  bus.on('pet:state', ({ state }) => {
    petStates.push(state);
  });
  bus.on('stone:model', ({ targetId }) => {
    modeledTargetId = targetId;
  });
  bus.on('stone:result', ({ passed, score, stars, attempt }) => {
    resultEvent = { passed, score, stars, attempt };
  });

  let resolveTts: (() => void) | null = null;
  const machine = new PhoneticStoneStateMachine({
    bus,
    targets: MOCK_SPEECH_TARGETS,
    autoModelDelayMs: 0,
    speak: () =>
      new Promise<void>((resolve) => {
        resolveTts = resolve;
      }),
  });

  assert.equal(machine.getSnapshot().state, 'idle');

  // 1. Tap stone -> selected -> auto-advances to modeling
  machine.selectStone('q1w');
  assert.equal(modeledTargetId, 'q1w');
  assert.equal(machine.getSnapshot().state, 'modeling');
  assert.equal(machine.getSnapshot().petState, 'coach');

  // 2. Finish TTS -> ready
  assert.ok(resolveTts);
  (resolveTts as () => void)();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(machine.getSnapshot().state, 'ready');
  assert.equal(machine.getSnapshot().petState, 'idle');

  // 3. Tap mic -> listening
  const started = machine.startListening();
  assert.equal(started, true);
  assert.equal(machine.getSnapshot().state, 'listening');
  assert.equal(machine.getSnapshot().petState, 'listening');

  // 4. Interim & final speech -> scoring -> passed
  machine.pushInterim('thr');
  assert.ok((machine.getSnapshot().provisionalScore ?? 0) >= 0);

  const reply = await machine.submitVoiceAttempt({
    transcript: 'three',
    alternatives: [{ transcript: 'three', confidence: 0.96 }],
    confidence: 0.96,
    durationMs: 950,
  });

  assert.ok(reply);
  assert.equal(reply.passed, true);
  assert.equal(reply.stars, 3);
  assert.equal(machine.getSnapshot().state, 'passed');
  assert.equal(machine.getSnapshot().petState, 'celebrate');
  assert.ok(resultEvent);
  assert.equal((resultEvent as { stars: number }).stars, 3);

  // 5. Dismiss to idle (tap elsewhere / Escape)
  machine.dismissToIdle();
  assert.equal(machine.getSnapshot().state, 'idle');

  const sequence = transitions.map(([, next]) => next);
  assert.ok(sequence.includes('selected'));
  assert.ok(sequence.includes('modeling'));
  assert.ok(sequence.includes('ready'));
  assert.ok(sequence.includes('listening'));
  assert.ok(sequence.includes('scoring'));
  assert.ok(sequence.includes('passed'));
  assert.equal(sequence[sequence.length - 1], 'idle');
});

test('Phonetic Stones State Machine: too_short attempt is rejected without consuming an attempt, 2nd miss triggers mouth_shape Pet hint', async () => {
  const machine = new PhoneticStoneStateMachine({
    targets: MOCK_SPEECH_TARGETS,
    autoModelDelayMs: 0,
    speak: async () => {},
  });

  machine.selectStone('q2w');
  await new Promise((r) => setTimeout(r, 5));

  // Too short (< 400ms) -> rejected, attemptsLeft stays 3
  machine.startListening();
  const shortReply = await machine.submitVoiceAttempt({
    transcript: 'tent',
    confidence: 0.9,
    durationMs: 250,
  });
  assert.ok(shortReply);
  assert.equal(shortReply.accepted, false);
  assert.equal(shortReply.reason, 'too_short');
  assert.equal(machine.getSnapshot().progressByTarget['q2w'].attemptsLeft, 3);
  assert.equal(machine.getSnapshot().state, 'ready');

  // 1st miss -> retry, attemptsLeft = 2, no mouth_shape hint yet
  machine.startListening();
  const miss1 = await machine.submitVoiceAttempt({
    transcript: 'banana',
    confidence: 0.8,
    durationMs: 900,
  });
  assert.ok(miss1);
  assert.equal(miss1.passed, false);
  assert.equal(miss1.attemptNo, 1);
  assert.equal(miss1.attemptsLeft, 2);
  assert.equal(miss1.hint, undefined);
  assert.equal(machine.getSnapshot().state, 'retry');

  // 2nd miss -> retry, attemptsLeft = 1, hint === 'mouth_shape', Pet enters 'coach'
  await machine.prepareRetry();
  machine.startListening();
  const miss2 = await machine.submitVoiceAttempt({
    transcript: 'apple',
    confidence: 0.8,
    durationMs: 900,
  });
  assert.ok(miss2);
  assert.equal(miss2.passed, false);
  assert.equal(miss2.attemptNo, 2);
  assert.equal(miss2.attemptsLeft, 1);
  assert.equal(miss2.hint, 'mouth_shape');
  assert.equal(machine.getSnapshot().petState, 'coach');
  assert.equal(machine.getSnapshot().petHint, 'mouth_shape');

  // Applying AI Studio Mock JSON preset updates state & Pet cleanly
  const preset = machine.applyMockResponse({
    ...MOCK_SPEECH_RESPONSES.passThreeStars,
    targetId: 'q2w',
  });
  assert.equal(preset.passed, true);
  assert.equal(machine.getSnapshot().state, 'passed');
  assert.equal(machine.getSnapshot().petState, 'celebrate');
});

test('WP8 summer_camp: Phonetic Stones at camp stations update Quest Board progress, tent stars (1-3★), and flagpole unlock including non-blocking fallbacks', () => {
  assert.equal(SUMMER_CAMP_TARGETS.length, 5);
  assert.equal(CAMP_STATION_LAYOUT.length, 4);

  let board = createInitialCampQuestBoard();
  assert.equal(board.tentStars, 0);
  assert.equal(board.completedCount, 0);
  assert.equal(board.flagUnlocked, false);

  // 1. Tent station ('camp_tent_w1') passed with 3★ via voice shadow
  board = applyCampStoneResult(
    board,
    { ...MOCK_SPEECH_RESPONSES.passThreeStars, targetId: 'camp_tent_w1' },
    'shadow',
  );
  assert.equal(board.tentStars, 3);
  assert.equal(board.completedCount, 1);
  assert.equal(board.flagUnlocked, false);

  // 2. Kitchen/Grill station ('camp_kitchen_w1') passed with 2★ via typed dictation fallback
  board = applyCampStoneResult(
    board,
    { ...MOCK_SPEECH_RESPONSES.passTwoStars, targetId: 'camp_kitchen_w1' },
    'dictate',
  );
  assert.equal(board.tentStars, 5);
  assert.equal(board.completedCount, 2);

  // 3. Water station ('camp_water_w1') completed with 1★ via 'dictate' almost match
  board = applyCampStoneResult(
    board,
    { ...MOCK_SPEECH_RESPONSES.dictateAlmost, targetId: 'camp_water_w1' },
    'dictate',
  );
  assert.equal(board.tentStars, 6);
  assert.equal(board.completedCount, 3);
  assert.equal(board.flagUnlocked, false);

  // 4. Firewood / Quest Board station ('camp_firewood_w1') completed with 1★ via 'repeat' fallback -> unlocks Tent Flagpole!
  board = applyCampStoneResult(
    board,
    {
      accepted: true,
      targetId: 'camp_firewood_w1',
      score: 65,
      bestScore: 65,
      passed: false,
      stars: 1,
      attemptNo: 1,
      attemptsLeft: 2,
      weakWords: [],
      detail: { wordScore: 65, phonemeScore: 65, confScore: null },
    },
    'repeat',
  );
  assert.equal(board.completedCount, 4);
  assert.equal(board.tentStars, 7);
  assert.equal(board.flagUnlocked, true);
});

test('WP8 river_fishing: Dock Phonetic Stones unlock rod casting and apply exact fish catch weight multipliers (Pass x1.0, 2★ x1.1, 3★ x1.2)', () => {
  assert.equal(RIVER_FISHING_TARGETS.length, 4);
  assert.equal(fishingWeightMultiplier(0), 1.0);
  assert.equal(fishingWeightMultiplier(1), 1.0);
  assert.equal(fishingWeightMultiplier(2), 1.1);
  assert.equal(fishingWeightMultiplier(3), 1.2);

  let dock = createInitialFishingDockState();

  // Cannot cast before pronouncing/completing the dock stone
  const blockedCast = castFishingRodWithMultiplier(dock, 'fish_salmon_w1');
  assert.equal(blockedCast.catchRecord, null);
  assert.equal(blockedCast.nextDock.catches.length, 0);

  // 1. Complete 'fish_salmon_w1' (salmon, base 3.2kg) with 1★ repeat fallback -> multiplier x1.0 -> 3.2kg
  dock = applyFishingDockStoneResult(dock, {
    accepted: true,
    targetId: 'fish_salmon_w1',
    score: 65,
    bestScore: 65,
    passed: false,
    stars: 1,
    attemptNo: 1,
    attemptsLeft: 2,
    weakWords: [],
    detail: { wordScore: 65, phonemeScore: 65, confScore: null },
  });
  assert.equal(dock.unlockedByTarget['fish_salmon_w1'].ready, true);
  assert.equal(dock.unlockedByTarget['fish_salmon_w1'].multiplier, 1.0);
  const cast1 = castFishingRodWithMultiplier(dock, 'fish_salmon_w1');
  dock = cast1.nextDock;
  assert.equal(cast1.catchRecord?.finalWeightKg, 3.2);
  assert.equal(cast1.catchRecord?.multiplier, 1.0);

  // 2. Complete 'fish_catfish_w1' (catfish, base 2.4kg) with 2★ -> multiplier x1.1 -> 2.64kg
  dock = applyFishingDockStoneResult(dock, {
    ...MOCK_SPEECH_RESPONSES.passTwoStars,
    targetId: 'fish_catfish_w1',
  });
  assert.equal(dock.unlockedByTarget['fish_catfish_w1'].ready, true);
  assert.equal(dock.unlockedByTarget['fish_catfish_w1'].multiplier, 1.1);
  const cast2 = castFishingRodWithMultiplier(dock, 'fish_catfish_w1');
  dock = cast2.nextDock;
  assert.equal(cast2.catchRecord?.finalWeightKg, 2.64);
  assert.equal(cast2.catchRecord?.multiplier, 1.1);

  // 3. Complete 'fish_carp_w1' (golden carp, base 4.5kg) with 3★ -> multiplier x1.2 -> 5.4kg
  dock = applyFishingDockStoneResult(dock, {
    ...MOCK_SPEECH_RESPONSES.passThreeStars,
    targetId: 'fish_carp_w1',
  });
  assert.equal(dock.unlockedByTarget['fish_carp_w1'].ready, true);
  assert.equal(dock.unlockedByTarget['fish_carp_w1'].multiplier, 1.2);
  const cast3 = castFishingRodWithMultiplier(dock, 'fish_carp_w1');
  dock = cast3.nextDock;
  assert.equal(cast3.catchRecord?.finalWeightKg, 5.4);
  assert.equal(cast3.catchRecord?.multiplier, 1.2);
  assert.equal(dock.catches.length, 3);
});

