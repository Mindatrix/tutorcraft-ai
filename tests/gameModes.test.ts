import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BOSS_MODE,
  GAME_MODES,
  GAME_MODE_IDS,
  GameMode,
  isGameMode,
  modesForScenario,
  normalizeConfig,
  normalizeGameMode,
  resolveGameMode,
} from '../src/engine';

test('GameMode enum: the 6 official worlds, old modes removed', () => {
  assert.deepEqual(Object.keys(GameMode), ['KAYAK_RUSH_3D', 'MULTIVERSE_PORTAL_RPG', 'SUMMER_CAMP_QUESTS', 'RIVER_FISHING', 'RIVER_SURVIVAL', 'DINO_JOURNEY']);
  assert.equal(GAME_MODE_IDS.length, 6);
  const replaced = ['COSMIC_CARD_BATTLER', 'DINO_ISLAND_RUN_2D', 'AI_AGENT_WORLD_3D', 'cosmic_card', 'dino_island', 'ai_agent_world'];
  for (const old of ['WASTELAND', 'DUNGEON', 'MAGIC_TOWER', 'wasteland_survival', 'dungeon_labyrinth', 'magic_tower', ...replaced]) {
    assert.equal(isGameMode(old), false, old);
    assert.equal(old in GameMode, false, old);
  }
  for (const id of GAME_MODE_IDS) assert.equal(GameMode[GAME_MODES[id].key], id);
});

test('Kayak Rush is the Boat Race world; the other 5 run boss battles', () => {
  assert.deepEqual(modesForScenario('boat_race'), [GameMode.KAYAK_RUSH_3D]);
  assert.deepEqual(modesForScenario('homework'), [GameMode.MULTIVERSE_PORTAL_RPG, GameMode.SUMMER_CAMP_QUESTS, GameMode.RIVER_FISHING, GameMode.DINO_JOURNEY]);
  for (const s of ['in_class', 'coop_raid'] as const) {
    assert.deepEqual(modesForScenario(s), [GameMode.MULTIVERSE_PORTAL_RPG, GameMode.SUMMER_CAMP_QUESTS, GameMode.RIVER_FISHING, GameMode.RIVER_SURVIVAL, GameMode.DINO_JOURNEY]);
  }
  assert.equal(normalizeGameMode('river_fishing', 'boat_race'), GameMode.KAYAK_RUSH_3D);
  assert.equal(normalizeGameMode('kayak_rush', 'homework'), undefined, 'kayak needs the race engine');
  assert.equal(normalizeGameMode('river_survival', 'homework'), undefined, 'survival is a group game');
  assert.equal(normalizeGameMode('nope', 'homework'), undefined);
  assert.equal(normalizeGameMode('summer_camp', 'in_class'), GameMode.SUMMER_CAMP_QUESTS);
  // Battles saved with a replaced world fall back to the classic 2D canvas.
  assert.equal(normalizeGameMode('cosmic_card', 'in_class'), undefined);
  assert.equal(DEFAULT_BOSS_MODE, GameMode.MULTIVERSE_PORTAL_RPG);
});

test('normalizeConfig keeps a valid world and drops anything else (visual only)', () => {
  assert.equal(normalizeConfig({ scenario: 'homework', gameMode: 'river_fishing' }).gameMode, 'river_fishing');
  assert.equal(normalizeConfig({ scenario: 'coop_raid', gameMode: 'river_survival' }).gameMode, 'river_survival');
  assert.equal(normalizeConfig({ scenario: 'homework', gameMode: 'ai_agent_world' }).gameMode, undefined);
  assert.equal(normalizeConfig({ scenario: 'homework', gameMode: '<script>' }).gameMode, undefined);
  assert.equal(normalizeConfig({ scenario: 'boat_race' }).gameMode, 'kayak_rush');
  // Battles saved before game worlds keep the classic 2D canvas.
  assert.equal(resolveGameMode(normalizeConfig({ scenario: 'coop_raid' })), null);
  // A world never changes scoring: same scaling inputs with or without it.
  const a = normalizeConfig({ scenario: 'in_class', durationMinutes: 12, gameMode: 'summer_camp' });
  const b = normalizeConfig({ scenario: 'in_class', durationMinutes: 12 });
  assert.deepEqual({ ...a, gameMode: undefined }, b);
});

test('every world has Vietnamese copy, a HUD and either a screenshot or a pending flag', () => {
  for (const id of GAME_MODE_IDS) {
    const m = GAME_MODES[id];
    assert.ok(m.nameVi && m.blurb && m.hud.boss && m.hud.hero && m.promptHint, id);
    assert.ok(m.preview === null || m.preview.startsWith('/modes/'), id);
  }
  assert.equal(GAME_MODES.river_survival.name, 'River Survival: Escape & Pursuit');
});
