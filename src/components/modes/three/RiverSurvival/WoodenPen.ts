'use client';

import * as THREE from 'three';
import { lib, type AssetQuality } from '../../../../config/assetLibrary';
import { damp, disposeObject, glow, lowpoly, mesh, roughen, swapInGlb, textSprite } from '../../kit';
import { computePenSlotPositions, type SurvivalZoneId } from './zones';

export interface WoodenPenOptions {
  zoneId: SurvivalZoneId;
  labelVi?: string;
  position: [number, number, number];
  radius?: number;
  capacity?: number;
  quality?: AssetQuality;
  isMainPen?: boolean;
}

export interface WoodenPenRig {
  readonly group: THREE.Group;
  readonly zoneId: SurvivalZoneId;
  readonly slotPositions: ReadonlyArray<[number, number, number]>;
  /** Open or close the rope-bound wooden gate (e.g. during rescue or initial escape). */
  setGateOpen(open: boolean): void;
  /** Highlight the number of tagged Escapers currently held in this pen (0..capacity). */
  setTaggedCount(count: number): void;
  /** Pulse the cipher table beacon when a captive player solves a clue letter. */
  pulseCipherClue(): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * Builds the 3D "Wooden Pen" (Chuồng Gỗ) holding enclosure for River Survival ("Cướp Lưới").
 * - Assembled with catalog assets (`surv_pen_wall_stone`, `surv_pen_wall_window`, `river_fence`,
 *   `surv_stake_1`, `surv_rope`, `surv_sharp_rock`, `surv_letter_1`, `ground_cobble_circle`)
 *   with stylized low-poly procedural geometry that swaps in GLBs from Cloudflare R2 / `/dev-assets`.
 * - Non-scary, playful camp enclosure where tagged players solve cipher clues (`surv_letter_1`)
 *   and can be rescued when a teammate opens the gate.
 */
export function createWoodenPen(opts: WoodenPenOptions): WoodenPenRig {
  const {
    zoneId,
    labelVi = '🪵 Chuồng Gỗ (Giải mật thư & Giải cứu)',
    position,
    radius = 3.6,
    capacity = 8,
    quality = 'high',
    isMainPen = false,
  } = opts;

  let alive = true;
  const isAlive = () => alive;

  const group = new THREE.Group();
  group.name = `wooden-pen-${zoneId}`;
  group.position.set(position[0], position[1], position[2]);
  group.userData = {
    kind: 'wooden_pen',
    zoneId,
    isMainPen,
  };

  // 1. Cobble/timber base floor (`ground_cobble_circle`)
  const floorHolder = new THREE.Group();
  const floorDisc = mesh(
    roughen(new THREE.CylinderGeometry(radius + 0.4, radius + 0.6, 0.16, 20, 1), 0.02, 11),
    lowpoly(0x6b5b45, { rough: 0.95 }),
    [0, 0.06, 0],
  );
  floorDisc.receiveShadow = true;
  floorHolder.add(floorDisc);
  swapInGlb(floorHolder, lib('ground_cobble_circle', quality), 0.35, isAlive);
  group.add(floorHolder);

  // Perimeter glowing ring (friendly sky-blue when open, warm amber when holding captives)
  const perimeterRingMat = glow(0xf97316, 0.42, true);
  const perimeterRing = mesh(
    new THREE.RingGeometry(radius - 0.12, radius + 0.15, 36),
    perimeterRingMat,
    [0, 0.16, 0],
  );
  perimeterRing.rotation.x = -Math.PI / 2;
  group.add(perimeterRing);

  // 2. Perimeter wooden fences, stone-timber pen walls, and windowed wall (`surv_pen_wall_window`)
  const wallCount = 8;
  for (let i = 0; i < wallCount; i++) {
    // Leave slot i === 0 at the front (+Z) for the hinged wooden gate
    if (i === 0) continue;
    const angle = (i / wallCount) * Math.PI * 2 + Math.PI / 2;
    const wx = Math.cos(angle) * radius;
    const wz = Math.sin(angle) * radius;

    const segmentHolder = new THREE.Group();
    segmentHolder.position.set(wx, 0.12, wz);
    segmentHolder.rotation.y = -angle + Math.PI / 2;

    // Procedural timber post + rails stand-in
    const postLeft = mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 1.55, 7),
      lowpoly(0x78350f, { rough: 0.9 }),
      [-0.95, 0.77, 0],
    );
    const postRight = mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 1.55, 7),
      lowpoly(0x78350f, { rough: 0.9 }),
      [0.95, 0.77, 0],
    );
    const railTop = mesh(
      new THREE.BoxGeometry(2.0, 0.16, 0.12),
      lowpoly(0x92400e, { rough: 0.88 }),
      [0, 1.2, 0],
    );
    const railMid = mesh(
      new THREE.BoxGeometry(2.0, 0.16, 0.12),
      lowpoly(0x92400e, { rough: 0.88 }),
      [0, 0.65, 0],
    );
    segmentHolder.add(postLeft, postRight, railTop, railMid);

    // Alternate catalog models: windowed pen wall at the back, stone-timber wall on sides, river_fence on diagonals
    const assetId =
      i === 4
        ? 'surv_pen_wall_window'
        : i === 2 || i === 6
          ? 'surv_pen_wall_stone'
          : i % 2 === 1
            ? 'river_fence'
            : 'river_fence__alt1';
    swapInGlb(segmentHolder, lib(assetId, quality), 1.55, isAlive);
    group.add(segmentHolder);

    // Corner wooden stake (`surv_stake_1`)
    const stakeHolder = new THREE.Group();
    stakeHolder.position.set(wx * 1.04, 0.12, wz * 1.04);
    const stakeMesh = mesh(
      new THREE.ConeGeometry(0.12, 1.1, 6),
      lowpoly(0x5c2d0c, { rough: 0.9 }),
      [0, 0.55, 0],
    );
    stakeHolder.add(stakeMesh);
    swapInGlb(stakeHolder, lib('surv_stake_1', quality), 1.0, isAlive);
    group.add(stakeHolder);
  }

  // 3. Hinged Wooden Gate + Rope coil (`surv_rope`) + Sharp Rock (`surv_sharp_rock`) near the gate
  const gatePivot = new THREE.Group();
  gatePivot.position.set(-1.05, 0.12, radius);
  const gatePanel = new THREE.Group();
  const gateFrame = mesh(
    new THREE.BoxGeometry(2.1, 1.35, 0.14),
    lowpoly(0xb45309, { rough: 0.85 }),
    [1.05, 0.72, 0],
  );
  gatePanel.add(gateFrame);
  swapInGlb(gatePanel, lib('river_fence__alt2', quality), 1.35, isAlive);
  gatePivot.add(gatePanel);

  // Rope knot on gate (`surv_rope`)
  const ropeHolder = new THREE.Group();
  ropeHolder.position.set(1.9, 0.8, 0.12);
  const ropeTorus = mesh(
    new THREE.TorusGeometry(0.18, 0.05, 8, 16),
    lowpoly(0xd97706, { rough: 0.8 }),
  );
  ropeHolder.add(ropeTorus);
  swapInGlb(ropeHolder, lib('surv_rope', quality), 0.45, isAlive);
  gatePivot.add(ropeHolder);
  group.add(gatePivot);

  // Sharp rock beside the fence (`surv_sharp_rock` — stage 1 story prop used to cut the rope)
  const sharpRockHolder = new THREE.Group();
  sharpRockHolder.position.set(1.65, 0.12, radius + 0.45);
  const sharpRockMesh = mesh(
    roughen(new THREE.OctahedronGeometry(0.32, 0), 0.04, 5),
    lowpoly(0x64748b, { rough: 0.75 }),
    [0, 0.25, 0],
  );
  sharpRockHolder.add(sharpRockMesh);
  swapInGlb(sharpRockHolder, lib('surv_sharp_rock', quality), 0.55, isAlive);
  group.add(sharpRockHolder);

  // 4. Center Cipher Table & Clue Letter (`surv_letter_1`) so captives actively help their team
  const cipherGroup = new THREE.Group();
  cipherGroup.position.set(0, 0.14, 0);
  const tableStump = mesh(
    new THREE.CylinderGeometry(0.55, 0.65, 0.68, 10),
    lowpoly(0x78350f, { rough: 0.9 }),
    [0, 0.34, 0],
  );
  cipherGroup.add(tableStump);

  const letterHolder = new THREE.Group();
  letterHolder.position.set(0, 0.72, 0);
  const letterSheet = mesh(
    new THREE.BoxGeometry(0.46, 0.04, 0.34),
    lowpoly(0xfef3c7, { emissive: 0xfbbf24, glow: 0.35 }),
  );
  letterHolder.add(letterSheet);
  swapInGlb(letterHolder, lib('surv_letter_1', quality), 0.35, isAlive);
  cipherGroup.add(letterHolder);

  const cipherBeaconMat = glow(0x38bdf8, 0.4, true);
  const cipherBeacon = mesh(
    new THREE.CylinderGeometry(0.45, 0.55, 1.4, 16, 1, true),
    cipherBeaconMat,
    [0, 0.9, 0],
  );
  cipherBeaconMat.side = THREE.DoubleSide;
  cipherGroup.add(cipherBeacon);
  group.add(cipherGroup);

  // 5. Captive holding slots (friendly glowing pads for tagged players inside the pen)
  const worldSlots = computePenSlotPositions(position, capacity, radius * 0.56);
  const localSlots = computePenSlotPositions([0, 0.16, 0], capacity, radius * 0.56);
  const slotMeshes: THREE.Mesh[] = [];
  const slotMaterials: THREE.MeshBasicMaterial[] = [];

  for (let i = 0; i < localSlots.length; i++) {
    const [sx, sy, sz] = localSlots[i];
    const smat = glow(0x38bdf8, 0.18, true);
    const sring = mesh(new THREE.RingGeometry(0.28, 0.42, 20), smat, [sx, sy, sz]);
    sring.rotation.x = -Math.PI / 2;
    group.add(sring);
    slotMeshes.push(sring);
    slotMaterials.push(smat);
  }

  // 6. Overhead label sprite
  const banner = textSprite(labelVi, {
    color: '#fef3c7',
    bg: isMainPen ? 'rgba(180,83,9,0.92)' : 'rgba(15,23,42,0.88)',
    border: '#fcd34d',
    height: 0.52,
  });
  banner.position.set(0, 2.45, 0);
  group.add(banner);

  let targetGateAngle = 0;
  let currentGateAngle = 0;
  let taggedCount = 0;
  let cluePulseTimer = 0;

  return {
    group,
    zoneId,
    slotPositions: worldSlots,
    setGateOpen(open: boolean) {
      targetGateAngle = open ? -Math.PI * 0.62 : 0;
      perimeterRingMat.color.setHex(open ? 0x34d399 : 0xf97316);
    },
    setTaggedCount(count: number) {
      taggedCount = Math.max(0, Math.min(capacity, Math.round(count)));
      for (let i = 0; i < slotMaterials.length; i++) {
        const occupied = i < taggedCount;
        slotMaterials[i].color.setHex(occupied ? 0xfbbf24 : 0x38bdf8);
        slotMaterials[i].opacity = occupied ? 0.78 : 0.18;
      }
    },
    pulseCipherClue() {
      cluePulseTimer = 1.2;
    },
    update(dt: number, t: number) {
      currentGateAngle = damp(currentGateAngle, targetGateAngle, 7, dt);
      gatePivot.rotation.y = currentGateAngle;

      if (cluePulseTimer > 0) {
        cluePulseTimer = Math.max(0, cluePulseTimer - dt);
        cipherBeaconMat.opacity = 0.35 + Math.sin(t * 14) * 0.3;
        cipherBeacon.scale.setScalar(1 + cluePulseTimer * 0.25);
      } else {
        cipherBeaconMat.opacity = 0.22 + Math.sin(t * 2.5) * 0.08;
        cipherBeacon.scale.setScalar(1);
      }

      letterHolder.position.y = 0.72 + Math.sin(t * 3.0) * 0.04;
      letterHolder.rotation.y = t * 0.6;
    },
    dispose() {
      alive = false;
      group.removeFromParent();
      disposeObject(group);
    },
  };
}
