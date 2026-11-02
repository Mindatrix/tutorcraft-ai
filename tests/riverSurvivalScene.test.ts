import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePenSlotPositions,
  findZoneAtPosition,
  RIVER_SURVIVAL_CATALOG_ASSETS,
  RIVER_SURVIVAL_ZONES,
  resolveSurvivalAssetUrls,
  verifySurvivalCatalogAssets,
} from '../src/components/modes/three/RiverSurvival/zones';
import { isUnfilled } from '../src/config/threeAssets';

test('River Survival 3D Scene: defines 3 distinct non-overlapping zones with Wooden Pen & Tag Net stations', () => {
  assert.equal(RIVER_SURVIVAL_ZONES.length, 3);
  const ids = RIVER_SURVIVAL_ZONES.map((z) => z.id);
  assert.deepEqual(ids, ['zone_alpha', 'zone_bravo', 'zone_charlie']);

  for (const z of RIVER_SURVIVAL_ZONES) {
    assert.ok(z.radius >= 10, `Zone ${z.id} has valid radius`);
    assert.equal(z.center.length, 3);
    assert.equal(z.penPosition.length, 3);
    assert.equal(z.netStationPosition.length, 3);
    assert.ok(z.placements.length >= 8, `Zone ${z.id} has trees, ground, fences, and hide spots`);

    const categories = new Set(z.placements.map((p) => p.category));
    assert.ok(categories.has('ground'), `Zone ${z.id} includes ground assets`);
    assert.ok(categories.has('tree'), `Zone ${z.id} includes tree assets`);
    assert.ok(categories.has('hide_spot'), `Zone ${z.id} includes hide_spot assets`);
    assert.ok(categories.has('fence'), `Zone ${z.id} includes fence assets`);
  }

  // Verify zone lookup maps coordinates to each of the 3 distinct zones
  assert.equal(findZoneAtPosition(-24, -14).id, 'zone_alpha');
  assert.equal(findZoneAtPosition(1, -1).id, 'zone_bravo');
  assert.equal(findZoneAtPosition(24, 14).id, 'zone_charlie');
});

test('River Survival 3D Scene: all catalog assets (trees, ground, fences, Wooden Pen walls, Tag Net) resolve cleanly', () => {
  const check = verifySurvivalCatalogAssets();
  assert.equal(
    check.valid,
    true,
    `Missing catalog assets: ${check.missing.join(', ')}`,
  );

  const highUrls = resolveSurvivalAssetUrls('high');
  const lowUrls = resolveSurvivalAssetUrls('low');

  for (const [id, url] of Object.entries(highUrls)) {
    assert.equal(isUnfilled(url), false, `Asset ${id} high URL should be filled: ${url}`);
    assert.ok(url.endsWith('.glb'), `Asset ${id} high URL should point to .glb: ${url}`);
    assert.ok(url.includes('/web/'), `Asset ${id} high URL should use /web/ tier: ${url}`);
  }

  for (const [id, url] of Object.entries(lowUrls)) {
    assert.equal(isUnfilled(url), false, `Asset ${id} low URL should be filled: ${url}`);
    assert.ok(url.endsWith('.glb'), `Asset ${id} low URL should point to .glb: ${url}`);
    assert.ok(url.includes('/low/'), `Asset ${id} low URL should use /low/ tier: ${url}`);
  }

  // Ensure every placement in all 3 zones is also a valid catalog asset
  for (const zone of RIVER_SURVIVAL_ZONES) {
    for (const p of zone.placements) {
      assert.ok(
        highUrls[p.id],
        `Placement ${p.id} in ${zone.id} must be registered in RIVER_SURVIVAL_CATALOG_ASSETS`,
      );
    }
  }
});

test('River Survival 3D Scene: Wooden Pen (Chuồng Gỗ) computes deterministic holding slots around cipher table', () => {
  const penCenter: [number, number, number] = [0, 0, -5.5];
  const slots = computePenSlotPositions(penCenter, 8, 2.0);
  assert.equal(slots.length, 8);

  // First slot is at angle 0 -> (+2.0, 0, -5.5)
  assert.deepEqual(slots[0], [2, 0, -5.5]);
  // Opposite slot (index 4) is at angle pi -> (-2.0, 0, -5.5)
  assert.deepEqual(slots[4], [-2, 0, -5.5]);

  assert.ok(RIVER_SURVIVAL_CATALOG_ASSETS.penWallIds.includes('surv_holding_pen'));
  assert.ok(RIVER_SURVIVAL_CATALOG_ASSETS.penWallIds.includes('surv_pen_wall_window'));
  assert.ok(RIVER_SURVIVAL_CATALOG_ASSETS.netIds.includes('surv_capture_net'));
  assert.ok(RIVER_SURVIVAL_CATALOG_ASSETS.netIds.includes('surv_net_launcher_a'));
});
