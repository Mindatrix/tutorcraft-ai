import * as THREE from 'three';

// ============================================================================
// GDS-TC-2026-EXP v2.6 — §3.2 & §6.1 Spatial Portal Collision Detection
// Implements AABB bounding-box collision using `THREE.Box3` along the Render
// Target Portal plane (plus swept-AABB / diagonal plane crossing for 45°
// step-through `QA-P04`) to trigger `WARP_TRANSITION` without resetting WebGL.
// ============================================================================

export interface PortalPlaneColliderConfig {
  /** World-space center of the Render Target Portal aperture `[x, y, z]`. */
  center?: [number, number, number];
  /** Portal aperture width (X axis, meters). */
  width?: number;
  /** Portal aperture height (Y axis, meters). */
  height?: number;
  /** Portal plane thickness (Z axis slab depth, meters). */
  thickness?: number;
  /** Player capsule radius (meters). */
  playerRadius?: number;
  /** Player capsule height (meters). */
  playerHeight?: number;
}

export interface PortalStepThroughResult {
  readonly collided: boolean;
  readonly crossedPlane: boolean;
  readonly triggeredWarp: boolean;
  /** Approach angle in degrees relative to the portal normal (e.g., 0° head-on, 45° diagonal). */
  readonly approachAngleDeg: number;
  readonly intersectionPoint: [number, number, number] | null;
}

export interface SpatialPortalCollider {
  readonly portalBox: THREE.Box3;
  readonly playerBox: THREE.Box3;
  readonly sweptPlayerBox: THREE.Box3;
  readonly portalCenter: THREE.Vector3;
  readonly portalNormal: THREE.Vector3;
  setPortalTransform(center: [number, number, number]): void;
  /**
   * Evaluates whether a player moving from `prevPos` to `nextPos` intersects or
   * steps through the Render Target Portal plane AABB (`THREE.Box3.intersectsBox`).
   * Works for head-on (0°) as well as diagonal (e.g., 45° `QA-P04`) trajectories.
   */
  detectStepThrough(
    prevPos: [number, number, number] | THREE.Vector3,
    nextPos: [number, number, number] | THREE.Vector3,
    portalStabilized?: boolean,
  ): PortalStepThroughResult;
}

function toVec3(v: [number, number, number] | THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  if (Array.isArray(v)) {
    return target.set(v[0], v[1], v[2]);
  }
  return target.copy(v);
}

export function createSpatialPortalCollider(
  config: PortalPlaneColliderConfig = {},
): SpatialPortalCollider {
  const centerArr = config.center ?? [0, 2.2, -2.0];
  const halfW = (config.width ?? 3.6) * 0.5;
  const halfH = (config.height ?? 4.4) * 0.5;
  const halfD = (config.thickness ?? 0.65) * 0.5;
  const playerRadius = config.playerRadius ?? 0.35;
  const playerHeight = config.playerHeight ?? 1.5;

  const portalCenter = new THREE.Vector3(centerArr[0], centerArr[1], centerArr[2]);
  const portalNormal = new THREE.Vector3(0, 0, 1);

  const portalBox = new THREE.Box3();
  const playerBox = new THREE.Box3();
  const sweptPlayerBox = new THREE.Box3();
  const prevBox = new THREE.Box3();

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const moveVec = new THREE.Vector3();
  const moveHorizontal = new THREE.Vector3();

  function rebuildPortalBox() {
    portalBox.min.set(
      portalCenter.x - halfW,
      Math.max(0, portalCenter.y - halfH),
      portalCenter.z - halfD,
    );
    portalBox.max.set(
      portalCenter.x + halfW,
      portalCenter.y + halfH,
      portalCenter.z + halfD,
    );
  }

  function buildCapsuleBoxAt(footPos: THREE.Vector3, out: THREE.Box3) {
    out.min.set(
      footPos.x - playerRadius,
      footPos.y,
      footPos.z - playerRadius,
    );
    out.max.set(
      footPos.x + playerRadius,
      footPos.y + playerHeight,
      footPos.z + playerRadius,
    );
  }

  rebuildPortalBox();

  return {
    portalBox,
    playerBox,
    sweptPlayerBox,
    portalCenter,
    portalNormal,

    setPortalTransform(center: [number, number, number]) {
      portalCenter.set(center[0], center[1], center[2]);
      rebuildPortalBox();
    },

    detectStepThrough(prevPos, nextPos, portalStabilized = true) {
      toVec3(prevPos, p0);
      toVec3(nextPos, p1);

      buildCapsuleBoxAt(p0, prevBox);
      buildCapsuleBoxAt(p1, playerBox);
      sweptPlayerBox.copy(prevBox).union(playerBox);

      // Compute horizontal approach angle relative to the portal Z normal (0° = straight along Z, 45° = diagonal)
      moveVec.subVectors(p1, p0);
      moveHorizontal.set(moveVec.x, 0, moveVec.z);
      let approachAngleDeg = 0;
      const horizLen = moveHorizontal.length();
      if (horizLen > 1e-5) {
        const cosTheta = Math.min(1, Math.max(-1, Math.abs(moveHorizontal.z) / horizLen));
        approachAngleDeg = Number(((Math.acos(cosTheta) * 180) / Math.PI).toFixed(2));
      }

      // 1. Direct or swept THREE.Box3 AABB intersection
      const boxHit =
        portalBox.intersectsBox(playerBox) || portalBox.intersectsBox(sweptPlayerBox);

      // 2. Exact plane crossing along Z = portalCenter.z for high-speed or diagonal step-through
      const dz0 = p0.z - portalCenter.z;
      const dz1 = p1.z - portalCenter.z;
      const straddlesPlane = (dz0 >= 0 && dz1 <= 0) || (dz0 <= 0 && dz1 >= 0);

      let intersectionPoint: [number, number, number] | null = null;
      let crossedWithinAperture = false;

      if (straddlesPlane && Math.abs(p1.z - p0.z) > 1e-6) {
        const t = (portalCenter.z - p0.z) / (p1.z - p0.z);
        const ix = p0.x + (p1.x - p0.x) * t;
        const iy = p0.y + (p1.y - p0.y) * t;
        const iz = portalCenter.z;
        if (
          ix >= portalBox.min.x - playerRadius &&
          ix <= portalBox.max.x + playerRadius &&
          iy + playerHeight >= portalBox.min.y &&
          iy <= portalBox.max.y
        ) {
          crossedWithinAperture = true;
          intersectionPoint = [Number(ix.toFixed(3)), Number(iy.toFixed(3)), Number(iz.toFixed(3))];
        }
      } else if (boxHit) {
        intersectionPoint = [
          Number(p1.x.toFixed(3)),
          Number(p1.y.toFixed(3)),
          Number(p1.z.toFixed(3)),
        ];
      }

      const collided = boxHit || crossedWithinAperture;
      const crossedPlane = crossedWithinAperture || (boxHit && Math.abs(dz1) <= halfD + playerRadius);
      const triggeredWarp = Boolean(portalStabilized && collided && crossedPlane);

      return {
        collided,
        crossedPlane,
        triggeredWarp,
        approachAngleDeg,
        intersectionPoint,
      };
    },
  };
}
