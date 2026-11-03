'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PhoneticStoneStateMachine } from '../../../../client/phoneticStones';
import PhoneticStonesHud from '../../../hud/PhoneticStonesHud';
import type { GoldenSlotLike } from '../goldenChallengeOrb';
import {
  mountMultiversePortalScene,
  type MultiversePortalSceneHandle,
} from './MultiversePortalScene';
import {
  applyPortalPasscodeResult,
  CENTRAL_PORTAL_STONE_ID,
  createInitialPortalLockState,
  MULTIVERSE_PORTAL_TARGETS,
  type PortalLockState,
} from './portalRules';

export interface MultiversePortalStageProps {
  /** Optional external state machine instance for testing or parent synchronization. */
  machine?: PhoneticStoneStateMachine;
  /** Optional schedule slot for the 3D Golden Challenge orb (`slot.golden && !slot.goldenTaken`). */
  slot?: GoldenSlotLike;
  /** Callback supplied by Claude Code when the student taps the 3D Golden Challenge orb. */
  onTakeGolden?: () => void;
}

export function MultiversePortalStage({
  machine: externalMachine,
  slot = null,
  onTakeGolden,
}: MultiversePortalStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneHandleRef = useRef<MultiversePortalSceneHandle | null>(null);
  const internalMachine = useMemo(
    () =>
      externalMachine ??
      new PhoneticStoneStateMachine({
        targets: MULTIVERSE_PORTAL_TARGETS,
        gameMode: 'multiverse_portal',
      }),
    [externalMachine],
  );

  const [webglReady, setWebglReady] = useState(true);
  const [lockState, setLockState] = useState<PortalLockState>(() =>
    createInitialPortalLockState(),
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let mounted: ReturnType<typeof mountMultiversePortalScene> | null = null;
    try {
      mounted = mountMultiversePortalScene({
        container: el,
        onStoneSelected(userData) {
          internalMachine.selectStone(userData.targetId);
        },
        onTakeGolden,
      });
      sceneHandleRef.current = mounted.sceneHandle;
      mounted.sceneHandle.syncGoldenSlot(slot);
    } catch {
      setTimeout(() => setWebglReady(false), 0);
    }

    const unsubSelect = internalMachine.bus.on('stone:select', ({ target }) => {
      sceneHandleRef.current?.setActiveStone(target.targetId);
    });

    const unsubPet = internalMachine.bus.on('pet:state', ({ state }) => {
      sceneHandleRef.current?.setPetState(state);
    });

    const unsubResult = internalMachine.bus.on('stone:result', ({ response, effect }) => {
      setLockState((prev) => {
        const next = applyPortalPasscodeResult(prev, response);
        const resolvedEffect = effect ?? response.effect;
        if (resolvedEffect?.kind === 'portal_open') {
          sceneHandleRef.current?.applyPortalSpeechEffect(
            resolvedEffect,
            next.openingConfig?.stars ?? 3,
          );
        } else if (
          response.accepted &&
          (response.passed || response.stars >= 1) &&
          next.openingConfig
        ) {
          sceneHandleRef.current?.triggerPortalOpening(next.openingConfig.stars);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [internalMachine]);

  useEffect(() => {
    sceneHandleRef.current?.syncGoldenSlot(slot);
  }, [slot]);

  const centralTarget = MULTIVERSE_PORTAL_TARGETS[0];

  return (
    <div
      className="relative h-full min-h-[620px] w-full overflow-hidden rounded-3xl bg-indigo-950"
      data-testid="multiverse-portal-stage"
    >
      {/* 3D WebGL Canvas Mount */}
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Multiverse Portal 3D Scene"
      />

      {/* Top Portal Gate Lock & Passcode Status Banner */}
      <div className="pointer-events-none absolute top-4 right-4 left-4 z-10 flex flex-wrap items-center justify-between gap-2">
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-purple-400/40 bg-slate-950/85 px-4 py-2 text-xs text-purple-100 shadow-lg backdrop-blur-md"
          data-testid="multiverse-portal-hud"
        >
          <div>
            <span className="font-bold text-amber-300">🌌 Multiverse Portal</span>
            <span className="ml-2 text-slate-300">
              Gate Status:{' '}
              <strong
                data-testid="portal-gate-status"
                className={
                  lockState.gateState === 'open'
                    ? 'text-emerald-300 uppercase'
                    : 'text-amber-300 uppercase'
                }
              >
                {lockState.gateState}
              </strong>
            </span>
          </div>
          {lockState.unlockedStars > 0 && (
            <div
              className="rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-200"
              data-testid="portal-unlocked-stars"
            >
              {'★'.repeat(lockState.unlockedStars)} Portal Active
            </div>
          )}
        </div>

        {/* Central Pedestal Quick-Select Button for accessibility / non-WebGL fallback */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => internalMachine.selectStone(CENTRAL_PORTAL_STONE_ID)}
            className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
              lockState.gateState === 'open'
                ? 'border-emerald-400/60 bg-emerald-950/85 text-emerald-200'
                : 'border-purple-400/50 bg-indigo-950/85 text-purple-100 hover:bg-purple-900/75'
            }`}
            data-testid="central-portal-pedestal-btn"
          >
            🔮 {centralTarget.text}{' '}
            {lockState.gateState === 'open' ? '✓ (Unlocked)' : '(Voice Lock)'}
          </button>
        </div>
      </div>

      {!webglReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-purple-200/80">
          Chế độ 3D rút gọn: Bấm vào Bệ Đá Trung Tâm phía trên để đọc mật khẩu mở Cổng Đa Vũ Trụ!
        </div>
      )}

      {/* Shared Phonetic Stones HUD */}
      <PhoneticStonesHud machine={internalMachine} />
    </div>
  );
}
