'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { THREE_ASSET_MANIFEST, assetUrl } from '../../config/threeAssets';
import { BEVEL_CLIP, Sparks, canvasTexture, clamp, createStage, damp, glow, hashStr, lowpoly, mesh, ndc, skyDome, swapInGlb, textSprite, toon } from './kit';
import type { BossSceneProps, SceneEvent } from './types';

// GAME 5 — AI Agent World 3D.
// A floating isometric learning office (camera fov 30 at [20,20,20] from the student).
// Walk (tap the floor / WASD) to Orion, Kai or Quinn: entering their hotspot opens their
// homework card (progress, accuracy, next task). Each question is "given" by one agent;
// a correct answer makes that agent celebrate, the Homework Glitch (boss) shrinks with
// the server's Boss HP.

const A = THREE_ASSET_MANIFEST.gameModes.ai_agent_world;
const Z = A.zoneColors;
const col = (v: string, d: string) => (v.startsWith('#') ? v : d);

interface AgentDef {
  id: 'orion' | 'kai' | 'quinn';
  name: string;
  role: string;
  color: number;
  css: string;
  home: [number, number];
  roam: [number, number][];
}

const AGENTS: AgentDef[] = [
  { id: 'orion', name: 'Orion', role: 'Điều phối · giao BTVN', color: 0xf5b83d, css: '#f5b83d', home: [0, 0.6], roam: [[0, 0.6], [-1.8, -1.6], [1.6, -1.2]] },
  { id: 'kai', name: 'Kai', role: 'Huấn luyện từ vựng', color: 0x4f8cff, css: '#4f8cff', home: [-6.2, 3.2], roam: [[-6.2, 3.2], [-8.6, -3.4], [-4.2, 5.6]] },
  { id: 'quinn', name: 'Quinn', role: 'Kiểm tra ngữ pháp', color: 0x34c38f, css: '#34c38f', home: [6.6, 4.4], roam: [[6.6, 4.4], [6.4, -3.6], [3.2, 6.2]] },
];
const BOUNDS = { x0: -12, x1: 12, z0: -8.5, z1: 8.5 };
const HOT_R = 1.7;

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function floorLabel(text: string, color = '#e8d6a8') {
  const tex = canvasTexture(512, 96, (ctx) => {
    ctx.fillStyle = color;
    ctx.font = '700 46px "Be Vietnam Pro", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.split('').join(' '), 256, 50);
  });
  const m = mesh(new THREE.PlaneGeometry(3.6, 0.68), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

function desk(withMonitor = true) {
  const g = new THREE.Group();
  const white = lowpoly(0xf1f1f1, { rough: 0.6 });
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.8), white, [0, 0.75, 0]));
  for (const x of [-0.82, 0.82]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.75, 0.7), white, [x, 0.37, 0]));
  if (withMonitor) {
    g.add(mesh(new THREE.BoxGeometry(0.75, 0.48, 0.05), lowpoly(0x111318), [0, 1.12, -0.22]));
    g.add(mesh(new THREE.PlaneGeometry(0.68, 0.4), glow(0x1f6feb, 0.95), [0, 1.12, -0.19]));
  }
  const chair = new THREE.Group();
  chair.position.set(0, 0, 0.7);
  chair.add(mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), white, [0, 0.48, 0]));
  chair.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.07), white, [0, 0.78, 0.22]));
  chair.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6), lowpoly(0x333333), [0, 0.24, 0]));
  g.add(chair);
  return g;
}

function plant(scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 10), lowpoly(0xf5f5f5), [0, 0.22, 0]));
  const leaf = lowpoly(0x3f9a4a);
  for (let i = 0; i < 4; i++) {
    const l = mesh(new THREE.IcosahedronGeometry(0.32, 0), leaf, [Math.cos(i * 1.7) * 0.18, 0.7 + i * 0.12, Math.sin(i * 1.7) * 0.18]);
    l.scale.set(1, 1.3, 0.8);
    g.add(l);
  }
  g.scale.setScalar(scale);
  return g;
}

