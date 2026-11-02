'use client';

import * as THREE from 'three';
import { lib, type AssetQuality } from '../../../../config/assetLibrary';
import { THREE_ASSET_MANIFEST } from '../../../../config/threeAssets';
import { disposeObject, glow, lerp, lowpoly, mesh, swapInGlb, textSprite } from '../../kit';

export type TagNetOwnerState = 'pursuers' | 'snatched' | 'crate_idle';

export interface TagNetOptions {
  /** Initial position of the Tag Net station / spare crate [x, y, z]. */
  stationPosition?: [number, number, number];
  /** Initial owner state (`pursuers` orange vs `snatched` escaper blue). */
  initialOwner?: TagNetOwnerState;
  quality?: AssetQuality;
}

export interface TagNetRig {
  readonly group: THREE.Group;
  readonly netCanopy: THREE.Group;
  readonly launcherGroup: THREE.Group;
  readonly owner: TagNetOwnerState;
  /** Switch visual ownership between Pursuers (`pursuers`), Snatched by Escapers (`snatched`), or Crate (`crate_idle`). */
  setOwnerState(next: TagNetOwnerState, chargesLeft?: number): void;
  /** Launch the 3D Tag Net along a parabolic arc from `from` to `to` to tag or freeze a player. */
  throwNet(from: [number, number, number], to: [number, number, number]): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

/**
 * Builds the 3D "Tag Net" (Lưới Gắn Thẻ) visual representation for River Survival ("Cướp Lưới").
 * Includes:
 * 1. Spare Net Crate (`surv_crate_1`) & Net Launcher (`surv_net_launcher_a` / `surv_capture_net`)
 * 2. Woven 3D Tag Net canopy (`fish_net` + glowing wireframe dome + weighted corner floats)
 * 3. Parabolic throw & expansion animation (`throwNet`) with zero per-frame allocations.
 */
export function createTagNet(opts: TagNetOptions = {}): TagNetRig {
  const {
    stationPosition = [5.2, 0, 2.8],
    initialOwner = 'pursuers',
    quality = 'high',
  } = opts;

  let alive = true;
  const isAlive = () => alive;
  let currentOwner: TagNetOwnerState = initialOwner;

  const group = new THREE.Group();
  group.name = 'river-survival-tag-net';
  group.userData = {
    kind: 'tag_net',
    owner: currentOwner,
  };

  const pursuerHex = new THREE.Color(
    THREE_ASSET_MANIFEST.gameModes.river_survival.palette.pursuers,
  ).getHex();
  const escaperHex = new THREE.Color(
    THREE_ASSET_MANIFEST.gameModes.river_survival.palette.escapers,
  ).getHex();

  // 1. Spare Tag Net Crate & Launcher Station at `stationPosition`
  const stationGroup = new THREE.Group();
  stationGroup.position.set(stationPosition[0], stationPosition[1], stationPosition[2]);

  const crateHolder = new THREE.Group();
  const crateBox = mesh(
    new THREE.BoxGeometry(1.15, 0.72, 0.85),
    lowpoly(0x92400e, { rough: 0.88 }),
    [0, 0.36, 0],
  );
  crateBox.castShadow = true;
  crateBox.receiveShadow = true;
  crateHolder.add(crateBox);
  swapInGlb(crateHolder, lib('surv_crate_1', quality), 0.78, isAlive);
  stationGroup.add(crateHolder);

  // Net launcher mounted above the crate (`surv_net_launcher_a`)
  const launcherGroup = new THREE.Group();
  launcherGroup.position.set(0, 0.82, 0);
  const launcherBarrel = mesh(
    new THREE.CylinderGeometry(0.14, 0.18, 0.75, 10),
    lowpoly(0xf97316, { metal: 0.3, rough: 0.5 }),
    [0, 0.2, 0],
  );
  launcherBarrel.rotation.x = Math.PI / 3;
  launcherGroup.add(launcherBarrel);
  swapInGlb(launcherGroup, lib('surv_net_launcher_a', quality), 0.75, isAlive);
  stationGroup.add(launcherGroup);

  // Glowing station aura ring
  const auraMat = glow(pursuerHex, 0.55, true);
  auraMat.side = THREE.DoubleSide;
  const auraRing = mesh(
    new THREE.RingGeometry(0.95, 1.32, 32),
    auraMat,
    [0, 0.05, 0],
  );
  auraRing.rotation.x = -Math.PI / 2;
  stationGroup.add(auraRing);

  const stationLabel = textSprite('🕸️ Lưới Gắn Thẻ (Tag Net)', {
    color: '#fff7ed',
    bg: 'rgba(234,88,12,0.92)',
    border: '#fcd34d',
    height: 0.48,
  });
  stationLabel.position.set(0, 2.25, 0);
  stationGroup.add(stationLabel);
  group.add(stationGroup);

  // 2. Woven 3D Tag Net Canopy (floats above launcher when idle, or flies along throw trajectory)
  const netCanopy = new THREE.Group();
  netCanopy.name = 'tag-net-canopy';
  netCanopy.position.set(stationPosition[0], stationPosition[1] + 1.45, stationPosition[2]);

  // Glowing dome lattice representing the woven net mesh
  const domeGeo = new THREE.SphereGeometry(1.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const domeWireMat = new THREE.MeshBasicMaterial({
    color: pursuerHex,
    wireframe: true,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
  });
  const domeWire = new THREE.Mesh(domeGeo, domeWireMat);
  netCanopy.add(domeWire);

  // Inner translucent energy web
  const domeFillMat = glow(pursuerHex, 0.22, true);
  domeFillMat.side = THREE.DoubleSide;
  const domeFill = new THREE.Mesh(domeGeo, domeFillMat);
  netCanopy.add(domeFill);

  // Weighted rim ring + 6 glowing corner sinkers
  const rimMat = glow(0xfcd34d, 0.85, true);
  const rimTorus = mesh(new THREE.TorusGeometry(1.08, 0.045, 8, 28), rimMat, [0, 0.12, 0]);
  rimTorus.rotation.x = Math.PI / 2;
  netCanopy.add(rimTorus);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sinker = mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      lowpoly(0xfbbf24, { emissive: 0xf59e0b, glow: 0.5 }),
      [Math.cos(a) * 1.08, 0.08, Math.sin(a) * 1.08],
    );
    netCanopy.add(sinker);
  }

