import type { BossAvatar } from './types';

// Animation profiles: the timing data the battle canvas plays back.
//
// Asset pipeline: a reference video (a game clip, a mocap render, a 3D/4D
// cutscene) is annotated in /tutor/animation-lab — you mark hitframes, screen
// shakes and camera zooms against the video timeline. Those raw keyframes are
// turned into a profile with `profileFromKeyframes`, exported as JSON and
// registered in ANIMATION_PROFILES. Nothing is inferred automatically from
// pixels; the data is human-tracked, then validated and clamped here.

export type CameraFocus = 'hero' | 'boss' | 'center';

export interface AttackTiming {
  /** Wind-up before the projectile leaves, ms. */
  windupMs: number;
  /** Projectile flight time, ms. */
  travelMs: number;
  /** Freeze-frame on impact ("hitstop"), ms. */
  hitstopMs: number;
}

export interface ShakeSpec {
  magnitude: number; // px
  durationMs: number;
}

export interface CameraSpec {
  zoom: number; // 1 = none
  durationMs: number;
  focus: CameraFocus;
}

export type KeyframeType = 'attack_start' | 'hitframe' | 'shake' | 'zoom';

/** One human-tracked mark on the reference video timeline. */
export interface Keyframe {
  t: number; // ms from clip start
  type: KeyframeType;
  /** shake: px, zoom: factor */
  value?: number;
  durationMs?: number;
  focus?: CameraFocus;
}

export interface AnimationProfile {
  id: string;
  name: string;
  source?: { video?: string; fps?: number; notes?: string };
  heroAttack: AttackTiming;
  bossAttack: AttackTiming;
  shake: { critical: ShakeSpec; playerHit: ShakeSpec; bossBreak: ShakeSpec };
  camera: { critical: CameraSpec; phase: CameraSpec; bossBreak: CameraSpec };
  keyframes?: Keyframe[];
}

export const DEFAULT_ANIMATION: AnimationProfile = {
  id: 'default',
  name: 'Mặc định',
  heroAttack: { windupMs: 150, travelMs: 320, hitstopMs: 60 },
  bossAttack: { windupMs: 200, travelMs: 380, hitstopMs: 70 },
  shake: {
    critical: { magnitude: 5, durationMs: 220 },
    playerHit: { magnitude: 12, durationMs: 380 },
    bossBreak: { magnitude: 10, durationMs: 400 },
  },
  camera: {
    critical: { zoom: 1.08, durationMs: 420, focus: 'boss' },
    phase: { zoom: 1.15, durationMs: 1200, focus: 'boss' },
    bossBreak: { zoom: 1.12, durationMs: 1400, focus: 'boss' },
  },
};

/** Built-in profiles per boss type — heavier bosses wind up slower and hit harder. */
export const ANIMATION_PROFILES: Record<BossAvatar, AnimationProfile> = {
  dragon: {
    ...DEFAULT_ANIMATION,
    id: 'dragon',
    name: 'Rồng — đòn nặng',
    bossAttack: { windupMs: 320, travelMs: 420, hitstopMs: 110 },
    shake: { ...DEFAULT_ANIMATION.shake, playerHit: { magnitude: 16, durationMs: 460 } },
  },
  golem: {
    ...DEFAULT_ANIMATION,
    id: 'golem',
    name: 'Người Đá — chậm, rung mạnh',
    bossAttack: { windupMs: 420, travelMs: 360, hitstopMs: 140 },
    shake: { ...DEFAULT_ANIMATION.shake, playerHit: { magnitude: 18, durationMs: 520 }, bossBreak: { magnitude: 16, durationMs: 600 } },
  },
  wizard: {
    ...DEFAULT_ANIMATION,
    id: 'wizard',
    name: 'Phù Thủy — nhanh',
    bossAttack: { windupMs: 120, travelMs: 300, hitstopMs: 40 },
    shake: { ...DEFAULT_ANIMATION.shake, playerHit: { magnitude: 8, durationMs: 300 } },
  },
  shadow_king: {
    ...DEFAULT_ANIMATION,
    id: 'shadow_king',
    name: 'Vua Bóng Tối — camera kịch tính',
    camera: {
      critical: { zoom: 1.1, durationMs: 500, focus: 'boss' },
      phase: { zoom: 1.22, durationMs: 1500, focus: 'boss' },
      bossBreak: { zoom: 1.18, durationMs: 1600, focus: 'boss' },
    },
  },
};

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function timing(raw: unknown, fb: AttackTiming): AttackTiming {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    windupMs: clamp(r.windupMs, 0, 1500, fb.windupMs),
    travelMs: clamp(r.travelMs, 80, 1500, fb.travelMs),
    hitstopMs: clamp(r.hitstopMs, 0, 400, fb.hitstopMs),
  };
}
function shake(raw: unknown, fb: ShakeSpec): ShakeSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { magnitude: clamp(r.magnitude, 0, 30, fb.magnitude), durationMs: clamp(r.durationMs, 0, 2000, fb.durationMs) };
}
function camera(raw: unknown, fb: CameraSpec): CameraSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const focus = r.focus === 'hero' || r.focus === 'boss' || r.focus === 'center' ? r.focus : fb.focus;
  return { zoom: clamp(r.zoom, 1, 1.6, fb.zoom), durationMs: clamp(r.durationMs, 0, 4000, fb.durationMs), focus };
}

