import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine';

const catalog = JSON.parse(readFileSync('content/audio_catalog.json', 'utf8')) as (E.AudioTrack & { license: string; author: string; source: string; ai?: boolean })[];
const ids = new Set(catalog.map((t) => t.id));
const rooms = (JSON.parse(readFileSync('content/multiverse_rooms.json', 'utf8')).rooms as { id: string }[]).map((r) => r.id);
const PLACES: E.SoundPlace[] = ['menu', 'kayak_rush', 'river_fishing', 'summer_camp', 'river_survival', 'dino_journey', 'multiverse_portal', ...rooms.map(E.roomPlace)];

test('WP2 audio catalog: every file the sound plan names exists, licensed CC0 / public domain, no pending licence', () => {
  const missing: string[] = [];
  for (const p of PLACES) for (const id of E.preloadIds(p)) if (!ids.has(id)) missing.push(`${p}: ${id}`);
  for (const c of ['cheer', 'win', 'giggle', 'splash', 'whoosh', 'rope', 'land', 'pop', 'alarm', 'shutter', 'menu'] as E.Cue[]) for (const id of E.cueIds(c)) if (!ids.has(id)) missing.push(`cue ${c}: ${id}`);
  for (const s of ['snow', 'sand', 'stone', 'wood', 'gravel', 'leaves', 'grass', 'mud'] as E.Surface[]) for (let n = 0; n < 12; n++) if (!ids.has(E.footstepId(s, n))) missing.push(`${s} ${n}: ${E.footstepId(s, n)}`);
  assert.deepEqual(missing, []);
  assert.ok(!ids.has('wind_snow'), 'wind_snow waits for its licence');
  assert.ok(catalog.every((t) => /^(cc0|public domain)/i.test(t.license)), 'CC0 / public domain only');
  assert.ok(catalog.every((t) => /\.mp3$/.test(t.file) && Number(t.kb) > 0 && Number(t.sec) > 0), 'every file encoded, with a length');
  // SFXMint sounds are AI-made: the credits say so.
  for (const id of ['campfire', 'wind_window', 'crowd_cheer_kids']) assert.equal(catalog.find((t) => t.id === id)?.ai, true, id);
  // One music file per game is about 1–2 MB: a match stays far under its 15 MB (low) budget.
  const music = catalog.filter((t) => t.kind === 'music');
  assert.ok(Math.max(...music.map((t) => t.kb ?? 0)) < 2500, 'each music file < 2.5 MB');
});

test('WP2 music: a track per game, layers by mood, held 4 s before switching', () => {
  assert.equal(E.musicFor('kayak_rush'), 'down_the_river');
  assert.equal(E.musicFor('kayak_rush', 'boost'), 'happy_adventure');
  assert.equal(E.musicFor('river_survival', 'tense'), 'dodging_lights');
  assert.equal(E.musicFor('summer_camp', 'boost'), 'lofiagain', 'no boost layer → calm track');
  assert.equal(E.musicFor('mv_courtyard'), null, 'snowy courtyard: wind only, no music');
  assert.equal(E.roomPlace('r_bedroom'), 'mv_bedroom');
  assert.equal(E.roomPlace('r_unknown_room'), 'multiverse_portal');

  assert.equal(E.wantedMood('kayak_rush', { streak: 3 }), 'boost');
  assert.equal(E.wantedMood('kayak_rush', { leading: true }), 'boost');
  assert.equal(E.wantedMood('kayak_rush', { streak: 2 }), 'calm');
  assert.equal(E.wantedMood('river_survival', { pursuerDistance: 5 }), 'tense');
  assert.equal(E.wantedMood('river_survival', { caughtAgoSec: 3 }), 'tense');
  assert.equal(E.wantedMood('river_survival', { pursuerDistance: 20, caughtAgoSec: 30 }), 'calm');

  let s: E.MoodState = { mood: 'calm', pending: null, since: 0 };
  s = E.stepMood(s, 'boost', 10);
  assert.equal(s.mood, 'calm');
  s = E.stepMood(s, 'boost', 12);
  assert.equal(s.mood, 'calm', 'not yet 4 s');
  s = E.stepMood(s, 'calm', 13);
  s = E.stepMood(s, 'boost', 14);
  s = E.stepMood(s, 'boost', 17);
  assert.equal(s.mood, 'calm', 'a flicker restarts the wait');
  s = E.stepMood(s, 'boost', 18);
  assert.equal(s.mood, 'boost');

  assert.deepEqual(E.musicPhrase(17), { repeats: 4, gapSec: 8 });
  assert.deepEqual(E.musicPhrase(114), { repeats: 1, gapSec: 6 });
});

