import raw from '../../content/kayak_rage.json';

// Kayak rage boost (WP10 U5, 02/11/2026). The bar fills while the race is on; when full, the player
// can start a boost, but only between questions (the question frame is closed). The boost drains the
// bar and stops by itself when it is empty, or earlier with a second press. Holding it longer than
// `longUseSec` makes the bar refill slowly (`longRefillSec`); a shorter use refills in proportion.
// The boost is a look-and-feel effect in the 3D scene: the race result stays server-side (answers).

export interface RageConfig {
  /** Empty to full while playing (first fill). */
  chargeSec: number;
  /** A full bar lasts this long. */
  maxBoostSec: number;
  /** A use longer than this... */
  longUseSec: number;
  /** ...refills in this long. */
  longRefillSec: number;
  /** A shorter use refills in proportion to its length, up to this. */
  shortRefillMaxSec: number;
  /** Floor so tapping on and off never refills at once. */
  minRefillSec: number;
}

export const KAYAK_RAGE: RageConfig = {
  chargeSec: raw.chargeSec,
  maxBoostSec: raw.maxBoostSec,
  longUseSec: raw.longUseSec,
  longRefillSec: raw.longRefillSec,
  shortRefillMaxSec: raw.shortRefillMaxSec,
  minRefillSec: raw.minRefillSec,
};

export interface RageState {
  /** 0..1. */
  meter: number;
  boosting: boolean;
  /** Seconds of the current (or last) boost. */
  usedSec: number;
  /** Fill per second while not boosting. */
  rate: number;
  /** Seconds the bar needs to refill after the last use (0 before the first use). */
  lastRefillSec: number;
}

export function rageInit(cfg: RageConfig = KAYAK_RAGE): RageState {
  return { meter: 0, boosting: false, usedSec: 0, rate: 1 / cfg.chargeSec, lastRefillSec: 0 };
}

/** How long the bar takes to refill after a boost of `usedSec`. */
export function rageRefillSec(usedSec: number, cfg: RageConfig = KAYAK_RAGE): number {
  // "Over 10 s" means clearly over: frame steps must not tip exactly 10 s into the long refill.
  if (usedSec > cfg.longUseSec + 0.05) return cfg.longRefillSec;
  return Math.min(cfg.shortRefillMaxSec, Math.max(cfg.minRefillSec, (cfg.shortRefillMaxSec * usedSec) / cfg.longUseSec));
}

export function rageCanStart(s: RageState, questionOpen: boolean): boolean {
  return !s.boosting && s.meter >= 1 && !questionOpen;
}

export function rageStart(s: RageState, questionOpen: boolean): RageState {
  return rageCanStart(s, questionOpen) ? { ...s, boosting: true, usedSec: 0 } : s;
}

export function rageStop(s: RageState, cfg: RageConfig = KAYAK_RAGE): RageState {
  if (!s.boosting) return s;
  const refill = rageRefillSec(s.usedSec, cfg);
  return { ...s, boosting: false, rate: (1 - s.meter) / refill || 1 / cfg.chargeSec, lastRefillSec: refill };
}

/** Advance `dt` seconds of race time. */
export function rageTick(s: RageState, dt: number, cfg: RageConfig = KAYAK_RAGE): RageState {
  if (dt <= 0) return s;
  if (s.boosting) {
    const meter = s.meter - dt / cfg.maxBoostSec;
    const used = s.usedSec + dt;
    if (meter <= 0) return rageStop({ ...s, meter: 0, usedSec: Math.min(used, cfg.maxBoostSec) }, cfg);
    return { ...s, meter, usedSec: used };
  }
  return s.meter >= 1 ? s : { ...s, meter: Math.min(1, s.meter + s.rate * dt) };
}

export interface RageSimResult {
  boosts: number;
  boostSec: number;
  matchSec: number;
  /** Share of the race spent boosting. */
  boostShare: number;
  /** Mean seconds from a full bar to the next chance to press (the next gap between questions). */
  meanWaitSec: number;
}

/**
 * One race: each question takes `answerSec[i]` seconds, then a `gapSec` pause (frame closed) before
 * the next. A player who boosts at the first chance and holds it `useSec` seconds (or until empty).
 */
export function simulateRage(answerSec: number[], useSec: number, gapSec = 1.4, cfg: RageConfig = KAYAK_RAGE, step = 0.1): RageSimResult {
  let s = rageInit(cfg);
  let t = 0;
  let boosts = 0;
  let boostSec = 0;
  let fullAt: number | null = null;
  const waits: number[] = [];
  const run = (sec: number, open: boolean) => {
    for (let k = 0; k < Math.round(sec / step); k++) {
      if (!open && rageCanStart(s, false)) {
        s = rageStart(s, false);
        boosts++;
        if (fullAt !== null) waits.push(t - fullAt);
        fullAt = null;
      }
      if (s.boosting && s.usedSec >= useSec - step / 2) s = rageStop(s, cfg);
      const wasBoosting = s.boosting;
      s = rageTick(s, step, cfg);
      if (wasBoosting) boostSec += step;
      if (!s.boosting && s.meter >= 1 && fullAt === null) fullAt = t;
      t += step;
    }
  };
  for (const a of answerSec) {
    run(a, true);
    run(gapSec, false);
  }
  return { boosts, boostSec, matchSec: t, boostShare: t ? boostSec / t : 0, meanWaitSec: waits.length ? waits.reduce((x, y) => x + y, 0) / waits.length : 0 };
}
