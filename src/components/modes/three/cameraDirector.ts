'use client';

import * as THREE from 'three';
import { cameraMove } from '../../../engine';

// Camera direction for the in-scene question moments (plan C, groundwork for C4):
//  - dollyTo(anchor): glide toward a named anchor in 0.4 s, hold, glide back in 0.4 s;
//  - focus(objects): dim the rest of the scene so the asked-about thing stands out;
//  - cameraMove(name): play a move named in content/consequences_v2.json (zoom_grill, shake_big,
//    warp_distort, follow_run, pan_herd, dolly_through);
//  - rideRail(points): fly the camera along a curve (Multiverse portal crossings).
// The scene keeps driving its own camera every frame; the director BLENDS its pose on top before
// the render and puts the scene's pose back after it, so a move ends exactly where the scene wants
// the camera to be, with no jump.

type Target = THREE.Object3D | THREE.Vector3;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const pos = (t: Target, out = new THREE.Vector3()) => ((t as THREE.Object3D).isObject3D ? (t as THREE.Object3D).getWorldPosition(out) : out.copy(t as THREE.Vector3));

interface Move {
  kind: 'dolly' | 'follow' | 'pan' | 'through' | 'rail' | 'warp';
  start: number;
  inSec: number;
  hold: number;
  outSec: number;
  target?: Target;
  distance?: number;
  height?: number;
  rail?: THREE.CatmullRomCurve3;
  railLook?: Target | 'ahead';
  strength: number;
  resolve: () => void;
}

export interface DollyOptions {
  /** Seconds to glide in and out (default 0.4). */
  duration?: number;
  /** Seconds to stay (default 1; 0 = stay until dollyBack()). */
  hold?: number;
  /** Distance kept from the anchor (m). */
  distance?: number;
  /** Camera height above the anchor (m). */
  height?: number;
}

