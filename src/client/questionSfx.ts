'use client';

import { isMuted } from './audio';
import { audioContext } from './sfx';

// C4.4 sounds of the six games: every `sfx` key of content/consequences_v2.json plus the frame's
// opening sound per coat. Synthesised (no files to download), only right / wrong cues, never the
// answer read aloud. Silent until the page unlocked audio (initSfx after a tap) or when muted by
// the student or the tutor.

type Tone = [freq: number, ms: number, type: OscillatorType, gain?: number, slideTo?: number];
type Recipe = { tones?: Tone[]; noise?: { ms: number; from: number; to: number; gain: number; at?: number } };

const R: Record<string, Recipe> = {
  // right
  sfx_correct_ding: { tones: [[880, 90, 'sine'], [1320, 220, 'sine']] },
  sfx_correct_coin: { tones: [[988, 60, 'square', 0.07], [1319, 200, 'square', 0.07]] },
  sfx_correct_whoosh: { noise: { ms: 320, from: 500, to: 3200, gain: 0.16 }, tones: [[660, 90, 'triangle'], [990, 140, 'triangle']] },
  sfx_correct_fanfare_short: { tones: [[523, 90, 'triangle'], [659, 90, 'triangle'], [784, 90, 'triangle'], [1046, 240, 'triangle']] },
  sfx_correct_knock: { tones: [[180, 50, 'square', 0.1], [180, 50, 'square', 0.1], [880, 160, 'sine']] },
  sfx_correct_portal: { tones: [[440, 300, 'sine', 0.1, 1320], [1320, 200, 'sine']] },
  sfx_correct_reel: { noise: { ms: 260, from: 1800, to: 2400, gain: 0.08 }, tones: [[740, 90, 'triangle'], [1110, 160, 'triangle']] },
  sfx_correct_roar_short: { tones: [[150, 220, 'sawtooth', 0.09, 110], [784, 160, 'triangle']] },
  sfx_correct_sizzle_ding: { noise: { ms: 300, from: 3000, to: 5000, gain: 0.06 }, tones: [[1046, 220, 'sine']] },
  sfx_correct_stomp: { tones: [[90, 120, 'sine', 0.2, 60], [880, 160, 'triangle']] },
  sfx_correct_door: { tones: [[220, 160, 'triangle', 0.1, 330], [880, 160, 'sine']] },
  sfx_hint_chime: { tones: [[1568, 70, 'sine', 0.07], [2093, 160, 'sine', 0.06]] },
  // wrong (soft, never harsh: children)
  sfx_wrong_thud: { tones: [[140, 160, 'sine', 0.18, 90]] },
  sfx_wrong_plop: { tones: [[520, 110, 'sine', 0.12, 220]] },
  sfx_wrong_splash: { noise: { ms: 380, from: 2500, to: 600, gain: 0.14 } },
  sfx_wrong_creak: { tones: [[200, 300, 'sawtooth', 0.05, 160]] },
  sfx_wrong_snap: { noise: { ms: 70, from: 4000, to: 4000, gain: 0.18 }, tones: [[300, 120, 'triangle', 0.08, 180]] },
  sfx_wrong_flop: { tones: [[260, 180, 'triangle', 0.12, 120]] },
  sfx_wrong_fizz: { noise: { ms: 420, from: 5000, to: 2000, gain: 0.08 } },
  sfx_wrong_gust: { noise: { ms: 600, from: 400, to: 1200, gain: 0.12 } },
  sfx_wrong_net: { noise: { ms: 160, from: 1500, to: 900, gain: 0.1 }, tones: [[330, 140, 'triangle', 0.08, 250]] },
  sfx_wrong_roar: { tones: [[120, 380, 'sawtooth', 0.08, 90]] },
  sfx_wrong_sizzle_cough: { noise: { ms: 300, from: 4500, to: 3000, gain: 0.08 }, tones: [[240, 120, 'triangle', 0.08, 180]] },
  sfx_wrong_glitch: { tones: [[300, 50, 'square', 0.06], [220, 50, 'square', 0.06], [340, 80, 'square', 0.06]] },
  sfx_wrong_glitch_long: { tones: [[300, 60, 'square', 0.06], [200, 60, 'square', 0.06], [360, 60, 'square', 0.06], [180, 160, 'square', 0.06, 120]] },
  // frame opening, per coat
  open_rope: { tones: [[240, 120, 'triangle', 0.07, 300]], noise: { ms: 140, from: 1200, to: 800, gain: 0.05 } },
  open_wood: { tones: [[200, 60, 'square', 0.08], [260, 80, 'square', 0.06]] },
  open_metal: { tones: [[620, 260, 'triangle', 0.06, 600], [930, 260, 'sine', 0.04]] },
  open_stone: { tones: [[110, 200, 'sine', 0.16, 80]], noise: { ms: 180, from: 600, to: 300, gain: 0.06 } },
  open_holo: { tones: [[880, 90, 'sine', 0.06, 1760], [1760, 120, 'sine', 0.05]] },
  coin: { tones: [[1319, 50, 'square', 0.05], [1760, 110, 'square', 0.05]] },
};

/** Every key this module can play (tests / the lab check the content is covered). */
export const QUESTION_SFX_KEYS = Object.keys(R);

let noise: AudioBuffer | null = null;

export function playQuestionSfx(key: string): void {
  const ctx = audioContext();
  const r = R[key];
  if (!ctx || !r || isMuted()) return;
  if (ctx.state === 'suspended') void ctx.resume();
  let t = ctx.currentTime;
  for (const [f, ms, type, g = 0.11, to] of r.tones ?? []) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    gain.gain.setValueAtTime(g, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
    t += ms / 1000;
  }
  if (r.noise) {
    const n = r.noise;
    if (!noise || noise.sampleRate !== ctx.sampleRate) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const at = ctx.currentTime + (n.at ?? 0);
    bp.frequency.setValueAtTime(n.from, at);
    bp.frequency.exponentialRampToValueAtTime(n.to, at + n.ms / 1000);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(n.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.0008, at + n.ms / 1000);
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(at);
    src.stop(at + n.ms / 1000 + 0.02);
  }
}
