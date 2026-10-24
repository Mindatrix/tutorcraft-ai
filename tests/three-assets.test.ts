import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREE_ASSET_MANIFEST, THREE_DEFAULTS, assetOr, isUnfilled, missingThreeAssets } from '../src/config/threeAssets';

test('3D manifest: placeholders are detected, filled values pass through', () => {
  assert.equal(isUnfilled('[ĐIỀN TẠI ĐÂY: x]'), true);
  assert.equal(isUnfilled(null), true);
  assert.equal(isUnfilled('/assets/3d/hero.glb'), false);
  assert.equal(isUnfilled(0), false, '0 is a real value, not a placeholder');

  const missing = missingThreeAssets();
  assert.ok(missing.includes('characters.heroModelUrl'));
  assert.ok(missing.includes('graphicsSettings.bloomIntensity'));
  assert.ok(!missing.includes('blenderMcp.port'), 'verified port is pre-filled');

  assert.equal(assetOr(THREE_ASSET_MANIFEST.graphicsSettings.defaultCameraFov, THREE_DEFAULTS.defaultCameraFov), 50);
  assert.equal(assetOr(THREE_ASSET_MANIFEST.blenderMcp.port, 0), 9876);

  const filled = structuredClone(THREE_ASSET_MANIFEST);
  filled.characters.heroModelUrl = '/assets/3d/hero.glb';
  assert.ok(!missingThreeAssets(filled).includes('characters.heroModelUrl'));
});