/** Validate untrusted profile JSON (e.g. pasted from the lab), clamping every number. */
export function validateAnimationProfile(raw: unknown, fallback: AnimationProfile = DEFAULT_ANIMATION): AnimationProfile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const sh = (r.shake ?? {}) as Record<string, unknown>;
  const cam = (r.camera ?? {}) as Record<string, unknown>;
  const src = (r.source ?? {}) as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(r.id) ? r.id : fallback.id;
  return {
    id,
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : fallback.name,
    source: {
      video: typeof src.video === 'string' ? src.video.slice(0, 200) : undefined,
      fps: src.fps ? clamp(src.fps, 1, 240, 30) : undefined,
      notes: typeof src.notes === 'string' ? src.notes.slice(0, 300) : undefined,
    },
    heroAttack: timing(r.heroAttack, fallback.heroAttack),
    bossAttack: timing(r.bossAttack, fallback.bossAttack),
    shake: {
      critical: shake(sh.critical, fallback.shake.critical),
      playerHit: shake(sh.playerHit, fallback.shake.playerHit),
      bossBreak: shake(sh.bossBreak, fallback.shake.bossBreak),
    },
    camera: {
      critical: camera(cam.critical, fallback.camera.critical),
      phase: camera(cam.phase, fallback.camera.phase),
      bossBreak: camera(cam.bossBreak, fallback.camera.bossBreak),
    },
    keyframes: Array.isArray(r.keyframes) ? sanitizeKeyframes(r.keyframes) : undefined,
  };
}

export function sanitizeKeyframes(raw: unknown[]): Keyframe[] {
  const types: KeyframeType[] = ['attack_start', 'hitframe', 'shake', 'zoom'];
  return raw
    .map((k) => (k ?? {}) as Record<string, unknown>)
    .filter((k) => types.includes(k.type as KeyframeType) && Number.isFinite(Number(k.t)))
    .slice(0, 500)
    .map((k) => ({
      t: clamp(k.t, 0, 600_000, 0),
      type: k.type as KeyframeType,
      value: k.value == null ? undefined : Number(k.value),
      durationMs: k.durationMs == null ? undefined : clamp(k.durationMs, 0, 4000, 300),
      focus: k.focus === 'hero' || k.focus === 'boss' || k.focus === 'center' ? (k.focus as CameraFocus) : undefined,
    }))
    .sort((a, b) => a.t - b.t);
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Turn tracked keyframes into a profile. Each `attack_start` is paired with the
 * next `hitframe`: that gap is the attack's wind-up + travel (split 40/60, the
 * usual anticipation/action ratio). Shake and zoom marks set magnitudes.
 */
export function profileFromKeyframes(keyframes: Keyframe[], meta: { id: string; name: string; video?: string; fps?: number }, base: AnimationProfile = DEFAULT_ANIMATION): AnimationProfile {
  const ks = sanitizeKeyframes(keyframes);
  const gaps: number[] = [];
  for (let i = 0; i < ks.length; i++) {
    if (ks[i].type !== 'attack_start') continue;
    const hit = ks.slice(i + 1).find((k) => k.type === 'hitframe' || k.type === 'attack_start');
    if (hit?.type === 'hitframe') gaps.push(hit.t - ks[i].t);
  }
  const gap = median(gaps);
  const shakes = ks.filter((k) => k.type === 'shake' && k.value);
  const zooms = ks.filter((k) => k.type === 'zoom' && k.value);
  const shakeMag = median(shakes.map((k) => k.value!));
  const shakeDur = median(shakes.map((k) => k.durationMs ?? 350));
  const zoom = median(zooms.map((k) => k.value!));
  const zoomDur = median(zooms.map((k) => k.durationMs ?? 600));

  const attack: AttackTiming = gap
    ? { windupMs: Math.round(gap * 0.4), travelMs: Math.max(80, Math.round(gap * 0.6)), hitstopMs: base.bossAttack.hitstopMs }
    : base.bossAttack;

  return validateAnimationProfile(
    {
      ...base,
      id: meta.id,
      name: meta.name,
      source: { video: meta.video, fps: meta.fps, notes: `${ks.length} keyframes tracked` },
      bossAttack: attack,
      heroAttack: gap ? { ...attack, windupMs: Math.round(attack.windupMs * 0.6) } : base.heroAttack,
      shake: {
        ...base.shake,
        playerHit: shakeMag ? { magnitude: shakeMag, durationMs: shakeDur ?? 350 } : base.shake.playerHit,
      },
      camera: {
        ...base.camera,
        critical: zoom ? { zoom, durationMs: zoomDur ?? 600, focus: zooms[0].focus ?? 'boss' } : base.camera.critical,
      },
      keyframes: ks,
    },
    base,
  );
}

export function animationFor(avatar: BossAvatar | undefined): AnimationProfile {
  return (avatar && ANIMATION_PROFILES[avatar]) || DEFAULT_ANIMATION;
}
