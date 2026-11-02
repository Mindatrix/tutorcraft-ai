'use client';

import { useEffect, useRef, useState } from 'react';
import type { GfxTier } from '../SceneRuntime';
import {
  mountRiverSurvivalScene,
  type MountedRiverSurvivalScene,
} from './RiverSurvivalScene';
import type { TagNetOwnerState } from './TagNet';
import { RIVER_SURVIVAL_ZONES, type SurvivalZoneId } from './zones';

export interface RiverSurvivalStageProps {
  tier?: GfxTier;
  initialTaggedCount?: number;
  initialNetOwner?: TagNetOwnerState;
  showControls?: boolean;
  className?: string;
}

export default function RiverSurvivalStage({
  tier = 'high',
  initialTaggedCount = 2,
  initialNetOwner = 'pursuers',
  showControls = true,
  className = 'h-[540px] w-full',
}: RiverSurvivalStageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<MountedRiverSurvivalScene | null>(null);

  const [activeZone, setActiveZone] = useState<SurvivalZoneId>('zone_bravo');
  const [gateOpen, setGateOpen] = useState(false);
  const [taggedCount, setTaggedCount] = useState(initialTaggedCount);
  const [netOwner, setNetOwner] = useState<TagNetOwnerState>(initialNetOwner);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let mounted: MountedRiverSurvivalScene | null = null;
    try {
      mounted = mountRiverSurvivalScene(el, {
        tier,
        initialTaggedCount,
        initialNetOwner,
      });
      sceneRef.current = mounted;
    } catch {
      return;
    }

    return () => {
      sceneRef.current = null;
      mounted?.dispose();
    };
  }, [tier, initialTaggedCount, initialNetOwner]);

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

  return (
    <div
      data-testid="river-survival-stage"
      className={`relative overflow-hidden bg-slate-950 ${className}`}
    >
      <div ref={hostRef} className="h-full w-full" />

      {showControls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-wrap items-center justify-between gap-2 px-3 text-xs font-bold text-white">
          {/* 3 Distinct Zones selector */}
          <div
            data-testid="river-survival-zone-bar"
            className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/20 bg-slate-950/85 p-1.5 backdrop-blur-sm"
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

          {/* Wooden Pen (Chuồng Gỗ) & Tag Net (Lưới Gắn Thẻ) interactive controls */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-xl border border-white/20 bg-slate-950/85 p-1.5 backdrop-blur-sm">
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
        </div>
      )}
    </div>
  );
}
