'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { CircleHelp, Eye, LogOut, Map as MapIcon, Maximize, Minimize, Settings, Shield, Snowflake, Sparkles, Trophy, UserRound, Volume2, VolumeX } from 'lucide-react';
import { GAME_MODES, MAX_MP, SKILLS, SKILL_IDS, type GameMode, type SkillId } from '../../engine';
import { GAME_GUIDES } from '../../config/gameGuides';
import { useSoundSwitches } from '../../client/audio';
import { setHudSettings, useHudSettings } from '../../client/hudSettings';
import GameHUD, { SkillButton, type HudTool } from './GameHUD';
import SettingsPanel, { SoundRows } from './SettingsPanel';
import type { RenderTier } from '../modes/gfxTier';

// HUD of a game in the arena (WP10, 02/11/2026; Kayak first, then every game). Toolbar: sound,
// character, skills, how to play, ranking / progress, settings, fullscreen, leave. Left: the game's
// movement control when it has one (Kayak: steering). Right: the three session skills (same server
// call as the buttons under the question). `docked`: a 2D world draws its own bars at the top, so
// the toolbar sits above it instead of over it, and the skills stay under the question.
// Minimap / coordinate bar (U3) and the Kayak rage boost (U5) come later.

const SKILL_ICONS: Record<SkillId, typeof Shield> = { shield: Shield, freeze: Snowflake, eye_of_truth: Eye };

