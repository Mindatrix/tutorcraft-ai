'use client';

import * as THREE from 'three';

// Footprints on sand and mud (plan C1.6): flat decals at the exact world spot a foot touched,
// fading out over 20 s. All prints of a trail are ONE instanced mesh (one draw call); a ring
// buffer reuses the oldest slot, and the fade is computed on the GPU from each print's birth time.

export type FootprintSurface = 'mud' | 'sand';

const loader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

function footprintTexture(surface: FootprintSurface, variant = 1): THREE.Texture {
  const url = `/assets/textures/footprints/${surface}_0${Math.min(3, Math.max(1, variant))}.png`;
  let t = textures.get(url);
  if (!t) {
    t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textures.set(url, t);
  }
  return t;
}

export interface FootprintOptions {
  surface?: FootprintSurface;
  variant?: number;
  /** Ring buffer size (oldest prints are reused first). */
  max?: number;
  fadeSec?: number;
  /** Length of one print in metres. */
  size?: number;
  tint?: THREE.ColorRepresentation;
}

export class FootprintTrail {
  readonly mesh: THREE.InstancedMesh;
  private born: THREE.InstancedBufferAttribute;
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  readonly fadeSec: number;

  constructor(opts: FootprintOptions = {}) {
    const max = opts.max ?? 256;
    this.fadeSec = opts.fadeSec ?? 20;
    const size = opts.size ?? 0.32;
    const geo = new THREE.PlaneGeometry(size * 0.6, size);
    const born = new Float32Array(max).fill(-1e6);
    this.born = new THREE.InstancedBufferAttribute(born, 1);
    this.born.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBorn', this.born);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: {
        map: { value: footprintTexture(opts.surface ?? 'mud', opts.variant) },
        uTime: { value: 0 },
        uFade: { value: this.fadeSec },
        uTint: { value: new THREE.Color(opts.tint ?? 0xffffff) },
      },
      vertexShader: /* glsl */ `
        attribute float aBorn;
        varying vec2 vUv;
        varying float vBorn;
        void main() {
          vUv = uv;
          vBorn = aBorn;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float uTime; uniform float uFade; uniform vec3 uTint;
        varying vec2 vUv; varying float vBorn;
        void main() {
          vec4 t = texture2D(map, vUv);
          float age = uTime - vBorn;
          float a = t.a * clamp(1.0 - age / uFade, 0.0, 1.0) * step(0.0, age);
          if (a < 0.01) discard;
          gl_FragColor = vec4(t.rgb * uTint, a * 0.85);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.renderOrder = 1;
    this.mesh.name = 'footprints';
  }

  /**
   * One print at world (x, y, z), heading `rotY` (radians, 0 = toward -z), left or right foot,
   * born at `now` (seconds, the same clock passed to update()).
   */
  add(x: number, y: number, z: number, rotY: number, foot: 'L' | 'R', now: number) {
    const i = this.next;
    this.next = (this.next + 1) % this.born.count;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY).multiply(this.flat);
    const side = foot === 'L' ? -1 : 1;
    // Shift sideways from the walking line, mirror the right foot.
    const ox = Math.cos(rotY) * 0.11 * side;
    const oz = -Math.sin(rotY) * 0.11 * side;
    this.m.compose(new THREE.Vector3(x + ox, y + 0.02, z + oz), this.q, new THREE.Vector3(side, 1, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.born.setX(i, now);
    this.born.needsUpdate = true;
  }

  /** How many prints are still visible at `now`. */
  visible(now: number): number {
    let n = 0;
    for (let i = 0; i < this.born.count; i++) if (now - this.born.getX(i) < this.fadeSec) n++;
    return n;
  }

  update(now: number) {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = now;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Drops prints along a walk: call step() every frame with the walker's position. */
export class FootprintWalker {
  private last: THREE.Vector3 | null = null;
  private foot: 'L' | 'R' = 'L';
  constructor(private trail: FootprintTrail, private stride = 0.55) {}
  step(pos: THREE.Vector3, now: number) {
    if (!this.last) {
      this.last = pos.clone();
      return;
    }
    const d = Math.hypot(pos.x - this.last.x, pos.z - this.last.z);
    if (d < this.stride) return;
    const rotY = Math.atan2(-(pos.x - this.last.x), -(pos.z - this.last.z));
    this.trail.add(pos.x, pos.y, pos.z, rotY, this.foot, now);
    this.foot = this.foot === 'L' ? 'R' : 'L';
    this.last.copy(pos);
  }
}
