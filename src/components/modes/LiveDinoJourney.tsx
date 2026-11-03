'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import sceneKits from '../../../content/scene_kits.json';
import { ASSET_ALIASES, ASSET_LIBRARY, lib } from '../../config/assetLibrary';
import { THREE_ASSET_MANIFEST } from '../../config/threeAssets';
import { buildSceneLayout, hashString, type CatalogAsset, type SceneKits, type ScenarioAssets } from '../../engine';
import { createRuntime } from './three/SceneRuntime';
import { buildRiverWorld } from './three/riverWorld';
import { loadScene } from './three/assetLoader';
import type { BossSceneProps } from './types';
import { STAGES, dinoStageOf, dinoStageQuestions } from './dinoStages';

// Dino Journey in a live match (03/11/2026): the meadow world of the scenario (dino-01, dino-02…)
// built like /tutor/scene-lab (buildSceneLayout + buildRiverWorld: the world streams its models in
// after the first frame), with one environmental checkpoint per question of the stage —
// footprints, a water puddle, a foliage patch — on the herd's path. Answered right: it lights up
// green; wrong: grey; the current one pulses and the camera walks to it. The checkpoints are
// gates the SERVER's answers open (results come from the battle state), never a score of their own.
//
// Heavy dinosaur models are lazy: the herd (5 low-poly dinosaurs) loads only after the world is in
// and the browser is idle, one at a time; a missing model is simply skipped.

const HERD = ['dino_diplodocus', 'dino_stegosaurus', 'dino_triceratops', 'dino_trex_brown', 'dino_sauropod_grey'];
type CheckpointKind = 'footprints' | 'puddle' | 'foliage';
const KINDS: CheckpointKind[] = ['footprints', 'puddle', 'foliage'];
function checkpointMesh(kind: CheckpointKind): { group: THREE.Group; mat: THREE.MeshStandardMaterial; dispose: () => void } {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, emissive: 0x000000, roughness: 0.8 });
  const geos: THREE.BufferGeometry[] = [];
  if (kind === 'footprints') {
    const g = new THREE.CircleGeometry(0.42, 10);
    geos.push(g);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(g, mat);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(0.7, 1.25, 1);
      m.position.set(i % 2 ? 0.45 : -0.45, 0.03, -i * 1.1);
      group.add(m);
    }
  } else if (kind === 'puddle') {
    const g = new THREE.CircleGeometry(1.1, 18);
    geos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.scale.set(1.3, 0.8, 1);
    group.add(m);
  } else {
    const g = new THREE.ConeGeometry(0.35, 0.9, 6);
    geos.push(g);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(g, mat);
      m.position.set(Math.cos(i * 1.6) * 0.6, 0.45, Math.sin(i * 1.6) * 0.6);
      group.add(m);
    }
  }
  return { group, mat, dispose: () => (geos.forEach((g) => g.dispose()), mat.dispose()) };
}

