import * as THREE from 'three';
import type { SpatialAudioOut } from '../../../../client/spatialAudio';

// ============================================================================
// GDS-TC-2026-EXP v2.6 — §3.1 Web Audio API Positional Formants
// Integrates Web Audio API (`AudioContext`, `PannerNode`, `BiquadFilterNode`)
// with Three.js positional audio (`THREE.PositionalAudio` / `THREE.AudioListener`)
// at Phonetic Stone coordinates to synthesize pitch resonance feedback.
// ============================================================================

export type FormantVowelPreset = 'open_o' | 'front_i' | 'back_a' | 'diphthong_oi' | 'neutral_schwa';

export interface FormantFrequenciesHz {
  /** Fundamental pitch frequency F0 (Hz). */
  f0: number;
  /** First formant F1 (jaw opening, Hz). */
  f1: number;
  /** Second formant F2 (tongue frontness, Hz). */
  f2: number;
  /** Third formant F3 (lip rounding / timbre, Hz). */
  f3: number;
  /** Filter resonance Q factor. */
  q: number;
}

export const FORMANT_VOWEL_PRESETS: Record<FormantVowelPreset, FormantFrequenciesHz> = {
  open_o: { f0: 165, f1: 450, f2: 850, f3: 2550, q: 9.0 },
  front_i: { f0: 190, f1: 280, f2: 2250, f3: 2890, q: 10.5 },
  back_a: { f0: 150, f1: 730, f2: 1090, f3: 2440, q: 8.5 },
  diphthong_oi: { f0: 175, f1: 510, f2: 1420, f3: 2620, q: 9.5 },
  neutral_schwa: { f0: 160, f1: 500, f2: 1500, f3: 2500, q: 8.0 },
};

/**
 * Selects an appropriate vowel formant profile from an IPA string.
 */
export function resolveFormantPresetFromIpa(ipa: string): FormantVowelPreset {
  if (ipa.includes('ɔɪ')) return 'diphthong_oi';
  if (ipa.includes('iː') || ipa.includes('ɪ')) return 'front_i';
  if (ipa.includes('ɑː') || ipa.includes('ʌ')) return 'back_a';
  if (ipa.includes('əʊ') || ipa.includes('ɔː')) return 'open_o';
  return 'neutral_schwa';
}

export interface PositionalFormantOptions {
  /** World-space position of the Phonetic Stone `[x, y, z]`. */
  stonePosition: [number, number, number];
  /** Optional IPA string to select initial formant frequencies. */
  ipa?: string;
  /** Optional injected Web Audio `BaseAudioContext` / `AudioContext` for testing. */
  audioContext?: BaseAudioContext | null;
  /** Reference distance for 3D spatial attenuation (meters). */
  refDistance?: number;
  /** Max distance for 3D spatial attenuation (meters). */
  maxDistance?: number;
  /**
   * PR #6 integration (03/11): the game's shared audio (context, effects bus, on/off switch),
   * resolved when a resonance plays (the context only exists after the first tap). With it the
   * pulse obeys mute / volume / the tutor's class mute and is placed relative to the listener that
   * follows the camera (client/spatialAudio.ts). Returns null → no sound (never a new context).
   */
  audio?: () => SpatialAudioOut | null;
}

export interface SynthesizedFormantPulseReport {
  readonly active: boolean;
  readonly preset: FormantVowelPreset;
  readonly frequenciesHz: FormantFrequenciesHz;
  readonly stonePosition: [number, number, number];
  readonly pitchScale: number;
  readonly durationMs: number;
  readonly filterBandCount: 3;
}

export interface StonePositionalFormantRig {
  readonly anchorNode: THREE.Object3D;
  readonly positionalAudio: THREE.PositionalAudio | null;
  readonly stonePosition: [number, number, number];
  getFormantPreset(): FormantVowelPreset;
  getFrequencies(): FormantFrequenciesHz;
  setStonePosition(x: number, y: number, z: number): void;
  /**
   * Synthesizes a 3-band formant pitch resonance pulse at the stone's 3D coordinates.
   * Uses `AudioContext` -> `OscillatorNode` -> 3x parallel `BiquadFilterNode` (`bandpass` F1/F2/F3)
   * -> `PannerNode` / `THREE.PositionalAudio`.
   */
  triggerFormantResonance(opts?: {
    ipa?: string;
    stars?: 1 | 2 | 3;
    durationMs?: number;
  }): SynthesizedFormantPulseReport;
  dispose(): void;
}

function getBrowserAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

