'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  MOCK_SPEECH_TARGETS,
  MOCK_VOICE_CONFIG,
  PhoneticStoneStateMachine,
  type PhoneticStoneTarget,
  type VoiceConfig,
} from '@/src/client/phoneticStones';
import PhoneticStonesHud from '../hud/PhoneticStonesHud';
import { glow, lowpoly, mesh, roughen } from './kit';
import { createRuntime, type GfxTier } from './three/SceneRuntime';
import { createPhoneticStonesRig } from './three/phoneticStones';

export interface PhoneticStonesStageProps {
  tier?: GfxTier;
  targets?: PhoneticStoneTarget[];
  voiceConfig?: VoiceConfig;
  level?: number;
  questionOpen?: boolean;
  paused?: boolean;
  className?: string;
}

export default function PhoneticStonesStage({
  tier = 'high',
  targets = MOCK_SPEECH_TARGETS,
  voiceConfig = MOCK_VOICE_CONFIG,
  level = 3,
  questionOpen = false,
  paused = false,
  className = 'h-[560px] w-full',
}: PhoneticStonesStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const blockedRef = useRef(false);

  const machine = useMemo(
    () =>
      new PhoneticStoneStateMachine({
        targets,
        voiceConfig,
        level,
      }),
    // Recreate only if caller swaps target array reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    blockedRef.current = Boolean(questionOpen || paused);
  }, [questionOpen, paused]);

  useEffect(() => {
    machine.setTargets(targets, voiceConfig);
  }, [machine, targets, voiceConfig]);

  useEffect(() => {
    machine.setLevel(level);
  }, [machine, level]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    let runtime: ReturnType<typeof createRuntime> | null = null;
    try {
      runtime = createRuntime(el, {
        tier,
        fov: 48,
        lights: 'outdoor',
        sky: { gradient: [0x0f172a, 0x1e293b, 0x0b1324] },
        fog: { color: 0x0f172a, near: 14, far: 48 },
      });
    } catch {
      return;
    }

    const { scene, camera, renderer, director } = runtime;
    scene.add(camera);
    camera.position.set(0, 3.6, 6.8);
    camera.lookAt(0, 0.9, -1.2);

    // Hub clearing ground & glowing campfire ring
    const clearing = new THREE.Group();
    const turf = mesh(
      roughen(new THREE.CylinderGeometry(9.5, 10.5, 0.4, 28, 1), 0.05, 7),
      lowpoly(0x1e3a2f, { rough: 0.95 }),
      [0, -0.2, -0.8],
    );
    turf.receiveShadow = true;
    clearing.add(turf);

    const innerCircle = mesh(
      new THREE.RingGeometry(1.3, 4.5, 48),
      glow(0x38bdf8, 0.14, true),
      [0, 0.02, -0.4],
    );
    innerCircle.rotation.x = -Math.PI / 2;
    clearing.add(innerCircle);

    const warmLight = new THREE.PointLight(0xfcd34d, 8, 14, 1.6);
    warmLight.position.set(0, 2.4, -0.4);
    clearing.add(warmLight);
    scene.add(clearing);

    const rig = createPhoneticStonesRig({
      targets: machine.getSnapshot().targets,
      machine,
      director,
      radius: 4.1,
      center: [0, 0, -0.4],
      isBlocked: () => blockedRef.current,
    });
    scene.add(rig.rootGroup);

    const detachCanvas = rig.attachCanvas(renderer.domElement);

    runtime.run((dt, t) => {
      rig.update(dt, t);
    });

    return () => {
      detachCanvas();
      rig.dispose();
      machine.dispose();
      runtime?.dispose();
    };
  }, [machine, tier]);

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-xl)] border-2 border-[var(--color-ink)] bg-[var(--color-night)] ${className}`}
    >
      <div ref={mountRef} className="h-full w-full" />
      <PhoneticStonesHud machine={machine} />
    </div>
  );
}
