'use client';

// Boat Race lanes: the player's boat vs the bot. Purely presentational —
// positions are 0..1 and come from the engine (server-checked result at the end).

interface Props {
  heroAvatar: string;
  heroName: string;
  /** 0..1 along the river. */
  playerPos: number;
  botPos: number;
  playerCorrect: number;
  botCorrect: number;
  total: number;
  botName: string;
  finished?: boolean;
  /** Team name when playing team vs team. */
  teamName?: string | null;
  teamTone?: 'A' | 'B' | null;
}

function Lane({ emoji, name, pos, correct, total, tone }: { emoji: string; name: string; pos: number; correct: number; total: number; tone: 'me' | 'bot' }) {
  const left = Math.min(100, Math.max(0, pos * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-bold">
        <span className={tone === 'me' ? 'text-sky-300' : 'text-orange-300'}>{name}</span>
        <span className="text-slate-300">{correct} / {total} chặng</span>
      </div>
      <div className="relative h-12 rounded-xl overflow-hidden border border-sky-400/30 bg-gradient-to-r from-sky-900/60 via-sky-700/40 to-sky-900/60">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 22px, rgba(255,255,255,.35) 22px 24px)' }} aria-hidden />
        <div className="absolute right-0 top-0 bottom-0 w-3 bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-[length:12px_12px] opacity-80" aria-hidden />
        <div className="absolute top-1/2 -translate-y-1/2 text-3xl transition-[left] duration-500 ease-out" style={{ left: `calc(${left}% * 0.9)` }}>
          <span aria-hidden>🚣</span>
          <span className="absolute -top-1 -right-3 text-sm" aria-hidden>{emoji}</span>
        </div>
      </div>
    </div>
  );
}

export default function RaceTrack({ heroAvatar, heroName, playerPos, botPos, playerCorrect, botCorrect, total, botName, finished, teamName, teamTone }: Props) {
  return (
    <div role="img" aria-label={`Đua thuyền: ${heroName} ${playerCorrect}/${total}, ${botName} ${botCorrect}/${total}`} className="rounded-2xl border border-sky-500/30 bg-slate-900/70 p-3 space-y-3">
      {teamName && (
        <div className={`text-center text-xs font-bold rounded-lg py-1 ${teamTone === 'B' ? 'bg-orange-500/15 text-orange-300' : 'bg-sky-500/15 text-sky-300'}`}>Bạn thuộc {teamName} — điểm đội là số chặng đúng trung bình mỗi người</div>
      )}
      <Lane emoji={heroAvatar} name={heroName} pos={playerPos} correct={playerCorrect} total={total} tone="me" />
      <Lane emoji="🤖" name={botName} pos={botPos} correct={botCorrect} total={total} tone="bot" />
      {!finished && <p className="text-[11px] text-slate-400 text-center">Trả lời đúng để chèo thuyền tới đích — trả lời nhanh để bỏ xa đối thủ. Kết quả cuối do máy chủ chốt.</p>}
    </div>
  );
}
