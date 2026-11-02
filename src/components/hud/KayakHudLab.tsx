'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import KayakHUD from './KayakHUD';
import { BRIGHTNESS_FILTER, useHudSettings } from '../../client/hudSettings';
import { initAudio, setSoundPlace, stopSound } from '../../client/audio';
import { initSfx } from '../../client/sfx';
import { StageFrame } from '../modes/ModeStage';
import { readTier, saveTier, type RenderTier } from '../modes/gfxTier';
import type { SkillId } from '../../engine';

const KayakRush = dynamic(() => import('../modes/KayakRush'), { ssr: false });

// Scene lab: the Kayak HUD on the real Kayak scene with a simulated race (no server, no database).
// The boat advances by itself; MP grows; skills spend MP; "question open" can be toggled.

export default function KayakHudLab() {
  const [tier, setTier] = useState<RenderTier>(() => readTier());
  const [race, setRace] = useState({ player: 0.05, bot: 0.04, correct: 1, mp: 30, combo: 1 });
  const [quiet, setQuiet] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const steer = useRef(0);
  const hud = useHudSettings();
  useEffect(() => {
    const id = setInterval(
      () =>
        setRace((r) => ({
          player: r.player >= 1 ? 0.05 : r.player + 0.012,
          bot: r.bot >= 1 ? 0.04 : r.bot + 0.011,
          correct: Math.min(12, r.correct + (Math.random() < 0.2 ? 1 : 0)),
          mp: Math.min(100, r.mp + 4),
          combo: Math.random() < 0.8 ? r.combo + 1 : 0,
        })),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  useEffect(() => () => stopSound(), []);
  const cast = (id: SkillId) => {
    setLog((l) => [`dùng ${id}`, ...l].slice(0, 3));
    setRace((r) => ({ ...r, mp: Math.max(0, r.mp - (id === 'shield' ? 50 : id === 'freeze' ? 40 : 60)) }));
  };
  return (
    <div className="absolute inset-0 overflow-auto bg-slate-900 p-3 text-white">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className="bg-amber-400 px-3 py-1 font-bold text-slate-900"
          onClick={() => {
            initSfx(false);
            initAudio();
            setSoundPlace('kayak_rush', { lowPower: tier !== 'high' });
          }}
        >
          Bật âm
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Câu hỏi đang mở
        </label>
        <span className="text-slate-400">{log.join(' · ')}</span>
      </div>
      <StageFrame tone="#5eead4" className="h-80 sm:h-[min(26rem,calc(100dvh-1rem))]">
        <div className="absolute inset-0" style={hud.brightness === 3 ? undefined : { filter: `brightness(${BRIGHTNESS_FILTER[hud.brightness]})` }}>
          <KayakRush key={tier} playerPos={race.player} botPos={race.bot} heroName="Minh An" botName="Bot Dễ" event={null} finished={false} result={null} tier={tier === 'low' ? 'low' : 'high'} steer={steer} hideRank />
        </div>
        <KayakHUD
          playerName="Minh An"
          avatar="🦊"
          levelText="Dễ · A1"
          mp={race.mp}
          combo={race.combo}
          correct={race.correct}
          total={20}
          playerPos={race.player}
          botPos={race.bot}
          botName="Bot Dễ"
          canCast
          onCast={cast}
          onSteer={(x) => (steer.current = x)}
          quiet={quiet}
          tier={tier}
          onTier={(t) => {
            saveTier(t);
            setTier(t);
          }}
          onLeave={() => setLog((l) => ['rời trận', ...l].slice(0, 3))}
        />
      </StageFrame>
      <p className="mt-2 text-xs text-slate-400">Giả lập: thuyền tự tiến, MP tăng 4 mỗi giây. Phím A/D hoặc ←/→ để lái, 1/2/3 cho kỹ năng.</p>
    </div>
  );
}
