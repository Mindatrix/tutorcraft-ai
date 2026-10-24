'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { GAME_MODES, modesForScenario, type GameMode, type ScenarioId } from '../../engine';
import { BEVEL_CLIP } from '../modes/gfx';

const TONES = ['#fcd34d', '#fb7185', '#c4b5fd', '#6ee7b7', '#7dd3fc'];

function Tile({ active, onClick, tone, title, sub, badge, children }: { active: boolean; onClick?: () => void; tone: string; title: string; sub: string; badge?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={!onClick}
      className={`group flex flex-col self-start text-left transition-transform ${active ? '-translate-y-1' : 'hover:-translate-y-0.5'} disabled:cursor-default`}
    >
      <div style={{ filter: active ? 'drop-shadow(5px 5px 0 rgb(0 0 0 / .6))' : 'none' }}>
        <div className="p-[3px]" style={{ clipPath: BEVEL_CLIP, background: active ? tone : 'rgb(255 255 255 / .14)' }}>
          <div className="relative aspect-[4/3] overflow-hidden bg-slate-900" style={{ clipPath: BEVEL_CLIP }}>
            {children}
            {badge && <span className="absolute left-4 top-2 bg-black/65 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-white">{badge}</span>}
            {active && <span className="absolute bottom-2 right-3 grid h-6 w-6 place-items-center rounded-full bg-amber-300 text-xs font-black text-slate-900">✓</span>}
          </div>
        </div>
      </div>
      <div className={`mt-2 text-sm font-extrabold leading-tight ${active ? 'text-amber-200' : ''}`}>{title}</div>
      <div className="text-[11px] leading-snug text-slate-400">{sub}</div>
    </button>
  );
}

/** Studio: pick the 3D game world. Purely visual — grading and Boss HP stay on the server. */
export default function WorldPicker({ scenario, value, onChange }: { scenario: ScenarioId; value: GameMode | null | undefined; onChange: (m: GameMode | null) => void }) {
  const race = scenario === 'boat_race';
  const modes = modesForScenario(scenario);
  return (
    <div className="mt-8">
      <div className="text-sm font-bold">Thế giới 3D</div>
      <p className="text-xs text-slate-400">{race ? 'Đua thuyền luôn chơi trong Kayak Rush 3D.' : 'Chọn nơi học viên chiến đấu. Điện thoại yếu sẽ tự chuyển sang bản 2D nhẹ.'}</p>
      <div role="radiogroup" aria-label="Thế giới 3D" className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {modes.map((id, i) => {
          const m = GAME_MODES[id];
          return (
            <Tile key={id} active={race || value === id} onClick={race ? undefined : () => onChange(id)} tone={TONES[i % TONES.length]} title={`${m.icon} ${m.name}`} sub={m.genre} badge={m.status === 'upgraded' ? 'Nâng cấp' : 'Mới'}>
              <Image src={`/modes/${id}.webp`} alt={`${m.name}: ảnh trong game`} fill sizes="(min-width:1024px) 18vw, (min-width:640px) 30vw, 45vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
            </Tile>
          );
        })}
        {!race && (
          <Tile active={!value} onClick={() => onChange(null)} tone="#e2e8f0" title="⚔️ Cổ điển 2D" sub="Đấu Boss 2D, nhẹ nhất">
            <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_50%_40%,#334155,#0f172a)] text-4xl">⚔️</div>
          </Tile>
        )}
      </div>
    </div>
  );
}
