'use client';

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { lib, withQuality, type AssetQuality } from '../../../config/assetLibrary';
import type { LodLevel } from '../../../engine';
import { cycleHits } from '../../../engine/audioPlan';
import { loadGltf } from './assetLoader';

// Student avatars and story characters (plan C2.2 / C2.3).
//  - Colour by material, not by model: every copy of a model shares its geometry (SkeletonUtils /
//    Object3D.clone keep the buffers); one tinted material per (source material, colour) is cached,
//    and all tinted materials share ONE shader program. 50 avatars on 6 templates ≈ 6 geometries.
//  - Six states: idle, run, happy, sad, correct, wrong. Rigged models play their own clips when one
//    fits (Running, Big_Wave_Hello, dances, Finger_Wag_No…); everything else, and all the unrigged
//    models (dinosaurs, critters, static scans), moves by code: bob, bounce, hop, slump, jump, shake.

export type AvatarState = 'idle' | 'run' | 'happy' | 'sad' | 'correct' | 'wrong';
export const AVATAR_STATES: AvatarState[] = ['idle', 'run', 'happy', 'sad', 'correct', 'wrong'];

/** Clip name patterns per state (first match wins). Clips seen in the library, 27/10. */
const CLIP_RULES: Record<AvatarState, RegExp[]> = {
  // A standing idle only: not "Bar_Hang_Idle" (arms up) or "Idle_Step_Turn_Left" (walks away).
  idle: [/^idle(_\d+)?$/i, /^(?!.*(hang|step|turn|jump|walk)).*idle/i],
  run: [/^run/i, /running/i, /walk/i],
  happy: [/wave|hello/i, /joyful|dance|groove|shuffle|pop/i, /bow/i],
  sad: [/sad|defeat|cry/i],
  correct: [/backflip|leap|power_spin|spin_jump/i, /wave|hello/i, /dance/i],
  wrong: [/finger_wag|wag|no$/i, /step_back|alert/i],
};
/** Temporary states fall back to idle after this long (s). */
const HOLD: Partial<Record<AvatarState, number>> = { happy: 2.4, correct: 1.6, wrong: 1.4 };

/**
 * Bounding box of a (possibly rigged) model in its rest pose. A fresh SkeletonUtils clone has stale
 * bone matrices, so measuring right away gave either 155 or 1.67 for the same cm-unit rig
 * (char_sunny_boy, 27/10) and some copies came out 100× too big. Update the bones, then measure
 * the skinned vertices.
 */
export function restBox(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.update();
  });
  return new THREE.Box3().setFromObject(model, true);
}

const tintCache = new Map<string, THREE.Material>();
let tintedCount = 0;

