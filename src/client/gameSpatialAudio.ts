'use client';

import { effectsOn } from './audio';
import { audioContext, bus } from './sfx';
import type { SpatialAudioOut } from './spatialAudio';

// PR #6 integration (03/11/2026): positional sounds of a 3D scene go into the game's effects bus
// (src/client/audio.ts switches: effects on/off, volumes, ducking, the tutor's class mute).
// null until the shared context exists (created on the first tap).
export function gameSpatialAudio(): SpatialAudioOut | null {
  const context = audioContext();
  const output = bus('sfx');
  return context && output ? { context, output, enabled: effectsOn } : null;
}
