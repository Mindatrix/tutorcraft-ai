import type { SpeechGameEffect } from '../../../../engine/speechGameEffects';
import type { RiverSurvivalEnvironment } from './RiverSurvivalScene';
import { RIVER_SURVIVAL_ZONES, type SurvivalZoneId } from './zones';

// WP8 wiring (03/11/2026, Claude Code): plays the SERVER's pronunciation effect in the River Survival
// scene. The effect comes from POST /api/session/speech (`reply.effect`); nothing here decides progress.
//
//   decoder_clue  every solved clearing stone pulses the cipher beacon in the Wooden Pen; when the
//                 server unlocks a clue, the camera goes to the zone and the clue's spot is returned
//                 for the HUD (pen = the zone's Wooden Pen, net = the zone's Tag Net station).
//   other kinds   (kayak_nitro, portal_open) belong to other worlds: ignored here.
//
// Gate stone taps with `survivalStonesOpen()` (src/engine) so a stone never opens during the timed
// dodge (6 s) or snatch (8 s) window.

export interface SurvivalClueReveal {
  clue: 'pen' | 'net';
  zoneId: SurvivalZoneId;
  /** World position of the revealed spot, for a HUD marker or a minimap ping. */
  position: [number, number, number];
}

export interface SurvivalSpeechOutcome {
  /** Clue unlocked by this attempt (null when the attempt only advanced progress). */
  reveal: SurvivalClueReveal | null;
  /** Stones solved / stones needed for the next clue (null = all clues unlocked). */
  progress: { solved: number; nextAt: number | null } | null;
}

type SceneHooks = Pick<RiverSurvivalEnvironment, 'woodenPens' | 'focusZone'>;

export function applySurvivalSpeechEffect(env: SceneHooks, effect: SpeechGameEffect | null | undefined, zoneId: SurvivalZoneId): SurvivalSpeechOutcome {
  if (!effect || effect.kind !== 'decoder_clue') return { reveal: null, progress: null };
  env.woodenPens[zoneId]?.pulseCipherClue();
  const progress = { solved: effect.solved, nextAt: effect.nextAt };
  if (!effect.newlyUnlocked) return { reveal: null, progress };
  const zone = RIVER_SURVIVAL_ZONES.find((z) => z.id === zoneId) ?? RIVER_SURVIVAL_ZONES[0];
  env.focusZone(zone.id);
  const position = effect.newlyUnlocked === 'pen' ? zone.penPosition : zone.netStationPosition;
  return { reveal: { clue: effect.newlyUnlocked, zoneId: zone.id, position: [...position] as [number, number, number] }, progress };
}
