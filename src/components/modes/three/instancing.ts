'use client';

import * as THREE from 'three';
import type { Placement } from '../../../engine';

// Instancing (plan C1.5): every library model placed more than once in a layout is drawn as one
// InstancedMesh per mesh it contains, so a river with ~70 things per stage costs one draw call
// per distinct model instead of one per tree. Geometry and materials stay those of the cached
// model (shared with every other use); only the instance matrices are new.

interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  /** Mesh transform relative to the model root. */
  local: THREE.Matrix4;
}

interface Prepared {
  parts: Part[];
  box: THREE.Box3;
}

const prepared = new WeakMap<THREE.Object3D, Prepared>();

function prepare(model: THREE.Object3D): Prepared {
  const hit = prepared.get(model);
  if (hit) return hit;
  model.updateMatrixWorld(true);
  const rootInv = model.matrixWorld.clone().invert();
  const parts: Part[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return;
    parts.push({ geometry: m.geometry, material: m.material, local: new THREE.Matrix4().multiplyMatrices(rootInv, m.matrixWorld) });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!.clone().applyMatrix4(p.local));
  }
  const out = { parts, box };
  prepared.set(model, out);
  return out;
}

/** World matrix that stands a model on the ground at a placement, scaled to its target size. */
export function placementMatrix(p: Placement, box: THREE.Box3, out = new THREE.Matrix4()): THREE.Matrix4 {
  const size = box.getSize(new THREE.Vector3());
  const ref = p.fit === 'width' ? Math.max(size.x, size.z) : p.fit === 'max' ? Math.max(size.x, size.y, size.z) : size.y;
  const s = ref > 1e-6 ? p.size / ref : 1;
  const center = box.getCenter(new THREE.Vector3());
  const toOrigin = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  out.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY), new THREE.Vector3(s, s, s));
  return out.multiply(toOrigin);
}

export interface InstanceBatch {
  group: THREE.Group;
  /** Draw calls this batch adds (one per mesh and material of each model). */
  drawCalls: number;
  instances: number;
  dispose(): void;
}

/**
 * Build instanced meshes for `placements`. `modelFor(p)` returns the loaded model (or null:
 * that placement is skipped). Skinned models are not instanced (use avatar.ts for those).
 */
export function buildInstances(placements: Placement[], modelFor: (p: Placement) => THREE.Object3D | null, opts: { castShadow?: boolean; receiveShadow?: boolean } = {}): InstanceBatch {
  const group = new THREE.Group();
  group.name = 'instances';
  const byModel = new Map<THREE.Object3D, Placement[]>();
  for (const p of placements) {
    const m = modelFor(p);
    if (!m) continue;
    const list = byModel.get(m) ?? [];
    list.push(p);
    byModel.set(m, list);
  }
  let drawCalls = 0;
  let instances = 0;
  const meshes: THREE.InstancedMesh[] = [];
  const world = new THREE.Matrix4();
  const full = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (const [model, list] of byModel) {
    const { parts, box } = prepare(model);
    for (const part of parts) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach((p, i) => {
        placementMatrix(p, box, world);
        im.setMatrixAt(i, full.multiplyMatrices(world, part.local));
        // Scene-kit level palette (WP4): multiplied into the material colour, no material copy.
        if (p.tint) im.setColorAt(i, tint.set(p.tint));
        else if (im.instanceColor) im.setColorAt(i, tint.set(0xffffff));
      });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = !!opts.castShadow;
      im.receiveShadow = !!opts.receiveShadow;
      im.userData.file = list[0].file;
      group.add(im);
      meshes.push(im);
      drawCalls += Array.isArray(part.material) ? part.material.length : 1;
    }
    instances += list.length;
  }
  return {
    group,
    drawCalls,
    instances,
    dispose() {
      // Geometry and materials belong to the cached model; only the instance buffers are ours.
      for (const im of meshes) {
        im.removeFromParent();
        im.dispose();
      }
    },
  };
}