export function createStonePositionalFormantRig(
  options: PositionalFormantOptions,
): StonePositionalFormantRig {
  const stonePosition: [number, number, number] = [
    options.stonePosition[0],
    options.stonePosition[1],
    options.stonePosition[2],
  ];
  const refDistance = options.refDistance ?? 2.5;
  const maxDistance = options.maxDistance ?? 24.0;

  let currentPreset = resolveFormantPresetFromIpa(options.ipa ?? '/əʊ/');
  let currentFreqs: FormantFrequenciesHz = { ...FORMANT_VOWEL_PRESETS[currentPreset] };

  const anchorNode = new THREE.Object3D();
  anchorNode.name = 'PhoneticStonePositionalFormantAnchor';
  anchorNode.position.set(stonePosition[0], stonePosition[1], stonePosition[2]);

  // With the game's audio provider, never open a context of our own (Safari allows only a few).
  const ctx = options.audio
    ? null
    : options.audioContext !== undefined
      ? options.audioContext
      : getBrowserAudioContext();

  let positionalAudio: THREE.PositionalAudio | null = null;
  if (!options.audio && ctx && typeof THREE.AudioListener !== 'undefined') {
    try {
      // Only construct THREE.AudioListener if AudioContext is a real browser instance
      if (typeof (ctx as AudioContext).createPanner === 'function' && typeof window !== 'undefined') {
        const listener = new THREE.AudioListener();
        positionalAudio = new THREE.PositionalAudio(listener);
        positionalAudio.setRefDistance(refDistance);
        positionalAudio.setMaxDistance(maxDistance);
        anchorNode.add(positionalAudio);
      }
    } catch {
      positionalAudio = null;
    }
  }

  return {
    anchorNode,
    positionalAudio,
    stonePosition,

    getFormantPreset() {
      return currentPreset;
    },

    getFrequencies() {
      return { ...currentFreqs };
    },

    setStonePosition(x: number, y: number, z: number) {
      stonePosition[0] = x;
      stonePosition[1] = y;
      stonePosition[2] = z;
      anchorNode.position.set(x, y, z);
    },

    triggerFormantResonance(opts = {}) {
      if (opts.ipa) {
        currentPreset = resolveFormantPresetFromIpa(opts.ipa);
      }
      const stars = opts.stars ?? 3;
      const pitchScale = stars === 3 ? 1.12 : stars === 2 ? 1.05 : 1.0;
      const durationMs = Math.max(80, opts.durationMs ?? 380);
      const base = FORMANT_VOWEL_PRESETS[currentPreset];
      currentFreqs = {
        f0: Math.round(base.f0 * pitchScale),
        f1: Math.round(base.f1 * pitchScale),
        f2: Math.round(base.f2 * pitchScale),
        f3: Math.round(base.f3 * pitchScale),
        q: base.q,
      };

      const shared = options.audio?.() ?? null;
      const playCtx: BaseAudioContext | null = shared ? (shared.enabled() ? shared.context : null) : ctx;
      if (playCtx) {
        const ctx = playCtx;
        try {
          if ((ctx as AudioContext).state === 'suspended') void (ctx as AudioContext).resume?.();
          const now = ctx.currentTime;
          const durSec = durationMs / 1000;

          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(currentFreqs.f0, now);

          const panner = ctx.createPanner();
          panner.panningModel = 'HRTF';
          panner.distanceModel = 'inverse';
          panner.refDistance = refDistance;
          panner.maxDistance = maxDistance;
          if (panner.positionX) {
            panner.positionX.setValueAtTime(stonePosition[0], now);
            panner.positionY.setValueAtTime(stonePosition[1], now);
            panner.positionZ.setValueAtTime(stonePosition[2], now);
          } else {
            panner.setPosition(stonePosition[0], stonePosition[1], stonePosition[2]);
          }

          const masterGain = ctx.createGain();
          masterGain.gain.setValueAtTime(0.001, now);
          masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + durSec);

          const formantBands = [currentFreqs.f1, currentFreqs.f2, currentFreqs.f3];
          const bandWeights = [1.0, 0.65, 0.35];

          for (let i = 0; i < formantBands.length; i++) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(formantBands[i], now);
            filter.Q.setValueAtTime(currentFreqs.q, now);

            const bandGain = ctx.createGain();
            bandGain.gain.setValueAtTime(bandWeights[i], now);

            osc.connect(filter);
            filter.connect(bandGain);
            bandGain.connect(panner);
          }

          panner.connect(masterGain);
          // The effects bus (mute, volume, class mute) when the game's audio is wired in.
          masterGain.connect(shared ? shared.output : ctx.destination);

          osc.start(now);
          osc.stop(now + durSec);
        } catch {
          // Non-blocking audio synthesis fallback
        }
      }

      return {
        active: true,
        preset: currentPreset,
        frequenciesHz: { ...currentFreqs },
        stonePosition: [...stonePosition] as [number, number, number],
        pitchScale,
        durationMs,
        filterBandCount: 3,
      };
    },

    dispose() {
      if (positionalAudio && positionalAudio.isPlaying) {
        try {
          positionalAudio.stop();
        } catch {
          // ignore
        }
      }
      anchorNode.clear();
    },
  };
}
