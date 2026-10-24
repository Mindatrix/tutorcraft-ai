'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { THREE_ASSET_MANIFEST, assetUrl } from '../../config/threeAssets';
import { Sparks, clamp, createStage, damp, easeOut, glow, lowpoly, mesh, roughen, skyDome, swapInGlb, toon } from './kit';
import type { BossSceneProps, SceneEvent } from './types';

// GAME 4 — Dino Island Run 2.5D.
// Side-scrolling platformer in a real 3D scene (perspective parallax). The green dino
// auto-runs to the cage of the current question. Correct → it throws a bone, the iron
// cage bursts and the friend joins the parade; wrong → a rock trap drops (HP comes from
// the server). Space / ↑ / tap = jump, F / 🦴 = throw a bone at beetles (just for fun:
// nothing the player does here changes the score).

const A = THREE_ASSET_MANIFEST.gameModes.dino_island;
const DINO = A.palette.dino.startsWith('#') ? A.palette.dino : '#5cc93b';
const LAVA = A.palette.lava.startsWith('#') ? A.palette.lava : '#ff6a1a';
const START = 6;
const SPACING = 11;
const FRIEND_COLORS = [0xf59e0b, 0xf472b6, 0x60a5fa, 0xa78bfa, 0xfb7185, 0x2dd4bf];

interface Dino {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  tail: THREE.Mesh;
  mats: THREE.MeshToonMaterial[];
}

function buildDino(color: THREE.ColorRepresentation, scale = 1): Dino {
  const mats: THREE.MeshToonMaterial[] = [];
  const m = (c: THREE.ColorRepresentation, e: THREE.ColorRepresentation = 0x000000) => {
    const x = toon(c, e);
    mats.push(x);
    return x;
  };
  const skin = m(color);
  const belly = m(0xf6e7b8);
  const spike = m(0xf97316, 0x401000);
  const white = m(0xffffff);
  const black = m(0x111111);
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.95;
  root.add(body);
  const torso = mesh(new THREE.SphereGeometry(0.55, 18, 14), skin);
  torso.scale.set(1.15, 1, 0.9);
  body.add(torso);
  const tummy = mesh(new THREE.SphereGeometry(0.42, 16, 12), belly, [0.18, -0.08, 0]);
  tummy.scale.set(0.9, 1, 0.95);
  body.add(tummy);
  const head = new THREE.Group();
  head.position.set(0.55, 0.62, 0);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.5, 18, 14), skin));
  const snout = mesh(new THREE.SphereGeometry(0.34, 16, 12), skin, [0.4, -0.12, 0]);
  snout.scale.set(1.15, 0.85, 1);
  head.add(snout);
  for (const z of [-0.22, 0.22]) {
    head.add(mesh(new THREE.SphereGeometry(0.17, 14, 10), white, [0.2, 0.18, z]));
    head.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), black, [0.3, 0.17, z * 1.18]));
    head.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), white, [0.34, 0.22, z * 1.32]));
  }
  const smile = mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16, Math.PI * 0.8), m(0x7f1d1d), [0.55, -0.2, 0.2]);
  smile.rotation.set(0, 0.3, Math.PI * 1.1);
  head.add(smile);
  for (let i = 0; i < 6; i++) {
    const a = 0.2 + i * 0.36;
    const s = mesh(new THREE.ConeGeometry(0.11 - i * 0.008, 0.26, 5), spike, [0.45 - Math.sin(a) * 0.9 + 0.2, 0.42 + Math.cos(a) * 0.35 - 0.05, 0]);
    s.rotation.z = Math.sin(a) * 0.9;
    body.add(s);
  }
  const tail = mesh(new THREE.ConeGeometry(0.28, 1.05, 10), skin, [-0.95, -0.12, 0]);
  tail.rotation.z = Math.PI / 2 + 0.35;
  body.add(tail);
  for (const z of [-0.25, 0.25]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 8), skin, [0.42, -0.1, z]);
    arm.rotation.z = -1.0;
    body.add(arm);
  }
  const legs = [-0.22, 0.22].map((z) => {
    const L = new THREE.Group();
    L.position.set(0.05, -0.35, z);
    L.add(mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.45, 8), skin, [0, -0.2, 0]));
    const foot = mesh(new THREE.SphereGeometry(0.16, 10, 8), skin, [0.08, -0.42, 0]);
    foot.scale.set(1.4, 0.6, 1);
    L.add(foot);
    body.add(L);
    return L;
  });
  root.scale.setScalar(scale);
  return { root, body, head, legs, tail, mats };
}

