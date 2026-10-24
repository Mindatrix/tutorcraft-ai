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

test('GameMode enum: the 5 official worlds, old modes removed', () => {
  assert.deepEqual(Object.keys(GameMode), ['KAYAK_RUSH_3D', 'MULTIVERSE_PORTAL_RPG', 'COSMIC_CARD_BATTLER', 'DINO_ISLAND_RUN_2D', 'AI_AGENT_WORLD_3D']);
  assert.equal(GAME_MODE_IDS.length, 5);
  for (const old of ['WASTELAND', 'DUNGEON', 'MAGIC_TOWER', 'wasteland_survival', 'dungeon_labyrinth', 'magic_tower']) {
    assert.equal(isGameMode(old), false, old);
    assert.equal(old in GameMode, false, old);
  }
  for (const id of GAME_MODE_IDS) assert.equal(GameMode[GAME_MODES[id].key], id);
});

test('Kayak Rush is the Boat Race world; the other 4 run boss battles', () => {
  assert.deepEqual(modesForScenario('boat_race'), [GameMode.KAYAK_RUSH_3D]);
  for (const s of ['homework', 'in_class', 'coop_raid'] as const) {
    assert.deepEqual(modesForScenario(s), [GameMode.MULTIVERSE_PORTAL_RPG, GameMode.COSMIC_CARD_BATTLER, GameMode.DINO_ISLAND_RUN_2D, GameMode.AI_AGENT_WORLD_3D]);
  }
  assert.equal(normalizeGameMode('dino_island', 'boat_race'), GameMode.KAYAK_RUSH_3D);
  assert.equal(normalizeGameMode('kayak_rush', 'homework'), undefined, 'kayak needs the race engine');
  assert.equal(normalizeGameMode('nope', 'homework'), undefined);
  assert.equal(normalizeGameMode('cosmic_card', 'in_class'), GameMode.COSMIC_CARD_BATTLER);
  assert.equal(DEFAULT_BOSS_MODE, GameMode.MULTIVERSE_PORTAL_RPG);
});

test('normalizeConfig keeps a valid world and drops anything else (visual only)', () => {
  assert.equal(normalizeConfig({ scenario: 'homework', gameMode: 'ai_agent_world' }).gameMode, 'ai_agent_world');
  assert.equal(normalizeConfig({ scenario: 'homework', gameMode: '<script>' }).gameMode, undefined);
  assert.equal(normalizeConfig({ scenario: 'boat_race' }).gameMode, 'kayak_rush');
  // Battles saved before game worlds keep the classic 2D canvas.
  assert.equal(resolveGameMode(normalizeConfig({ scenario: 'coop_raid' })), null);
  // A world never changes scoring: same scaling inputs with or without it.
  const a = normalizeConfig({ scenario: 'in_class', durationMinutes: 12, gameMode: 'dino_island' });
  const b = normalizeConfig({ scenario: 'in_class', durationMinutes: 12 });
  assert.deepEqual({ ...a, gameMode: undefined }, b);
});
