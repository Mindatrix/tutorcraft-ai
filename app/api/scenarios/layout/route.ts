import scenarios from '../../../../content/scenarios_v2.json';
import { clientKey, rateLimit } from '../../../../src/server/rateLimit';

/**
 * What a 3D world needs to lay out a scenario (03/11 live match): GET /api/scenarios/layout?id=dino-01
 * → { id, game, tags, asset_ids, stages: [{ n, assets }] }. Asset ids only: story text, questions
 * and answers are not part of it.
 */
type Row = { id: string; game: string; tags?: string[]; asset_ids?: string[]; stages?: { n: number; assets?: string[] }[] };
const BY_ID = new Map((scenarios as Row[]).map((s) => [s.id, s]));

export async function GET(req: Request) {
  if (!rateLimit(`scenario-layout:${clientKey(req)}`, 120, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  const id = new URL(req.url).searchParams.get('id') ?? '';
  const s = BY_ID.get(id);
  if (!s) return Response.json({ error: 'Không có kịch bản này.' }, { status: 404 });
  return Response.json(
    { id: s.id, game: s.game, tags: s.tags ?? [], asset_ids: s.asset_ids ?? [], stages: (s.stages ?? []).map((st) => ({ n: st.n, assets: st.assets ?? [] })) },
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  );
}
