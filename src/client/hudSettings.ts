'use client';

import { useSyncExternalStore } from 'react';

// In-game HUD settings (WP10 U1/U2, 02/11/2026): one small object in localStorage, applied at once.
// Reading never throws (private mode, blocked storage): the defaults are used and nothing is saved.

export interface HudSettings {
  /** 1..5, 3 = as rendered. CSS brightness on the scene. */
  brightness: 1 | 2 | 3 | 4 | 5;
  /** Which hand holds the movement control (left = default, as in the PDF). */
  moveHand: 'left' | 'right';
  /** Size of the movement pad and skill buttons. */
  buttonSize: 's' | 'm' | 'l';
  /** Opacity of the movement pad and skill buttons. */
  controlOpacity: 0.55 | 0.75 | 0.95;
  /** HUD text size. */
  fontScale: 0.9 | 1 | 1.15;
  /** Show the name under each toolbar button. */
  toolbarLabels: boolean;
}

export const HUD_DEFAULTS: HudSettings = { brightness: 3, moveHand: 'left', buttonSize: 'm', controlOpacity: 0.75, fontScale: 1, toolbarLabels: false };
export const BRIGHTNESS_FILTER: Record<HudSettings['brightness'], number> = { 1: 0.7, 2: 0.85, 3: 1, 4: 1.12, 5: 1.25 };
export const BUTTON_PX: Record<HudSettings['buttonSize'], number> = { s: 48, m: 58, l: 70 };

const KEY = 'tc:hud';
let current: HudSettings = HUD_DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load(): HudSettings {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) current = { ...HUD_DEFAULTS, ...(JSON.parse(raw) as Partial<HudSettings>) };
  } catch {
    /* defaults */
  }
  return current;
}

export function getHudSettings(): HudSettings {
  return typeof window === 'undefined' ? HUD_DEFAULTS : load();
}

export function setHudSettings(patch: Partial<HudSettings> | null) {
  current = patch === null ? HUD_DEFAULTS : { ...getHudSettings(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* not saved, still applied */
  }
  for (const l of listeners) l();
}

export function useHudSettings(): HudSettings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getHudSettings,
    () => HUD_DEFAULTS,
  );
}
