'use client';

import { useSyncExternalStore } from 'react';
import audioCatalog from '../../content/audio_catalog.json';
import {
  MUSIC_XFADE_S,
  ambienceFor,
  busGains,
  cueId,
  footstepId,
  loopCrossfade,
  musicFor,
  musicPhrase,
  preloadIds,
  stepMood,
  surfaceFor,
  wantedMood,
  type AudioBus,
  type Cue,
  type MoodSignals,
  type MoodState,
  type SoundPlace,
  type Surface,
  type SynthAmbience,
} from '../engine/audioPlan';
import { audioContext, bus, initSfx, play, setMuted as setSfxMuted } from './sfx';
import { load, save } from './storage';

// One switchboard for every sound of a game (WP2, 01/11/2026). Three buses under a master:
//   music    one track per place, layers by mood (kayak: calm ⇄ boost, survival: calm ⇄ tense),
//            crossfaded 1.25 s, played in phrases with a short silence, 8 dB down while a question is open;
//   sfx      recorded effects (footsteps, splashes, cheers) + the synthesized cues of sfx.ts / questionSfx.ts;
//   ambient  short recorded loops overlapped with a 0.4 s crossfade so they never click; the old
//            synthesized layers stay as the fallback (file failed, or a weak phone).
// Switches: the student's music and effects (separately, remembered), and the tutor's "mute the class"
// (arrives with the match state, matchChannel.ts), which wins over both. Sound starts after a tap.
// Files: content/audio_catalog.json, served from NEXT_PUBLIC_ASSET_BASE_URL/audio (dev: app/dev-assets).

export type Ambience = SynthAmbience;

interface Entry {
  id: string;
  file: string;
  sec: number | null;
}
const FILES = new Map((audioCatalog as Entry[]).map((e) => [e.id, e]));
const base = () => (process.env.NEXT_PUBLIC_ASSET_BASE_URL || '/dev-assets').replace(/\/$/, '');
export const audioUrl = (file: string) => `${base()}/audio/${file}`;

let musicOn = true;
/** Volume of each bus 0..1 (HUD settings sliders, U2), multiplied into the switch / duck gains. */
const volumes: Record<AudioBus, number> = { music: 1, sfx: 1, ambient: 1 };
let sfxOn = true;
let classMuted = false;
let duckHolds = 0;
const listeners = new Set<(s: SoundSwitches) => void>();

export interface SoundSwitches {
  music: boolean;
  sfx: boolean;
  classMuted: boolean;
}
export const soundSwitches = (): SoundSwitches => ({ music: musicOn, sfx: sfxOn, classMuted });
/** Everything silent (tutor mute, or both switches off). */
export const isMuted = () => classMuted || (!musicOn && !sfxOn);
export const isClassMuted = () => classMuted;
/** Effects allowed right now (used by the synthesized cues). */
export const effectsOn = () => sfxOn && !classMuted;

function apply() {
  setSfxMuted(!effectsOn());
  const ctx = audioContext();
  const g = busGains({ music: musicOn, sfx: sfxOn, classMuted, ducked: duckHolds > 0 });
  if (ctx) for (const k of ['music', 'sfx', 'ambient'] as AudioBus[]) bus(k)?.gain.setTargetAtTime(g[k] * volumes[k], ctx.currentTime, 0.15);
  for (const l of listeners) l(soundSwitches());
}

/** Call from a user gesture (browsers start audio only after a tap). Reads the saved switches. */
export function initAudio() {
  musicOn = load<boolean>('tc:music', true);
  for (const b of ['music', 'sfx', 'ambient'] as AudioBus[]) volumes[b] = Math.max(0, Math.min(1, Number(load<number>(`tc:vol:${b}`, 1)) || 0));
  sfxOn = !load<boolean>('tc:muted', false);
  initSfx(!effectsOn());
  apply();
}

export function setMusicEnabled(v: boolean) {
  musicOn = v;
  save('tc:music', v);
  apply();
}

export const busVolume = (b: AudioBus) => volumes[b];

export function setBusVolume(b: AudioBus, v: number) {
  volumes[b] = Math.max(0, Math.min(1, v));
  save(`tc:vol:${b}`, volumes[b]);
  apply();
}

export function setSfxEnabled(v: boolean) {
  sfxOn = v;
  save('tc:muted', !v);
  apply();
}

/** Old single switch: both music and effects. */
export function setUserMuted(v: boolean) {
  musicOn = !v;
  sfxOn = !v;
  apply();
}

