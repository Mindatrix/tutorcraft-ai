import * as THREE from 'three';
import type { TriangleSoup } from './rapierWorld';

// Đại phẫu (03/11/2026): turn three.js meshes into Rapier triangle colliders, in world space.
// For the scenes' walkable shapes (ramps, bridges, terrain, rocks): pass the mesh (or a simplified
// "collision" copy of it, cheaper than the visual) to PhysicsWorld.addTriangles.
// Keep collision meshes small: a few thousand triangles per scene, never the full visual model.

const v = new THREE.Vector3();

/** World-space triangles of a mesh, or of every mesh under an object. */
export function trianglesFrom(root: THREE.Object3D): TriangleSoup {
  root.updateWorldMatrix(true, true);
  const verts: number[] = [];
  const idx: number[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry as THREE.BufferGeometry;
    const pos = g.getAttribute('position');
    if (!pos) return;
    const base = verts.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      verts.push(v.x, v.y, v.z);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(base + i);
  });
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

/** Triangle count of a soup (budget checks). */
export const triangleCount = (s: TriangleSoup) => s.indices.length / 3;
