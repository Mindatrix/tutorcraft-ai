'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PhoneticStoneStateMachine,
  survivalStonesOpen,
  type SpeechGameEffect,
} from '../../../../client/phoneticStones';
import PhoneticStonesHud from '../../../hud/PhoneticStonesHud';
import type { GfxTier } from '../SceneRuntime';
import type { GoldenSlotLike } from '../goldenChallengeOrb';
import {
  RIVER_SURVIVAL_CLEARING_STONES,
  RIVER_SURVIVAL_SPEECH_TARGETS,
} from './clearingStones';
import {
  mountRiverSurvivalScene,
  type MountedRiverSurvivalScene,
} from './RiverSurvivalScene';
import {
  applySurvivalSpeechEffect,
  type SurvivalClueReveal,
} from './speechEffects';
import type { TagNetOwnerState } from './TagNet';
import { RIVER_SURVIVAL_ZONES, type SurvivalZoneId } from './zones';

export interface RiverSurvivalStageProps {
  tier?: GfxTier;
  initialTaggedCount?: number;
  initialNetOwner?: TagNetOwnerState;
  /** Show zone & Decoder stone selector bar (default `true`). */
  showControls?: boolean;
  /** Show teacher/lab debug controls for Wooden Pen gate & Tag Net throw (default `false` in student view per handoff §2b). */
  showDebugControls?: boolean;
  /** Optional external PhoneticStoneStateMachine instance. */
  machine?: PhoneticStoneStateMachine;
  /** True while a question modal/frame is open (blocks opening Phonetic Stones). */
  questionOpen?: boolean;
  /** Server match timestamp (ms) until which the 6 s "Né lưới" dodge window is active. */
  dodgeUntil?: number | null;
  /** Server match timestamp (ms) until which the 8 s "Cướp lưới" snatch window is active. */
  snatchUntil?: number | null;
  /** Optional schedule slot for the 3D Golden Challenge orb (`slot.golden && !slot.goldenTaken`). */
  slot?: GoldenSlotLike;
  /** Callback supplied by Claude Code when the student taps the 3D Golden Challenge orb. */
  onTakeGolden?: () => void;
  className?: string;
}

