'use client';

import { useState } from 'react';
import Link from 'next/link';
import LessonStep, { DEFAULT_SETTINGS } from '../../../src/components/studio/LessonStep';
import PreviewStep from '../../../src/components/studio/PreviewStep';
import ShareStep from '../../../src/components/studio/ShareStep';
import TutorGate from '../../../src/components/auth/TutorGate';
import type { PublishedBattle, StudioDraft, StudioSettings } from '../../../src/components/studio/types';

const STEPS = ['Bài học', 'Thiết kế Đấu trường', 'Chia sẻ'];

export default function GameStudioPage() {
  return <TutorGate>{({ email, signOut }) => <GameStudio email={email} signOut={signOut} />}</TutorGate>;
}

function GameStudio({ email, signOut }: { email: string; signOut: () => void }) {
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [published, setPublished] = useState<PublishedBattle | null>(null);
  const step = published ? 2 : draft ? 1 : 0;

  const reset = () => {
    setDraft(null);
    setPublished(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-5 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="border-l-4 border-amber-300 bg-slate-900/80 p-5 space-y-5">
          <div>
            <span className="text-amber-300 text-xs font-bold uppercase tracking-[0.18em]">TutorCraft AI · Game Studio</span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-2">Tạo Đấu trường RPG từ bài học</h1>
            <p className="text-xs text-slate-400 mt-1">Đăng nhập: {email} · <button type="button" onClick={signOut} className="underline hover:text-white">Đăng xuất</button></p>
            <Link href="/tutor/animation-lab" className="text-xs text-slate-400 hover:text-white">🎬 Animation Lab — phân tích video mẫu cho hiệu ứng trận đấu →</Link>
          </div>
          <ol className="relative grid grid-cols-3" aria-label="Các bước">
            <span aria-hidden className="absolute left-[16%] right-[16%] top-4 h-0.5 bg-slate-700" />
            {STEPS.map((name, i) => (
              <li key={name} aria-current={i === step ? 'step' : undefined} className={`relative flex flex-col items-center gap-1.5 text-center text-xs sm:text-sm font-bold ${i === step ? 'text-white' : i < step ? 'text-emerald-400' : 'text-slate-500'}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${i < step ? 'border-emerald-400 bg-emerald-400 text-slate-950' : i === step ? 'border-amber-300 bg-amber-300 text-slate-950 shadow-[0_0_0_5px_rgb(252_211_77/.2)]' : 'border-slate-600 bg-slate-950'}`}>{i < step ? '✓' : i + 1}</span>
                <span>{name}</span>
              </li>
            ))}
          </ol>
        </header>

        {step === 0 && (
          <LessonStep
            initial={settings}
            onGenerated={(d) => {
              setSettings(d.settings);
              setDraft(d);
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {step === 1 && draft && (
          <PreviewStep
            draft={draft}
            onBack={() => setDraft(null)}
            onPublished={(p) => {
              setPublished(p);
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {step === 2 && published && <ShareStep battle={published} onNew={reset} />}
      </div>
    </div>
  );
}
