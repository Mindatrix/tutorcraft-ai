import {
  lib,
  libraryAsset,
  type AssetQuality,
} from '../../../../config/assetLibrary';
import {
  selectPetDialogue,
  type PetDialogueEntry,
  type PetState,
  type PhoneticStoneTarget,
  type SpeechAttemptResponse,
} from '../../../../client/phoneticStones';

export type KayakBoostMultiplier = 1.0 | 1.25 | 1.5 | 1.85;

export interface KayakWaypointSpec {
  waypointIndex: number;
  targetId: string;
  word: string;
  ipa: string;
  viMeaning: string;
  /** World-space position [x, y, z] floating on the river path. */
  position: [number, number, number];
  /** Suggested kayak Pet dialogue trigger when approaching this waypoint. */
  approachTrigger:
    | 'rapid_rush_ahead'
    | 'dodge_warning'
    | 'voice_speed_hint'
    | 'combo_boost';
}

export const KAYAK_CATALOG_ASSETS = [
  'kayak_boat',
  'kayak_paddle',
  'kayak_lifejacket',
  'kayak_finish_arch',
  'kayak_log_spinning',
  'river_buoy',
  'river_buoy__alt1',
  'river_tree_pine',
  'river_rock_large',
] as const;

export const KAYAK_RUSH_WAYPOINTS: readonly KayakWaypointSpec[] = [
  {
    waypointIndex: 0,
    targetId: 'kayak_wp_1',
    word: 'paddle',
    ipa: '/ˈpædəl/',
    viMeaning: 'mái chèo (Trạm Tăng Tốc 1)',
    position: [-1.6, 0.25, 1.5],
    approachTrigger: 'rapid_rush_ahead',
  },
  {
    waypointIndex: 1,
    targetId: 'kayak_wp_2',
    word: 'river',
    ipa: '/ˈrɪvər/',
    viMeaning: 'dòng sông (Trạm Tăng Tốc 2)',
    position: [1.7, 0.25, -2.2],
    approachTrigger: 'dodge_warning',
  },
  {
    waypointIndex: 2,
    targetId: 'kayak_wp_3',
    word: 'rapid',
    ipa: '/ˈræpɪd/',
    viMeaning: 'thác ghềnh (Trạm Tăng Tốc 3)',
    position: [-1.5, 0.25, -6.0],
    approachTrigger: 'voice_speed_hint',
  },
  {
    waypointIndex: 3,
    targetId: 'kayak_wp_4',
    word: 'Row the kayak fast',
    ipa: '/rəʊ ðə ˈkaɪæk fæst/',
    viMeaning: 'Chèo thuyền kayak thật nhanh (Cổng Đích)',
    position: [0, 0.25, -9.8],
    approachTrigger: 'combo_boost',
  },
] as const;

export const KAYAK_RUSH_TARGETS: PhoneticStoneTarget[] = KAYAK_RUSH_WAYPOINTS.map((wp) => ({
  targetId: wp.targetId,
  text: wp.word,
  kind: wp.word.includes(' ') ? 'sentence' : 'word',
  ipa: wp.ipa,
  modes: ['shadow', 'dictate', 'repeat'],
  ttsRate: 0.85,
  listenMs: 8000,
  attemptsLeft: 3,
  stationId: `kayak_waypoint_${wp.waypointIndex + 1}`,
  viMeaning: wp.viMeaning,
  mouthTipVi:
    wp.word === 'paddle'
      ? 'Bật rõ âm /p/ ở đầu từ, hạ hàm mở âm /æ/ rồi cong nhẹ lưỡi ở âm cuối /dəl/.'
      : `Phát âm rõ "${wp.word}" (${wp.ipa}) để kích hoạt Tăng Tốc Thuyền Kayak!`,
}));

export function kayakBoostMultiplierForStars(stars: 0 | 1 | 2 | 3): KayakBoostMultiplier {
  if (stars >= 3) return 1.85;
  if (stars === 2) return 1.5;
  if (stars === 1) return 1.25;
  return 1.0;
}

