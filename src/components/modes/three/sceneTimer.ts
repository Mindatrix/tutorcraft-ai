'use client';

import * as THREE from 'three';
import type { TimerKind } from '../../question/skins';

// C4.5 the 25 s timer as an object in the scene, next to what the question is about: a torch that
// burns down (camp, dino), water rising in a post (kayak, survival), or a ring of water closing
// (fishing, Multiverse hologram). set(p) with p = elapsed / limit, 0..1. Low-poly, 1–3 draw calls.

export interface SceneTimer {
  object: THREE.Group;
  set: (p: number) => void;
  dispose: () => void;
}

export function createSceneTimer(kind: TimerKind, o: { accent?: THREE.ColorRepresentation } = {}): SceneTimer {
  const g = new THREE.Group();
  g.name = `timer:${kind}`;
  const disposables: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const urgent = new THREE.Color(0xef4444);

  if (kind === 'torch') {
    const stick = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.07, 0.9, 8)), keep(new THREE.MeshStandardMaterial({ color: 0x7a4c22, roughness: 0.9 })));
    stick.position.y = 0.45;
    const flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.95, toneMapped: false }));
    const flame = new THREE.Mesh(keep(new THREE.ConeGeometry(0.16, 0.5, 10)), flameMat);
    flame.position.y = 0.9 + 0.25;
    const core = new THREE.Mesh(keep(new THREE.ConeGeometry(0.08, 0.28, 8)), keep(new THREE.MeshBasicMaterial({ color: 0xfff1a6, toneMapped: false })));
    core.position.y = 0.9 + 0.15;
    const light = new THREE.PointLight(0xffa64d, 1.4, 4, 2);
    light.position.y = 1.2;
    g.add(stick, flame, core, light);
    const base = new THREE.Color(0xff9a2e);
    return {
      object: g,
      set(p) {
        const left = Math.max(0, 1 - p);
        const s = 0.25 + 0.75 * left;
        flame.scale.set(s, s, s);
        flame.position.y = 0.9 + 0.25 * s;
        core.scale.setScalar(s);
        light.intensity = 0.3 + 1.2 * left;
        flameMat.color.copy(base).lerp(urgent, left < 0.2 ? 1 - left / 0.2 : 0);
      },
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }

  if (kind === 'wave') {
    const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 1.2, 0.5)), keep(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.25, roughness: 0.2 })));
    post.position.y = 0.6;
    const waterMat = keep(new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85, roughness: 0.15 }));
    const water = new THREE.Mesh(keep(new THREE.BoxGeometry(0.46, 1, 0.46)), waterMat);
    g.add(post, water);
    const base = new THREE.Color(0x38bdf8);
    return {
      object: g,
      set(p) {
        const h = Math.max(0.02, Math.min(1, p)) * 1.16;
        water.scale.y = h;
        water.position.y = 0.02 + h / 2;
        waterMat.color.copy(base).lerp(urgent, p > 0.8 ? (p - 0.8) / 0.2 : 0);
      },
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }

  // ring: a torus that closes as time runs out (drawRange over the tube segments).
  const geo = keep(new THREE.TorusGeometry(0.42, 0.06, 8, 64));
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(o.accent ?? 0x7dd3fc), toneMapped: false }));
  const ring = new THREE.Mesh(geo, ringMat);
  const track = new THREE.Mesh(keep(new THREE.TorusGeometry(0.42, 0.03, 6, 64)), keep(new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.4 })));
  ring.rotation.z = Math.PI / 2;
  track.rotation.z = Math.PI / 2;
  g.add(track, ring);
  g.position.y = 1.2;
  const total = geo.index ? geo.index.count : 0;
  const base = ringMat.color.clone();
  return {
    object: g,
    set(p) {
      const left = Math.max(0, 1 - p);
      geo.setDrawRange(0, Math.floor((total * left) / 6) * 6);
      ringMat.color.copy(base).lerp(urgent, left < 0.2 ? 1 - left / 0.2 : 0);
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
