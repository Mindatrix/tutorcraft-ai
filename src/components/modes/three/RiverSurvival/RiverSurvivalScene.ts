'use client';

import * as THREE from 'three';
import { lib, type AssetQuality } from '../../../../config/assetLibrary';
import { disposeObject, glow, lowpoly, mesh, roughen, swapInGlb, textSprite } from '../../kit';
import { createRuntime, type GfxTier, type SceneRuntime } from '../SceneRuntime';
import type { CameraDirector } from '../cameraDirector';
import { createTagNet, type TagNetOwnerState, type TagNetRig } from './TagNet';
import { createWoodenPen, type WoodenPenRig } from './WoodenPen';
import {
  RIVER_SURVIVAL_ZONES,
  type SurvivalZoneId,
  type SurvivalZoneSpec,
  type ZoneAssetPlacement,
} from './zones';

export interface RiverSurvivalEnvOptions {
  tier?: GfxTier;
  director?: CameraDirector;
  /** Number of tagged Escapers initially shown inside the main Wooden Pen. */
  initialTaggedCount?: number;
  /** Initial Tag Net owner state (`pursuers` | `snatched` | `crate_idle`). */
  initialNetOwner?: TagNetOwnerState;
}

export interface RiverSurvivalEnvironment {
  readonly rootGroup: THREE.Group;
  readonly zoneGroups: Record<SurvivalZoneId, THREE.Group>;
  readonly woodenPens: Record<SurvivalZoneId, WoodenPenRig>;
  readonly mainWoodenPen: WoodenPenRig;
  readonly tagNet: TagNetRig;
  /** Focus or dolly camera to one of the 3 zones (`zone_alpha`, `zone_bravo`, `zone_charlie`). */
  focusZone(zoneId: SurvivalZoneId): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * Creates a stylized low-poly stand-in for a catalog placement (`ground`, `tree`, `hide_spot`, `fence`, `prop`)
 * and swaps in the real `.glb` from the Cloudflare R2 / local asset catalog via `swapInGlb`.
 */
function buildCatalogPlacement(
  placement: ZoneAssetPlacement,
  quality: AssetQuality,
  isAlive: () => boolean,
): THREE.Group {
  const holder = new THREE.Group();
  holder.name = `asset-${placement.id}`;
  holder.position.set(placement.offset[0], placement.offset[1], placement.offset[2]);
  holder.rotation.y = placement.rotationY;
  holder.userData = {
    assetId: placement.id,
    category: placement.category,
  };

  if (placement.category === 'tree') {
    const trunk = mesh(
      new THREE.CylinderGeometry(0.22, 0.34, placement.height * 0.35, 7),
      lowpoly(0x6b4423, { rough: 0.92 }),
      [0, placement.height * 0.17, 0],
    );
    const crown = mesh(
      roughen(new THREE.ConeGeometry(placement.height * 0.36, placement.height * 0.72, 8), 0.08, 3),
      lowpoly(0x2d6a4f, { rough: 0.88 }),
      [0, placement.height * 0.58, 0],
    );
    trunk.castShadow = true;
    crown.castShadow = true;
    holder.add(trunk, crown);
  } else if (placement.category === 'hide_spot') {
    const bush = mesh(
      roughen(new THREE.DodecahedronGeometry(placement.height * 0.55, 1), 0.06, 5),
      lowpoly(0x40916c, { rough: 0.9 }),
      [0, placement.height * 0.42, 0],
    );
    bush.castShadow = true;
    holder.add(bush);
  } else if (placement.category === 'fence') {
    const p1 = mesh(
      new THREE.CylinderGeometry(0.1, 0.12, placement.height, 6),
      lowpoly(0x78350f, { rough: 0.9 }),
      [-0.9, placement.height * 0.5, 0],
    );
    const p2 = mesh(
      new THREE.CylinderGeometry(0.1, 0.12, placement.height, 6),
      lowpoly(0x78350f, { rough: 0.9 }),
      [0.9, placement.height * 0.5, 0],
    );
    const rail1 = mesh(
      new THREE.BoxGeometry(2.0, 0.14, 0.1),
      lowpoly(0x92400e, { rough: 0.88 }),
      [0, placement.height * 0.78, 0],
    );
    const rail2 = mesh(
      new THREE.BoxGeometry(2.0, 0.14, 0.1),
      lowpoly(0x92400e, { rough: 0.88 }),
      [0, placement.height * 0.42, 0],
    );
    holder.add(p1, p2, rail1, rail2);
  } else if (placement.category === 'ground') {
    const slab = mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.1, 16),
      lowpoly(0x52796f, { rough: 0.98 }),
      [0, 0.04, 0],
    );
    slab.receiveShadow = true;
    holder.add(slab);
  } else {
    const propMesh = mesh(
      new THREE.BoxGeometry(placement.height * 0.7, placement.height * 0.7, placement.height * 0.7),
      lowpoly(0xd97706, { rough: 0.8 }),
      [0, placement.height * 0.35, 0],
    );
    holder.add(propMesh);
  }

  swapInGlb(holder, lib(placement.id, quality), placement.height, isAlive);
  return holder;
}