function buildRobot(def: AgentDef) {
  const g = new THREE.Group();
  const shell = toon(0xeceff3);
  const dark = toon(0x14161c);
  const accent = toon(def.color, def.color, 0.25);
  const body = new THREE.Group();
  g.add(body);
  body.add(mesh(new THREE.CapsuleGeometry(0.32, 0.5, 6, 12), shell, [0, 0.75, 0]));
  body.add(mesh(new THREE.TorusGeometry(0.33, 0.06, 6, 20), accent, [0, 0.62, 0]));
  body.children[1].rotation.x = Math.PI / 2;
  body.add(mesh(new THREE.SphereGeometry(0.3, 16, 12), shell, [0, 1.42, 0]));
  const visor = mesh(new THREE.SphereGeometry(0.31, 16, 8, -1.1, 2.2, 1.1, 0.7), dark, [0, 1.42, 0]);
  body.add(visor);
  for (const x of [-0.1, 0.1]) body.add(mesh(new THREE.SphereGeometry(0.035, 6, 6), glow(def.color), [x, 1.45, 0.29]));
  for (const x of [-0.42, 0.42]) body.add(mesh(new THREE.CapsuleGeometry(0.08, 0.32, 4, 8), shell, [x, 0.85, 0]));
  for (const x of [-0.14, 0.14]) body.add(mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.32, 8), dark, [x, 0.16, 0]));
  if (def.id === 'orion') {
    const halo = mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 28), glow(0xffd166), [0, 1.86, 0]);
    halo.rotation.x = Math.PI / 2;
    body.add(halo);
  }
  const label = textSprite(def.name, { color: '#fff', bg: 'rgba(15,17,24,.78)', border: def.css, height: 0.6 });
  label.position.set(0, 2.25, 0);
  g.add(label);
  const pad = new THREE.Group();
  pad.add(mesh(new THREE.CylinderGeometry(HOT_R, HOT_R, 0.04, 40), lowpoly(0x24262d), [0, 0.02, 0]));
  const ring = mesh(new THREE.TorusGeometry(HOT_R, 0.045, 6, 64), glow(def.color, 0.9, true), [0, 0.05, 0]);
  ring.rotation.x = Math.PI / 2;
  pad.add(ring);
  const inner = mesh(new THREE.TorusGeometry(HOT_R * 0.62, 0.02, 6, 48), glow(def.color, 0.6, true), [0, 0.05, 0]);
  inner.rotation.x = Math.PI / 2;
  pad.add(inner);
  const task = mesh(new THREE.OctahedronGeometry(0.2), glow(0xffd166), [0, 2.75, 0]);
  g.add(task);
  return { g, body, pad, ring, task };
}

function buildStudent(name: string) {
  const h = hashStr(name || 'hero');
  const shirts = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899];
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const shirt = toon(shirts[h % shirts.length]);
  body.add(mesh(new THREE.CapsuleGeometry(0.26, 0.36, 6, 12), shirt, [0, 0.72, 0]));
  body.add(mesh(new THREE.SphereGeometry(0.27, 16, 12), toon(0xf1c3a0), [0, 1.3, 0]));
  const hair = mesh(new THREE.SphereGeometry(0.285, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon([0x2b1b12, 0x4a2c17, 0x111111][h % 3]), [0, 1.33, -0.02]);
  body.add(hair);
  for (const x of [-0.09, 0.09]) body.add(mesh(new THREE.SphereGeometry(0.03, 6, 6), toon(0x111111), [x, 1.32, 0.25]));
  body.add(mesh(new THREE.BoxGeometry(0.34, 0.4, 0.16), toon(0xfacc15), [0, 0.8, -0.28]));
  const legs = [-0.11, 0.11].map((x) => {
    const L = mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.4, 8), toon(0x1e3a8a), [x, 0.2, 0]);
    body.add(L);
    return L;
  });
  const label = textSprite(name || 'Bạn', { color: '#fde68a', bg: 'rgba(15,17,24,.78)', height: 0.5 });
  label.position.set(0, 1.95, 0);
  g.add(label);
  return { g, body, legs };
}

type Modal = { agent: number } | null;

function isInside(o: THREE.Object3D | null, root: THREE.Object3D): boolean {
  for (let n = o; n; n = n.parent) if (n === root) return true;
  return false;
}

const BEVEL = { clipPath: BEVEL_CLIP };

