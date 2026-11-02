// Kayak Rush course (WP10 U3, 02/11/2026): where the obstacles are, shared by the 3D scene
// (KayakRush.tsx) and the minimap, plus how busy each 20 m section is (the minimap colours busy
// sections "focus and dodge" and clear ones "paddle fast"). Pure, seeded: same course everywhere.
// Obstacles sit beside the lanes; the race result never depends on them (server-authoritative race).

import { mulberry32 } from './variants';

export const KAYAK_COURSE_LENGTH = 110;
export const KAYAK_LANE = 1.7;
/** Buoy lines: the course is |x| ≤ this. */
export const KAYAK_HALF_WIDTH = 4.3;
export const KAYAK_SECTION_M = 20;

export type KayakObstacleKind = 'log' | 'ice' | 'monster' | 'barrier';
export interface KayakObstacle {
  kind: KayakObstacleKind;
  x: number;
  /** World z (the course runs from z = 0 towards z = −length). */
  z: number;
}

export function kayakObstacles(seed = 7): KayakObstacle[] {
  const r = mulberry32(seed);
  const out: KayakObstacle[] = [];
  for (let i = 0; i < 9; i++) {
    const z = -8 - i * 11 - r() * 3;
    const side = i % 2 ? 1 : -1;
    const kind = i % 3;
    if (kind === 0) out.push({ kind: 'log', x: side * 5.7, z });
    else if (kind === 1) out.push({ kind: 'ice', x: side * 5.4, z });
    else out.push({ kind: 'monster', x: side * 7.6, z });
    if (i % 4 === 1) out.push({ kind: 'barrier', x: -side * 5.6, z: z - 4 });
  }
  return out;
}

export type SectionLevel = 'clear' | 'some' | 'busy';
export interface KayakSection {
  /** Metres from the start. */
  from: number;
  to: number;
  count: number;
  level: SectionLevel;
}

/** Obstacles per 20 m section: 0 = clear (speed up), 1 = some, 2+ = busy (focus, dodge). Logs count double. */
export function kayakSections(obstacles: KayakObstacle[], length = KAYAK_COURSE_LENGTH, step = KAYAK_SECTION_M): KayakSection[] {
  const out: KayakSection[] = [];
  for (let from = 0; from < length; from += step) {
    const to = Math.min(length, from + step);
    const count = obstacles.filter((o) => -o.z >= from && -o.z < to).reduce((n, o) => n + (o.kind === 'log' ? 2 : 1), 0);
    out.push({ from, to, count, level: count === 0 ? 'clear' : count < 3 ? 'some' : 'busy' });
  }
  return out;
}

/** Compass bearing (degrees, 0 = north = −z, clockwise) from one point to another. */
export function bearingDeg(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const deg = (Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Signed difference a − b in degrees, in (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}
