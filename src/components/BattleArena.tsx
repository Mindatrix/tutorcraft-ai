'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Heart, Zap, Shield, Snowflake, Eye, Timer, Volume2, VolumeX, RotateCcw, Trophy, Gift, WifiOff, Users } from 'lucide-react';
import {
  MAX_MP,
  SCENARIOS,
  SKILLS,
  SKILL_IDS,
  THEMES,
  battleReducer,
  buildVariant,
  computeScaling,
  initialBattleState,
  rollGacha,
  scoreBattle,
  themeForQuestion,
  type BattleConfig,
  type BattleScore,
  type BattleState,
  type LootItem,
  type Question,
  type SkillId,
} from '../engine';
import { flushQueue, load, remove, save, studentKey, submitResult } from '../client/storage';
import { initSfx, play, setMuted } from '../client/sfx';

const PETS = ['🐣', '🦊', '🐼', '🐸', '🐙', '🦄', '🐲', '🐧', '🐯', '🦉'];
const SKILL_ICONS: Record<SkillId, typeof Shield> = { shield: Shield, freeze: Snowflake, eye_of_truth: Eye };

export interface Prefs {
  muted: boolean;
  profile: { nickname: string; avatar: string; anonymous: boolean } | null;
  online: boolean;
}

interface Props {
  prefs: Prefs;
  battleId: string;
  topic: string;
  config: BattleConfig;
  questions: Question[];
  variant: number | null;
}

interface Leaderboard {
  leaderboard: { nickname: string; avatar: string; gems: number; accuracy: number }[];
  participants?: number;
  totalDamage?: number;
}