/** The tutor's switch for the whole class. */
export function setClassMuted(v: boolean) {
  if (classMuted === v) return;
  classMuted = v;
  apply();
}

/** React: the current switches, updated on change. */
export function useSoundSwitches(): SoundSwitches {
  return useSyncExternalStore(
    (fn) => onSoundChange(fn),
    soundSnapshot,
    () => SERVER_SWITCHES,
  );
}
const SERVER_SWITCHES: SoundSwitches = { music: true, sfx: true, classMuted: false };
let snap: SoundSwitches = SERVER_SWITCHES;
const soundSnapshot = () => {
  const n = soundSwitches();
  if (n.music !== snap.music || n.sfx !== snap.sfx || n.classMuted !== snap.classMuted) snap = n;
  return snap;
};

export function onSoundChange(fn: (s: SoundSwitches) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Lower the music while a question is open. Returns the release (holds nest: frame + arena). */
export function holdDuck(): () => void {
  duckHolds++;
  apply();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    duckHolds = Math.max(0, duckHolds - 1);
    apply();
  };
}

export { play as playSfx };

// ---------------------------------------------------------------- files
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const ready = new Map<string, AudioBuffer>();
let warned = false;

function loadBuffer(id: string): Promise<AudioBuffer | null> {
  const ctx = audioContext();
  const e = FILES.get(id);
  if (!ctx || !e) return Promise.resolve(null);
  let p = buffers.get(id);
  if (!p) {
    p = fetch(audioUrl(e.file))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        ready.set(id, buf);
        return buf;
      })
      .catch((err: Error) => {
        if (!warned) console.warn(`[audio] không tải được ${e.file} (${err.message}): dùng âm tổng hợp`);
        warned = true;
        return null;
      });
    buffers.set(id, p);
  }
  return p;
}

export function preloadSounds(ids: string[]) {
  for (const id of ids) void loadBuffer(id);
}

/** Play a loaded file on the effects bus. False when it is not loaded yet (caller may synthesize). */
export function playFile(id: string, gain = 1, rate = 1): boolean {
  const ctx = audioContext();
  const buf = ready.get(id);
  const out = bus('sfx');
  if (!ctx || !out || !buf || !effectsOn()) {
    if (!buf) void loadBuffer(id);
    return false;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(out);
  src.start();
  return true;
}

const counters = new Map<string, number>();
const next = (k: string) => {
  const n = counters.get(k) ?? 0;
  counters.set(k, n + 1);
  return n;
};

export function playCue(cue: Cue, gain = 1): boolean {
  // A slight pitch spread so repeated splashes and steps do not sound copy-pasted.
  return playFile(cueId(cue, next(cue)), gain, 0.94 + Math.random() * 0.12);
}

let surface: Surface = 'stone';
export function playFootstep(on: Surface = surface, gain = 0.6): boolean {
  return playFile(footstepId(on, next(`step_${on}`)), gain, 0.95 + Math.random() * 0.1);
}

// ---------------------------------------------------------------- music
let place: SoundPlace | null = null;
let mood: MoodState = { mood: 'calm', pending: null, since: 0 };
let music: { id: string; gain: GainNode; stop: () => void } | null = null;

function startMusic(id: string | null) {
  const ctx = audioContext();
  const out = bus('music');
  if (music?.id === id) return;
  const old = music;
  music = null;
  if (old && ctx) {
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, MUSIC_XFADE_S / 4);
    setTimeout(old.stop, MUSIC_XFADE_S * 1000 + 200);
  } else old?.stop();
  if (!id || !ctx || !out) return;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(out);
  let src: AudioBufferSourceNode | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const me = {
    id,
    gain,
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      try {
        src?.stop();
      } catch {
        /* not started */
      }
      gain.disconnect();
    },
  };
  music = me;
  // One phrase: the track (short loops repeated to about a minute), then a short silence, again.
  const phrase = (buf: AudioBuffer) => {
    if (stopped) return;
    const { repeats, gapSec } = musicPhrase(buf.duration);
    const t = ctx.currentTime + 0.05;
    const len = buf.duration * repeats;
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = repeats > 1;
    src.connect(gain);
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + MUSIC_XFADE_S);
    gain.gain.setValueAtTime(1, t + Math.max(MUSIC_XFADE_S, len - 1.5));
    gain.gain.linearRampToValueAtTime(0, t + len);
    src.start(t);
    src.stop(t + len);
    timer = setTimeout(() => phrase(buf), (len + gapSec) * 1000);
  };
  void loadBuffer(id).then((buf) => {
    if (buf && music === me) phrase(buf);
  });
}

