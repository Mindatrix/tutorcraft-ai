import * as THREE from 'three';
import type {
  PetState,
  PhoneticStoneStateMachine,
  PhoneticStoneTarget,
} from '../../../client/phoneticStones';
import type { CameraDirector } from './cameraDirector';
import { damp, glow, lowpoly, mesh, roughen, textSprite, toon } from '../kit';
import {
  findPhoneticStoneAncestor,
  HOVER_THROTTLE_MS,
  isPhoneticStoneUserData,
  MAX_PHONETIC_STONES,
  raycastPhoneticStones,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  TapGestureTracker,
  type PhoneticStoneUserData,
  type PointerDownState,
} from './phoneticStoneRaycaster';

export {
  findPhoneticStoneAncestor,
  HOVER_THROTTLE_MS,
  isPhoneticStoneUserData,
  MAX_PHONETIC_STONES,
  raycastPhoneticStones,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  TapGestureTracker,
  type PhoneticStoneUserData,
  type PointerDownState,
};

interface StoneVisual {
  root: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  runeRing: THREE.Mesh;
  runeMat: THREE.MeshBasicMaterial;
  starMeshes: THREE.Mesh[];
  baseY: number;
  target: PhoneticStoneTarget;
}

interface PetVisual {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  earL: THREE.Mesh;
  earR: THREE.Mesh;
  mouthRing: THREE.Mesh;
  mouthMat: THREE.MeshBasicMaterial;
  listenHalo: THREE.Mesh;
  listenMat: THREE.MeshBasicMaterial;
  celebrateRing: THREE.Mesh;
  celebrateMat: THREE.MeshBasicMaterial;
}

function buildPetCompanion(): PetVisual {
  const root = new THREE.Group();
  root.name = 'phonetic-pet-companion';

  const body = new THREE.Group();
  body.position.y = 0.65;
  root.add(body);

  const furMat = toon(0xfb923c, 0x3b1504, 0.35);
  const bellyMat = toon(0xfff7e0, 0x261c08, 0.2);
  const darkMat = toon(0x1b1448);

  const torso = mesh(
    roughen(new THREE.CylinderGeometry(0.32, 0.42, 0.72, 10, 2), 0.02, 11),
    furMat,
    [0, 0, 0],
  );
  torso.castShadow = true;
  body.add(torso);

  const belly = mesh(new THREE.SphereGeometry(0.28, 10, 8), bellyMat, [0, -0.02, 0.16]);
  belly.scale.set(0.85, 1.05, 0.45);
  body.add(belly);

  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.04);
  body.add(head);

  const skull = mesh(roughen(new THREE.SphereGeometry(0.36, 12, 10), 0.015, 19), furMat);
  skull.scale.set(1.08, 0.96, 1);
  skull.castShadow = true;
  head.add(skull);

  // Expressive eyes
  for (const sx of [-0.14, 0.14]) {
    const eye = mesh(new THREE.SphereGeometry(0.055, 8, 8), darkMat, [sx, 0.05, 0.31]);
    const shine = mesh(new THREE.SphereGeometry(0.02, 6, 6), glow(0xffffff), [sx + 0.018, 0.07, 0.35]);
    head.add(eye, shine);
  }

  // Ears that perk up on `listening`
  const earGeo = new THREE.ConeGeometry(0.13, 0.34, 6);
  const earL = mesh(earGeo, furMat, [-0.22, 0.34, 0]);
  earL.rotation.z = 0.25;
  const earR = mesh(earGeo, furMat, [0.22, 0.34, 0]);
  earR.rotation.z = -0.25;
  head.add(earL, earR);

  // Mouth-shape coaching ring (visible in `coach` state & tier-1 mouth_shape hint)
  const mouthMat = glow(0xfcd34d, 0.9, true);
  const mouthRing = mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 20), mouthMat, [0, -0.09, 0.34]);
  head.add(mouthRing);

  // Listening sonic halo
  const listenMat = glow(0x5eead4, 0, true);
  const listenHalo = mesh(new THREE.RingGeometry(0.62, 0.76, 32), listenMat, [0, 0.08, 0]);
  listenHalo.rotation.x = -Math.PI / 2;
  root.add(listenHalo);

  // Celebrate golden ring
  const celebrateMat = glow(0xfcd34d, 0, true);
  const celebrateRing = mesh(new THREE.RingGeometry(0.75, 0.95, 36), celebrateMat, [0, 0.12, 0]);
  celebrateRing.rotation.x = -Math.PI / 2;
  root.add(celebrateRing);

  return {
    root,
    body,
    head,
    earL,
    earR,
    mouthRing,
    mouthMat,
    listenHalo,
    listenMat,
    celebrateRing,
    celebrateMat,
  };
}

