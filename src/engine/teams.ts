// Team vs team (Boat Race, multi-player). Players are split evenly by join order:
// 1st → Đội Xanh, 2nd → Đội Cam, 3rd → Xanh… so the two sides never differ by more than 1.
// Score = mean correct answers per member, so an odd head-count is not an advantage.

export type TeamId = 'A' | 'B';
export const TEAM_NAMES: Record<TeamId, string> = { A: 'Đội Xanh', B: 'Đội Cam' };

export interface TeamRow {
  nickname: string;
  avatar: string;
  correct: number;
  gems: number;
  /** Stored team; falls back to join-order parity for older rows. */
  team?: TeamId | null;
}

export interface TeamStanding {
  team: TeamId;
  name: string;
  members: (TeamRow & { team: TeamId })[];
  totalCorrect: number;
  /** Mean correct per member — the team's race distance. */
  distance: number;
  meanGems: number;
}

export interface TeamRace {
  teams: [TeamStanding, TeamStanding];
  winner: TeamId | 'draw';
}

export function teamForIndex(i: number): TeamId {
  return i % 2 === 0 ? 'A' : 'B';
}

/** `rows` must be in join order (oldest first). */
export function teamRace(rows: TeamRow[]): TeamRace {
  const build = (team: TeamId): TeamStanding => {
    const members = rows.map((r, i) => ({ ...r, team: r.team ?? teamForIndex(i) })).filter((m) => m.team === team);
    const n = Math.max(1, members.length);
    const totalCorrect = members.reduce((s, m) => s + m.correct, 0);
    return {
      team,
      name: TEAM_NAMES[team],
      members,
      totalCorrect,
      distance: members.length ? totalCorrect / n : 0,
      meanGems: members.length ? members.reduce((s, m) => s + m.gems, 0) / n : 0,
    };
  };
  const a = build('A');
  const b = build('B');
  let winner: TeamId | 'draw';
  if (Math.abs(a.distance - b.distance) > 1e-9) winner = a.distance > b.distance ? 'A' : 'B';
  else if (Math.abs(a.meanGems - b.meanGems) > 1e-9) winner = a.meanGems > b.meanGems ? 'A' : 'B'; // speed bonus breaks ties
  else winner = 'draw';
  return { teams: [a, b], winner };
}

// ---------------------------------------------------------------------------------------------
// Class matches (B2.6): two teams of a given ratio with the same average skill, then squads.

export interface SkilledPlayer {
  id: string;
  /** 0..1, e.g. the student's recent accuracy (0.6 when unknown). */
  skill: number;
}

const meanOf = (xs: SkilledPlayer[]) => (xs.length ? xs.reduce((s, p) => s + p.skill, 0) / xs.length : 0);

/**
 * Split players into two teams: `firstShare` of them in the first team (0.5 = equal, 49 → 25/24;
 * River Survival 0.6 = escapers, 49 → 29/20), at least one per team, with the closest possible
 * mean skill. Greedy by skill, then the best pairwise swaps. Deterministic for the same players.
 */
export function balanceTeams<T extends SkilledPlayer>(players: T[], firstShare = 0.5): [T[], T[]] {
  const list = [...players].sort((a, b) => b.skill - a.skill || a.id.localeCompare(b.id));
  const n = list.length;
  if (n <= 1) return [list, []];
  const sizeA = Math.min(n - 1, Math.max(1, Math.round(n * firstShare)));
  const sizeB = n - sizeA;
  const a: T[] = [];
  const b: T[] = [];
  let sumA = 0;
  let sumB = 0;
  for (const p of list) {
    // Fill both teams in proportion to their size: the one that is "less full" in skill gets the next.
    const fillA = sumA / sizeA;
    const fillB = sumB / sizeB;
    if (a.length < sizeA && (b.length >= sizeB || fillA <= fillB)) {
      a.push(p);
      sumA += p.skill;
    } else {
      b.push(p);
      sumB += p.skill;
    }
  }
  // Swap pairs while it brings the two means closer.
  for (let pass = 0; pass < n; pass++) {
    const gap = Math.abs(sumA / a.length - sumB / b.length);
    let best: [number, number, number] | null = null;
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        const d = b[j].skill - a[i].skill;
        const g = Math.abs((sumA + d) / a.length - (sumB - d) / b.length);
        if (g < gap - 1e-9 && (!best || g < best[2])) best = [i, j, g];
      }
    }
    if (!best) break;
    const [i, j] = best;
    const d = b[j].skill - a[i].skill;
    [a[i], b[j]] = [b[j], a[i]];
    sumA += d;
    sumB -= d;
  }
  return [a, b];
}

/** Relative gap between the two teams' mean skill (0.05 = 5%). */
export function teamSkillGap(a: SkilledPlayer[], b: SkilledPlayer[]): number {
  const all = meanOf([...a, ...b]);
  return all > 0 ? Math.abs(meanOf(a) - meanOf(b)) / all : 0;
}

/**
 * Squads of about `size` players (sizes differ by at most 1), dealt in snake order by skill so
 * every squad gets strong and weak players. size ≤ 0 = one group.
 */
export function splitGroups<T extends SkilledPlayer>(players: T[], size: number): T[][] {
  if (!players.length) return [];
  const count = size > 0 ? Math.max(1, Math.ceil(players.length / size)) : 1;
  const groups: T[][] = Array.from({ length: count }, () => []);
  const list = [...players].sort((a, b) => b.skill - a.skill || a.id.localeCompare(b.id));
  list.forEach((p, i) => {
    const round = Math.floor(i / count);
    const k = i % count;
    groups[round % 2 === 0 ? k : count - 1 - k].push(p);
  });
  return groups;
}