export interface KayakSpeedBoostState {
  currentWaypointIndex: number;
  clearedWaypointIds: string[];
  activeMultiplier: KayakBoostMultiplier;
  baseSpeedKmh: number;
  currentSpeedKmh: number;
  totalBoostsTriggered: number;
  lastDialogue: PetDialogueEntry | null;
}

export function createInitialKayakBoostState(): KayakSpeedBoostState {
  return {
    currentWaypointIndex: 0,
    clearedWaypointIds: [],
    activeMultiplier: 1.0,
    baseSpeedKmh: 18,
    currentSpeedKmh: 18,
    totalBoostsTriggered: 0,
    lastDialogue: null,
  };
}

/**
 * Resolves a "kayak"-mode Pet Companion dialogue from `src/content/pet_dialogues.json`.
 */
export function resolveKayakPetDialogue(opts: {
  petState: PetState;
  trigger?: string;
  attemptNo?: number;
  hint?: string;
  reason?: string;
  random?: () => number;
}): PetDialogueEntry | null {
  return selectPetDialogue({
    ...opts,
    mode: 'kayak',
  });
}

/**
 * Updates the Kayak speed boost state when a river waypoint Phonetic Stone is completed
 * (via voice shadow, typed dictation, or non-blocking listen-and-repeat fallback).
 */
export function applyKayakWaypointStoneResult(
  state: KayakSpeedBoostState,
  response: SpeechAttemptResponse,
  random: () => number = Math.random,
): KayakSpeedBoostState {
  if (!response.accepted) {
    const failDialogue = resolveKayakPetDialogue({
      petState: 'coach',
      trigger: 'voice_speed_hint',
      reason: response.reason,
      random,
    });
    return {
      ...state,
      lastDialogue: failDialogue,
    };
  }

  const succeeded = response.passed || response.stars >= 1;
  if (!succeeded) {
    const retryTrigger = response.attemptNo >= 2 ? 'voice_fail_2' : 'voice_fail_1';
    const retryDialogue = resolveKayakPetDialogue({
      petState: 'coach',
      trigger: retryTrigger,
      attemptNo: response.attemptNo,
      hint: response.hint,
      random,
    });
    return {
      ...state,
      lastDialogue: retryDialogue,
    };
  }

  const stars = Math.max(1, response.stars) as 1 | 2 | 3;
  const multiplier = kayakBoostMultiplierForStars(stars);
  const clearedSet = new Set(state.clearedWaypointIds);
  clearedSet.add(response.targetId);

  const wpIdx = KAYAK_RUSH_WAYPOINTS.findIndex((w) => w.targetId === response.targetId);
  const nextWaypointIndex =
    wpIdx >= 0
      ? Math.min(KAYAK_RUSH_WAYPOINTS.length - 1, wpIdx + 1)
      : state.currentWaypointIndex;

  const celebrateTrigger = stars >= 2 ? 'combo_boost' : 'net_snag_near_miss';
  const celebrateDialogue = resolveKayakPetDialogue({
    petState: 'celebrate',
    trigger: celebrateTrigger,
    random,
  });

  return {
    currentWaypointIndex: nextWaypointIndex,
    clearedWaypointIds: Array.from(clearedSet),
    activeMultiplier: multiplier,
    baseSpeedKmh: state.baseSpeedKmh,
    currentSpeedKmh: Math.round(state.baseSpeedKmh * multiplier * 10) / 10,
    totalBoostsTriggered: state.totalBoostsTriggered + 1,
    lastDialogue: celebrateDialogue,
  };
}

export function verifyKayakCatalogAssets(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const id of KAYAK_CATALOG_ASSETS) {
    if (!libraryAsset(id)) {
      missing.push(id);
    }
  }
  return { valid: missing.length === 0, missing };
}

export function resolveKayakAssetUrls(quality: AssetQuality = 'high'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of KAYAK_CATALOG_ASSETS) {
    out[id] = lib(id, quality);
  }
  return out;
}
