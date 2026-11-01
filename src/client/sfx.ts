'use client';

// Synthesized SFX via Web Audio: no audio files to download, so every sound
// is ready instantly (<100ms) once the context is unlocked by a user tap.

type Sfx = 'correct' | 'wrong' | 'critical' | 'skill' | 'victory' | 'defeat' | 'loot';

const PATTERNS: Record<Sfx, [freq: number, ms: number, type: OscillatorType][]> = {
  correct: [[660, 80, 'triangle'], [990, 120, 'triangle']],
  wrong: [[220, 140, 'sawtooth'], [140, 200, 'sawtooth']],
  critical: [[523, 60, 'square'], [784, 60, 'square'], [1046, 160, 'square']],
  skill: [[880, 60, 'sine'], [1320, 140, 'sine']],
  victory: [[523, 120, 'triangle'], [659, 120, 'triangle'], [784, 120, 'triangle'], [1046, 300, 'triangle']],
  defeat: [[392, 200, 'sine'], [311, 200, 'sine'], [262, 400, 'sine']],
  loot: [[1046, 70, 'sine'], [1318, 70, 'sine'], [1568, 200, 'sine']],
};

let ctx: AudioContext | null = null;
let muted = false;

export function initSfx(isMuted: boolean): void {
  muted = isMuted;
  if (ctx || typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AC) ctx = new AC();
}

export function setMuted(value: boolean): void {
  muted = value;
}

/** The shared Web Audio context (created by initSfx after a user tap), for the ambience layer. */
export function audioContext(): AudioContext | null {
  return ctx;
}

// Three buses under one output (WP2): music, sfx, ambient. src/client/audio.ts sets their levels
// (switches, tutor mute, ducking); every sound connects to its bus, never straight to the speakers.
let buses: Record<'music' | 'sfx' | 'ambient', GainNode> | null = null;

/** A bus of the shared context (null before the first tap). */
export function bus(name: 'music' | 'sfx' | 'ambient'): GainNode | null {
  if (!ctx) return null;
  if (!buses) {
    const c = ctx;
    const make = () => {
      const g = c.createGain();
      g.connect(c.destination);
      return g;
    };
    buses = { music: make(), sfx: make(), ambient: make() };
  }
  return buses[name];
}

export function play(name: Sfx): void {
  if (muted || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  let t = ctx.currentTime;
  for (const [freq, ms, type] of PATTERNS[name]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    osc.connect(gain).connect(bus('sfx') ?? ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
    t += ms / 1000;
  }
}