/**
 * Builds a single River Survival zone (`zone_alpha`, `zone_bravo`, or `zone_charlie`)
 * with its terrain disc, boundary ring, catalog trees, ground patches, simple fences, and hide spots.
 */
function buildZoneGroup(
  spec: SurvivalZoneSpec,
  quality: AssetQuality,
  isAlive: () => boolean,
): THREE.Group {
  const zoneGroup = new THREE.Group();
  zoneGroup.name = spec.id;
  zoneGroup.position.set(spec.center[0], spec.center[1], spec.center[2]);
  zoneGroup.userData = {
    kind: 'river_survival_zone',
    zoneId: spec.id,
    code: spec.code,
    nameVi: spec.nameVi,
  };

  // Base terrain plateau for the zone
  const plateau = mesh(
    roughen(new THREE.CylinderGeometry(spec.radius, spec.radius + 1.4, 0.45, 28, 1), 0.05, 9),
    lowpoly(spec.groundHex, { rough: 0.95 }),
    [0, -0.22, 0],
  );
  plateau.receiveShadow = true;
  zoneGroup.add(plateau);

  // Zone boundary glowing ring
  const accentColor = new THREE.Color(spec.accentHex).getHex();
  const ringMat = glow(accentColor, 0.28, true);
  ringMat.side = THREE.DoubleSide;
  const boundaryRing = mesh(
    new THREE.RingGeometry(spec.radius - 0.35, spec.radius, 48),
    ringMat,
    [0, 0.03, 0],
  );
  boundaryRing.rotation.x = -Math.PI / 2;
  zoneGroup.add(boundaryRing);

  // Assemble catalog placements (ground, trees, hide spots, simple fences, props)
  for (const placement of spec.placements) {
    zoneGroup.add(buildCatalogPlacement(placement, quality, isAlive));
  }

  // Zone sign sprite
  const zoneBanner = textSprite(`${spec.nameVi}`, {
    color: '#ffffff',
    bg: 'rgba(15,23,42,0.88)',
    border: spec.accentHex,
    height: 0.62,
  });
  zoneBanner.position.set(0, 4.2, -spec.radius * 0.55);
  zoneGroup.add(zoneBanner);

  return zoneGroup;
}

/**
 * Assembles the foundational 3D scene for "River Survival" (Cướp Lưới):
 * - 3 distinct zones (`zone_alpha`, `zone_bravo`, `zone_charlie`) connected across a flowing river
 * - "Wooden Pen" (Chuồng Gỗ) holding enclosures (`createWoodenPen`)
 * - "Tag Net" (Lưới Gắn Thẻ) launcher & woven canopy (`createTagNet`)
 */
