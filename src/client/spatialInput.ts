import { NO_INPUT, type MoveInput } from '../engine/characterMotion';

// Đại phẫu (03/11/2026): the logic of the Spatial UI controls, without React or the DOM, so it is
// tested in Node. Components in src/components/hud/ (VirtualJoystick, WarpButton, SpatialControls)
// only draw this state.
//
//   Joystick   floating: the stick appears where the left thumb lands (inside the left zone), the
//              knob is clamped to the ring, a dead zone kills thumb jitter, one finger only
//              (a second finger is free for the buttons).
//   Xuyên không (warp) button: hold to charge (no accidental warps), release early = cancel,
//              then the warp itself and a cooldown. Only "ready" when the game allows it (near a
//              portal, or the server opened one): the button never decides that itself.
//   Keyboard   WASD / arrows / Space / Shift on computers, merged with the joystick.

// ---------------------------------------------------------------------------------------- joystick

export interface JoystickConfig {
  /** Ring radius in CSS px: full speed at the rim. */
  radius: number;
  /** Fraction of the radius ignored around the centre (thumb jitter). */
  deadZone: number;
}

export const JOYSTICK: JoystickConfig = { radius: 56, deadZone: 0.12 };

export interface JoystickVector {
  /** Right / forward, −1..1, length ≤ 1 (screen up = forward). */
  x: number;
  y: number;
  magnitude: number;
  /** Knob offset from the ring centre in px, clamped to the ring (for drawing). */
  knobX: number;
  knobY: number;
}

export const ZERO_STICK: JoystickVector = { x: 0, y: 0, magnitude: 0, knobX: 0, knobY: 0 };

/** Screen offset of the thumb from the stick's centre (px, y down) → movement vector. */
export function joystickVector(dx: number, dy: number, cfg: JoystickConfig = JOYSTICK): JoystickVector {
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return ZERO_STICK;
  const clamp = Math.min(len, cfg.radius);
  const knobX = (dx / len) * clamp;
  const knobY = (dy / len) * clamp;
  const raw = clamp / cfg.radius;
  if (raw <= cfg.deadZone) return { ...ZERO_STICK, knobX, knobY };
  const magnitude = Math.min(1, (raw - cfg.deadZone) / (1 - cfg.deadZone));
  return { x: (dx / len) * magnitude, y: (-dy / len) * magnitude, magnitude, knobX, knobY };
}

/** One-finger floating joystick. Feed pointer events; read `vector` and `origin`. */
export class JoystickTracker {
  private pointerId: number | null = null;
  origin: { x: number; y: number } | null = null;
  vector: JoystickVector = ZERO_STICK;

  constructor(private cfg: JoystickConfig = JOYSTICK) {}

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** A finger landed in the stick zone. Returns false if another finger already drives the stick. */
  down(id: number, x: number, y: number): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = id;
    this.origin = { x, y };
    this.vector = ZERO_STICK;
    return true;
  }

  move(id: number, x: number, y: number): JoystickVector {
    if (id !== this.pointerId || !this.origin) return this.vector;
    this.vector = joystickVector(x - this.origin.x, y - this.origin.y, this.cfg);
    return this.vector;
  }

  /** Finger lifted or cancelled (also on blur / visibility change: call with the same id or null). */
  up(id: number | null): void {
    if (id !== null && id !== this.pointerId) return;
    this.pointerId = null;
    this.origin = null;
    this.vector = ZERO_STICK;
  }
}

// ---------------------------------------------------------------------------------- Xuyên không

export type WarpPhase = 'locked' | 'ready' | 'charging' | 'warping' | 'cooldown';

export interface WarpConfig {
  /** Hold this long to warp (ms). */
  holdMs: number;
  /** Length of the warp effect; the teleport happens at its start (ms). */
  warpMs: number;
  cooldownMs: number;
}

export const WARP: WarpConfig = { holdMs: 600, warpMs: 900, cooldownMs: 8_000 };

export type WarpEvent = 'charge' | 'cancel' | 'warp' | 'arrived' | 'ready';

/** Pure state machine of the warp button. Times are ms (performance.now()). */
export class WarpController {
  phase: WarpPhase = 'locked';
  private since = 0;
  private available = false;

  constructor(private cfg: WarpConfig = WARP) {}

