'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Zap, Shield, Snowflake, Eye, Timer, Volume2, VolumeX, RotateCcw, Trophy, Gift, WifiOff, Users, Lock, ScrollText, AlertTriangle, Loader2 } from 'lucide-react';
import {
  FEEDBACK_MS,
  MAX_MP,
  SCENARIOS,
  SKILLS,
  SKILL_IDS,
  TEAM_NAMES,
  THEMES,
  botPlan,
  botPosition,
  botStepTimes,
  computeScaling,
  raceSeed,
  rollGacha,
  themeForQuestion,
  QUESTION_TYPES,
  questionTimeLimit,
  type AnswerReveal,
  type BattleConfig,
  type BattleState,
  type BossProfile,
  type LootItem,
  type PublicQuestion,
  type SkillId,
  type StoryBeat,
  type TeamRace,
} from '../engine';
import { load, remove, save, studentKey } from '../client/storage';
import { initSfx, play, setMuted } from '../client/sfx';
import { ApiError, sessionApi, type ActResponse, type FinalizeResponse, type SessionView } from '../client/sessionApi';
import AnswerPanel, { type AnswerPayload } from './AnswerPanel';
import BattleCanvas from './BattleCanvas';
import dynamic from 'next/dynamic';
import RaceTrack from './RaceTrack';
import Scenery from './scenery/Scenery';

// Three.js is heavy: load it only when a Boat Race actually starts.
const RaceScene3D = dynamic(() => import('./RaceScene3D'), { ssr: false });
const PortalIntro = dynamic(() => import('./PortalIntro'), { ssr: false });
const RaceSceneUnity = dynamic(() => import('./RaceSceneUnity'), { ssr: false });
import { useContentGuard, useWindowFocused, Watermark } from './ContentGuard';

/** Wall clock for event handlers (kept out of render). */
const wallClock = () => Date.now();

const PETS = ['🐣', '🦊', '🐼', '🐸', '🐙', '🦄', '🐲', '🐧', '🐯', '🦉'];
const SKILL_ICONS: Record<SkillId, typeof Shield> = { shield: Shield, freeze: Snowflake, eye_of_truth: Eye };

export interface Prefs {
  muted: boolean;
  profile: { nickname: string; avatar: string; anonymous: boolean } | null;
  online: boolean;
}

/** Public battle info only — the arena never receives the answer key. */
export interface ArenaBattle {
  id: string;
  topic: string;
  config: BattleConfig;
  boss: BossProfile;
  tutorName: string;
  classCode: string;
  totalQuestions: number;
  /** Boss HP weighted by question format (from the server). */
  bossMaxHp?: number;
}

interface Leaderboard {
  leaderboard: { nickname: string; avatar: string; gems: number; accuracy: number }[];
  participants?: number;
  teams?: TeamRace | null;
  totalDamage?: number;
}

interface Feedback {
  state: BattleState;
  reveal: AnswerReveal | null;
  question: PublicQuestion;
}

