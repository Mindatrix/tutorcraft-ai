'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { THREE_ASSET_MANIFEST, assetUrl } from '../../config/threeAssets';
import type { BossAvatar } from '../../engine';
import { Sparks, canvasTexture, clamp, createStage, damp, easeInOut, easeOut, glow, lowpoly, mesh, roughen, skyDome, swapInGlb, textSprite, toon } from './kit';
import type { BossSceneProps, SceneEvent } from './types';

// GAME 2 — Multiverse Portal RPG.
// Third-person: Scarlet (warrior princess, rapier) fights the boss. Each time the boss
// loses a third of its HP it flees through a spatial tear; the tear is a stencil mask,
// so the next world is visible *through* it in the same scene, and the camera flies
// through without a page change: foggy castle → neon cyberpunk → desert ruins.
// Visual only: HP / damage come from the server state.

const A = THREE_ASSET_MANIFEST.gameModes.multiverse_portal;
const STEP = 18; // arena k is centred at z = -k * STEP (worlds overlap; the stencil keeps them apart)
const WORLDS = ['castle', 'cyberpunk', 'desert'] as const;
type WorldId = (typeof WORLDS)[number];

interface Look { fog: number; density: number; sky: number; ground: number; hemi: number; sun: number; sunI: number }
const LOOKS: Record<WorldId, Look> = {
  castle: { fog: 0x1c2536, density: 0.024, sky: 0x8a9cc4, ground: 0x1d1f2a, hemi: 0.95, sun: 0xc9d6ff, sunI: 1.4 },
  cyberpunk: { fog: 0x2a1142, density: 0.02, sky: 0xff8ade, ground: 0x150a26, hemi: 0.9, sun: 0x6fe3ff, sunI: 1.3 },
  desert: { fog: 0xe6b07a, density: 0.016, sky: 0xfff0d2, ground: 0x9a6a3a, hemi: 1.1, sun: 0xffe2ad, sunI: 2.1 },
};

const BOSS_COLORS: Record<BossAvatar, { body: number; accent: number; eye: number; shot: number }> = {
  dragon: { body: 0xb91c1c, accent: 0xf97316, eye: 0xfde047, shot: 0xfb923c },
  golem: { body: 0x78716c, accent: 0xa8a29e, eye: 0x22d3ee, shot: 0xd6d3d1 },
  wizard: { body: 0x6d28d9, accent: 0xa78bfa, eye: 0xf0abfc, shot: 0xc084fc },
  shadow_king: { body: 0x1e1b4b, accent: 0xfacc15, eye: 0xef4444, shot: 0x8b5cf6 },
};

function worldFor(bossHp: number, bossMax: number): number {
  const r = bossMax > 0 ? bossHp / bossMax : 1;
  return r > 2 / 3 ? 0 : r > 1 / 3 ? 1 : 2;
}

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

interface World {
  group: THREE.Group;
  tick: (t: number) => void;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function buildCastle(zc: number): World {
  const g = new THREE.Group();
  g.position.z = zc;
  const r = rng(11);
  g.add(skyDome(0x070b18, 0x37425c, 0x0c1017, { radius: 110, stars: 0.8 }));
  const stone = lowpoly(0x5d6475);
  const stoneDark = lowpoly(0x3b404d);
  g.add(mesh(roughen(new THREE.CylinderGeometry(15, 16, 0.8, 30, 2), 0.18, 3), stone, [0, -0.4, 0]));
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    const d = 3 + r() * 10;
    const slab = mesh(roughen(new THREE.BoxGeometry(1 + r(), 0.12, 1 + r()), 0.05, i + 4), i % 3 ? stoneDark : stone, [Math.sin(a) * d, 0.02, Math.cos(a) * d - 2]);
    slab.rotation.y = r();
    g.add(slab);
  }
  const rune = mesh(new THREE.RingGeometry(5.4, 5.75, 48), glow(0x8b7bff, 0.45, true));
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.04;
  g.add(rune);

  const banner = lowpoly(0x9f1d2b);
  const gold = toon(0xe0a23a, 0x2a1800);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const x = Math.sin(a) * 11;
    const z = Math.cos(a) * 11 - 2;
    if (z > 3) continue; // keep the camera side open
    const h = i % 3 === 0 ? 3.5 + r() * 1.5 : 7;
    const pillar = mesh(roughen(new THREE.CylinderGeometry(0.62, 0.75, h, 8, 3), 0.08, i + 20), stone, [x, h / 2, z]);
    g.add(pillar);
    if (h > 6) {
      const b = mesh(new THREE.BoxGeometry(1.1, 2.8, 0.05), banner, [x * 0.93, 4.2, z * 0.93]);
      b.lookAt(0, 4.2, -2);
      g.add(b);
      const stripe = mesh(new THREE.BoxGeometry(1.12, 0.12, 0.06), gold, [0, -1.0, 0]);
      b.add(stripe);
    }
  }
  // Gate behind the boss.
  for (const x of [-3.4, 3.4]) g.add(mesh(roughen(new THREE.BoxGeometry(1.3, 7.5, 1.3), 0.08, 7), stoneDark, [x, 3.75, -11]));
  const arch = mesh(new THREE.TorusGeometry(3.4, 0.6, 5, 14, Math.PI), stoneDark, [0, 7.4, -11]);
  g.add(arch);
  // Far castle silhouette.
  for (let i = 0; i < 9; i++) {
    const x = -32 + i * 8 + r() * 3;
    const h = 10 + r() * 14;
    const tower = mesh(new THREE.CylinderGeometry(1.6, 2, h, 7), stoneDark, [x, h / 2 - 1, -42 - r() * 8]);
    g.add(tower);
    const roof = mesh(new THREE.ConeGeometry(2.3, 4, 7), lowpoly(0x2a2f3c), [0, h / 2 + 2, 0]);
    tower.add(roof);
    const win = mesh(new THREE.BoxGeometry(0.5, 0.8, 0.1), glow(0xffb347), [0, h * 0.25, 2.0]);
    tower.add(win);
  }
  g.add(mesh(new THREE.SphereGeometry(4, 20, 14), glow(0xe2e8ff), [-22, 26, -80]));
  // Torches.
  const flames: THREE.Mesh[] = [];
  const flameMat = glow(0xff9a3c, 0.95, true);
  for (const [x, z] of [[-5.5, -1], [5.5, -1], [-5.5, -8], [5.5, -8]] as const) {
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6), lowpoly(0x4a3424), [x, 1.1, z]));
    const f = mesh(new THREE.ConeGeometry(0.22, 0.6, 7), flameMat, [x, 2.45, z]);
    flames.push(f);
    g.add(f);
  }
  const torch = new THREE.PointLight(0xff9a3c, 14, 16, 2);
  torch.position.set(0, 3, -4);
  g.add(torch);
  return {
    group: g,
    tick(t) {
      flames.forEach((f, i) => {
        f.scale.set(1, 1 + Math.sin(t * 13 + i * 2.1) * 0.22, 1);
      });
      torch.intensity = 12 + Math.sin(t * 9) * 2.5;
    },
  };
}

