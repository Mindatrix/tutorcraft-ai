import type * as RAPIER_NS from '@dimforge/rapier3d-compat';

// Đại phẫu (03/11/2026): Rapier physics for the imperative three.js scenes (no React Three Fiber).
//
// - The WASM module is loaded lazily, once per page (`loadRapier`), so pages without physics pay
//   nothing. `@dimforge/rapier3d-compat` inlines the WASM: no extra file to host, works in Node
//   tests too.
// - The world steps at a fixed 60 Hz with an accumulator (`step(dt)`), at most 4 sub-steps per
//   frame, so a slow phone frame never explodes the simulation and every device behaves the same.
// - Colliders are static scenery (boxes, ground, triangle meshes from three.js geometry) plus the
//   kinematic character (characterController.ts). Nothing here decides game results: physics is
//   movement only; answers, scores and coins stay on the server.

export type Rapier = typeof RAPIER_NS;

let rapierPromise: Promise<Rapier> | null = null;

/** The Rapier module, initialised once. */
export function loadRapier(): Promise<Rapier> {
  rapierPromise ??= import('@dimforge/rapier3d-compat').then(async (mod) => {
    const R = ((mod as unknown as { default?: Rapier }).default ?? mod) as Rapier;
    await R.init();
    return R;
  });
  return rapierPromise;
}

export const PHYSICS_HZ = 60;
export const MAX_SUBSTEPS = 4;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Plain triangle data (three.js BufferGeometry positions + index, already in world space). */
export interface TriangleSoup {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface PhysicsWorld {
  R: Rapier;
  world: RAPIER_NS.World;
  /**
   * Advance by a frame's dt; returns the number of fixed steps taken (0..MAX_SUBSTEPS).
   * `beforeEach(h)` runs before every fixed step with h = 1/60 s (move characters there).
   */
  step(dt: number, beforeEach?: (h: number) => void): number;
  /** Interpolation factor 0..1 between the last two fixed steps (for smooth rendering). */
  readonly alpha: number;
  addGround(y?: number, halfSize?: number): RAPIER_NS.Collider;
  addBox(center: Vec3, halfExtents: Vec3, rotationY?: number): RAPIER_NS.Collider;
  addTriangles(soup: TriangleSoup): RAPIER_NS.Collider;
  removeCollider(c: RAPIER_NS.Collider): void;
  dispose(): void;
}

export function createPhysicsWorld(R: Rapier, gravity: Vec3 = { x: 0, y: -22, z: 0 }): PhysicsWorld {
  const world = new R.World(gravity);
  world.timestep = 1 / PHYSICS_HZ;
  let acc = 0;
  let alpha = 0;
  let disposed = false;
  const fixed = () => {
    const rb = R.RigidBodyDesc.fixed();
    return world.createRigidBody(rb);
  };

  return {
    R,
    world,
    get alpha() {
      return alpha;
    },
    step(dt: number, beforeEach?: (h: number) => void) {
      if (disposed || !(dt > 0)) return 0;
      // A tab coming back from the background can report seconds: never simulate more than 4 steps.
      acc = Math.min(acc + dt, MAX_SUBSTEPS / PHYSICS_HZ);
      let n = 0;
      while (acc >= 1 / PHYSICS_HZ && n < MAX_SUBSTEPS) {
        beforeEach?.(1 / PHYSICS_HZ);
        world.step();
        acc -= 1 / PHYSICS_HZ;
        n += 1;
      }
      alpha = acc * PHYSICS_HZ;
      return n;
    },
    addGround(y = 0, halfSize = 200) {
      const body = fixed();
      // One huge cuboid (e.g. 400 × 1 × 400 or 400 × 20 × 400) breaks Rapier 0.21's shape casts: a
      // character landing on it sinks through (measured 03/11). 40 m tiles, 4 m thick, are exact,
      // seams included (tests/physicsCharacter.test.ts). Returns the first tile.
      const TILE = 20; // half size
      const n = Math.max(1, Math.ceil(halfSize / (TILE * 2)));
      let first: RAPIER_NS.Collider | null = null;
      for (let ix = -n; ix < n; ix++) {
        for (let iz = -n; iz < n; iz++) {
          const c = world.createCollider(R.ColliderDesc.cuboid(TILE, 2, TILE).setTranslation(ix * TILE * 2 + TILE, y - 2, iz * TILE * 2 + TILE), body);
          first ??= c;
        }
      }
      return first!;
    },
    addBox(center, half, rotationY = 0) {
      const body = fixed();
      const desc = R.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(center.x, center.y, center.z);
      if (rotationY) desc.setRotation({ x: 0, y: Math.sin(rotationY / 2), z: 0, w: Math.cos(rotationY / 2) });
      return world.createCollider(desc, body);
    },
    addTriangles(soup) {
      const body = fixed();
      return world.createCollider(R.ColliderDesc.trimesh(soup.vertices, soup.indices), body);
    },
    removeCollider(c) {
      if (!disposed) world.removeCollider(c, true);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      world.free();
    },
  };
}
