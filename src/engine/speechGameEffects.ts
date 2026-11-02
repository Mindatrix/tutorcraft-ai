import { KAYAK_RAGE, type RageConfig, type RageState } from './kayakRage';

// WP8 (03/11/2026): what a successful pronunciation attempt does INSIDE each game world. Decided on the
// server and returned with the attempt's reply (`effect`), so a browser cannot invent a nitro charge,
// a clue or a portal. The 3D scenes (Antigravity) only play what the server sent.
//
//   kayak_rush         Phonetic Stones float on buoy gates; a better star level adds Nitro (rage) charge.
//   river_survival     Clearing stones for the "Thợ giải mã" (Decoder): distinct words passed unlock the
//                      clues to the Wooden Pen (Chuồng Gỗ), then to the Tag Net. Voice never touches the
//                      timed "Né lưới" (6 s) / "Cướp lưới" (8 s) questions: those stay answer-only.
//   multiverse_portal  Altar stones at portal thresholds; a first pass on a stone opens the portal
//                      (visual transition along the rail) and Lumi celebrates. The story stage itself
//                      stays on the server schedule.
//   summer_camp / river_fishing  Rules already in src/client/phoneticWorldRules.ts (Quest Board,
//                      catch weight ×1.0 / ×1.1 / ×1.2); no extra server effect yet.
//
// Typed dictation and listen-and-repeat earn the same game progress as speaking (voice is optional,
// never blocking): repeat counts as a 1-star success here. A flagged attempt earns no effect.

/** The Pet / Lumi companion. Never sad or punishing. */
export type PetState = 'idle' | 'listening' | 'celebrate' | 'coach';

export const SPEECH_GAME_HOOKS = {
  /** Kayak: Nitro charge seconds for the BEST star level reached on a stone (index = stars). */
  kayakNitroSecByStars: [0, 4, 6, 8] as const,
  /** River Survival: distinct stones passed to unlock each clue, in order. */
  decoderClues: [
    { clue: 'pen', after: 2 },
    { clue: 'net', after: 4 },
  ] as const,
  /** Raycast budget per scene (blueprint §3.5). */
  maxStonesPerScene: 12,
} as const;

export type DecoderClue = (typeof SPEECH_GAME_HOOKS.decoderClues)[number]['clue'];

export type SpeechGameEffect =
  | { kind: 'kayak_nitro'; chargeSec: number; pet: PetState }
  | { kind: 'decoder_clue'; solved: number; nextAt: number | null; unlocked: DecoderClue[]; newlyUnlocked: DecoderClue | null; pet: PetState }
  | { kind: 'portal_open'; pet: PetState };

export interface SpeechEffectInput {
  /** The battle's game world (`config.gameMode`); null = classic 2D. */
  game: string | null | undefined;
  /** This attempt counts as a success for game progress (passed, or listen-and-repeat done). */
  success: boolean;
  /** Best stars on this target before this attempt, and after it. */
  prevBestStars: number;
  bestStars: number;
  /** This target had already been completed before this attempt. */
  alreadyDone: boolean;
  /** Distinct targets completed in this session BEFORE this attempt (River Survival clues). */
  doneBefore: number;
  /** Abuse flag on this attempt (e.g. same transcript on another target): no effect. */
  flagged: boolean;
}

/** null = nothing happens in the world (a miss, a flagged attempt, or no step up). */
export function speechGameEffect(i: SpeechEffectInput, hooks = SPEECH_GAME_HOOKS): SpeechGameEffect | null {
  if (!i.success || i.flagged) return null;
  switch (i.game) {
    case 'kayak_rush': {
      const t = hooks.kayakNitroSecByStars;
      const at = (s: number) => t[Math.max(0, Math.min(t.length - 1, Math.floor(s)))];
      const chargeSec = Math.max(0, at(i.bestStars) - at(i.prevBestStars));
      return chargeSec > 0 ? { kind: 'kayak_nitro', chargeSec, pet: 'celebrate' } : null;
    }
    case 'river_survival': {
      if (i.alreadyDone) return null;
      const solved = i.doneBefore + 1;
      const unlocked = hooks.decoderClues.filter((c) => solved >= c.after).map((c) => c.clue);
      const newly = hooks.decoderClues.find((c) => c.after === solved)?.clue ?? null;
      const next = hooks.decoderClues.find((c) => c.after > solved);
      return { kind: 'decoder_clue', solved, nextAt: next ? next.after : null, unlocked, newlyUnlocked: newly, pet: 'celebrate' };
    }
    case 'multiverse_portal':
      return i.alreadyDone ? null : { kind: 'portal_open', pet: 'celebrate' };
    default:
      return null;
  }
}

/**
 * Kayak: add a server-granted Nitro charge to the rage bar. While boosting, the charge is kept for
 * after the boost (the bar does not fill mid-boost); never above a full bar.
 */
export function rageAddCharge(s: RageState, chargeSec: number, cfg: RageConfig = KAYAK_RAGE): RageState {
  if (!(chargeSec > 0) || s.boosting) return s;
  return { ...s, meter: Math.min(1, s.meter + chargeSec / cfg.chargeSec) };
}

/** Pet / Lumi pose for a step of the stone state machine (blueprint §3.5). */
export function petStateFor(step: 'idle' | 'selected' | 'modeling' | 'listening' | 'scoring' | 'passed' | 'retry' | 'fallback', hint?: 'mouth_shape'): PetState {
  switch (step) {
    case 'modeling':
      return 'coach';
    case 'listening':
      return 'listening';
    case 'passed':
      return 'celebrate';
    case 'retry':
    case 'fallback':
      return hint ? 'coach' : 'idle';
    default:
      return 'idle';
  }
}
