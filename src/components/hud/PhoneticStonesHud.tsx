'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Fish,
  Flag,
  Keyboard,
  Mic,
  MicOff,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Star,
  Tent,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { passThreshold, type SpeechMode } from '@/src/engine/pronunciation';
import {
  FISHING_DOCK_SPECS,
  MOCK_SPEECH_RESPONSES,
  MOCK_SPEECH_RULES,
  type CampQuestBoardState,
  type FishingDockState,
  type PetState,
  type PhoneticStoneMachineSnapshot,
  type PhoneticStoneState,
  type PhoneticStoneStateMachine,
} from '@/src/client/phoneticStones';
import {
  isSpeechRecognitionSupported,
  LazySpeechRecognizer,
} from '@/src/client/speechRecognition';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Progress } from '../ui/progress';
import { Slider } from '../ui/slider';

const STATE_LABELS: Record<PhoneticStoneState, { label: string; tone: string }> = {
  idle: { label: 'Chờ chọn đá', tone: 'bg-slate-800 text-slate-200 border-slate-600' },
  selected: { label: 'Đã chọn đá', tone: 'bg-sky-950 text-sky-200 border-sky-400' },
  modeling: { label: 'Đang đọc mẫu (TTS)…', tone: 'bg-amber-950 text-amber-200 border-amber-400' },
  ready: { label: 'Sẵn sàng nói / gõ', tone: 'bg-emerald-950 text-emerald-200 border-emerald-400' },
  listening: { label: 'Đang nghe micro…', tone: 'bg-teal-950 text-teal-200 border-teal-300 animate-pulse' },
  scoring: { label: 'Đang chấm điểm…', tone: 'bg-indigo-950 text-indigo-200 border-indigo-400' },
  fallback: { label: 'Chế độ thay thế (Gõ / Đọc theo)', tone: 'bg-amber-950 text-amber-200 border-amber-400' },
  passed: { label: 'Đạt yêu cầu!', tone: 'bg-emerald-900 text-emerald-100 border-emerald-300' },
  retry: { label: 'Thử lại nhé', tone: 'bg-orange-950 text-orange-200 border-orange-400' },
};

const PET_META: Record<
  PetState,
  { emoji: string; badge: string; lineVi: string; ringClass: string }
> = {
  idle: {
    emoji: '🦊',
    badge: 'Bạn đồng hành',
    lineVi: 'Chạm vào một Viên Đá Phát Âm trong cảnh 3D để nghe từ và luyện nói nhé!',
    ringClass: 'border-white/25 bg-[var(--color-night)]/90',
  },
  coach: {
    emoji: '🦊📣',
    badge: 'Làm mẫu khẩu hình',
    lineVi: 'Nghe kỹ âm mẫu và nhìn gợi ý khẩu hình miệng trước khi đọc nhé!',
    ringClass: 'border-[var(--color-sun)] bg-[#241a08]/95 shadow-[0_0_20px_rgba(252,211,77,0.3)]',
  },
  listening: {
    emoji: '🦊👂',
    badge: 'Đang vểnh tai nghe…',
    lineVi: 'Mình đang lắng nghe em đọc! Hãy đọc to, rõ ràng từ trên thẻ nhé.',
    ringClass: 'border-[var(--color-mint)] bg-[#062825]/95 shadow-[0_0_22px_rgba(110,231,183,0.35)]',
  },
  celebrate: {
    emoji: '🦊🎉',
    badge: 'Tuyệt vời!',
    lineVi: 'Phát âm chuẩn lắm! Viên đá đã sáng rực lên rồi kìa!',
    ringClass: 'border-[var(--color-sun)] bg-[#14291d]/95 shadow-[0_0_24px_rgba(252,211,77,0.45)]',
  },
};

