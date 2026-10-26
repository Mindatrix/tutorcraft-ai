'use client';

import type { Group } from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createLoadQueue, splitByStage, variantFor, type AssetPlan, type AssetQualityLevel, type PlannedAsset } from '../../../engine/assetLoader';
import { assetBase } from '../../../config/assetLibrary';

// Browser side of the per-game asset loader (A3.7). One GLTFLoader with the Meshopt decoder
// (every optimized library file is meshopt-compressed) and ONE cache for the whole session:
// models shared by several games (river world, characters) are fetched once.

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const queue = createLoadQueue<GLTF>((url) => loader.loadAsync(url), 3);

export function modelUrl(file: string, quality: AssetQualityLevel): string {
  return `${assetBase()}/${quality === 'low' ? 'low' : 'web'}/${file}`;
}

/** Any GLB URL (library or /public), cached for the session. */
export function loadGltf(url: string): Promise<GLTF> {
  return queue.get(url);
}

export async function loadScene(url: string): Promise<Group> {
  return (await loadGltf(url)).scene;
}

export interface SceneAssetsProgress {
  /** 0..1 of the part needed to start (stage 1). */
  ready: number;
  /** 0..1 of everything in the plan. */
  all: number;
}

/**
 * Load a scenario's models: resolves once the stage-1 set is in (the match can start);
 * `background` settles when the rest has loaded. Failed models are simply absent — the
 * scene keeps its code-built stand-in for them.
 */
export async function loadScenarioAssets(
  plan: AssetPlan,
  { quality, readyStage = 1, onProgress }: { quality: AssetQualityLevel; readyStage?: number; onProgress?: (p: SceneAssetsProgress) => void },
): Promise<{ models: Map<string, GLTF>; background: Promise<Map<string, GLTF>> }> {
  const { ready, later } = splitByStage(plan, readyStage);
  const weight = (items: PlannedAsset[]) => items.reduce((n, p) => n + Math.max(0.05, p.mb[quality]), 0);
  const totalAll = weight(plan.items) || 1;
  const totalReady = weight(ready) || 1;
  let doneReady = 0;
  let doneAll = 0;
  const models = new Map<string, GLTF>();
  const urlOf = (p: PlannedAsset) => modelUrl(p.file, variantFor(p, quality));
  const track = (p: PlannedAsset, isReady: boolean) =>
    loadGltf(urlOf(p))
      .then((g) => void models.set(p.libraryId, g))
      .catch(() => undefined)
      .finally(() => {
        const w = Math.max(0.05, p.mb[quality]);
        doneAll += w;
        if (isReady) doneReady += w;
        onProgress?.({ ready: Math.min(1, doneReady / totalReady), all: Math.min(1, doneAll / totalAll) });
      });
  await Promise.all(ready.map((p) => track(p, true)));
  onProgress?.({ ready: 1, all: Math.min(1, doneAll / totalAll) });
  const background = Promise.all(later.map((p) => track(p, false))).then(() => models);
  return { models, background };
}

export function cachedModelCount(): number {
  return queue.size();
}
