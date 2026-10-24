'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// 3D Boat Race scene (Three.js, low-poly) using the character .glb kit.
// Purely visual: positions (0..1) come from the engine; the server decides the result.

interface Props {
  playerPos: number;
  botPos: number;
  /** Called when WebGL / the scene cannot start, so the parent can fall back to the 2D lanes. */
  onUnavailable?: () => void;
  heroTint?: string;
}

const KIT = '/models/kit/';
const TRACK_X0 = -8;
const TRACK_LEN = 16;
const LANE_Z = 1.5;
const CHAR_SCALE = 1.7;

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();
const loadPart = (p: string) => {
  if (!cache.has(p)) cache.set(p, loader.loadAsync(`${KIT}${p}.glb`).then((g) => g.scene));
  return cache.get(p)!;
};

async function buildRower(files: string[], tints: Record<string, string>): Promise<THREE.Group> {
  const g = new THREE.Group();
  const parts = await Promise.all(files.map((f) => loadPart(f).catch(() => null)));
  for (const src of parts) {
    if (!src) continue;
    const s = src.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      const c = tints[mat.name];
      if (c) mat.color.set(c);
      mat.flatShading = true;
      m.material = mat;
    });
    g.add(s);
  }
  g.scale.setScalar(CHAR_SCALE);
  return g;
}

function makeBoat(hull: number, trim: number): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.9), mat(hull));
  body.position.y = 0.1;
  g.add(body);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 4), mat(hull));
  bow.rotation.z = -Math.PI / 2;
  bow.rotation.x = Math.PI / 4;
  bow.scale.set(1, 1, 0.8);
  bow.position.set(1.5, 0.12, 0);
  g.add(bow);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.08, 0.92), mat(trim));
  stripe.position.y = 0.3;
  g.add(stripe);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.8), mat(0x6b4a2b));
  seat.position.set(-0.1, 0.32, 0);
  g.add(seat);
  return g;
}

export default function RaceScene3D({ playerPos, botPos, onUnavailable, heroTint = '#3b82f6' }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const target = useRef({ p: 0, b: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    target.current = { p: playerPos, b: botPos };
  }, [playerPos, botPos]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onUnavailable?.();
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8ecdf5);
    scene.fog = new THREE.Fog(0x8ecdf5, 24, 46);
    const cam = new THREE.PerspectiveCamera(42, 2, 0.1, 80);
    cam.position.set(0, 4.2, 11.5);
    cam.lookAt(0, 0.8, 0);

    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a2a3a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.6);
    sun.position.set(-4, 8, 6);
    scene.add(sun);

    // River, banks, finish.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(40, 7, 40, 7), new THREE.MeshStandardMaterial({ color: 0x1e7fc2, flatShading: true, roughness: 0.4 }));
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    const wpos = water.geometry.attributes.position;
    const base = Float32Array.from(wpos.array as ArrayLike<number>);
    for (const z of [-4.2, 4.2]) {
      const bank = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 1.6), new THREE.MeshStandardMaterial({ color: 0x4f8a3b, flatShading: true }));
      bank.position.set(0, 0.05, z);
      scene.add(bank);
    }
    const finishX = TRACK_X0 + TRACK_LEN + 1.6;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const z of [-2.6, 2.6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), poleMat);
      pole.position.set(finishX, 1.1, z);
      scene.add(pole);
    }
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 5.2), new THREE.MeshStandardMaterial({ color: 0xfacc15 }));
    flag.position.set(finishX, 2.0, 0);
    scene.add(flag);

    const mine = makeBoat(parseInt(heroTint.replace('#', ''), 16), 0xffffff);
    const bot = makeBoat(0xea580c, 0x1f2937);
    mine.position.z = LANE_Z;
    bot.position.z = -LANE_Z;
    scene.add(mine, bot);

    let alive = true;
    const hero = buildRower(['body/base', 'hair/short_neat', 'outfit/casual'], { M_skin: '#E0B48A', M_hair: '#3a2a1c', M_primary: heroTint, M_secondary: '#1e3a8a', M_eye: '#2b1d12' });
    const robo = buildRower(['body/base', 'outfit/fantasy_scifi', 'acc/cybernetic'], { M_skin: '#9aa4b2', M_primary: '#ea580c', M_secondary: '#374151', M_eye: '#22d3ee' });
    void Promise.all([hero, robo]).then(([h, r]) => {
      if (!alive) return;
      for (const [rower, boat] of [[h, mine], [r, bot]] as const) {
        rower.position.set(-0.1, 0.3, 0);
        rower.rotation.y = Math.PI / 2; // face the finish (+x)
        boat.add(rower);
      }
      setReady(true);
    }).catch(() => { if (alive) onUnavailable?.(); });

    const resize = () => {
      const w = el.clientWidth || 600;
      const h = el.clientHeight || 260;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const cur = { p: 0, b: 0 };
    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      const t = clock.getElapsedTime();
      cur.p += (target.current.p - cur.p) * 0.06;
      cur.b += (target.current.b - cur.b) * 0.06;
      mine.position.x = TRACK_X0 + cur.p * TRACK_LEN;
      bot.position.x = TRACK_X0 + cur.b * TRACK_LEN;
      mine.position.y = Math.sin(t * 2.2) * 0.05;
      bot.position.y = Math.sin(t * 2.2 + 1.3) * 0.05;
      mine.rotation.z = Math.sin(t * 2.2 + 0.4) * 0.03;
      bot.rotation.z = Math.sin(t * 2.2 + 1.7) * 0.03;
      // Row stroke: lean the rower back and forth.
      for (const b of [mine, bot]) {
        const rower = b.children[b.children.length - 1];
        if (rower && rower.scale.x > 0 && b.children.length > 4) rower.rotation.z = Math.sin(t * 5 + (b === bot ? 1 : 0)) * 0.12;
      }
      const arr = wpos.array as Float32Array;
      for (let i = 0; i < wpos.count; i++) arr[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 1.4 + base[i * 3] * 0.8 + base[i * 3 + 1] * 1.3) * 0.06;
      wpos.needsUpdate = true;
      water.geometry.computeVertexNormals();
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => x?.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [heroTint, onUnavailable]);

  return (
    <div className="relative w-full h-56 sm:h-72 rounded-2xl overflow-hidden border border-sky-500/30" aria-hidden>
      <div ref={mountRef} className="absolute inset-0" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-xs text-slate-300">Đang tải sông…</div>}
    </div>
  );
}