interface Station {
  x: number;
  cage: THREE.Group;
  bars: THREE.Group;
  friend: Dino;
  state: 'locked' | 'open' | 'sad';
  openedAt: number;
}

function buildCage(): { cage: THREE.Group; bars: THREE.Group } {
  const iron = lowpoly(0x4b5563, { metal: 0.5, rough: 0.5 });
  const wood = lowpoly(0x8b5a2b);
  const cage = new THREE.Group();
  // Gallows: post + beam + chain.
  cage.add(mesh(new THREE.BoxGeometry(0.22, 4.2, 0.22), wood, [-1.1, 2.1, -0.6]));
  cage.add(mesh(new THREE.BoxGeometry(1.6, 0.2, 0.22), wood, [-0.4, 4.15, -0.6]));
  cage.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), iron, [0, 3.65, -0.6]));
  const bars = new THREE.Group();
  bars.position.set(0, 2.35, -0.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    bars.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 5), iron, [Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62]));
  }
  for (const y of [-0.7, 0.7]) {
    const ring = mesh(new THREE.TorusGeometry(0.62, 0.05, 5, 20), iron, [0, y, 0]);
    ring.rotation.x = Math.PI / 2;
    bars.add(ring);
  }
  bars.add(mesh(new THREE.ConeGeometry(0.66, 0.4, 10), iron, [0, 0.9, 0]));
  bars.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.1), toon(0xfacc15, 0x3a2a00), [0, -0.25, 0.66]));
  cage.add(bars);
  return { cage, bars };
}

function buildBeetle(): THREE.Group {
  const g = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x7c4a2d));
  shell.scale.set(1.2, 0.9, 1);
  g.add(shell);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const s = mesh(new THREE.ConeGeometry(0.07, 0.25, 5), toon(0xfb923c), [Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.25]);
    s.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(s);
  }
  const horn = mesh(new THREE.ConeGeometry(0.08, 0.35, 6), toon(0xfb923c), [0.55, 0.15, 0]);
  horn.rotation.z = -1.1;
  g.add(horn);
  for (const z of [-0.12, 0.12]) g.add(mesh(new THREE.SphereGeometry(0.06, 6, 6), glow(0xfde047), [0.48, 0.18, z]));
  return g;
}

function waterfallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      float h(float x){ return fract(sin(x * 12.9898) * 43758.5453); }
      void main(){
        float col = floor(vUv.x * 18.0);
        float streak = fract(vUv.y * (2.0 + h(col) * 2.0) + uTime * (0.9 + h(col + 3.0)));
        float s = smoothstep(0.0, 0.7, streak);
        vec3 c = mix(vec3(0.62, 0.86, 1.0), vec3(1.0), s * 0.8);
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float foam = smoothstep(0.12, 0.0, vUv.y);
        gl_FragColor = vec4(mix(c, vec3(1.0), foam), (0.82 + foam * 0.18) * edge);
      }`,
  });
}

export default function DinoRun2D(props: BossSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const events = useRef<NonNullable<SceneEvent>[]>([]);
  const lastN = useRef<number | null>(props.event?.n ?? null);
  const input = useRef({ jump: false, throw: false });

  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const ev = props.event;
    if (!ev || ev.n === lastN.current) return;
    lastN.current = ev.n;
    events.current.push(ev);
  }, [props.event]);

  const total = Math.max(1, props.qTotal);
  // Server truth: a question that dealt damage = a friend freed.
  const rescued = props.results.filter(Boolean).length;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const unavailable = () => live.current.onUnavailable();
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(el, { fov: 32, far: 260, background: 0x8fd3ff, onSlow: unavailable });
    } catch {
      unavailable();
      return;
    }
    let alive = true;
    const { scene, camera, renderer } = stage;
    const p0 = live.current;
    const endX = START + total * SPACING + 8;

    const sky = skyDome(0x3d9cf0, 0xd8f2ff, 0x8fd3ff, { radius: 200 });
    scene.add(sky);
    const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
    const skyDay = { top: new THREE.Color(0x3d9cf0), hor: new THREE.Color(0xd8f2ff) };
    const skyLava = { top: new THREE.Color(0x3b1a4a), hor: new THREE.Color(0xff8a3d) };
    scene.fog = new THREE.Fog(0xcdeeff, 16, 95);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x5a7a3a, 1.15);
    const sun = new THREE.DirectionalLight(0xfff3d6, 1.9);
    sun.position.set(-8, 14, 10);
    scene.add(hemi, sun);

    // ---------- World ----------
    const rock = lowpoly(0x9a7b5f);
    const rockDark = lowpoly(0x6f5a48);
    const grass = lowpoly(0x5dbb3a);
    const leaf = lowpoly(0x2f8f3a);
    const vine = lowpoly(0x3f9d3a);
    const falls: THREE.ShaderMaterial[] = [];
    let seed = 7;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    // Ground platforms with pits between stations.
    const pits: { a: number; b: number }[] = [];
    let x = -14;
    while (x < endX + 20) {
      const w = 6 + r() * 5;
      const gap = x > START + 2 && x < endX - 6 && r() > 0.35 ? 1.4 + r() * 0.9 : 0;
      const block = mesh(roughen(new THREE.BoxGeometry(w, 4, 4.2, 3, 2, 2), 0.12, Math.floor(x * 10)), rock, [x + w / 2, -2, 0]);
      scene.add(block);
      scene.add(mesh(roughen(new THREE.BoxGeometry(w + 0.2, 0.35, 4.4, 4, 1, 2), 0.06, Math.floor(x * 7)), grass, [x + w / 2, 0.05, 0]));
      if (gap) {
        pits.push({ a: x + w, b: x + w + gap });
        scene.add(mesh(new THREE.PlaneGeometry(gap + 0.4, 3.5), glow(x > endX * 0.72 ? LAVA : 0x2a6f9b), [x + w + gap / 2, -3.2, 0.2]));
      }
      x += w + gap;
    }
    const overPit = (px: number) => pits.some((p) => px > p.a - 0.4 && px < p.b + 0.4);
    // Mid layer: rock pillars with vines, bridges, trees.
    for (let px = -10; px < endX + 30; px += 7 + r() * 5) {
      const h = 5 + r() * 6;
      const pillar = mesh(roughen(new THREE.CylinderGeometry(1.2, 1.7, h, 7, 3), 0.25, Math.floor(px)), r() > 0.5 ? rock : rockDark, [px, h / 2 - 2, -17 - r() * 6]);
      scene.add(pillar);
      pillar.add(mesh(roughen(new THREE.CylinderGeometry(1.5, 1.4, 0.6, 7), 0.15, Math.floor(px) + 1), grass, [0, h / 2 + 0.2, 0]));
      for (let v = 0; v < 3; v++) {
        const len = 1.5 + r() * 3;
        scene.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 4), vine, [px - 1 + v * 0.9, h - 1 - len / 2, pillar.position.z + 1.5]));
      }
      if (r() > 0.5) {
        const tree = new THREE.Group();
        tree.position.set(px + 1, h - 0.6, pillar.position.z);
        tree.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.6, 6), lowpoly(0x7a5230), [0, 0.8, 0]));
        tree.add(mesh(new THREE.IcosahedronGeometry(1.1, 0), leaf, [0, 2.1, 0]));
        scene.add(tree);
      }
      if (r() > 0.6) {
        const bridge = new THREE.Group();
        bridge.position.set(px + 4.5, h - 1.2, pillar.position.z);
        for (let k = 0; k < 9; k++) bridge.add(mesh(new THREE.BoxGeometry(0.5, 0.1, 1.2), lowpoly(0x9a6a3c), [-2 + k * 0.5, -Math.sin((k / 8) * Math.PI) * 0.4, 0]));
        scene.add(bridge);
      }
    }
    // Far layer: cliffs with waterfalls (turn volcanic near the end).
    for (let px = -20; px < endX + 40; px += 16 + r() * 6) {
      const lavaZone = px > endX * 0.72;
      const h = 18 + r() * 12;
      const cliff = mesh(roughen(new THREE.BoxGeometry(12, h, 6, 4, 4, 2), 0.6, Math.floor(px * 3)), lavaZone ? lowpoly(0x4a3a3a) : rockDark, [px, h / 2 - 4, -36]);
      scene.add(cliff);
      if (!lavaZone) {
        scene.add(mesh(roughen(new THREE.BoxGeometry(12.4, 1, 6.4, 4, 1, 2), 0.3, Math.floor(px)), grass, [px, h - 4, -36]));
        const mat = waterfallMaterial();
        falls.push(mat);
        const fall = mesh(new THREE.PlaneGeometry(3.2, h), mat, [px + 2, h / 2 - 4, -32.9]);
        scene.add(fall);
      } else {
        const lava = mesh(new THREE.PlaneGeometry(1.6, h), glow(LAVA, 0.9), [px + 2, h / 2 - 4, -32.9]);
        scene.add(lava);
      }
    }
    // Volcano + T-Rex castle at the end.
    const volcano = mesh(roughen(new THREE.ConeGeometry(22, 26, 9, 3, true), 0.8, 9), lowpoly(0x3f2f2f), [endX + 10, 9, -70]);
    scene.add(volcano);
    scene.add(mesh(new THREE.CylinderGeometry(4.5, 5, 1, 9), glow(LAVA), [endX + 10, 21.6, -70]));
    const castle = new THREE.Group();
    castle.position.set(endX + 3, 0, -3);
    const stone = lowpoly(0x5a4a4a);
    castle.add(mesh(roughen(new THREE.BoxGeometry(6, 6, 3), 0.15, 3), stone, [0, 3, 0]));
    for (const cx of [-3, 3]) castle.add(mesh(roughen(new THREE.CylinderGeometry(1.1, 1.3, 8, 7), 0.12, 5), stone, [cx, 4, 0]));
    for (let k = 0; k < 5; k++) castle.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 3.2), stone, [-2.4 + k * 1.2, 6.3, 0]));
    castle.add(mesh(new THREE.PlaneGeometry(1.8, 2.6), glow(0xff7a1a), [0, 1.3, 1.52]));
    scene.add(castle);
    const rex = buildDino(0xb91c1c, 1.9);
    rex.root.position.set(endX + 3, 6.6, -3);
    rex.root.rotation.y = Math.PI; // faces the hero (-x)
    const crown = mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.25, 6, 1, true), toon(0xfacc15, 0x3a2a00), [0.05, 0.55, 0]);
    rex.head.add(crown);
    scene.add(rex.root);

    // Stations (one cage per question).
    const stations: Station[] = [];
    for (let i = 0; i < total; i++) {
      const sx = START + i * SPACING + SPACING * 0.6;
      const { cage, bars } = buildCage();
      cage.position.set(sx, 0, 0);
      const friend = buildDino(FRIEND_COLORS[i % FRIEND_COLORS.length], 0.5);
      friend.root.position.set(0, -0.58, 0);
      bars.add(friend.root);
      scene.add(cage);
      const done = p0.results[i];
      const s: Station = { x: sx, cage, bars, friend, state: done === undefined ? 'locked' : done ? 'open' : 'sad', openedAt: -1e9 };
      if (s.state === 'open') bars.visible = false;
      stations.push(s);
    }
    // Rescued friends parade behind the hero.
    const parade: Dino[] = [];
    const joinParade = (st: Station, at: THREE.Vector3) => {
      const f = buildDino(FRIEND_COLORS[stations.indexOf(st) % FRIEND_COLORS.length], 0.5);
      f.root.position.copy(at);
      scene.add(f.root);
      parade.push(f);
    };
    // Foreground leaves for depth.
    for (let px = -8; px < endX + 20; px += 9 + r() * 8) {
      const bush = mesh(new THREE.IcosahedronGeometry(0.8 + r() * 0.4, 0), leaf, [px, -1.1, 4.4]);
      bush.scale.set(1.5, 0.7, 0.6);
      scene.add(bush);
    }

    // Hero.
    const dino = buildDino(DINO);
    scene.add(dino.root);
    swapInGlb(dino.root, assetUrl(A.dinoModelUrl), 1.9, () => alive);
    const stars = new THREE.Group();
    for (let k = 0; k < 5; k++) stars.add(mesh(new THREE.OctahedronGeometry(0.09), glow(0xfde047), [Math.cos(k * 1.25) * 0.5, 0, Math.sin(k * 1.25) * 0.5]));
    stars.visible = false;
    scene.add(stars);
    const trap = mesh(roughen(new THREE.DodecahedronGeometry(0.6, 0), 0.1, 3), rockDark);
    for (let k = 0; k < 6; k++) {
      const sp = mesh(new THREE.ConeGeometry(0.12, 0.4, 5), lowpoly(0x9ca3af), [Math.cos(k) * 0.55, Math.sin(k * 2) * 0.3, Math.sin(k) * 0.55]);
      sp.lookAt(sp.position.clone().multiplyScalar(2));
      sp.rotateX(Math.PI / 2);
      trap.add(sp);
    }
    trap.visible = false;
    scene.add(trap);
    const bone = new THREE.Group();
    const boneMat = toon(0xfff7e6);
    bone.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6), boneMat));
    for (const y of [-0.28, 0.28]) for (const z of [-0.07, 0.07]) bone.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), boneMat, [0, y, z]));
    bone.visible = false;
    scene.add(bone);
    const beetles = Array.from({ length: Math.max(2, Math.floor(total / 2)) }, (_, i) => {
      const b = buildBeetle();
      const bx = START + (i * 2 + 1) * SPACING + 3;
      b.position.set(bx, 0.2, 0.6);
      scene.add(b);
      return { g: b, home: bx, dead: -1e9 };
    });
    const sparks = new Sparks(220);
    scene.add(sparks.mesh);
    const debris = new Sparks(80, new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), false);
    scene.add(debris.mesh);

    // ---------- State ----------
    const startStation = Math.min(stations.length - 1, p0.qIndex);
    const st = {
      x: p0.finished ? endX - 4 : (stations[startStation]?.x ?? START) - 2.4,
      y: 0,
      vy: 0,
      onGround: true,
      facing: 1,
      stun: -1e9,
      shot: null as null | { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; onHit: () => void },
      trapT: -1e9,
      victory: p0.outcome === 'victory' ? 0 : -1e9,
      defeat: p0.outcome === 'defeat',
      rexFall: p0.outcome === 'victory' ? 1 : 0,
      queue: [] as { at: number; fn: () => void }[],
    };
    for (let i = 0; i < stations.length; i++) if (stations[i].state === 'open') joinParade(stations[i], new THREE.Vector3(st.x - 1.5, 0, 0.8));

    const throwBone = (to: THREE.Vector3, t: number, onHit: () => void) => {
      const from = new THREE.Vector3(st.x + 0.6, st.y + 1.9, 0.3);
      st.shot = { from, to, t0: t, dur: Math.min(0.9, 0.35 + from.distanceTo(to) * 0.06), onHit };
    };
    const later = (t: number, d: number, fn: () => void) => st.queue.push({ at: t + d, fn });

    const handle = (ev: NonNullable<SceneEvent>, t: number) => {
      const k = ev.kind;
      const p = live.current;
      const idx = Math.max(0, Math.min(stations.length - 1, p.results.length - 1));
      const s = stations[idx];
      if (k === 'correct' || k === 'critical' || k === 'ultimate' || k === 'victory') {
        if (s && s.state !== 'open') {
          const lock = new THREE.Vector3(s.x, 2.1, -0.05);
          throwBone(lock, t, () => {
            s.state = 'open';
            s.openedAt = t;
            s.bars.visible = false;
            debris.emit(lock, 26, { color: 0x6b7280, speed: 6, life: 1.2, gravity: 14, up: 3 });
            sparks.emit(lock, k === 'correct' ? 24 : 50, { color: k === 'correct' ? 0xfde047 : 0xffffff, speed: 5, life: 0.7 });
            if (k !== 'correct') stage.shake(0.8, 0.35);
            joinParade(s, new THREE.Vector3(s.x, 1.8, -0.6));
          });
        }
        if (k === 'victory') st.victory = t + 1.2;
      } else if (k === 'wrong' || k === 'miss' || k === 'defeat' || k === 'blocked') {
        st.trapT = t;
        if (s && s.state === 'locked') s.state = 'sad';
        later(t, 0.55, () => {
          if (k === 'blocked') sparks.emit(new THREE.Vector3(st.x, 2.2, 0), 24, { color: 0x7dd3fc, speed: 4, life: 0.6 });
          else {
            st.stun = t + 0.55;
            stage.shake(0.6, 0.3);
            sparks.emit(new THREE.Vector3(st.x, 1.6, 0), 14, { color: 0xb45309, speed: 3, life: 0.5 });
          }
          if (k === 'defeat') st.defeat = true;
        });
      } else {
        sparks.emit(new THREE.Vector3(st.x, 1.4, 0.3), 26, { color: 0x86efac, speed: 3, life: 0.8, up: 3 });
      }
    };

    // ---------- Input ----------
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (!el.matches(':hover')) return; // only while the pointer is over the game: never steal keys from the page
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        input.current.jump = true;
        e.preventDefault();
      }
      if (e.code === 'KeyF') input.current.throw = true;
    };
    const onTap = () => {
      input.current.jump = true;
    };
    window.addEventListener('keydown', onKey);
    renderer.domElement.addEventListener('pointerdown', onTap);

    const cam = new THREE.Vector3();
    const camK = () => (stage.size.w / stage.size.h < 1 ? 1.7 : 1);
    camera.position.set(st.x + 3, 3.0, 11.5 * camK());

    stage.run((dt, t) => {
      const p = live.current;
      falls.forEach((f) => (f.uniforms.uTime.value = t));
      for (let i = st.queue.length - 1; i >= 0; i--) if (st.queue[i].at <= t) st.queue.splice(i, 1)[0].fn();
      const ev = events.current.shift();
      if (ev) handle(ev, t);

      // Where to run: the cage of the current question, or the castle at the end.
      const target = p.finished ? endX - 4 : (stations[Math.min(stations.length - 1, p.qIndex)]?.x ?? START) - 2.4;
      const stunned = t < st.stun + 1.0;
      const dx = target - st.x;
      const speed = stunned ? 0 : 5.2;
      const step = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
      st.x += step;
      const running = Math.abs(step) > 0.001;
      if (Math.abs(dx) > 0.05) st.facing = Math.sign(dx);

      // Jump physics (auto-jump over pits; manual jump is just for fun).
      const ahead = st.x + st.facing * 1.1;
      if (st.onGround && ((running && overPit(ahead)) || input.current.jump) && !stunned && !st.defeat) {
        st.vy = 9.5;
        st.onGround = false;
        sparks.emit(new THREE.Vector3(st.x, 0.1, 0.3), 6, { color: 0xe7d7b1, speed: 2, life: 0.4, gravity: 4, up: 1 });
      }
      input.current.jump = false;
      if (!st.onGround) {
        st.vy -= 26 * dt;
        st.y += st.vy * dt;
        if (st.y <= 0 && !overPit(st.x)) {
          st.y = 0;
          st.vy = 0;
          st.onGround = true;
        } else if (st.y < 0 && overPit(st.x)) {
          // Never fall: glide over the gap.
          st.y = 0.05;
          st.vy = Math.max(st.vy, 2);
        }
      }
      if (input.current.throw) {
        input.current.throw = false;
        if (!st.shot) {
          const near = beetles.filter((b) => t - b.dead > 6).sort((a, b) => Math.abs(a.g.position.x - st.x) - Math.abs(b.g.position.x - st.x))[0];
          const to = near && Math.abs(near.g.position.x - st.x) < 12 ? near.g.position.clone().add(new THREE.Vector3(0, 0.3, 0)) : new THREE.Vector3(st.x + st.facing * 8, 0.4, 0.3);
          throwBone(to, t, () => {
            if (near && to.distanceTo(near.g.position) < 1.5) {
              near.dead = t;
              sparks.emit(to, 30, { color: 0xfb923c, speed: 4, life: 0.6 });
            }
          });
        }
      }

      // Hero pose.
      dino.root.position.set(st.x, st.y, 0.3);
      dino.root.rotation.y = st.facing > 0 ? 0 : Math.PI;
      const cyc = running ? Math.sin(t * 15) : 0;
      dino.legs[0].rotation.z = cyc * 0.8;
      dino.legs[1].rotation.z = -cyc * 0.8;
      dino.body.position.y = 0.95 + (running ? Math.abs(Math.sin(t * 15)) * 0.08 : Math.sin(t * 2.5) * 0.03);
      dino.body.rotation.z = st.defeat ? 0.6 : !st.onGround ? clamp(st.vy * 0.04, -0.3, 0.3) : 0;
      dino.body.scale.set(1, st.onGround ? 1 : 1.06, 1);
      dino.tail.rotation.x = Math.sin(t * 6) * 0.25;
      dino.head.rotation.z = st.victory > 0 && t > st.victory ? Math.sin(t * 8) * 0.15 + 0.2 : 0;
      if (st.victory > 0 && t > st.victory && st.onGround && Math.sin(t * 5) > 0.95) {
        st.vy = 7;
        st.onGround = false;
      }
      stars.visible = stunned;
      if (stunned) {
        stars.position.set(st.x + 0.5, st.y + 2.25, 0.3);
        stars.rotation.y = t * 6;
      }

      // Rock trap.
      const T = t - st.trapT;
      trap.visible = T >= 0 && T < 1.1;
      if (trap.visible) {
        const fall = clamp(T / 0.55);
        trap.position.set(st.x + 0.4, 9 - fall * fall * 7.2, 0.3);
        trap.rotation.set(T * 4, T * 3, 0);
        if (T > 0.55) trap.position.y = 1.8 - (T - 0.55) * 4;
      }

      // Bone flight.
      if (st.shot) {
        const k = (t - st.shot.t0) / st.shot.dur;
        bone.visible = true;
        bone.position.lerpVectors(st.shot.from, st.shot.to, clamp(k));
        bone.position.y += Math.sin(clamp(k) * Math.PI) * 1.4;
        bone.rotation.z = t * 18;
        if (k >= 1) {
          const done = st.shot.onHit;
          st.shot = null;
          bone.visible = false;
          done();
        }
      }

      // Cages: sway; sad friends droop; freed friends hop out.
      stations.forEach((s, i) => {
        s.bars.rotation.z = Math.sin(t * 1.3 + i) * 0.05;
        s.friend.body.rotation.z = s.state === 'sad' ? -0.35 : 0;
        s.friend.body.position.y = 0.95 + (s.state === 'locked' ? Math.abs(Math.sin(t * 4 + i)) * 0.12 : 0);
      });
      // Parade follows the hero with a small delay each.
      parade.forEach((f, k) => {
        const tx = st.x - st.facing * (1.3 + k * 0.95);
        const fx = f.root.position.x;
        f.root.position.x = damp(fx, tx, 6, dt);
        const hop = Math.abs(Math.sin(t * 9 + k)) * (Math.abs(tx - fx) > 0.05 || (st.victory > 0 && t > st.victory) ? 0.35 : 0.05);
        f.root.position.y = damp(f.root.position.y, hop, 12, dt);
        f.root.position.z = damp(f.root.position.z, 0.9 + (k % 2) * 0.5, 4, dt);
        f.root.rotation.y = st.facing > 0 ? 0 : Math.PI;
        f.legs[0].rotation.z = Math.sin(t * 15 + k) * 0.6;
        f.legs[1].rotation.z = -Math.sin(t * 15 + k) * 0.6;
      });

      // Beetles patrol (cosmetic).
      beetles.forEach((b, i) => {
        const dead = t - b.dead < 6;
        b.g.visible = !dead;
        b.g.position.x = b.home + Math.sin(t * 0.8 + i) * 1.6;
        b.g.rotation.y = Math.cos(t * 0.8 + i) > 0 ? 0 : Math.PI;
        b.g.position.y = 0.2 + Math.abs(Math.sin(t * 7 + i)) * 0.05;
      });

      // T-Rex king: roars on defeat, topples on victory.
      if (st.victory > 0 && t > st.victory) st.rexFall = Math.min(1, st.rexFall + dt * 0.8);
      rex.root.rotation.z = -easeOut(st.rexFall) * 1.4;
      rex.root.position.y = 6.6 - easeOut(st.rexFall) * 3;
      rex.head.rotation.z = st.defeat ? Math.sin(t * 10) * 0.2 + 0.3 : Math.sin(t * 1.5) * 0.08;
      if (st.victory > 0 && t > st.victory && Math.random() < 0.18) {
        const fx = new THREE.Vector3(endX - 8 + Math.random() * 14, 5 + Math.random() * 5, -4);
        sparks.emit(fx, 24, { color: FRIEND_COLORS[Math.floor(Math.random() * FRIEND_COLORS.length)], speed: 5, life: 1.1, gravity: 3 });
      }

      // Sky turns volcanic near the end.
      const lavaK = clamp((st.x / endX - 0.62) / 0.3);
      skyU.uTop.value.lerpColors(skyDay.top, skyLava.top, lavaK);
      skyU.uHorizon.value.lerpColors(skyDay.hor, skyLava.hor, lavaK);
      (scene.fog as THREE.Fog).color.copy(skyU.uHorizon.value);
      (scene.background as THREE.Color).copy(skyU.uHorizon.value);
      sun.color.setRGB(1, 0.95 - lavaK * 0.3, 0.84 - lavaK * 0.45);

      // Camera: side view with a little lead, pulls back on portrait phones.
      const kk = camK();
      cam.set(st.x + 2.6 * st.facing, 3.0 + st.y * 0.35 + (kk - 1) * 2, 11.5 * kk);
      camera.position.lerp(cam, 1 - Math.exp(-4 * dt));
      camera.lookAt(camera.position.x, 1.8 + (kk - 1) * 1.2, 0);
      sparks.update(dt);
      debris.update(dt);
    });

    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
      renderer.domElement.removeEventListener('pointerdown', onTap);
      stage.dispose();
    };
  }, [total]);

  return (
    <>
      <div ref={host} className="absolute inset-0" aria-label="Dino Island Run: chạm hoặc Space để nhảy, F để ném xương" />
      <div className="pointer-events-none absolute left-6 top-12 z-10 bg-black/45 px-2 py-0.5 text-[11px] font-extrabold text-emerald-200">
        🦖 Đã cứu {rescued}/{total} bạn
      </div>
      <button
        type="button"
        onClick={() => {
          input.current.throw = true;
        }}
        aria-label="Ném xương"
        className="absolute bottom-8 left-6 z-10 grid h-11 w-11 place-items-center rounded-full border-[3px] border-amber-200 bg-amber-400 text-xl shadow-[3px_3px_0_rgb(0_0_0/.5)] active:translate-y-0.5"
      >
        🦴
      </button>
      <span className="pointer-events-none absolute bottom-9 left-20 z-10 hidden text-[10px] font-bold text-white/80 drop-shadow sm:block">Chạm / Space: nhảy · F: ném xương</span>
    </>
  );
}
