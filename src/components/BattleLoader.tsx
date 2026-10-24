'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { defaultBoss, normalizeConfig, sanitizeBoss } from '../engine';
import BattleArena, { type ArenaBattle, type Prefs } from './BattleArena';
import { load, save } from '../client/storage';

/** Re-validate the public battle info from the network or cache. Contains no questions or answers. */
function parse(raw: Record<string, unknown>): ArenaBattle {
  const rawConfig = (raw.config ?? {}) as Record<string, unknown>;
  const config = normalizeConfig(rawConfig);
  const topic = typeof raw.topic === 'string' ? raw.topic : '';
  return {
    id: String(raw.id),
    topic,
    config,
    boss: sanitizeBoss(raw.boss, defaultBoss(topic, config.themes)),
    tutorName: typeof raw.tutorName === 'string' ? raw.tutorName : '',
    classCode: typeof rawConfig.classCode === 'string' ? rawConfig.classCode : '',
    totalQuestions: Math.max(1, Number(raw.totalQuestions) || 1),
    bossMaxHp: Number(raw.bossMaxHp) > 0 ? Number(raw.bossMaxHp) : undefined,
  };
}

async function fetchBattle(query: string): Promise<ArenaBattle> {
  const res = await fetch(`/api/battles?${query}`, { cache: 'no-store' });
  if (!res.ok) throw Object.assign(new Error('not found'), { status: res.status });
  return parse(await res.json());
}

export default function BattleLoader({ battleId, code }: { battleId?: string; code?: string }) {
  const [state, setState] = useState<{ data: ArenaBattle; variant: number | null; prefs: Prefs } | null>(null);
  const [error, setError] = useState<'not_found' | 'offline' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const v = Number(new URLSearchParams(window.location.search).get('v'));
      const variant = Number.isInteger(v) && v > 0 ? v : null;
      const prefs: Prefs = {
        muted: load<boolean>('tc:muted', false),
        profile: load<Prefs['profile']>('tc:profile', null),
        online: navigator.onLine,
      };
      const cacheKey = `tc:battle-data:${battleId ?? code}`;
      try {
        const data = await fetchBattle(battleId ? `id=${encodeURIComponent(battleId)}` : `code=${encodeURIComponent(code ?? '')}`);
        save(cacheKey, data); // lobby info only — playing still needs the server
        if (!cancelled) setState({ data, variant, prefs });
      } catch (e) {
        const cached = load<Record<string, unknown> | null>(cacheKey, null);
        if (cached && !cancelled) {
          try {
            setState({ data: parse(cached), variant, prefs });
            return;
          } catch {
            /* fall through */
          }
        }
        const status = (e as { status?: number }).status;
        if (!cancelled) setError(status === 404 || status === 400 ? 'not_found' : 'offline');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [battleId, code]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800">
          <div className="text-4xl">{error === 'offline' ? '📴' : '⚠️'}</div>
          <h1 className="text-xl font-bold text-rose-400">
            {error === 'offline' ? 'Không kết nối được máy chủ' : 'Không tìm thấy đấu trường'}
          </h1>
          <p className="text-slate-400 text-sm">
            {error === 'offline'
              ? 'Kiểm tra kết nối mạng rồi thử lại.'
              : 'Mã đấu trường không tồn tại hoặc đã bị xóa. Hãy kiểm tra lại mã với Gia sư của bạn!'}
          </p>
          <Link href="/" className="inline-block mt-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm">Nhập mã khác</Link>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-slate-400 font-medium">Đang mở cổng đấu trường…</p>
        </div>
      </div>
    );
  }

  const { data, variant, prefs } = state;
  return <BattleArena battle={data} variant={variant} prefs={prefs} />;
}
