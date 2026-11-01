// Sound plan (WP2, 01/11/2026): which music, ambience and effect files a place uses, how loud each bus is,
// and the timing rules that tie sound to the picture. Pure (no Web Audio): src/client/audio.ts plays it.
// Files: content/audio_catalog.json (scripts/encode-audio.mjs), ids = file names without extension.

import type { GameMode } from './types';

export type AudioBus = 'music' | 'sfx' | 'ambient';

export interface AudioTrack {
  id: string;
  kind: AudioBus;
  /** Music only: the folder under audio/music (one folder per place in the game). */
  place?: string;
  file: string;
  sec: number | null;
  kb: number | null;
}

/** Calm is the default; boost = winning streak / leading (kayak), tense = danger (survival). */
export type MusicMood = 'calm' | 'boost' | 'tense';

/** A game, the menu, or one Multiverse space (rooms of content/multiverse_rooms.json). */
export type SoundPlace = GameMode | 'menu' | 'mv_bedroom' | 'mv_cyber' | 'mv_courtyard' | 'mv_salon' | 'mv_fortress' | 'mv_desert' | 'mv_future';

// audio/AUDIO_MANIFEST.csv "dung_cho" column. The snowy courtyard has no music on purpose (wind only).
const MUSIC: Record<SoundPlace, Partial<Record<MusicMood, string>>> = {
  menu: { calm: 'Production_Intro_Theme' },
  kayak_rush: { calm: 'down_the_river', boost: 'happy_adventure' },
  river_survival: { calm: 'forest_2', tense: 'dodging_lights' },
  summer_camp: { calm: 'lofiagain' },
  river_fishing: { calm: 'LofiLoop' },
  dino_journey: { calm: 'bamboo_blitz' },
  multiverse_portal: { calm: 'IntoTheStars' },
  mv_bedroom: { calm: 'Emotional_Piano_Loop' },
  mv_cyber: { calm: 'IntoTheStars' },
  mv_courtyard: {},
  mv_salon: { calm: 'cinematic-calm' },
  mv_fortress: { calm: 'cinematic-calm' },
  mv_desert: { calm: 'desert_loops_2' },
  mv_future: { calm: 'IntoTheStars' },
};

/** Music id for a place and mood (falls back to the calm track; null = silence). */
export function musicFor(place: SoundPlace, mood: MusicMood = 'calm'): string | null {
  const m = MUSIC[place];
  return m?.[mood] ?? m?.calm ?? null;
}

/** "r_bedroom" → "mv_bedroom" (Multiverse room ids of content/multiverse_rooms.json). */
export function roomPlace(roomId: string): SoundPlace {
  const key = `mv_${roomId.replace(/^r_/, '').replace(/_[a-z0-9]+$/, '')}` as SoundPlace;
  return key in MUSIC ? key : 'multiverse_portal';
}

export interface MoodSignals {
  /** Kayak: ahead of the bot / the class median. */
  leading?: boolean;
  /** Right answers in a row. */
  streak?: number;
  /** Survival: metres to the nearest pursuer. */
  pursuerDistance?: number;
  /** Survival: seconds since a teammate was caught. */
  caughtAgoSec?: number;
}

export const BOOST_STREAK = 3;
export const TENSE_DISTANCE_M = 8;
export const TENSE_AFTER_CATCH_S = 10;
/** A new mood must be wanted this long before the music changes (no flapping between layers). */
export const MOOD_HOLD_S = 4;

/** The mood a game wants right now. */
export function wantedMood(game: SoundPlace, s: MoodSignals): MusicMood {
  if (game === 'kayak_rush') return s.leading || (s.streak ?? 0) >= BOOST_STREAK ? 'boost' : 'calm';
  if (game === 'river_survival') return (s.pursuerDistance ?? Infinity) < TENSE_DISTANCE_M || (s.caughtAgoSec ?? Infinity) < TENSE_AFTER_CATCH_S ? 'tense' : 'calm';
  return 'calm';
}

export interface MoodState {
  mood: MusicMood;
  /** The mood asked for and since when (seconds), while it waits out MOOD_HOLD_S. */
  pending: MusicMood | null;
  since: number;
}

/** Step the mood: switch only after the wanted mood held MOOD_HOLD_S seconds. */
export function stepMood(state: MoodState, wanted: MusicMood, now: number): MoodState {
  if (wanted === state.mood) return { mood: state.mood, pending: null, since: now };
  if (state.pending !== wanted) return { mood: state.mood, pending: wanted, since: now };
  return now - state.since >= MOOD_HOLD_S ? { mood: wanted, pending: null, since: now } : state;
}

