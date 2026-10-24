import { Suspense } from 'react';
import { normalizeBattleCode } from '../../../src/engine/code';
import BattleLoader from '../../../src/components/BattleLoader';
import JoinForm from '../../../src/components/JoinForm';
import Scenery from '../../../src/components/scenery/Scenery';

async function Play({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = normalizeBattleCode(Array.isArray(raw) ? raw[0] : raw);
  if (!code) {
    return (
      <main className="relative isolate min-h-screen overflow-hidden bg-[#0b0b2e] text-white flex items-center justify-center px-4 py-10">
        <div aria-hidden className="tc-aurora" />
        <div aria-hidden className="tc-grid" />
        <div className="w-full max-w-sm text-center">
          <div className="relative mx-auto h-36 w-36">
            <div className="absolute inset-0 overflow-hidden rounded-full border-[3px] border-amber-300"><Scenery id="boat_race" className="h-full w-full" /></div>
            <span aria-hidden className="absolute -right-3 -top-2 text-4xl">🗝️</span>
          </div>
          <section aria-label="Vào trận" className="tc-ticket relative -mt-6 -rotate-1 px-7 py-6 text-left shadow-[6px_6px_0_rgb(0_0_0/.35)]">
            <p className="text-xs font-extrabold tracking-[0.2em] text-rose-500">🎟 VÉ VÀO TRẬN</p>
            <h1 className="font-display text-2xl font-extrabold leading-tight">Nhập Mã Đấu trường</h1>
            {raw && <p className="mt-1 text-sm font-bold text-rose-600">Mã “{String(raw).slice(0, 12)}” không hợp lệ, mã gồm 6 ký tự.</p>}
            <div className="my-3 border-t-2 border-dashed border-[#1b1448]/30" />
            <JoinForm light />
          </section>
        </div>
      </main>
    );
  }
  return <BattleLoader key={code} code={code} />;
}

export default function PlayPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <Play searchParams={searchParams} />
    </Suspense>
  );
}
