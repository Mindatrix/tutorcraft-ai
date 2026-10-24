import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREE_ASSET_MANIFEST, THREE_DEFAULTS, assetOr, assetUrl, isUnfilled, missingThreeAssets } from '../src/config/threeAssets';
import { GAME_MODE_IDS } from '../src/engine/gameModes';

test('3D manifest: placeholders are detected, filled values pass through', () => {
  assert.equal(isUnfilled('[ĐIỀN TẠI ĐÂY: x]'), true);
  assert.equal(isUnfilled(null), true);
  assert.equal(isUnfilled('/assets/3d/hero.glb'), false);
  assert.equal(isUnfilled(0), false, '0 is a real value, not a placeholder');

  const missing = missingThreeAssets();
  assert.ok(missing.includes('gameModes.multiverse_portal.heroModelUrl'));
  assert.ok(missing.includes('graphicsSettings.bloomIntensity'));
  assert.ok(!missing.includes('blenderMcp.port'), 'verified port is pre-filled');
  assert.ok(!missing.includes('graphicsSettings.fpsFallbackThreshold'), 'FPS fallback rule is decided');

  assert.equal(assetOr(THREE_ASSET_MANIFEST.graphicsSettings.defaultCameraFov, THREE_DEFAULTS.defaultCameraFov), 50);
  assert.equal(assetOr(THREE_ASSET_MANIFEST.blenderMcp.port, 0), 9876);
  assert.equal(assetOr(THREE_ASSET_MANIFEST.graphicsSettings.fpsFallbackThreshold, 0), 30);
  assert.equal(assetUrl(THREE_ASSET_MANIFEST.gameModes.kayak_rush.kayakModelUrl), null);

  const filled = structuredClone(THREE_ASSET_MANIFEST);
  filled.gameModes.kayak_rush.kayakModelUrl = '/assets/3d/kayak.glb';
  assert.ok(!missingThreeAssets(filled).includes('gameModes.kayak_rush.kayakModelUrl'));
  assert.equal(assetUrl(filled.gameModes.kayak_rush.kayakModelUrl), '/assets/3d/kayak.glb');
});

test('3D manifest covers exactly the 5 game worlds; the cancelled modes are gone', () => {
  assert.deepEqual(Object.keys(THREE_ASSET_MANIFEST.gameModes).sort(), [...GAME_MODE_IDS].sort());
  const missing = missingThreeAssets();
  assert.ok(!missing.some((m) => /survival|wasteland|towerRpg|magic_tower|labyrinth|dungeon|racer/i.test(m)));
  // Every world has a 2D fallback slot.
  for (const id of GAME_MODE_IDS) assert.ok('fallback2d' in THREE_ASSET_MANIFEST.gameModes[id], id);
});
