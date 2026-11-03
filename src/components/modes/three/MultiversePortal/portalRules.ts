import {
  lib,
  libraryAsset,
  type AssetQuality,
} from '../../../../config/assetLibrary';
import type {
  PhoneticStoneTarget,
  SpeechAttemptResponse,
} from '../../../../client/phoneticStones';

export type PortalGateState = 'locked' | 'opening' | 'open';

export const MULTIVERSE_CATALOG_ASSETS = [
  'mv_castle_module',
  'mv_castle_module_2',
  'mv_torch',
  'mv_torch_3',
  'mv_hero_scarlet',
  'mv_boss',
  'mv_wall_breach',
  'mv_ruin_building',
] as const;

export const CENTRAL_PORTAL_STONE_ID = 'mv_portal_lock';

/**
 * The central Phonetic Stone pedestal target in front of the Multiverse Portal gate
 * serving as the voice-passcode lock.
 */
export const MULTIVERSE_PORTAL_TARGETS: PhoneticStoneTarget[] = [
  {
    targetId: CENTRAL_PORTAL_STONE_ID,
    text: 'Open the magic gate',
    kind: 'sentence',
    ipa: '/ˈəʊpən ðə ˈmædʒɪk ɡeɪt/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'central_portal_pedestal',
    viMeaning: 'Hãy mở cánh cổng phép thuật (Mật Khẩu Giọng Nói Trung Tâm)',
    mouthTipVi:
      'Tròn môi ở âm đôi /əʊ/ trong "Open", bật rõ âm /dʒ/ trong "magic" và kết thúc dứt khoát âm /t/ ở "gate".',
  },
];

export interface PortalOpeningSequenceConfig {
  stars: 1 | 2 | 3;
  burstParticleCount: number;
  spiralOrbitSpeed: number;
  vortexTargetScale: number;
  primaryColorHex: number;
  secondaryColorHex: number;
}

export function computePortalOpeningConfig(stars: 1 | 2 | 3): PortalOpeningSequenceConfig {
  if (stars >= 3) {
    return {
      stars: 3,
      burstParticleCount: 90,
      spiralOrbitSpeed: 4.2,
      vortexTargetScale: 1.15,
      primaryColorHex: 0xfacc15, // Radiant Gold
      secondaryColorHex: 0x38bdf8, // Astral Cyan
    };
  }
  if (stars === 2) {
    return {
      stars: 2,
      burstParticleCount: 64,
      spiralOrbitSpeed: 3.4,
      vortexTargetScale: 1.05,
      primaryColorHex: 0xa855f7, // Arcane Violet
      secondaryColorHex: 0x38bdf8, // Astral Cyan
    };
  }
  return {
    stars: 1,
    burstParticleCount: 44,
    spiralOrbitSpeed: 2.6,
    vortexTargetScale: 1.0,
    primaryColorHex: 0x38bdf8, // Astral Cyan
    secondaryColorHex: 0xc084fc, // Soft Purple
  };
}

export interface PortalLockState {
  gateState: PortalGateState;
  unlockedStars: 0 | 1 | 2 | 3;
  activationCount: number;
  lastPasscodeScore: number | null;
  openingConfig: PortalOpeningSequenceConfig | null;
}

export function createInitialPortalLockState(): PortalLockState {
  return {
    gateState: 'locked',
    unlockedStars: 0,
    activationCount: 0,
    lastPasscodeScore: null,
    openingConfig: null,
  };
}

/**
 * Evaluates a speech / fallback attempt on the central Phonetic Stone pedestal
 * and transitions the Multiverse Portal lock state (`locked -> open`) when passed.
 */
export function applyPortalPasscodeResult(
  state: PortalLockState,
  response: SpeechAttemptResponse,
): PortalLockState {
  if (!response.accepted) {
    return state;
  }

  const succeeded = response.passed || response.stars >= 1;
  if (!succeeded) {
    return {
      ...state,
      lastPasscodeScore: response.score,
    };
  }

  const stars = Math.max(1, response.stars) as 1 | 2 | 3;
  const bestStars = Math.max(state.unlockedStars, stars) as 1 | 2 | 3;
  const openingConfig = computePortalOpeningConfig(bestStars);

  return {
    gateState: 'open',
    unlockedStars: bestStars,
    activationCount: state.activationCount + 1,
    lastPasscodeScore: response.score,
    openingConfig,
  };
}

export function verifyMultiverseCatalogAssets(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const id of MULTIVERSE_CATALOG_ASSETS) {
    if (!libraryAsset(id)) {
      missing.push(id);
    }
  }
  return { valid: missing.length === 0, missing };
}

export function resolveMultiverseAssetUrls(
  quality: AssetQuality = 'high',
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of MULTIVERSE_CATALOG_ASSETS) {
    out[id] = lib(id, quality);
  }
  return out;
}