// ---------------------------------------------------------------- ambience
export interface AmbienceLayer {
  id: string;
  gain: number;
}
/** Synthesized fallback (src/client/audio.ts) when a file fails or on weak phones. */
export type SynthAmbience = 'river' | 'camp' | 'night' | 'wind';

const AMBIENCE: Record<SoundPlace, { files: AmbienceLayer[]; synth: SynthAmbience | null }> = {
  menu: { files: [], synth: null },
  kayak_rush: { files: [{ id: 'beach_waves', gain: 0.45 }, { id: 'birds_wind', gain: 0.3 }], synth: 'river' },
  river_fishing: { files: [{ id: 'waves_soft', gain: 0.4 }, { id: 'birds_wind', gain: 0.45 }], synth: 'river' },
  summer_camp: { files: [{ id: 'birds_wind', gain: 0.45 }, { id: 'campfire', gain: 0.4 }], synth: 'camp' },
  river_survival: { files: [{ id: 'birds_wind', gain: 0.4 }, { id: 'wind_hollow', gain: 0.2 }], synth: 'wind' },
  dino_journey: { files: [{ id: 'wind_hollow', gain: 0.35 }, { id: 'birds_wind', gain: 0.2 }], synth: 'wind' },
  multiverse_portal: { files: [], synth: null },
  mv_bedroom: { files: [], synth: null },
  mv_cyber: { files: [{ id: 'water_bubbles', gain: 0.15 }], synth: null },
  // wind_snow (Icy Heights) waits for a licence: wind_window (SFXMint, CC0) instead.
  mv_courtyard: { files: [{ id: 'wind_window', gain: 0.5 }], synth: 'wind' },
  mv_salon: { files: [], synth: null },
  mv_fortress: { files: [{ id: 'wind_hollow', gain: 0.3 }, { id: 'campfire', gain: 0.25 }], synth: 'wind' },
  mv_desert: { files: [{ id: 'wind_hollow', gain: 0.35 }], synth: 'wind' },
  mv_future: { files: [], synth: null },
};

export function ambienceFor(place: SoundPlace): { files: AmbienceLayer[]; synth: SynthAmbience | null } {
  return AMBIENCE[place] ?? { files: [], synth: null };
}

/** Seamless loop of a short clip: overlap copies by this much and crossfade (0.3–0.5 s). */
export const LOOP_XFADE_S = 0.4;

/** Crossfade for a clip of `sec` seconds: 0.4 s, never more than a quarter of the clip. */
export function loopCrossfade(sec: number): number {
  return Math.max(0.05, Math.min(LOOP_XFADE_S, sec / 4));
}

/** Start times (seconds from `t0`) of the copies of a looping clip needed to cover [t0, t0 + span]. */
export function loopStarts(sec: number, t0: number, span: number): number[] {
  const period = sec - loopCrossfade(sec);
  const out: number[] = [];
  for (let t = t0; t < t0 + span; t += period) out.push(+t.toFixed(4));
  return out;
}

// ---------------------------------------------------------------- music phrasing
/** Music plays in phrases with a short silence: short loops repeat to about a minute first. */
export function musicPhrase(sec: number): { repeats: number; gapSec: number } {
  if (!(sec > 0)) return { repeats: 1, gapSec: 6 };
  return sec < 40 ? { repeats: Math.max(1, Math.ceil(60 / sec)), gapSec: 8 } : { repeats: 1, gapSec: 6 };
}
/** Crossfade between two music layers (calm ⇄ boost / tense). */
export const MUSIC_XFADE_S = 1.25;

// ---------------------------------------------------------------- buses
/** Music sits under the question being read: 8 dB down while a question is open (plan: 6–10 dB). */
export const DUCK_DB = -8;
export const AMBIENT_DUCK_DB = -4;
export const BUS_LEVEL: Record<AudioBus, number> = { music: 0.55, sfx: 0.9, ambient: 0.5 };

export const dbToGain = (db: number) => 10 ** (db / 20);

export interface MixSwitches {
  /** Student's music switch. */
  music: boolean;
  /** Student's effects switch (effects and ambience). */
  sfx: boolean;
  /** Tutor muted the whole class. */
  classMuted: boolean;
  /** A question is open. */
  ducked: boolean;
}

/** Target gain of every bus. The tutor's mute wins over everything. */
export function busGains(s: MixSwitches): Record<AudioBus, number> {
  if (s.classMuted) return { music: 0, sfx: 0, ambient: 0 };
  return {
    music: s.music ? BUS_LEVEL.music * (s.ducked ? dbToGain(DUCK_DB) : 1) : 0,
    sfx: s.sfx ? BUS_LEVEL.sfx : 0,
    ambient: s.sfx ? BUS_LEVEL.ambient * (s.ducked ? dbToGain(AMBIENT_DUCK_DB) : 1) : 0,
  };
}

