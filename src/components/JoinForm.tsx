'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CODE_LENGTH, normalizeBattleCode } from '../engine/code';

export default function JoinForm({ light = false }: { light?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeBattleCode(value);
    if (!code) {
      setError(`Mã gồm ${CODE_LENGTH} ký tự chữ và số.`);
      return;
    }
    router.push(`/student/play?code=${code}`);
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="join-code" className="sr-only">Mã Đấu trường</label>
      <div className="flex gap-2">
        <input
          id="join-code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value.toUpperCase().slice(0, CODE_LENGTH + 2));
            setError(null);
          }}
          placeholder="VD: K7Q2XM"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          className={`flex-1 min-w-0 px-4 py-3.5 text-center text-xl font-mono font-black tracking-[0.3em] placeholder:tracking-normal placeholder:font-sans placeholder:text-base focus:outline-none ${light ? 'bg-white border-2 border-[#1b1448] text-[#1b1448] placeholder:text-slate-400 focus:bg-amber-50' : 'bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:border-amber-500 rounded-xl'}`}
        />
        <button type="submit" className={light ? 'tc-sticker !px-5 !py-0' : 'px-5 rounded-xl font-bold bg-amber-500 text-slate-950 hover:bg-amber-400'}>Vào trận</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
    </form>
  );
}
