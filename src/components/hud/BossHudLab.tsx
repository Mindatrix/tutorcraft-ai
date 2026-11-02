'use client';

import { useEffect, useState } from 'react';
import ModeStage from '../modes/ModeStage';
import { DEMO_BOSS, portalRail, type GameMode, type SkillId } from '../../engine';
import PortalCardRail from './PortalCardRail';
import multiverseRooms from '../../../content/multiverse_rooms.json';

// Scene lab: the HUD on the five boss worlds through the real ModeStage (3D for Multiverse, the
// docked toolbar over the 2D stand-in for the others). Simulated battle, no server.

type BossMode = Exclude<GameMode, 'kayak_rush'>;
const MODES: BossMode[] = ['multiverse_portal', 'summer_camp', 'river_fishing', 'river_survival', 'dino_journey'];

export default function BossHudLab() {
  const [mode, setMode] = useState<BossMode>('multiverse_portal');
  const [b, setB] = useState({ bossHp: 900, hp: 100, mp: 30, combo: 1, answered: 2, correct: 2 });
  const [quiet, setQuiet] = useState(false);
  const [stage, setStage] = useState(1);
  const [log, setLog] = useState('');
  useEffect(() => {
    const id = setInterval(() => setB((x) => ({ ...x, mp: Math.min(100, x.mp + 4), bossHp: x.bossHp <= 100 ? 900 : x.bossHp - 25 })), 1000);
    return () => clearInterval(id);
  }, []);
  const cast = (id: SkillId) => {
    setLog(`dùng ${id}`);
    setB((x) => ({ ...x, mp: Math.max(0, x.mp - 50) }));
  };
  return (
    <div className="absolute inset-0 overflow-auto bg-slate-900 p-3 text-white">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
        <select className="bg-slate-800 px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as BossMode)}>
          {MODES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Câu hỏi đang mở
        </label>
        <button type="button" className="border border-slate-600 px-2 py-0.5" onClick={() => setStage((s) => (s % 6) + 1)}>
          Sang chặng sau ({stage}/6)
        </button>
        <span className="text-slate-400">{log}</span>
      </div>
      <ModeStage
        key={mode}
        mode={mode}
        fallback={<div className="grid h-56 place-items-center rounded-2xl border border-slate-800 bg-slate-950 text-sm text-slate-400">(khung 2D của game: thanh máu tự vẽ ở mép trên)</div>}
        scene={{
          boss: DEMO_BOSS,
          heroName: 'Minh An',
          topic: 'present simple',
          bossHp: b.bossHp,
          bossMax: 1000,
          hp: b.hp,
          hpMax: 100,
          shield: false,
          event: null,
          bossPhase: 1,
          enraged: false,
          qIndex: b.answered,
          qTotal: 20,
          results: [true, true],
          combo: b.combo,
          finished: false,
          outcome: null,
          question: null,
          removed: [],
        }}
        hud={{
          rail: mode === 'multiverse_portal' ? <PortalCardRail cards={portalRail(multiverseRooms, 'mv-05', stage)} /> : undefined,
          standingLabel: 'Tiến độ',
          standing: [
            { name: 'Câu đã trả lời', value: `${b.answered}/20`, me: true },
            { name: 'Boss', value: `${Math.round(b.bossHp / 10)}% còn lại` },
          ],
          playerName: 'Minh An',
          avatar: '🦊',
          levelText: 'Dễ · A1',
          mp: b.mp,
          combo: b.combo,
          correct: b.correct,
          total: 20,
          canCast: true,
          onCast: cast,
          quiet,
          onLeave: () => setLog('rời trận'),
        }}
      />
    </div>
  );
}
