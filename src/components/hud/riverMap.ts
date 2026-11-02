'use client';

import { bearingDeg } from '../../engine/kayakCourse';
import type { Placement, SceneLayout } from '../../engine/sceneBuilder';
import type { CoordMark, CoordState, DrawMap } from './MapHud';

// River / meadow worlds (Summer Camp, River Fishing, River Survival, Dino Journey) — WP10 U3.
// A round north-up minimap around me, drawn from the scene layout (the same data the 3D scene is
// built from, no second camera): water or path, banks, the stage's things, trees, buildings, classmates
// (their colour), me as an arrow turned to where the camera looks. The compass shows the classmates
// nearest to me with the way each one faces.

export interface Mate {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Compass bearing they face. */
  facing: number;
  color: string;
}

export interface RiverLive {
  layout: SceneLayout | null;
  me: { x: number; z: number };
  /** Where the camera looks (compass bearing). */
  heading: number;
  mates: Mate[];
}

export const emptyRiverLive = (): RiverLive => ({ layout: null, me: { x: 0, z: 0 }, heading: 0, mates: [] });

const RADIUS_M = 38;

function dotFor(p: Placement): [string, number] | null {
  switch (p.category) {
    case 'structure':
      return ['#a16207', 3.2];
    case 'prop':
      return p.focal ? ['#fbbf24', 2.4] : null;
    case 'tree':
      return ['#166534', 2.6];
    case 'rock':
      return ['#9ca3af', 1.6];
    case 'creature':
      return ['#f472b6', 2.6];
    default:
      return null;
  }
}

export const drawRiverMap: DrawMap<RiverLive> = (ctx, w, h, s) => {
  const r = Math.min(w, h) / 2;
  const k = (r - 2) / RADIUS_M;
  const px = (x: number) => w / 2 + (x - s.me.x) * k;
  const pz = (z: number) => h / 2 + (z - s.me.z) * k; // north (−z) is up
  ctx.save();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, r - 1, 0, Math.PI * 2);
  ctx.clip();
  const world = s.layout?.world;
  ctx.fillStyle = world?.kind === 'meadow' ? 'rgb(101 135 60 / 0.8)' : 'rgb(63 120 70 / 0.8)';
  ctx.fillRect(0, 0, w, h);
  if (world) {
    const half = world.waterHalf;
    ctx.fillStyle = world.kind === 'meadow' ? 'rgb(164 126 82 / 0.9)' : 'rgb(14 116 144 / 0.9)';
    ctx.fillRect(px(-half), 0, px(half) - px(-half), h);
  }
  for (const p of s.layout?.placements ?? []) {
    if (Math.abs(p.x - s.me.x) > RADIUS_M || Math.abs(p.z - s.me.z) > RADIUS_M) continue;
    const d = dotFor(p);
    if (!d) continue;
    ctx.fillStyle = d[0];
    if (p.category === 'structure') ctx.fillRect(px(p.x) - d[1], pz(p.z) - d[1], d[1] * 2, d[1] * 2);
    else {
      ctx.beginPath();
      ctx.arc(px(p.x), pz(p.z), d[1], 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgb(8 12 26 / 0.9)';
  for (const m of s.mates) {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(px(m.x), pz(m.z), 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Me: an arrow turned to where the camera looks, with a soft view cone.
  const a = (s.heading * Math.PI) / 180;
  ctx.translate(w / 2, h / 2);
  ctx.rotate(a);
  ctx.fillStyle = 'rgb(94 234 212 / 0.18)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r * 0.7, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5eead4';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2.5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // North marker on the rim.
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('B', w / 2, 11);
};

/** Compass: my facing, and the 6 nearest classmates with where they look. */
export function riverCoord(s: RiverLive): CoordState {
  const near = [...s.mates].sort((a, b) => Math.hypot(a.x - s.me.x, a.z - s.me.z) - Math.hypot(b.x - s.me.x, b.z - s.me.z)).slice(0, 6);
  const marks: CoordMark[] = near.map((m) => ({ id: m.id, bearing: bearingDeg(s.me.x, s.me.z, m.x, m.z), color: m.color, label: m.name, facing: m.facing }));
  return { heading: s.heading, x: s.me.x, z: s.me.z, marks };
}
