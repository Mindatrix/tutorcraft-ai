'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { THREE_ASSET_MANIFEST, assetUrl } from '../../config/threeAssets';
import { Sparks, canvasTexture, clamp, createStage, damp, glow, hashStr, lowpoly, mesh, roughen, skyDome, swapInGlb, textSprite, toon } from './kit';
import type { SceneEvent } from './types';

// GAME 1 — Kayak Rush 3D (upgrade of Boat Race; the server-authoritative race logic is unchanged).
// Turquoise low-poly river, kayaks with modular hats on `hat_attachment_slot`, spinning logs,
// ice blocks and plant monsters, InstancedMesh foam behind each stern. Positions (0..1) come
// from the race engine; correct answers show as a Nitro burst.

const A = THREE_ASSET_MANIFEST.gameModes.kayak_rush;
const P = A.palette;
const c = (v: string, d: string) => (v.startsWith('#') ? v : d);
const RIVER = c(P.river, '#36c3cf');
const DEEP = c(P.riverDeep, '#1b8fa6');
const FOAM = c(P.foam, '#f4fbff');
const BANK = c(P.bank, '#7cc36a');
const L = 110; // course length (world units)
const LANE = 1.7;

export interface KayakRushProps {
  playerPos: number;
  botPos: number;
  heroName: string;
  botName: string;
  event: SceneEvent;
  finished: boolean;
  result: 'win' | 'lose' | 'draw' | string | null;
  onUnavailable?: () => void;
}

type HatId = 'propeller' | 'wizard' | 'jester' | 'hardhat';
const HATS: HatId[] = ['propeller', 'wizard', 'jester', 'hardhat'];

function buildHat(id: HatId): THREE.Group {
  const g = new THREE.Group();
  if (id === 'propeller') {
    const cols = [0xef4444, 0xfacc15, 0x3b82f6, 0x22c55e];
    cols.forEach((cc, k) => g.add(mesh(new THREE.SphereGeometry(0.27, 8, 6, (k * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2), toon(cc))));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), toon(0x333333), [0, 0.33, 0]));
    const prop = new THREE.Group();
    prop.position.y = 0.41;
    prop.name = 'spin';
    for (const s of [-1, 1]) prop.add(mesh(new THREE.BoxGeometry(0.34, 0.015, 0.07), toon(s > 0 ? 0xef4444 : 0x3b82f6), [0.17 * s, 0, 0]));
    g.add(prop);
  } else if (id === 'wizard') {
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 18), toon(0x7c3aed), [0, 0.02, 0]));
    const cone = mesh(new THREE.ConeGeometry(0.26, 0.75, 12), toon(0x7c3aed), [0, 0.4, -0.04]);
    cone.rotation.x = -0.18;
    g.add(cone);
    for (const [x, y, z] of [[0.12, 0.3, 0.19], [-0.1, 0.5, 0.12], [0.05, 0.62, 0.05]] as const) g.add(mesh(new THREE.OctahedronGeometry(0.045), glow(0xfde047), [x, y, z]));
  } else if (id === 'jester') {
    const cols = [0xef4444, 0x22c55e, 0x3b82f6];
    cols.forEach((cc, k) => {
      const a = (k - 1) * 0.9;
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(Math.sin(a) * 0.35, 0.55, Math.cos(a) * 0.1), new THREE.Vector3(Math.sin(a) * 0.55, 0.3, Math.cos(a) * 0.25));
      g.add(mesh(new THREE.TubeGeometry(curve, 10, 0.07, 6), toon(cc)));
      g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xfacc15, 0x3a2a00), [Math.sin(a) * 0.55, 0.28, Math.cos(a) * 0.25]));
    });
    g.add(mesh(new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x22c55e)));
  } else {
    g.add(mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xfacc15)));
    g.add(mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.035, 18), toon(0xfacc15), [0, 0.01, 0.06]));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), toon(0xeab308), [0, 0.27, 0]));
  }
  return g;
}

interface Kayak {
  root: THREE.Group;
  body: THREE.Group;
  paddle: THREE.Group;
  hatSlot: THREE.Object3D;
}

