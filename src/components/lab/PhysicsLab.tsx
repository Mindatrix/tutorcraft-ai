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
import {
  buildSceneCollisionMesh,
  type PhysicsSceneId,
} from '../modes/three/physics/sceneColliders';
import {
  createPhysicsCharacterAvatar,
  PHYSICS_CAPSULE_HEIGHT,
  PhysicsCharacterAvatar,
  RIGGED_CHARACTER_CLIP_CATALOG,
} from '../modes/three/avatar';
import {
  createWarpPortalRig,
  detectPrefersReducedMotion,
  WarpTransitionOverlay,
  type WarpPortalRigHandle,
} from '../modes/three/warpPortalEffect';
import {
  createGoldenChallengeOrb,
  raycastAndTriggerGoldenOrb,
} from '../modes/three/goldenChallengeOrb';
import { TapGestureTracker } from '../modes/three/phoneticStoneRaycaster';
import { fpsLine, type MoveInput } from '../../engine';

// Đại phẫu (03/11/2026): physics + Spatial UI test track and the FPS benchmark page.
//
//   /tutor/physics-lab                 play: joystick / WASD, jump, "Xuyên không" between 2 portals
//   ?tier=low                          low graphics tier (no shadows, no blur)
//   ?crowd=50                          50 moving student stand-ins (instanced), the class worst case
//   ?scene=river_survival              load scene-specific collision mesh (river_survival | summer_camp | kayak_rush | multiverse_portal)
//   ?bench=20&warmup=2                 autopilot walks the course, measures 20 s of frames, shows the
//                                      result and publishes window.__tcBench (scripts/fps-benchmark.mjs)

const PORTALS: Vec3[] = [
  { x: 0, y: 0, z: -22 },
  { x: 24, y: 1.2, z: 8 },
];
const WARP_RADIUS = 3;

const SCENE_IDS: PhysicsSceneId[] = [
  'river_survival',
  'summer_camp',
  'kayak_rush',
  'multiverse_portal',
];

interface Params {
  tier: GfxTier;
  crowd: number;
  bench: number;
  warmup: number;
  scene: PhysicsSceneId | null;
  model: string;
}

function readParams(): Params {
  const q = new URLSearchParams(window.location.search);
  const num = (k: string, d: number, max: number) => {
    const n = Number(q.get(k));
    return Number.isFinite(n) && q.has(k) ? Math.max(0, Math.min(max, n)) : d;
  };
  const rawScene = q.get('scene') as PhysicsSceneId | null;
  const scene = rawScene && SCENE_IDS.includes(rawScene) ? rawScene : null;
  const model = q.get('model') ?? 'char_gamer_boy';
  return {
    tier: q.get('tier') === 'low' ? 'low' : 'high',
    crowd: num('crowd', 50, 80),
    bench: num('bench', 0, 120),
    warmup: num('warmup', 2, 10),
    scene,
    model,
  };
}

/** Autopilot for the benchmark: a slow loop around the course with a jump every 3 s. */
function autopilot(t: number, lastJump: { at: number }): MoveInput {
  const jump = t - lastJump.at > 3;
  if (jump) lastJump.at = t;
  return { x: Math.sin(t * 0.45) * 0.7, y: 1, jump };
}

