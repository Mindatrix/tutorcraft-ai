'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SpatialControls from '../hud/SpatialControls';
import { MoveInputMixer } from '../../client/spatialInput';
import { deviceInfo, measureFrames, type BenchResult } from '../../client/fpsProbe';
import { createRuntime, type GfxTier } from '../modes/three/SceneRuntime';
import { createPhysicsWorld, loadRapier, type PhysicsWorld, type Vec3 } from '../modes/three/physics/rapierWorld';
import { createCharacter, type Character } from '../modes/three/physics/characterController';
import { trianglesFrom } from '../modes/three/physics/fromThree';
import { fpsLine, type MoveInput } from '../../engine';

// Đại phẫu (03/11/2026): physics + Spatial UI test track and the FPS benchmark page.
//
//   /tutor/physics-lab                 play: joystick / WASD, jump, "Xuyên không" between 2 portals
//   ?tier=low                          low graphics tier (no shadows, no blur)
//   ?crowd=50                          50 moving student stand-ins (instanced), the class worst case
//   ?bench=20&warmup=2                 autopilot walks the course, measures 20 s of frames, shows the
//                                      result and publishes window.__tcBench (scripts/fps-benchmark.mjs)
//
// The course is placeholder geometry for testing movement (steps, ramp, wall, platforms); the real
// worlds' visuals are Antigravity's. Nothing here touches answers, scores or coins.

const PORTALS: Vec3[] = [
  { x: 0, y: 0, z: -22 },
  { x: 24, y: 1.2, z: 8 },
];
const WARP_RADIUS = 3;

interface Params {
  tier: GfxTier;
  crowd: number;
  bench: number;
  warmup: number;
}

function readParams(): Params {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string, d: number, max: number) => {
    const n = Number(q.get(k));
    return Number.isFinite(n) && q.has(k) ? Math.max(0, Math.min(max, n)) : d;
  };
  return { tier: q.get('tier') === 'low' ? 'low' : 'high', crowd: num('crowd', 50, 80), bench: num('bench', 0, 120), warmup: num('warmup', 2, 10) };
}

/** Autopilot for the benchmark: a slow loop around the course with a jump every 3 s. */
function autopilot(t: number, lastJump: { at: number }): MoveInput {
  const jump = t - lastJump.at > 3;
  if (jump) lastJump.at = t;
  return { x: Math.sin(t * 0.45) * 0.7, y: 1, jump };
}

function buildCourse(scene: THREE.Scene, phys: PhysicsWorld, shadows: boolean) {
  const disposables: { dispose(): void }[] = [];
  const mat = (color: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    disposables.push(m);
    return m;
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, at: THREE.Vector3Like, rot?: THREE.Euler) => {
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(at.x, at.y, at.z);
    if (rot) mesh.rotation.copy(rot);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    scene.add(mesh);
    return mesh;
  };
  // Ground.
  const ground = add(new THREE.PlaneGeometry(160, 160), mat(0x6b8f5e), { x: 0, y: 0, z: 0 }, new THREE.Euler(-Math.PI / 2, 0, 0));
  ground.castShadow = false;
  phys.addGround(0, 80);
  // Steps: 5 × 0.2 m.
  for (let i = 0; i < 5; i++) {
    const h = 0.2 * (i + 1);
    add(new THREE.BoxGeometry(4, h, 1.2), mat(0xc8b48a), { x: -6, y: h / 2, z: -4 - i * 1.2 });
    phys.addBox({ x: -6, y: h / 2, z: -4 - i * 1.2 }, { x: 2, y: h / 2, z: 0.6 });
  }
  // Ramp (≈ 17°), collision from its triangles.
  const ramp = add(new THREE.BoxGeometry(4, 0.4, 8), mat(0xa3a3a3), { x: 6, y: 1.0, z: -6 }, new THREE.Euler(0.3, 0, 0));
  phys.addTriangles(trianglesFrom(ramp));
  // Platform at the top of the ramp, a wall, and the second portal's plinth.
  add(new THREE.BoxGeometry(6, 2.2, 6), mat(0x8b7d6b), { x: 6, y: 1.1, z: -12.5 });
  phys.addBox({ x: 6, y: 1.1, z: -12.5 }, { x: 3, y: 1.1, z: 3 });
  add(new THREE.BoxGeometry(14, 3, 0.6), mat(0x7c6f64), { x: 0, y: 1.5, z: 6 });
  phys.addBox({ x: 0, y: 1.5, z: 6 }, { x: 7, y: 1.5, z: 0.3 });
  add(new THREE.CylinderGeometry(3.2, 3.6, 1.2, 24), mat(0x9ca3af), { x: PORTALS[1].x, y: 0.6, z: PORTALS[1].z });
  phys.addBox({ x: PORTALS[1].x, y: 0.6, z: PORTALS[1].z }, { x: 2.6, y: 0.6, z: 2.6 });
  // Portal rings (visual marker only).
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xc4b5fd });
  disposables.push(ringMat);
  const rings = PORTALS.map((p) => add(new THREE.TorusGeometry(1.6, 0.12, 8, 40), ringMat, { x: p.x, y: p.y + 1.8, z: p.z }));
  return { rings, dispose: () => disposables.forEach((d) => d.dispose()) };
}

