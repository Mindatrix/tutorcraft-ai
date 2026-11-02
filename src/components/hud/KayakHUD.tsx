'use client';

import { useMemo, useState } from 'react';
import { CircleHelp, Eye, LogOut, Maximize, Minimize, Settings, Shield, Snowflake, Sparkles, Trophy, UserRound, Volume2, VolumeX } from 'lucide-react';
import { MAX_MP, SKILLS, SKILL_IDS, type SkillId } from '../../engine';
import { GAME_GUIDES } from '../../config/gameGuides';
import { useSoundSwitches } from '../../client/audio';
import GameHUD, { SkillButton, SteerPad, type HudTool } from './GameHUD';
import SettingsPanel, { SoundRows } from './SettingsPanel';
import type { RenderTier } from '../modes/gfxTier';

// Kayak Rush HUD (WP10 U1/U2 on one game first, 02/11/2026). Toolbar: sound, character, skills,
// how to play, ranking, settings, fullscreen, leave. Left: steering. Right: the three session skills
// (same server call as the buttons under the question). The rage boost (U5) and the minimap /
// coordinate bar (U3) come later.

const SKILL_ICONS: Record<SkillId, typeof Shield> = { shield: Shield, freeze: Snowflake, eye_of_truth: Eye };

export interface KayakHUDProps {
  playerName: string;
  avatar: string;
  levelText: string;
  mp: number;
  combo: number;
  correct: number;
  total: number;
  playerPos: number;
  botPos: number;
  botName: string;
  /** Skills can be cast now (a question is open, no answer pending). */
  canCast: boolean;
  onCast: (id: SkillId) => void;
  onSteer: (x: number) => void;
  quiet: boolean;
  tier: RenderTier;
  onTier: (t: RenderTier) => void;
  onLeave: () => void;
}

export default function KayakHUD(p: KayakHUDProps) {
  const sound = useSoundSwitches();
  const [full, setFull] = useState(false);
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;
  const guide = GAME_GUIDES.kayak_rush;
  const ahead = p.playerPos >= p.botPos;

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
        label: 'Xếp hạng',
        icon: Trophy,
        panel: () => (
          <div className="tc-hud-panel-body">
            {[
              { n: p.playerName, v: p.playerPos, me: true },
              { n: p.botName, v: p.botPos, me: false },
            ]
              .sort((a, b) => b.v - a.v)
              .map((r, i) => (
                <div key={r.n} className="tc-hud-row">
                  <span style={{ fontWeight: r.me ? 800 : 500 }}>
                    {i + 1}. {r.n}
                    {r.me && <small>Bạn</small>}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(Math.min(1, r.v) * 100)}% đường đua</span>
                </div>
              ))}
          </div>
        ),
      },
      { id: 'settings', label: 'Cài đặt', icon: Settings, panel: () => <SettingsPanel tier={p.tier} onTier={p.onTier} canFullscreen={canFullscreen} /> },
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
    [p, sound.music, sound.sfx, full, canFullscreen, guide],
  );

  return (
    <GameHUD
      title={
        <>
          Kayak <b>Rush</b>
          <span style={{ marginLeft: 8, fontWeight: 600, letterSpacing: 0, textTransform: 'none', opacity: 0.8 }}>{ahead ? 'Đang dẫn' : 'Đang đuổi'}</span>
        </>
      }
      tools={tools}
      quiet={p.quiet}
      lite={p.tier !== 'high'}
      move={<SteerPad onSteer={p.onSteer} />}
      skills={SKILL_IDS.map((id, i) => (
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