function buildKayak(hull: number, trim: number, vest: number, hat: HatId): Kayak {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    pts.push(new THREE.Vector2(Math.max(0.002, Math.pow(Math.sin(Math.PI * t), 0.7) * 0.45), (t - 0.5) * 3.6));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  geo.rotateX(Math.PI / 2);
  geo.scale(1, 0.5, 1);
  const hullMesh = mesh(geo, toon(hull));
  hullMesh.position.y = 0.1;
  body.add(hullMesh);
  const rim = mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 18), toon(0x1f2937), [0, 0.3, 0.2]);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.5, 1);
  body.add(rim);
  body.add(mesh(new THREE.CircleGeometry(0.28, 16), toon(0x111827), [0, 0.29, 0.2]));
  body.children[body.children.length - 1].rotation.x = -Math.PI / 2;
  // Deck spots + bungee zig-zag.
  for (const [z, s] of [[0.95, 0.16], [1.25, 0.1], [-0.9, 0.14]] as const) {
    const spot = mesh(new THREE.SphereGeometry(s, 10, 6), toon(trim), [0, 0.23, z]);
    spot.scale.y = 0.25;
    body.add(spot);
  }
  const zig: number[] = [];
  for (let k = 0; k < 5; k++) zig.push((k % 2 ? 0.16 : -0.16), 0.27, -0.55 - k * 0.18);
  const zg = new THREE.BufferGeometry();
  zg.setAttribute('position', new THREE.Float32BufferAttribute(zig, 3));
  body.add(new THREE.Line(zg, new THREE.LineBasicMaterial({ color: 0x1f2937 })));
  // Rower.
  const rower = new THREE.Group();
  rower.position.set(0, 0.3, 0.2);
  body.add(rower);
  rower.add(mesh(new THREE.CapsuleGeometry(0.2, 0.25, 4, 10), toon(vest), [0, 0.3, 0]));
  rower.add(mesh(new THREE.SphereGeometry(0.21, 14, 10), toon(0xf1c3a0), [0, 0.72, 0]));
  rower.add(mesh(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), toon(0x3b2416), [0, 0.74, 0.02]));
  const hatSlot = new THREE.Object3D();
  hatSlot.name = 'hat_attachment_slot';
  hatSlot.position.set(0, 0.86, 0);
  rower.add(hatSlot);
  hatSlot.add(buildHat(hat));
  const paddle = new THREE.Group();
  paddle.position.set(0, 0.42, -0.25);
  paddle.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6), toon(0x334155), [0, 0, 0]));
  paddle.children[0].rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) paddle.add(mesh(new THREE.BoxGeometry(0.06, 0.32, 0.16), toon(0x2563eb), [s * 1.0, 0, 0]));
  rower.add(paddle);
  return { root, body, paddle, hatSlot };
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(RIVER) },
      uDeep: { value: new THREE.Color(DEEP) },
      uFoam: { value: new THREE.Color(FOAM) },
      uFog: { value: new THREE.Color(0xbfe6f2) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec2 vW; varying float vDist;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += sin(w.x * 0.9 + uTime * 1.6) * 0.05 + cos(w.z * 0.7 + uTime * 1.2) * 0.05;
        vW = w.xz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uFog;
      varying vec2 vW; varying float vDist;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float edge = smoothstep(4.0, 7.6, abs(vW.x));
        vec3 col = mix(uDeep, uShallow, 0.55 + 0.45 * edge);
        vec2 flow = vec2(vW.x * 0.9, vW.y * 0.35 - uTime * 1.1);
        float streak = smoothstep(0.72, 0.8, n(flow * vec2(1.6, 1.0))) * 0.55;
        float bankFoam = smoothstep(7.2, 7.9, abs(vW.x)) * (0.6 + 0.4 * n(vec2(vW.y * 1.5 - uTime * 2.0, vW.x)));
        col = mix(col, uFoam, clamp(streak + bankFoam, 0.0, 1.0));
        col = mix(col, uFog, smoothstep(35.0, 95.0, vDist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function buildBank(side: -1 | 1, z0: number, z1: number): THREE.Mesh {
  const w = 26;
  const segZ = 70;
  const geo = new THREE.PlaneGeometry(w, z1 - z0, 14, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const sand = new THREE.Color(0xe9d29a);
  const grass = new THREE.Color(BANK);
  const dark = new THREE.Color(0x4f9d4a);
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) + w / 2; // 0 at the water, w far away
    const z = pos.getZ(i);
    const hgt = lx < 0.6 ? -0.4 : 0.25 + Math.min(1, lx / 6) * (0.6 + Math.sin(z * 0.21 + side) * 0.5 + Math.cos(lx * 0.5 + z * 0.13) * 0.6);
    pos.setY(i, hgt);
    pos.setX(i, (lx + 7.6) * side);
    const cc = lx < 1.6 ? sand : lx > 9 && Math.sin(z * 0.3 + lx) > 0.3 ? dark : grass;
    colors.push(cc.r, cc.g, cc.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }));
  m.position.z = (z0 + z1) / 2;
  return m;
}

function pine(scale: number) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 6), lowpoly(0x7a5230), [0, 0.4, 0]));
  for (let k = 0; k < 3; k++) g.add(mesh(new THREE.ConeGeometry(0.9 - k * 0.22, 1.1, 7), lowpoly(k % 2 ? 0x2f8f4a : 0x3aa25a), [0, 1.0 + k * 0.6, 0]));
  g.scale.setScalar(scale);
  return g;
}

