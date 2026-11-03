import { KAYAK_RAGE, type RageConfig, type RageState } from './kayakRage';
import { hashString } from './variants';

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
//   summer_camp        (03/11 live match) each stone belongs to one of the 4 hub stations (server
//                      decides, `campStationFor`); a first pass on a stone completes it for the student
//                      and counts for the tent's Quest Board (matchService.recordCampStation).
//   river_fishing      (03/11 live match) a stone on the dock before the casting point: the best star
//                      level sets the catch weight bonus pass ×1.0, 2★ ×1.1, 3★ ×1.2 (step up only).
//                      The weight is a world effect (fish size), never the ranking (stars from answers).
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

/** Summer Camp hub stations (same ids as the 3D camp props). */
export const CAMP_STATIONS = ['camp_kitchen_station', 'camp_tent_station', 'camp_water_station', 'camp_firewood_station'] as const;
export type CampStation = (typeof CAMP_STATIONS)[number];

/** River Fishing catch weight bonus by best stars (index = stars; 0 = not unlocked). */
export const CATCH_BONUS_BY_STARS = [0, 1.0, 1.1, 1.2] as const;
export type CatchBonus = 1.0 | 1.1 | 1.2;

/**
 * The station a Summer Camp stone belongs to: questions in material order fill the 4 stations in
 * turn (q1 kitchen, q2 tent…), so a class spreads over the whole camp. Word and sentence stones of
 * the same question share a station. Every device and the server compute the same.
 */
export function campStationFor(targetId: string): CampStation {
  const m = /^q(\d+)/.exec(targetId);
  const n = m ? Number(m[1]) - 1 : hashString(targetId);
  return CAMP_STATIONS[((n % CAMP_STATIONS.length) + CAMP_STATIONS.length) % CAMP_STATIONS.length];
}

export type SpeechGameEffect =
  | { kind: 'kayak_nitro'; chargeSec: number; pet: PetState }
  | { kind: 'decoder_clue'; solved: number; nextAt: number | null; unlocked: DecoderClue[]; newlyUnlocked: DecoderClue | null; pet: PetState }
  | { kind: 'portal_open'; pet: PetState }
  | { kind: 'camp_station'; stationId: CampStation; solved: number; pet: PetState }
  | { kind: 'catch_bonus'; multiplier: CatchBonus; stars: 1 | 2 | 3; pet: PetState };

export interface SpeechEffectInput {
  /** The stone (summer_camp: its station). */
  targetId?: string;
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
    case 'summer_camp':
      if (i.alreadyDone || !i.targetId) return null;
      return { kind: 'camp_station', stationId: campStationFor(i.targetId), solved: i.doneBefore + 1, pet: 'celebrate' };
    case 'river_fishing': {
      const best = Math.max(0, Math.min(3, Math.floor(i.bestStars))) as 0 | 1 | 2 | 3;
      const prev = Math.max(0, Math.min(3, Math.floor(i.prevBestStars)));
      if (best < 1 || best <= prev) return null; // a better star level only: no farming the same stone
      return { kind: 'catch_bonus', multiplier: CATCH_BONUS_BY_STARS[best] as CatchBonus, stars: best as 1 | 2 | 3, pet: 'celebrate' };
    }
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

/**
 * River Survival: may a student open a Phonetic Stone right now? Never while a question frame is open
 * or while the server's timed "Né lưới" (dodge, 6 s) / "Cướp lưới" (snatch, 8 s) window is running for
 * them: voice must not eat into those windows. Times are server ms (the match clock).
 */
export function survivalStonesOpen(s: { now: number; questionOpen?: boolean; dodgeUntil?: number | null; snatchUntil?: number | null }): boolean {
  if (s.questionOpen) return false;
  if (s.dodgeUntil != null && s.now < s.dodgeUntil) return false;
  if (s.snatchUntil != null && s.now < s.snatchUntil) return false;
  return true;
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
