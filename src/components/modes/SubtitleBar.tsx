'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Volume2, X } from 'lucide-react';
import { renderSubtitle, type DifficultyLevel, type SubtitleLine, type SubtitleSegment } from '../../engine';

// Story subtitles under the game stage (A2.4). The share of English follows the level
// (src/engine/subtitles.ts). Every keyword can be tapped: meaning + pronunciation with the
// browser's own voice (no recording needed). Sits BELOW the stage, never over the answer buttons.

const LINE_MS = 6500;

export function speakEnglish(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.85;
    const voice = synth.getVoices().find((v) => /^en(-|_)(US|GB)/i.test(v.lang));
    if (voice) u.voice = voice;
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}

type Term = NonNullable<SubtitleSegment['term']>;

export default function SubtitleBar({ lines, level, title }: { lines: SubtitleLine[]; level: DifficultyLevel | undefined; title?: string }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<Term | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const count = lines.length;
  const i = count ? idx % count : 0;
  const segs = useMemo(() => (count ? renderSubtitle(lines[i], level) : []), [lines, i, level, count]);

  // Auto-advance through the stage's lines; a tap on a word pauses it.
  useEffect(() => {
    if (count < 2 || paused || open) return;
    const t = window.setTimeout(() => setIdx((n) => n + 1), LINE_MS);
    return () => window.clearTimeout(t);
  }, [count, paused, open, i]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (!count) return null;
  const line = lines[i];
  const step = (d: number) => {
    setOpen(null);
    setPaused(true);
    setIdx((n) => (n + d + count) % count);
  };
  const tap = (t: Term) => {
    setPaused(true);
    setOpen((cur) => (cur && cur.en === t.en && cur.vi === t.vi ? null : t));
    if (!t.proper) speakEnglish(t.en);
  };

  return (
    <div ref={box} role="region" aria-label={title ?? 'Phụ đề câu chuyện'} className="relative border-2 border-slate-950 bg-slate-900/95 px-3 py-2.5 shadow-[4px_4px_0_rgb(0_0_0/.5)]">
      {open && (
        <div role="dialog" aria-label={`Nghĩa của ${open.en}`} className="absolute bottom-full left-3 right-3 z-20 mb-2 flex items-center gap-3 border-2 border-slate-950 bg-amber-200 px-3 py-2 text-slate-950 shadow-[4px_4px_0_rgb(0_0_0/.5)] sm:right-auto sm:min-w-64">
          <button type="button" onClick={() => speakEnglish(open.en)} aria-label={`Nghe phát âm ${open.en}`} className="grid h-11 w-11 shrink-0 place-items-center border-2 border-slate-950 bg-white">
            <Volume2 className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div lang="en" className="text-lg font-extrabold leading-tight">{open.en}</div>
            <div lang="vi" className="text-base leading-tight">{open.vi}</div>
          </div>
          <button type="button" onClick={() => setOpen(null)} aria-label="Đóng" className="grid h-11 w-11 shrink-0 place-items-center">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        {count > 1 && (
          <button type="button" onClick={() => step(-1)} aria-label="Câu thoại trước" className="grid h-11 w-9 shrink-0 place-items-center text-slate-300 hover:text-white">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <p aria-live="polite" className="min-w-0 flex-1 text-[18px] leading-snug text-white sm:text-[19px]">
          {line.speaker && <span className="mr-1.5 font-extrabold text-amber-300">{line.speaker}:</span>}
          {segs.map((s, k) =>
            s.term && !s.term.proper ? (
              <button
                key={k}
                type="button"
                lang={s.lang}
                onClick={() => tap(s.term!)}
                className={`inline rounded-sm px-0.5 font-bold underline decoration-2 underline-offset-4 ${s.lang === 'en' ? 'text-amber-300 decoration-amber-300/70' : 'text-white decoration-dotted decoration-sky-300/80'}`}
              >
                {s.text}
              </button>
            ) : (
              <span key={k} lang={s.lang} className={s.lang === 'en' ? 'text-amber-100' : undefined}>{s.text}</span>
            ),
          )}
        </p>
        {count > 1 && (
          <button type="button" onClick={() => step(1)} aria-label="Câu thoại tiếp" className="grid h-11 w-9 shrink-0 place-items-center text-slate-300 hover:text-white">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
      {count > 1 && <div className="mt-1 text-right text-[11px] font-bold text-slate-400">{i + 1}/{count}</div>}
    </div>
  );
}
