import { isGameMode } from '../../../src/engine';
import { clientKey, rateLimit } from '../../../src/server/rateLimit';
import { listScenarios } from '../../../src/server/scenarios';

/** Story scenarios for the Studio's world picker: GET /api/scenarios?game=dino_journey */
export async function GET(req: Request) {
  const limit = rateLimit(`scenarios:${clientKey(req)}`, 120, 60_000);
  if (!limit.ok) return Response.json({ error: 'Too many requests' }, { status: 429 });
  const game = new URL(req.url).searchParams.get('game');
  if (game && !isGameMode(game)) return Response.json({ error: 'Game không hợp lệ.' }, { status: 400 });
  const scenarios = await listScenarios(game && isGameMode(game) ? game : undefined);
  return Response.json({ scenarios }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
}
