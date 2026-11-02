'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  applyCampStoneResult,
  applyFishingDockStoneResult,
  castFishingRodWithMultiplier,
  createInitialCampQuestBoard,
  createInitialFishingDockState,
  MOCK_VOICE_CONFIG,
  PhoneticStoneStateMachine,
  RIVER_FISHING_TARGETS,
  SUMMER_CAMP_TARGETS,
  type CampQuestBoardState,
  type FishingDockState,
  type PhoneticStoneTarget,
  type VoiceConfig,
} from '@/src/client/phoneticStones';
import PhoneticStonesHud from '../hud/PhoneticStonesHud';
import { glow, lowpoly, mesh, roughen } from './kit';
import { createRuntime, type GfxTier } from './three/SceneRuntime';
import { createPhoneticStonesRig, type PhoneticStonesRig } from './three/phoneticStones';

export interface PhoneticStonesStageProps {
  tier?: GfxTier;
  /** Initial 3D game world (`summer_camp` or `river_fishing`). */
  worldMode?: 'summer_camp' | 'river_fishing';
  /** Hide the world switcher when embedded inside a specific single-world stage. */
  lockWorldMode?: boolean;
  targets?: PhoneticStoneTarget[];
  voiceConfig?: VoiceConfig;
  level?: number;
  questionOpen?: boolean;
  paused?: boolean;
  className?: string;
}

export default function PhoneticStonesStage({
  tier = 'high',
  worldMode: initialWorldMode = 'summer_camp',
  lockWorldMode = false,
  targets,
  voiceConfig = MOCK_VOICE_CONFIG,
  level = 3,
  questionOpen = false,
  paused = false,
  className = 'h-[560px] w-full',
}: PhoneticStonesStageProps) {
  const [activeWorld, setActiveWorld] = useState<'summer_camp' | 'river_fishing'>(initialWorldMode);
  const [campBoard, setCampBoard] = useState<CampQuestBoardState>(() =>
    createInitialCampQuestBoard(),
  );
  const [fishingDock, setFishingDock] = useState<FishingDockState>(() =>
    createInitialFishingDockState(),
  );

  const mountRef = useRef<HTMLDivElement | null>(null);
  const blockedRef = useRef(false);
  const rigRef = useRef<PhoneticStonesRig | null>(null);

  const activeTargets = useMemo(() => {
    if (targets && targets.length > 0) return targets;
    return activeWorld === 'river_fishing' ? RIVER_FISHING_TARGETS : SUMMER_CAMP_TARGETS;
  }, [targets, activeWorld]);

  const machine = useMemo(
    () =>
      new PhoneticStoneStateMachine({
        targets: activeTargets,
        voiceConfig,
        level,
      }),
    // Recreate state machine when world mode changes so targets & progress match the world
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeWorld],
  );

  useEffect(() => {
    blockedRef.current = Boolean(questionOpen || paused);
  }, [questionOpen, paused]);

  useEffect(() => {
    machine.setTargets(activeTargets, voiceConfig);
  }, [machine, activeTargets, voiceConfig]);

  useEffect(() => {
    machine.setLevel(level);
  }, [machine, level]);

  // Connect `stone:result` events to Summer Camp Quest Board & River Fishing Dock state
  useEffect(() => {
    const unsub = machine.bus.on('stone:result', ({ response }) => {
      if (activeWorld === 'summer_camp') {
        setCampBoard((prev) => {
          const next = applyCampStoneResult(prev, response, machine.getSnapshot().activeMode);
          rigRef.current?.setCampQuestProgress(
            next.completedCount / Math.max(1, next.totalCount),
            next.flagUnlocked,
          );
          return next;
        });
      } else {
        setFishingDock((prev) => applyFishingDockStoneResult(prev, response));
      }
    });
    return () => {
      unsub();
    };
  }, [machine, activeWorld]);

  const handleCastFishingRod = useCallback((targetId: string) => {
    setFishingDock((prev) => {
      const unlock = prev.unlockedByTarget[targetId];
      if (unlock?.ready) {
        rigRef.current?.triggerFishingCast(unlock.multiplier);
      }
      return castFishingRodWithMultiplier(prev, targetId).nextDock;
    });
  }, []);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let runtime: ReturnType<typeof createRuntime> | null = null;
    const isFishing = activeWorld === 'river_fishing';
    try {
      runtime = createRuntime(el, {
        tier,
        fov: 48,
        lights: 'outdoor',
        sky: isFishing
          ? { gradient: [0x0c4a6e, 0x075985, 0x082f49] }
          : { gradient: [0x0f172a, 0x1e293b, 0x0b1324] },
        fog: { color: isFishing ? 0x082f49 : 0x0f172a, near: 14, far: 48 },
      });
    } catch {
      return;
    }

    const { scene, camera, renderer, director } = runtime;
    scene.add(camera);
    camera.position.set(0, 3.8, 7.2);
    camera.lookAt(0, 0.9, -1.2);

    // Environment ground & lighting per world
    const clearing = new THREE.Group();
    const turf = mesh(
      roughen(new THREE.CylinderGeometry(10.5, 11.5, 0.4, 28, 1), 0.05, 7),
      lowpoly(isFishing ? 0x1e3a2f : 0x1b4332, { rough: 0.95 }),
      [0, -0.2, -0.8],
    );
    turf.receiveShadow = true;
    clearing.add(turf);

    const innerCircle = mesh(
      new THREE.RingGeometry(1.4, 4.8, 48),
      glow(isFishing ? 0x38bdf8 : 0xfbbf24, 0.14, true),
      [0, 0.02, -0.4],
    );
    innerCircle.rotation.x = -Math.PI / 2;
    clearing.add(innerCircle);

    const warmLight = new THREE.PointLight(isFishing ? 0x38bdf8 : 0xfcd34d, 8, 15, 1.6);
    warmLight.position.set(0, 2.5, -0.4);
    clearing.add(warmLight);
    scene.add(clearing);

    const rig = createPhoneticStonesRig({
      targets: machine.getSnapshot().targets,
      machine,
      director,
      worldMode: activeWorld,
      radius: 4.1,
      center: [0, 0, -0.4],
      isBlocked: () => blockedRef.current,
    });
    rigRef.current = rig;
    scene.add(rig.rootGroup);

    const detachCanvas = rig.attachCanvas(renderer.domElement);

    runtime.run((dt, t) => {
      rig.update(dt, t);
    });

    return () => {
      rigRef.current = null;
      detachCanvas();
      rig.dispose();
      machine.dispose();
      runtime?.dispose();
    };
  }, [machine, tier, activeWorld]);

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--color-ink)] bg-[var(--color-night)] ${className}`}
    >
      <div ref={mountRef} className="h-full w-full" />
      <PhoneticStonesHud
        machine={machine}
        worldMode={activeWorld}
        onWorldModeChange={lockWorldMode ? undefined : setActiveWorld}
        campBoard={campBoard}
        fishingDock={fishingDock}
        onCastFishingRod={handleCastFishingRod}
      />
    </div>
  );
}