export default function LiveDinoJourney(props: BossSceneProps) {
  const { tier = 'high', scenarioKey, qIndex, qTotal } = props;
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const [row, setRow] = useState<(ScenarioAssets & { tags?: string[] }) | null>(null);
  const [status, setStatus] = useState('Đang dựng đồng cỏ…');
  const stage = dinoStageOf(qIndex, qTotal);
  const checkpointsRef = useRef<{ q: number; mat: THREE.MeshStandardMaterial; pos: THREE.Vector3 }[]>([]);

  // Layout data of the scenario (asset ids only).
  useEffect(() => {
    if (!scenarioKey) return;
    let stale = false;
    fetch(`/api/scenarios/layout?id=${encodeURIComponent(scenarioKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !stale && d && setRow(d))
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [scenarioKey]);

  // The world of the current stage (and its neighbours), rebuilt when the stage changes.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let runtime: ReturnType<typeof createRuntime>;
    try {
      runtime = createRuntime(el, {
        tier,
        probe: 'manual',
        lights: 'outdoor',
        sky: { hdri: row?.tags?.includes('dawn') ? 'dawn' : 'day', gradient: [0x5aa9e6, 0xcfe3b0, 0x7aa25a] },
        fog: { color: 0xcfe3b0, near: 30, far: 170 },
        far: 400,
        fov: 55,
        onLowQuality: () => live.current.onLowQuality?.(),
        onSlow: () => live.current.onUnavailable(),
      });
    } catch {
      live.current.onUnavailable();
      return;
    }
    let alive = true;
    const disposers: (() => void)[] = [];
    const camTarget = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    const herd: THREE.Object3D[] = [];
    checkpointsRef.current = [];

    if (row) {
      const stages = [stage - 1, stage, stage + 1].filter((n) => n >= 1 && n <= 8);
      const layout = buildSceneLayout({
        scenario: { ...row, game: row.game },
        catalog: ASSET_LIBRARY as CatalogAsset[],
        aliases: ASSET_ALIASES,
        layoutSeed: hashString(`${live.current.layoutSeedKey ?? scenarioKey}:layout`),
        quality: tier,
        stages,
        current: stage,
        fallbackNature: THREE_ASSET_MANIFEST.riverWorld.natureIds,
        kits: sceneKits as SceneKits,
        level: live.current.level ?? 3,
      });
      const area = layout.stages.find((s) => s.n === stage) ?? layout.stages[0];
      const world = buildRiverWorld({ layout, stages, tier, fogColor: 0xcfe3b0, onProgress: (d, t) => alive && setStatus(`Đang nạp mô hình ${d}/${t}`) });
      runtime.scene.add(world.group);
      disposers.push(() => world.dispose());

      // Checkpoints: one per question of this stage, along the path.
      const [from, to] = dinoStageQuestions(stage, qTotal);
      const n = Math.max(1, to - from);
      for (let i = 0; i < n; i++) {
        const q = from + i;
        const kind = KINDS[q % KINDS.length];
        const cp = checkpointMesh(kind);
        const z = area.z0 + ((i + 1) / (n + 1)) * (area.z1 - area.z0);
        const x = (i % 2 ? 1 : -1) * 2.2;
        cp.group.position.set(x, 0, z);
        runtime.scene.add(cp.group);
        checkpointsRef.current.push({ q, mat: cp.mat, pos: cp.group.position.clone() });
        disposers.push(() => (cp.group.removeFromParent(), cp.dispose()));
      }
      lookAt.set(0, 0, area.focal.z);
      runtime.camera.position.set(-6, 9, area.focal.z + 18);
      runtime.camera.lookAt(lookAt);

      // Lazy herd: after the world is in and the browser is idle, one model at a time.
      void world.ready.then(async () => {
        if (!alive) return;
        setStatus('');
        runtime.armProbe();
        const idle = () => new Promise<void>((r) => ((window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 300)))(() => r()));
        for (let i = 0; i < HERD.length && alive; i++) {
          await idle();
          try {
            const model = (await loadScene(lib(HERD[i], tier === 'low' ? 'low' : 'high'))).clone(true);
            if (!alive) return;
            const box = new THREE.Box3().setFromObject(model);
            const h = Math.max(0.01, box.max.y - box.min.y);
            model.scale.setScalar((i === 0 || i === 4 ? 4.2 : 2.4) / h);
            model.position.set((i % 2 ? 1 : -1) * (7 + i * 1.5), 0, area.focal.z - 6 - i * 4);
            model.rotation.y = Math.PI * (i % 2 ? 0.75 : 0.25);
            runtime.scene.add(model);
            herd.push(model);
          } catch {
            /* missing model: skip */
          }
        }
      });
    }

    runtime.run((dt, t) => {
      // Current checkpoint pulses gold; the camera walks to it.
      const p = live.current;
      for (const cp of checkpointsRef.current) {
        const answered = cp.q < p.results.length;
        if (cp.q === p.qIndex && !p.finished) {
          cp.mat.color.setHex(0xfacc15);
          cp.mat.emissive.setHex(0x8a6a00);
          cp.mat.emissiveIntensity = 0.6 + Math.sin(t * 5) * 0.4;
          camTarget.set(cp.pos.x * 0.4 - 4, 7, cp.pos.z + 13);
          lookAt.lerp(cp.pos, Math.min(1, dt * 2));
        } else if (answered) {
          const ok = p.results[cp.q];
          cp.mat.color.setHex(ok ? 0x4ade80 : 0x9ca3af);
          cp.mat.emissive.setHex(ok ? 0x14532d : 0x000000);
          cp.mat.emissiveIntensity = ok ? 0.8 : 0;
        }
      }
      if (camTarget.lengthSq() > 0) {
        runtime.camera.position.lerp(camTarget, Math.min(1, dt * 1.5));
        runtime.camera.lookAt(lookAt);
      }
      herd.forEach((d, i) => (d.position.y = Math.abs(Math.sin(t * 1.2 + i)) * 0.05));
    });

    return () => {
      alive = false;
      disposers.forEach((d) => d());
      herd.forEach((d) => d.removeFromParent());
      runtime.dispose();
    };
    // The world is rebuilt per stage; question progress is read live from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, stage, tier]);

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" data-testid="live-world-dino_journey" />
      <div className="pointer-events-none absolute left-2 top-[104px] z-10 rounded bg-black/55 px-2 py-1 text-[11px] text-white" data-testid="dino-checkpoints">
        🦕 Chặng {stage}/{STAGES} · mốc {Math.min(qIndex + 1, qTotal)}/{qTotal}
        {status ? ` · ${status}` : ''}
        {!scenarioKey ? ' · (chưa có kịch bản)' : ''}
      </div>
    </div>
  );
}
