import { NO_INPUT, type MoveInput } from '../../../../engine/characterMotion';
import { createCharacter, type Character } from '../physics/characterController';
import type { PhysicsWorld, Vec3 } from '../physics/rapierWorld';
import type { PortalStepThroughResult } from './portalCollision';

// PR #6 integration (03/11/2026): the player walks the Multiverse room on Rapier (physics/
// characterController.ts) and the portal's THREE.Box3 collider (portalCollision.ts) is checked on
// every movement step, swept from the previous to the new position so a fast step can't tunnel.
//
//   portal locked / charging   walking into the arch does nothing (it is scenery)
//   portal STABILIZED          stepping through it → WARP_TRANSITION: `onTraverse` (the quest
//                              machine's traverseStabilizedPortal, the next room on the SAME WebGL
//                              context), and the player is placed at the new room's entry point.
//
// Nothing here pays or scores: stabilisation comes from the server (squad quorum / stone result).

export interface PortalTraverse {
  result: PortalStepThroughResult;
  /** Feet position before and after the step that crossed the plane. */
  from: Vec3;
  to: Vec3;
}

export interface PortalExplorerOptions {
  /** Entry point of a room (feet), facing the portal. */
  spawn: Vec3;
  /** `sceneHandle.checkPortalStepThrough(prev, next, autoAdvanceTheme)` or the collider directly. */
  checkPortal: (prev: [number, number, number], next: [number, number, number]) => PortalStepThroughResult;
  /** The player went through a stabilised portal. */
  onTraverse?: (t: PortalTraverse) => void;
  /** Facing at spawn (rad, 0 = towards −Z). */
  facing?: number;
}

export interface PortalExplorer {
  readonly character: Character;
  /**
   * One frame: physics steps (fixed 60 Hz) with this input, then the portal check on the frame's
   * movement. Returns the traverse when it happened this frame.
   */
  step(dt: number, input: MoveInput, cameraYaw: number): PortalTraverse | null;
  /** Back to the room's entry point (after a warp, or a fall). */
  respawn(): void;
  dispose(): void;
}

const tuple = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

export function createPortalExplorer(phys: PhysicsWorld, opts: PortalExplorerOptions): PortalExplorer {
  const character = createCharacter(phys, { position: opts.spawn, facing: opts.facing ?? 0 });
  // Short cool-down after a warp so the arrival frame never triggers the next portal.
  let lockedFrames = 0;

  return {
    character,
    step(dt, input = NO_INPUT, cameraYaw) {
      const from = { ...character.position };
      phys.step(dt, (h) => character.update(input, cameraYaw, h));
      const to = { ...character.position };
      if (to.y < -20) {
        character.teleport(opts.spawn, opts.facing ?? 0); // fell out of the world
        return null;
      }
      if (lockedFrames > 0) {
        lockedFrames -= 1;
        return null;
      }
      if (from.x === to.x && from.y === to.y && from.z === to.z) return null;
      const result = opts.checkPortal(tuple(from), tuple(to));
      if (!result.triggeredWarp) return null;
      const t: PortalTraverse = { result, from, to };
      character.teleport(opts.spawn, opts.facing ?? 0);
      lockedFrames = 30;
      opts.onTraverse?.(t);
      return t;
    },
    respawn() {
      character.teleport(opts.spawn, opts.facing ?? 0);
    },
    dispose() {
      character.dispose();
    },
  };
}
