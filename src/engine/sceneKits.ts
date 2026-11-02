// Scene kits (WP4, 02/11/2026): groups of things that go together (a camp corner, a first-aid corner),
// with a fixed small layout, shown by level. Data: content/scene_kits.json. Placement: sceneBuilder.ts.
//  - A group appears in a stage when the stage lists one of its triggers; the stage's own things take
//    their place in the group instead of being scattered.
//  - Level decides how many companion items (minLevel) and how many background groups (levels.ambient).
//  - The whole group is placed and turned by the layout seed; inside, the layout stays fixed.
//  - Companions cost at most KIT_COMPANION_BUDGET per stage and never push a scene past SCENE_TRIS_CAP.

import { stemOf } from './assetCategory';

export interface KitMember {
  /** Matches the stage's asset (same family) and is drawn when `pick` is absent (family member by seed). */
  asset: string;
  /** Exactly these library ids (one by seed): keeps wrongly named family members out. */
  pick?: string[];
  x: number;
  z: number;
  /** Degrees, added to the group's turn. */
  rot?: number;
  /** Metres above the ground (on a table). */
  y?: number;
  /** Metres of `fit` (default: longest side). */
  size?: number;
  fit?: 'height' | 'max' | 'width';
  core?: boolean;
  minLevel?: number;
}

export interface KitGroup {
  id: string;
  title: string;
  trigger: string[];
  members: KitMember[];
  /** Metres kept free around the centre (default: farthest member + 1.5). */
  radius?: number;
}

export interface GameKit {
  groups: KitGroup[];
  /** Groups that may be added as background, in order of preference. */
  ambient?: string[];
}

export interface SceneKits {
  version: number;
  levels: Record<string, { ambient: number; tint: string }>;
  games: Record<string, GameKit>;
}

/** Companion triangles a stage may add (heaviest family member, like every placement). */
export const KIT_COMPANION_BUDGET = { high: 60_000, low: 20_000 } as const;
/** A scene (current stage + neighbours, world only) never goes past this (tests C1.5). */
export const SCENE_TRIS_CAP = { high: 1_300_000, low: 300_000 } as const;
export const MAX_LEVEL = 6;

export const clampLevel = (level: number | undefined) => Math.max(0, Math.min(MAX_LEVEL, Math.round(level ?? 0)));

/** Settings of a level (the nearest defined one at or below it). */
export function kitLevel(kits: SceneKits | undefined, level: number | undefined): { level: number; ambient: number; tint: string } {
  const l = clampLevel(level);
  for (let k = l; k >= 0; k--) {
    const v = kits?.levels[String(k)];
    if (v) return { level: l, ambient: v.ambient, tint: v.tint };
  }
  return { level: l, ambient: 0, tint: '#ffffff' };
}

export const sameFamily = (a: string, b: string) => a === b || stemOf(a) === stemOf(b);

/** Does this member stand for the stage asset `id`? */
export const memberMatches = (m: KitMember, id: string) => sameFamily(m.asset, id) || !!m.pick?.includes(id);

/** Groups the stage's own assets call for, in the kit's order. */
export function triggeredGroups(kit: GameKit | undefined, stageAssets: string[]): KitGroup[] {
  if (!kit) return [];
  return kit.groups.filter((g) => g.trigger.some((t) => stageAssets.some((a) => sameFamily(a, t))));
}

/** Background groups for a level: the first `count` ambient groups not already in the stage. */
export function ambientGroups(kit: GameKit | undefined, exclude: Set<string>, count: number, rand: () => number): KitGroup[] {
  if (!kit || count <= 0) return [];
  const pool = (kit.ambient ?? []).map((id) => kit.groups.find((g) => g.id === id)).filter((g): g is KitGroup => !!g && !exclude.has(g.id));
  const out: KitGroup[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/** A member is shown: the stage asked for it, it is core, or the level reached its minLevel. */
export const memberShown = (m: KitMember, level: number, own: boolean) => own || !!m.core || (m.minLevel ?? 0) <= level;

export function groupRadius(g: KitGroup): number {
  return g.radius ?? Math.max(...g.members.map((m) => Math.hypot(m.x, m.z))) + 1.5;
}

/** Every library id a game's kits may draw (preload list; explicit `pick` ids are exact, not families). */
export function kitAssetIds(kits: SceneKits | undefined, game: string): { family: string[]; exact: string[] } {
  const family = new Set<string>();
  const exact = new Set<string>();
  for (const g of kits?.games[game]?.groups ?? [])
    for (const m of g.members) {
      if (m.pick) for (const p of m.pick) exact.add(p);
      else family.add(m.asset);
    }
  return { family: [...family], exact: [...exact] };
}

/** Rotate a member offset by the group's turn (radians, same convention as Placement.rotY). */
export function rotateOffset(x: number, z: number, rot: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [x * c + z * s, -x * s + z * c];
}