function buildCourse(
  scene: THREE.Scene,
  phys: PhysicsWorld,
  tier: GfxTier,
  sceneId: PhysicsSceneId | null,
) {
  const shadows = tier === 'high';
  const disposables: { dispose(): void }[] = [];
  const mat = (color: number) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    disposables.push(m);
    return m;
  };
  const add = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    at: THREE.Vector3Like,
    rot?: THREE.Euler,
    parent: THREE.Object3D = scene,
  ) => {
    disposables.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(at.x, at.y, at.z);
    if (rot) mesh.rotation.copy(rot);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    parent.add(mesh);
    return mesh;
  };

  let collisionGroup: THREE.Group;

  if (sceneId) {
    // Load the requested game world's dedicated collision mesh (`userData.collision = true`)
    collisionGroup = buildSceneCollisionMesh(sceneId, { visible: true });
    scene.add(collisionGroup);
    phys.addTriangles(trianglesFrom(collisionGroup));
  } else {
    // Default physics-lab obstacle course with tiled ground (< 100 m per tile for Rapier 0.21)
    collisionGroup = new THREE.Group();
    collisionGroup.name = 'PhysicsLabCollisionGroup';
    collisionGroup.userData = { collision: true, sceneId: 'physics_lab' };
    scene.add(collisionGroup);

    // Tiled visual ground (4 × 4 tiles of 32 m = 128 m total, each tile 32 m < 100 m)
    const groundMat = mat(0x6b8f5e);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const tile = add(
          new THREE.PlaneGeometry(32, 32),
          groundMat,
          { x: -48 + c * 32, y: 0, z: -48 + r * 32 },
          new THREE.Euler(-Math.PI / 2, 0, 0),
        );
        tile.castShadow = false;
      }
    }
    // Physics ground split into safe tiles (< 100 m half-span: 40 m half = 80 m span)
    phys.addGround(0, 45);

    // Steps: 5 × 0.2 m (≤ 0.35 m autostep limit).
    const stepMat = mat(0xc8b48a);
    for (let i = 0; i < 5; i++) {
      const h = 0.2 * (i + 1);
      add(
        new THREE.BoxGeometry(4, h, 1.2),
        stepMat,
        { x: -6, y: h / 2, z: -4 - i * 1.2 },
        undefined,
        collisionGroup,
      );
      phys.addBox({ x: -6, y: h / 2, z: -4 - i * 1.2 }, { x: 2, y: h / 2, z: 0.6 });
    }
    // Ramp (≈ 17° ≤ 45°), collision from its triangles.
    const ramp = add(
      new THREE.BoxGeometry(4, 0.4, 8),
      mat(0xa3a3a3),
      { x: 6, y: 1.0, z: -6 },
      new THREE.Euler(0.3, 0, 0),
      collisionGroup,
    );
    phys.addTriangles(trianglesFrom(ramp));
    // Platform at the top of the ramp, a wall, and the second portal's plinth.
    add(new THREE.BoxGeometry(6, 2.2, 6), mat(0x8b7d6b), { x: 6, y: 1.1, z: -12.5 }, undefined, collisionGroup);
    phys.addBox({ x: 6, y: 1.1, z: -12.5 }, { x: 3, y: 1.1, z: 3 });
    add(new THREE.BoxGeometry(14, 3, 0.6), mat(0x7c6f64), { x: 0, y: 1.5, z: 6 }, undefined, collisionGroup);
    phys.addBox({ x: 0, y: 1.5, z: 6 }, { x: 7, y: 1.5, z: 0.3 });
  }

  // Second portal plinth
  add(
    new THREE.CylinderGeometry(3.2, 3.6, 1.2, 24),
    mat(0x9ca3af),
    { x: PORTALS[1].x, y: 0.6, z: PORTALS[1].z },
  );
  phys.addBox({ x: PORTALS[1].x, y: 0.6, z: PORTALS[1].z }, { x: 2.6, y: 0.6, z: 2.6 });

  // A3: Swirling glowing 3D "Xuyên không" portals (replacing the temporary purple torus rings)
  const portalRigs: WarpPortalRigHandle[] = PORTALS.map((p) => {
    const rig = createWarpPortalRig({ position: p, tier, open: true });
    scene.add(rig.group);
    return rig;
  });

  return {
    collisionGroup,
    portalRigs,
    dispose: () => {
      portalRigs.forEach((r) => r.dispose());
      disposables.forEach((d) => d.dispose());
    },
  };
}

