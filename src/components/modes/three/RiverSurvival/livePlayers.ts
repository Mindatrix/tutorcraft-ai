import type { SurvivalPublicPlayer } from '../../../../engine';
import type { RiverSurvivalEnvironment } from './RiverSurvivalScene';
import { RIVER_SURVIVAL_ZONES } from './zones';

// Live match (03/11/2026): where each River Survival player stands, from the SERVER's survival
// state only (no positions are tracked): caught escapers in the Wooden Pen's slots, free ones spread
// over the clearings, pursuers at the net stations. Colours: free green, net holder gold, caught
// grey, pursuer orange (blue while frozen).

export function placePlayers(ids: string[], players: Record<string, SurvivalPublicPlayer>, env: Pick<RiverSurvivalEnvironment, 'mainWoodenPen'>, now: number) {
  const out: { id: string; pos: [number, number, number]; color: number }[] = [];
  const pen = env.mainWoodenPen.slotPositions;
  let caught = 0;
  let free = 0;
  let hunters = 0;
  for (const id of ids) {
    const p = players[id];
    if (!p) continue;
    if (p.team === 'pursuers') {
      const z = RIVER_SURVIVAL_ZONES[hunters % RIVER_SURVIVAL_ZONES.length];
      const a = hunters * 1.7;
      out.push({ id, pos: [z.netStationPosition[0] + Math.cos(a) * 1.6, 0, z.netStationPosition[2] + Math.sin(a) * 1.6], color: (p.frozenUntil ?? 0) > now ? 0x93c5fd : 0xf97316 });
      hunters += 1;
    } else if (!p.free) {
      const slot = pen[caught % pen.length];
      out.push({ id, pos: [slot[0], 0, slot[2]], color: 0x94a3b8 });
      caught += 1;
    } else {
      const z = RIVER_SURVIVAL_ZONES[free % RIVER_SURVIVAL_ZONES.length];
      const a = free * 2.399; // golden angle: no overlaps
      const r = 3 + (free % 4) * 1.8;
      out.push({ id, pos: [z.center[0] + Math.cos(a) * r, 0, z.center[2] + Math.sin(a) * r], color: p.stolenNet ? 0xfacc15 : 0x22c55e });
      free += 1;
    }
  }
  return { out, caught };
}
