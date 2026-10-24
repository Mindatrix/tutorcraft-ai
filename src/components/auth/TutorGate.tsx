'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { browserSupabase } from '../../client/supabaseBrowser';

type Mode = 'login' | 'signup';

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Email hoặc mật khẩu chưa đúng.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Email này đã có tài khoản. Hãy đăng nhập.';
  if (m.includes('password should be')) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (m.includes('email not confirmed')) return 'Bạn chưa xác nhận email. Mở thư và bấm liên kết xác nhận.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Thử quá nhiều lần. Đợi một lát rồi thử lại.';
  return msg;
}

/** Shows the sign-in form until a tutor session exists; children get a sign-out button via the header slot. */
export default function TutorGate({ children }: { children: (ctx: { email: string; signOut: () => void }) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = browserSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'login') {
        const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      } else {
        if (password.length < 8) throw new Error('Mật khẩu cần ít nhất 8 ký tự.');
        const { data, error: err } = await sb.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim().slice(0, 60) } } });
        if (err) throw err;
        if (!data.session) setInfo('Đã gửi thư xác nhận. Mở email, bấm liên kết, rồi quay lại đây để đăng nhập.');
      }
    } catch (err) {
      setError(translate(err instanceof Error ? err.message : 'Không đăng nhập được.'));
    } finally {
      setBusy(false);
    }
  };

  const configured = !!browserSupabase();
  if (configured && !ready) return <div className="min-h-screen bg-slate-950" aria-busy />;

  if (!configured) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-4">
        <p role="alert" className="max-w-md text-center text-amber-300">Chưa cấu hình Supabase nên chưa đăng nhập được.</p>
      </main>
    );
  }

  if (!session) {
    const input = 'w-full rounded-xl bg-slate-950/80 border border-slate-700 px-4 py-3 focus:outline-none focus:border-amber-400';
    return (
      <main className="relative isolate overflow-hidden min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-4 py-10">
        <div aria-hidden className="tc-aurora" />
        <div aria-hidden className="tc-grid" />
        <form onSubmit={submit} className="tc-glass tc-reveal w-full max-w-md rounded-3xl p-7 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-200">TutorCraft AI · Game Studio</p>
            <h1 className="text-3xl font-extrabold mt-1">{mode === 'login' ? 'Đăng nhập gia sư' : 'Tạo tài khoản gia sư'}</h1>
            <p className="text-sm text-slate-300 mt-1">Học sinh không cần tài khoản, chỉ gia sư mới cần.</p>
          </div>
          {mode === 'signup' && (
            <label className="block text-sm">Tên hiển thị
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" className={`${input} mt-1`} placeholder="VD: Cô Lan" />
            </label>
          )}
          <label className="block text-sm">Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={`${input} mt-1`} />
          </label>
          <label className="block text-sm">Mật khẩu
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className={`${input} mt-1`} />
          </label>
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          {info && <p role="status" className="text-sm text-emerald-300">{info}</p>}
          <button disabled={busy} className="tc-btn w-full rounded-xl py-3.5 font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-fuchsia-600 disabled:opacity-60">
            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setInfo(null); }} className="w-full text-sm text-slate-300 hover:text-white">
            {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </form>
      </main>
    );
  }

  return <>{children({ email: session.user.email ?? '', signOut: () => void browserSupabase()?.auth.signOut() })}</>;
}
