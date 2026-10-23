'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DEMO_BATTLE_ID,
  demoBattle,
  normalizeConfig,
  validateBattlePayload,
  type BattleConfig,
  type Question,
} from '../engine';
import BattleArena, { type Prefs } from './BattleArena';
import { load } from '../client/storage';

interface Loaded {
  topic: string;
  config: BattleConfig;
  questions: Question[];
}

export default function BattleLoader({ battleId }: { battleId: string }) {
  const [state, setState] = useState<{ data: Loaded; variant: number | null; prefs: Prefs } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = Number(new URLSearchParams(window.location.search).get('v'));
        const variantCode = Number.isInteger(v) && v > 0 ? v : null;
        const prefs: Prefs = {
          muted: load<boolean>('tc:muted', false),
          profile: load<Prefs['profile']>('tc:profile', null),
          online: navigator.onLine,
        };
        let loaded: Loaded;
        if (battleId === DEMO_BATTLE_ID) {
          const d = demoBattle();
          loaded = { topic: d.topic, config: d.config, questions: d.payload.questions };
        } else {
          const { data: row, error: err } = await supabase.from('battles').select('*').eq('id', battleId).single();
          if (err || !row) throw err ?? new Error('not found');
          const cfg = (row.config ?? {}) as Record<string, unknown>;
          const questions = validateBattlePayload({ questions: row.questions }).questions;
          const config = normalizeConfig({
            theme: row.theme,
            durationMinutes: cfg.durationMinutes ?? Math.max(1, Math.round(questions.length / 1.5)),
            ...cfg,
          });
          loaded = { topic: row.raw_input ?? '', config, questions };
        }
        if (!cancelled) setState({ data: loaded, variant: variantCode, prefs });
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [battleId]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-3 max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-bold text-rose-400">Không tìm thấy mã bài tập</h1>
          <p className="text-slate-400 text-sm">Mã trận đấu không tồn tại hoặc đã bị xóa. Vui lòng hỏi lại Gia sư của bạn!</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
          <p className="text-slate-400 font-medium">Loading battle…</p>
        </div>
      </div>
    );
  }

  const { data, variant, prefs } = state;
  return <BattleArena battleId={battleId} topic={data.topic} config={data.config} questions={data.questions} variant={variant} prefs={prefs} />;
}