function buildCyber(zc: number): World {
  const g = new THREE.Group();
  g.position.z = zc;
  const r = rng(29);
  g.add(skyDome(0x05020f, 0x6a1b70, 0x05020f, { radius: 110, stars: 0.3 }));
  const grid = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vW;
      void main(){
        vec2 g = abs(fract(vW / 2.0 - 0.5) - 0.5) / fwidth(vW / 2.0);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float d = length(vW - vec2(0.0, ${(-STEP).toFixed(1)}));
        float pulse = 0.5 + 0.5 * sin(d * 0.8 - uTime * 3.0);
        vec3 base = vec3(0.04, 0.02, 0.09);
        vec3 neon = mix(vec3(0.0, 0.9, 1.0), vec3(1.0, 0.2, 0.7), pulse);
        gl_FragColor = vec4(base + neon * line * (0.55 + 0.45 * pulse) * exp(-d * 0.03), 1.0);
      }`,
  });
  const floor = mesh(new THREE.PlaneGeometry(90, 90), grid);
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  const windows = canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = '#0d0b1d';
    ctx.fillRect(0, 0, 64, 128);
    const cols = ['#ff3ea5', '#38e8ff', '#ffd23f', '#7c5cff'];
    for (let y = 6; y < 128; y += 16) for (let x = 6; x < 64; x += 14) if (Math.random() > 0.62) {
      ctx.fillStyle = cols[(x * 3 + y) % cols.length];
      ctx.globalAlpha = 0.35 + Math.random() * 0.5;
      ctx.fillRect(x, y, 6, 7);
    }
  });
  windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
  windows.magFilter = THREE.NearestFilter;
  const neonPink = glow(0xff2fa0);
  const neonCyan = glow(0x2ff3ff);
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2;
    const d = 15 + r() * 16;
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d - 4;
    if (z > 2 && Math.abs(x) < 14) continue;
    const w = 2.5 + r() * 3.5;
    const h = 6 + r() * 22;
    const tex = windows.clone();
    tex.repeat.set(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 4)));
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1733, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.6, flatShading: true });
    const b = mesh(new THREE.BoxGeometry(w, h, w), mat, [x, h / 2, z]);
    b.rotation.y = r() * 0.6;
    g.add(b);
    const strip = mesh(new THREE.BoxGeometry(w + 0.08, 0.12, w + 0.08), i % 2 ? neonPink : neonCyan, [0, h / 2 - 0.4, 0]);
    b.add(strip);
  }
  const sign = textSprite('ENGLISH 2077', { color: '#ff7ad9', bg: 'rgba(20,6,40,.75)', border: '#2ff3ff', height: 1.4 });
  sign.position.set(-6, 7.5, -14);
  g.add(sign);
  const sign2 = textSprite('LEVEL UP ▲', { color: '#2ff3ff', bg: 'rgba(20,6,40,.75)', border: '#ff2fa0', height: 1.1 });
  sign2.position.set(7, 6, -12);
  g.add(sign2);
  const drones: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const d = mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), lowpoly(0x2b2b3d), [0, 0, 0]);
    d.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), i % 2 ? neonPink : neonCyan, [0, -0.12, 0]));
    drones.push(d);
    g.add(d);
  }
  const neon = new THREE.PointLight(0xff2fa0, 10, 22, 2);
  neon.position.set(0, 5, -6);
  g.add(neon);
  return {
    group: g,
    tick(t) {
      grid.uniforms.uTime.value = t;
      drones.forEach((d, i) => {
        const a = t * (0.25 + i * 0.05) + i;
        d.position.set(Math.sin(a) * (6 + i), 5 + Math.sin(t + i) * 0.6 + i * 0.5, Math.cos(a) * (6 + i) - 6);
      });
      sign.material.opacity = Math.sin(t * 17) > 0.96 ? 0.35 : 1;
    },
  };
}

function buildDesert(zc: number): World {
  const g = new THREE.Group();
  g.position.z = zc;
  const r = rng(53);
  g.add(skyDome(0x4c95dc, 0xffd8a0, 0xd8964f, { radius: 110 }));
  const sandGeo = new THREE.PlaneGeometry(110, 110, 44, 44);
  const p = sandGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const d = Math.hypot(x, y + 2);
    const dune = Math.sin(x * 0.18 + 1) * 1.1 + Math.cos(y * 0.13) * 1.4 + Math.sin((x + y) * 0.07) * 1.6;
    p.setZ(i, d < 11 ? 0 : dune * clamp((d - 11) / 10));
  }
  sandGeo.computeVertexNormals();
  const sand = mesh(sandGeo, lowpoly(0xe2b376));
  sand.rotation.x = -Math.PI / 2;
  g.add(sand);
  const stone = lowpoly(0xd39b5f);
  const stoneDark = lowpoly(0xb57d48);
  // Ruined arches and pillars.
  for (const [x, z, s] of [[-8, -8, 1], [8.5, -6, 0.85], [0, -15, 1.3]] as const) {
    const arch = new THREE.Group();
    arch.position.set(x, 0, z);
    arch.scale.setScalar(s);
    arch.add(mesh(roughen(new THREE.BoxGeometry(1.1, 5, 1.1), 0.1, 3), stone, [-1.8, 2.5, 0]));
    arch.add(mesh(roughen(new THREE.BoxGeometry(1.1, 5, 1.1), 0.1, 4), stone, [1.8, 2.5, 0]));
    arch.add(mesh(roughen(new THREE.BoxGeometry(4.8, 1, 1.3), 0.1, 5), stoneDark, [0, 5.4, 0]));
    arch.lookAt(0, 0, 2);
    g.add(arch);
  }
  for (let i = 0; i < 10; i++) {
    const a = r() * Math.PI * 2;
    const d = 7 + r() * 8;
    const z = Math.cos(a) * d - 2;
    if (z > 3) continue;
    const h = 0.6 + r() * 2.4;
    g.add(mesh(roughen(new THREE.CylinderGeometry(0.5, 0.6, h, 7), 0.1, i), i % 2 ? stone : stoneDark, [Math.sin(a) * d, h / 2, z]));
  }
  const cactus = lowpoly(0x5f9e4a);
  for (const [x, z] of [[-12, -3], [13, -10], [-15, -16], [10, 2]] as const) {
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.add(mesh(new THREE.CylinderGeometry(0.35, 0.4, 3, 7), cactus, [0, 1.5, 0]));
    c.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 1.2, 6), cactus, [0.6, 1.9, 0]));
    c.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.9, 6), cactus, [-0.55, 2.2, 0]));
    g.add(c);
  }
  g.add(mesh(new THREE.ConeGeometry(16, 13, 4), lowpoly(0xd8a462), [-26, 5.5, -52]));
  g.add(mesh(new THREE.ConeGeometry(10, 8, 4), lowpoly(0xc99456), [-6, 3, -62]));
  const sun = mesh(new THREE.SphereGeometry(6, 20, 14), glow(0xfff2c4), [24, 30, -85]);
  g.add(sun);
  return {
    group: g,
    tick(t) {
      sun.scale.setScalar(1 + Math.sin(t * 0.8) * 0.03);
    },
  };
}

const BUILDERS: Record<WorldId, (zc: number) => World> = { castle: buildCastle, cyberpunk: buildCyber, desert: buildDesert };

type WorldRole = 'main' | 'mainMasked' | 'behind' | 'hidden';

/** Stencil roles: outside the tear → current world, inside the tear → next world. */
function setRole(w: World, role: WorldRole) {
  w.group.visible = role !== 'hidden';
  w.group.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      m.stencilWrite = role === 'mainMasked' || role === 'behind';
      m.stencilRef = 1;
      m.stencilFunc = role === 'behind' ? THREE.EqualStencilFunc : THREE.NotEqualStencilFunc;
    }
  });
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** Sword arm angles (rotation.x; positive = forward). */
const REST = 0.55;
const WINDUP = 2.6;
const STRIKE = -0.3;
const RAISED = 2.9;

interface Hero {
  root: THREE.Group;
  body: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  mats: THREE.MeshToonMaterial[];
}

function buildScarlet(): Hero {
  const mats: THREE.MeshToonMaterial[] = [];
  const m = (c: number, e = 0x000000) => {
    const x = toon(c, e);
    mats.push(x);
    return x;
  };
  const skin = m(0xf1c3a0);
  const red = m(0xb3263a);
  const white = m(0xf3ece0);
  const gold = m(0xe3a63b, 0x3a2200);
  const boots = m(0xd98a2c, 0x2a1400);
  const stocking = m(0x5a4535);
  const hair = m(0xc8352e);
  const steel = m(0xdfe7f2, 0x22303e);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const leg = (x: number) => {
    const L = new THREE.Group();
    L.position.set(x, 1.0, 0);
    L.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.5, 8), stocking, [0, -0.28, 0]));
    L.add(mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.5, 8), boots, [0, -0.72, 0]));
    L.add(mesh(new THREE.ConeGeometry(0.1, 0.18, 4), gold, [0, -0.5, -0.1]));
    body.add(L);
    return L;
  };
  const legL = leg(-0.13);
  const legR = leg(0.13);
  body.add(mesh(new THREE.BoxGeometry(0.44, 0.2, 0.28), white, [0, 1.0, 0]));
  const tabard = mesh(new THREE.BoxGeometry(0.26, 0.9, 0.03), red, [0, 0.62, -0.15]);
  tabard.add(mesh(new THREE.BoxGeometry(0.11, 0.11, 0.02), gold, [0, -0.2, -0.02]));
  tabard.children[0].rotation.z = Math.PI / 4;
  body.add(tabard);
  body.add(mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.24, 10), red, [0, 1.18, 0]));
  body.add(mesh(new THREE.TorusGeometry(0.24, 0.025, 4, 16), m(0x5a3a24), [0, 1.08, 0]));
  body.children[body.children.length - 1].rotation.x = Math.PI / 2;
  body.add(mesh(new THREE.CylinderGeometry(0.26, 0.21, 0.36, 10), white, [0, 1.46, 0]));
  body.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), m(0xd11a3a, 0x500010), [0, 1.36, -0.22]));
  for (const x of [-0.3, 0.3]) {
    const pad = mesh(new THREE.SphereGeometry(0.14, 8, 6), gold, [x, 1.6, 0]);
    pad.scale.set(1, 0.7, 1);
    body.add(pad);
  }
  const arm = (x: number) => {
    const A = new THREE.Group();
    A.position.set(x, 1.56, 0);
    A.add(mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.5, 7), skin, [0, -0.25, 0]));
    A.add(mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.17, 7), gold, [0, -0.43, 0]));
    body.add(A);
    return A;
  };
  const armL = arm(-0.33);
  const armR = arm(0.33);
  // Rapier in the right hand.
  const sword = new THREE.Group();
  sword.position.set(0, -0.52, 0);
  sword.add(mesh(new THREE.BoxGeometry(0.028, 0.028, 1.2), steel, [0, 0, -0.62]));
  const guard = mesh(new THREE.TorusGeometry(0.07, 0.014, 6, 14), gold, [0, 0, -0.03]);
  sword.add(guard);
  sword.add(mesh(new THREE.BoxGeometry(0.26, 0.025, 0.025), gold, [0, 0, -0.04]));
  sword.rotation.x = -0.3; // blade points forward out of the fist
  armR.add(sword);
  // Head, hair, braid, crown.
  body.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), skin, [0, 1.68, 0]));
  body.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), skin, [0, 1.85, 0]));
  const hairCap = mesh(new THREE.SphereGeometry(0.215, 16, 12), hair, [0, 1.89, 0.035]);
  hairCap.scale.set(1.02, 0.95, 1.05);
  body.add(hairCap);
  body.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), hair, [-0.08, 1.98, -0.15]));
  for (let i = 0; i < 6; i++) body.add(mesh(new THREE.SphereGeometry(0.075 - i * 0.007, 8, 6), hair, [0.13 + i * 0.01, 1.78 - i * 0.11, 0.17 + i * 0.01]));
  for (const x of [-0.07, 0.07]) body.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), m(0x1f6b45, 0x0a2a18), [x, 1.86, -0.18]));
  const crown = new THREE.Group();
  crown.position.set(0, 2.03, -0.02);
  crown.add(mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12, 1, true), gold));
  for (const [x, h] of [[-0.11, 0.12], [0, 0.18], [0.11, 0.12]] as const) crown.add(mesh(new THREE.ConeGeometry(0.035, h, 5), gold, [x, h / 2, -0.12]));
  crown.add(mesh(new THREE.OctahedronGeometry(0.045), m(0xe11d48, 0x6a0018), [0, 0.02, -0.18]));
  body.add(crown);
  armR.rotation.x = REST;
  armL.rotation.z = -0.15;
  return { root, body, armR, armL, legL, legR, mats };
}

interface Boss {
  root: THREE.Group;
  core: THREE.Group;
  mats: THREE.Material[];
  eyeMat: THREE.MeshBasicMaterial;
  aura: THREE.Mesh;
  wings: THREE.Mesh[];
}

function buildBoss(avatar: BossAvatar): Boss {
  const c = BOSS_COLORS[avatar] ?? BOSS_COLORS.shadow_king;
  const mats: THREE.Material[] = [];
  const t = (col: number, e = 0x000000) => {
    const x = toon(col, e, 0.6);
    mats.push(x);
    return x;
  };
  const body = t(c.body);
  const accent = t(c.accent, c.accent);
  const eyeMat = glow(c.eye);
  const root = new THREE.Group();
  const core = new THREE.Group();
  core.position.y = 1.7;
  root.add(core);
  const wings: THREE.Mesh[] = [];
  const eyes = (y: number, z: number, gap: number, r = 0.09) => {
    for (const x of [-gap, gap]) core.add(mesh(new THREE.SphereGeometry(r, 8, 6), eyeMat, [x, y, z]));
  };
  if (avatar === 'dragon') {
    core.add(mesh(roughen(new THREE.DodecahedronGeometry(1.05, 0), 0.08, 2), body));
    const head = mesh(roughen(new THREE.DodecahedronGeometry(0.55, 0), 0.05, 3), body, [0, 0.9, 0.55]);
    core.add(head);
    eyes(1.0, 0.98, 0.2);
    for (const x of [-0.3, 0.3]) {
      const horn = mesh(new THREE.ConeGeometry(0.1, 0.6, 5), accent, [x, 1.45, 0.4]);
      horn.rotation.x = -0.4;
      core.add(horn);
    }
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2.4, 0.9, -0.3, 1.9, -0.9, -0.2, 0, 0, 0, 1.9, -0.9, -0.2, 0.9, -1.3, 0], 3));
    wingGeo.computeVertexNormals();
    const wingMat = toon(c.accent);
    wingMat.side = THREE.DoubleSide;
    mats.push(wingMat);
    for (const s of [-1, 1]) {
      const w = mesh(wingGeo, wingMat, [0.5 * s, 0.5, -0.2]);
      w.scale.x = s;
      wings.push(w);
      core.add(w);
    }
    const tail = mesh(new THREE.ConeGeometry(0.3, 1.6, 6), body, [0, -0.6, -1.0]);
    tail.rotation.x = -1.9;
    core.add(tail);
  } else if (avatar === 'golem') {
    core.add(mesh(roughen(new THREE.IcosahedronGeometry(1.1, 0), 0.12, 5), body));
    core.add(mesh(roughen(new THREE.IcosahedronGeometry(0.5, 0), 0.06, 6), body, [0, 1.25, 0.15]));
    eyes(1.3, 0.6, 0.17);
    for (const s of [-1, 1]) {
      core.add(mesh(roughen(new THREE.IcosahedronGeometry(0.5, 0), 0.06, 7), accent, [1.35 * s, 0.3, 0.1]));
      core.add(mesh(roughen(new THREE.IcosahedronGeometry(0.42, 0), 0.06, 8), body, [1.5 * s, -0.55, 0.3]));
    }
  } else if (avatar === 'wizard') {
    core.add(mesh(new THREE.ConeGeometry(1.0, 2.4, 9), body, [0, -0.3, 0]));
    core.add(mesh(new THREE.SphereGeometry(0.42, 12, 10), t(0x1a1028), [0, 1.05, 0]));
    eyes(1.08, 0.38, 0.13);
    core.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 16), body, [0, 1.35, 0]));
    const hat = mesh(new THREE.ConeGeometry(0.5, 1.4, 9), body, [0, 2.0, -0.1]);
    hat.rotation.x = -0.25;
    core.add(hat);
    core.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), t(0x4a3424), [1.1, 0.2, 0.3]));
    core.add(mesh(new THREE.IcosahedronGeometry(0.22, 1), glow(c.shot), [1.1, 1.65, 0.3]));
  } else {
    core.add(mesh(roughen(new THREE.BoxGeometry(1.5, 1.7, 0.9), 0.07, 9), body));
    core.add(mesh(roughen(new THREE.BoxGeometry(0.75, 0.75, 0.75), 0.04, 10), t(0x111022), [0, 1.25, 0]));
    eyes(1.25, 0.4, 0.15, 0.07);
    for (const s of [-1, 1]) core.add(mesh(new THREE.SphereGeometry(0.42, 8, 6), accent, [0.95 * s, 0.75, 0]));
    const crown = new THREE.Group();
    crown.position.set(0, 1.7, 0);
    crown.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 8, 1, true), accent));
    for (let i = 0; i < 5; i++) crown.add(mesh(new THREE.ConeGeometry(0.07, 0.35, 4), accent, [Math.sin((i / 5) * Math.PI * 2) * 0.38, 0.22, Math.cos((i / 5) * Math.PI * 2) * 0.38]));
    core.add(crown);
    const capeMat = toon(0x3b0d4f);
    capeMat.side = THREE.DoubleSide;
    mats.push(capeMat);
    core.add(mesh(new THREE.PlaneGeometry(1.7, 2.6), capeMat, [0, -0.4, -0.5]));
  }
  const aura = mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 40), glow(0xff3355, 0.0, true), [0, -1.5, 0]);
  aura.rotation.x = Math.PI / 2;
  core.add(aura);
  return { root, core, mats, eyeMat, aura, wings }; // faces +z, toward the hero
}

// ---------------------------------------------------------------------------
// Spatial tear (stencil portal)
// ---------------------------------------------------------------------------

const TEAR_RX = 2.2;
const TEAR_RY = 3.0;
const TEAR_CY = 3.05;

function tearShape(): THREE.Shape {
  const s = new THREE.Shape();
  const r = rng(77);
  const N = 54;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const jag = i % 2 ? 0.86 + r() * 0.1 : 1 + r() * 0.12;
    const x = Math.sin(a) * TEAR_RX * jag;
    const y = TEAR_CY + Math.cos(a) * TEAR_RY * jag;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

function buildPortal() {
  const g = new THREE.Group();
  const shape = tearShape();
  const geo = new THREE.ShapeGeometry(shape, 1);
  const mask = mesh(
    geo,
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, side: THREE.DoubleSide }),
  );
  mask.renderOrder = -1000;
  g.add(mask);
  const film = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColA: { value: new THREE.Color(A.portalRimColor.startsWith('#') ? A.portalRimColor : '#c084fc') }, uColB: { value: new THREE.Color('#38e8ff') } },
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColA; uniform vec3 uColB; varying vec2 vP;
      void main(){
        vec2 q = (vP - vec2(0.0, ${TEAR_CY.toFixed(2)})) / vec2(${TEAR_RX.toFixed(2)}, ${TEAR_RY.toFixed(2)});
        float d = length(q);
        float ang = atan(q.y, q.x);
        float edge = smoothstep(0.62, 1.02, d);
        float swirl = 0.5 + 0.5 * sin(ang * 7.0 + uTime * 4.0 - d * 9.0);
        vec3 col = mix(uColA, uColB, swirl) * edge * 1.6 + vec3(1.0) * pow(edge, 6.0);
        gl_FragColor = vec4(col, edge * 0.95);
      }`,
  });
  g.add(mesh(geo, film));
  const pts = shape.getSpacedPoints(320);
  const pos: number[] = [];
  const col: number[] = [];
  const palette = [new THREE.Color('#ffffff'), new THREE.Color('#e879f9'), new THREE.Color('#38e8ff'), new THREE.Color('#facc15')];
  pts.forEach((p, i) => {
    pos.push(p.x, p.y, 0.02);
    const cc = palette[i % palette.length];
    col.push(cc.r, cc.g, cc.b);
  });
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rimGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const base = Float32Array.from(pos);
  const rim = new THREE.Points(rimGeo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  g.add(rim);
  const light = new THREE.PointLight(0xc084fc, 0, 14, 2);
  light.position.set(0, TEAR_CY, 0.8);
  g.add(light);
  return { group: g, film, rim, base, light, pts };
}

