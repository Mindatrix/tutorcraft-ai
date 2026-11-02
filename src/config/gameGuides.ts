import guides from '../../content/game_guides.json';

// How-to-play text per game (WP10 U4, 02/11/2026), opened from the toolbar ("Cách chơi") and once by
// itself on a player's first visit to each game. Text lives in content/game_guides.json (content side).

export interface GameGuide {
  goal: string;
  controls: string[];
  skills: string[];
  tips: string[];
}

export const GAME_GUIDES: Record<string, GameGuide> = (guides as { games: Record<string, GameGuide> }).games;

const seenKey = (game: string) => `seen_guide_${game}`;

/** First visit to this game on this device (no storage: treat as seen, never nag). */
export function firstGuideVisit(game: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(game)) === null;
  } catch {
    return false;
  }
}

export function markGuideSeen(game: string) {
  try {
    window.localStorage.setItem(seenKey(game), '1');
  } catch {
    /* not saved: it may open again next time */
  }
}
