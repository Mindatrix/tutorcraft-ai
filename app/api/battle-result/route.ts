import { NextResponse } from 'next/server';
import { teamRace, weakTopics, type TopicStat } from '../../../src/engine';
import { clientKey, rateLimit } from '../../../src/server/rateLimit';
import { requireTutor } from '../../../src/server/auth';
import { serverSupabase } from '../../../src/server/supabase-server';
import { loadBattleCached } from '../../../src/server/battles';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../src/server/sessions';

// Final scoring. The request carries ONLY the sealed session token: Gems, EXP,
// HP, correct count and timings are all rebuilt from the server's own action log.
// Anything else in the body (e.g. "gems": 99999 typed into DevTools) is ignored.

export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  const byIp = rateLimit(`result-ip:${clientKey(req)}`, 10, 60_000);
  const byToken = rateLimit(`result-token:${token.slice(-24)}`, 5, 60_000);
  if (!byIp.ok || !byToken.ok) return NextResponse.json({ error: 'Too many submissions' }, { status: 429 });

  try {
    const res = await sessions.finalize(token);
    if (res.flagged) {
      return NextResponse.json({ ...res, error: 'Kết quả bị từ chối: phát hiện tốc độ trả lời bất thường.' }, { status: 422 });
    }
    return NextResponse.json(res);
  } catch (e) {
    return sessionErrorResponse(e);
  }
}

/** Leaderboard (nicknames + pet avatars only) and class diagnostics for one battle. */
export async function GET(req: Request) {
  const battleId = new URL(req.url).searchParams.get('battleId') ?? '';
  const db = serverSupabase();
  if (!db || !battleId) return NextResponse.json({ leaderboard: [], diagnostics: [] });

  const { data, error } = await db
    .from('battle_results')
    .select('nickname, avatar, gems, accuracy, damage, topics, created_at, correct, team')
    .eq('battle_id', battleId)
    .order('gems', { ascending: false })
    .limit(200);
  if (error || !data) return NextResponse.json({ leaderboard: [], diagnostics: [], error: error?.message });

  const merged = new Map<string, TopicStat>();
  for (const row of data) {
    for (const t of (row.topics ?? []) as TopicStat[]) {
      const key = t.topic.toLowerCase();
      const m = merged.get(key) ?? { topic: t.topic, skill_tag: t.skill_tag, attempts: 0, wrong: 0 };
      m.attempts += t.attempts;
      m.wrong += t.wrong;
      merged.set(key, m);
    }
  }

  // Team vs team (Boat Race): split by join order, oldest first.
  const joined = [...data].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const isRace = (await loadBattleCached(battleId).catch(() => null))?.config.scenario === 'boat_race';
  const teams = isRace && data.length >= 2 ? teamRace(joined.map((r) => ({ nickname: r.nickname, avatar: r.avatar, correct: r.correct ?? 0, gems: r.gems ?? 0, team: r.team }))) : null;

  // Weak-topic diagnostics are for the tutor who owns this battle; students only get the board.
  let isOwner = false;
  const tutor = await requireTutor(req);
  if (tutor) {
    const { data: owner } = await db.from('battles').select('tutor_id').eq('id', battleId).maybeSingle();
    isOwner = owner?.tutor_id === tutor.id;
  }

  return NextResponse.json({
    teams,
    leaderboard: data.slice(0, 10).map(({ nickname, avatar, gems, accuracy, damage }) => ({ nickname, avatar, gems, accuracy, damage })),
    participants: data.length,
    totalDamage: data.reduce((s, r) => s + (r.damage ?? 0), 0),
    diagnostics: isOwner ? weakTopics(Array.from(merged.values())).slice(0, 10) : [],
  });
}
