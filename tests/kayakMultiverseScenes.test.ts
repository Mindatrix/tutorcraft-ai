import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyKayakWaypointStoneResult,
  createInitialKayakBoostState,
  KAYAK_RUSH_TARGETS,
  KAYAK_RUSH_WAYPOINTS,
  kayakBoostMultiplierForStars,
  resolveKayakAssetUrls,
  resolveKayakPetDialogue,
  verifyKayakCatalogAssets,
} from '../src/components/modes/three/KayakRush/waypoints';
import {
  applyPortalPasscodeResult,
  CENTRAL_PORTAL_STONE_ID,
  computePortalOpeningConfig,
  createInitialPortalLockState,
  MULTIVERSE_PORTAL_TARGETS,
  resolveMultiverseAssetUrls,
  verifyMultiverseCatalogAssets,
} from '../src/components/modes/three/MultiversePortal/portalRules';
import { PhoneticStoneStateMachine } from '../src/client/phoneticStones';

test('KayakRush defines 4 floating river Phonetic Stone waypoints with shadow/dictate/repeat modes', () => {
  assert.equal(KAYAK_RUSH_WAYPOINTS.length, 4);
  assert.equal(KAYAK_RUSH_TARGETS.length, 4);

  for (let i = 0; i < KAYAK_RUSH_WAYPOINTS.length; i++) {
    const wp = KAYAK_RUSH_WAYPOINTS[i];
    const target = KAYAK_RUSH_TARGETS[i];
    assert.equal(wp.targetId, target.targetId);
    assert.equal(wp.word, target.text);
    assert.deepEqual(target.modes, ['shadow', 'dictate', 'repeat']);
  }
});

test('KayakRush speed boost multiplier scales with pronunciation stars and wires kayak pet_dialogues.json', () => {
  assert.equal(kayakBoostMultiplierForStars(0), 1.0);
  assert.equal(kayakBoostMultiplierForStars(1), 1.25);
  assert.equal(kayakBoostMultiplierForStars(2), 1.5);
  assert.equal(kayakBoostMultiplierForStars(3), 1.85);

  let state = createInitialKayakBoostState();
  assert.equal(state.currentSpeedKmh, 18);

  // Failed attempt triggers a "kayak" coach dialogue from pet_dialogues.json
  state = applyKayakWaypointStoneResult(
    state,
    {
      accepted: true,
      targetId: 'kayak_wp_1',
      score: 42,
      stars: 0,
      passed: false,
      almost: false,
      attemptNo: 1,
      attemptsLeft: 2,
      bestScore: 42,
    },
    () => 0,
  );
  assert.equal(state.clearedWaypointIds.length, 0);
  assert.ok(state.lastDialogue);
  assert.equal(state.lastDialogue.mode, 'kayak');
  assert.equal(state.lastDialogue.trigger, 'voice_fail_1');
  assert.ok(state.lastDialogue.text_vi.length > 0);

  // 3-star pass on waypoint 1 triggers 1.85x speed boost and combo_boost dialogue
  state = applyKayakWaypointStoneResult(
    state,
    {
      accepted: true,
      targetId: 'kayak_wp_1',
      score: 94,
      stars: 3,
      passed: true,
      almost: false,
      attemptNo: 2,
      attemptsLeft: 1,
      bestScore: 94,
    },
    () => 0,
  );
  assert.deepEqual(state.clearedWaypointIds, ['kayak_wp_1']);
  assert.equal(state.activeMultiplier, 1.85);
  assert.equal(state.currentSpeedKmh, 33.3);
  assert.equal(state.currentWaypointIndex, 1);
  assert.ok(state.lastDialogue);
  assert.equal(state.lastDialogue.mode, 'kayak');
  assert.equal(state.lastDialogue.trigger, 'combo_boost');

  const approachRapid = resolveKayakPetDialogue({
    petState: 'coach',
    trigger: 'rapid_rush_ahead',
    random: () => 0,
  });
  assert.ok(approachRapid);
  assert.equal(approachRapid.mode, 'kayak');
  assert.equal(approachRapid.trigger, 'rapid_rush_ahead');
});

test('KayakRush catalog assets resolve cleanly from asset_catalog.json', () => {
  const check = verifyKayakCatalogAssets();
  assert.equal(check.valid, true, `Missing kayak assets: ${check.missing.join(', ')}`);
  const urls = resolveKayakAssetUrls('high');
  assert.ok(urls.kayak_boat.endsWith('.glb'));
  assert.ok(urls.kayak_paddle.endsWith('.glb'));
});

test('MultiversePortal central Phonetic Stone pedestal unlocks the gate and configures opening particles', async () => {
  assert.equal(MULTIVERSE_PORTAL_TARGETS.length, 1);
  const central = MULTIVERSE_PORTAL_TARGETS[0];
  assert.equal(central.targetId, CENTRAL_PORTAL_STONE_ID);
  assert.equal(central.text, 'Open the magic gate');

  let lockState = createInitialPortalLockState();
  assert.equal(lockState.gateState, 'locked');

  // Machine non-blocking fallback (repeat mode) or voice shadow unlocks the gate
  const machine = new PhoneticStoneStateMachine({
    targets: MULTIVERSE_PORTAL_TARGETS,
    autoModelDelayMs: 0,
    speak: async () => {},
  });
  machine.selectStone(CENTRAL_PORTAL_STONE_ID, { autoModel: false });
  const res = await machine.submitRepeatAttempt();
  assert.ok(res);
  assert.equal(res.stars, 1);

  lockState = applyPortalPasscodeResult(lockState, res);
  assert.equal(lockState.gateState, 'open');
  assert.equal(lockState.unlockedStars, 1);
  assert.ok(lockState.openingConfig);
  assert.equal(lockState.openingConfig.burstParticleCount, 44);

  // Higher 3-star voice activation upgrades particle burst intensity
  const cfg3 = computePortalOpeningConfig(3);
  assert.equal(cfg3.burstParticleCount, 90);
  assert.equal(cfg3.vortexTargetScale, 1.15);
  machine.dispose();
});

test('MultiversePortal catalog assets resolve cleanly from asset_catalog.json', () => {
  const check = verifyMultiverseCatalogAssets();
  assert.equal(check.valid, true, `Missing multiverse assets: ${check.missing.join(', ')}`);
  const urls = resolveMultiverseAssetUrls('high');
  assert.ok(urls.mv_castle_module.endsWith('.glb'));
  assert.ok(urls.mv_torch.endsWith('.glb'));
});
