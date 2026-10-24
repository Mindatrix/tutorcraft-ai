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