export default function AIAgentWorld(props: BossSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const events = useRef<NonNullable<SceneEvent>[]>([]);
  const lastN = useRef<number | null>(props.event?.n ?? null);
  const [modal, setModal] = useState<Modal>(null);
  const [status, setStatus] = useState<string[]>(['Đang chờ', 'Đang chờ', 'Đang chờ']);
  const keys = useRef(new Set<string>());

  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const ev = props.event;
    if (!ev || ev.n === lastN.current) return;
    lastN.current = ev.n;
    events.current.push(ev);
  }, [props.event]);

  const heroName = props.heroName;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const unavailable = () => live.current.onUnavailable();
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(el, { fov: 30, far: 220, background: 0x0b1220, onSlow: unavailable });
    } catch {
      unavailable();
      return;
    }
    let alive = true;
    const { scene, camera, renderer } = stage;
    scene.add(skyDome(0x050a18, 0x15233f, 0x050a18, { stars: 1 }));
    const hemi = new THREE.HemisphereLight(0x9fb6ff, 0x1a1d24, 0.95);
    const moon = new THREE.DirectionalLight(0xc8d6ff, 1.0);
    moon.position.set(-10, 18, 8);
    scene.add(hemi, moon);

    // ---------- Floating island office ----------
    const office = new THREE.Group();
    scene.add(office);
    office.add(mesh(new THREE.BoxGeometry(26, 0.5, 19), lowpoly(0x2f3138, { rough: 0.9 }), [0, -0.25, 0]));
    office.add(mesh(new THREE.BoxGeometry(26.4, 1.6, 19.4), lowpoly(0x5b4636), [0, -1.3, 0]));
    office.add(mesh(new THREE.BoxGeometry(26.6, 0.18, 19.6), lowpoly(0x4c9a3c), [0, -0.5, 0]));
    const water = mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ color: 0x0d1b33, roughness: 0.25, metalness: 0.3 }), [0, -2.2, 0]);
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const lights: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const l = mesh(new THREE.CircleGeometry(0.12, 8), glow(0xffe8b0), [-12 + i * 1.85, -0.4, 9.82]);
      lights.push(l);
      office.add(l);
    }
    // Back walls with city windows.
    const cityTex = canvasTexture(256, 64, (ctx) => {
      ctx.fillStyle = '#0c1424';
      ctx.fillRect(0, 0, 256, 64);
      for (let k = 0; k < 90; k++) {
        ctx.fillStyle = ['#fbbf24', '#fde68a', '#93c5fd', '#f9a8d4'][k % 4];
        ctx.globalAlpha = 0.4 + (k % 5) * 0.12;
        ctx.fillRect((k * 53) % 250, 8 + ((k * 31) % 46), 3, 4);
      }
    });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0f1a2e, emissive: 0xffffff, emissiveMap: cityTex, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.4 });
    office.add(mesh(new THREE.BoxGeometry(26, 3.6, 0.15), glass, [0, 1.8, -9.45]));
    const side = mesh(new THREE.BoxGeometry(0.15, 3.6, 19), glass, [-12.95, 1.8, 0]);
    office.add(side);
    for (let i = 0; i < 9; i++) office.add(mesh(new THREE.BoxGeometry(0.08, 3.6, 0.2), lowpoly(0x0a0a0a), [-12 + i * 3, 1.8, -9.35]));
    // Bookshelves.
    const books = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0x8b5cf6, 0xf1f5f9];
    for (const bx of [3.5, 5.6, 7.7, 9.8]) {
      const shelf = new THREE.Group();
      shelf.position.set(bx, 0, -8.9);
      shelf.add(mesh(new THREE.BoxGeometry(1.9, 2.6, 0.5), lowpoly(0x7a5232), [0, 1.3, 0]));
      for (let r2 = 0; r2 < 4; r2++) for (let b = 0; b < 7; b++) shelf.add(mesh(new THREE.BoxGeometry(0.18, 0.42, 0.36), lowpoly(books[(r2 * 7 + b + Math.round(bx)) % books.length]), [-0.75 + b * 0.24, 0.45 + r2 * 0.6, 0.12]));
      office.add(shelf);
    }

    // Zones: rugs + floor labels.
    const zone = (x: number, z: number, w: number, h: number, color: string, label: string, round = false) => {
      const geo = round ? new THREE.CircleGeometry(Math.min(w, h) / 2, 48) : new THREE.ShapeGeometry(roundedRect(w, h, 1.1), 6);
      const rug = mesh(geo, lowpoly(color, { rough: 1 }), [x, 0.02, z]);
      rug.rotation.x = -Math.PI / 2;
      office.add(rug);
      const lab = floorLabel(label);
      lab.position.set(x, 0.04, z + h / 2 - 0.6);
      office.add(lab);
    };
    zone(-6.2, 4.0, 9, 6, col(Z.tech, '#9fb889'), 'KỸ THUẬT');
    zone(-8.2, -4.6, 7, 6.2, col(Z.cafe, '#6b4a32'), 'CÀ PHÊ');
    zone(6.8, -4.6, 9, 6.2, col(Z.gameZone, '#e9845f'), 'GAME ZONE');
    zone(6.8, 4.6, 8.4, 6, col(Z.meetingRoom, '#5b7bd6'), 'PHÒNG HỌP');
    zone(0, 0.2, 6.4, 6.4, col(Z.lounge, '#2a2d35'), 'ĐIỀU PHỐI', true);
    // Tech desks.
    for (let i = 0; i < 3; i++) {
      const d = desk();
      d.position.set(-8.4 + i * 2.2, 0, 3.0);
      office.add(d);
    }
    // Café: bar, stools, tables.
    office.add(mesh(new THREE.BoxGeometry(4.6, 1.05, 0.8), lowpoly(0x5a3a22), [-8.6, 0.52, -6.6]));
    office.add(mesh(new THREE.BoxGeometry(4.8, 0.08, 1), lowpoly(0xf1f1f1), [-8.6, 1.08, -6.6]));
    office.add(mesh(new THREE.BoxGeometry(0.5, 0.6, 0.45), lowpoly(0x9ca3af, { metal: 0.6 }), [-10, 1.4, -6.6]));
    for (let i = 0; i < 4; i++) office.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.75, 10), lowpoly(0x2b2b2b), [-10.2 + i * 1.1, 0.38, -5.6]));
    for (const [tx, tz] of [[-9.6, -3.2], [-7, -3.0]] as const) {
      office.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 18), lowpoly(0xf1f1f1), [tx, 0.75, tz]));
      office.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), lowpoly(0x333333), [tx, 0.37, tz]));
    }
    const cafeSign = textSprite('CÀ PHÊ', { color: '#ffb35c', bg: 'rgba(10,10,14,.85)', height: 0.55 });
    cafeSign.position.set(-8.6, 2.6, -7.2);
    office.add(cafeSign);
    // Game zone: arcades + sofa + big screen.
    const screens: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const cab = new THREE.Group();
      cab.position.set(9.6 + (i - 1) * 1.1, 0, -7.6);
      cab.add(mesh(new THREE.BoxGeometry(0.9, 2.0, 0.8), lowpoly([0x1e1b4b, 0x0f172a, 0x3b0764][i]), [0, 1.0, 0]));
      const scr = mesh(new THREE.PlaneGeometry(0.66, 0.55), glow([0xff4fd8, 0x22d3ee, 0xfacc15][i]), [0, 1.45, 0.41]);
      screens.push(scr);
      cab.add(scr);
      office.add(cab);
    }
    office.add(mesh(new THREE.BoxGeometry(3.2, 0.5, 1), lowpoly(0x1e3a8a), [5.4, 0.3, -3.4]));
    office.add(mesh(new THREE.BoxGeometry(3.2, 0.7, 0.3), lowpoly(0x1e3a8a), [5.4, 0.7, -2.95]));
    const tv = mesh(new THREE.PlaneGeometry(3, 1.6), new THREE.MeshBasicMaterial({ map: canvasTexture(384, 200, (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, 200);
      g.addColorStop(0, '#3b0764');
      g.addColorStop(1, '#0e7490');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 384, 200);
      ctx.fillStyle = '#fde68a';
      ctx.font = '900 40px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('ENGLISH QUEST', 192, 90);
      ctx.fillStyle = '#5eead4';
      ctx.font = '700 22px system-ui';
      ctx.fillText('▶ PRESS START', 192, 140);
    }), toneMapped: false }), [5.4, 1.9, -7.0]);
    office.add(tv);
    const gameSign = textSprite('GAME ZONE', { color: '#ff7ad9', bg: 'rgba(10,10,14,.85)', border: '#ff7ad9', height: 0.5 });
    gameSign.position.set(9.6, 2.9, -7.6);
    office.add(gameSign);
    // Meeting room: glass box + table.
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9cc3ff, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.2, depthWrite: false });
    for (const [gx, gz, w, d] of [[6.8, 1.65, 8.2, 0.06], [2.65, 4.6, 0.06, 5.9], [10.95, 4.6, 0.06, 5.9]] as const) office.add(mesh(new THREE.BoxGeometry(w, 2.4, d), glassMat, [gx, 1.2, gz]));
    office.add(mesh(new THREE.BoxGeometry(3.2, 0.08, 1.4), lowpoly(0xf1f1f1), [7.6, 0.78, 5.4]));
    for (let i = 0; i < 3; i++) for (const zz of [4.4, 6.4]) office.add(mesh(new THREE.BoxGeometry(0.45, 0.5, 0.45), lowpoly(0xe5e7eb), [6.6 + i * 1.0, 0.25, zz]));
    // Lounge: curved sofa + table.
    const sofa = mesh(new THREE.TorusGeometry(2.0, 0.38, 6, 30, Math.PI * 1.1), lowpoly(0xeeeeee), [0, 0.38, -0.3]);
    sofa.rotation.set(-Math.PI / 2, 0, Math.PI * 0.95);
    office.add(sofa);
    office.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 20), lowpoly(0x8b5a2b), [0.9, 0.18, 1.4]));
    // Plants + pendant lamps.
    for (const [px, pz, s] of [[-12, 8, 1.2], [-3.2, 8.2, 1], [3, 8.2, 1.1], [12, 8, 1.3], [-12, -8.4, 1.2], [1.6, -8.4, 1.1], [-4, -2.6, 0.9], [11.8, 0.5, 1]] as const) {
      const pl = plant(s);
      pl.position.set(px, 0, pz);
      office.add(pl);
    }
    const lampMat = glow(0xffd58a);
    for (const [lx, lz] of [[-6.2, 3.4], [-8.6, -4.5], [6.8, -4.5], [7.6, 5.0], [0, 0.4]] as const) {
      office.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.6, 4), lowpoly(0x222222), [lx, 4.0, lz]));
      office.add(mesh(new THREE.ConeGeometry(0.35, 0.3, 12, 1, true), lampMat, [lx, 3.1, lz]));
    }
    for (const [lx, lz] of [[-6.2, 3.4], [6.8, -4.5], [0, 0.4]] as const) {
      const pl = new THREE.PointLight(0xffc57a, 9, 9, 2);
      pl.position.set(lx, 2.8, lz);
      office.add(pl);
    }

    // ---------- Agents ----------
    const agents = AGENTS.map((def) => {
      const r = buildRobot(def);
      r.g.position.set(def.home[0], 0, def.home[1]);
      r.g.scale.setScalar(1.25);
      r.pad.position.set(def.home[0], 0, def.home[1]);
      office.add(r.pad, r.g);
      swapInGlb(r.body, assetUrl(A.agentModelUrls[def.id]), 1.7, () => alive);
      return { def, ...r, pos: new THREE.Vector3(def.home[0], 0, def.home[1]), dest: null as THREE.Vector3 | null, nextMove: 6 + Math.random() * 6, cheer: -1e9, doubt: -1e9, wp: 0 };
    });
    // Dotted path for walking agents (green dots like a route preview).
    const dotGeo = new THREE.SphereGeometry(0.06, 6, 4);
    const dots = new THREE.InstancedMesh(dotGeo, glow(0x34d399), 60);
    dots.count = 0;
    office.add(dots);
    const dm = new THREE.Matrix4();

    // Homework Glitch (boss): a glitchy cube that shrinks with Boss HP.
    const glitch = new THREE.Group();
    glitch.position.set(8.6, 2.6, -4.2);
    const gm = new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x5b21b6, emissiveIntensity: 1, flatShading: true });
    const cube = mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), gm);
    glitch.add(cube);
    for (const x of [-0.18, 0.18]) glitch.add(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.02), glow(0xfde047), [x, 0.08, 0.46]));
    const glitchLabel = textSprite('BUG BTVN', { color: '#e9d5ff', bg: 'rgba(40,10,60,.8)', height: 0.32 });
    glitchLabel.position.set(0, 1.0, 0);
    glitch.add(glitchLabel);
    office.add(glitch);

    // ---------- Student ----------
    const me = buildStudent(heroName);
    me.g.scale.setScalar(1.25);
    me.g.position.set(0, 0, 7.4);
    office.add(me.g);
    swapInGlb(me.body, assetUrl(A.studentModelUrl), 1.6, () => alive);
    const dest = new THREE.Vector3(0, 0, 7.4);
    const marker = mesh(new THREE.RingGeometry(0.25, 0.36, 24), glow(0xfde68a, 0.9), [0, 0.06, 0]);
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    office.add(marker);
    const sparks = new Sparks(200);
    scene.add(sparks.mesh);

    // ---------- Input ----------
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitP = new THREE.Vector3();
    const canvas = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      ray.setFromCamera(ndc(e, canvas), camera);
      const hitAgent = ray.intersectObjects(agents.map((a) => a.g), true)[0];
      if (hitAgent) {
        const idx = agents.findIndex((a) => isInside(hitAgent.object, a.g));
        if (idx >= 0) {
          dest.copy(agents[idx].pos).add(new THREE.Vector3(0, 0, 1.1));
          marker.visible = true;
          return;
        }
      }
      if (ray.ray.intersectPlane(floor, hitP)) {
        dest.set(clamp(hitP.x, BOUNDS.x0, BOUNDS.x1), 0, clamp(hitP.z, BOUNDS.z0, BOUNDS.z1));
        marker.visible = true;
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    const onKey = (e: KeyboardEvent) => {
      if (!el.matches(':hover')) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
        e.preventDefault();
        if (e.type === 'keydown') keys.current.add(k);
        else keys.current.delete(k);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // ---------- Events ----------
    const st = { inside: -1, victory: live.current.outcome === 'victory' ? 0 : -1e9, defeat: live.current.outcome === 'defeat', hurt: -1e9, lastStatus: '' };
    const handle = (ev: NonNullable<SceneEvent>, t: number) => {
      const p = live.current;
      const k = ev.kind;
      const a = agents[Math.max(0, p.results.length - 1) % agents.length];
      if (k === 'correct' || k === 'critical' || k === 'ultimate' || k === 'victory') {
        a.cheer = t;
        sparks.emit(a.pos.clone().add(new THREE.Vector3(0, 2, 0)), k === 'correct' ? 24 : 60, { color: k === 'correct' ? 0x34d399 : 0xffd166, speed: k === 'correct' ? 3.5 : 6, life: 0.9, up: 3 });
        sparks.emit(glitch.position.clone().add(office.position), 18, { color: 0xc084fc, speed: 4, life: 0.6 });
        if (k !== 'correct') stage.shake(0.6, 0.35);
        if (k === 'victory') st.victory = t + 0.8;
      } else if (k === 'wrong' || k === 'miss' || k === 'defeat' || k === 'blocked') {
        a.doubt = t;
        if (k !== 'blocked') st.hurt = t;
        if (k === 'defeat') st.defeat = true;
      } else {
        sparks.emit(me.g.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 22, { color: 0x93c5fd, speed: 3, life: 0.7, up: 2 });
      }
    };

    const camTarget = new THREE.Vector3(0, 0, 3);
    const OFFSET = new THREE.Vector3(20, 20, 20);
    stage.run((dt, t) => {
      const p = live.current;
      const ev = events.current.shift();
      if (ev) handle(ev, t);

      // Student movement: tap-to-walk + WASD (camera-relative isometric axes).
      const kd = keys.current;
      const mx = (kd.has('KeyD') || kd.has('ArrowRight') ? 1 : 0) - (kd.has('KeyA') || kd.has('ArrowLeft') ? 1 : 0);
      const mz = (kd.has('KeyS') || kd.has('ArrowDown') ? 1 : 0) - (kd.has('KeyW') || kd.has('ArrowUp') ? 1 : 0);
      if (mx || mz) {
        // Screen right = world (1,0,-1), screen up = world (-1,0,-1) for a camera at +[20,20,20].
        const dir = new THREE.Vector3(mx + mz, 0, mz - mx).normalize();
        dest.copy(me.g.position).addScaledVector(dir, 0.6);
        dest.x = clamp(dest.x, BOUNDS.x0, BOUNDS.x1);
        dest.z = clamp(dest.z, BOUNDS.z0, BOUNDS.z1);
        marker.visible = false;
      }
      const to = new THREE.Vector3().subVectors(dest, me.g.position);
      to.y = 0;
      const dist = to.length();
      const walking = dist > 0.05 && !st.defeat;
      if (walking) {
        const stepLen = Math.min(dist, 4.2 * dt);
        me.g.position.addScaledVector(to.normalize(), stepLen);
        me.g.rotation.y = Math.atan2(to.x, to.z);
      } else marker.visible = false;
      marker.position.set(dest.x, 0.06, dest.z);
      marker.scale.setScalar(1 + Math.sin(t * 6) * 0.1);
      me.body.position.y = walking ? Math.abs(Math.sin(t * 12)) * 0.08 : Math.sin(t * 2) * 0.02;
      me.legs[0].rotation.x = walking ? Math.sin(t * 12) * 0.6 : 0;
      me.legs[1].rotation.x = walking ? -Math.sin(t * 12) * 0.6 : 0;
      const hurt = clamp(1 - (t - st.hurt) / 0.4);
      me.body.rotation.z = hurt * Math.sin(t * 40) * 0.2;

      // Agents: idle bob, stroll between waypoints, cheer / doubt reactions.
      const qAgent = p.finished ? -1 : p.qIndex % agents.length;
      let dotN = 0;
      const statuses: string[] = [];
      agents.forEach((a, i) => {
        a.nextMove -= dt;
        if (!a.dest && a.nextMove <= 0 && !p.finished) {
          a.wp = (a.wp + 1) % a.def.roam.length;
          const [wx, wz] = a.def.roam[a.wp];
          a.dest = new THREE.Vector3(wx, 0, wz);
        }
        if (st.victory > 0 && t > st.victory) a.dest = new THREE.Vector3(Math.cos(i * 2.1) * 1.6, 0, Math.sin(i * 2.1) * 1.6 + 0.4);
        if (a.dest) {
          const d = new THREE.Vector3().subVectors(a.dest, a.pos);
          const L = d.length();
          if (L < 0.05) {
            a.dest = null;
            a.nextMove = 8 + Math.random() * 8;
          } else {
            a.pos.addScaledVector(d.normalize(), Math.min(L, 1.4 * dt));
            a.g.rotation.y = Math.atan2(d.x, d.z);
            for (let s = 0.6; s < L && dotN < 60; s += 0.5) {
              dm.makeTranslation(a.pos.x + d.x * s, 0.06, a.pos.z + d.z * s);
              dots.setMatrixAt(dotN++, dm);
            }
          }
        } else {
          a.g.rotation.y = damp(a.g.rotation.y, Math.atan2(me.g.position.x - a.pos.x, me.g.position.z - a.pos.z), 3, dt);
        }
        a.g.position.copy(a.pos);
        const ch = clamp(1 - (t - a.cheer) / 1.2);
        a.body.position.y = Math.sin(t * 2 + i) * 0.04 + Math.abs(Math.sin(ch * Math.PI * 3)) * 0.5 * ch;
        const dbt = clamp(1 - (t - a.doubt) / 1.2);
        a.body.rotation.y = Math.sin(t * 18) * 0.35 * dbt;
        a.ring.scale.setScalar(1 + Math.sin(t * 3 + i) * 0.04 + ch * 0.25);
        (a.ring.material as THREE.MeshBasicMaterial).color.setHex(dbt > 0.01 ? 0xfb7185 : a.def.color);
        a.task.visible = qAgent === i;
        a.task.rotation.y = t * 2;
        a.task.position.y = 2.75 + Math.sin(t * 3) * 0.08;
        statuses.push(a.dest ? 'Đang đi' : ch > 0 ? 'Khen bạn!' : dbt > 0 ? 'Ôn lại nhé' : qAgent === i ? 'Đang giao bài' : 'Đang chờ');
      });
      dots.count = dotN;
      dots.instanceMatrix.needsUpdate = true;
      const sKey = statuses.join('|');
      if (sKey !== st.lastStatus) {
        st.lastStatus = sKey;
        setStatus(statuses);
      }

      // Hotspots: entering an agent's ring opens their card once.
      const inside = agents.findIndex((a) => a.pos.distanceTo(me.g.position) < HOT_R);
      if (inside !== st.inside) {
        st.inside = inside;
        if (inside >= 0) setModal({ agent: inside });
      }

      // Boss glitch.
      const ratio = p.bossMax > 0 ? clamp(p.bossHp / p.bossMax) : 1;
      const gone = st.victory > 0 && t > st.victory;
      glitch.visible = !gone;
      glitch.scale.setScalar((0.55 + ratio * 0.7) * (p.bossPhase === 2 ? 1.1 : 1));
      const jitter = Math.random() < 0.08 ? 0.12 : 0;
      glitch.position.set(8.6 + (Math.random() - 0.5) * jitter, 2.6 + Math.sin(t * 2) * 0.15, -4.2 + (Math.random() - 0.5) * jitter);
      glitch.rotation.y = t * 0.8;
      gm.emissive.setHex(p.enraged ? (Math.sin(t * 10) > 0 ? 0xdc2626 : 0x5b21b6) : 0x5b21b6);
      if (gone && t - st.victory < dt * 1.5) sparks.emit(glitch.position, 80, { color: 0xc084fc, speed: 8, life: 1.2 });
      if (gone && Math.random() < 0.2) sparks.emit(new THREE.Vector3((Math.random() - 0.5) * 16, 4 + Math.random() * 3, (Math.random() - 0.5) * 10), 20, { color: [0xffd166, 0x34d399, 0x4f8cff, 0xff7ad9][Math.floor(Math.random() * 4)], speed: 4, life: 1, gravity: 3 });
      screens.forEach((s, i) => ((s.material as THREE.MeshBasicMaterial).color.setHSL(((t * 0.1 + i * 0.3) % 1), 0.8, 0.6)));
      lights.forEach((l, i) => l.scale.setScalar(0.8 + Math.sin(t * 2 + i) * 0.2));
      hemi.intensity = damp(hemi.intensity, st.defeat ? 0.45 : 0.95, 2, dt);

      // Camera: isometric offset [20,20,20], fov 30, following the student.
      const k = stage.size.w / stage.size.h < 1 ? 1.6 : 1;
      camTarget.lerp(new THREE.Vector3(clamp(me.g.position.x * 0.6, -6, 6), 0, clamp(me.g.position.z * 0.6, -4, 4)), 1 - Math.exp(-2.5 * dt));
      camera.position.copy(camTarget).addScaledVector(OFFSET, k);
      camera.lookAt(camTarget);
      sparks.update(dt);
    });

    return () => {
      alive = false;
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      stage.dispose();
    };
  }, [heroName]);

  const p = props;
  const done = p.results.length;
  const right = p.results.filter(Boolean).length;
  const acc = done ? Math.round((right / done) * 100) : 0;
  const left = Math.max(0, p.qTotal - done);
  const lines: Record<AgentDef['id'], string> = {
    orion: p.finished ? `Xong BTVN hôm nay! Đúng ${right}/${p.qTotal} câu.` : `BTVN hôm nay có ${p.qTotal} câu. Đã làm ${done}, còn ${left} câu. Câu hiện tại do ${AGENTS[p.qIndex % 3].name} giao.`,
    kai: p.finished ? `Từ vựng chắc tay rồi! Chuỗi đúng cao nhất trong bài: ${Math.max(p.combo, 0)}.` : `Mẹo của Kai: đọc kỹ ngữ cảnh "${p.question?.topic ?? p.topic}" trước khi chọn. Chuỗi đúng hiện tại: ${p.combo}.`,
    quinn: done ? `Độ chính xác của bạn: ${acc}% (${right}/${done}). ${acc >= 80 ? 'Rất tốt!' : 'Ôn lại phần sai nhé.'}` : 'Quinn sẽ chấm từng câu bạn nộp. Bắt đầu thôi!',
  };
  const m = modal ? AGENTS[modal.agent] : null;

  return (
    <>
      <div ref={host} className="absolute inset-0" aria-label="AI Agent World: chạm sàn để đi, đến gần Orion, Kai, Quinn để nhận bài" />
      <ul className="pointer-events-none absolute bottom-8 left-6 z-10 hidden space-y-1 text-[11px] sm:block">
        {AGENTS.map((a, i) => (
          <li key={a.id} className="flex items-center gap-2 bg-black/55 px-2 py-0.5 text-white">
            <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-black" style={{ background: a.css }}>{a.name[0]}</span>
            <b>{a.name}</b>
            <span className="text-white/70">{status[i]}</span>
          </li>
        ))}
      </ul>
      {m && (
        <div role="dialog" aria-label={`${m.name} – ${m.role}`} className="absolute inset-x-4 bottom-7 z-20 mx-auto max-w-sm p-[3px] sm:inset-x-auto sm:right-6" style={{ ...BEVEL, background: m.css }}>
          <div className="bg-slate-950/95 p-4 text-white" style={BEVEL}>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg font-black text-black" style={{ background: m.css }}>{m.name[0]}</span>
              <div>
                <div className="font-extrabold leading-tight">{m.name}</div>
                <div className="text-[11px] text-white/60">{m.role}</div>
              </div>
            </div>
            <p className="mt-2 text-sm leading-snug">{lines[m.id]}</p>
            <div className="mt-3 flex gap-2">
              {!p.finished && p.onFocusQuestion && (
                <button type="button" onClick={() => { p.onFocusQuestion?.(); setModal(null); }} className="tc-sticker !px-3 !py-1.5 !text-xs">
                  📝 Làm câu tiếp theo
                </button>
              )}
              <button type="button" onClick={() => setModal(null)} className="px-3 py-1.5 text-xs font-bold text-white/80 underline underline-offset-2">Đóng</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
