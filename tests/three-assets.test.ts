import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROCEDURAL, THREE_ASSET_MANIFEST, THREE_DEFAULTS, assetOr, assetUrl, isUnfilled, missingThreeAssets } from '../src/config/threeAssets';
import { existsSync, readdirSync } from 'node:fs';
import { ASSET_LIBRARY, assetBase, hdri, hdriSize, lib, libraryAsset, withQuality } from '../src/config/assetLibrary';
import { GAME_MODE_IDS } from '../src/engine/gameModes';

test('3D manifest: placeholders are detected, filled values pass through', () => {
  assert.equal(isUnfilled('[ĐIỀN TẠI ĐÂY: x]'), true);
  assert.equal(isUnfilled(null), true);
  assert.equal(isUnfilled('/assets/3d/hero.glb'), false);
  assert.equal(isUnfilled(0), false, '0 is a real value, not a placeholder');

  // A3.6: every slot is filled (real library model, list of ids, or a decided PROCEDURAL part).
  assert.deepEqual(missingThreeAssets(), []);
  assert.equal(assetOr(THREE_ASSET_MANIFEST.graphicsSettings.defaultCameraFov, THREE_DEFAULTS.defaultCameraFov), 50);
  assert.equal(assetOr(THREE_ASSET_MANIFEST.blenderMcp.port, 0), 9876);
  assert.equal(assetOr(THREE_ASSET_MANIFEST.graphicsSettings.fpsFallbackThreshold, 0), 30);
  assert.match(assetUrl(THREE_ASSET_MANIFEST.gameModes.kayak_rush.kayakModelUrl) ?? '', /\/web\/kayak\/kayak_boat\.glb$/);
  assert.equal(assetUrl(PROCEDURAL), null, 'code-built parts never trigger a download');

  const gap = structuredClone(THREE_ASSET_MANIFEST);
  gap.gameModes.kayak_rush.kayakModelUrl = '[ĐIỀN TẠI ĐÂY: x]';
  assert.deepEqual(missingThreeAssets(gap), ['gameModes.kayak_rush.kayakModelUrl']);
});

test('3D manifest covers exactly the 6 game worlds; the cancelled modes are gone', () => {
  assert.deepEqual(Object.keys(THREE_ASSET_MANIFEST.gameModes).sort(), [...GAME_MODE_IDS].sort());
  const missing = missingThreeAssets();
  assert.ok(!missing.some((m) => /wasteland|towerRpg|magic_tower|labyrinth|dungeon|racer|cosmic|dino_island|agent_world/i.test(m)));
  // Every world has a 2D fallback slot.
  for (const id of GAME_MODE_IDS) assert.ok('fallback2d' in THREE_ASSET_MANIFEST.gameModes[id], id);
});

test('A3.6: manifest points at real library models; packs are non-empty id lists', () => {
  const m = THREE_ASSET_MANIFEST;
  const lists: [string, string[]][] = [
    ['riverWorld.natureIds', m.riverWorld.natureIds],
    ['riverWorld.structureIds', m.riverWorld.structureIds],
    ['riverWorld.groundIds', m.riverWorld.groundIds],
    ['riverWorld.backdropIds', m.riverWorld.backdropIds],
    ['characters.riggedIds', m.characters.riggedIds],
    ['summer_camp.campIds', m.gameModes.summer_camp.campIds],
    ['summer_camp.foodIds', m.gameModes.summer_camp.foodIds],
    ['river_fishing.gearIds', m.gameModes.river_fishing.gearIds],
    ['river_fishing.fishIds', m.gameModes.river_fishing.fishIds],
    ['river_survival.survivalIds', m.gameModes.river_survival.survivalIds],
    ['river_survival.hideSpotIds', m.gameModes.river_survival.hideSpotIds],
    ['dino_journey.dinoIds', m.gameModes.dino_journey.dinoIds],
    ['dino_journey.critterIds', m.gameModes.dino_journey.critterIds],
    ['dino_journey.worldIds', m.gameModes.dino_journey.worldIds],
  ];
  for (const [name, list] of lists) {
    assert.ok(list.length > 0, `${name} is empty`);
    for (const id of list) assert.ok(libraryAsset(id), `${name}: ${id} not in the catalog`);
  }
  assert.equal(m.gameModes.dino_journey.dinoIds.length, 8, 'dino pack: 8 dinosaurs');
  assert.ok(m.gameModes.dino_journey.dinoIds.includes('dino_trex_brown'), 'the father T-Rex is in the pack');
  // Aliases resolve to a stand-in model while the right one is made.
  assert.match(lib('mv_world_castle'), /mv_castle_module\.glb$/, 'WP1 01/11: castle = the 4 castle modules');
  assert.match(lib('surv_holding_pen'), /surv_pen_wall_stone\.glb$/);
  assert.match(lib('does_not_exist'), /^\[ĐIỀN TẠI ĐÂY/);
  assert.equal(withQuality(lib('kayak_boat'), 'low').replace(/^.*\/low\//, ''), 'kayak/kayak_boat.glb');
  assert.ok(ASSET_LIBRARY.length >= 200);
});

test('HDRI skies: 2K comes from the asset base (out of git), each has a 1K twin in /public, no 2K file in /public', () => {
  const m = THREE_ASSET_MANIFEST;
  const skies = [...Object.values(m.riverWorld.hdriUrls), m.gameModes.kayak_rush.skyboxUrl, ...Object.values(m.gameModes.multiverse_portal.hdriSkyboxUrls)] as string[];
  assert.equal(skies.length, 9);
  for (const url of skies) {
    assert.ok(url.startsWith(`${assetBase()}/hdri/`) && /\/river_[a-z]+_2k\.hdr$/.test(url), url);
    const low = hdriSize(url, '1k');
    assert.match(low, /^\/assets\/hdri\/river_[a-z]+_1k\.hdr$/);
    assert.ok(existsSync(`public${low}`), `${low} missing`);
    assert.equal(hdriSize(low, '2k'), url, 'and back');
  }
  assert.equal(hdri('day', '1k'), '/assets/hdri/river_day_1k.hdr');
  assert.equal(hdriSize('/x/model.glb', '1k'), '/x/model.glb', 'other URLs pass through');
  assert.deepEqual(readdirSync('public/assets/hdri').filter((f) => /_2k\.hdr$/.test(f)), []);
});