// ---------------------------------------------------------------------------

const bump = (x: number, up: number, hold: number, down: number) => (x < 0 ? 0 : x < up ? easeOut(x / up) : x < up + hold ? 1 : 1 - easeOut((x - up - hold) / down));

export default function MultiversePortalRPG(props: BossSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const events = useRef<NonNullable<SceneEvent>[]>([]);
  const lastN = useRef<number | null>(props.event?.n ?? null);

  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    const ev = props.event;
    if (!ev || ev.n === lastN.current) return;
    lastN.current = ev.n;
    events.current.push(ev);
  }, [props.event]);

  const avatar = props.boss.boss_avatar;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const unavailable = () => live.current.onUnavailable();
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(el, { fov: 50, far: 300, background: 0x0b0f1a, onSlow: unavailable });
    } catch {
      unavailable();
      return;
    }
    let alive = true;
    const { scene, camera } = stage;
    const p0 = live.current;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-6, 12, 8);
    scene.add(hemi, sun);
    scene.fog = new THREE.FogExp2(0x1c2536, 0.024);

    const worlds = WORLDS.map((id, k) => BUILDERS[id](-k * STEP));
    worlds.forEach((w) => scene.add(w.group));
    const st = {
      world: worldFor(p0.bossHp, p0.bossMax),
      tr: null as null | { start: number; portalZ: number; swapped: boolean; camFrom: THREE.Vector3; lookFrom: THREE.Vector3; curve: THREE.CatmullRomCurve3 },
      lunge: -1e9,
      crit: false,
      heroHit: -1e9,
      bossHit: -1e9,
      bossAtk: -1e9,
      lastEvent: -1e9,
      bossGone: p0.outcome === 'victory',
      bossScale: p0.outcome === 'victory' ? 0 : 1,
      heroScale: 1,
      victory: p0.outcome === 'victory' ? 0 : -1e9,
      defeat: p0.outcome === 'defeat',
    };
    // Fog + light per world; eased after a portal crossing so nothing pops.
    const goal = { fog: new THREE.Color(), density: 0, sky: new THREE.Color(), ground: new THREE.Color(), hemi: 1, sun: new THREE.Color(), sunI: 1 };
    const fog = scene.fog as THREE.FogExp2;
    const applyLook = (w: number, instant: boolean) => {
      const L = LOOKS[WORLDS[w]];
      goal.fog.set(L.fog);
      goal.density = L.density;
      goal.sky.set(L.sky);
      goal.ground.set(L.ground);
      goal.hemi = L.hemi;
      goal.sun.set(L.sun);
      goal.sunI = L.sunI;
      if (instant) easeLook(1);
    };
    const easeLook = (k: number) => {
      fog.color.lerp(goal.fog, k);
      fog.density += (goal.density - fog.density) * k;
      hemi.color.lerp(goal.sky, k);
      hemi.groundColor.lerp(goal.ground, k);
      hemi.intensity += (goal.hemi - hemi.intensity) * k;
      sun.color.lerp(goal.sun, k);
      sun.intensity += (goal.sunI - sun.intensity) * k;
      (scene.background as THREE.Color).copy(fog.color);
    };
    worlds.forEach((w, k) => setRole(w, k === st.world ? 'main' : 'hidden'));
    applyLook(st.world, true);

    const hero = buildScarlet();
    scene.add(hero.root);
    swapInGlb(hero.root, assetUrl(A.heroModelUrl), 2.1, () => alive);
    const boss = buildBoss(avatar);
    scene.add(boss.root);
    swapInGlb(boss.core, assetUrl(A.bossModelUrl), 3, () => alive);
    const shieldBubble = mesh(new THREE.SphereGeometry(1.25, 20, 14), glow(0x38bdf8, 0.18, true), [0, 1.1, 0]);
    shieldBubble.userData.keep = true;
    hero.root.add(shieldBubble);
    const portal = buildPortal();
    portal.group.visible = false;
    scene.add(portal.group);
    const sparks = new Sparks(220);
    scene.add(sparks.mesh);
    const shards = new Sparks(60, new THREE.TetrahedronGeometry(0.22, 0), false);
    scene.add(shards.mesh);
    const slash = mesh(new THREE.TorusGeometry(1.1, 0.07, 4, 28, Math.PI * 0.95), glow(0xffffff, 0, true));
    scene.add(slash);
    const orb = mesh(new THREE.IcosahedronGeometry(0.28, 1), glow(BOSS_COLORS[avatar]?.shot ?? 0x8b5cf6, 1, true));
    orb.visible = false;
    scene.add(orb);
    const flash = new THREE.PointLight(0xffffff, 0, 10, 2);
    scene.add(flash);

    const arena = () => -st.world * STEP;
    const heroHome = () => new THREE.Vector3(0, 0, arena() + 4);
    const bossHome = () => new THREE.Vector3(0, 0, arena() - 4);
    const camFor = (z: number) => {
      const k = stage.size.w / stage.size.h < 1 ? 1.45 : 1; // portrait phones: pull back
      return new THREE.Vector3(2.3 * k, 2.7 + (k - 1) * 1.5, z + 8.6 * k);
    };
    const camHome = () => camFor(arena());
    const lookHome = () => new THREE.Vector3(0, 1.3, arena() - 1.6);
    hero.root.position.copy(heroHome());
    boss.root.position.copy(bossHome());
    camera.position.copy(camHome());
    const lookAt = lookHome();
    camera.lookAt(lookAt);

    const timers: { at: number; fn: () => void }[] = [];
    const later = (now: number, delay: number, fn: () => void) => timers.push({ at: now + delay, fn });
    const bossPos = () => boss.root.position.clone().add(new THREE.Vector3(0, 1.8, 0));
    const heroPos = () => hero.root.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const shot = { from: new THREE.Vector3(), to: new THREE.Vector3(), start: -1e9, dur: 0.45, blocked: false };

    const handle = (ev: NonNullable<SceneEvent>, t: number) => {
      st.lastEvent = t;
      const k = ev.kind;
      if (k === 'correct' || k === 'critical' || k === 'ultimate' || k === 'victory') {
        st.lunge = t;
        st.crit = k !== 'correct';
        later(t, 0.22, () => {
          st.bossHit = t + 0.22;
          slash.position.copy(bossPos()).add(new THREE.Vector3(0, -0.2, 0.9));
          slash.rotation.set(0, 0, st.crit ? -0.5 : 0.6);
          slash.scale.setScalar(st.crit ? 1.5 : 1);
          (slash.material as THREE.MeshBasicMaterial).color.set(st.crit ? 0xffd166 : 0xffffff);
          sparks.emit(bossPos(), st.crit ? 46 : 22, { color: st.crit ? 0xffd166 : 0xfff3c4, speed: st.crit ? 7 : 4.5, life: 0.6, size: st.crit ? 1.6 : 1.1 });
          flash.position.copy(bossPos());
          flash.color.set(st.crit ? 0xffd166 : 0xffffff);
          flash.intensity = st.crit ? 30 : 14;
          if (st.crit) stage.shake(1, 0.45);
          if (k === 'victory') {
            later(t + 0.22, 0.25, () => {
              st.bossGone = true;
              st.victory = t + 0.5;
              shards.emit(bossPos(), 40, { color: BOSS_COLORS[avatar]?.body ?? 0x444444, speed: 8, life: 1.6, size: 1.2, gravity: 9, up: 4 });
              sparks.emit(bossPos(), 80, { color: 0xffd166, speed: 9, life: 1.2, size: 1.6, up: 3 });
              stage.shake(1, 0.6);
            });
          }
        });
      } else if (k === 'wrong' || k === 'miss' || k === 'blocked' || k === 'defeat') {
        st.bossAtk = t;
        shot.from.copy(bossPos());
        shot.to.copy(heroPos());
        shot.start = t + 0.25;
        shot.blocked = k === 'blocked';
        later(t, 0.7, () => {
          if (shot.blocked) {
            sparks.emit(heroPos(), 26, { color: 0x7dd3fc, speed: 5, life: 0.5 });
          } else {
            st.heroHit = t + 0.7;
            sparks.emit(heroPos(), 18, { color: 0xff4d6d, speed: 4, life: 0.5 });
            stage.shake(0.6, 0.3);
          }
          if (k === 'defeat') st.defeat = true;
        });
      } else {
        sparks.emit(heroPos(), 30, { color: 0x5eead4, speed: 3, life: 0.9, up: 3, spread: new THREE.Vector3(1, 0.5, 1) });
      }
    };

    const startTransition = (t: number) => {
      const portalZ = arena() - 7.5;
      portal.group.position.set(0, 0, portalZ);
      portal.group.scale.set(0.02, 0.02, 1);
      portal.group.visible = true;
      setRole(worlds[st.world], 'mainMasked');
      setRole(worlds[st.world + 1], 'behind');
      const camFrom = camera.position.clone();
      const camTo = camFor(-(st.world + 1) * STEP);
      const curve = new THREE.CatmullRomCurve3([camFrom, new THREE.Vector3(0.9, 2.6, portalZ + 3.5), new THREE.Vector3(0, 2.45, portalZ + 0.9), new THREE.Vector3(0, 2.45, portalZ - 1.2), camTo]);
      st.tr = { start: t, portalZ, swapped: false, camFrom, lookFrom: lookAt.clone(), curve };
    };

    const tmp = new THREE.Vector3();
    stage.run((dt, t) => {
      const p = live.current;
      worlds.forEach((w) => w.group.visible && w.tick(t));
      for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= t) timers.splice(i, 1)[0].fn();
      if (!st.tr) {
        const ev = events.current.shift();
        if (ev) handle(ev, t);
        const target = worldFor(p.bossHp, p.bossMax);
        if (target > st.world && st.world < WORLDS.length - 1 && p.bossHp > 0 && t - st.lastEvent > 1.1) startTransition(t);
      }

      // --- Portal transition ---
      if (st.tr) {
        const T = t - st.tr.start;
        const open = st.tr.swapped ? 0 : 1;
        const sy = easeOut(clamp(T / 0.35));
        const sx = 0.03 + 0.97 * easeOut(clamp((T - 0.25) / 0.6));
        portal.group.scale.set(Math.max(0.02, sx) * open, Math.max(0.02, sy) * open, 1);
        portal.light.intensity = 18 * sy * open;
        portal.film.uniforms.uTime.value = t;
        const arr = portal.rim.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const j = Math.sin(t * 9 + i) * 0.05;
          arr[i] = portal.base[i] * (1 + j);
          arr[i + 1] = TEAR_CY + (portal.base[i + 1] - TEAR_CY) * (1 + j);
        }
        portal.rim.geometry.attributes.position.needsUpdate = true;
        if (Math.random() < 0.6 && open) {
          const q = portal.pts[Math.floor(Math.random() * portal.pts.length)];
          sparks.emit(tmp.set(q.x * sx, q.y * sy, 0).add(portal.group.position), 1, { color: Math.random() > 0.5 ? 0xe879f9 : 0x38e8ff, speed: 1.2, life: 0.8, gravity: -0.5, up: 0.3, size: 0.8 });
        }
        // Boss flees into the tear.
        if (T > 0.3 && T < 1.25) {
          const k = easeInOut((T - 0.3) / 0.95);
          boss.root.position.lerpVectors(bossHome(), new THREE.Vector3(0, 1.2, st.tr.portalZ), k);
          st.bossScale = 1 - k;
        }
        if (T >= 1.25 && !st.bossGone) {
          st.bossGone = true;
          sparks.emit(new THREE.Vector3(0, TEAR_CY, st.tr.portalZ), 30, { color: 0xe879f9, speed: 5, life: 0.7 });
        }
        // Hero runs in.
        if (T > 1.15 && T < 1.95) {
          const k = easeInOut((T - 1.15) / 0.8);
          hero.root.position.lerpVectors(heroHome(), new THREE.Vector3(0, 0, st.tr.portalZ + 0.4), k);
          st.heroScale = T > 1.75 ? 1 - (T - 1.75) / 0.2 : 1;
        }
        // Camera flies through.
        const s = easeInOut(clamp((T - 1.0) / 2.5));
        st.tr.curve.getPoint(s, camera.position);
        const nextLook = new THREE.Vector3(0, 1.3, -(st.world + (st.tr.swapped ? 0 : 1)) * STEP - 1.6);
        lookAt.lerpVectors(st.tr.lookFrom, nextLook, s);
        if (!st.tr.swapped && camera.position.z < st.tr.portalZ + 0.55) {
          st.tr.swapped = true;
          setRole(worlds[st.world], 'hidden');
          st.world += 1;
          setRole(worlds[st.world], 'main');
          portal.group.visible = false;
          portal.light.intensity = 0;
          applyLook(st.world, false);
          hero.root.position.copy(heroHome());
          st.heroScale = 0;
        }
        if (st.tr.swapped && T > 3.0 && st.heroScale < 1) {
          if (st.heroScale === 0) sparks.emit(heroPos(), 30, { color: 0xffffff, speed: 4, life: 0.6 });
          st.heroScale = Math.min(1, st.heroScale + dt * 5);
        }
        if (st.tr.swapped && T > 3.25 && st.bossGone && p.bossHp > 0) {
          st.bossGone = false;
          boss.root.position.copy(bossHome());
          sparks.emit(bossPos(), 40, { color: 0x6d28d9, speed: 5, life: 0.9, size: 1.4 });
        }
        if (!st.bossGone && st.tr.swapped) st.bossScale = Math.min(1, st.bossScale + dt * 3);
        if (T > 3.6 && st.tr.swapped) {
          st.tr = null;
          st.heroScale = 1;
        }
      }
      easeLook(1 - Math.exp(-2.5 * dt));
      if (!st.tr) {
        // Normal framing.
        const ch = camHome();
        camera.position.x = damp(camera.position.x, ch.x, 3, dt);
        camera.position.y = damp(camera.position.y, ch.y, 3, dt);
        camera.position.z = damp(camera.position.z, ch.z, 3, dt);
        lookAt.lerp(lookHome(), 1 - Math.exp(-3 * dt));
        if (!st.bossGone) st.bossScale = damp(st.bossScale, 1, 6, dt);
      }
      camera.lookAt(lookAt);

      // --- Hero animation ---
      const L = t - st.lunge;
      const dash = bump(L, 0.16, 0.12, 0.35);
      if (!st.tr) {
        const home = heroHome();
        const recoil = bump(t - st.heroHit, 0.06, 0.05, 0.4) * 0.5;
        hero.root.position.set(home.x, home.y, home.z - dash * 5.2 + recoil);
      }
      hero.root.scale.setScalar(Math.max(0.001, st.heroScale));
      const run = st.tr && (t - st.tr.start) > 1.15 && (t - st.tr.start) < 1.95;
      const stride = run || dash > 0.05 ? Math.sin(t * 16) * 0.7 : Math.sin(t * 2) * 0.04;
      hero.legL.rotation.x = stride;
      hero.legR.rotation.x = -stride;
      hero.body.position.y = Math.sin(t * 2.2) * 0.03 - (st.defeat ? 0.4 : 0);
      hero.body.rotation.x = st.defeat ? -0.4 : 0;
      if (L < 0.6) {
        hero.armR.rotation.x = L < 0.18 ? lerpN(REST, WINDUP, L / 0.18) : L < 0.38 ? lerpN(WINDUP, STRIKE, easeOut((L - 0.18) / 0.2)) : lerpN(STRIKE, REST, (L - 0.38) / 0.22);
        hero.body.rotation.y = st.crit ? easeOut(L / 0.45) * Math.PI * 2 : 0;
      } else if (st.victory > 0 && t > st.victory) {
        hero.armR.rotation.x = damp(hero.armR.rotation.x, RAISED, 6, dt);
        hero.body.rotation.y = 0;
      } else {
        hero.armR.rotation.x = damp(hero.armR.rotation.x, REST + Math.sin(t * 2) * 0.05, 8, dt);
        hero.body.rotation.y = 0;
      }
      const hurt = bump(t - st.heroHit, 0.04, 0.08, 0.35);
      for (const m of hero.mats) {
        if (m.userData.e === undefined) m.userData.e = m.emissive.getHex();
        if (hurt > 0.01) m.emissive.setRGB(hurt * 0.9, 0.05 * hurt, 0.05 * hurt);
        else m.emissive.setHex(m.userData.e);
      }
      shieldBubble.visible = p.shield;
      shieldBubble.scale.setScalar(1 + Math.sin(t * 4) * 0.03);

      // --- Boss animation ---
      const atk = bump(t - st.bossAtk, 0.2, 0.05, 0.4);
      const hit = bump(t - st.bossHit, 0.04, 0.05, 0.35);
      if (!st.tr) {
        const home = bossHome();
        boss.root.position.set(home.x + Math.sin(t * 40) * hit * 0.08, home.y, home.z + atk * 1.4 - hit * 0.5);
      }
      const big = (p.bossPhase === 2 ? 1.15 : 1) * (st.bossGone ? 0 : st.bossScale);
      boss.root.scale.setScalar(Math.max(0.001, big));
      boss.root.visible = big > 0.002;
      boss.core.position.y = 1.7 + Math.sin(t * (st.defeat ? 4 : 1.6)) * (st.defeat ? 0.25 : 0.14);
      boss.core.rotation.y = Math.sin(t * 0.7) * 0.15;
      boss.wings.forEach((w, i) => (w.rotation.y = Math.sin(t * 5 + i) * 0.35 * (i ? 1 : -1)));
      for (const m of boss.mats) {
        const tm = m as THREE.MeshToonMaterial;
        if (tm.userData.e === undefined) tm.userData.e = tm.emissive.getHex();
        if (hit > 0.01) tm.emissive.setRGB(hit, hit, hit);
        else tm.emissive.setHex(tm.userData.e);
      }
      boss.eyeMat.color.setHex(p.enraged ? (Math.sin(t * 10) > 0 ? 0xff2222 : 0xff8888) : BOSS_COLORS[avatar]?.eye ?? 0xffffff);
      (boss.aura.material as THREE.MeshBasicMaterial).opacity = p.enraged ? 0.6 + Math.sin(t * 8) * 0.3 : p.bossPhase === 2 ? 0.35 : 0;
      boss.aura.rotation.z = t;

      // --- Projectile, slash, flash ---
      const sp = (t - shot.start) / shot.dur;
      orb.visible = sp >= 0 && sp <= 1;
      if (orb.visible) {
        orb.position.lerpVectors(shot.from, shot.to, easeInOut(sp));
        orb.position.y += Math.sin(sp * Math.PI) * 0.8;
        orb.rotation.set(t * 5, t * 7, 0);
        if (Math.random() < 0.7) sparks.emit(orb.position, 1, { color: BOSS_COLORS[avatar]?.shot ?? 0x8b5cf6, speed: 0.5, life: 0.4, gravity: 0, size: 0.9 });
      }
      const sm = slash.material as THREE.MeshBasicMaterial;
      sm.opacity = Math.max(0, sm.opacity - dt * 3.2);
      if (t - st.bossHit < 0.05) sm.opacity = 1;
      flash.intensity = Math.max(0, flash.intensity - dt * 60);
      if (st.victory > 0 && t > st.victory && Math.random() < 0.25) sparks.emit(bossHome().add(new THREE.Vector3(0, 0.5, 0)), 2, { color: 0xffd166, speed: 3, up: 5, life: 1.4, gravity: 3 });
      sparks.update(dt);
      shards.update(dt);
    });

    return () => {
      alive = false;
      stage.dispose();
    };
  }, [avatar]);

  return <div ref={host} className="absolute inset-0" aria-hidden />;
}

function lerpN(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t);
}