function mushroom() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), toon(0xfff7ed), [0, 0.3, 0]));
  g.add(mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xdc2626), [0, 0.55, 0]));
  for (let k = 0; k < 5; k++) g.add(mesh(new THREE.SphereGeometry(0.06, 6, 4), toon(0xffffff), [Math.cos(k * 1.3) * 0.26, 0.82 - (k % 2) * 0.08, Math.sin(k * 1.3) * 0.26]));
  return g;
}

function plantMonster() {
  const g = new THREE.Group();
  const stemCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.4, 1.4, 0), new THREE.Vector3(-0.3, 2.6, 0), new THREE.Vector3(0.6, 3.3, 0)]);
  g.add(mesh(new THREE.TubeGeometry(stemCurve, 20, 0.16, 7), toon(0x5b4a2a)));
  for (let k = 1; k < 6; k++) {
    const p = stemCurve.getPoint(k / 6);
    const th = mesh(new THREE.ConeGeometry(0.05, 0.25, 4), toon(0xf9a8d4), [p.x + 0.15, p.y, 0]);
    th.rotation.z = -1.2;
    g.add(th);
  }
  const head = new THREE.Group();
  head.position.copy(stemCurve.getPoint(1));
  head.name = 'head';
  g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), glow(0xfde047)));
  for (let k = 0; k < 3; k++) {
    const petal = new THREE.Group();
    petal.rotation.y = (k / 3) * Math.PI * 2;
    petal.name = 'petal';
    const leaf = mesh(new THREE.SphereGeometry(0.75, 10, 6, 0, Math.PI), toon(0xd9467a), [0, 0, 0.55]);
    leaf.scale.set(0.8, 0.12, 1);
    leaf.rotation.x = -0.35;
    petal.add(leaf);
    for (let t = 0; t < 6; t++) {
      const tooth = mesh(new THREE.ConeGeometry(0.04, 0.16, 4), toon(0xffffff), [Math.cos((t / 5) * Math.PI) * 0.55, 0.06, 0.55 + Math.sin((t / 5) * Math.PI) * 0.62]);
      petal.add(tooth);
    }
    head.add(petal);
  }
  return g;
}

function barrier() {
  const g = new THREE.Group();
  const tex = canvasTexture(128, 32, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = '#dc2626';
    for (let x = -32; x < 160; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 16, 32);
      ctx.fill();
    }
  });
  const board = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  for (const x of [-0.9, 0.9]) g.add(mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), lowpoly(0xf1f5f9), [x, 0.8, 0]));
  for (const y of [0.55, 0.95, 1.35]) g.add(mesh(new THREE.BoxGeometry(2.0, 0.22, 0.06), board, [0, y, 0]));
  for (const x of [-0.9, 0.9]) g.add(mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(0xfacc15), [x, 1.72, 0]));
  return g;
}