export class CameraDirector {
  readonly anchors = new Map<string, Target>();
  private moves: Move[] = [];
  private clock = 0;
  private savedPos = new THREE.Vector3();
  private savedQuat = new THREE.Quaternion();
  private savedFov = 50;
  private applied = false;
  private warpUntil = 0;
  private warpStart = 0;
  private warpStrength = 0;
  // Focus / dim
  private focusSet: THREE.Object3D[] = [];
  private focusLayer = 7;
  private dimTarget = 0;
  private dim = 0;
  private dimScene = new THREE.Scene();
  private dimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private dimMat = new THREE.MeshBasicMaterial({ color: 0x050816, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  private savedMasks = new Map<THREE.Object3D, number>();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    private shake: (mag: number, sec: number) => void,
  ) {
    this.dimScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.dimMat));
  }

  setAnchor(name: string, target: Target | null) {
    if (target) this.anchors.set(name, target);
    else this.anchors.delete(name);
  }

  private resolveTarget(t: Target | string): Target | null {
    return typeof t === 'string' ? this.anchors.get(t) ?? null : t;
  }

  /** Glide to an anchor (name or object/point), hold, glide back. Resolves when back. */
  dollyTo(target: Target | string, o: DollyOptions = {}): Promise<void> {
    const t = this.resolveTarget(target);
    if (!t) return Promise.resolve();
    return this.push({ kind: 'dolly', target: t, inSec: o.duration ?? 0.4, outSec: o.duration ?? 0.4, hold: o.hold ?? 1, distance: o.distance ?? 3.2, height: o.height ?? 1.4, strength: 1 });
  }

  /** End every hold now (glide back in 0.4 s). */
  dollyBack() {
    for (const m of this.moves) {
      const elapsed = this.clock - m.start;
      if (m.hold === Infinity || elapsed < m.inSec + m.hold) m.hold = Math.max(0, elapsed - m.inSec);
    }
  }

  /** Fly along a curve through `points`, looking at a target or ahead along the path. */
  rideRail(points: THREE.Vector3[], o: { seconds?: number; look?: Target | 'ahead' } = {}): Promise<void> {
    if (points.length < 2) return Promise.resolve();
    const rail = new THREE.CatmullRomCurve3(points.map((p) => p.clone()), false, 'centripetal');
    return this.push({ kind: 'rail', rail, railLook: o.look ?? 'ahead', inSec: 0.25, hold: o.seconds ?? 2, outSec: 0.25, strength: 1 });
  }

  /** A move named in consequences_v2.json; unknown names do nothing. */
  cameraMove(name: string, around?: Target): Promise<void> {
    const m = cameraMove(name);
    if (!m) return Promise.resolve();
    switch (m.kind) {
      case 'shake':
        this.shake(m.strength, m.hold);
        return new Promise((r) => setTimeout(r, m.hold * 1000));
      case 'warp':
        this.warpStart = this.clock;
        this.warpUntil = this.clock + m.hold;
        this.warpStrength = m.strength;
        return new Promise((r) => setTimeout(r, m.hold * 1000));
      case 'dolly':
        return this.dollyTo(this.anchors.get(m.anchor ?? '') ?? around ?? new THREE.Vector3(), { hold: m.hold });
      case 'follow': {
        const t = this.anchors.get(m.anchor ?? '') ?? around;
        return t ? this.push({ kind: 'follow', target: t, inSec: 0.4, hold: m.hold, outSec: 0.4, distance: 4.5, height: 2, strength: m.strength }) : Promise.resolve();
      }
      case 'pan': {
        const t = this.anchors.get(m.anchor ?? '') ?? around;
        return t ? this.push({ kind: 'pan', target: t, inSec: 0.4, hold: m.hold, outSec: 0.4, distance: 9, height: 4, strength: 1 }) : Promise.resolve();
      }
      case 'dolly_through':
        return this.push({ kind: 'through', inSec: 0.3, hold: m.hold, outSec: 0.4, distance: 6, strength: 1 });
    }
  }

  /** Dim everything except `objects` (they keep full light and colour). */
  focus(objects: THREE.Object3D[], amount = 0.55) {
    this.clearFocusLayers();
    this.focusSet = objects;
    for (const root of objects) {
      root.traverse((o) => {
        this.savedMasks.set(o, o.layers.mask);
        o.layers.set(this.focusLayer);
      });
    }
    // Lights must light the focused layer too.
    this.scene.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(this.focusLayer);
    });
    this.dimTarget = amount;
  }

  clearFocus() {
    this.dimTarget = 0;
  }

  get focusing() {
    return this.dim > 0.001 || this.dimTarget > 0;
  }

  private clearFocusLayers() {
    for (const [o, mask] of this.savedMasks) o.layers.mask = mask;
    this.savedMasks.clear();
    this.focusSet = [];
  }

  private push(m: Omit<Move, 'start' | 'resolve'>): Promise<void> {
    return new Promise((resolve) => {
      // A new move replaces one of the same kind (two zooms do not stack).
      this.moves = this.moves.filter((x) => {
        if (x.kind === m.kind || m.kind === 'rail' || x.kind === 'rail') {
          x.resolve();
          return false;
        }
        return true;
      });
      this.moves.push({ ...m, start: this.clock, resolve });
    });
  }

  /** Before the render: blend the director's pose over the scene's own camera pose. */
  apply(dt: number) {
    this.clock += dt;
    this.dim += (this.dimTarget - this.dim) * Math.min(1, dt * 10);
    if (this.dimTarget === 0 && this.dim < 0.01 && this.focusSet.length) {
      this.dim = 0;
      this.clearFocusLayers();
    }
    this.savedPos.copy(this.camera.position);
    this.savedQuat.copy(this.camera.quaternion);
    this.savedFov = this.camera.fov;
    this.applied = false;
    const scenePos = this.savedPos.clone();
    const sceneQuat = this.savedQuat.clone();
    for (const m of [...this.moves]) {
      const e = this.clock - m.start;
      const total = m.inSec + m.hold + m.outSec;
      if (e >= total) {
        this.moves = this.moves.filter((x) => x !== m);
        m.resolve();
        continue;
      }
      const w = e < m.inSec ? easeInOut(e / m.inSec) : e < m.inSec + m.hold ? 1 : 1 - easeInOut((e - m.inSec - m.hold) / m.outSec);
      const goalPos = new THREE.Vector3();
      const look = new THREE.Vector3();
      if (m.kind === 'dolly' || m.kind === 'follow' || m.kind === 'pan') {
        pos(m.target!, look);
        const away = scenePos.clone().sub(look).setY(0);
        if (away.lengthSq() < 1e-6) away.set(0, 0, 1);
        away.normalize();
        if (m.kind === 'pan') away.applyAxisAngle(new THREE.Vector3(0, 1, 0), (e / total - 0.5) * 1.2);
        goalPos.copy(look).addScaledVector(away, m.distance ?? 3).setY(look.y + (m.height ?? 1.4));
        look.y += 0.9;
      } else if (m.kind === 'through') {
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(sceneQuat);
        goalPos.copy(scenePos).addScaledVector(fwd, (m.distance ?? 6) * Math.min(1, e / (m.inSec + m.hold)));
        look.copy(goalPos).addScaledVector(fwd, 5);
      } else if (m.kind === 'rail' && m.rail) {
        const k = Math.min(1, e / total);
        m.rail.getPointAt(easeInOut(k), goalPos);
        if (m.railLook === 'ahead') m.rail.getPointAt(Math.min(1, easeInOut(k) + 0.05), look);
        else pos(m.railLook as Target, look);
      }
      const goalQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(goalPos, look, new THREE.Vector3(0, 1, 0)));
      this.camera.position.lerpVectors(scenePos, goalPos, w);
      this.camera.quaternion.slerpQuaternions(sceneQuat, goalQuat, w);
      scenePos.copy(this.camera.position);
      sceneQuat.copy(this.camera.quaternion);
      this.applied = true;
    }
    if (this.clock < this.warpUntil) {
      const k = (this.clock - this.warpStart) / (this.warpUntil - this.warpStart);
      this.camera.fov = this.savedFov + Math.sin(k * Math.PI) * 22 * this.warpStrength;
      this.camera.updateProjectionMatrix();
      this.applied = true;
    }
  }

  /** Render the frame: plain, or in two layers with the dimmed background under the focus. */
  render() {
    const { renderer, scene, camera } = this;
    if (this.dim < 0.001 || !this.focusSet.length) {
      renderer.render(scene, camera);
      return;
    }
    const auto = renderer.autoClear;
    const mask = camera.layers.mask;
    camera.layers.set(0);
    renderer.render(scene, camera);
    renderer.autoClear = false;
    this.dimMat.opacity = this.dim;
    renderer.render(this.dimScene, this.dimCam);
    const bg = scene.background;
    scene.background = null;
    // The focused things show through whatever stands in front of them.
    renderer.clearDepth();
    camera.layers.set(this.focusLayer);
    renderer.render(scene, camera);
    scene.background = bg;
    camera.layers.mask = mask;
    renderer.autoClear = auto;
  }

  /** After the render: give the scene its own camera pose back. */
  restore() {
    if (!this.applied) return;
    this.camera.position.copy(this.savedPos);
    this.camera.quaternion.copy(this.savedQuat);
    if (this.camera.fov !== this.savedFov) {
      this.camera.fov = this.savedFov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    for (const m of this.moves) m.resolve();
    this.moves = [];
    this.clearFocusLayers();
    this.dimMat.dispose();
    (this.dimScene.children[0] as THREE.Mesh).geometry.dispose();
  }
}
