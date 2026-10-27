'use client';

import { audioContext, initSfx, play, setMuted as setSfxMuted } from './sfx';

// One switchboard for every sound of a game (plan C3.2): effects (sfx.ts) and a background layer,
// synthesized with Web Audio so nothing has to download (river, campfire, night crickets, wind).
// Two independent mutes: the student's own switch and the tutor's "mute the class" (it arrives
// with the match state, see matchChannel.ts). Sound plays only when neither is on.
// Licensed recordings (plan C3.3) can replace the synthesized layers later without touching callers.

export type Ambience = 'river' | 'camp' | 'night' | 'wind';

let userMuted = false;
let classMuted = false;
let master: GainNode | null = null;
let layer: { stop: () => void; kind: Ambience } | null = null;
const listeners = new Set<(muted: boolean) => void>();

export const isMuted = () => userMuted || classMuted;
export const isClassMuted = () => classMuted;

function apply() {
  const m = isMuted();
  setSfxMuted(m);
  const ctx = audioContext();
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.15);
  for (const l of listeners) l(m);
}

/** Call from a user gesture (browsers start audio only after a tap). */
export function initAudio(muted = false) {
  userMuted = muted;
  initSfx(isMuted());
  apply();
}

export function setUserMuted(v: boolean) {
  userMuted = v;
  apply();
}

/** The tutor's switch for the whole class. */
export function setClassMuted(v: boolean) {
  if (classMuted === v) return;
  classMuted = v;
  apply();
}

export function onMuteChange(fn: (muted: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export { play as playSfx };

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

/** Start (or switch) the background layer. */
export function startAmbience(kind: Ambience) {
  const ctx = audioContext();
  if (!ctx) return;
  if (layer?.kind === kind) return;
  stopAmbience();
  if (!master) {
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  master.gain.value = isMuted() ? 0 : 0.5;
  const nodes: AudioScheduledSourceNode[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const out = ctx.createGain();
  out.connect(master);
  const loopNoise = (brown: boolean, type: BiquadFilterType, freq: number, q: number, gain: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 4, brown);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start();
    nodes.push(src);
    return g;
  };
  const lfo = (target: AudioParam, rate: number, depth: number) => {
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    nodes.push(o);
  };
  if (kind === 'river') {
    const g = loopNoise(true, 'bandpass', 600, 0.7, 0.55);
    lfo(g.gain, 0.17, 0.15);
    loopNoise(false, 'highpass', 3500, 0.5, 0.025);
  } else if (kind === 'wind') {
    const g = loopNoise(true, 'lowpass', 500, 0.6, 0.6);
    lfo(g.gain, 0.09, 0.3);
  } else if (kind === 'camp') {
    loopNoise(true, 'lowpass', 220, 0.8, 0.35);
    // Crackles: short bright noise clicks at random moments.
    const click = noiseBuffer(ctx, 0.04, false);
    timers.push(
      setInterval(() => {
        if (Math.random() < 0.55) {
          const s = ctx.createBufferSource();
          s.buffer = click;
          const g = ctx.createGain();
          g.gain.value = 0.08 + Math.random() * 0.12;
          s.connect(g).connect(out);
          s.start();
        }
      }, 140),
    );
  } else if (kind === 'night') {
    loopNoise(true, 'lowpass', 300, 0.6, 0.18);
    timers.push(
      setInterval(() => {
        // A cricket: three quick high chirps.
        const t = ctx.currentTime;
        for (let k = 0; k < 3; k++) {
          const o = ctx.createOscillator();
          o.frequency.value = 4200 + Math.random() * 300;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t + k * 0.07);
          g.gain.linearRampToValueAtTime(0.03, t + k * 0.07 + 0.01);
          g.gain.linearRampToValueAtTime(0, t + k * 0.07 + 0.04);
          o.connect(g).connect(out);
          o.start(t + k * 0.07);
          o.stop(t + k * 0.07 + 0.05);
        }
      }, 900),
    );
  }
  layer = {
    kind,
    stop: () => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const t of timers) clearInterval(t);
      out.disconnect();
    },
  };
}

export function stopAmbience() {
  layer?.stop();
  layer = null;
}