/** A copy of `src` multiplied toward `hex` (shares one program with every other tinted material). */
function tinted(src: THREE.Material, hex: string, mix: number): THREE.Material {
  const key = `${src.uuid}|${hex}|${mix}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const m = src.clone();
  const uTint = { value: new THREE.Color(hex) };
  const uMix = { value: mix };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = uTint;
    shader.uniforms.uTintMix = uMix;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uTintMix;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTint * 1.55, uTintMix);');
  };
  m.customProgramCacheKey = () => 'tc-tint';
  tintCache.set(key, m);
  tintedCount += 1;
  return m;
}

const ringGeo = new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2);
const ringMats = new Map<string, THREE.MeshBasicMaterial>();
function ringMaterial(hex: string) {
  let m = ringMats.get(hex);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false });
    ringMats.set(hex, m);
  }
  return m;
}

export interface AvatarSpec {
  /** Library model id (content/asset_catalog.json). */
  model: string;
  /** Colour (hex): tint + ring under the feet. */
  color?: string | null;
  /** 0..1 how strongly the colour tints the model (students 0.55, story characters 0.3). */
  tintMix?: number;
  /** Target height in metres. */
  height?: number;
  /** high ~20 k, low ~10 k, mid ~5 k triangles (mid exists for characters and dinosaurs). */
  quality?: AssetQuality;
  /** Show the coloured ring under the feet. */
  ring?: boolean;
}

export class Avatar {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  state: AvatarState = 'idle';
  readonly rigged: boolean;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<AvatarState, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private since = 0;
  private clock = 0;
  private phase = Math.random() * 10;
  private baseY = 0;
  /** Called at each foot contact while running (WP2: footstep sound). Set it on the player only. */
  onStep: (() => void) | null = null;
  private stepPhase = 0;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], spec: AvatarSpec) {
    this.root.add(this.body);
    this.body.add(model);
    const box = restBox(model);
    const h = box.max.y - box.min.y || 1;
    const s = (spec.height ?? 1.6) / h;
    model.scale.setScalar(s);
    model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    let skinned: THREE.SkinnedMesh | null = null;
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as THREE.SkinnedMesh;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
    });
    // A rig exported without its 0.01 armature scale (hips metres above a 1.3 m body) looks right
    // standing still but plays every clip 100× too big. Such a model moves by code instead;
    // validate-glb.py flags the file so the content side can re-export it.
    let rigOk = true;
    const sk = skinned as THREE.SkinnedMesh | null;
    if (sk?.skeleton.bones.length) {
      model.updateMatrixWorld(true);
      const hipsY = Math.abs(sk.skeleton.bones[0].getWorldPosition(new THREE.Vector3()).y);
      rigOk = hipsY <= h * 3;
      if (!rigOk) console.warn(`[avatar] ${spec.model}: xương sai tỉ lệ (hông ở ${hipsY.toFixed(1)}, thân cao ${h.toFixed(2)}): tắt clip, dùng chuyển động bằng code`);
    }
    // No idle clip (char_tpose_boy, char_grass_kid, char_iridescent_voyager): the rest pose is the
    // T-pose it was rigged in. Lower the arms before the mixer saves the pose it blends back to.
    if (sk && rigOk && !clips.some((c) => CLIP_RULES.idle.some((re) => re.test(c.name)))) relaxArms(model);
    this.rigged = !!sk && clips.length > 0 && rigOk;
    if (this.rigged) {
      this.mixer = new THREE.AnimationMixer(model);
      for (const st of AVATAR_STATES) {
        const clip = pickClip(clips, st);
        if (clip) this.actions.set(st, this.mixer.clipAction(clip));
      }
    }
    if (spec.ring !== false && spec.color) {
      const ring = new THREE.Mesh(ringGeo, ringMaterial(spec.color));
      ring.position.y = 0.015;
      ring.renderOrder = 1;
      this.root.add(ring);
    }
    this.setState('idle');
  }

  /** States this avatar can show (clip or code). Always all six. */
  get states(): AvatarState[] {
    return AVATAR_STATES;
  }

  /** Which states play a real animation clip (the rest move by code). */
  get clipStates(): AvatarState[] {
    return [...this.actions.keys()];
  }

  setState(next: AvatarState) {
    if (next === 'run' && this.state !== 'run') this.stepPhase = 0;
    this.state = next;
    this.since = this.clock;
    const action = this.actions.get(next) ?? (next === 'idle' ? null : null);
    if (this.mixer) {
      const to = action ?? this.actions.get('idle') ?? null;
      if (to !== this.current) {
        if (to) {
          to.reset();
          to.setLoop(HOLD[next] ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
          to.clampWhenFinished = true;
          to.fadeIn(0.2).play();
        }
        this.current?.fadeOut(0.2);
        this.current = to;
      }
    }
  }

  update(dt: number) {
    this.clock += dt;
    const t = this.clock + this.phase;
    const age = this.clock - this.since;
    const hold = HOLD[this.state];
    if (hold && age > hold) this.setState('idle');
    this.mixer?.update(dt);
    if (this.state === 'run' && this.onStep) {
      // A run clip touches the ground at 0 and ½ of its cycle (Mixamo cycles start on a contact);
      // the code-driven bob |sin 9t| lands every π/9 s, i.e. a cycle of 2π/9 s.
      const run = this.actions.get('run');
      const rate = run ? run.getEffectiveTimeScale() / Math.max(0.1, run.getClip().duration) : 9 / (2 * Math.PI);
      const prev = this.stepPhase;
      this.stepPhase += dt * rate;
      for (let i = cycleHits(prev, this.stepPhase); i > 0; i--) this.onStep();
    }
    // Code-driven motion on top (the only motion for unrigged models).
    const b = this.body;
    const clip = this.actions.has(this.state);
    b.position.set(0, this.baseY, 0);
    b.rotation.set(0, b.rotation.y, 0);
    b.scale.set(1, 1, 1);
    switch (this.state) {
      case 'idle':
        if (!clip) {
          b.position.y += Math.sin(t * 2.2) * 0.025;
          b.rotation.z = Math.sin(t * 1.3) * 0.03;
        }
        break;
      case 'run':
        if (!clip) b.position.y += Math.abs(Math.sin(t * 9)) * 0.14;
        b.rotation.x = clip ? 0 : 0.14;
        break;
      case 'happy':
        if (!clip) {
          b.position.y += Math.abs(Math.sin(t * 6)) * 0.3;
          b.rotation.y += dt * 3;
        }
        break;
      case 'sad':
        b.rotation.x = 0.22;
        b.scale.set(1, 0.95, 1);
        b.rotation.z = Math.sin(t * 0.8) * 0.05;
        break;
      case 'correct': {
        const k = Math.min(1, age / 0.7);
        b.position.y += Math.sin(k * Math.PI) * (clip ? 0.15 : 0.7);
        if (!clip) b.rotation.y = this.spinFrom + k * Math.PI * 2;
        break;
      }
      case 'wrong':
        b.rotation.z = Math.sin(age * 28) * 0.16 * Math.max(0, 1 - age / (HOLD.wrong ?? 1.4));
        break;
    }
    if (this.state !== 'correct') this.spinFrom = b.rotation.y;
  }
  private spinFrom = 0;

  dispose() {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}

/**
 * Stand a T- or A-posed rig at ease: each upper arm is turned (in world space) to point down and
 * slightly out, so the forearm and hand follow. Arms already pointing down are left alone.
 * Works for Mixamo names ("mixamorigLeftArm") and plain ones ("LeftArm").
 */
export function relaxArms(model: THREE.Object3D): number {
  model.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  let moved = 0;
  for (const side of ['Left', 'Right']) {
    const arm = bones.find((b) => new RegExp(`${side}Arm$`).test(b.name));
    const fore = bones.find((b) => new RegExp(`${side}ForeArm$`).test(b.name));
    if (!arm || !fore || !arm.parent) continue;
    const a = arm.getWorldPosition(new THREE.Vector3());
    const dir = fore.getWorldPosition(new THREE.Vector3()).sub(a).normalize();
    if (dir.y < -0.8) continue;
    const out = new THREE.Vector3(dir.x, 0, dir.z);
    if (out.lengthSq() < 1e-6) continue;
    out.normalize();
    const target = new THREE.Vector3(0, -Math.cos(0.22), 0).addScaledVector(out, Math.sin(0.22)).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(dir, target);
    const world = arm.getWorldQuaternion(new THREE.Quaternion());
    const parent = arm.parent.getWorldQuaternion(new THREE.Quaternion());
    arm.quaternion.copy(parent.invert().multiply(delta.multiply(world)));
    arm.updateMatrixWorld(true);
    moved++;
  }
  return moved;
}

function pickClip(clips: THREE.AnimationClip[], state: AvatarState): THREE.AnimationClip | null {
  for (const re of CLIP_RULES[state]) {
    const c = clips.find((x) => re.test(x.name));
    if (c) return c;
  }
  return null;
}

/** Load (once per session) and copy a library model as an avatar with its colour. */
export async function createAvatar(spec: AvatarSpec): Promise<Avatar> {
  const url = withQuality(lib(spec.model), spec.quality ?? 'high');
  const gltf = await loadGltf(url);
  const copy = cloneSkinned(gltf.scene) as THREE.Object3D;
  if (spec.color) {
    const mix = spec.tintMix ?? 0.55;
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map((x) => tinted(x, spec.color!, mix)) : tinted(m.material, spec.color!, mix);
    });
  }
  return new Avatar(copy, gltf.animations ?? [], spec);
}

/** For the scene lab / tests: how many tinted materials exist (one per source material × colour). */
export function avatarMaterialCount(): number {
  return tintedCount;
}

/**
 * One student with three levels of detail (plan C2): 'near' = full model (~20 k triangles on the
 * high tier, ~10 k on low), 'mid' = the ~5 k triangle file, 'far' = no model (the scene shows the
 * name and colour only). Models load on first need and are kept, so walking back and forth does
 * not reload; while the near model loads, the mid one stands in.
 */
export class LodAvatar {
  readonly root = new THREE.Group();
  level: LodLevel = 'far';
  state: AvatarState = 'idle';
  private models: Partial<Record<'near' | 'mid', Avatar>> = {};
  private loading = new Set<'near' | 'mid'>();
  private disposed = false;
  /** Footstep callback, passed to whichever model is shown (WP2). */
  onStep: (() => void) | null = null;
  private stepPhase = 0;

  constructor(private spec: AvatarSpec & { nearQuality?: 'high' | 'low' }) {}

  setLevel(level: LodLevel) {
    this.level = level;
    if (level === 'near') {
      this.ensure('near');
      this.ensure('mid');
    } else if (level === 'mid') this.ensure('mid');
    this.sync();
  }

  /** The model actually shown (null when far or still loading). */
  get shown(): Avatar | null {
    if (this.level === 'near') return this.models.near ?? this.models.mid ?? null;
    if (this.level === 'mid') return this.models.mid ?? null;
    return null;
  }

  private sync() {
    const shown = this.shown;
    for (const m of Object.values(this.models)) if (m) m.root.visible = m === shown;
  }

  private ensure(which: 'near' | 'mid') {
    if (this.models[which] || this.loading.has(which)) return;
    this.loading.add(which);
    void createAvatar({ ...this.spec, quality: which === 'mid' ? 'mid' : this.spec.nearQuality ?? 'high' })
      .then((a) => {
        if (this.disposed) return a.dispose();
        this.models[which] = a;
        a.setState(this.state);
        this.root.add(a.root);
        this.sync();
      })
      .catch(() => undefined)
      .finally(() => this.loading.delete(which));
  }

  setState(s: AvatarState) {
    if (s === 'run' && this.state !== 'run') this.stepPhase = 0;
    this.state = s;
    for (const m of Object.values(this.models)) m?.setState(s);
  }

  update(dt: number) {
    const shown = this.shown;
    if (shown) {
      shown.onStep = this.onStep;
      shown.update(dt);
      return;
    }
    // Far or still loading: the steps keep the code-driven rhythm, so the sound does not stop.
    if (this.state !== 'run' || !this.onStep) return;
    const prev = this.stepPhase;
    this.stepPhase += (dt * 9) / (2 * Math.PI);
    for (let i = cycleHits(prev, this.stepPhase); i > 0; i--) this.onStep();
  }

  dispose() {
    this.disposed = true;
    for (const m of Object.values(this.models)) m?.dispose();
    this.root.removeFromParent();
  }
}

// ============================================================================
// A2 — Physics Character Locomotion Avatar (`idle | walk | run | jump | fall`)
// Matches Rapier capsule height = 1.5 m (radius = 0.3 m, halfHeight = 0.45 m),
// feet planted at local y = 0 (`pos.y`), smooth 0.15–0.25 s cross-fades,
// and nearest-clip fallback when a GLB is missing a locomotion clip.
// ============================================================================

export type PhysicsClip = 'idle' | 'walk' | 'run' | 'jump' | 'fall';
export const PHYSICS_CLIPS: readonly PhysicsClip[] = ['idle', 'walk', 'run', 'jump', 'fall'];

export const PHYSICS_CAPSULE_RADIUS = 0.3;
export const PHYSICS_CAPSULE_HALF_HEIGHT = 0.45;
export const PHYSICS_CAPSULE_HEIGHT = 2 * (PHYSICS_CAPSULE_HALF_HEIGHT + PHYSICS_CAPSULE_RADIUS); // 1.5 m
export const PHYSICS_CROSSFADE_SEC = 0.18; // Within [0.15, 0.25] s contract

export const PHYSICS_CLIP_RULES: Record<PhysicsClip, RegExp[]> = {
  // Standing idle only (exclude Bar_Hang_Idle and Idle_Step_Turn_Left which translate/hang)
  idle: [/^idle(_\d+)?$/i, /^alert$/i, /^(?!.*(hang|step|turn|jump|walk)).*idle/i],
  walk: [/^walking(_woman)?$/i, /^casual_walk$/i, /^unsteady_walk$/i, /walk/i],
  run: [/^running$/i, /^run(_\d+|fast)?$/i, /^run/i],
  jump: [/_360_power_spin_jump/i, /backflip/i, /^jump/i, /leap_of_faith/i, /skill_01/i],
  fall: [/leap_of_faith/i, /behit_flyup/i, /^fall/i, /air_squat/i],
};

export interface ResolvedPhysicsClipBinding {
  targetState: PhysicsClip;
  clip: THREE.AnimationClip;
  sourceClipName: string;
  timeScale: number;
  isFallback: boolean;
}

export interface PhysicsClipResolution {
  directClips: Partial<Record<PhysicsClip, THREE.AnimationClip>>;
  bindings: Partial<Record<PhysicsClip, ResolvedPhysicsClipBinding>>;
  missingClips: PhysicsClip[];
}

/**
 * Audit of rigged character GLBs in `3D_tutorcraft` / `content/asset_catalog.json` / `content/character_casting.json`.
 * Lists the exact embedded animation clip names and which of the 5 physics locomotion clips (`idle | walk | run | jump | fall`)
 * are missing in each asset (and therefore use nearest-clip + procedural fallback).
 */
export const RIGGED_CHARACTER_CLIP_CATALOG: Record<
  string,
  {
    file: string;
    availableClips: readonly string[];
    missingPhysicsClips: readonly PhysicsClip[];
  }
> = {
  char_kid_dancer: {
    file: 'characters/char_kid_dancer.glb',
    availableClips: [
      'Running',
      'Walking',
      '_360_Power_Spin_Jump',
      'Bar_Hang_Idle',
      'Breakdance_1990',
      'Idle_Step_Turn_Left',
      'Large_step_then_high_kick',
      'Leap_of_Faith',
      'Quick_Step_and_Spin_Dodge',
      'Step_Back',
      'Step_Forward_and_Push',
      'Step_Hip_Hop_Dance',
      'Step_Right_for_Exercise',
      'Step_Step_Turn_Kick',
      'air_squat',
      'bicycle_crunch',
    ],
    // Has Walking (walk), Running (run), _360_Power_Spin_Jump (jump), Leap_of_Faith (fall); lacks standing-still Idle
    missingPhysicsClips: ['idle'],
  },
  char_gamer_boy: {
    file: 'characters/char_gamer_boy.glb',
    availableClips: ['Alert', 'Boom_Dance', 'Casual_Walk', 'Run_03', 'Running', 'Skill_01', 'Walking'],
    // Has Alert (idle), Walking (walk), Running (run), Skill_01 (jump); lacks dedicated fall clip
    missingPhysicsClips: ['fall'],
  },
  char_generic_female_2: {
    file: 'characters/char_generic_female_2.glb',
    availableClips: [
      'Running',
      'Walking',
      'FunnyDancing_03',
      'Gentlemans_Bow',
      'Idle_11',
      'Joyful_Dance_with_Hand_Sway',
    ],
    // Has Idle_11 (idle), Walking (walk), Running (run); lacks jump and fall
    missingPhysicsClips: ['jump', 'fall'],
  },
  char_sunny_boy: {
    file: 'characters/char_sunny_boy.glb',
    availableClips: ['_360_Power_Spin_Jump', 'Running', 'Walking'],
    // Has Walking (walk), Running (run), _360_Power_Spin_Jump (jump); lacks standing idle and fall
    missingPhysicsClips: ['idle', 'fall'],
  },
  char_tpose_boy: {
    file: 'characters/char_tpose_boy.glb',
    availableClips: [
      'Running',
      'Walking',
      '_360_Power_Spin_Jump',
      'Backflip',
      'Big_Wave_Hello',
      'Collect_Object',
      'Finger_Wag_No',
    ],
    missingPhysicsClips: ['idle', 'fall'],
  },
  char_grass_kid: {
    file: 'characters/char_grass_kid.glb',
    availableClips: [
      'All_Night_Dance',
      'Arm_Circle_Shuffle',
      'Big_Wave_Hello',
      'Love_You_Pop_Dance',
      'Magic_Genie',
      'Not_Your_Mom',
      'OMG_Groove',
      'Pop_Dance_LSA2',
      'Running',
      'Triple_Combo_Attack',
      'Walking',
    ],
    missingPhysicsClips: ['idle', 'jump', 'fall'],
  },
  char_grovaen_female: {
    file: 'characters/char_grovaen_female.glb',
    availableClips: ['Running', 'Walking'],
    missingPhysicsClips: ['idle', 'jump', 'fall'],
  },
  char_iridescent_voyager: {
    file: 'characters/char_iridescent_voyager.glb',
    availableClips: ['Running', 'Walking'],
    missingPhysicsClips: ['idle', 'jump', 'fall'],
  },
  mv_hero_scarlet: {
    file: 'multiverse/mv_hero_scarlet.glb',
    availableClips: [
      'Running',
      'Walking',
      'Idle_Step_Turn_Left',
      'Large_step_then_high_kick',
      'Quick_Step_and_Spin_Dodge',
      'Step_Back',
      'Step_Step_Turn_Kick',
    ],
    missingPhysicsClips: ['idle', 'jump', 'fall'],
  },
  mv_minion_shadow: {
    file: 'multiverse/mv_minion_shadow.glb',
    availableClips: ['Running', 'Walking', 'Alert', 'Casual_Walk', 'Run_03'],
    missingPhysicsClips: ['jump', 'fall'],
  },
  mv_boss: {
    file: 'multiverse/mv_boss.glb',
    availableClips: ['Running', 'Walking'],
    missingPhysicsClips: ['idle', 'jump', 'fall'],
  },
};

function pickDirectPhysicsClip(
  clips: THREE.AnimationClip[],
  state: PhysicsClip,
): THREE.AnimationClip | null {
  for (const re of PHYSICS_CLIP_RULES[state]) {
    const found = clips.find((c) => re.test(c.name));
    if (found) return found;
  }
  return null;
}

/**
 * Maps an array of GLTF `AnimationClip`s onto all 5 physics locomotion states (`idle | walk | run | jump | fall`).
 * When a state has no direct clip in the GLB, assigns the nearest available clip with an adjusted `timeScale`
 * and records the state in `missingClips`.
 */
export function resolvePhysicsClipMap(clips: THREE.AnimationClip[]): PhysicsClipResolution {
  const directClips: Partial<Record<PhysicsClip, THREE.AnimationClip>> = {};
  const missingClips: PhysicsClip[] = [];

  for (const state of PHYSICS_CLIPS) {
    const direct = pickDirectPhysicsClip(clips, state);
    if (direct) {
      directClips[state] = direct;
    } else {
      missingClips.push(state);
    }
  }

  const bindings: Partial<Record<PhysicsClip, ResolvedPhysicsClipBinding>> = {};
  const fallbackOrder: Record<PhysicsClip, { order: PhysicsClip[]; scale: number }> = {
    idle: { order: ['walk', 'run'], scale: 0.2 },
    walk: { order: ['run', 'idle'], scale: 0.62 },
    run: { order: ['walk', 'idle'], scale: 1.45 },
    jump: { order: ['fall', 'run', 'walk', 'idle'], scale: 0.65 },
    fall: { order: ['jump', 'idle', 'walk', 'run'], scale: 0.5 },
  };

  for (const state of PHYSICS_CLIPS) {
    const direct = directClips[state];
    if (direct) {
      bindings[state] = {
        targetState: state,
        clip: direct,
        sourceClipName: direct.name,
        timeScale: 1.0,
        isFallback: false,
      };
      continue;
    }
    const fb = fallbackOrder[state];
    let chosen: THREE.AnimationClip | undefined;
    for (const candidate of fb.order) {
      if (directClips[candidate]) {
        chosen = directClips[candidate];
        break;
      }
    }
    if (!chosen && clips.length > 0) {
      chosen = clips[0];
    }
    if (chosen) {
      bindings[state] = {
        targetState: state,
        clip: chosen,
        sourceClipName: chosen.name,
        timeScale: fb.scale,
        isFallback: true,
      };
    }
  }

  return { directClips, bindings, missingClips };
}

/**
 * Builds a rigged humanoid with skeletal `THREE.Bone` hierarchy and 5 embedded `THREE.AnimationClip`s
 * (`idle`, `walk`, `run`, `jump`, `fall`), standing exactly `height` metres tall (`1.5 m` default)
 * with feet touching `y = 0`. Used as an instant zero-latency stand-in while the GLB streams or in headless tests.
 */
export function buildProceduralRiggedHumanoid(
  colorHex = '#38bdf8',
  height = PHYSICS_CAPSULE_HEIGHT,
): { model: THREE.Group; clips: THREE.AnimationClip[] } {
  const model = new THREE.Group();
  model.name = 'ProceduralRiggedHumanoid';

  const primaryMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.45,
    metalness: 0.08,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.65,
    metalness: 0.1,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    roughness: 0.55,
  });

  // Bone hierarchy (heights designed for 1.50 m total stature, feet soles at y = 0.0)
  const hipsBone = new THREE.Bone();
  hipsBone.name = 'Hips';
  hipsBone.position.set(0, 0.72, 0);

  const torsoBone = new THREE.Bone();
  torsoBone.name = 'Spine';
  torsoBone.position.set(0, 0.12, 0);
  hipsBone.add(torsoBone);

  const headBone = new THREE.Bone();
  headBone.name = 'Head';
  headBone.position.set(0, 0.42, 0);
  torsoBone.add(headBone);

  const leftArmBone = new THREE.Bone();
  leftArmBone.name = 'LeftArm';
  leftArmBone.position.set(-0.24, 0.3, 0);
  torsoBone.add(leftArmBone);

  const rightArmBone = new THREE.Bone();
  rightArmBone.name = 'RightArm';
  rightArmBone.position.set(0.24, 0.3, 0);
  torsoBone.add(rightArmBone);

  const leftLegBone = new THREE.Bone();
  leftLegBone.name = 'LeftUpLeg';
  leftLegBone.position.set(-0.11, 0, 0);
  hipsBone.add(leftLegBone);

  const rightLegBone = new THREE.Bone();
  rightLegBone.name = 'RightUpLeg';
  rightLegBone.position.set(0.11, 0, 0);
  hipsBone.add(rightLegBone);

  // Attach low-poly articulated meshes to bones (feet reach y = 0 when hips are at y = 0.72, head top at y = 1.50)
  const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.22), primaryMat);
  torsoMesh.position.set(0, 0.15, 0);
  torsoMesh.castShadow = true;
  torsoBone.add(torsoMesh);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
  headMesh.position.set(0, 0.08, 0);
  headMesh.castShadow = true;
  headBone.add(headMesh);

  // Visor on the front (-Z face so facing = 0 looks along -Z)
  const visorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.07, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
  );
  visorMesh.position.set(0, 0.09, -0.14);
  headBone.add(visorMesh);

  const armGeo = new THREE.BoxGeometry(0.11, 0.42, 0.11);
  const leftArmMesh = new THREE.Mesh(armGeo, primaryMat);
  leftArmMesh.position.set(0, -0.18, 0);
  leftArmMesh.castShadow = true;
  leftArmBone.add(leftArmMesh);

  const rightArmMesh = new THREE.Mesh(armGeo, primaryMat);
  rightArmMesh.position.set(0, -0.18, 0);
  rightArmMesh.castShadow = true;
  rightArmBone.add(rightArmMesh);

  const legGeo = new THREE.BoxGeometry(0.13, 0.72, 0.14);
  const leftLegMesh = new THREE.Mesh(legGeo, secondaryMat);
  leftLegMesh.position.set(0, -0.36, 0);
  leftLegMesh.castShadow = true;
  leftLegBone.add(leftLegMesh);

  const rightLegMesh = new THREE.Mesh(legGeo, secondaryMat);
  rightLegMesh.position.set(0, -0.36, 0);
  rightLegMesh.castShadow = true;
  rightLegBone.add(rightLegMesh);

  model.add(hipsBone);

  const scaleFactor = height / 1.5;
  if (Math.abs(scaleFactor - 1) > 1e-4) {
    model.scale.setScalar(scaleFactor);
  }

  const qTrack = (boneName: string, times: number[], xAngles: number[]): THREE.QuaternionKeyframeTrack => {
    const values: number[] = [];
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (const a of xAngles) {
      euler.set(a, 0, 0);
      q.setFromEuler(euler);
      values.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
  };

  const vTrack = (boneName: string, times: number[], yVals: number[]): THREE.VectorKeyframeTrack => {
    const values: number[] = [];
    for (const y of yVals) {
      values.push(0, y, 0);
    }
    return new THREE.VectorKeyframeTrack(`${boneName}.position`, times, values);
  };

  const idleClip = new THREE.AnimationClip('Idle_01', 1.2, [
    vTrack('Hips', [0, 0.6, 1.2], [0.72, 0.74, 0.72]),
    qTrack('LeftArm', [0, 0.6, 1.2], [0.04, -0.04, 0.04]),
    qTrack('RightArm', [0, 0.6, 1.2], [-0.04, 0.04, -0.04]),
    qTrack('LeftUpLeg', [0, 0.6, 1.2], [0, 0, 0]),
    qTrack('RightUpLeg', [0, 0.6, 1.2], [0, 0, 0]),
  ]);

  const walkClip = new THREE.AnimationClip('Walking', 0.8, [
    vTrack('Hips', [0, 0.2, 0.4, 0.6, 0.8], [0.72, 0.75, 0.72, 0.75, 0.72]),
    qTrack('LeftUpLeg', [0, 0.2, 0.4, 0.6, 0.8], [0.45, 0, -0.45, 0, 0.45]),
    qTrack('RightUpLeg', [0, 0.2, 0.4, 0.6, 0.8], [-0.45, 0, 0.45, 0, -0.45]),
    qTrack('LeftArm', [0, 0.2, 0.4, 0.6, 0.8], [-0.35, 0, 0.35, 0, -0.35]),
    qTrack('RightArm', [0, 0.2, 0.4, 0.6, 0.8], [0.35, 0, -0.35, 0, 0.35]),
  ]);

  const runClip = new THREE.AnimationClip('Running', 0.56, [
    vTrack('Hips', [0, 0.14, 0.28, 0.42, 0.56], [0.72, 0.78, 0.72, 0.78, 0.72]),
    qTrack('LeftUpLeg', [0, 0.14, 0.28, 0.42, 0.56], [0.82, 0, -0.82, 0, 0.82]),
    qTrack('RightUpLeg', [0, 0.14, 0.28, 0.42, 0.56], [-0.82, 0, 0.82, 0, -0.82]),
    qTrack('LeftArm', [0, 0.14, 0.28, 0.42, 0.56], [-0.75, 0, 0.75, 0, -0.75]),
    qTrack('RightArm', [0, 0.14, 0.28, 0.42, 0.56], [0.75, 0, -0.75, 0, 0.75]),
  ]);

  const jumpClip = new THREE.AnimationClip('_360_Power_Spin_Jump', 0.6, [
    vTrack('Hips', [0, 0.3, 0.6], [0.74, 0.82, 0.76]),
    qTrack('LeftArm', [0, 0.3, 0.6], [-1.8, -2.4, -1.9]),
    qTrack('RightArm', [0, 0.3, 0.6], [-1.8, -2.4, -1.9]),
    qTrack('LeftUpLeg', [0, 0.3, 0.6], [0.35, 0.55, 0.35]),
    qTrack('RightUpLeg', [0, 0.3, 0.6], [-0.25, -0.4, -0.25]),
  ]);

  const fallClip = new THREE.AnimationClip('Leap_of_Faith', 0.6, [
    vTrack('Hips', [0, 0.3, 0.6], [0.74, 0.71, 0.74]),
    qTrack('LeftArm', [0, 0.3, 0.6], [-1.2, -1.45, -1.2]),
    qTrack('RightArm', [0, 0.3, 0.6], [-1.2, -1.45, -1.2]),
    qTrack('LeftUpLeg', [0, 0.3, 0.6], [0.45, 0.6, 0.45]),
    qTrack('RightUpLeg', [0, 0.3, 0.6], [0.25, 0.4, 0.25]),
  ]);

  return {
    model,
    clips: [idleClip, walkClip, runClip, jumpClip, fallClip],
  };
}

export interface PhysicsCharacterAvatarSpec {
  /** Library model id from `content/asset_catalog.json` / `content/character_casting.json` (default `'char_gamer_boy'`). */
  model?: string;
  /** Tint color & foot ring hex (default `'#38bdf8'`). */
  color?: string;
  /** Target height in metres matching the physics capsule (default `1.5` m). */
  height?: number;
  /** Cross-fade duration in seconds (clamped to `[0.15, 0.25]`, default `0.18` s). */
  crossFadeSec?: number;
  /** Asset quality tier (default `'high'`). */
  quality?: AssetQuality;
  /** Show foot ground-contact ring (default `true`). */
  ring?: boolean;
}

/**
 * Rigged 3D character avatar driven by the Rapier physics controller (`character.clip = idle | walk | run | jump | fall`,
 * `motion.facing`, and interpolated foot position `renderPosition(alpha)`).
 */
export class PhysicsCharacterAvatar {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly modelId: string;
  readonly targetHeight: number;
  readonly crossFadeSec: number;
  private currentClipState: PhysicsClip = 'idle';
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<PhysicsClip, { action: THREE.AnimationAction; timeScale: number; isFallback: boolean }>();
  private activeAction: THREE.AnimationAction | null = null;
  private resolution: PhysicsClipResolution;
  private clock = 0;
  private disposed = false;
  private usingGlb = false;

  constructor(
    spec: PhysicsCharacterAvatarSpec = {},
    initialModelAndClips?: { model: THREE.Object3D; clips: THREE.AnimationClip[]; isGlb?: boolean },
  ) {
    this.modelId = spec.model ?? 'char_gamer_boy';
    this.targetHeight = spec.height ?? PHYSICS_CAPSULE_HEIGHT;
    this.crossFadeSec = Math.min(0.25, Math.max(0.15, spec.crossFadeSec ?? PHYSICS_CROSSFADE_SEC));

    this.root.name = `PhysicsCharacterAvatar_${this.modelId}`;
    this.root.add(this.body);

    if (spec.ring !== false) {
      const footRing = new THREE.Mesh(ringGeo, ringMaterial(spec.color ?? '#38bdf8'));
      footRing.position.y = 0.012;
      footRing.renderOrder = 1;
      this.root.add(footRing);
    }

    const initial =
      initialModelAndClips ??
      buildProceduralRiggedHumanoid(spec.color ?? '#38bdf8', this.targetHeight);
    const initialIsGlb = 'isGlb' in initial ? Boolean(initial.isGlb) : false;
    this.resolution = this.mountModel(initial.model, initial.clips, initialIsGlb);
  }

  private mountModel(
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    isGlb: boolean,
  ): PhysicsClipResolution {
    this.mixer?.stopAllAction();
    this.body.clear();
    this.actions.clear();
    this.activeAction = null;
    this.usingGlb = isGlb;

    // Normalize height to `this.targetHeight` (1.5 m) and plant feet at local y = 0
    const box = restBox(model);
    const rawHeight = box.max.y - box.min.y || 1.5;
    const s = this.targetHeight / rawHeight;
    model.scale.setScalar(s);
    model.position.set(
      -((box.min.x + box.max.x) / 2) * s,
      -box.min.y * s,
      -((box.min.z + box.max.z) / 2) * s,
    );

    // GLTF character rigs face +Z in local space; rotate Y by π inside `body` so `root.rotation.y = facing`
    // (where facing = 0 looks along -Z in `characterMotion.ts`) aligns the character's face with movement!
    if (isGlb) {
      model.rotation.y = Math.PI;
    }

    let skinned: THREE.SkinnedMesh | null = null;
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) {
        skinned = o as THREE.SkinnedMesh;
      }
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
      }
    });

    if (skinned && !clips.some((c) => PHYSICS_CLIP_RULES.idle.some((re) => re.test(c.name)))) {
      relaxArms(model);
    }

    this.body.add(model);
    const resolution = resolvePhysicsClipMap(clips);
    this.resolution = resolution;

    if (clips.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      for (const state of PHYSICS_CLIPS) {
        const b = resolution.bindings[state];
        if (!b) continue;
        const action = this.mixer.clipAction(b.clip);
        action.setEffectiveTimeScale(b.timeScale);
        this.actions.set(state, {
          action,
          timeScale: b.timeScale,
          isFallback: b.isFallback,
        });
      }
    } else {
      this.mixer = null;
    }

    this.applyClipTransition(this.currentClipState, 0);
    return resolution;
  }

  /** Load and swap in a rigged `.glb` from `3D_tutorcraft` / `assetLibrary`. */
  async loadLibraryModel(spec: PhysicsCharacterAvatarSpec = {}): Promise<boolean> {
    const modelId = spec.model ?? this.modelId;
    const url = withQuality(lib(modelId), spec.quality ?? 'high');
    try {
      const gltf = await loadGltf(url);
      if (this.disposed) return false;
      const copy = cloneSkinned(gltf.scene) as THREE.Object3D;
      if (spec.color) {
        const mix = 0.45;
        copy.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.material = Array.isArray(m.material)
            ? m.material.map((x) => tinted(x, spec.color!, mix))
            : tinted(m.material, spec.color!, mix);
        });
      }
      this.mountModel(copy, gltf.animations ?? [], true);
      return true;
    } catch {
      return false;
    }
  }

  get clip(): PhysicsClip {
    return this.currentClipState;
  }

  get isGlbLoaded(): boolean {
    return this.usingGlb;
  }

  /** Returns which of the 5 locomotion clips were missing in the loaded model and use nearest-clip fallback. */
  get missingClips(): PhysicsClip[] {
    const catalogEntry = RIGGED_CHARACTER_CLIP_CATALOG[this.modelId];
    if (!this.usingGlb && catalogEntry) {
      return [...catalogEntry.missingPhysicsClips];
    }
    return [...this.resolution.missingClips];
  }

  /** Returns the resolved clip bindings for inspection/tests. */
  get clipBindings(): Partial<Record<PhysicsClip, ResolvedPhysicsClipBinding>> {
    return { ...this.resolution.bindings };
  }

  private applyClipTransition(next: PhysicsClip, fadeSec: number) {
    const entry = this.actions.get(next) ?? this.actions.get('idle') ?? null;
    if (!this.mixer || !entry) return;
    const nextAction = entry.action;
    nextAction.setEffectiveTimeScale(entry.timeScale);
    if (nextAction !== this.activeAction) {
      nextAction.reset();
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      if (fadeSec > 0 && this.activeAction) {
        nextAction.fadeIn(fadeSec).play();
        this.activeAction.fadeOut(fadeSec);
      } else {
        nextAction.play();
        this.activeAction?.stop();
      }
      this.activeAction = nextAction;
    }
  }

  /**
   * Transitions to `next` (`idle | walk | run | jump | fall`) with a smooth `0.15–0.25 s` cross-fade.
   */
  setClip(next: PhysicsClip, fadeSec = this.crossFadeSec): number {
    const clampedFade = Math.min(0.25, Math.max(0.15, fadeSec));
    if (next !== this.currentClipState) {
      this.currentClipState = next;
      this.applyClipTransition(next, clampedFade);
    }
    return clampedFade;
  }

  /**
   * Updates the character's world transform (feet at `pose.y`, facing `pose.facing`)
   * and advances the skeletal `AnimationMixer` + procedural fallback layering.
   */
  syncFromController(
    pose: { x: number; y: number; z: number; facing: number; clip: PhysicsClip },
    dt: number,
  ): void {
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.facing;
    this.setClip(pose.clip);
    this.update(dt);
  }

  update(dt: number): void {
    this.clock += dt;
    this.mixer?.update(dt);

    const entry = this.actions.get(this.currentClipState);
    const isFallback = !entry || entry.isFallback;

    // Reset procedural overlay on `this.body` (feet stay planted at y = 0 on the ground)
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);

    if (isFallback) {
      if (this.currentClipState === 'idle') {
        this.body.position.y = Math.sin(this.clock * 2.4) * 0.015;
      } else if (this.currentClipState === 'jump') {
        this.body.rotation.x = -0.12;
      } else if (this.currentClipState === 'fall') {
        this.body.rotation.x = 0.14;
        this.body.rotation.z = Math.sin(this.clock * 6) * 0.05;
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}

/**
 * Creates a `PhysicsCharacterAvatar` scaled to `1.5 m` (matching the Rapier capsule)
 * and kicks off asynchronous GLB loading from `3D_tutorcraft` (`content/character_casting.json`).
 */
export function createPhysicsCharacterAvatar(
  spec: PhysicsCharacterAvatarSpec = {},
): PhysicsCharacterAvatar {
  const avatar = new PhysicsCharacterAvatar(spec);
  void avatar.loadLibraryModel(spec);
  return avatar;
}