export default function PhysicsLab() {
  const host = useRef<HTMLDivElement>(null);
  const [mixer] = useState(() => new MoveInputMixer());
  const [params, setParams] = useState<Params | null>(null);
  const [warpAvailable, setWarpAvailable] = useState(false);
  const [flash, setFlash] = useState(false);
  const [hud, setHud] = useState('Đang nạp vật lý…');
  const [result, setResult] = useState<BenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const charRef = useRef<Character | null>(null);
  const portalIndex = useRef(0);

  useEffect(() => {
    const p = readParams();
    let disposed = false;
    let cleanup = () => {};
    // URL params are known only in the browser.
    queueMicrotask(() => !disposed && setParams(p));
    (async () => {
      const R = await loadRapier();
      if (disposed || !host.current) return;
      const runtime = createRuntime(host.current, { tier: p.tier, probe: 'manual', lights: 'outdoor', sky: { gradient: [0x7dd3fc, 0xe0f2fe, 0x6b8f5e] }, fog: { color: 0xe0f2fe, near: 40, far: 140 } });
      const phys = createPhysicsWorld(R);
      const course = buildCourse(runtime.scene, phys, p.tier === 'high');
      const char = createCharacter(phys, { position: { x: 0, y: 0.1, z: 0 } });
      charRef.current = char;
      const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.9, 4, 12);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.6 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = p.tier === 'high';
      runtime.scene.add(body);
      // The class worst case: N students moving around (instanced capsules).
      const crowdGeo = new THREE.CapsuleGeometry(0.28, 0.8, 3, 8);
      const crowdMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.7 });
      const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, Math.max(1, p.crowd));
      crowd.count = p.crowd;
      runtime.scene.add(crowd);
      const m4 = new THREE.Matrix4();
      const camTarget = new THREE.Vector3();
      const lastJump = { at: 0 };
      let hudAt = 0;
      let near = false;
      let frames = 0;
      runtime.run((dt, t) => {
        frames += 1;
        const input = p.bench > 0 ? autopilot(t, lastJump) : mixer.read();
        phys.step(dt, (h) => char.update(input, 0, h));
        const pos = char.renderPosition(phys.alpha);
        body.position.set(pos.x, pos.y + 0.75, pos.z);
        body.rotation.y = char.motion.facing;
        // Follow camera behind and above (fixed yaw: the joystick is camera-relative).
        camTarget.set(pos.x, pos.y + 4.2, pos.z + 7.5);
        runtime.camera.position.lerp(camTarget, Math.min(1, dt * 5));
        runtime.camera.lookAt(pos.x, pos.y + 1, pos.z);
        for (let i = 0; i < p.crowd; i++) {
          const a = t * 0.3 + (i / Math.max(1, p.crowd)) * Math.PI * 2;
          const r = 12 + (i % 5) * 2.5;
          m4.makeRotationY(-a).setPosition(Math.cos(a) * r, 0.7 + Math.abs(Math.sin(t * 6 + i)) * 0.08, Math.sin(a) * r);
          crowd.setMatrixAt(i, m4);
        }
        crowd.instanceMatrix.needsUpdate = true;
        course.rings.forEach((ring, i) => (ring.rotation.y = t * (i ? -1 : 1)));
        // Warp is available near a portal.
        const nearest = PORTALS.findIndex((q) => Math.hypot(q.x - pos.x, q.z - pos.z) < WARP_RADIUS && Math.abs(q.y - pos.y) < 2);
        if ((nearest >= 0) !== near) {
          near = nearest >= 0;
          if (near) portalIndex.current = nearest;
          setWarpAvailable(near);
        }
        if (t - hudAt > 0.5) {
          hudAt = t;
          const s = runtime.stats();
          setHud(`${s.fps} FPS · ${s.tier} · ${s.calls} draw · ${(s.triangles / 1000).toFixed(0)}k tam giác · ${char.clip}${char.motion.grounded ? '' : ' (trên không)'} · x ${pos.x.toFixed(1)} y ${pos.y.toFixed(1)} z ${pos.z.toFixed(1)}`);
        }
      });
      if (p.bench > 0) {
        const label = `physics-lab tier=${p.tier} crowd=${p.crowd}`;
        void measureFrames(p.bench, p.warmup, label).then((summary) => {
          if (disposed) return;
          const s = runtime.stats();
          const res: BenchResult = {
            done: true,
            label,
            params: { tier: p.tier, crowd: String(p.crowd), bench: String(p.bench) },
            summary,
            device: deviceInfo(runtime.renderer.getContext()),
            scene: { calls: s.calls, triangles: s.triangles, textureMB: s.textureMB, geometryMB: s.geometryMB, pixelRatio: s.pixelRatio, tier: s.tier, physicsFrames: frames },
            at: new Date().toISOString(),
          };
          window.__tcBench = res;
          setResult(res);
        });
      }
      cleanup = () => {
        charRef.current = null;
        char.dispose();
        phys.dispose();
        course.dispose();
        bodyGeo.dispose();
        bodyMat.dispose();
        crowdGeo.dispose();
        crowdMat.dispose();
        runtime.dispose();
      };
      if (disposed) cleanup();
    })().catch((e: unknown) => !disposed && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      disposed = true;
      cleanup();
    };
  }, [mixer]);

  const onWarp = () => {
    const from = portalIndex.current;
    const to = PORTALS[(from + 1) % PORTALS.length];
    charRef.current?.teleport({ x: to.x, y: to.y + 0.1, z: to.z + WARP_RADIUS + 0.5 });
    setFlash(true);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-900 text-white">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-2 top-2 z-30 rounded bg-black/55 px-2 py-1 font-mono text-xs">
        {error ? `Lỗi: ${error}` : hud}
      </div>
      {params && params.bench === 0 && (
        <SpatialControls mixer={mixer} warpAvailable={warpAvailable} onWarp={onWarp} onArrived={() => setFlash(false)} lite={params.tier === 'low'} />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-40 bg-violet-200 transition-opacity duration-300"
        style={{ opacity: flash ? 0.85 : 0 }}
      />
      {params && params.bench > 0 && (
        <div className="absolute inset-x-2 bottom-2 z-50 rounded bg-black/75 p-3 font-mono text-xs leading-relaxed" data-testid="fps-result">
          {result ? (
            <>
              <div className={result.summary.pass ? 'text-emerald-300' : 'text-rose-300'}>{fpsLine(result.summary)}</div>
              <div>
                {result.device.gpu} · dpr {result.device.dpr} · {result.device.viewport}
              </div>
              <div>
                {result.label} · {result.scene?.calls} draw · {result.scene?.triangles} tam giác
              </div>
            </>
          ) : (
            <div>Đang đo {params.bench} giây (khởi động {params.warmup} giây)…</div>
          )}
        </div>
      )}
    </div>
  );
}