  /** The game allows a warp right now (near a portal / opened by the server). */
  setAvailable(ok: boolean, now: number): WarpEvent[] {
    this.available = ok;
    if (!ok && (this.phase === 'ready' || this.phase === 'charging')) {
      const ev: WarpEvent[] = this.phase === 'charging' ? ['cancel'] : [];
      this.phase = 'locked';
      this.since = now;
      return ev;
    }
    if (ok && this.phase === 'locked') {
      this.phase = 'ready';
      this.since = now;
      return ['ready'];
    }
    return [];
  }

  press(now: number): WarpEvent[] {
    if (this.phase !== 'ready') return [];
    this.phase = 'charging';
    this.since = now;
    return ['charge'];
  }

  release(now: number): WarpEvent[] {
    if (this.phase !== 'charging') return [];
    if (now - this.since >= this.cfg.holdMs) return this.tick(now);
    this.phase = 'ready';
    this.since = now;
    return ['cancel'];
  }

  /** Advance timers; call every frame (or on an interval). */
  tick(now: number): WarpEvent[] {
    const out: WarpEvent[] = [];
    if (this.phase === 'charging' && now - this.since >= this.cfg.holdMs) {
      this.phase = 'warping';
      this.since = this.since + this.cfg.holdMs;
      out.push('warp');
    }
    if (this.phase === 'warping' && now - this.since >= this.cfg.warpMs) {
      this.phase = 'cooldown';
      this.since = this.since + this.cfg.warpMs;
      out.push('arrived');
    }
    if (this.phase === 'cooldown' && now - this.since >= this.cfg.cooldownMs) {
      this.phase = this.available ? 'ready' : 'locked';
      this.since = this.since + this.cfg.cooldownMs;
      if (this.phase === 'ready') out.push('ready');
    }
    return out;
  }

  /** 0..1 for the ring around the button (charge, warp or cooldown progress). */
  progress(now: number): number {
    const span = this.phase === 'charging' ? this.cfg.holdMs : this.phase === 'warping' ? this.cfg.warpMs : this.phase === 'cooldown' ? this.cfg.cooldownMs : 0;
    return span ? Math.max(0, Math.min(1, (now - this.since) / span)) : this.phase === 'ready' ? 1 : 0;
  }

  /** Seconds of cooldown left (for the label), 0 otherwise. */
  cooldownLeft(now: number): number {
    return this.phase === 'cooldown' ? Math.max(0, Math.ceil((this.cfg.cooldownMs - (now - this.since)) / 1000)) : 0;
  }
}

// ------------------------------------------------------------------------------------- keyboard

const KEYS: Record<string, 'f' | 'b' | 'l' | 'r' | 'jump' | 'sprint'> = {
  KeyW: 'f',
  ArrowUp: 'f',
  KeyS: 'b',
  ArrowDown: 'b',
  KeyA: 'l',
  ArrowLeft: 'l',
  KeyD: 'r',
  ArrowRight: 'r',
  Space: 'jump',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};

/** Keyboard + joystick + jump button merged into one MoveInput per frame (jump is an edge). */
export class MoveInputMixer {
  private held = new Set<string>();
  private jumpQueued = false;
  stick: JoystickVector = ZERO_STICK;

  /** Returns true when the key is a game key (the caller then prevents scrolling). */
  key(code: string, down: boolean): boolean {
    const k = KEYS[code];
    if (!k) return false;
    if (k === 'jump') {
      if (down && !this.held.has(code)) this.jumpQueued = true;
    }
    if (down) this.held.add(code);
    else this.held.delete(code);
    return true;
  }

  /** The joystick's current vector (from JoystickTracker). */
  setStick(v: JoystickVector): void {
    this.stick = v;
  }

  /** The on-screen jump button. */
  jump(): void {
    this.jumpQueued = true;
  }

  /** Window lost focus: release everything (no stuck keys). */
  clear(): void {
    this.held.clear();
    this.jumpQueued = false;
    this.stick = ZERO_STICK;
  }

  /** This frame's input; the jump edge is consumed. */
  read(): MoveInput {
    const has = (k: string) => [...this.held].some((c) => KEYS[c] === k);
    let x = (has('r') ? 1 : 0) - (has('l') ? 1 : 0) + this.stick.x;
    let y = (has('f') ? 1 : 0) - (has('b') ? 1 : 0) + this.stick.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const jump = this.jumpQueued;
    this.jumpQueued = false;
    if (!x && !y && !jump) return { ...NO_INPUT, sprint: has('sprint') };
    return { x, y, jump, sprint: has('sprint') };
  }
}
