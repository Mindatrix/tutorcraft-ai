// Multiverse Portal RPG: the spaces of a scenario's route (content/multiverse_rooms.json `routes`)
// for the card rail in the HUD (WP10 U3, 02/11/2026): passed, current, and the ones still ahead.

export interface RoomInfo {
  id: string;
  name: string;
  previewImage?: string | null;
}

export type RailState = 'done' | 'now' | 'next';
export interface RailCard {
  /** Position on the route (0-based; a room can come back). */
  key: string;
  room: string;
  name: string;
  image: string | null;
  state: RailState;
}

/** Cards of the route; `stage` is 1-based (the story stage the match is in). Unknown key → first route. */
export function portalRail(data: { rooms: RoomInfo[]; routes: Record<string, string[]> }, scenarioKey: string | null | undefined, stage: number): RailCard[] {
  const route = (scenarioKey && data.routes[scenarioKey]) || Object.values(data.routes)[0] || [];
  const now = Math.max(0, Math.min(route.length - 1, Math.floor(stage) - 1));
  return route.map((room, i) => {
    const info = data.rooms.find((r) => r.id === room);
    return { key: `${i}:${room}`, room, name: info?.name ?? room, image: info?.previewImage ?? null, state: i < now ? 'done' : i === now ? 'now' : 'next' };
  });
}