export interface PhoneticStonesHudProps {
  machine: PhoneticStoneStateMachine;
  /** Show AI Studio Mock JSON preset buttons for testing all states. */
  showMockPresets?: boolean;
  /** Active 3D game world (`summer_camp` or `river_fishing`) */
  worldMode?: 'summer_camp' | 'river_fishing';
  /** Optional world switcher callback for `/tutor/scene-lab` */
  onWorldModeChange?: (mode: 'summer_camp' | 'river_fishing') => void;
  /** Summer Camp Quest Board progress & tent stars (`summer_camp` world) */
  campBoard?: CampQuestBoardState;
  /** River Fishing Dock state & catch weight multiplier (`river_fishing` world) */
  fishingDock?: FishingDockState;
  /** Callback when angler casts the fishing rod after unlocking a dock stone */
  onCastFishingRod?: (targetId: string) => void;
}

export default function PhoneticStonesHud({
  machine,
  showMockPresets = true,
  worldMode,
  onWorldModeChange,
  campBoard,
  fishingDock,
  onCastFishingRod,
}: PhoneticStonesHudProps) {
  const [snap, setSnap] = useState<PhoneticStoneMachineSnapshot>(() => machine.getSnapshot());
  const [typedText, setTypedText] = useState('');
  const [micConsentGiven, setMicConsentGiven] = useState(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [listenProgress, setListenProgress] = useState(0);
  const recognizerRef = useRef<LazySpeechRecognizer | null>(null);

  useEffect(() => {
    const unsubState = machine.bus.on('state:change', ({ snapshot }) => {
      setSnap(snapshot);
    });
    const unsubHover = machine.bus.on('stone:hover', () => {
      setSnap(machine.getSnapshot());
    });
    const unsubPet = machine.bus.on('pet:state', () => {
      setSnap(machine.getSnapshot());
    });
    return () => {
      unsubState();
      unsubHover();
      unsubPet();
    };
  }, [machine]);

  // Create lazy recognizer controller bound to machine callbacks
  useEffect(() => {
    const rec = new LazySpeechRecognizer({
      onInterim: (transcript) => {
        machine.pushInterim(transcript);
      },
      onFinal: (result) => {
        void machine.submitVoiceAttempt(result);
      },
      onError: (code, message) => {
        machine.handleSpeechError(code, message);
      },
    });
    recognizerRef.current = rec;
    return () => {
      rec.dispose();
      recognizerRef.current = null;
    };
  }, [machine]);

  // Listening window progress bar timer
  useEffect(() => {
    if (snap.state !== 'listening' || !snap.selectedTarget) return;
    const listenMs = snap.selectedTarget.listenMs || 8000;
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const elapsed = performance.now() - t0;
      setListenProgress(Math.min(100, Math.round((elapsed / listenMs) * 100)));
    }, 80);
    return () => {
      window.clearInterval(id);
      setListenProgress(0);
    };
  }, [snap.state, snap.selectedTarget]);

  const startVoiceSynchronously = useCallback(() => {
    const target = machine.getSnapshot().selectedTarget;
    if (!target) return;
    if (!isSpeechRecognitionSupported()) {
      machine.handleSpeechError(
        'unsupported',
        'Trình duyệt này không hỗ trợ Web Speech API. Em dùng chế độ Gõ chữ hoặc Đọc theo nhé!',
      );
      return;
    }
    const started = machine.startListening();
    if (!started) return;
    // Synchronously start SpeechRecognition inside user gesture (iOS Safari requirement)
    recognizerRef.current?.start({
      lang: machine.getSnapshot().voiceConfig.lang,
      listenMs: target.listenMs,
      silenceStopMs: MOCK_SPEECH_RULES.silenceStopMs,
    });
  }, [machine]);

  const handleMicTap = () => {
    if (!micConsentGiven) {
      setPrivacyDialogOpen(true);
      return;
    }
    startVoiceSynchronously();
  };

  const selected = snap.selectedTarget;
  const progress = selected ? snap.progressByTarget[selected.targetId] : null;
  const threshold = passThreshold(snap.level, MOCK_SPEECH_RULES);
  const petMeta = PET_META[snap.petState];
  const stateMeta = STATE_LABELS[snap.state];
  const result = snap.lastResult;
  const showMouthHint =
    snap.petState === 'coach' ||
    snap.petHint === 'mouth_shape' ||
    result?.hint === 'mouth_shape';

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 sm:p-4 select-none"
      aria-label="Giao diện Đá Phát Âm"
    >
      {/* Screen-reader & keyboard parity list (Blueprint §3.5 rule 4):
          every interactive 3D stone exists as a visually-hidden DOM button */}
      <div className="sr-only" role="region" aria-label="Danh sách Đá Phát Âm trong cảnh 3D">
        {snap.targets.map((t) => (
          <button
            key={t.targetId}
            type="button"
            aria-label={`Stone: ${t.text}${t.ipa ? `, ${t.ipa}` : ''}`}
            onFocus={() => machine.hoverStone(t.targetId)}
            onBlur={() => machine.hoverStone(null)}
            onClick={() => machine.selectStone(t.targetId)}
          >
            {t.text} {t.ipa ?? ''}
          </button>
        ))}
      </div>

      {/* Top bar: Pet Companion state card + quick stone selector pills */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div
          data-testid="pet-companion-card"
          data-pet-state={snap.petState}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-[var(--radius-xl)] border-2 p-3 text-white transition-all ${petMeta.ringClass}`}
        >
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-lg)] border-2 border-[var(--color-ink)] bg-[var(--color-sun)] text-2xl shadow-[2px_2px_0_var(--color-ink)]"
            aria-hidden
          >
            {petMeta.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-[var(--radius-lg)] bg-[var(--color-sun)] px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--color-ink)]">
                {petMeta.badge}
              </span>
              <span
                data-testid="machine-state-badge"
                className={`rounded-[var(--radius-lg)] border px-2 py-0.5 text-[11px] font-bold ${stateMeta.tone}`}
              >
                {stateMeta.label}
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug text-slate-100">{petMeta.lineVi}</p>
            {showMouthHint && selected?.mouthTipVi && (
              <div
                data-testid="pet-mouth-hint"
                className="mt-2 rounded-[var(--radius-lg)] border border-[var(--color-sun)]/60 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200"
              >
                👄 <b>Gợi ý khẩu hình:</b> {selected.mouthTipVi}
              </div>
            )}
          </div>
        </div>

        <div className="flex max-w-full flex-col items-end gap-2">
          {/* Optional 3D World Mode Switcher (Summer Camp Quests vs River Fishing Challenge) */}
          {onWorldModeChange && worldMode && (
            <div
              data-testid="phonetic-world-switcher"
              className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-[var(--radius-xl)] border-2 border-white/20 bg-[var(--color-night)]/90 p-1"
            >
              <button
                type="button"
                onClick={() => onWorldModeChange('summer_camp')}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-lg)] px-2.5 py-1 text-xs font-extrabold transition-all cursor-pointer ${
                  worldMode === 'summer_camp'
                    ? 'bg-[var(--color-sun)] text-[var(--color-ink)] shadow-[2px_2px_0_var(--color-ink)]'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <Tent className="h-3.5 w-3.5" />
                <span>Trại Hè (Summer Camp)</span>
              </button>
              <button
                type="button"
                onClick={() => onWorldModeChange('river_fishing')}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-lg)] px-2.5 py-1 text-xs font-extrabold transition-all cursor-pointer ${
                  worldMode === 'river_fishing'
                    ? 'bg-[var(--color-sun)] text-[var(--color-ink)] shadow-[2px_2px_0_var(--color-ink)]'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                <Fish className="h-3.5 w-3.5" />
                <span>Câu Cá (River Fishing)</span>
              </button>
            </div>
          )}

          {/* Quick stone status strip (also clickable for touch / mouse convenience) */}
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-[var(--radius-xl)] border-2 border-white/15 bg-[var(--color-night)]/85 p-1.5">
            {snap.targets.map((t) => {
              const p = snap.progressByTarget[t.targetId];
              const isSel = snap.selectedTargetId === t.targetId;
              const stars = p?.bestStars ?? 0;
              return (
                <button
                  key={t.targetId}
                  type="button"
                  onClick={() => machine.selectStone(t.targetId)}
                  onPointerEnter={() => machine.hoverStone(t.targetId)}
                  onPointerLeave={() => machine.hoverStone(null)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-lg)] border-2 px-2.5 py-1 text-xs font-extrabold transition-all cursor-pointer ${
                    isSel
                      ? 'border-[var(--color-sun)] bg-[var(--color-ink)] text-[var(--color-sun)] shadow-[2px_2px_0_var(--color-sun)]'
                      : p?.passed
                        ? 'border-emerald-400/70 bg-emerald-950/80 text-emerald-200'
                        : 'border-white/20 bg-slate-900/80 text-slate-200 hover:border-sky-300'
                  }`}
                >
                  <span>🪨 {t.kind === 'sentence' ? 'Câu' : t.text}</span>
                  {stars > 0 && (
                    <span className="text-[var(--color-sun)]" aria-label={`${stars} sao`}>
                      {'★'.repeat(stars)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* WP8: Summer Camp Quest Board & Tent Stars HUD Panel */}
          {worldMode === 'summer_camp' && campBoard && (
            <div
              data-testid="summer-camp-quest-board"
              className="pointer-events-auto w-full max-w-md rounded-[var(--radius-xl)] border-2 border-amber-400/50 bg-[var(--color-night)]/90 p-2.5 text-white shadow-[4px_4px_0_var(--color-ink)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Compass className="h-4 w-4 text-[var(--color-sun)]" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-amber-200">
                    Bảng Nhiệm Vụ Trại Hè
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-extrabold">
                  <span
                    data-testid="camp-tent-stars"
                    className="rounded-[var(--radius-lg)] bg-amber-500/20 px-2 py-0.5 text-[var(--color-sun)]"
                  >
                    ⛺ {campBoard.tentStars}/{campBoard.maxStars} ★
                  </span>
                  <span
                    data-testid="camp-flag-badge"
                    className={`inline-flex items-center gap-1 rounded-[var(--radius-lg)] px-2 py-0.5 ${
                      campBoard.flagUnlocked
                        ? 'bg-emerald-500/25 text-emerald-200'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <Flag className="h-3 w-3" />
                    {campBoard.flagUnlocked
                      ? 'Cờ đỉnh lều đã kéo!'
                      : `${campBoard.completedCount}/${campBoard.totalCount} trạm`}
                  </span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {campBoard.tasks.map((st) => (
                  <button
                    key={st.stationId}
                    type="button"
                    onClick={() => machine.selectStone(st.targetId)}
                    className={`flex flex-col items-start rounded-[var(--radius-lg)] border px-2 py-1 text-left text-[11px] transition-all cursor-pointer ${
                      st.completed
                        ? 'border-emerald-400/60 bg-emerald-950/70 text-emerald-100'
                        : 'border-white/15 bg-slate-900/70 text-slate-300 hover:border-amber-300/60'
                    }`}
                  >
                    <span className="font-extrabold">
                      ⛺ {st.stationNameVi}
                    </span>
                    <span className="text-[10px] text-amber-200">
                      {st.stars > 0 ? '★'.repeat(st.stars) : st.roleVi}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* WP8: River Fishing Dock & Catch Weight Multiplier HUD Panel */}
          {worldMode === 'river_fishing' && fishingDock && (
            <div
              data-testid="river-fishing-dock-panel"
              className="pointer-events-auto w-full max-w-md rounded-[var(--radius-xl)] border-2 border-sky-400/50 bg-[var(--color-night)]/90 p-2.5 text-white shadow-[4px_4px_0_var(--color-ink)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Fish className="h-4 w-4 text-sky-300" />
                  <span className="text-xs font-extrabold uppercase tracking-wider text-sky-200">
                    Bến Câu Cá · Hệ số Cân nặng
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-extrabold">
                  <span className="rounded-[var(--radius-lg)] bg-sky-500/20 px-2 py-0.5 text-sky-200">
                    🎣 Đã câu: {fishingDock.catches.length}
                  </span>
                  <span
                    data-testid="fishing-total-score"
                    className="rounded-[var(--radius-lg)] bg-amber-500/20 px-2 py-0.5 text-[var(--color-sun)]"
                  >
                    🏆 {fishingDock.totalPoints}đ
                  </span>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                Đọc/gõ tên cá trên đá để mở khóa quăng cần:{' '}
                <b>Pass ×1.0 · 2★ ×1.1 · 3★ ×1.2</b>
              </p>
              {fishingDock.catches[0] && (
                <div
                  data-testid="fishing-last-catch"
                  className="mt-1.5 flex items-center justify-between rounded-[var(--radius-lg)] border border-emerald-400/50 bg-emerald-950/70 px-2.5 py-1 text-xs font-bold text-emerald-100"
                >
                  <span>
                    🐟 Vừa câu: <b>{fishingDock.catches[0].fishNameVi}</b> ({fishingDock.catches[0].fishNameEn})
                  </span>
                  <span className="text-[var(--color-sun)]">
                    {fishingDock.catches[0].finalWeightKg} kg (×{fishingDock.catches[0].multiplier.toFixed(1)}) · +
                    {fishingDock.catches[0].points}đ
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom HUD card when a stone is selected */}
      {selected && snap.state !== 'idle' && (
        <div
          data-testid="phonetic-stone-hud-card"
          className="pointer-events-auto mx-auto w-full max-w-2xl rounded-[var(--radius-xl)] border-2 border-white/25 bg-[var(--color-night)]/95 p-4 text-white shadow-[6px_6px_0_var(--color-ink)] backdrop-blur-md"
        >
          {/* Card header: Target word/sentence, IPA, stars, attempts left, close button */}
          <div className="flex items-start justify-between gap-3 border-b border-white/15 pb-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[var(--radius-lg)] border border-sky-400/40 bg-sky-950/90 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-sky-200">
                  {selected.kind === 'sentence' ? 'Câu giao tiếp' : 'Từ vựng'}
                </span>
                {selected.ipa && (
                  <span
                    lang="en"
                    className="rounded-[var(--radius-lg)] border border-[var(--color-sun)]/50 bg-amber-950/80 px-2 py-0.5 font-mono text-sm font-bold text-[var(--color-sun)]"
                  >
                    {selected.ipa}
                  </span>
                )}
                <span className="text-xs font-bold text-slate-300">
                  Còn <b>{progress?.attemptsLeft ?? selected.attemptsLeft}</b>/3 lượt · Chuẩn đạt ≥{' '}
                  <b>{threshold}</b>đ
                </span>
              </div>

              <h3
                lang="en"
                className="mt-1.5 text-2xl font-black tracking-tight text-white sm:text-3xl"
              >
                {selected.text}
              </h3>
              {selected.viMeaning && (
                <p className="mt-0.5 text-sm font-semibold text-amber-200/90">
                  Nghĩa: {selected.viMeaning}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5" aria-label={`Đã đạt ${progress?.bestStars ?? 0} sao`}>
                {[1, 2, 3].map((n) => (
                  <Star
                    key={n}
                    className={`h-5 w-5 ${
                      (progress?.bestStars ?? 0) >= n
                        ? 'fill-[var(--color-sun)] text-[var(--color-sun)]'
                        : 'text-slate-600'
                    }`}
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Đóng thẻ đá phát âm"
                onClick={() => {
                  recognizerRef.current?.abort();
                  machine.dismissToIdle();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mode tabs: Voice (shadow) | Typed (dictate) | Listen & Repeat (repeat) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn cách luyện tập">
              {(
                [
                  ['shadow', '🎤 Nói (Shadow)', Mic],
                  ['dictate', '⌨️ Gõ chữ (Dictate)', Keyboard],
                  ['repeat', '🔊 Đọc theo (Repeat)', CheckCircle2],
                ] as const
              ).map(([m, label, Icon]) => {
                const disabled = m === 'shadow' && !snap.voiceConfig.enabled;
                const active = snap.activeMode === m;
                return (
                  <Button
                    key={m}
                    size="sm"
                    variant={active ? 'sun' : 'outline'}
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => machine.setMode(m as SpeechMode)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                );
              })}
            </div>

            {/* TTS speed control using Shadcn Slider */}
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <span>Tốc độ đọc mẫu: {selected.ttsRate.toFixed(2)}×</span>
              <div className="w-24">
                <Slider
                  aria-label="Tốc độ giọng đọc mẫu"
                  min={0.55}
                  max={1.0}
                  step={0.05}
                  value={[selected.ttsRate]}
                  onValueChange={([v]) => machine.setTtsRateForSelected(v)}
                />
              </div>
            </div>
          </div>

          {/* Error / Fallback notice */}
          {snap.lastError && (
            <div
              role="status"
              className="mt-3 flex items-center gap-2 rounded-[var(--radius-lg)] border border-amber-400/60 bg-amber-950/70 px-3 py-2 text-sm font-semibold text-amber-100"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-300" />
              <span>{snap.lastError.message}</span>
            </div>
          )}

          {/* Action area by mode & state */}
          <div className="mt-3 space-y-3">
            {/* Primary controls for Shadow (Voice) mode */}
            {snap.activeMode === 'shadow' && (
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => void machine.playModel()}
                  disabled={snap.state === 'modeling' || snap.state === 'listening'}
                >
                  <Volume2 className="h-4 w-4" />
                  {snap.state === 'modeling' ? 'Đang phát mẫu…' : 'Nghe mẫu'}
                </Button>

                {snap.state !== 'listening' ? (
                  <Button
                    variant="sun"
                    onClick={handleMicTap}
                    disabled={
                      snap.state === 'modeling' ||
                      snap.state === 'scoring' ||
                      (progress?.attemptsLeft ?? 3) <= 0
                    }
                    className={snap.state === 'ready' ? ' ring-2 ring-[var(--color-sun)]' : ''}
                  >
                    <Mic className="h-4 w-4" />
                    Nói ngay
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      recognizerRef.current?.stop();
                    }}
                  >
                    <MicOff className="h-4 w-4" />
                    Dừng thu
                  </Button>
                )}

                {snap.state === 'retry' && (progress?.attemptsLeft ?? 0) > 0 && (
                  <Button variant="secondary" onClick={() => void machine.prepareRetry()}>
                    <RotateCcw className="h-4 w-4" />
                    Thử lại ({progress?.attemptsLeft} lượt còn)
                  </Button>
                )}
              </div>
            )}

            {/* Listening progress bar & live interim transcript */}
            {snap.state === 'listening' && (
              <div className="space-y-1.5 rounded-[var(--radius-lg)] border border-teal-400/40 bg-teal-950/50 p-3">
                <div className="flex items-center justify-between text-xs font-bold text-teal-200">
                  <span>🎙️ Đang nghe ({Math.round(selected.listenMs / 1000)}s tối đa)…</span>
                  <span>{listenProgress}%</span>
                </div>
                <Progress
                  value={listenProgress}
                  max={100}
                  indicatorClassName="bg-[var(--color-mint)]"
                  aria-label="Thời gian thu âm"
                />
                <p className="text-sm font-semibold text-white">
                  Nghe được:{' '}
                  <span lang="en" className="italic text-[var(--color-sun)]">
                    {snap.interimTranscript || '…'}
                  </span>
                </p>
              </div>
            )}

            {/* Typed Dictation mode (`mode: 'dictate'`) */}
            {snap.activeMode === 'dictate' && (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!typedText.trim()) return;
                  void machine.submitDictationAttempt(typedText);
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void machine.playModel()}
                  disabled={snap.state === 'modeling'}
                >
                  <Volume2 className="h-4 w-4" />
                  Nghe mẫu
                </Button>
                <input
                  type="text"
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  placeholder="Gõ lại từ hoặc câu tiếng Anh…"
                  maxLength={300}
                  aria-label="Gõ lại từ hoặc câu tiếng Anh"
                  className="min-h-11 flex-1 rounded-[var(--radius-lg)] border-2 border-white/30 bg-[var(--color-ink)] px-3 py-2 text-base font-bold text-white placeholder:text-slate-400 focus:border-[var(--color-sun)] focus:outline-none"
                />
                <Button
                  type="submit"
                  variant="sun"
                  disabled={!typedText.trim() || (progress?.attemptsLeft ?? 3) <= 0}
                >
                  Chấm chính tả
                </Button>
              </form>
            )}

            {/* Listen & Repeat fallback mode (`mode: 'repeat'`) */}
            {snap.activeMode === 'repeat' && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-white/15 bg-slate-900/80 p-3">
                <p className="text-sm text-slate-200">
                  Nghe mẫu phát âm rồi đọc to theo. Chế độ này tặng <b>1 ★ tham gia</b> và không tính trượt!
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => void machine.playModel()}>
                    <Volume2 className="h-4 w-4" />
                    Nghe lại
                  </Button>
                  <Button
                    variant="sun"
                    disabled={(progress?.attemptsLeft ?? 3) <= 0}
                    onClick={() => void machine.submitRepeatAttempt()}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Em đã đọc theo (1 ★)
                  </Button>
                </div>
              </div>
            )}

            {/* Pronunciation score & server/mock response breakdown (§0.3: label is "Pronunciation score") */}
            {(result || snap.provisionalScore !== null) && (
              <div
                data-testid="pronunciation-score-panel"
                className="space-y-2 rounded-[var(--radius-lg)] border-2 border-white/15 bg-[var(--color-ink)]/90 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--color-sun)]" />
                    <span className="text-sm font-extrabold uppercase tracking-wider text-slate-200">
                      Pronunciation score
                    </span>
                    {result?.almost && (
                      <span className="rounded-[var(--radius-lg)] bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                        Gần đúng 1 chữ cái · 1 ★
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-black text-[var(--color-sun)]">
                      {result ? result.score : snap.provisionalScore}/100
                    </span>
                    {result && (
                      <span
                        className={`rounded-[var(--radius-lg)] px-2 py-0.5 text-xs font-extrabold ${
                          result.passed
                            ? 'bg-emerald-500/25 text-emerald-200'
                            : result.stars > 0
                              ? 'bg-sky-500/25 text-sky-200'
                              : 'bg-rose-500/25 text-rose-200'
                        }`}
                      >
                        {result.passed
                          ? `ĐẠT · +${result.stars} ★`
                          : result.stars > 0
                            ? `THAM GIA · +${result.stars} ★`
                            : `CHƯA ĐẠT (lượt ${result.attemptNo}/3)`}
                      </span>
                    )}
                  </div>
                </div>

                <Progress
                  value={result ? result.score : (snap.provisionalScore ?? 0)}
                  max={100}
                  aria-label="Pronunciation score"
                  indicatorClassName={
                    (result?.score ?? snap.provisionalScore ?? 0) >= threshold
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }
                />

                {result?.detail && (
                  <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-300">
                    <span>Từ vựng (Word): <b>{result.detail.wordScore}%</b></span>
                    <span>Âm vị (Phoneme): <b>{result.detail.phonemeScore}%</b></span>
                    {result.detail.confScore !== null && (
                      <span>Độ rõ (Confidence): <b>{result.detail.confScore}%</b></span>
                    )}
                    {typeof result.coins === 'number' && result.coins > 0 && (
                      <span className="text-[var(--color-sun)]">🪙 +{result.coins} xu</span>
                    )}
                  </div>
                )}

                {result?.weakWords && result.weakWords.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-bold text-rose-300">Từ cần luyện thêm:</span>
                    {result.weakWords.map((w) => (
                      <span
                        key={w}
                        lang="en"
                        className="rounded-[var(--radius-lg)] border border-rose-400/50 bg-rose-950/80 px-2 py-0.5 font-mono font-bold text-rose-200"
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* WP8: River Fishing Dock Cast Rod Bar (requires pronouncing/typing/repeating the fish stone before casting) */}
            {worldMode === 'river_fishing' && fishingDock && (
              (() => {
                const spec = FISHING_DOCK_SPECS.find((s) => s.targetId === selected.targetId);
                if (!spec) return null;
                const unlock = fishingDock.unlockedByTarget[selected.targetId];
                const canCast = Boolean(unlock?.ready);
                const caughtBefore = fishingDock.catches.some((c) => c.targetId === selected.targetId);
                return (
                  <div
                    data-testid="fishing-dock-cast-bar"
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-lg)] border-2 px-3 py-2 text-xs ${
                      canCast
                        ? 'border-sky-400/70 bg-sky-950/80 text-sky-100'
                        : 'border-white/15 bg-slate-900/75 text-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold">
                        🎣 Điểm quăng cần ({spec.fishNameVi} · chuẩn {spec.baseWeightKg} kg):
                      </span>
                      {canCast && unlock ? (
                        <span
                          data-testid="fishing-multiplier-badge"
                          className="rounded-[var(--radius-lg)] bg-[var(--color-sun)] px-2 py-0.5 font-extrabold text-[var(--color-ink)]"
                        >
                          Hệ số cân nặng ×{unlock.multiplier.toFixed(1)} ({unlock.stars}★)
                        </span>
                      ) : (
                        <span className="text-amber-200">
                          Hãy đọc từ, gõ chữ hoặc đọc theo để mở khóa quăng cần!
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={canCast ? 'sun' : 'outline'}
                      disabled={!canCast}
                      data-testid="cast-fishing-rod-btn"
                      onClick={() => onCastFishingRod?.(selected.targetId)}
                    >
                      <Fish className="h-4 w-4" />
                      {caughtBefore && unlock
                        ? `Quăng cần lại (×${unlock.multiplier.toFixed(1)})`
                        : 'Quăng cần câu cá'}
                    </Button>
                  </div>
                );
              })()
            )}

            {/* AI Studio Mock JSON preset buttons for instant state-machine & UI verification */}
            {showMockPresets && (
              <div className="border-t border-white/10 pt-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <Wand2 className="h-3.5 w-3.5 text-[var(--color-sun)]" />
                  <span>AI Studio Mock JSON Presets (Test nhanh các trạng thái)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      machine.applyMockResponse({
                        ...MOCK_SPEECH_RESPONSES.passThreeStars,
                        targetId: selected.targetId,
                      })
                    }
                  >
                    3★ Pass (96đ)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      machine.applyMockResponse({
                        ...MOCK_SPEECH_RESPONSES.passTwoStars,
                        targetId: selected.targetId,
                      })
                    }
                  >
                    2★ Pass (88đ)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      machine.applyMockResponse({
                        ...MOCK_SPEECH_RESPONSES.retryFirstMiss,
                        targetId: selected.targetId,
                      })
                    }
                  >
                    Lượt 1 trượt (48đ)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      machine.applyMockResponse({
                        ...MOCK_SPEECH_RESPONSES.retryMouthShapeHint,
                        targetId: selected.targetId,
                      })
                    }
                  >
                    Lượt 2 + Khẩu hình Pet
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      machine.applyMockResponse({
                        ...MOCK_SPEECH_RESPONSES.rejectedTooShort,
                        targetId: selected.targetId,
                      })
                    }
                  >
                    Quá ngắn (&lt;0.4s)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      machine.applyMockResponse({
                        ...MOCK_SPEECH_RESPONSES.dictateAlmost,
                        targetId: selected.targetId,
                      })
                    }
                  >
                    Dictate Almost (1★)
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* First-time Mic Privacy Notice Dialog (Principle 4: students 5+, never send/store audio) */}
      <Dialog open={privacyDialogOpen} onOpenChange={setPrivacyDialogOpen}>
        <DialogContent rainbow>
          <DialogHeader>
            <DialogTitle>Lưu ý sử dụng Micro (Quyền riêng tư)</DialogTitle>
            <DialogDescription>
              Chế độ luyện phát âm giúp em đọc từ tiếng Anh cùng thú cưng đồng hành.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-200">
            <li>
              <b>Không bao giờ lưu hoặc gửi file ghi âm:</b> Trình duyệt chỉ chuyển giọng đọc của từ đang học thành chữ và tính điểm.
            </li>
            <li>
              <b>Không bắt buộc:</b> Nếu không bật micro, em vẫn đạt đủ sao và tiến độ bằng nút <b>Gõ chữ</b> hoặc <b>Đọc theo</b>.
            </li>
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPrivacyDialogOpen(false);
                machine.setMode('dictate');
              }}
            >
              Chuyển sang Gõ chữ
            </Button>
            <Button
              variant="sun"
              onClick={() => {
                setMicConsentGiven(true);
                setPrivacyDialogOpen(false);
                startVoiceSynchronously();
              }}
            >
              <Mic className="h-4 w-4" />
              Đồng ý &amp; Bắt đầu nói
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
