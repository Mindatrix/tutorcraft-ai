'use client';

import * as THREE from 'three';
import { assetBase } from '../../../config/assetLibrary';
import type { Placement, SceneLayout, WorldTemplate } from '../../../engine';
import { loadGltf } from './assetLoader';
import { buildInstances, type InstanceBatch } from './instancing';
import type { GfxTier } from './SceneRuntime';

// The shared river (and Dino Journey meadow) world, built from a layout (plan C1 / C2 gate):
// water or a dirt path, two banks, a ground plane, and every placed model drawn instanced.
// Fill always uses the low variant (see sceneBuilder); the stage's own models follow the tier.

export interface RiverWorldOptions {
  layout: SceneLayout;
  /** Stages to show (usually the current one and its neighbours). */
  stages?: number[];
  tier: GfxTier;
  /** Matches the scene fog so the water fades into it. */
  fogColor?: THREE.ColorRepresentation;
  onProgress?: (done: number, total: number) => void;
}

export interface RiverWorldReady {
  drawCalls: number;
  instances: number;
  models: number;
  /** Files that failed to load (their placements are simply absent). */
  failed: string[];
}

export interface RiverWorld {
  group: THREE.Group;
  ready: Promise<RiverWorldReady>;
  update(dt: number, t: number): void;
  dispose(): void;
}

const urlOf = (p: Pick<Placement, 'file' | 'variant'>) => `${assetBase()}/${p.variant === 'low' ? 'low' : 'web'}/${p.file}`;

function waterMaterial(world: WorldTemplate, fog: THREE.ColorRepresentation) {
  const half = world.waterHalf;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x3fc1c9) },
      uDeep: { value: new THREE.Color(0x167a8a) },
      uFoam: { value: new THREE.Color(0xf4fbff) },
      uFog: { value: new THREE.Color(fog) },
      uHalf: { value: half },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec2 vW; varying float vDist;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += sin(w.x * 0.9 + uTime * 1.6) * 0.04 + cos(w.z * 0.7 + uTime * 1.2) * 0.04;
        vW = w.xz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uFog; uniform float uHalf;
      varying vec2 vW; varying float vDist;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float edge = smoothstep(uHalf * 0.55, uHalf, abs(vW.x));
        vec3 col = mix(uDeep, uShallow, 0.5 + 0.5 * edge);
        vec2 flow = vec2(vW.x * 0.9, vW.y * 0.35 - uTime * 1.1);
        float streak = smoothstep(0.72, 0.8, n(flow * vec2(1.6, 1.0))) * 0.5;
        float bankFoam = smoothstep(uHalf - 0.5, uHalf + 0.2, abs(vW.x)) * (0.6 + 0.4 * n(vec2(vW.y * 1.5 - uTime * 2.0, vW.x)));
        col = mix(col, uFoam, clamp(streak + bankFoam, 0.0, 1.0));
        col = mix(col, uFog, smoothstep(45.0, 140.0, vDist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** A rolling bank (sand at the water, then grass) on one side, along z0 → z1. */
function bank(world: WorldTemplate, side: -1 | 1, z0: number, z1: number, meadow: boolean): THREE.Mesh {
  const w = world.bankWidth + 12;
  const geo = new THREE.PlaneGeometry(w, Math.abs(z1 - z0), 16, Math.max(8, Math.round(Math.abs(z1 - z0) / 2)));
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const sand = new THREE.Color(meadow ? 0x9c7a4f : 0xe9d29a);
  const grass = new THREE.Color(meadow ? 0x86a94f : 0x7cc36a);
  const dark = new THREE.Color(meadow ? 0x6f8f3e : 0x4f9d4a);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) + w / 2; // 0 at the water / path, w far away
    const z = pos.getZ(i) + (z0 + z1) / 2;
    const hgt = meadow ? Math.sin(z * 0.05 + lx * 0.2) * 0.25 * Math.min(1, lx / 4) : lx < 0.6 ? -0.4 : 0.2 + Math.min(1, lx / 6) * (0.5 + Math.sin(z * 0.21 + side) * 0.4 + Math.cos(lx * 0.5 + z * 0.13) * 0.4);
    pos.setY(i, hgt - 0.1);
    pos.setX(i, (lx + world.waterHalf) * side);
    const cc = lx < 1.6 ? sand : lx > 9 && Math.sin(z * 0.3 + lx) > 0.3 ? dark : grass;
    colors.push(cc.r, cc.g, cc.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }));
  m.position.z = (z0 + z1) / 2;
  m.receiveShadow = true;
  return m;
}

export function buildRiverWorld(opts: RiverWorldOptions): RiverWorld {
  const { layout } = opts;
  const world = layout.world;
  const meadow = world.kind === 'meadow';
  const stages = opts.stages ?? layout.stages.map((s) => s.n);
  const areas = layout.stages.filter((s) => stages.includes(s.n));
  const zStart = Math.max(...areas.map((a) => a.z0)) + 20;
  const zEnd = Math.min(...areas.map((a) => a.z1)) - 20;
  const group = new THREE.Group();
  group.name = 'river-world';

  // Ground far out, water (or path), banks.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, zStart - zEnd + 200), new THREE.MeshStandardMaterial({ color: meadow ? 0x7c9a45 : 0x6fae5a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.35, (zStart + zEnd) / 2);
  ground.receiveShadow = true;
  group.add(ground);
  let water: THREE.Mesh | null = null;
  if (meadow) {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(world.waterHalf * 2 + 1, zStart - zEnd), new THREE.MeshStandardMaterial({ color: 0xa47e52, roughness: 1 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, -0.08, (zStart + zEnd) / 2);
    path.receiveShadow = true;
    group.add(path);
  } else {
    water = new THREE.Mesh(new THREE.PlaneGeometry(world.waterHalf * 2 + 2, zStart - zEnd, 24, 120), waterMaterial(world, opts.fogColor ?? 0xbfe6f2));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.15, (zStart + zEnd) / 2);
    group.add(water);
  }
  group.add(bank(world, -1, zStart, zEnd, meadow), bank(world, 1, zStart, zEnd, meadow));

  // Models: load each (file, variant) once, then one instanced batch for all of them.
  const placements = layout.placements.filter((p) => stages.includes(p.stage));
  const urls = Array.from(new Set(placements.map(urlOf)));
  let batch: InstanceBatch | null = null;
  let alive = true;
  let done = 0;
  const failed: string[] = [];
  const models = new Map<string, THREE.Object3D>();
  const ready = Promise.all(
    urls.map((u) =>
      loadGltf(u)
        .then((g) => void models.set(u, g.scene))
        .catch(() => void failed.push(u))
        .finally(() => opts.onProgress?.(++done, urls.length)),
    ),
  ).then(() => {
    if (!alive) return { drawCalls: 0, instances: 0, models: 0, failed };
    batch = buildInstances(placements, (p) => models.get(urlOf(p)) ?? null, { castShadow: opts.tier === 'high', receiveShadow: false });
    group.add(batch.group);
    return { drawCalls: batch.drawCalls + group.children.length - 1, instances: batch.instances, models: models.size, failed };
  });

  return {
    group,
    ready,
    update(_dt, t) {
      if (water) ((water.material as THREE.ShaderMaterial).uniforms.uTime.value = t);
    },
    dispose() {
      alive = false;
      (batch as InstanceBatch | null)?.dispose();
      group.removeFromParent();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    },
  };
}
