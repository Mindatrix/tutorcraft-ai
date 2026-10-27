// Scene direction shared by every game (plan C, groundwork for C4): avatar level of detail, and
// how the names used in content/consequences_v2.json ("effect", "camera") are played. Pure rules;
// the three.js side is src/components/modes/three/director.ts.

/** Avatar level of detail: full model (~20 k triangles), light model (~5 k), or name + colour only. */
export type LodLevel = 'near' | 'mid' | 'far';

export interface LodBudget {
  /** Full models (closest first). */
  near: number;
  /** Light models after those. */
  mid: number;
  /** Beyond this distance an avatar is name + colour only, whatever the counts. */
  maxDistance?: number;
}

/** A student's device draws only a few classmates in full (Dino Journey: the 8 nearest). */
export const STUDENT_LOD: LodBudget = { near: 6, mid: 10, maxDistance: 45 };
export const WEAK_STUDENT_LOD: LodBudget = { near: 3, mid: 6, maxDistance: 30 };
/** The tutor's shared screen shows the whole class. */
export const BOARD_LOD: LodBudget = { near: 14, mid: 24 };

/** Level per avatar from its distance to the camera (same order as `distances`). */
export function lodLevels(distances: number[], budget: LodBudget): LodLevel[] {
  const order = distances.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: LodLevel[] = new Array(distances.length).fill('far');
  order.forEach(([d, i], rank) => {
    if (budget.maxDistance !== undefined && d > budget.maxDistance) return;
    out[i] = rank < budget.near ? 'near' : rank < budget.near + budget.mid ? 'mid' : 'far';
  });
  return out;
}

// -------------------------------------------------------------------------------------------------
// Named effects and camera moves (keys of content/consequences_v2.json)

export type EffectKind = 'sparkle' | 'burst' | 'puff' | 'smoke' | 'splash' | 'bubbles' | 'fire' | 'glitch' | 'fireworks' | 'dust';

export interface EffectRecipe {
  kind: EffectKind;
  /** Main colour (hex). */
  color: number;
  /** 0.5 small … 2 big. */
  strength: number;
}

/** First match wins; checked in order. Every name used by the content must match one rule. */
const EFFECT_RULES: [RegExp, EffectRecipe][] = [
  [/firework|celebrat|victory|champion|medal|trophy/, { kind: 'fireworks', color: 0xffd166, strength: 1.4 }],
  [/glitch|warp|distort|static|shudder/, { kind: 'glitch', color: 0xc77dff, strength: 1 }],
  [/smoke|burnt|cough|ash/, { kind: 'smoke', color: 0x6b7280, strength: 1.2 }],
  [/fire_roars|fire_lit|blaze|ember|torch|spark/, { kind: 'fire', color: 0xffa94d, strength: 1.2 }],
  [/fire_out|fire_sputter|sputter|douse/, { kind: 'smoke', color: 0x9ca3af, strength: 0.8 }],
  [/freeze|frozen|ice/, { kind: 'puff', color: 0xa5d8ff, strength: 1 }],
  [/splash|flip|drift|wave|soak|wet|dunk|capsiz|rapids|spin_out/, { kind: 'splash', color: 0xd9f4ff, strength: 1.2 }],
  [/bubble|nibble|bite|fish/, { kind: 'bubbles', color: 0xe0f7ff, strength: 1 }],
  [/dust|stomp|herd|stampede|rock|slide|landslide|trip|stumble|fall|collapse|attack|pack/, { kind: 'dust', color: 0xc8b28a, strength: 1 }],
  [/snap|lose|fumble|rival|drop|slip|escape|lost|miss|wobble|wrong|fail|crash|stuck|cramp|cornered|ambush|break|broke|torn|rolls_away|deepen|flicker|slow/, { kind: 'puff', color: 0x9ca3af, strength: 1 }],
  [/portal|perfect|win|boost|nitro|open|clear|cleared|true|success|catch|caught|cooked|lit|roars|advance|rescue|fresh|safe|found|saved|climb|dodge|stable|reel_in|hold|firm|learned|glow|record/, { kind: 'burst', color: 0xffe066, strength: 1 }],
];

export function effectRecipe(name: string): EffectRecipe {
  const n = name.toLowerCase();
  for (const [re, r] of EFFECT_RULES) if (re.test(n)) return r;
  return { kind: 'sparkle', color: 0xffffff, strength: 1 };
}

/** Whether a name is covered by a specific rule (the default sparkle does not count). */
export function effectKnown(name: string): boolean {
  return EFFECT_RULES.some(([re]) => re.test(name.toLowerCase()));
}

export type CameraMoveKind = 'dolly' | 'shake' | 'warp' | 'follow' | 'pan' | 'dolly_through';

export interface CameraMove {
  kind: CameraMoveKind;
  /** zoom_X / dolly: the scene anchor named X ("grill", "map", "baby"…). */
  anchor?: string;
  /** shake strength 0..1, warp intensity, follow speed. */
  strength: number;
  /** Seconds there (0.4 in, hold, 0.4 back). */
  hold: number;
}

/** zoom_<anchor> · shake_small | shake_big · warp_distort · follow_<what> · pan_<what> · dolly_through. */
export function cameraMove(name: string): CameraMove | null {
  const n = name.toLowerCase().trim();
  if (n === 'shake_small') return { kind: 'shake', strength: 0.35, hold: 0.4 };
  if (n === 'shake_big') return { kind: 'shake', strength: 0.8, hold: 0.7 };
  if (n.startsWith('warp')) return { kind: 'warp', strength: 1, hold: 0.8 };
  if (n === 'dolly_through') return { kind: 'dolly_through', strength: 1, hold: 0.9 };
  let m = /^zoom_(\w+)$/.exec(n);
  if (m) return { kind: 'dolly', anchor: m[1], strength: 1, hold: 1 };
  m = /^follow_(\w+)$/.exec(n);
  if (m) return { kind: 'follow', anchor: m[1], strength: m[1] === 'boost' ? 1.6 : 1, hold: 1.2 };
  m = /^pan_(\w+)$/.exec(n);
  if (m) return { kind: 'pan', anchor: m[1], strength: 1, hold: 1.4 };
  return null;
}
