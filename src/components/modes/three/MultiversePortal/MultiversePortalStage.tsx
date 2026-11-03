'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PhoneticStoneStateMachine } from '../../../../client/phoneticStones';
import type { AssetQuality } from '../../../../config/assetLibrary';
import PhoneticStonesHud from '../../../hud/PhoneticStonesHud';
import {
  MULTIVERSE_SCENE_IDS,
  MULTIVERSE_THEME_CONFIGS,
  type MultiversePerformanceAudit,
  type MultiverseSceneId,
} from './multiverseEnvironments';
import type { PortalVortexState } from './multiverseVfx';
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
  /** Initial Multiverse room theme (`mv-01`..`mv-05`). */
  initialSceneId?: MultiverseSceneId;
  /** Initial device graphics profile (`high` | `low`). */
  initialTier?: AssetQuality;
}

export function MultiversePortalStage({
  machine: externalMachine,
  initialSceneId = 'mv-01',
  initialTier = 'high',
}: MultiversePortalStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneHandleRef = useRef<MultiversePortalSceneHandle | null>(null);
  const internalMachine = useMemo(
    () =>
      externalMachine ??
      new PhoneticStoneStateMachine({
        targets: MULTIVERSE_PORTAL_TARGETS,
      }),
    [externalMachine],
  );

  const [webglReady, setWebglReady] = useState(true);
  const [sceneId, setSceneId] = useState<MultiverseSceneId>(initialSceneId);
  const [tier, setTier] = useState<AssetQuality>(initialTier);
  const [vortexState, setVortexState] = useState<PortalVortexState>('IDLE');
  const [perfAudit, setPerfAudit] = useState<MultiversePerformanceAudit | null>(null);
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
        sceneId,
        tier,
        onStoneSelected(userData) {
          internalMachine.selectStone(userData.targetId);
        },
      });
      sceneHandleRef.current = mounted.sceneHandle;
      setTimeout(() => {
        if (sceneHandleRef.current) {
          setPerfAudit(sceneHandleRef.current.auditPerformance());
        }
      }, 0);
    } catch {
      setTimeout(() => setWebglReady(false), 0);
    }

    const unsubSelect = internalMachine.bus.on('stone:select', ({ target }) => {
      sceneHandleRef.current?.setActiveStone(target.targetId);
      setVortexState(sceneHandleRef.current?.getVortexState() ?? 'PORTAL_CHARGING');
    });

    const unsubPet = internalMachine.bus.on('pet:state', ({ state }) => {
      sceneHandleRef.current?.setPetState(state);
    });

    const unsubResult = internalMachine.bus.on('stone:result', ({ response }) => {
      setLockState((prev) => {
        const next = applyPortalPasscodeResult(prev, response);
        if (
          response.accepted &&
          (response.passed || response.stars >= 1) &&
          next.openingConfig
        ) {
          sceneHandleRef.current?.triggerPortalOpening(next.openingConfig.stars);
          setVortexState('PORTAL_STABILIZED');
        }
        return next;
      });
    });

    const unsubState = internalMachine.bus.on('state:change', ({ next }) => {
      if (next === 'idle') {
        sceneHandleRef.current?.setActiveStone(null);
        setVortexState(sceneHandleRef.current?.getVortexState() ?? 'IDLE');
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

  const handleSelectTheme = (nextSceneId: MultiverseSceneId) => {
    setSceneId(nextSceneId);
    if (sceneHandleRef.current) {
      sceneHandleRef.current.setSceneTheme(nextSceneId, tier);
      setPerfAudit(sceneHandleRef.current.auditPerformance());
    }
  };

  const handleToggleTier = (nextTier: AssetQuality) => {
    setTier(nextTier);
    if (sceneHandleRef.current) {
      sceneHandleRef.current.setSceneTheme(sceneId, nextTier);
      setPerfAudit(sceneHandleRef.current.auditPerformance());
    }
  };

  const centralTarget = MULTIVERSE_PORTAL_TARGETS[0];
  const activeMeta = MULTIVERSE_THEME_CONFIGS[sceneId];

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

      {/* Top Portal Gate Lock, Theme Selector & LOD/VRAM Budget HUD */}
      <div className="pointer-events-none absolute top-4 right-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-purple-400/40 bg-slate-950/85 px-4 py-2 text-xs text-purple-100 shadow-lg backdrop-blur-md"
            data-testid="multiverse-portal-hud"
          >
            <div>
              <span className="font-bold text-amber-300">
                🌌 {activeMeta.id.toUpperCase()} · {activeMeta.nameEn}
              </span>
              <span className="ml-2 text-slate-300">
                Gate:{' '}
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
              <span className="ml-2 text-slate-400">
                Vortex:{' '}
                <strong data-testid="portal-vortex-state" className="text-sky-300">
                  {vortexState}
                </strong>
              </span>
            </div>
            {perfAudit && (
              <div
                className="rounded-lg border border-cyan-500/30 bg-cyan-950/50 px-2.5 py-0.5 text-[11px] text-cyan-200"
                data-testid="multiverse-perf-badge"
              >
                {perfAudit.tier.toUpperCase()} · {perfAudit.totalEstimatedVramMb} MB VRAM ·{' '}
                {perfAudit.drawCalls} draws · {perfAudit.lodGroupCount} LODs
              </div>
            )}
            {lockState.unlockedStars > 0 && (
              <div
                className="rounded-lg bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-200"
                data-testid="portal-unlocked-stars"
              >
                {'★'.repeat(lockState.unlockedStars)} Portal Active
              </div>
            )}
          </div>

          {/* Central Pedestal Quick-Select & Tier Toggle */}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleToggleTier(tier === 'high' ? 'low' : 'high')}
              className="rounded-xl border border-cyan-400/40 bg-slate-950/85 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-950"
              data-testid="multiverse-tier-toggle-btn"
            >
              LOD Tier: {tier.toUpperCase()}
            </button>
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

        {/* Multiverse Room Prefab Switcher (`mv-01` .. `mv-05`) */}
        <div
          className="pointer-events-auto flex flex-wrap items-center gap-1.5"
          data-testid="multiverse-theme-selector"
        >
          {MULTIVERSE_SCENE_IDS.map((id) => {
            const cfg = MULTIVERSE_THEME_CONFIGS[id];
            const active = id === sceneId;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTheme(id)}
                data-testid={`multiverse-theme-btn-${id}`}
                className={`rounded-xl border px-2.5 py-1 text-[11px] font-medium transition ${
                  active
                    ? 'border-amber-300/80 bg-amber-500/25 text-amber-100 shadow-sm'
                    : 'border-slate-700/70 bg-slate-950/75 text-slate-300 hover:border-purple-400/50 hover:text-white'
                }`}
              >
                {id.toUpperCase()} · {cfg.nameEn}
              </button>
            );
          })}
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

export default MultiversePortalStage;