  // Catalog `fish_net` model swapped into a sub-holder inside the canopy for extra detail
  const netModelHolder = new THREE.Group();
  netModelHolder.position.set(0, 0.15, 0);
  swapInGlb(netModelHolder, lib('fish_net', quality), 1.4, isAlive);
  netCanopy.add(netModelHolder);

  group.add(netCanopy);

  // Pre-allocated throw state (zero per-frame allocations)
  const throwFrom = new THREE.Vector3(stationPosition[0], stationPosition[1] + 1.45, stationPosition[2]);
  const throwTo = new THREE.Vector3(stationPosition[0], stationPosition[1] + 0.2, stationPosition[2]);
  let throwElapsed = -1;
  const throwDuration = 1.1;

  const applyOwnerColors = (state: TagNetOwnerState) => {
    const col = state === 'snatched' ? escaperHex : state === 'pursuers' ? pursuerHex : 0xfbbf24;
    domeWireMat.color.setHex(col);
    domeFillMat.color.setHex(col);
    auraMat.color.setHex(col);
  };
  applyOwnerColors(currentOwner);

  return {
    group,
    netCanopy,
    launcherGroup,
    get owner() {
      return currentOwner;
    },
    setOwnerState(next: TagNetOwnerState, chargesLeft = 3) {
      currentOwner = next;
      group.userData.owner = next;
      group.userData.chargesLeft = chargesLeft;
      applyOwnerColors(next);
    },
    throwNet(from: [number, number, number], to: [number, number, number]) {
      throwFrom.set(from[0], from[1] + 1.1, from[2]);
      throwTo.set(to[0], to[1] + 0.15, to[2]);
      throwElapsed = 0;
    },
    update(dt: number, t: number) {
      launcherGroup.rotation.y = Math.sin(t * 1.2) * 0.35;
      auraRing.scale.setScalar(1 + Math.sin(t * 3.2) * 0.06);

      if (throwElapsed >= 0) {
        throwElapsed += dt;
        const p = Math.min(1, throwElapsed / throwDuration);
        const arcY = Math.sin(p * Math.PI) * 2.8;
        netCanopy.position.set(
          lerp(throwFrom.x, throwTo.x, p),
          lerp(throwFrom.y, throwTo.y, p) + arcY,
          lerp(throwFrom.z, throwTo.z, p),
        );
        const scale = lerp(0.55, 1.35, p);
        netCanopy.scale.setScalar(scale);
        netCanopy.rotation.y += dt * 5.5;

        if (throwElapsed >= throwDuration + 0.65) {
          throwElapsed = -1;
          netCanopy.scale.setScalar(0.85);
        }
      } else {
        // Hover & spin gently above the Tag Net station
        netCanopy.position.set(
          stationPosition[0],
          stationPosition[1] + 1.48 + Math.sin(t * 2.4) * 0.12,
          stationPosition[2],
        );
        netCanopy.scale.setScalar(0.85 + Math.sin(t * 3.0) * 0.04);
        netCanopy.rotation.y = t * 0.85;
      }
    },
    dispose() {
      alive = false;
      group.removeFromParent();
      disposeObject(group);
    },
  };
}
