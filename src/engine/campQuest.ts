import { CAMP_STATIONS, type CampStation } from './speechGameEffects';

// Summer Camp live match (03/11/2026): the tent's Quest Board. Each tent (match_players.grp) has
// the 4 hub stations; a station is done when the tent has passed enough stones there (server-graded
// speech / typed / repeat attempts, `camp_station` effect). Pure: matchService keeps it in the match
// state and broadcasts `camp_quest`; the 3D Quest Board and the flag only draw it.
//
//   needed per station = clamp(ceil(tent size / 2), 1, 3)   (a tent of 5 needs 3, a solo player 1)
//   the flag rises when all 4 stations are done.

export interface TentQuest {
  /** Stones passed at each station. */
  stations: Record<CampStation, number>;
  /** Stones each station needs (from the tent size when it was created / last resized). */
  needed: number;
  /** Students of the tent who already counted at each station (one count per student per station). */
  by: Record<CampStation, string[]>;
  done: CampStation[];
  flag: boolean;
}

export interface CampQuestState {
  tents: Record<string, TentQuest>;
}

export const emptyCampQuest = (): CampQuestState => ({ tents: {} });

export const stationsNeeded = (tentSize: number) => Math.max(1, Math.min(3, Math.ceil(Math.max(1, tentSize) / 2)));

const zero = (): Record<CampStation, number> => Object.fromEntries(CAMP_STATIONS.map((s) => [s, 0])) as Record<CampStation, number>;
const none = (): Record<CampStation, string[]> => Object.fromEntries(CAMP_STATIONS.map((s) => [s, [] as string[]])) as Record<CampStation, string[]>;

export interface CampStationResult {
  state: CampQuestState;
  tent: TentQuest;
  /** False when nothing changed (same student again at the same station). */
  changed: boolean;
  stationDone: boolean;
  flagRaised: boolean;
}

/** A student of `tent` (size `tentSize`) passed a stone at `station`. */
export function applyCampStation(s: CampQuestState, tentKey: string, tentSize: number, studentId: string, station: CampStation): CampStationResult {
  const prev: TentQuest = s.tents[tentKey] ?? { stations: zero(), needed: stationsNeeded(tentSize), by: none(), done: [], flag: false };
  const needed = Math.max(prev.needed, 1);
  if (prev.by[station]?.includes(studentId) || prev.done.includes(station)) {
    return { state: s, tent: prev, changed: false, stationDone: false, flagRaised: false };
  }
  const stations = { ...prev.stations, [station]: (prev.stations[station] ?? 0) + 1 };
  const by = { ...prev.by, [station]: [...(prev.by[station] ?? []), studentId] };
  const stationDone = stations[station] >= needed;
  const done = stationDone ? [...prev.done, station] : prev.done;
  const flag = done.length === CAMP_STATIONS.length;
  const tent: TentQuest = { stations, needed, by, done, flag };
  return { state: { tents: { ...s.tents, [tentKey]: tent } }, tent, changed: true, stationDone, flagRaised: flag && !prev.flag };
}

/** What a device shows for a tent (no student ids). */
export function tentQuestView(t: TentQuest | undefined) {
  if (!t) return null;
  return { stations: t.stations, needed: t.needed, done: t.done, flag: t.flag, progress: t.done.length / CAMP_STATIONS.length };
}
export type TentQuestView = NonNullable<ReturnType<typeof tentQuestView>>;