export default function KayakRush(props: KayakRushProps) {
  const host = useRef<HTMLDivElement>(null);
  const rank = useRef<HTMLSpanElement>(null);
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

  const heroName = props.heroName;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const unavailable = () => live.current.onUnavailable?.();
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(el, { fov: 55, far: 260, background: 0xbfe6f2, onSlow: unavailable });
    } catch {
      unavailable();
      return;
    }
    let alive = true;
    const { scene, camera } = stage;
    scene.add(skyDome(0x5bb8f0, 0xdff4fb, 0xbfe6f2, { radius: 200 }));
    scene.fog = new THREE.Fog(0xbfe6f2, 40, 110);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6aa36a, 1.2));
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.8);
    sun.position.set(-6, 12, 6);
    scene.add(sun);

    const z0 = 30;
    const z1 = -L - 40;
    const water = mesh(new THREE.PlaneGeometry(16, z0 - z1, 24, 140), waterMaterial());
    water.rotation.x = -Math.PI / 2;
    water.position.z = (z0 + z1) / 2;
    scene.add(water);
    const wu = (water.material as THREE.ShaderMaterial).uniforms;
    scene.add(buildBank(-1, z1, z0), buildBank(1, z1, z0));

    // Scenery along the banks.
    let s = 3;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let z = z0; z > z1; z -= 3 + r() * 4) {
      for (const side of [-1, 1]) {
        const x = side * (10 + r() * 12);
        const pick = r();
        const o = pick < 0.55 ? pine(0.8 + r() * 0.8) : pick < 0.75 ? mushroom() : mesh(roughen(new THREE.DodecahedronGeometry(0.6 + r() * 0.7, 0), 0.12, Math.floor(z)), lowpoly(0x9ca3af));
        o.position.set(x, 0.6, z);
        scene.add(o);
      }
    }
    // Buoy lines along the course edges.
    for (const side of [-1, 1]) {
      const pts: number[] = [];
      for (let z = 6; z > -L - 4; z -= 2.5) {
        const k = Math.round(-z / 2.5);
        scene.add(mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(k % 2 ? 0xffffff : 0xef4444), [side * 4.3, 0.08, z]));
        pts.push(side * 4.3, 0.1, z);
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      scene.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x1f2937 })));
    }
    // Obstacles (beside the lanes — the race result never depends on them).
    const logs: THREE.Mesh[] = [];
    const ice: THREE.Mesh[] = [];
    const monsters: THREE.Group[] = [];
    for (let i = 0; i < 9; i++) {
      const z = -8 - i * 11 - r() * 3;
      const side = i % 2 ? 1 : -1;
      const kind = i % 3;
      if (kind === 0) {
        const log = mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.2, 9), toon(0x9a5b2d), [side * 5.7, 0.15, z]);
        log.rotation.z = Math.PI / 2;
        log.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 9), toon(0xe6b77e), [0, 1.6, 0]));
        log.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 9), toon(0xe6b77e), [0, -1.6, 0]));
        logs.push(log);
        scene.add(log);
      } else if (kind === 1) {
        const block = mesh(roughen(new THREE.DodecahedronGeometry(0.9, 0), 0.15, i), lowpoly(0xeef6fb, { rough: 0.4 }), [side * 5.4, 0.2, z]);
        block.scale.set(1, 1.3, 1);
        ice.push(block);
        scene.add(block);
      } else {
        const pm = plantMonster();
        pm.position.set(side * 7.6, 0.2, z);
        pm.rotation.y = side > 0 ? Math.PI : 0;
        monsters.push(pm);
        scene.add(pm);
        swapInGlb(pm, assetUrl(A.obstacleModelUrls.plantMonster), 3.5, () => alive);
      }
      if (i % 4 === 1) {
        const b = barrier();
        b.position.set(-side * 5.6, 0, z - 4);
        b.rotation.y = side * 0.25;
        scene.add(b);
      }
    }
    // Finish arch.
    const finish = new THREE.Group();
    finish.position.z = -L - 2;
    for (const x of [-4.6, 4.6]) finish.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 8), toon(0xffffff), [x, 2.2, 0]));
    const checker = canvasTexture(256, 48, (ctx) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        ctx.fillRect(x * 16, y * 24, 16, 24);
      }
    });
    finish.add(mesh(new THREE.BoxGeometry(9.6, 0.6, 0.12), new THREE.MeshBasicMaterial({ map: checker }), [0, 4.3, 0]));
    const fin = textSprite('FINISH', { color: '#facc15', bg: 'rgba(17,24,39,.85)', border: '#facc15', height: 0.9 });
    fin.position.set(0, 5.3, 0);
    finish.add(fin);
    scene.add(finish);

    // Kayaks.
    const h = hashStr(heroName || 'hero');
    const heroHat = HATS[h % 4];
    const botHat = HATS[(h + 2) % 4];
    const me = buildKayak(0x3cc6e0, 0x6b2f86, 0xf97316, heroHat);
    const bot = buildKayak(0xf5c22b, 0xea580c, 0x7c3aed, botHat);
    me.root.position.x = -LANE;
    bot.root.position.x = LANE;
    scene.add(me.root, bot.root);
    swapInGlb(me.body, assetUrl(A.kayakModelUrl), 1.2, () => alive);
    swapInGlb(me.hatSlot, assetUrl(A.hatModelUrls[heroHat]), 0.5, () => alive);
    swapInGlb(bot.hatSlot, assetUrl(A.hatModelUrls[botHat]), 0.5, () => alive);
    const meLabel = textSprite(heroName || 'Bạn', { color: '#fff', bg: 'rgba(8,47,73,.8)', height: 0.42 });
    meLabel.position.set(0, 2.1, 0);
    me.root.add(meLabel);
    const botLabel = textSprite(live.current.botName, { color: '#fff', bg: 'rgba(67,20,7,.8)', height: 0.42 });
    botLabel.position.set(0, 2.1, 0);
    bot.root.add(botLabel);

    const foam = new Sparks(260, new THREE.IcosahedronGeometry(0.12, 0), false);
    (foam.mesh.material as THREE.MeshBasicMaterial).color.set(FOAM);
    scene.add(foam.mesh);
    const sparks = new Sparks(160);
    scene.add(sparks.mesh);

    const cur = { p: live.current.playerPos, b: live.current.botPos, pv: 0, bv: 0 };
    const st = { boost: -1e9, crit: false, bump: -1e9, cheer: -1e9 };
    const handle = (ev: NonNullable<SceneEvent>, t: number) => {
      const k = ev.kind;
      if (k === 'correct' || k === 'critical' || k === 'ultimate' || k === 'victory') {
        st.boost = t;
        st.crit = k !== 'correct';
        if (st.crit) stage.shake(0.6, 0.35);
      } else if (k === 'wrong' || k === 'miss' || k === 'defeat') st.bump = t;
    };
    const camPos = new THREE.Vector3();
    const look = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    stage.run((dt, t) => {
      const p = live.current;
      wu.uTime.value = t;
      const ev = events.current.shift();
      if (ev) handle(ev, t);
      const prevP = cur.p;
      const prevB = cur.b;
      cur.p = damp(cur.p, p.playerPos, 2.2, dt);
      cur.b = damp(cur.b, p.botPos, 2.2, dt);
      cur.pv = (cur.p - prevP) / Math.max(dt, 1e-3);
      cur.bv = (cur.b - prevB) / Math.max(dt, 1e-3);
      const boost = clamp(1 - (t - st.boost) / 1.2);
      const bump = clamp(1 - (t - st.bump) / 0.9);
      const pz = -cur.p * L;
      const bz = -cur.b * L;
      me.root.position.set(-LANE + Math.sin(t * 1.3) * 0.15, Math.sin(t * 2.2) * 0.05, pz);
      bot.root.position.set(LANE + Math.sin(t * 1.1 + 1) * 0.15, Math.sin(t * 2.2 + 1.3) * 0.05, bz);
      me.body.rotation.z = Math.sin(t * 2.2) * 0.04 + Math.sin(t * 25) * bump * 0.25;
      bot.body.rotation.z = Math.sin(t * 2.2 + 1) * 0.04;
      me.body.rotation.x = -boost * 0.12;
      const strokeP = t * (5 + boost * 6);
      me.paddle.rotation.set(0, Math.sin(strokeP) * 0.5, Math.sin(strokeP) * 0.5);
      bot.paddle.rotation.set(0, Math.sin(t * 5.5) * 0.5, Math.sin(t * 5.5) * 0.5);
      for (const k of [me, bot]) {
        const spin = k.hatSlot.getObjectByName('spin');
        if (spin) spin.rotation.y = t * 14;
      }
      // Foam: steady wake + Nitro burst on a correct answer.
      const emitWake = (k: Kayak, speed: number, extra: number) => {
        const stern = tmp.set(k.root.position.x, 0.05, k.root.position.z + 1.75);
        const n = Math.min(4, Math.ceil((0.2 + Math.abs(speed) * 25 + extra * 3) * dt * 30));
        foam.emit(stern, n, { speed: 0.6 + extra * 2, up: 0.4, gravity: 1.5, drag: 2.5, life: 0.9 + extra * 0.4, size: 0.9 + extra * 0.6, dir: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, 1.2), spread: new THREE.Vector3(0.4, 0, 0.2) });
      };
      emitWake(me, cur.pv, boost);
      emitWake(bot, cur.bv, 0);
      if (boost > 0.95) sparks.emit(me.root.position.clone().add(new THREE.Vector3(0, 0.5, 1.4)), st.crit ? 6 : 3, { color: st.crit ? 0xfacc15 : 0x5eead4, speed: 2, life: 0.5, up: 0.5 });
      if (bump > 0.97) foam.emit(me.root.position.clone().add(new THREE.Vector3(0.5, 0.2, -1.4)), 14, { speed: 3, up: 2.5, gravity: 7, life: 0.7, size: 1.3 });
      // Obstacles animate.
      logs.forEach((g, i) => (g.rotation.x = t * (1.2 + i * 0.1)));
      ice.forEach((g, i) => {
        g.position.y = 0.2 + Math.sin(t * 1.5 + i) * 0.12;
        g.rotation.y = t * 0.2 + i;
      });
      monsters.forEach((m, i) => {
        m.rotation.z = Math.sin(t * 0.9 + i) * 0.06;
        const head = m.getObjectByName('head');
        if (head) {
          const bite = Math.max(0, Math.sin(t * 2.2 + i * 1.7));
          head.children.forEach((ch) => {
            if (ch.name === 'petal') ch.rotation.x = -0.2 - bite * 0.6;
          });
          head.rotation.z = Math.sin(t * 1.4 + i) * 0.2;
        }
      });
      // Finish celebration.
      if (p.finished && p.result === 'win' && Math.random() < 0.3) sparks.emit(new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 2, -L - 2), 16, { color: [0xfacc15, 0x5eead4, 0xf472b6][Math.floor(Math.random() * 3)], speed: 4, life: 1, gravity: 4 });

      // Chase camera behind the player, lifted on portrait phones.
      const k = stage.size.w / stage.size.h < 1 ? 1.5 : 1;
      camPos.set(-LANE * 0.45, 3.7 * k, pz + 6.6 * k);
      camera.position.lerp(camPos, 1 - Math.exp(-4 * dt));
      look.set(-LANE * 0.2, 0.2, pz - 7);
      camera.lookAt(look);
      const fovT = 55 + boost * 9;
      if (Math.abs(camera.fov - fovT) > 0.05) {
        camera.fov = damp(camera.fov, fovT, 6, dt);
        camera.updateProjectionMatrix();
      }
      if (rank.current) {
        const first = cur.p >= cur.b;
        rank.current.textContent = `${first ? '🥇 Hạng 1' : '🥈 Hạng 2'} · ${Math.round(clamp(p.playerPos) * 100)}%`;
      }
      foam.update(dt);
      sparks.update(dt);
    });

    return () => {
      alive = false;
      stage.dispose();
    };
  }, [heroName]);

  return (
    <>
      <div ref={host} className="absolute inset-0" aria-hidden />
      <span ref={rank} className="pointer-events-none absolute left-6 top-3 z-10 bg-black/55 px-2 py-0.5 text-[11px] font-extrabold text-amber-200" />
    </>
  );
}