export default function BattleArena({ battleId, topic, config, questions: baseQuestions, variant, prefs }: Props) {
  const questions = useMemo(() => buildVariant(baseQuestions, battleId, variant), [baseQuestions, battleId, variant]);
  const scaling = useMemo(() => computeScaling(config), [config]);
  const ctx = useMemo(() => ({ questions, config, scaling }), [questions, config, scaling]);
  const reducer = useMemo(() => battleReducer(ctx), [ctx]);
  const storageKey = `tc:battle:${battleId}:${variant ?? 0}`;

  const [state, dispatch] = useReducer(reducer, ctx, initialBattleState);
  const restored = useRef(false);
  const submitted = useRef(false);
  const [muted, setMutedState] = useState(prefs.muted);
  const [nickname, setNickname] = useState(() => prefs.profile?.nickname ?? `Hero${Math.floor(1000 + Math.random() * 9000)}`);
  const [avatar, setAvatar] = useState(prefs.profile?.avatar ?? PETS[0]);
  const [anonymous, setAnonymous] = useState(prefs.profile?.anonymous ?? false);
  const [online, setOnline] = useState(prefs.online);
  const [serverScore, setServerScore] = useState<BattleScore | null>(null);
  // 'idle' while in a result phase means the submission is in flight.
  const [syncState, setSyncState] = useState<'idle' | 'saved' | 'queued'>('idle');
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loot, setLoot] = useState<LootItem | null>(null);

  const gamified = config.mode === 'gamified';
  const scenario = SCENARIOS[config.scenario];
  const q = questions[state.idx];
  const theme = themeForQuestion(config.themes, state.idx);

  // Restore saved progress + profile once on mount.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = load<BattleState | null>(storageKey, null);
    if (saved && saved.phase !== 'lobby' && saved.answers.length <= questions.length) {
      dispatch({ type: 'RESTORE', state: saved });
    }
    setMuted(prefs.muted);
    void flushQueue();
    const on = () => {
      setOnline(true);
      void flushQueue();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist progress on every change.
  useEffect(() => {
    if (!restored.current) return;
    if (state.phase === 'playing') save(storageKey, state);
  }, [state, storageKey]);

  // Timer.
  useEffect(() => {
    if (state.phase !== 'playing' || state.selected !== null) return;
    const t = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(t);
  }, [state.phase, state.selected, state.idx]);

  // Advance after showing feedback.
  useEffect(() => {
    if (state.phase !== 'playing' || state.selected === null) return;
    const t = setTimeout(() => dispatch({ type: 'NEXT' }), 1400);
    return () => clearTimeout(t);
  }, [state.phase, state.selected, state.idx]);

  // One sound per event.
  useEffect(() => {
    if (!state.event) return;
    const k = state.event.kind;
    play(k === 'blocked' || k === 'buff' ? 'skill' : k);
  }, [state.event]);

  const playerName = anonymous ? 'Anonymous' : nickname || 'Hero';

  // Submit on finish — server recomputes Gems/EXP.
  useEffect(() => {
    if (state.phase !== 'result' || submitted.current) return;
    submitted.current = true;
    remove(storageKey);
    void submitResult<{ score: BattleScore }>({
      battleId,
      variant,
      nickname: playerName,
      avatar,
      studentKey: studentKey(),
      answers: state.answers,
    }).then(async ({ data, queued }) => {
      if (data?.score) setServerScore(data.score);
      setSyncState(queued ? 'queued' : 'saved');
      if (scenario.showLeaderboard && !queued) {
        const res = await fetch(`/api/battle-result?battleId=${encodeURIComponent(battleId)}`).catch(() => null);
        if (res?.ok) setBoard(await res.json());
      }
    });
  }, [state.phase, state.answers, storageKey, battleId, variant, playerName, avatar, scenario.showLeaderboard]);

  const start = useCallback(() => {
    initSfx(muted); // unlocks audio on a user gesture so SFX play instantly
    save('tc:profile', { nickname, avatar, anonymous });
    dispatch({ type: 'START' });
  }, [muted, nickname, avatar, anonymous]);

  const restart = () => {
    remove(storageKey);
    submitted.current = false;
    setServerScore(null);
    setSyncState('idle');
    setBoard(null);
    setLoot(null);
    dispatch({ type: 'RESET' });
  };

  const toggleMute = () => {
    const m = !muted;
    setMutedState(m);
    setMuted(m);
    save('tc:muted', m);
  };

  const openChest = () => {
    const item = rollGacha(Math.random());
    setLoot(item);
    const inv = load<string[]>('tc:inventory', []);
    save('tc:inventory', [...inv, item.id]);
    play('loot');
  };

  const localScore = useMemo(
    () => (state.phase === 'result' ? scoreBattle(questions, state.answers, config) : null),
    [state.phase, state.answers, questions, config],
  );
  const score = serverScore ?? localScore;

  // ---------- RENDER ----------
  const shell = gamified ? 'bg-slate-950 text-white' : 'bg-white text-slate-900';
  const card = gamified ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200';
  const muted2 = gamified ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className={`min-h-screen ${shell} px-4 py-5 md:p-8 font-sans`}>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Top bar */}
        <div className={`border rounded-2xl p-3 flex items-center justify-between gap-2 ${card}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">{avatar}</span>
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{playerName}</div>
              <div className={`text-xs truncate ${muted2}`}>
                {topic}
                {variant ? ` · Code ${variant}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!online && (
              <span className="flex items-center gap-1 text-xs text-amber-500 font-semibold">
                <WifiOff className="w-3.5 h-3.5" /> Offline
              </span>
            )}
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Unmute sound' : 'Mute sound'}
              className={`p-2 rounded-xl border ${gamified ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'}`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Lobby */}
        {state.phase === 'lobby' && (
          <div className={`border rounded-2xl p-6 space-y-5 ${card}`}>
            <div>
              <div className={`text-xs font-bold uppercase tracking-wider ${gamified ? 'text-blue-400' : 'text-blue-600'}`}>
                {scenario.name} · {scenario.style}
              </div>
              <h1 className="text-2xl font-extrabold mt-1">{gamified ? `${theme.emoji} ${config.themes.map((t) => THEMES[t].name).join(' × ')}` : 'Academic Test'}</h1>
              <p className={`text-sm mt-1 ${muted2}`}>
                {questions.length} questions · ~{config.durationMinutes} min
                {gamified ? ` · Boss HP ${scaling.bossHp.toLocaleString('en-US')}` : ''}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="nick">Nickname</label>
              <input
                id="nick"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 24))}
                disabled={anonymous}
                className={`w-full rounded-xl px-4 py-3 border focus:outline-none focus:border-blue-500 ${gamified ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'} disabled:opacity-50`}
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                Hide my name on the leaderboard
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Pet avatar</div>
              <div className="flex flex-wrap gap-2">
                {PETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAvatar(p)}
                    aria-label={`Avatar ${p}`}
                    className={`w-11 h-11 text-2xl rounded-xl border ${avatar === p ? 'border-blue-500 ring-2 ring-blue-500' : gamified ? 'border-slate-700' : 'border-slate-300'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={start} className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500">
              {gamified ? '⚔️ Enter Battle' : 'Start Test'}
            </button>
          </div>
        )}

        {/* Playing */}
        {state.phase === 'playing' && q && (
          <>
            {gamified && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Bar
                  label={`👹 ${theme.bossName}`}
                  value={state.bossHp}
                  max={scaling.bossHp}
                  gradient={theme.accent}
                  border="border-red-500/30"
                  labelClass="text-red-400"
                />
                <Bar
                  label={<><Heart className="w-3.5 h-3.5 fill-emerald-400 inline" /> Hero HP{state.shield ? ' 🛡️' : ''}</>}
                  value={state.hp}
                  max={scaling.playerHp}
                  gradient="from-emerald-600 to-teal-400"
                  border="border-emerald-500/30"
                  labelClass="text-emerald-400"
                />
              </div>
            )}

            <div className={`border rounded-2xl p-3 flex items-center justify-between ${card}`}>
              <div className={`flex items-center gap-2 font-bold text-sm ${state.freezeLeft > 0 ? 'text-cyan-400' : state.timeLeft <= 5 ? 'text-rose-500' : 'text-amber-500'}`}>
                {state.freezeLeft > 0 ? <Snowflake className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
                {state.freezeLeft > 0 ? `Frozen ${state.freezeLeft}s · ` : ''}
                {state.timeLeft}s
                <span className={`font-normal ${muted2}`}>· {q.difficulty}</span>
              </div>
              <div className="flex items-center gap-2">
                {q.is_review && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500 font-semibold">Review</span>}
                {gamified && state.combo >= 2 && (
                  <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded-full text-xs font-black">🔥 Combo x{state.combo}</span>
                )}
              </div>
            </div>

            <div className={`border rounded-2xl p-5 space-y-5 ${card}`}>
              <div className={`text-xs font-bold uppercase tracking-wider ${gamified ? 'text-blue-400' : 'text-blue-600'}`}>
                {gamified ? 'Round' : 'Question'} {state.idx + 1} / {questions.length}
              </div>
              <h2 className="text-lg md:text-xl font-extrabold leading-snug">{q.question}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.options.map((opt, i) => {
                  const hidden = state.removed.includes(i);
                  let cls = gamified
                    ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-blue-500 hover:bg-blue-600/10'
                    : 'bg-white border-slate-300 text-slate-800 hover:border-blue-500';
                  if (state.selected !== null) {
                    if (i === q.correct_idx) cls = 'bg-emerald-500/20 border-emerald-500 text-emerald-600 ring-2 ring-emerald-500';
                    else if (i === state.selected) cls = 'bg-rose-500/20 border-rose-500 text-rose-500';
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => dispatch({ type: 'ANSWER', idx: i })}
                      disabled={state.selected !== null || hidden}
                      className={`p-4 rounded-xl border text-left font-semibold text-sm transition-all ${cls} ${hidden ? 'opacity-20 line-through' : ''}`}
                    >
                      <span className={`mr-2 ${muted2}`}>{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {state.selected !== null && q.explanation && (
                <p className={`text-xs ${muted2}`}>💡 {q.explanation}</p>
              )}
              {gamified && state.selected === null && q.hint && state.miracle && (
                <p className="text-xs text-amber-400">🐾 {q.hint}</p>
              )}
            </div>

            {gamified && (
              <div className={`border rounded-2xl p-3 space-y-3 ${card}`}>
                <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                  <Zap className="w-3.5 h-3.5" /> MP {state.mp} / {MAX_MP}
                  <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-gradient-to-r from-sky-500 to-indigo-400 transition-all" style={{ width: `${(state.mp / MAX_MP) * 100}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SKILL_IDS.map((id) => {
                    const sk = SKILLS[id];
                    const Icon = SKILL_ICONS[id];
                    const disabled = state.mp < sk.cost || state.selected !== null;
                    return (
                      <button
                        key={id}
                        onClick={() => dispatch({ type: 'CAST', skill: id })}
                        disabled={disabled}
                        title={sk.description}
                        className="p-2 rounded-xl border border-slate-700 text-xs font-bold flex flex-col items-center gap-1 hover:bg-slate-800 disabled:opacity-35"
                      >
                        <Icon className="w-4 h-4" />
                        <span className="leading-tight text-center">{sk.nameVi}</span>
                        <span className="text-sky-400">{sk.cost} MP</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {state.feedback && (
              <div
                role="status"
                className={`p-3 rounded-xl border text-center font-bold text-sm ${
                  state.feedback.tone === 'wrong'
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-500'
                    : state.feedback.tone === 'critical'
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500'
                      : 'bg-blue-600/15 border-blue-500/40 text-blue-500'
                }`}
              >
                {state.feedback.text}
              </div>
            )}
          </>
        )}

        {/* Result */}
        {state.phase === 'result' && score && (
          <div className={`border rounded-3xl p-6 text-center space-y-5 ${card}`}>
            <div className="text-5xl">{!gamified ? '📋' : state.outcome === 'defeat' ? '💀' : score.bossDefeated ? '🏆' : '⚔️'}</div>
            <h1 className="text-2xl md:text-3xl font-black">
              {!gamified ? 'Test Complete' : state.outcome === 'defeat' ? 'DEFEATED!' : score.bossDefeated ? 'BOSS DEFEATED!' : 'Battle Complete!'}
            </h1>
            <p className={`text-sm ${muted2}`}>
              {score.correct} / {questions.length} correct · {Math.round(score.accuracy * 100)}% accuracy
              {gamified ? ` · Best combo x${score.maxCombo}` : ''}
            </p>

            {gamified && (
              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                <Stat label="Gems" value={`+${score.gems}`} className="text-amber-400" />
                <Stat label="EXP" value={`+${score.exp}`} className="text-blue-400" />
                {score.milestoneMultiplier > 1 && (
                  <div className="col-span-2 text-xs font-bold text-emerald-400">🎯 Expected Score reached — x{score.milestoneMultiplier} multiplier!</div>
                )}
              </div>
            )}

            <div className={`text-xs ${muted2}`}>
              {syncState === 'idle' && 'Saving result…'}
              {syncState === 'saved' && (serverScore ? '✅ Result verified by server' : '✅ Saved')}
              {syncState === 'queued' && '📴 Offline — result will sync automatically when you reconnect'}
            </div>

            {gamified && score.bossDefeated && (
              <div className="space-y-2">
                {!loot ? (
                  <button onClick={openChest} className="px-5 py-3 rounded-xl font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 inline-flex items-center gap-2">
                    <Gift className="w-5 h-5" /> Open Gacha Chest
                  </button>
                ) : (
                  <div className="text-sm font-bold">
                    Loot Dropped! {loot.emoji} {loot.name} <span className={`uppercase text-xs ${muted2}`}>({loot.rarity})</span>
                  </div>
                )}
              </div>
            )}

            {board && config.scenario === 'coop_raid' && board.totalDamage != null && (
              <div className="text-sm space-y-1">
                <div className="font-bold flex items-center justify-center gap-1"><Users className="w-4 h-4" /> Raid progress ({board.participants} heroes)</div>
                <Bar label="Shared Boss HP" value={Math.max(0, scaling.bossHp - board.totalDamage)} max={scaling.bossHp} gradient={theme.accent} border="border-red-500/30" labelClass="text-red-400" />
              </div>
            )}

            {board && board.leaderboard.length > 0 && (
              <div className="text-left max-w-sm mx-auto">
                <div className="font-bold text-sm mb-2 flex items-center gap-1"><Trophy className="w-4 h-4 text-amber-400" /> Leaderboard</div>
                <ol className="space-y-1">
                  {board.leaderboard.map((r, i) => (
                    <li key={i} className={`flex items-center justify-between text-sm rounded-lg px-3 py-1.5 ${gamified ? 'bg-slate-950' : 'bg-white'}`}>
                      <span>{i + 1}. {r.avatar} {r.nickname}</span>
                      <span className="font-mono text-amber-500">{r.gems} 💎</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {(scenario.allowRetry || battleId === 'demo') && (
              <button onClick={restart} className="w-full max-w-sm mx-auto py-3 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 flex items-center justify-center gap-2">
                <RotateCcw className="w-5 h-5" /> Play Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value, max, gradient, border, labelClass }: { label: React.ReactNode; value: number; max: number; gradient: string; border: string; labelClass: string }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`bg-slate-900 border ${border} rounded-2xl p-3 space-y-2`}>
      <div className="flex justify-between items-center text-xs font-bold gap-2">
        <span className={`${labelClass} truncate`}>{label}</span>
        <span className="text-slate-400 shrink-0">{Math.round(value).toLocaleString('en-US')} / {max.toLocaleString('en-US')}</span>
      </div>
      <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
        <div className={`bg-gradient-to-r ${gradient} h-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
      <div className="text-xs text-slate-500 font-bold uppercase">{label}</div>
      <div className={`text-xl font-black ${className}`}>{value}</div>
    </div>
  );
}