export default function BattleArena({ battle, variant, prefs }: { battle: ArenaBattle; variant: number | null; prefs: Prefs }) {
  const { config, boss } = battle;
  const baseScaling = useMemo(() => computeScaling(config, battle.totalQuestions), [config, battle.totalQuestions]);
  const tokenKey = `tc:session:${battle.id}:${variant ?? 0}`;
  const gamified = config.mode === 'gamified';
  const scenario = SCENARIOS[config.scenario];
  const isRace = config.scenario === 'boat_race';
  const plan = useMemo(() => botPlan(raceSeed(battle.id, variant, config.level), battle.totalQuestions, config.level), [battle.id, variant, config.level, battle.totalQuestions]);
  // Renderer ladder: Unity WebGL build → Three.js scene → 2D lanes.
  const [renderer, setRenderer] = useState<'unity' | 'three' | '2d'>('unity');
  const noUnity = useCallback(() => setRenderer('three'), []);
  const no3d = useCallback(() => setRenderer('2d'), []);
  const scene3d = renderer !== '2d';
  const [limits, setLimits] = useState<number[]>([]); // per-question time limits seen so far (drives the bot's pace)

  const [phase, setPhase] = useState<'lobby' | 'playing' | 'result'>('lobby');
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  // Boss HP is weighted by format on the server (essay ×3 …); the lobby value comes from /api/battles.
  const bossMaxHp = view?.bossMaxHp ?? battle.bossMaxHp ?? baseScaling.bossHp;
  const scaling = useMemo(() => ({ ...baseScaling, bossHp: bossMaxHp }), [baseScaling, bossMaxHp]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, setPending] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);
  const [retry, setRetry] = useState<{ questionId: number; payload: AnswerPayload } | null>(null);
  const [charge, setCharge] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [clock, setClock] = useState(0);
  const [beats, setBeats] = useState<StoryBeat[]>([]);
  const [final, setFinal] = useState<FinalizeResponse | null>(null);
  const [finalError, setFinalError] = useState<string | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [loot, setLoot] = useState<LootItem | null>(null);
  const [guardToast, setGuardToast] = useState(false);
  const [starting, setStarting] = useState(false);

  const [muted, setMutedState] = useState(prefs.muted);
  const [nickname, setNickname] = useState(() => prefs.profile?.nickname ?? `Hero${Math.floor(1000 + Math.random() * 9000)}`);
  const [avatar, setAvatar] = useState(prefs.profile?.avatar ?? PETS[0]);
  const [anonymous, setAnonymous] = useState(prefs.profile?.anonymous ?? false);
  const [online, setOnline] = useState(prefs.online);
  const [sid] = useState(() => studentKey());

  const focused = useWindowFocused();
  const flashGuard = useCallback(() => {
    setGuardToast(true);
    setTimeout(() => setGuardToast(false), 2000);
  }, []);
  useContentGuard(phase !== 'lobby', flashGuard);

  const display = feedback?.state ?? view?.state ?? null;
  const question = feedback?.question ?? view?.question ?? null;
  const theme = themeForQuestion(config.themes, display?.idx ?? 0);
  const playerName = anonymous ? 'Anonymous' : nickname || 'Hero';
  const timeLeft = Math.max(0, Math.ceil((deadline - clock) / 1000));
  const freezeLeft = Math.max(0, Math.ceil((frozenUntil - clock) / 1000));

  // Boat Race: the bot runs on a local race clock = time already spent answering + time spent on this question.
  const race = useMemo(() => {
    if (!isRace) return null;
    const answers = display?.answers ?? [];
    const spent = answers.reduce((n, a) => n + a.timeMs, 0);
    const live = phase === 'playing' && !feedback && display ? Math.max(0, display.questionTime * 1000 - (deadline - clock)) : 0;
    const elapsed = phase === 'result' ? Number.MAX_SAFE_INTEGER : spent + live;
    const stepMs = botStepTimes(plan, plan.map((_, i) => limits[i] ?? 45));
    const total = Math.max(1, battle.totalQuestions);
    const botDist = botPosition(plan, stepMs, elapsed);
    const playerCorrect = display?.correct ?? 0;
    return { botCorrect: Math.floor(botDist + 1e-9), botPos: botDist / total, playerPos: playerCorrect / total, playerCorrect, total };
  }, [isRace, display, phase, feedback, deadline, clock, plan, limits, battle.totalQuestions]);

  /** Show a new server view and restart the local countdown for its question. */
  const applyView = useCallback((v: SessionView) => {
    setView(v);
    const q = v.question;
    if (q) setLimits((l) => { const n = [...l]; n[q.index] = questionTimeLimit(q, config.level); return n; });
    setCharge(0);
    setAdvance(0);
    const t = Date.now();
    setClock(t);
    setDeadline(t + v.state.questionTime * 1000);
    setFrozenUntil(0);
  }, [config.level]);

  const finish = useCallback(
    async (tok: string) => {
      setPhase('result');
      try {
        const res = await sessionApi.finalize(tok);
        setFinal(res);
        remove(tokenKey);
        if (!res.flagged && scenario.showLeaderboard) {
          const r = await fetch(`/api/battle-result?battleId=${encodeURIComponent(battle.id)}`).catch(() => null);
          if (r?.ok) setBoard(await r.json());
        }
      } catch (e) {
        setFinalError(e instanceof ApiError && e.status === 0 ? 'Mất kết nối — bấm “Nộp lại” khi có mạng.' : (e as Error).message);
      }
    },
    [tokenKey, scenario.showLeaderboard, battle.id],
  );

  // Resume an unfinished session after a reload.
  useEffect(() => {
    setMuted(prefs.muted);
    const saved = load<string | null>(tokenKey, null);
    if (saved) {
      sessionApi
        .current(saved)
        .then(({ view: v }) => {
          if (v.status !== 'active') return remove(tokenKey);
          setToken(saved);
          initSfx(prefs.muted);
          if (v.state.phase === 'playing') {
            applyView(v);
            setPhase('playing');
          } else {
            setView(v);
            void finish(saved);
          }
        })
        .catch(() => remove(tokenKey));
    }
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A response locked the question in: show the server's verdict, then move on. */
  const afterLockIn = useCallback(
    (res: ActResponse, q: PublicQuestion, tok: string) => {
      if (res.afterAnswer) {
        setFeedback({ state: res.afterAnswer, reveal: res.reveal, question: q });
        const newBeats = res.afterAnswer.event?.beats ?? [];
        if (newBeats.length) setBeats((b) => [...newBeats, ...b].slice(0, 4));
      }
      // Written answers get longer to read the AI's feedback before the next question.
      const hold = !res.afterAnswer ? 0 : q.type === 'mcq' ? FEEDBACK_MS : FEEDBACK_MS + 2600;
      setTimeout(() => {
        setFeedback(null);
        applyView(res.view);
        if (res.view.state.phase === 'result') void finish(tok);
      }, hold);
    },
    [applyView, finish],
  );

  const submit = useCallback(
    async (payload: AnswerPayload, questionId?: number) => {
      const q = view?.question;
      if (!token || !q || pending || feedback) return;
      const qid = questionId ?? q.id;
      setPending(true);
      setNetError(null);
      try {
        const res = await sessionApi.answer(token, qid, payload);
        setRetry(null);
        afterLockIn(res, q, token);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
          setRetry({ questionId: qid, payload });
          setNetError('Mất kết nối — câu trả lời chưa được gửi.');
        } else if (e instanceof ApiError && e.status === 409) {
          // Out of sync (e.g. double tap): reload the server's truth.
          const cur = await sessionApi.current(token).catch(() => null);
          if (cur) applyView(cur.view);
        } else {
          setNetError((e as Error).message);
        }
      } finally {
        setPending(false);
      }
    },
    [token, view, pending, feedback, applyView, afterLockIn],
  );

  /** Matching: each pair is checked by the server; only the last one locks the question in. */
  const tryPair = useCallback(
    async (left: number, right: number) => {
      const q = view?.question;
      if (!token || !q || pending || feedback) return;
      setPending(true);
      setNetError(null);
      try {
        const res = await sessionApi.pair(token, q.id, left, right);
        if (res.afterAnswer) afterLockIn(res, q, token);
        else setView(res.view); // keep the timer running
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const cur = await sessionApi.current(token).catch(() => null);
          if (cur) setView(cur.view);
        } else setNetError((e as Error).message);
      } finally {
        setPending(false);
      }
    },
    [token, view, pending, feedback, afterLockIn],
  );

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  // Local countdown display; the server keeps its own clock and has the final say on timeouts.
  useEffect(() => {
    if (phase !== 'playing' || feedback || !view?.question) return;
    const t = setInterval(() => {
      const n = Date.now();
      setClock(n);
      if (n >= deadline && !pending && !retry) void submitRef.current({ chosenIdx: -1 });
    }, 250);
    return () => clearInterval(t);
  }, [phase, feedback, view, deadline, pending, retry]);

  // Auto-retry a lost answer when the connection returns.
  useEffect(() => {
    if (online && retry && !pending) void submitRef.current(retry.payload, retry.questionId);
  }, [online, retry, pending]);

  // One sound per event.
  const lastSfx = useRef<number | null>(null);
  useEffect(() => {
    const ev = display?.event;
    if (!ev || ev.n === lastSfx.current) return;
    lastSfx.current = ev.n;
    play(ev.kind === 'blocked' || ev.kind === 'buff' ? 'skill' : ev.kind === 'ultimate' ? 'critical' : ev.kind === 'miss' ? 'wrong' : ev.kind);
  }, [display?.event]);

  const [portal, setPortal] = useState(false);
  const portalDone = useRef<(() => void) | null>(null);

  const start = async () => {
    initSfx(muted);
    save('tc:profile', { nickname, avatar, anonymous });
    setStarting(true);
    setNetError(null);
    try {
      // Portal intro first, so the server-side question timer starts after it.
      if (gamified) {
        await new Promise<void>((resolve) => { portalDone.current = resolve; setPortal(true); });
        setPortal(false);
      }
      const res = await sessionApi.start({ battleId: battle.id, variant, nickname: playerName, avatar, studentKey: sid });
      save(tokenKey, res.token);
      setToken(res.token);
      setFinal(null);
      setFinalError(null);
      setBoard(null);
      setLoot(null);
      setBeats([]);
      applyView(res.view);
      setPhase('playing');
    } catch (e) {
      setNetError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const cast = async (skill: SkillId) => {
    if (!token || pending || feedback) return;
    setPending(true);
    try {
      const res = await sessionApi.cast(token, skill);
      setView(res.view);
      if (skill === 'freeze') {
        setFrozenUntil(wallClock() + 30_000);
        setDeadline((d) => d + 30_000);
      }
    } catch (e) {
      setNetError((e as Error).message);
    } finally {
      setPending(false);
    }
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
    save('tc:inventory', [...load<string[]>('tc:inventory', []), item.id]);
    play('loot');
  };

  // ---------- RENDER ----------
  const shell = gamified ? 'bg-slate-950 text-white' : 'bg-white text-slate-900';
  const card = gamified ? '!border-0 !border-l-4 !border-amber-300/70 bg-slate-900/85 backdrop-blur' : 'bg-slate-50 border-slate-200';
  const muted2 = gamified ? 'text-slate-400' : 'text-slate-500';
  const spiritBeast = !!display?.quests.find((q) => q.id === 'spirit_beast' && q.status === 'done');
  const score = final?.score ?? null;

  return (
    <div className={`tc-protected relative isolate min-h-screen ${shell} px-4 py-5 md:p-8 font-sans ${phase !== 'lobby' ? 'select-none [-webkit-touch-callout:none]' : ''}`}>
      {gamified && (
        <>
          <Scenery id={config.scenario} className="fixed inset-0 -z-10 h-full w-full opacity-50" />
          <div aria-hidden className="fixed inset-0 -z-10 bg-gradient-to-b from-slate-950/60 via-slate-950/75 to-slate-950/90" />
        </>
      )}
      {portal && <PortalIntro onDone={() => portalDone.current?.()} />}
      {phase !== 'lobby' && <Watermark tutorName={battle.tutorName} classCode={battle.classCode} studentId={sid.slice(0, 8)} dark={gamified} />}
      {guardToast && (
        <div role="status" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-bold flex items-center gap-2 shadow-xl">
          <Lock className="w-4 h-4" /> Nội dung đề thi được bảo vệ bản quyền
        </div>
      )}
      <div className="max-w-3xl mx-auto space-y-4 relative">
        {/* Top bar */}
        <div className={`border rounded-2xl p-3 flex items-center justify-between gap-2 ${card}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl">{avatar}</span>
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{playerName}</div>
              <div className={`text-xs truncate ${muted2}`}>
                {battle.topic}
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
            <button onClick={toggleMute} aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'} className={`p-2 rounded-xl border ${gamified ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'}`}>
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Lobby */}
        {phase === 'lobby' && (
          <div className={`border rounded-2xl p-6 space-y-5 ${card}`}>
            {gamified && (
              <div className="flex items-center gap-4">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-[3px] border-amber-300 shadow-[4px_4px_0_rgb(0_0_0/.5)]"><Scenery id={config.scenario} className="h-full w-full" /></div>
                <span aria-hidden className="text-5xl">{theme.emoji}</span>
              </div>
            )}
            <div>
              <div className={`text-xs font-bold uppercase tracking-wider ${gamified ? 'text-blue-400' : 'text-blue-600'}`}>
                {scenario.name} · {scenario.style}
              </div>
              <h1 className="text-2xl font-extrabold mt-1">{gamified ? `${theme.emoji} ${boss.map_name}` : 'Academic Test'}</h1>
              {gamified && (
                <p className="text-sm font-bold text-rose-400 mt-1">
                  👹 Boss: {boss.boss_name}
                  <span className={`font-normal ${muted2}`}> · {config.themes.map((t) => THEMES[t].name).join(' × ')}</span>
                </p>
              )}
              <p className={`text-sm mt-1 ${muted2}`}>
                {battle.totalQuestions} questions · ~{config.durationMinutes} min
                {gamified ? ` · Boss HP ${scaling.bossHp.toLocaleString('en-US')}` : ''}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold" htmlFor="nick">Nickname</label>
              <input id="nick" value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 24))} disabled={anonymous} className={`w-full rounded-xl px-4 py-3 border focus:outline-none focus:border-blue-500 ${gamified ? 'bg-slate-950 border-slate-700' : 'bg-white border-slate-300'} disabled:opacity-50`} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                Hide my name on the leaderboard
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Pet avatar</div>
              <div className="flex flex-wrap gap-2">
                {PETS.map((p) => (
                  <button key={p} onClick={() => setAvatar(p)} aria-label={`Avatar ${p}`} className={`w-11 h-11 text-2xl rounded-xl border ${avatar === p ? 'border-blue-500 ring-2 ring-blue-500' : gamified ? 'border-slate-700' : 'border-slate-300'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={start} disabled={starting} className="tc-sticker w-full !py-4 !text-lg disabled:opacity-60 disabled:pointer-events-none">
              {starting && <Loader2 className="w-5 h-5 animate-spin" />} {gamified ? '⚔️ Enter Battle' : 'Start Test'}
            </button>
            {netError && <p role="alert" className="text-sm text-rose-400">{netError}</p>}
          </div>
        )}

        {/* Battle scene — stays mounted into the result screen so the boss break + chest drop can play */}
        {isRace && race && renderer === 'unity' && phase !== 'lobby' && display && <RaceSceneUnity playerPos={race.playerPos} botPos={race.botPos} result={final?.race?.result ?? null} onUnavailable={noUnity} />}
        {isRace && race && renderer === 'three' && phase !== 'lobby' && display && <RaceScene3D playerPos={race.playerPos} botPos={race.botPos} onUnavailable={no3d} />}
        {isRace && race && phase !== 'lobby' && display && (
          <RaceTrack compact={scene3d}
            heroAvatar={avatar}
            heroName={playerName}
            playerPos={race.playerPos}
            botPos={race.botPos}
            playerCorrect={race.playerCorrect}
            botCorrect={race.botCorrect}
            total={race.total}
            botName={`Bot Cấp ${config.level ?? 3}`}
            finished={phase === 'result'}
            teamName={view?.team ? TEAM_NAMES[view.team] : null}
            teamTone={view?.team ?? null}
          />
        )}
        {!isRace && gamified && phase !== 'lobby' && display && (
          <BattleCanvas
            boss={boss}
            heroAvatar={avatar}
            heroName={playerName}
            bossHp={display.bossHp}
            bossMax={scaling.bossHp}
            hp={display.hp}
            hpMax={scaling.playerHp}
            shield={display.shield}
            event={display.event}
            bossPhase={display.bossPhase}
            enraged={display.enraged}
            spiritBeast={spiritBeast}
            mpRatio={display.mp / MAX_MP}
            heroAdvance={phase === 'playing' && question?.type === 'reorder' && !feedback ? advance : 0}
            charge={phase === 'playing' && question?.type === 'transform' && !feedback ? charge : 0}
            bossGuard={phase === 'playing' && question?.type === 'reading' && !feedback}
          />
        )}

        {/* Story beats: boss transformation, enrage taunts, quest completions */}
        {gamified && phase === 'playing' && beats.length > 0 && (
          <div className="space-y-1.5" aria-live="polite">
            {beats.slice(0, 2).map((b, i) => (
              <div key={`${b.text}-${i}`} className={`text-sm rounded-xl px-3 py-2 border ${b.kind === 'quest' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : b.kind === 'phase' ? 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200' : 'border-orange-500/40 bg-orange-500/10 text-orange-200'} ${i ? 'opacity-60' : ''}`}>
                {b.text}
              </div>
            ))}
          </div>
        )}

        {/* Playing */}
        {phase === 'playing' && display && question && (
          <>
            <div className={`border rounded-2xl p-3 flex items-center justify-between ${card}`}>
              <div className={`flex items-center gap-2 font-bold text-sm ${freezeLeft > 0 ? 'text-cyan-400' : timeLeft <= 5 ? 'text-rose-500' : 'text-amber-500'}`}>
                {freezeLeft > 0 ? <Snowflake className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
                {freezeLeft > 0 ? `Frozen ${freezeLeft}s · ` : ''}
                {feedback ? '—' : `${Math.min(timeLeft, display.questionTime + 30)}s`}
                <span className={`font-normal ${muted2}`}>· {question.difficulty}</span>
              </div>
              <div className="flex items-center gap-2">
                {question.is_review && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500 font-semibold">Review</span>}
                {gamified && display.bossPhase === 2 && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300 font-bold">Phase 2</span>}
                {gamified && display.combo >= 2 && <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/40 text-purple-300 rounded-full text-xs font-black">🔥 Combo x{display.combo}</span>}
              </div>
            </div>

            <div className={`border rounded-2xl p-5 space-y-5 ${card} transition ${focused ? '' : 'blur-md'}`} onCopy={(e) => e.preventDefault()}>
              <div className={`text-xs font-bold uppercase tracking-wider ${gamified ? 'text-blue-400' : 'text-blue-600'}`}>
                {gamified ? 'Round' : 'Question'} {question.index + 1} / {view?.totalQuestions ?? battle.totalQuestions}
              </div>
              <h2 className="text-lg md:text-xl font-extrabold leading-snug">
                {question.type !== 'mcq' && <span className="mr-2 text-xs align-middle px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300">{QUESTION_TYPES[question.type].icon} {QUESTION_TYPES[question.type].nameVi}</span>}
                {question.question}
              </h2>
              <AnswerPanel
                question={question}
                state={display}
                reveal={feedback?.reveal ?? null}
                locked={!!feedback || pending}
                pending={pending}
                dark={gamified}
                onSubmit={(p) => void submit(p)}
                onPair={(l, r) => void tryPair(l, r)}
                onCharge={setCharge}
                onAdvance={setAdvance}
              />
              {feedback?.reveal?.explanation && <p className={`text-xs ${muted2}`}>💡 {feedback.reveal.explanation}</p>}
              {!feedback && question.hint && <p className="text-xs text-amber-400">🐾 {question.hint}</p>}
              {pending && !feedback && <p className={`text-xs ${muted2} flex items-center gap-1`}><Loader2 className="w-3 h-3 animate-spin" /> Đang chấm…</p>}
            </div>

            {netError && (
              <div role="alert" className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-500 text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {netError}</span>
                {retry && <button onClick={() => submit(retry.payload, retry.questionId)} className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold">Thử lại</button>}
              </div>
            )}

            {gamified && (
              <div className={`border rounded-2xl p-3 space-y-3 ${card}`}>
                <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                  <Zap className="w-3.5 h-3.5" /> MP {display.mp} / {MAX_MP}
                  <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div className="h-full bg-gradient-to-r from-sky-500 to-indigo-400 transition-all" style={{ width: `${(display.mp / MAX_MP) * 100}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SKILL_IDS.map((id) => {
                    const sk = SKILLS[id];
                    const Icon = SKILL_ICONS[id];
                    return (
                      <button key={id} onClick={() => cast(id)} disabled={display.mp < sk.cost || !!feedback || pending} title={sk.description} className="p-2 rounded-xl border border-slate-700 text-xs font-bold flex flex-col items-center gap-1 hover:bg-slate-800 disabled:opacity-35">
                        <Icon className="w-4 h-4" />
                        <span className="leading-tight text-center">{sk.nameVi}</span>
                        <span className="text-sky-400">{sk.cost} MP</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {gamified && display.quests.length > 0 && (
              <div className={`border rounded-2xl p-3 space-y-2 ${card}`}>
                <div className="text-xs font-bold text-emerald-400 flex items-center gap-1"><ScrollText className="w-3.5 h-3.5" /> Nhiệm vụ phụ</div>
                {display.quests.map((q) => (
                  <div key={q.id} className={`text-xs flex items-start justify-between gap-2 ${q.status === 'failed' ? 'opacity-40 line-through' : ''}`}>
                    <div>
                      <span className="font-bold">{q.status === 'done' ? '✅' : q.status === 'failed' ? '✖' : '⬜'} {q.title}</span>
                      <span className={`block ${muted2}`}>{q.description}</span>
                    </div>
                    <span className="font-mono shrink-0">{q.progress}/{q.target}</span>
                  </div>
                ))}
              </div>
            )}

            {display.feedback && (
              <div role="status" className={`p-3 rounded-xl border text-center font-bold text-sm ${display.feedback.tone === 'wrong' ? 'bg-rose-500/15 border-rose-500/40 text-rose-500' : display.feedback.tone === 'critical' ? 'bg-amber-500/15 border-amber-500/40 text-amber-500' : 'bg-blue-600/15 border-blue-500/40 text-blue-500'}`}>
                {display.feedback.text}
              </div>
            )}
          </>
        )}

        {/* Result */}
        {phase === 'result' && (
          <div className={`border rounded-3xl p-6 text-center space-y-5 ${card}`}>
            {!final && !finalError && (
              <p className={`text-sm ${muted2} flex items-center justify-center gap-2`}><Loader2 className="w-4 h-4 animate-spin" /> Máy chủ đang chấm điểm từ nhật ký trận đấu…</p>
            )}
            {finalError && (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-rose-400">{finalError}</p>
                {token && <button onClick={() => { setFinalError(null); void finish(token); }} className="px-4 py-2 rounded-xl bg-blue-600 text-white font-bold">Nộp lại</button>}
              </div>
            )}
            {final?.flagged && (
              <div className="space-y-2">
                <div className="text-5xl">🚩</div>
                <h1 className="text-2xl font-black text-rose-400">Kết quả không được ghi nhận</h1>
                <p className={`text-sm ${muted2}`}>Hệ thống phát hiện tốc độ trả lời bất thường:</p>
                <ul className="text-sm text-rose-300 space-y-1">{final.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
              </div>
            )}
            {score && (
              <>
                <div className="text-5xl">{isRace && final?.race ? (final.race.result === 'win' ? '🏆' : final.race.result === 'draw' ? '🤝' : '🌊') : !gamified ? '📋' : view?.state.outcome === 'defeat' ? '💀' : score.bossDefeated ? '🏆' : '⚔️'}</div>
                <h1 className="text-2xl md:text-3xl font-black">
                  {isRace && final?.race ? (final.race.result === 'win' ? 'BẠN THẮNG BOT!' : final.race.result === 'draw' ? 'HÒA — CÙNG VỀ ĐÍCH!' : 'Bot về đích trước — thử lại nhé!') : !gamified ? 'Test Complete' : view?.state.outcome === 'defeat' ? 'DEFEATED!' : score.bossDefeated ? 'BOSS DEFEATED!' : 'Battle Complete!'}
                </h1>
                <p className={`text-sm ${muted2}`}>
                  {score.correct} / {battle.totalQuestions} correct · {Math.round(score.accuracy * 100)}% accuracy
                  {gamified ? ` · Best combo x${score.maxCombo}` : ''}
                </p>
                {gamified && (
                  <div className="flex flex-wrap items-center justify-center gap-6 max-w-sm mx-auto">
                    <Ring label="Gems" value={`+${score.gems}`} color="#fbbf24" />
                    <Ring label="EXP" value={`+${score.exp}`} color="#60a5fa" />
                    <div className="w-full">
                      {isRace && final?.race
                        ? <Stat label="Bạn – Bot (chặng đúng)" value={`${final.race.playerDistance} – ${final.race.botDistance}`} className="text-sky-400" />
                        : <Stat label="HP còn lại" value={`${final?.hpRemaining ?? 0} / ${scaling.playerHp}`} className="text-emerald-400" />}
                    </div>
                    {score.questGems > 0 && <div className="col-span-2 text-xs font-bold text-emerald-400">🏅 Nhiệm vụ phụ: +{score.questGems} Gems</div>}
                    {score.milestoneMultiplier > 1 && <div className="col-span-2 text-xs font-bold text-emerald-400">🎯 Expected Score reached — x{score.milestoneMultiplier} multiplier!</div>}
                  </div>
                )}
                <div className={`text-xs ${muted2}`}>✅ Điểm do máy chủ tính từ nhật ký trận đấu{final?.saved ? ' · đã lưu' : ''}</div>
                {gamified && score.bossDefeated && (
                  <div>
                    {!loot ? (
                      <button onClick={openChest} className="tc-sticker"><Gift className="w-5 h-5" /> Open Gacha Chest</button>
                    ) : (
                      <div className="text-sm font-bold">Loot Dropped! {loot.emoji} {loot.name} <span className={`uppercase text-xs ${muted2}`}>({loot.rarity})</span></div>
                    )}
                  </div>
                )}
              </>
            )}

            {board && config.scenario === 'coop_raid' && board.totalDamage != null && (
              <div className="text-sm space-y-1">
                <div className="font-bold flex items-center justify-center gap-1"><Users className="w-4 h-4" /> Raid progress ({board.participants} heroes)</div>
                <Bar label="Shared Boss HP" value={Math.max(0, scaling.bossHp - board.totalDamage)} max={scaling.bossHp} gradient={theme.accent} />
              </div>
            )}
            {isRace && board?.teams && board.teams.teams[0].members.length > 0 && board.teams.teams[1].members.length > 0 && (
              <div className="border-l-4 border-sky-400 bg-white/5 p-3 text-left space-y-2">
                <div className="font-bold text-sm text-center">
                  {board.teams.winner === 'draw' ? '🤝 Hai đội hoà nhau' : `🏆 ${board.teams.teams.find((t) => t.team === board.teams!.winner)?.name} dẫn đầu`}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {board.teams.teams.map((t) => (
                    <div key={t.team} className={`border-t-4 bg-white/5 p-2 ${t.team === 'A' ? 'border-sky-400' : 'border-orange-400'}`}>
                      <div className="text-xs font-bold">{t.name} · {t.distance.toFixed(1)} chặng/người</div>
                      <ul className="text-xs text-slate-400 mt-1 space-y-0.5">
                        {t.members.slice(0, 6).map((m, i) => <li key={i}>{m.avatar} {m.nickname} · {m.correct}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 text-center">Chia đội đều theo thứ tự vào phòng; điểm đội = số chặng đúng trung bình mỗi người.</p>
              </div>
            )}
            {board && board.leaderboard.length > 0 && (
              <div className="text-left max-w-sm mx-auto">
                <div className="font-bold text-sm mb-2 flex items-center gap-1"><Trophy className="w-4 h-4 text-amber-400" /> Leaderboard</div>
                <ol className="space-y-1">
                  {board.leaderboard.map((r, i) => (
                    <li key={i} className={`flex items-center justify-between border-b border-dashed py-1.5 text-sm ${gamified ? 'border-slate-600' : 'border-slate-300'}`}>
                      <span className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold ${i === 0 ? 'bg-amber-300 text-slate-950' : 'bg-slate-700 text-white'}`}>{i + 1}</span>{r.avatar} {r.nickname}</span>
                      <span className="font-mono text-amber-500">{r.gems} 💎</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {final && (scenario.allowRetry || battle.id === 'demo') && (
              <button onClick={start} className="tc-sticker w-full max-w-sm mx-auto !bg-emerald-300">
                <RotateCcw className="w-5 h-5" /> Play Again
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({ label, value, max, gradient }: { label: string; value: number; max: number; gradient: string }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="border-l-4 border-rose-400 bg-slate-900/85 p-3 space-y-2">
      <div className="flex justify-between items-center text-xs font-bold gap-2">
        <span className="text-rose-300 truncate">{label}</span>
        <span className="bg-slate-950 px-2 py-0.5 text-slate-200 shrink-0">{Math.round(value).toLocaleString('en-US')} / {max.toLocaleString('en-US')}</span>
      </div>
      <div className="w-full bg-slate-950 h-4 overflow-hidden border-2 border-slate-950">
        <div className={`tc-stripes bg-gradient-to-r ${gradient} h-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Ring({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="grid h-28 w-28 place-items-center rounded-full border-[7px] bg-slate-900 text-center" style={{ borderColor: color }}>
      <div>
        <div className="font-display text-2xl font-extrabold leading-none" style={{ color }}>{value}</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="border-l-4 border-slate-500 bg-white/5 px-3 py-2 text-left">
      <div className="text-xs text-slate-400 font-bold uppercase">{label}</div>
      <div className={`text-xl font-black ${className}`}>{value}</div>
    </div>
  );
}
