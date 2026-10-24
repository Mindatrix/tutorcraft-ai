'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { GAME_MODES, type GameMode } from '../../engine';
import { BEVEL_CLIP, canUseWebGL } from './gfx';
import type { BossSceneProps, SceneEvent } from './types';

// Renderer ladder for boss-battle worlds: Three.js scene → 2D canvas.
// (Unity WebGL exists only for Kayak Rush; see BattleArena.)
// Falls back when WebGL is missing, the context dies, or FPS < 30 for 5 s.

type BossMode = Exclude<GameMode, 'kayak_rush'>;

function Loading() {
  return <div className="absolute inset-0 grid place-items-center text-xs font-bold tracking-wide text-slate-300">Đang dựng thế giới…</div>;
}

const SCENES: Record<BossMode, ComponentType<BossSceneProps>> = {
  multiverse_portal: dynamic(() => import('./MultiversePortalRPG'), { ssr: false, loading: Loading }),
  cosmic_card: dynamic(() => import('./CosmicCardBattler'), { ssr: false, loading: Loading }),
  dino_island: dynamic(() => import('./DinoRun2D'), { ssr: false, loading: Loading }),
  ai_agent_world: dynamic(() => import('./AIAgentWorld'), { ssr: false, loading: Loading }),
};

const LITE_KEY = 'tc:gfx-lite';

function startIn3d(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.sessionStorage.getItem(LITE_KEY) === '1') return false;
  } catch {
    /* storage blocked: decide from WebGL alone */
  }
  return canUseWebGL();
}

/** Bevelled "game screen" frame (no rounded rectangles). */
export const BEVEL: CSSProperties = { clipPath: BEVEL_CLIP };

export function StageFrame({ children, tone = '#fcd34d', className = 'h-64 sm:h-80' }: { children: ReactNode; tone?: string; className?: string }) {
  return (
    <div className="relative" style={{ filter: 'drop-shadow(5px 5px 0 rgb(0 0 0 / .55))' }}>
      <div className="p-[3px]" style={{ ...BEVEL, background: tone }}>
        <div className={`relative w-full overflow-hidden bg-slate-950 ${className}`} style={BEVEL}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, max, tone, align }: { label: string; value: number; max: number; tone: string; align: 'left' | 'right' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`w-[42%] max-w-[220px] ${align === 'right' ? 'text-right' : ''}`}>
      <div className="text-[10px] font-extrabold uppercase tracking-wider text-white drop-shadow">{label} · {Math.max(0, Math.round(value)).toLocaleString('en-US')}</div>
      <div className="mt-0.5 h-2.5 skew-x-[-18deg] bg-black/60 ring-1 ring-white/25">
        <div className={`tc-stripes h-full transition-[width] duration-500 ${align === 'right' ? 'ml-auto' : ''}`} style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

function Pop({ event }: { event: SceneEvent }) {
  if (!event) return null;
  const k = event.kind;
  const amt = event.amount ? Math.round(event.amount) : 0;
  const map: Partial<Record<typeof k, { text: string; cls: string; side: 'boss' | 'hero' | 'mid' }>> = {
    correct: { text: amt ? `-${amt}` : 'Trúng!', cls: 'text-amber-300 text-2xl', side: 'boss' },
    critical: { text: `CRITICAL${amt ? ` -${amt}` : '!'}`, cls: 'text-yellow-300 text-3xl', side: 'boss' },
    ultimate: { text: `TUYỆT KỸ${amt ? ` -${amt}` : ''}`, cls: 'text-fuchsia-300 text-3xl', side: 'boss' },
    wrong: { text: 'Ối!', cls: 'text-rose-400 text-2xl', side: 'hero' },
    miss: { text: 'Hết giờ', cls: 'text-rose-300 text-xl', side: 'hero' },
    blocked: { text: '🛡️ Chặn', cls: 'text-sky-300 text-xl', side: 'hero' },
    skill: { text: '✨ Kỹ năng', cls: 'text-sky-300 text-xl', side: 'mid' },
    buff: { text: '✨ Hồi phép', cls: 'text-emerald-300 text-xl', side: 'mid' },
    victory: { text: 'CHIẾN THẮNG!', cls: 'text-yellow-300 text-3xl', side: 'mid' },
    defeat: { text: 'Thử lại nhé!', cls: 'text-slate-200 text-2xl', side: 'mid' },
  };
  const m = map[k];
  if (!m) return null;
  const pos = m.side === 'boss' ? 'right-[18%] top-[30%]' : m.side === 'hero' ? 'left-[16%] top-[42%]' : 'inset-x-0 top-[38%] text-center';
  return (
    <span key={event.n} aria-hidden className={`tc-pop pointer-events-none absolute z-10 font-black italic tracking-tight drop-shadow-[3px_3px_0_rgb(0_0_0/.7)] ${pos} ${m.cls}`}>
      {m.text}
    </span>
  );
}

export default function ModeStage({ mode, scene, fallback }: { mode: BossMode; scene: Omit<BossSceneProps, 'onUnavailable'>; fallback: ReactNode }) {
  const [three, setThree] = useState(startIn3d);
  const def = GAME_MODES[mode];
  const lite = useCallback(() => {
    try {
      window.sessionStorage.setItem(LITE_KEY, '1');
    } catch {
      /* ignore */
    }
    setThree(false);
  }, []);
  const retry3d = () => {
    try {
      window.sessionStorage.removeItem(LITE_KEY);
    } catch {
      /* ignore */
    }
    setThree(canUseWebGL());
  };

  if (!three) {
    return (
      <div className="space-y-1">
        {fallback}
        <p className="flex items-center justify-end gap-2 text-[11px] text-slate-400">
          {def.icon} {def.nameVi} · chế độ nhẹ 2D cho máy này
          <button type="button" onClick={retry3d} className="font-bold text-amber-300 underline underline-offset-2">Thử 3D</button>
        </p>
      </div>
    );
  }

  const Scene = SCENES[mode];
  return (
    <StageFrame className={mode === 'dino_island' ? 'h-60 sm:h-80' : 'h-64 sm:h-80'}>
      <Scene {...scene} onUnavailable={lite} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-6 pt-3">
        <Bar label={def.hud.hero} value={scene.hp} max={scene.hpMax} tone="linear-gradient(90deg,#34d399,#10b981)" align="left" />
        <Bar label={def.hud.boss} value={scene.bossHp} max={scene.bossMax} tone="linear-gradient(90deg,#fb7185,#f59e0b)" align="right" />
      </div>
      <span className="pointer-events-none absolute bottom-2 right-6 z-10 bg-black/55 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-amber-200">
        {def.icon} {def.name}
      </span>
      <Pop event={scene.event} />
    </StageFrame>
  );
}