export default function PhysicsLab() {
  const host = useRef<HTMLDivElement>(null);
  const [mixer] = useState(() => new MoveInputMixer());
  const [params, setParams] = useState<Params | null>(null);
  const [activeScene, setActiveScene] = useState<PhysicsSceneId | null>(null);
  const [warpAvailable, setWarpAvailable] = useState(false);
  const [flash, setFlash] = useState(false);
  const [goldenSlot, setGoldenSlot] = useState<{ golden: boolean; goldenTaken: boolean }>({
    golden: true,
    goldenTaken: false,
  });
  const [hud, setHud] = useState('Đang nạp vật lý…');
  const [result, setResult] = useState<BenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const charRef = useRef<Character | null>(null);
  const portalIndex = useRef(0);
  const goldenOrbRef = useRef<ReturnType<typeof createGoldenChallengeOrb> | null>(null);
  const portalRigsRef = useRef<WarpPortalRigHandle[]>([]);

  useEffect(() => {
    const p = readParams();
    let disposed = false;
    let cleanup = () => {};
    queueMicrotask(() => {
      if (!disposed) {
        setParams(p);
        setActiveScene((prev) => prev ?? p.scene);
      }
    });
    (async () => {
      const R = await loadRapier();
      if (disposed || !host.current) return;
      const selectedScene = activeScene ?? p.scene;
      const runtime = createRuntime(host.current, {
        tier: p.tier,
        probe: 'manual',
        lights: 'outdoor',
        sky: { gradient: [0x7dd3fc, 0xe0f2fe, 0x6b8f5e] },
        fog: { color: 0xe0f2fe, near: 40, far: 140 },
      });
      const phys = createPhysicsWorld(R);
      const course = buildCourse(runtime.scene, phys, p.tier, selectedScene);
      portalRigsRef.current = course.portalRigs;

      const char = createCharacter(phys, { position: { x: 0, y: 0.1, z: 0 } });
      charRef.current = char;

      // A2: Rigged animated character model (height = 1.5 m matching capsule, feet touching ground at pos.y)
      // In benchmark mode (p.bench > 0), keep the procedural rigged humanoid so GLB network/parse never skews frame timing.
      const playerAvatar =
        p.bench > 0
          ? new PhysicsCharacterAvatar({
              model: p.model,
              height: PHYSICS_CAPSULE_HEIGHT,
              quality: p.tier,
            })
          : createPhysicsCharacterAvatar({
              model: p.model,
              height: PHYSICS_CAPSULE_HEIGHT,
              quality: p.tier,
            });
      runtime.scene.add(playerAvatar.root);

      // A5: 3D Glowing "Thử thách vàng" (`GoldenChallengeOrb`)
      const goldenOrb = createGoldenChallengeOrb({
        position: [0, 1.35, -3.2],
        lite: p.tier === 'low',
        onTakeGolden: () => {
          setGoldenSlot((prev) => ({ ...prev, goldenTaken: true }));
        },
      });
      goldenOrb.syncSlot({ golden: p.bench === 0, goldenTaken: false });
      runtime.scene.add(goldenOrb.group);
      goldenOrbRef.current = goldenOrb;

      // Pointer tap raycasting for the 3D Golden Challenge orb
      const raycaster = new THREE.Raycaster();
      const pointerNdc = new THREE.Vector2();
      const tapTracker = new TapGestureTracker();
      const canvas = runtime.renderer.domElement;

      const onPointerDown = (e: PointerEvent) => {
        tapTracker.onPointerDown(e.clientX, e.clientY, performance.now(), e.pointerId);
      };
      const onPointerMove = (e: PointerEvent) => {
        tapTracker.onPointerMove(e.clientX, e.clientY, e.pointerId);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (!tapTracker.onPointerUp(e.clientX, e.clientY, performance.now(), e.pointerId)) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointerNdc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycastAndTriggerGoldenOrb(raycaster, pointerNdc, runtime.camera, goldenOrbRef.current);
      };

      if (p.bench === 0) {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
      }

      // The class worst case: N students moving around (instanced capsules).
      const crowdGeo = new THREE.CapsuleGeometry(0.28, 0.8, 3, 8);
      const crowdMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.7 });
      const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, Math.max(1, p.crowd));
      crowd.count = p.crowd;
      runtime.scene.add(crowd);

      const m4 = new THREE.Matrix4();
      const camTarget = new THREE.Vector3();
      const lastJump = { at: 0 };
      const reducedMotion = detectPrefersReducedMotion();
      let hudAt = 0;
      let near = false;
      let frames = 0;

      runtime.run((dt, t) => {
        frames += 1;
        const input = p.bench > 0 ? autopilot(t, lastJump) : mixer.read();
        phys.step(dt, (h) => char.update(input, 0, h));
        const pos = char.renderPosition(phys.alpha);

        // A2: Sync rigged character at feet position `pos.y`, facing `char.motion.facing`, and 5-state clip
        playerAvatar.syncFromController(
          {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            facing: char.motion.facing,
            clip: char.clip,
          },
          dt,
        );

        // Follow camera behind and above (fixed yaw: the joystick is camera-relative).
        camTarget.set(pos.x, pos.y + 4.2, pos.z + 7.5);
        runtime.camera.position.lerp(camTarget, Math.min(1, dt * 5));
        runtime.camera.lookAt(pos.x, pos.y + 1, pos.z);

        for (let i = 0; i < p.crowd; i++) {
          const a = t * 0.3 + (i / Math.max(1, p.crowd)) * Math.PI * 2;
          const r = 12 + (i % 5) * 2.5;
          m4.makeRotationY(-a).setPosition(
            Math.cos(a) * r,
            0.7 + Math.abs(Math.sin(t * 6 + i)) * 0.08,
            Math.sin(a) * r,
          );
          crowd.setMatrixAt(i, m4);
        }
        crowd.instanceMatrix.needsUpdate = true;

        // Warp is available near a portal.
        const nearest = PORTALS.findIndex(
          (q) => Math.hypot(q.x - pos.x, q.z - pos.z) < WARP_RADIUS && Math.abs(q.y - pos.y) < 2,
        );
        if (nearest >= 0 !== near) {
          near = nearest >= 0;
          if (near) portalIndex.current = nearest;
          setWarpAvailable(near);
        }

        // Update 3D swirling portals & Golden Challenge orb
        for (let i = 0; i < course.portalRigs.length; i++) {
          course.portalRigs[i].setHighlight({ near: nearest === i });
          course.portalRigs[i].update(t, reducedMotion);
        }
        goldenOrb.update(t);

        if (t - hudAt > 0.5) {
          hudAt = t;
          const s = runtime.stats();
          const missingInfo =
            playerAvatar.missingClips.length > 0
              ? ` · thiếu:[${playerAvatar.missingClips.join(',')}]`
              : '';
          setHud(
            `${s.fps} FPS · ${s.tier} · ${s.calls} draw · ${(s.triangles / 1000).toFixed(0)}k tam giác · ${char.clip}${char.motion.grounded ? '' : ' (trên không)'}${missingInfo} · x ${pos.x.toFixed(1)} y ${pos.y.toFixed(1)} z ${pos.z.toFixed(1)}`,
          );
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
            scene: {
              calls: s.calls,
              triangles: s.triangles,
              textureMB: s.textureMB,
              geometryMB: s.geometryMB,
              pixelRatio: s.pixelRatio,
              tier: s.tier,
              physicsFrames: frames,
            },
            at: new Date().toISOString(),
          };
          window.__tcBench = res;
          setResult(res);
        });
      }

      cleanup = () => {
        if (p.bench === 0) {
          canvas.removeEventListener('pointerdown', onPointerDown);
          canvas.removeEventListener('pointermove', onPointerMove);
          canvas.removeEventListener('pointerup', onPointerUp);
        }
        charRef.current = null;
        goldenOrbRef.current = null;
        portalRigsRef.current = [];
        char.dispose();
        phys.dispose();
        course.dispose();
        goldenOrb.dispose();
        playerAvatar.dispose();
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
  }, [mixer, activeScene]);

  // Keep Golden Challenge orb & portal highlights synced with `goldenSlot`
  useEffect(() => {
    const visible = goldenOrbRef.current?.syncSlot(goldenSlot) ?? false;
    for (const rig of portalRigsRef.current) {
      rig.setHighlight({ golden: visible });
    }
  }, [goldenSlot]);

  const onWarp = () => {
    const from = portalIndex.current;
    const to = PORTALS[(from + 1) % PORTALS.length];
    charRef.current?.teleport({ x: to.x, y: to.y + 0.1, z: to.z + WARP_RADIUS + 0.5 });
    setFlash(true);
  };

  const catalogAudit = params ? RIGGED_CHARACTER_CLIP_CATALOG[params.model] : undefined;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-900 text-white">
      <div ref={host} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-2 top-2 z-30 rounded bg-black/55 px-2 py-1 font-mono text-xs">
        {error ? `Lỗi: ${error}` : hud}
      </div>

      {/* Interactive QA controls (hidden during automated FPS benchmark) */}
      {params && params.bench === 0 && (
        <div className="pointer-events-auto absolute right-2 top-2 z-30 flex flex-wrap items-center gap-1.5 rounded bg-black/65 px-2.5 py-1.5 text-xs">
          <span className="font-semibold text-sky-300">Lưới va chạm:</span>
          <button
            type="button"
            onClick={() => setActiveScene(null)}
            className={`rounded px-2 py-0.5 ${activeScene === null ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-200'}`}
          >
            Lab
          </button>
          {SCENE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveScene(id)}
              className={`rounded px-2 py-0.5 ${activeScene === id ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-200'}`}
              data-testid={`physics-scene-${id}`}
            >
              {id}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              setGoldenSlot((prev) =>
                prev.golden && !prev.goldenTaken
                  ? { golden: true, goldenTaken: true }
                  : { golden: true, goldenTaken: false },
              )
            }
            className="ml-1 rounded bg-amber-500/25 px-2 py-0.5 font-semibold text-amber-300 border border-amber-400/50"
            data-testid="toggle-golden-slot"
          >
            {goldenSlot.golden && !goldenSlot.goldenTaken
              ? '✨ Thử thách vàng: Đang hiện'
              : '✨ Thử thách vàng: Đã nhận/Ẩn'}
          </button>
          {catalogAudit && (
            <span className="text-[11px] text-slate-300" data-testid="avatar-clip-audit">
              Model: {params.model} (1.5m)
            </span>
          )}
        </div>
      )}

      {params && params.bench === 0 && (
        <SpatialControls
          mixer={mixer}
          warpAvailable={warpAvailable}
          onWarp={onWarp}
          onArrived={() => setFlash(false)}
          lite={params.tier === 'low'}
        />
      )}

      {/* A3: 0.9 s (WARP.warpMs = 900 ms) "Xuyên không" transition effect */}
      <WarpTransitionOverlay
        active={flash}
        lite={params?.tier === 'low'}
        golden={goldenSlot.golden && !goldenSlot.goldenTaken}
      />

      {params && params.bench > 0 && (
        <div
          className="absolute inset-x-2 bottom-2 z-50 rounded bg-black/75 p-3 font-mono text-xs leading-relaxed"
          data-testid="fps-result"
        >
          {result ? (
            <>
              <div className={result.summary.pass ? 'text-emerald-300' : 'text-rose-300'}>
                {fpsLine(result.summary)}
              </div>
              <div>
                {result.device.gpu} · dpr {result.device.dpr} · {result.device.viewport}
              </div>
              <div>
                {result.label} · {result.scene?.calls} draw · {result.scene?.triangles} tam giác
              </div>
            </>
          ) : (
            <div>
              Đang đo {params.bench} giây (khởi động {params.warmup} giây)…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
