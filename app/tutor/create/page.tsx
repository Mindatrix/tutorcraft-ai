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
        <header className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold rounded-full uppercase tracking-wider">TutorCraft AI · Game Studio</span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-2">Tạo Đấu trường RPG từ bài học</h1>
            <p className="text-xs text-slate-400 mt-1">Đăng nhập: {email} · <button type="button" onClick={signOut} className="underline hover:text-white">Đăng xuất</button></p>
            <Link href="/tutor/animation-lab" className="text-xs text-slate-400 hover:text-white">🎬 Animation Lab — phân tích video mẫu cho hiệu ứng trận đấu →</Link>
          </div>
          <ol className="grid grid-cols-3 gap-2" aria-label="Các bước">
            {STEPS.map((name, i) => (
              <li key={name} aria-current={i === step ? 'step' : undefined} className={`rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold flex items-center gap-2 ${i === step ? 'border-blue-500 bg-blue-600/15 text-white' : i < step ? 'border-emerald-500/40 text-emerald-400' : 'border-slate-800 text-slate-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${i < step ? 'bg-emerald-500 text-slate-950' : i === step ? 'bg-blue-500' : 'bg-slate-800'}`}>{i < step ? '✓' : i + 1}</span>
                <span className="truncate">{name}</span>
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