// ---------------------------------------------------------------- effects
export type Surface = 'snow' | 'sand' | 'stone' | 'wood' | 'gravel' | 'leaves' | 'grass' | 'mud';

const SURFACE: Partial<Record<SoundPlace, Surface>> = {
  summer_camp: 'grass',
  river_fishing: 'gravel',
  river_survival: 'leaves',
  dino_journey: 'sand',
  kayak_rush: 'wood',
  mv_courtyard: 'snow',
  mv_desert: 'sand',
  mv_fortress: 'stone',
  mv_salon: 'wood',
  mv_bedroom: 'wood',
};
export const surfaceFor = (place: SoundPlace): Surface => SURFACE[place] ?? 'stone';

/** File of the n-th footstep on a surface: left/right alternate on sand and stone, others cycle. */
export function footstepId(surface: Surface, n: number): string {
  const k = Math.max(0, Math.floor(n));
  const side = k % 2 === 0 ? 'l' : 'r';
  const pick = Math.floor(k / 2) % 3;
  switch (surface) {
    case 'snow':
      return `step_snow_0${1 + (k % 9)}`;
    case 'sand':
    case 'stone':
      return `step_${surface}_${side}${1 + pick}`;
    case 'wood':
      return `step_wood_${1 + (k % 3)}`;
    case 'gravel':
      return 'step_gravel';
    case 'mud':
      return 'step_mud';
    default:
      return `step_leaves_${1 + (k % 2)}`;
  }
}

/**
 * How many marks of a cycle were passed going from phase `a` to phase `b` (phases in cycles, b ≥ a).
 * Footsteps: a run clip touches the ground at 0 and ½ of its cycle; a paddle blade enters the water
 * twice a stroke. Several marks can pass in one long frame.
 */
export function cycleHits(a: number, b: number, marks: number[] = [0, 0.5]): number {
  if (!(b > a)) return 0;
  let n = 0;
  for (const m of marks) n += Math.floor(b - m) - Math.floor(a - m);
  return n;
}

export type Cue = 'cheer' | 'win' | 'giggle' | 'splash' | 'whoosh' | 'rope' | 'land' | 'pop' | 'alarm' | 'shutter' | 'menu';

const CUES: Record<Cue, string[]> = {
  cheer: ['crowd_cheer_kids'],
  win: ['win'],
  giggle: ['crowd_giggle'],
  splash: ['splash_1', 'splash_2', 'splash_3', 'splash_4', 'splash_5', 'splash_6'],
  whoosh: ['whoosh_1', 'whoosh_2', 'whoosh_3', 'whoosh_4'],
  rope: ['rope_winch'],
  land: ['jump_land'],
  pop: ['pop_1', 'pop_2', 'pop_3'],
  alarm: ['alarm_short'],
  shutter: ['camera_shutter'],
  menu: ['ui_menu_choice'],
};

/** File id of a cue; `n` picks among variants (a counter, so repeats differ). */
export function cueId(cue: Cue, n = 0): string {
  const l = CUES[cue];
  return l[Math.abs(Math.floor(n)) % l.length];
}

/** Every file a cue may play (preload list). */
export const cueIds = (cue: Cue): string[] => [...CUES[cue]];

/** Recorded sound behind a synthesized question cue (src/client/questionSfx.ts): it replaces the noise part. */
export const QUESTION_SFX_CUE: Record<string, Cue> = {
  sfx_wrong_splash: 'splash',
  sfx_correct_whoosh: 'whoosh',
  sfx_correct_reel: 'rope',
  sfx_wrong_net: 'whoosh',
  sfx_wrong_gust: 'whoosh',
};

/** Children laughing and chatting only when the scene is busy. */
export const CROWD_MIN = 8;
export const crowdAllowed = (people: number) => people >= CROWD_MIN;

/** All files a place needs up front: its music layers, ambience and footsteps. */
export function preloadIds(place: SoundPlace): string[] {
  const ids = new Set<string>();
  for (const m of ['calm', 'boost', 'tense'] as MusicMood[]) {
    const id = MUSIC[place]?.[m];
    if (id) ids.add(id);
  }
  for (const a of ambienceFor(place).files) ids.add(a.id);
  const s = surfaceFor(place);
  for (let n = 0; n < 9; n++) ids.add(footstepId(s, n));
  return [...ids];
}
