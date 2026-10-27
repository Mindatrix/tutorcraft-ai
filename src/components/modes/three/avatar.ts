'use client';

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { lib, withQuality, type AssetQuality } from '../../../config/assetLibrary';
import type { LodLevel } from '../../../engine';
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
    this.state = s;
    for (const m of Object.values(this.models)) m?.setState(s);
  }

  update(dt: number) {
    this.shown?.update(dt);
  }

  dispose() {
    this.disposed = true;
    for (const m of Object.values(this.models)) m?.dispose();
    this.root.removeFromParent();
  }
}
