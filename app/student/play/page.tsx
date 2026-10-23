import { Suspense } from 'react';
import { normalizeBattleCode } from '../../../src/engine/code';
import BattleLoader from '../../../src/components/BattleLoader';
import JoinForm from '../../../src/components/JoinForm';

async function Play({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = normalizeBattleCode(Array.isArray(raw) ? raw[0] : raw);
  if (!code) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="max-w-sm w-full space-y-4 text-center">
          <div className="text-4xl">🗝️</div>
          <h1 className="text-2xl font-black">Nhập Mã Đấu trường</h1>
          {raw && <p className="text-sm text-rose-400">Mã “{String(raw).slice(0, 12)}” không hợp lệ — mã gồm 6 ký tự.</p>}
          <JoinForm />
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