export default function RiverSurvivalStage({
  tier = 'high',
  initialTaggedCount = 2,
  initialNetOwner = 'pursuers',
  showControls = true,
  showDebugControls = false,
  machine: externalMachine,
  questionOpen = false,
  dodgeUntil = null,
  snatchUntil = null,
  slot = null,
  onTakeGolden,
  className = 'h-[580px] w-full',
}: RiverSurvivalStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<MountedRiverSurvivalScene | null>(null);

  const internalMachine = useMemo(
    () =>
      externalMachine ??
      new PhoneticStoneStateMachine({
        targets: RIVER_SURVIVAL_SPEECH_TARGETS,
        gameMode: 'river_survival',
      }),
    [externalMachine],
  );

  const [activeZone, setActiveZone] = useState<SurvivalZoneId>('zone_bravo');
  const [gateOpen, setGateOpen] = useState(false);
  const [taggedCount, setTaggedCount] = useState(initialTaggedCount);
  const [netOwner, setNetOwner] = useState<TagNetOwnerState>(initialNetOwner);
  const [solvedStoneIds, setSolvedStoneIds] = useState<string[]>([]);
  const [clueProgress, setClueProgress] = useState<{ solved: number; nextAt: number | null }>({
    solved: 0,
    nextAt: 2,
  });
  const [revealedClue, setRevealedClue] = useState<SurvivalClueReveal | null>(null);
  const [gateBlockedNotice, setGateBlockedNotice] = useState<string | null>(null);

  const gatingRef = useRef({ questionOpen, dodgeUntil, snatchUntil, activeZone });
  useEffect(() => {
    gatingRef.current = { questionOpen, dodgeUntil, snatchUntil, activeZone };
  }, [questionOpen, dodgeUntil, snatchUntil, activeZone]);

  const tryOpenClearingStone = (targetId: string, zoneId?: SurvivalZoneId) => {
    const { questionOpen: qOpen, dodgeUntil: dUntil, snatchUntil: sUntil } = gatingRef.current;
    const canOpen = survivalStonesOpen({
      now: Date.now(),
      questionOpen: qOpen,
      dodgeUntil: dUntil,
      snatchUntil: sUntil,
    });
    if (!canOpen) {
      setGateBlockedNotice(
        'Đang trong khung Né lưới (6s) / Cướp lưới (8s) hoặc câu hỏi — tạm khóa Đá Phát Âm!',
      );
      return false;
    }
    setGateBlockedNotice(null);
    if (zoneId) {
      setActiveZone(zoneId);
      sceneRef.current?.environment.focusZone(zoneId);
    }
    sceneRef.current?.environment.setActiveStone(targetId);
    return internalMachine.selectStone(targetId);
  };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let mounted: MountedRiverSurvivalScene | null = null;
    try {
      mounted = mountRiverSurvivalScene(el, {
        tier,
        initialTaggedCount,
        initialNetOwner,
        onStoneSelected: (userData, zoneId) => {
          tryOpenClearingStone(userData.targetId, zoneId);
        },
        onTakeGolden,
      });
      sceneRef.current = mounted;
      mounted.environment.syncGoldenSlot(slot);
    } catch {
      return;
    }

    const handleSpeechEffect = (targetId: string, effect: SpeechGameEffect | null | undefined) => {
      const env = sceneRef.current?.environment;
      if (!env || !effect) return;
      const stoneSpec = RIVER_SURVIVAL_CLEARING_STONES.find((s) => s.targetId === targetId);
      const zoneId = stoneSpec?.zoneId ?? gatingRef.current.activeZone;
      const outcome = applySurvivalSpeechEffect(env, effect, zoneId);
      if (outcome.progress) {
        setClueProgress(outcome.progress);
      }
      if (outcome.reveal) {
        setRevealedClue(outcome.reveal);
        env.showClueReveal(outcome.reveal);
      }
    };

    const unsubSelect = internalMachine.bus.on('stone:select', ({ target }) => {
      sceneRef.current?.environment.setActiveStone(target.targetId);
    });

    const unsubPet = internalMachine.bus.on('pet:state', ({ state }) => {
      sceneRef.current?.environment.setPetState(state);
    });

    const unsubResult = internalMachine.bus.on('stone:result', ({ targetId, response, effect }) => {
      const snap = internalMachine.getSnapshot();
      const solved = Object.values(snap.progressByTarget)
        .filter((p) => p.passed)
        .map((p) => p.targetId);
      setSolvedStoneIds(solved);
      sceneRef.current?.environment.setSolvedStones(solved);
      handleSpeechEffect(targetId, effect ?? response.effect);
    });

    const unsubState = internalMachine.bus.on('state:change', ({ next }) => {
      if (next === 'idle') {
        sceneRef.current?.environment.setActiveStone(null);
      }
    });

    return () => {
      unsubSelect();
      unsubPet();
      unsubResult();
      unsubState();
      sceneRef.current = null;
      mounted?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, initialTaggedCount, initialNetOwner, internalMachine]);

  // Keep Golden Challenge orb synced when `slot` prop changes
  useEffect(() => {
    sceneRef.current?.environment.syncGoldenSlot(slot);
  }, [slot]);

  // If a timed dodge/snatch window or question opens while a stone is open, dismiss the stone HUD
  useEffect(() => {
    if (
      !survivalStonesOpen({
        now: Date.now(),
        questionOpen,
        dodgeUntil,
        snatchUntil,
      })
    ) {
      internalMachine.dismissToIdle();
    }
  }, [questionOpen, dodgeUntil, snatchUntil, internalMachine]);

  const handleSelectZone = (zoneId: SurvivalZoneId) => {
    setActiveZone(zoneId);
    sceneRef.current?.environment.focusZone(zoneId);
  };

  const handleToggleGate = () => {
    const next = !gateOpen;
    setGateOpen(next);
    sceneRef.current?.environment.mainWoodenPen.setGateOpen(next);
  };

  const handleChangeTaggedCount = (next: number) => {
    const clamped = Math.max(0, Math.min(10, next));
    setTaggedCount(clamped);
    sceneRef.current?.environment.mainWoodenPen.setTaggedCount(clamped);
    sceneRef.current?.environment.mainWoodenPen.pulseCipherClue();
  };

  const handleToggleNetOwner = (next: TagNetOwnerState) => {
    setNetOwner(next);
    sceneRef.current?.environment.tagNet.setOwnerState(next, 3);
  };

  const handleThrowNet = () => {
    const zone = RIVER_SURVIVAL_ZONES.find((z) => z.id === activeZone) ?? RIVER_SURVIVAL_ZONES[1];
    sceneRef.current?.environment.tagNet.throwNet(
      RIVER_SURVIVAL_ZONES[1].netStationPosition,
      zone.penPosition,
    );
  };

  const zoneStones = RIVER_SURVIVAL_CLEARING_STONES.filter((s) => s.zoneId === activeZone);

  return (
    <div
      data-testid="river-survival-stage"
      className={`relative overflow-hidden bg-slate-950 ${className}`}
    >
      <div ref={hostRef} className="h-full w-full" />

      {/* Top Decoder Clue Progress & Revealed Location Banner */}
      <div className="pointer-events-none absolute top-3 right-3 left-3 z-20 flex flex-wrap items-center justify-between gap-2">
        <div
          data-testid="survival-decoder-hud"
          className={`pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/40 bg-slate-950/90 px-3.5 py-2 text-xs text-emerald-100 shadow-lg ${
            tier === 'low' ? '' : 'backdrop-blur-md'
          }`}
        >
          <span className="font-bold text-amber-300">🔍 Thợ Giải Mã (Decoder)</span>
          <span>
            Đá đã giải:{' '}
            <strong data-testid="survival-solved-count">
              {clueProgress.solved}/{RIVER_SURVIVAL_CLEARING_STONES.length}
            </strong>
            {clueProgress.nextAt !== null ? ` (Manh mối kế: ${clueProgress.nextAt} đá)` : ' (Đã mở đủ manh mối!)'}
          </span>
          {revealedClue && (
            <span
              data-testid="survival-clue-reveal-badge"
              className="rounded-lg border border-amber-300/60 bg-amber-500/20 px-2.5 py-0.5 font-bold text-amber-200"
            >
              {revealedClue.clue === 'pen'
                ? `🪵 Đã lộ vị trí Chuồng Gỗ (${revealedClue.zoneId}) @ [${revealedClue.position.join(', ')}]`
                : `🕸️ Đã lộ vị trí Lưới Gắn Thẻ (${revealedClue.zoneId}) @ [${revealedClue.position.join(', ')}]`}
            </span>
          )}
        </div>

        {/* Clearing Stones Quick-Select Bar for the active zone */}
        {showControls && (
          <div
            data-testid="survival-clearing-stones-bar"
            className="pointer-events-auto flex flex-wrap items-center gap-1.5"
          >
            {zoneStones.map((stone) => {
              const isSolved = solvedStoneIds.includes(stone.targetId);
              return (
                <button
                  key={stone.targetId}
                  type="button"
                  data-testid={`survival-stone-btn-${stone.targetId}`}
                  onClick={() => tryOpenClearingStone(stone.targetId, stone.zoneId)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    isSolved
                      ? 'border-emerald-400/60 bg-emerald-950/85 text-emerald-200'
                      : 'border-sky-400/50 bg-slate-900/90 text-sky-100 hover:bg-sky-900/75'
                  }`}
                >
                  🔍 {stone.word} {isSolved ? '✓' : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {gateBlockedNotice && (
        <div
          data-testid="survival-stone-blocked-notice"
          className="pointer-events-none absolute top-16 left-3 z-20 rounded-xl border border-rose-400/50 bg-rose-950/90 px-3 py-1.5 text-xs font-semibold text-rose-200"
        >
          {gateBlockedNotice}
        </div>
      )}

      {showControls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 px-3 text-xs font-bold text-white">
          {/* 3 Distinct Zones selector */}
          <div
            data-testid="river-survival-zone-bar"
            className={`pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/20 bg-slate-950/85 p-1.5 ${
              tier === 'low' ? '' : 'backdrop-blur-sm'
            }`}
          >
            {RIVER_SURVIVAL_ZONES.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => handleSelectZone(z.id)}
                className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                  activeZone === z.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800/90 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {z.nameVi}
              </button>
            ))}
          </div>

          {/* Debug controls for Wooden Pen & Tag Net — ONLY shown when `showDebugControls` is true */}
          {showDebugControls && (
            <div
              data-testid="river-survival-debug-bar"
              className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/20 bg-slate-950/85 p-1.5"
            >
              <button
                type="button"
                data-testid="wooden-pen-gate-btn"
                onClick={handleToggleGate}
                className="rounded-lg border border-amber-400/50 bg-amber-950/80 px-2.5 py-1 text-amber-200 hover:bg-amber-900 cursor-pointer"
              >
                🪵 {gateOpen ? 'Đóng cổng Chuồng Gỗ' : 'Mở cổng Chuồng Gỗ (Giải cứu)'}
              </button>
              <button
                type="button"
                onClick={() => handleChangeTaggedCount((taggedCount + 1) % 7)}
                className="rounded-lg border border-sky-400/50 bg-sky-950/80 px-2.5 py-1 text-sky-200 hover:bg-sky-900 cursor-pointer"
              >
                👥 Đang giữ: {taggedCount} bạn (Giải mật thư)
              </button>
              <button
                type="button"
                data-testid="tag-net-owner-btn"
                onClick={() =>
                  handleToggleNetOwner(netOwner === 'pursuers' ? 'snatched' : 'pursuers')
                }
                className={`rounded-lg border px-2.5 py-1 cursor-pointer ${
                  netOwner === 'snatched'
                    ? 'border-sky-300 bg-sky-500 text-slate-950'
                    : 'border-orange-400/60 bg-orange-950/80 text-orange-200'
                }`}
              >
                🕸️ {netOwner === 'snatched' ? 'Đã Cướp Lưới (Chạy Trốn)' : 'Lưới Đội Săn Tìm'}
              </button>
              <button
                type="button"
                data-testid="tag-net-throw-btn"
                onClick={handleThrowNet}
                className="rounded-lg bg-emerald-400 px-2.5 py-1 text-slate-950 hover:bg-emerald-300 cursor-pointer"
              >
                🎯 Tung Lưới Gắn Thẻ
              </button>
            </div>
          )}
        </div>
      )}

      {/* Shared Phonetic Stones HUD wired with dialogueMode="survival" */}
      <PhoneticStonesHud machine={internalMachine} dialogueMode="survival" />
    </div>
  );
}
