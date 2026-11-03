'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BUTTON_PX, useHudSettings } from '../../client/hudSettings';
import { JOYSTICK, JoystickTracker, MoveInputMixer, WarpController, ZERO_STICK, type JoystickVector, type WarpEvent, type WarpPhase } from '../../client/spatialInput';
import './spatial.css';

// Đại phẫu (03/11/2026): Spatial UI controls over the 3D canvas, glass style.
//   - floating joystick on the moveHand side (HUD settings), one finger;
//   - jump button and the "Xuyên không" (warp) button on the other thumb: hold to charge, the ring
//     shows charge / cooldown, only ready when the game says so (`warpAvailable`);
//   - keyboard (WASD / arrows / Space / Shift) on computers.
// The parent owns a MoveInputMixer and reads `mixer.read()` once per frame for the character.
// Logic lives in src/client/spatialInput.ts (tested); this file only draws it.

export interface SpatialControlsProps {
  mixer: MoveInputMixer;
  /** The game allows a warp now (near a portal, or the server opened one). */
  warpAvailable?: boolean;
  /** Teleport now (start of the warp effect). */
  onWarp?: () => void;
  /** The warp effect is over. */
  onArrived?: () => void;
  /** Low graphics tier: no blur (glass falls back to solid). */
  lite?: boolean;
  /** Hide the warp button in worlds without portals. */
  showWarp?: boolean;
}

const RING_R = 30;

/** Pointer capture can throw for a pointer that is already gone: never let that block a press. */
const capture = (el: Element, id: number) => {
  try {
    el.setPointerCapture(id);
  } catch {
    /* pointer already released */
  }
};
const RING_C = 2 * Math.PI * RING_R;

export default function SpatialControls({ mixer, warpAvailable = false, onWarp, onArrived, lite = false, showWarp = true }: SpatialControlsProps) {
  const hud = useHudSettings();
  const [stick] = useState(() => new JoystickTracker(JOYSTICK));
  const [warp] = useState(() => new WarpController());
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [vec, setVec] = useState<JoystickVector>(ZERO_STICK);
  const [phase, setPhase] = useState<WarpPhase>('locked');
  const [progress, setProgress] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const zoneRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onWarp, onArrived });
  useEffect(() => {
    handlers.current = { onWarp, onArrived };
  }, [onWarp, onArrived]);

  const fire = (events: WarpEvent[]) => {
    for (const e of events) {
      if (e === 'warp') handlers.current.onWarp?.();
      if (e === 'arrived') handlers.current.onArrived?.();
    }
  };

  // Warp availability comes from the game.
  useEffect(() => {
    fire(warp.setAvailable(warpAvailable, performance.now()));
  }, [warp, warpAvailable]);

  // Timers of the warp button and the ring, one rAF loop while mounted.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      fire(warp.tick(now));
      setPhase(warp.phase);
      setProgress(Math.round(warp.progress(now) * 100) / 100);
      setCooldown(warp.cooldownLeft(now));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [warp]);

  // Keyboard; releasing everything on blur / tab switch so nothing stays held.
  useEffect(() => {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (mixer.key(e.code, down)) e.preventDefault();
    };
    const kd = onKey(true);
    const ku = onKey(false);
    const release = () => {
      mixer.clear();
      stick.up(null);
      setOrigin(null);
      setVec(ZERO_STICK);
    };
    const vis = () => document.visibilityState !== 'visible' && release();
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [mixer, stick]);

  const local = (e: ReactPointerEvent) => {
    const r = zoneRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = local(e);
    if (!stick.down(e.pointerId, p.x, p.y)) return;
    capture(e.currentTarget, e.pointerId);
    setOrigin(p);
    setVec(ZERO_STICK);
  };
  const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!stick.active) return;
    const p = local(e);
    const v = stick.move(e.pointerId, p.x, p.y);
    mixer.setStick(v);
    setVec(v);
  };
  const stickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    stick.up(e.pointerId);
    mixer.setStick(ZERO_STICK);
    setOrigin(null);
    setVec(ZERO_STICK);
  };

  const size = BUTTON_PX[hud.buttonSize];
  const radius = Math.round(JOYSTICK.radius * (size / BUTTON_PX.m));
  const actionsHand = hud.moveHand === 'left' ? 'left' : 'right';
  const ready = phase === 'ready';
  const warpLabel = phase === 'cooldown' ? `${cooldown}s` : phase === 'charging' ? 'Giữ…' : phase === 'warping' ? '…' : 'Xuyên không';

  return (
    <div
      className={`tc-sp-root${lite ? ' tc-hud-lite' : ''}`}
      style={{ ['--sp-size' as string]: `${size}px`, ['--sp-radius' as string]: `${radius}px`, ['--sp-opacity' as string]: String(hud.controlOpacity) }}
    >
      <div
        ref={zoneRef}
        className="tc-sp-stickzone"
        data-hand={hud.moveHand}
        onPointerDown={stickDown}
        onPointerMove={stickMove}
        onPointerUp={stickUp}
        onPointerCancel={stickUp}
        aria-hidden="true"
      >
        <div
          className="tc-sp-stick tc-sp-glass"
          data-idle={origin ? 'false' : 'true'}
          style={origin ? { left: origin.x, top: origin.y } : undefined}
        >
          <div className="tc-sp-knob" style={{ transform: `translate(${vec.knobX * (radius / JOYSTICK.radius)}px, ${vec.knobY * (radius / JOYSTICK.radius)}px)` }} />
        </div>
      </div>

      <div className="tc-sp-actions" data-hand={actionsHand}>
        <button
          type="button"
          className="tc-sp-btn tc-sp-glass"
          aria-label="Nhảy (phím cách)"
          onPointerDown={(e) => {
            e.preventDefault();
            mixer.jump();
          }}
        >
          <span aria-hidden="true">⤒</span>
          <span className="tc-sp-label">Nhảy</span>
        </button>
        {showWarp && (
          <button
            type="button"
            className="tc-sp-btn tc-sp-btn-warp tc-sp-glass"
            data-phase={phase}
            aria-disabled={!ready && phase !== 'charging'}
            aria-label={ready ? 'Xuyên không: giữ để dịch chuyển' : phase === 'cooldown' ? `Xuyên không: chờ ${cooldown} giây` : 'Xuyên không: chưa có cổng gần đây'}
            onPointerDown={(e) => {
              e.preventDefault();
              capture(e.currentTarget, e.pointerId);
              fire(warp.press(performance.now()));
            }}
            onPointerUp={() => fire(warp.release(performance.now()))}
            onPointerCancel={() => fire(warp.release(performance.now()))}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) fire(warp.press(performance.now()));
            }}
            onKeyUp={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fire(warp.release(performance.now()));
            }}
          >
            <svg className="tc-sp-ring" viewBox="0 0 68 68" aria-hidden="true">
              <circle className="tc-sp-ring-track" cx="34" cy="34" r={RING_R} />
              <circle
                className="tc-sp-ring-fill"
                cx="34"
                cy="34"
                r={RING_R}
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - (phase === 'cooldown' ? 1 - progress : progress))}
              />
            </svg>
            <span aria-hidden="true">✦</span>
            <span className="tc-sp-label">{warpLabel}</span>
          </button>
        )}
      </div>
      <span className="tc-sp-sronly" aria-live="polite">
        {phase === 'warping' ? 'Đang xuyên không' : ready ? 'Có thể xuyên không' : ''}
      </span>
    </div>
  );
}
