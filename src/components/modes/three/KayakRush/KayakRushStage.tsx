'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PhoneticStoneStateMachine } from '../../../../client/phoneticStones';
import PhoneticStonesHud from '../../../hud/PhoneticStonesHud';
import {
  mountKayakRushScene,
  type KayakRushSceneHandle,
} from './KayakRushScene';
import {
  applyKayakWaypointStoneResult,
  createInitialKayakBoostState,
  KAYAK_RUSH_TARGETS,
  KAYAK_RUSH_WAYPOINTS,
  resolveKayakPetDialogue,
  type KayakSpeedBoostState,
} from './waypoints';

export interface KayakRushStageProps {
  /** Optional external state machine instance for testing or parent synchronization. */
  machine?: PhoneticStoneStateMachine;
}

export function KayakRushStage({ machine: externalMachine }: KayakRushStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneHandleRef = useRef<KayakRushSceneHandle | null>(null);
  const internalMachine = useMemo(
    () =>
      externalMachine ??
      new PhoneticStoneStateMachine({ targets: KAYAK_RUSH_TARGETS }),
    [externalMachine],
  );

  const [webglReady, setWebglReady] = useState(true);
  const [boostState, setBoostState] = useState<KayakSpeedBoostState>(() =>
    createInitialKayakBoostState(),
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let mounted: ReturnType<typeof mountKayakRushScene> | null = null;
    try {
      mounted = mountKayakRushScene({
        container: el,
        onStoneSelected(userData) {
          internalMachine.selectStone(userData.targetId);
        },
      });
      sceneHandleRef.current = mounted.sceneHandle;
    } catch {
      setTimeout(() => setWebglReady(false), 0);
    }

    const unsubSelect = internalMachine.bus.on('stone:select', ({ target }) => {
      sceneHandleRef.current?.setActiveStone(target.targetId);
      const wp = KAYAK_RUSH_WAYPOINTS.find((w) => w.targetId === target.targetId);
      if (wp) {
        const approachLine = resolveKayakPetDialogue({
          petState: 'coach',
          trigger: wp.approachTrigger,
        });
        setBoostState((prev) => ({
          ...prev,
          lastDialogue: approachLine ?? prev.lastDialogue,
        }));
      }
    });

    const unsubPet = internalMachine.bus.on('pet:state', ({ state }) => {
      sceneHandleRef.current?.setPetState(state);
    });

    const unsubResult = internalMachine.bus.on('stone:result', ({ response }) => {
      setBoostState((prev) => {
        const next = applyKayakWaypointStoneResult(prev, response);
        sceneHandleRef.current?.setClearedStones(next.clearedWaypointIds);
        if (response.accepted && (response.passed || response.stars >= 1)) {
          sceneHandleRef.current?.triggerSpeedBoost(
            next.activeMultiplier,
            next.currentWaypointIndex,
          );
        }
        return next;
      });
    });

    const unsubState = internalMachine.bus.on('state:change', ({ next }) => {
      if (next === 'idle') {
        sceneHandleRef.current?.setActiveStone(null);
      }
    });

    return () => {
      unsubSelect();
      unsubPet();
      unsubResult();
      unsubState();
      sceneHandleRef.current = null;
      mounted?.dispose();
    };
  }, [internalMachine]);

  return (
    <div
      className="relative h-full min-h-[620px] w-full overflow-hidden rounded-3xl bg-sky-950"
      data-testid="kayak-rush-stage"
    >
      {/* 3D WebGL Canvas Mount */}
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Kayak Rush 3D Scene"
      />

      {/* Top Kayak Speed Boost & Waypoint Progress Banner */}
      <div className="pointer-events-none absolute top-4 right-4 left-4 z-10 flex flex-wrap items-center justify-between gap-2">
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-sky-400/40 bg-slate-900/85 px-4 py-2 text-xs text-sky-100 shadow-lg backdrop-blur-md"
          data-testid="kayak-speed-hud"
        >
          <div>
            <span className="font-bold text-amber-300">🚣 Kayak Rush</span>
            <span className="ml-2 text-slate-300">
              Speed:{' '}
              <strong data-testid="kayak-speed-kmh">
                {boostState.currentSpeedKmh} km/h
              </strong>{' '}
              ({boostState.activeMultiplier}x)
            </span>
          </div>
          <div className="rounded-lg bg-sky-500/20 px-2.5 py-1 font-semibold text-sky-200">
            Waypoints: {boostState.clearedWaypointIds.length}/{KAYAK_RUSH_WAYPOINTS.length}
          </div>
        </div>

        {/* Waypoint quick-select buttons for accessibility / non-WebGL fallback */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          {KAYAK_RUSH_WAYPOINTS.map((wp) => {
            const isCleared = boostState.clearedWaypointIds.includes(wp.targetId);
            return (
              <button
                key={wp.targetId}
                type="button"
                onClick={() => internalMachine.selectStone(wp.targetId)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  isCleared
                    ? 'border-emerald-400/50 bg-emerald-950/80 text-emerald-200'
                    : 'border-sky-400/40 bg-slate-900/80 text-sky-100 hover:bg-sky-900/70'
                }`}
                data-testid={`kayak-waypoint-btn-${wp.targetId}`}
              >
                ⚡ {wp.word} {isCleared ? '✓' : ''}
              </button>
            );
          })}
        </div>
      </div>

      {!webglReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-sky-200/80">
          Chế độ 3D rút gọn: Chọn các trạm phát âm phía trên để kích hoạt Tăng Tốc Kayak!
        </div>
      )}

      {/* Shared Phonetic Stones HUD wired with dialogueMode="kayak" */}
      <PhoneticStonesHud machine={internalMachine} dialogueMode="kayak" />
    </div>
  );
}