export function buildRiverSurvivalEnvironment(
  opts: RiverSurvivalEnvOptions = {},
): RiverSurvivalEnvironment {
  const {
    tier = 'high',
    director,
    initialTaggedCount = 2,
    initialNetOwner = 'pursuers',
  } = opts;

  const quality: AssetQuality = tier === 'low' ? 'low' : 'high';
  let alive = true;
  const isAlive = () => alive;

  const rootGroup = new THREE.Group();
  rootGroup.name = 'river-survival-root';

  // 1. Valley meadow floor & flowing river channel separating/linking the 3 zones
  const valleyFloor = mesh(
    new THREE.PlaneGeometry(140, 110),
    lowpoly(0x1f3a2d, { rough: 1 }),
    [0, -0.45, 0],
  );
  valleyFloor.rotation.x = -Math.PI / 2;
  valleyFloor.receiveShadow = true;
  rootGroup.add(valleyFloor);

  const riverWaterMat = lowpoly(0x167a8a, {
    rough: 0.25,
    metal: 0.1,
    emissive: 0x0f4c5c,
    glow: 0.35,
  });
  const riverStream = mesh(
    new THREE.PlaneGeometry(120, 14, 32, 8),
    riverWaterMat,
    [0, -0.18, 0],
  );
  riverStream.rotation.x = -Math.PI / 2;
  riverStream.rotation.z = -0.38;
  rootGroup.add(riverStream);

  // Two wooden log bridges connecting Zone A <-> Zone B and Zone B <-> Zone C
  const bridgeOffsets: Array<[number, number, number]> = [
    [-11, 0.05, -6],
    [11, 0.05, 6],
  ];
  for (const [bx, by, bz] of bridgeOffsets) {
    const bridge = mesh(
      new THREE.BoxGeometry(6.8, 0.22, 2.2),
      lowpoly(0x78350f, { rough: 0.9 }),
      [bx, by, bz],
    );
    bridge.rotation.y = 0.55;
    bridge.receiveShadow = true;
    rootGroup.add(bridge);
  }

  // 2. Build the 3 distinct zones (`zone_alpha`, `zone_bravo`, `zone_charlie`)
  const zoneGroups = {} as Record<SurvivalZoneId, THREE.Group>;
  const woodenPens = {} as Record<SurvivalZoneId, WoodenPenRig>;

  for (const spec of RIVER_SURVIVAL_ZONES) {
    const zg = buildZoneGroup(spec, quality, isAlive);
    zoneGroups[spec.id] = zg;
    rootGroup.add(zg);

    const isMain = spec.id === 'zone_bravo';
    const pen = createWoodenPen({
      zoneId: spec.id,
      labelVi: isMain
        ? '🪵 Chuồng Gỗ Chính (Khu giữ người & Giải mật thư)'
        : `🪵 Chuồng Gỗ Khu ${spec.code}`,
      position: spec.penPosition,
      radius: isMain ? 3.8 : 3.0,
      capacity: isMain ? 10 : 6,
      quality,
      isMainPen: isMain,
    });
    if (isMain) {
      pen.setTaggedCount(initialTaggedCount);
    }
    woodenPens[spec.id] = pen;
    rootGroup.add(pen.group);

    if (director) {
      director.setAnchor(spec.id, zg);
    }
  }

  const mainWoodenPen = woodenPens.zone_bravo;

  // 3. Build the visual representation of the "Tag Net" (Lưới Gắn Thẻ) in Zone B
  const tagNet = createTagNet({
    stationPosition: RIVER_SURVIVAL_ZONES[1].netStationPosition,
    initialOwner: initialNetOwner,
    quality,
  });
  rootGroup.add(tagNet.group);

  if (director) {
    director.setAnchor('wooden_pen', mainWoodenPen.group);
    director.setAnchor('tag_net', tagNet.group);
  }

  return {
    rootGroup,
    zoneGroups,
    woodenPens,
    mainWoodenPen,
    tagNet,
    focusZone(zoneId: SurvivalZoneId) {
      const target = zoneGroups[zoneId];
      if (target && director) {
        void director.dollyTo(target, { hold: 1.4 });
      }
    },
    update(dt: number, t: number) {
      riverStream.position.y = -0.18 + Math.sin(t * 1.8) * 0.03;
      for (const z of RIVER_SURVIVAL_ZONES) {
        woodenPens[z.id].update(dt, t);
      }
      tagNet.update(dt, t);
    },
    dispose() {
      alive = false;
      for (const z of RIVER_SURVIVAL_ZONES) {
        woodenPens[z.id].dispose();
      }
      tagNet.dispose();
      rootGroup.removeFromParent();
      disposeObject(rootGroup);
    },
  };
}

export interface MountedRiverSurvivalScene {
  readonly runtime: SceneRuntime;
  readonly environment: RiverSurvivalEnvironment;
  dispose(): void;
}

/**
 * Initializes a standalone Three.js `SceneRuntime` inside `container` and mounts
 * the River Survival ("Cướp Lưới") 3-zone environment, Wooden Pen, and Tag Net.
 */
export function mountRiverSurvivalScene(
  container: HTMLElement,
  opts: RiverSurvivalEnvOptions = {},
): MountedRiverSurvivalScene {
  const tier = opts.tier ?? 'high';
  const runtime = createRuntime(container, {
    tier,
    fov: 50,
    near: 0.2,
    far: 320,
    lights: 'outdoor',
    sky: { hdri: 'day', gradient: [0x1e293b, 0x3b2f5c, 0x0f172a] },
    fog: { color: 0x1e293b, near: 28, far: 145 },
  });

  runtime.camera.position.set(0, 16, 28);
  runtime.camera.lookAt(0, 0.8, -2);

  const environment = buildRiverSurvivalEnvironment({
    ...opts,
    tier,
    director: runtime.director,
  });
  runtime.scene.add(environment.rootGroup);

  runtime.run((dt, t) => {
    environment.update(dt, t);
  });

  return {
    runtime,
    environment,
    dispose() {
      environment.dispose();
      runtime.dispose();
    },
  };
}
