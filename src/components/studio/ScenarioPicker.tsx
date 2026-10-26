'use client';

import { useEffect, useState } from 'react';
import { GAME_MODES, type GameMode } from '../../engine';

interface ScenarioRow {
  id: string;
  seq: number;
  title: string;
  story: string;
  stages: number;
  subtitleStages: number;
}

/** Studio: the story scenario inside the chosen world (5 per game). Drives stages and subtitles. */
export default function ScenarioPicker({ game, value, onChange }: { game: GameMode | null; value: string | undefined; onChange: (id: string | undefined) => void }) {
  const [rows, setRows] = useState<{ game: GameMode; list: ScenarioRow[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    fetch(`/api/scenarios?game=${game}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { scenarios?: ScenarioRow[] }) => {
        if (cancelled) return;
        const list = d.scenarios ?? [];
        setRows({ game, list });
        setFailed(false);
        // A new world starts on its first chapter; a key from another world is dropped.
        if (!list.some((s) => s.id === value)) onChange(list[0]?.id);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the world changes
  }, [game]);

  if (!game) return null;
  const list = rows?.game === game ? rows.list : [];
  return (
    <div className="mt-6">
      <div className="text-sm font-bold">Kịch bản trong {GAME_MODES[game].nameVi}</div>
      <p className="text-xs text-slate-400">Mỗi kịch bản có 6 chặng chính × 5 phút, nhân vật và phụ đề riêng.</p>
      {failed && <p className="mt-2 text-xs text-amber-400">Chưa tải được danh sách kịch bản — trận vẫn chơi được, chỉ không có cốt truyện và phụ đề.</p>}
      {!failed && !list.length && <p className="mt-2 text-xs text-slate-500">Đang tải kịch bản…</p>}
      <div role="radiogroup" aria-label="Kịch bản" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => {
          const on = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(s.id)}
              className={`min-h-11 border-2 px-3 py-2 text-left transition ${on ? 'border-amber-300 bg-amber-300/10' : 'border-slate-700 hover:border-slate-500'}`}
            >
              <div className="flex items-center gap-2 text-sm font-extrabold leading-tight">
                <span className="text-slate-400">{s.seq}.</span> {s.title}
                {s.subtitleStages > 0 && <span className="ml-auto shrink-0 bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">Phụ đề 6 mức</span>}
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-slate-400">{s.story}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