test('WP2 mix: separate music / effect switches, 8 dB duck under a question, tutor mute wins', () => {
  const on = { music: true, sfx: true, classMuted: false, ducked: false };
  const g = E.busGains(on);
  const d = E.busGains({ ...on, ducked: true });
  const db = 20 * Math.log10(d.music / g.music);
  assert.ok(db <= -6 && db >= -10, `duck ${db.toFixed(1)} dB`);
  assert.equal(d.sfx, g.sfx, 'effects are not ducked');
  assert.deepEqual(E.busGains({ ...on, classMuted: true }), { music: 0, sfx: 0, ambient: 0 });
  const noMusic = E.busGains({ ...on, music: false });
  assert.equal(noMusic.music, 0);
  assert.ok(noMusic.sfx > 0 && noMusic.ambient > 0);
  const noSfx = E.busGains({ ...on, sfx: false });
  assert.ok(noSfx.music > 0);
  assert.equal(noSfx.sfx + noSfx.ambient, 0);
});

test('WP2 seamless short loops: copies overlap by 0.3–0.5 s, never more than a quarter of the clip', () => {
  for (const id of ['waves_soft', 'beach_waves', 'campfire', 'wind_window']) {
    const sec = catalog.find((t) => t.id === id)!.sec!;
    const x = E.loopCrossfade(sec);
    assert.ok(x >= 0.3 && x <= 0.5 && x <= sec / 4, `${id} ${sec}s → ${x}s`);
    const starts = E.loopStarts(sec, 0, 30);
    // Consecutive copies overlap by exactly the crossfade: no gap, no doubled stretch.
    for (let i = 1; i < starts.length; i++) assert.ok(Math.abs(starts[i] - starts[i - 1] - (sec - x)) < 1e-3);
    assert.ok(starts.at(-1)! + sec >= 30);
  }
});

test('WP2 sound follows the picture: footsteps at foot contacts, alternating feet, surface by place', () => {
  // A run cycle touches the ground at 0 and ½: two steps a cycle, whatever the frame length.
  assert.equal(E.cycleHits(0.1, 0.4), 0);
  assert.equal(E.cycleHits(0.4, 0.6), 1);
  assert.equal(E.cycleHits(0.9, 1.1), 1);
  assert.equal(E.cycleHits(0.2, 3.2), 6, 'a long frame counts every contact');
  assert.equal(E.cycleHits(0.5, 0.5), 0);
  let steps = 0;
  for (let f = 1, prev = 0; f <= 600; f++) {
    const ph = (f / 60) * 1.4;
    steps += E.cycleHits(prev, ph);
    prev = ph;
  }
  assert.equal(steps, 28, '10 s at 1.4 cycles/s = 28 steps at 60 fps');

  assert.deepEqual([0, 1, 2, 3].map((n) => E.footstepId('sand', n)), ['step_sand_l1', 'step_sand_r1', 'step_sand_l2', 'step_sand_r2']);
  assert.equal(E.footstepId('snow', 9), 'step_snow_01');
  assert.equal(E.surfaceFor('mv_courtyard'), 'snow');
  assert.equal(E.surfaceFor('dino_journey'), 'sand');
  assert.equal(E.cueId('splash', 7), 'splash_2');
  assert.ok(!E.crowdAllowed(3) && E.crowdAllowed(12), 'crowd chatter only in a busy scene');
});