export interface PhoneticStonesRigOptions {
  targets: PhoneticStoneTarget[];
  machine: PhoneticStoneStateMachine;
  director?: CameraDirector;
  radius?: number;
  center?: [number, number, number];
  /** Returns true when a QuestionFrame modal is open or match is paused (ignores taps). */
  isBlocked?: () => boolean;
}

export interface PhoneticStonesRig {
  /** Group holding only interactive phonetic stones (passed to Raycaster). */
  interactiveGroup: THREE.Group;
  /** Root group containing both `interactiveGroup` and the 3D Pet companion. */
  rootGroup: THREE.Group;
  petGroup: THREE.Group;
  /** Attach pointer and keyboard listeners to a WebGL canvas. */
  attachCanvas(canvas: HTMLElement): () => void;
  /** Update stone and Pet animations in the scene loop. */
  update(dt: number, elapsedSec: number): void;
  /** Rebuild stones when targets change. */
  setTargets(targets: PhoneticStoneTarget[]): void;
  dispose(): void;
}

export function createPhoneticStonesRig(opts: PhoneticStonesRigOptions): PhoneticStonesRig {
  const { machine, director } = opts;
  const radius = opts.radius ?? 4.2;
  const [cx, cy, cz] = opts.center ?? [0, 0, 0];

  const rootGroup = new THREE.Group();
  rootGroup.name = 'phonetic-stones-root';
  rootGroup.position.set(cx, cy, cz);

  const interactiveGroup = new THREE.Group();
  interactiveGroup.name = 'interactiveGroup';
  rootGroup.add(interactiveGroup);

  const pet = buildPetCompanion();
  pet.root.position.set(0, 0, -0.4);
  rootGroup.add(pet.root);

  const stones = new Map<string, StoneVisual>();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tapTracker = new TapGestureTracker();

  let hoveredId: string | null = null;
  let selectedId: string | null = null;
  let petState: PetState = 'idle';
  let petHint: 'mouth_shape' | undefined;

  const clearStones = () => {
    for (const v of stones.values()) {
      v.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mat of mats) mat.dispose();
      });
      v.root.removeFromParent();
    }
    stones.clear();
  };

  const buildStones = (list: PhoneticStoneTarget[]) => {
    clearStones();
    const capped = list.slice(0, MAX_PHONETIC_STONES);
    const count = Math.max(1, capped.length);

    capped.forEach((target, idx) => {
      // Arrange stones in an inviting semicircle facing the camera
      const angle =
        count === 1
          ? 0
          : -Math.PI * 0.62 + (idx / (count - 1)) * (Math.PI * 1.24);
      const x = Math.sin(angle) * radius;
      const z = -Math.cos(angle) * radius * 0.82;

      const userData: PhoneticStoneUserData = {
        kind: 'phonetic_stone',
        targetId: target.targetId,
        ...(target.ipa ? { ipa: target.ipa } : {}),
        word: target.text,
        mode: target.modes[0] ?? 'shadow',
        ...(target.stationId ? { stationId: target.stationId } : {}),
      };

      const stoneRoot = new THREE.Group();
      stoneRoot.name = `phonetic-stone-${target.targetId}`;
      stoneRoot.position.set(x, 0, z);
      stoneRoot.userData = userData;

      // Pedestal slab
      const pedestalMat = lowpoly(0x1e293b, { rough: 0.9 });
      const pedestal = mesh(
        roughen(new THREE.CylinderGeometry(0.68, 0.82, 0.24, 8, 1), 0.02, idx + 1),
        pedestalMat,
        [0, 0.12, 0],
      );
      pedestal.receiveShadow = true;
      pedestal.userData = userData;
      stoneRoot.add(pedestal);

      // Standing phonetic monolith stone
      const bodyMat = lowpoly(0x64748b, {
        rough: 0.55,
        metal: 0.12,
        emissive: 0x0f172a,
        glow: 0.4,
      });
      const body = mesh(
        roughen(new THREE.DodecahedronGeometry(0.58, 1), 0.04, idx + 31),
        bodyMat,
        [0, 0.76, 0],
      );
      body.scale.set(0.88, 1.38, 0.72);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = userData;
      stoneRoot.add(body);

      // Glowing rune ring around pedestal
      const runeMat = glow(0x38bdf8, 0.45, true);
      const runeRing = mesh(new THREE.RingGeometry(0.74, 0.88, 28), runeMat, [0, 0.04, 0]);
      runeRing.rotation.x = -Math.PI / 2;
      runeRing.userData = userData;
      stoneRoot.add(runeRing);

      // 3 small star crystals above the stone
      const starMeshes: THREE.Mesh[] = [];
      for (let s = 0; s < 3; s++) {
        const starMat = lowpoly(0x334155, { emissive: 0x000000, glow: 0.8 });
        const star = mesh(
          new THREE.OctahedronGeometry(0.11, 0),
          starMat,
          [(s - 1) * 0.28, 1.68 + (s === 1 ? 0.08 : 0), 0],
        );
        star.userData = userData;
        stoneRoot.add(star);
        starMeshes.push(star);
      }

      // Floating word label sprite (browser only)
      if (typeof document !== 'undefined') {
        const shortWord =
          target.text.length > 18 ? `${target.text.slice(0, 17)}…` : target.text;
        const label = textSprite(
          target.ipa ? `${shortWord} ${target.ipa}` : shortWord,
          {
            color: '#fff7e0',
            bg: 'rgba(11, 11, 46, 0.88)',
            border: '#fcd34d',
            height: 0.34,
          },
        );
        label.position.set(0, 2.08, 0);
        label.userData = userData;
        stoneRoot.add(label);
      }

      interactiveGroup.add(stoneRoot);
      director?.setAnchor(`stone:${target.targetId}`, stoneRoot);
      stones.set(target.targetId, {
        root: stoneRoot,
        body,
        bodyMat,
        runeRing,
        runeMat,
        starMeshes,
        baseY: 0.76,
        target,
      });
    });
  };

  buildStones(opts.targets);

  const syncStoneVisuals = () => {
    const snap = machine.getSnapshot();
    hoveredId = snap.hoveredTargetId;
    selectedId = snap.selectedTargetId;
    petState = snap.petState;
    petHint = snap.petHint;

    for (const [id, v] of stones.entries()) {
      const prog = snap.progressByTarget[id];
      const isSelected = id === selectedId;
      const isHovered = id === hoveredId;
      const isPassed = !!prog?.passed;
      const stars = prog?.bestStars ?? 0;

      if (isPassed) {
        // Turns from grey to vibrant emerald/gold when passed (Blueprint §3.5)
        v.bodyMat.color.setHex(stars >= 3 ? 0xfcd34d : 0x34d399);
        v.bodyMat.emissive.setHex(stars >= 3 ? 0xb45309 : 0x065f46);
        v.bodyMat.emissiveIntensity = isSelected ? 1.15 : 0.75;
        v.runeMat.color.setHex(stars >= 3 ? 0xfcd34d : 0x6ee7b7);
        v.runeMat.opacity = isSelected || isHovered ? 0.95 : 0.65;
      } else if (isSelected) {
        v.bodyMat.color.setHex(0x7dd3fc);
        v.bodyMat.emissive.setHex(0x0284c7);
        v.bodyMat.emissiveIntensity = 1.1;
        v.runeMat.color.setHex(0xfcd34d);
        v.runeMat.opacity = 0.95;
      } else if (isHovered) {
        v.bodyMat.color.setHex(0x94a3b8);
        v.bodyMat.emissive.setHex(0x38bdf8);
        v.bodyMat.emissiveIntensity = 0.8;
        v.runeMat.color.setHex(0x7dd3fc);
        v.runeMat.opacity = 0.85;
      } else {
        v.bodyMat.color.setHex(0x64748b);
        v.bodyMat.emissive.setHex(0x0f172a);
        v.bodyMat.emissiveIntensity = 0.35;
        v.runeMat.color.setHex(0x38bdf8);
        v.runeMat.opacity = 0.4;
      }

      v.starMeshes.forEach((starMesh, idx) => {
        const mat = starMesh.material as THREE.MeshStandardMaterial;
        const lit = idx < stars;
        mat.color.setHex(lit ? 0xfcd34d : 0x334155);
        mat.emissive.setHex(lit ? 0xf59e0b : 0x000000);
        mat.emissiveIntensity = lit ? 1.1 : 0.2;
      });
    }
  };

  const unsubSelect = machine.bus.on('stone:select', ({ targetId }) => {
    syncStoneVisuals();
    const v = stones.get(targetId);
    if (v && director) {
      director.focus([v.root, pet.root], 0.42);
      void director.dollyTo(v.root, { duration: 0.4, hold: Infinity, distance: 3.4, height: 1.5 });
    }
  });

  const unsubHover = machine.bus.on('stone:hover', () => {
    syncStoneVisuals();
  });

  const unsubResult = machine.bus.on('stone:result', () => {
    syncStoneVisuals();
  });

  const unsubPet = machine.bus.on('pet:state', ({ state, hint }) => {
    petState = state;
    petHint = hint;
  });

  const unsubState = machine.bus.on('state:change', ({ next }) => {
    syncStoneVisuals();
    if (next === 'idle' && director) {
      director.clearFocus();
      director.dollyBack();
    }
  });

  syncStoneVisuals();

  return {
    interactiveGroup,
    rootGroup,
    petGroup: pet.root,

    attachCanvas(canvas: HTMLElement) {
      let lastHoverAt = 0;

      const computeNdc = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
        return true;
      };

      const findCamera = (): THREE.Camera | null => {
        let root: THREE.Object3D = rootGroup;
        while (root.parent) root = root.parent;
        let found: THREE.Camera | null = null;
        root.traverse((o) => {
          if ((o as THREE.Camera).isCamera && !found) found = o as THREE.Camera;
        });
        return found;
      };

      const onPointerDown = (e: PointerEvent) => {
        if (opts.isBlocked?.()) return;
        tapTracker.onPointerDown(e.clientX, e.clientY, performance.now(), e.pointerId);
        // Touch has no hover: highlight on pointerdown (Blueprint §3.5 rule 3)
        if (e.pointerType !== 'mouse' && computeNdc(e.clientX, e.clientY)) {
          const cam = findCamera() ?? (director as unknown as { camera?: THREE.Camera })?.camera ?? null;
          if (cam) {
            const hit = raycastPhoneticStones(raycaster, ndc, cam, interactiveGroup);
            machine.hoverStone(hit?.userData.targetId ?? null);
          }
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        tapTracker.onPointerMove(e.clientX, e.clientY, e.pointerId);
        if (e.pointerType !== 'mouse') return;
        const now = performance.now();
        if (now - lastHoverAt < HOVER_THROTTLE_MS) return;
        lastHoverAt = now;
        if (opts.isBlocked?.() || !computeNdc(e.clientX, e.clientY)) return;
        const cam = findCamera() ?? (director as unknown as { camera?: THREE.Camera })?.camera ?? null;
        if (!cam) return;
        const hit = raycastPhoneticStones(raycaster, ndc, cam, interactiveGroup);
        const nextHover = hit?.userData.targetId ?? null;
        machine.hoverStone(nextHover);
        canvas.style.cursor = nextHover ? 'pointer' : '';
      };

      const onPointerUp = (e: PointerEvent) => {
        if (opts.isBlocked?.()) {
          tapTracker.cancel();
          return;
        }
        const isTap = tapTracker.onPointerUp(e.clientX, e.clientY, performance.now(), e.pointerId);
        if (!isTap || !computeNdc(e.clientX, e.clientY)) return;
        const cam = findCamera() ?? (director as unknown as { camera?: THREE.Camera })?.camera ?? null;
        if (!cam) return;
        const hit = raycastPhoneticStones(raycaster, ndc, cam, interactiveGroup);
        if (hit) {
          machine.selectStone(hit.userData.targetId);
        } else {
          const cur = machine.getSnapshot().state;
          if (cur === 'passed' || cur === 'retry') {
            machine.dismissToIdle();
          }
        }
      };

      const onPointerCancel = () => {
        tapTracker.cancel();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          const cur = machine.getSnapshot().state;
          if (cur !== 'idle') {
            machine.dismissToIdle();
          }
        }
      };

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('keydown', onKeyDown);

      return () => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('keydown', onKeyDown);
        canvas.style.cursor = '';
      };
    },

    update(dt: number, t: number) {
      // Animate Phonetic Stones
      let idx = 0;
      for (const [id, v] of stones.entries()) {
        const isSelected = id === selectedId;
        const isHovered = id === hoveredId;
        const targetLift = isSelected ? 0.22 : isHovered ? 0.1 : 0;
        const bob = Math.sin(t * 2.4 + idx * 0.9) * (isSelected ? 0.06 : 0.025);
        v.body.position.y = damp(v.body.position.y, v.baseY + targetLift + bob, 8, dt);
        v.body.rotation.y += dt * (isSelected ? 1.1 : 0.25);
        const pulseScale = isSelected || isHovered ? 1 + Math.sin(t * 5) * 0.06 : 1;
        v.runeRing.scale.setScalar(pulseScale);
        v.starMeshes.forEach((s, sIdx) => {
          s.rotation.y = t * 1.8 + sIdx;
        });
        idx++;
      }

      // Animate 3D Pet Companion according to `petState`
      if (petState === 'celebrate') {
        pet.body.position.y = 0.65 + Math.abs(Math.sin(t * 7.5)) * 0.28;
        pet.body.rotation.y = Math.sin(t * 4) * 0.35;
        pet.earL.rotation.z = 0.15;
        pet.earR.rotation.z = -0.15;
        pet.celebrateMat.opacity = 0.85;
        pet.celebrateRing.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
        pet.listenMat.opacity = 0;
        pet.mouthMat.opacity = 0.3;
      } else if (petState === 'listening') {
        pet.body.position.y = damp(pet.body.position.y, 0.7, 8, dt);
        pet.head.rotation.x = damp(pet.head.rotation.x, -0.12, 8, dt);
        // Ears perked up!
        pet.earL.rotation.z = damp(pet.earL.rotation.z, 0.04, 10, dt);
        pet.earR.rotation.z = damp(pet.earR.rotation.z, -0.04, 10, dt);
        pet.listenMat.opacity = 0.55 + Math.sin(t * 6) * 0.3;
        pet.listenHalo.scale.setScalar(1 + ((t * 1.4) % 0.6));
        pet.celebrateMat.opacity = 0;
        pet.mouthMat.opacity = 0.4;
      } else if (petState === 'coach' || petHint === 'mouth_shape') {
        pet.body.position.y = damp(pet.body.position.y, 0.68, 8, dt);
        pet.head.rotation.x = Math.sin(t * 3.5) * 0.08;
        pet.earL.rotation.z = damp(pet.earL.rotation.z, 0.18, 8, dt);
        pet.earR.rotation.z = damp(pet.earR.rotation.z, -0.18, 8, dt);
        // Articulate mouth ring to coach pronunciation / mouth shape
        pet.mouthMat.opacity = 0.95;
        pet.mouthRing.scale.set(
          1 + Math.sin(t * 6.5) * 0.35,
          1 + Math.cos(t * 6.5) * 0.42,
          1,
        );
        pet.listenMat.opacity = 0;
        pet.celebrateMat.opacity = 0;
      } else {
        // idle
        pet.body.position.y = 0.65 + Math.sin(t * 2.2) * 0.04;
        pet.body.rotation.y = damp(pet.body.rotation.y, 0, 5, dt);
        pet.head.rotation.x = damp(pet.head.rotation.x, 0, 5, dt);
        pet.earL.rotation.z = damp(pet.earL.rotation.z, 0.25, 6, dt);
        pet.earR.rotation.z = damp(pet.earR.rotation.z, -0.25, 6, dt);
        pet.mouthRing.scale.setScalar(1);
        pet.mouthMat.opacity = 0.35;
        pet.listenMat.opacity = 0;
        pet.celebrateMat.opacity = 0;
      }
    },

    setTargets(targets: PhoneticStoneTarget[]) {
      buildStones(targets);
      syncStoneVisuals();
    },

    dispose() {
      unsubSelect();
      unsubHover();
      unsubResult();
      unsubPet();
      unsubState();
      clearStones();
      rootGroup.removeFromParent();
    },
  };
}