/** Tell the music what is happening (kayak: leading / streak; survival: pursuer distance). */
export function setMoodSignals(s: MoodSignals) {
  if (!place) return;
  const now = (audioContext()?.currentTime ?? performance.now() / 1000) || 0;
  const was = mood.mood;
  mood = stepMood(mood, wantedMood(place, s), now);
  if (mood.mood !== was) startMusic(musicFor(place, mood.mood));
}

// ---------------------------------------------------------------- ambience
let ambience: { key: string; stop: () => void } | null = null;

/** A recorded loop with overlapping crossfaded copies (seamless however short the clip). */
function fileLoop(buf: AudioBuffer, level: number, out: AudioNode): () => void {
  const ctx = audioContext()!;
  const xf = loopCrossfade(buf.duration);
  const period = buf.duration - xf;
  let at = ctx.currentTime + 0.05;
  const live = new Set<AudioBufferSourceNode>();
  const schedule = () => {
    while (at < ctx.currentTime + 2) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level, at + xf);
      g.gain.setValueAtTime(level, at + period);
      g.gain.linearRampToValueAtTime(0, at + buf.duration);
      s.connect(g).connect(out);
      s.start(at);
      s.stop(at + buf.duration + 0.01);
      live.add(s);
      s.onended = () => live.delete(s);
      at += period;
    }
  };
  schedule();
  const timer = setInterval(schedule, 500);
  return () => {
    clearInterval(timer);
    for (const s of live) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
  };
}

function startAmbienceFor(p: SoundPlace, lowPower: boolean) {
  const key = `${p}:${lowPower ? 'synth' : 'file'}`;
  if (ambience?.key === key) return;
  stopAmbience();
  const { files, synth } = ambienceFor(p);
  const out = bus('ambient');
  const ctx = audioContext();
  if (!ctx || !out) return;
  const stops: (() => void)[] = [];
  let alive = true;
  ambience = {
    key,
    stop: () => {
      alive = false;
      for (const s of stops) s();
    },
  };
  const fallback = () => {
    if (alive && synth) stops.push(synthAmbience(synth, out));
  };
  if (lowPower || !files.length) return fallback();
  void Promise.all(files.map((f) => loadBuffer(f.id))).then((bufs) => {
    if (!alive) return;
    if (bufs.some((b) => !b)) return fallback();
    bufs.forEach((b, i) => stops.push(fileLoop(b!, files[i].gain, out)));
  });
}

export function stopAmbience() {
  ambience?.stop();
  ambience = null;
}

/** Old entry point: synthesized layer only. */
export function startAmbience(kind: Ambience) {
  const out = bus('ambient');
  if (!out) return;
  stopAmbience();
  ambience = { key: `synth:${kind}`, stop: synthAmbience(kind, out) };
}

// ---------------------------------------------------------------- places
/**
 * Enter a place (a game, the menu, a Multiverse space): its music, ambience, footstep surface, and a
 * preload of what it needs. `lowPower` (weak phone): synthesized ambience instead of files.
 */
export function setSoundPlace(p: SoundPlace | null, opts: { lowPower?: boolean } = {}) {
  if (!audioContext()) return;
  if (!p) return stopSound();
  if (place !== p) {
    place = p;
    mood = { mood: 'calm', pending: null, since: 0 };
    surface = surfaceFor(p);
    preloadSounds(preloadIds(p));
    startMusic(musicFor(p, 'calm'));
  }
  startAmbienceFor(p, !!opts.lowPower);
  apply();
}

export function stopSound() {
  place = null;
  startMusic(null);
  stopAmbience();
}

// ---------------------------------------------------------------- synthesized fallback
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

/** River, campfire, night crickets or wind made with Web Audio (no download). Returns its stop. */
function synthAmbience(kind: Ambience, dest: AudioNode): () => void {
  const ctx = audioContext()!;
  const nodes: AudioScheduledSourceNode[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  const out = ctx.createGain();
  out.connect(dest);
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
  return () => {
    for (const n of nodes) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    for (const t of timers) clearInterval(t);
    out.disconnect();
  };
}

/** State for the scene lab readout. */
export function soundDebug() {
  return {
    place,
    track: music?.id ?? null,
    mood: mood.mood,
    pending: mood.pending,
    ambience: ambience?.key ?? null,
    ducked: duckHolds > 0,
    loaded: ready.size,
    ...soundSwitches(),
  };
}