/** Kayak ranking rows: share of the course, leader first. */
export function raceStanding(me: string, mine: number, bot: string, theirs: number): ArenaHUDProps['standing'] {
  const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 100)}% đường đua`;
  const mineRow = { name: me, value: pct(mine), me: true };
  const botRow = { name: bot, value: pct(theirs) };
  return mine >= theirs ? [mineRow, botRow] : [botRow, mineRow];
}

export interface ArenaHUDProps {
  game: GameMode;
  /** Short status next to the game name ("Đang dẫn"). */
  status?: string;
  /** Ranking (Kayak) or progress (boss worlds) rows, already sorted. */
  standing: { name: string; value: string; me?: boolean }[];
  standingLabel?: string;
  /** Movement control for the left corner (none: the world has no movement yet). */
  move?: ReactNode;
  /** Minimap and coordinate bar (U3: the five worlds with terrain; not Multiverse). */
  minimap?: ReactNode;
  coordBar?: ReactNode;
  /** Multiverse: the rail of next spaces. */
  rail?: ReactNode;
  docked?: boolean;
  playerName: string;
  avatar: string;
  levelText: string;
  mp: number;
  combo: number;
  correct: number;
  total: number;
  /** Skills can be cast now (a question is open, no answer pending). */
  canCast: boolean;
  onCast: (id: SkillId) => void;
  quiet: boolean;
  tier: RenderTier;
  onTier: (t: RenderTier) => void;
  onLeave: () => void;
}

export default function ArenaHUD(p: ArenaHUDProps) {
  const sound = useSoundSwitches();
  const hs = useHudSettings();
  const [full, setFull] = useState(false);
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const guide = GAME_GUIDES[p.game] ?? GAME_GUIDES.kayak_rush;
  const def = GAME_MODES[p.game];

  const tools: HudTool[] = useMemo(
    () => [
      { id: 'sound', label: 'Âm thanh', icon: sound.music || sound.sfx ? Volume2 : VolumeX, panel: () => <div className="tc-hud-panel-body"><SoundRows /></div> },
      {
        id: 'me',
        label: 'Nhân vật',
        icon: UserRound,
        panel: () => (
          <div className="tc-hud-panel-body">
            <p style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>
              <span aria-hidden style={{ marginRight: 8 }}>{p.avatar}</span>
              {p.playerName}
            </p>
            <div className="tc-hud-stat">
              <div><b>{p.levelText}</b><span>Cấp độ bài</span></div>
              <div><b>{p.correct}/{p.total}</b><span>Câu đúng</span></div>
              <div><b>{p.combo}</b><span>Chuỗi đúng</span></div>
              <div><b>{p.mp}/{MAX_MP}</b><span>MP cho kỹ năng</span></div>
            </div>
          </div>
        ),
      },
      {
        id: 'skills',
        label: 'Kỹ năng',
        icon: Sparkles,
        panel: () => (
          <div className="tc-hud-panel-body">
            {SKILL_IDS.map((id, i) => (
              <div key={id} className="tc-hud-row">
                <span>
                  {SKILLS[id].nameVi}
                  <small>Phím {i + 1} · {SKILLS[id].cost} MP</small>
                </span>
                <span>{guide.skills[i] ?? SKILLS[id].description}</span>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: 'guide',
        label: 'Cách chơi',
        icon: CircleHelp,
        panel: () => (
          <div className="tc-hud-panel-body">
            <h3>Mục tiêu</h3>
            <p style={{ margin: 0 }}>{guide.goal}</p>
            <h3>Điều khiển</h3>
            <ul>{guide.controls.map((c) => <li key={c}>{c}</li>)}</ul>
            <h3>Kỹ năng</h3>
            <ul>{guide.skills.map((c) => <li key={c}>{c}</li>)}</ul>
            <h3>Mẹo</h3>
            <ul>{guide.tips.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        ),
      },
      {
        id: 'rank',
        label: p.standingLabel ?? 'Xếp hạng',
        icon: Trophy,
        panel: () => (
          <div className="tc-hud-panel-body">
            {p.standing.map((r, i) => (
              <div key={r.name} className="tc-hud-row">
                <span style={{ fontWeight: r.me ? 800 : 500 }}>
                  {p.standingLabel ? r.name : `${i + 1}. ${r.name}`}
                  {r.me && <small>Bạn</small>}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
              </div>
            ))}
          </div>
        ),
      },
      {
        id: 'map',
        label: hs.minimap === 'right' ? 'Bản đồ nhỏ: chuyển sang trái' : 'Bản đồ nhỏ: chuyển sang phải',
        icon: MapIcon,
        hidden: !p.minimap,
        pressed: hs.minimap !== 'off',
        // One press moves it to the other top corner (and shows it again if it was turned off).
        onClick: () => setHudSettings({ minimap: hs.minimap === 'left' ? 'right' : 'left' }),
      },
      { id: 'settings', label: 'Cài đặt', icon: Settings, panel: () => <SettingsPanel tier={p.tier} onTier={p.onTier} canFullscreen={canFullscreen} hasMap={!!p.minimap} /> },
      {
        id: 'full',
        label: full ? 'Thoát toàn màn hình' : 'Toàn màn hình',
        icon: full ? Minimize : Maximize,
        hidden: !canFullscreen,
        pressed: full,
        onClick: () => {
          const done = () => setFull(!!document.fullscreenElement);
          if (document.fullscreenElement) void document.exitFullscreen().then(done, done);
          else void document.documentElement.requestFullscreen().then(done, done);
        },
      },
      {
        id: 'leave',
        label: 'Rời trận',
        icon: LogOut,
        panel: () => (
          <div className="tc-hud-panel-body">
            <p style={{ marginTop: 0 }}>Rời trận bây giờ? Kết quả đến lúc này vẫn được giữ, em có thể vào lại bằng mã trận.</p>
            <button type="button" className="tc-hud-ghost tc-hud-danger" onClick={p.onLeave}>
              Rời trận
            </button>
          </div>
        ),
      },
    ],
    [p, sound.music, sound.sfx, full, canFullscreen, guide, hs.minimap],
  );
  // Vietnamese name, last word in the accent colour ("Sinh Tồn Sông <b>Nước</b>").
  const words = (def?.nameVi ?? 'TutorCraft').split(' ');
  const word = words.slice(0, -1).join(' ');
  const rest = words.slice(-1);

  return (
    <GameHUD
      title={
        <>
          {word} <b>{rest.join(' ')}</b>
          {p.status && <span style={{ marginLeft: 8, fontWeight: 600, letterSpacing: 0, textTransform: 'none', opacity: 0.8 }}>{p.status}</span>}
        </>
      }
      tools={tools}
      quiet={p.quiet}
      lite={p.tier !== 'high'}
      docked={p.docked}
      move={p.move}
      minimap={p.minimap}
      coordBar={p.coordBar}
      rail={p.rail}
      skills={p.docked ? undefined : SKILL_IDS.map((id, i) => (
        <SkillButton
          key={id}
          icon={SKILL_ICONS[id]}
          label={SKILLS[id].nameVi}
          sub={`${SKILLS[id].cost} MP`}
          hotkey={String(i + 1)}
          fill={p.mp / SKILLS[id].cost}
          disabled={!p.canCast || p.mp < SKILLS[id].cost}
          onClick={() => p.onCast(id)}
        />
      ))}
    />
  );
}
