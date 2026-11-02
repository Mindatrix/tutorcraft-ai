'use client';

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, X, type LucideIcon } from 'lucide-react';
import { BUTTON_PX, useHudSettings } from '../../client/hudSettings';
import RainbowEdge from '../fx/RainbowEdge';
import './hud.css';

// Shared in-game HUD (WP10 U1, 02/11/2026): a frosted toolbar across the top, the movement control
// bottom-left and the skills bottom-right (swappable for left-handed players), panels opened from the
// toolbar. One component for every game; each game passes its tools, skills and movement control.

export interface HudTool {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Opens this panel (title = label). */
  panel?: () => ReactNode;
  /** Or runs this. */
  onClick?: () => void;
  pressed?: boolean;
  hidden?: boolean;
  /** Panel framed like the question frame (rainbow edge): the how-to-play guide. */
  rainbow?: boolean;
}

export interface GameHUDProps {
  /** Game name in the toolbar ("Kayak <b>Rush</b>"). */
  title: ReactNode;
  tools: HudTool[];
  /** Movement control (bottom-left by default). */
  move?: ReactNode;
  /** Skill buttons (bottom-right by default). */
  skills?: ReactNode;
  /** A question is open: controls step back. */
  quiet?: boolean;
  /** No backdrop blur (weak phones, 2D tier). */
  lite?: boolean;
  /** Toolbar above the stage instead of over it (2D worlds draw their own bars at the top). */
  docked?: boolean;
  /** Minimap (U3), placed top-left / top-right by the settings. */
  minimap?: ReactNode;
  /** Coordinate bar (U3), right under the toolbar. */
  coordBar?: ReactNode;
  /** Multiverse rail of next spaces (U3), top-left. */
  rail?: ReactNode;
  /** Open a panel from outside (e.g. the guide on the first visit). */
  openPanel?: string | null;
  onPanelChange?: (id: string | null) => void;
}

export default function GameHUD({ title, tools, move, skills, quiet, lite, docked, minimap, coordBar, rail, openPanel, onPanelChange }: GameHUDProps) {
  const s = useHudSettings();
  const [open, setOpen] = useState<string | null>(null);
  const shown = openPanel !== undefined ? openPanel : open;
  const setShown = useCallback(
    (id: string | null) => {
      setOpen(id);
      onPanelChange?.(id);
    },
    [onPanelChange],
  );
  // Phone-narrow toolbar: keep the buttons that fit, the rest go under "Thêm" (more).
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1024);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const visible = tools.filter((t) => !t.hidden);
  const fit = Math.max(3, Math.floor((width - (width > 520 ? 170 : 16)) / 48));
  const inBar = visible.length > fit ? visible.slice(0, fit - 1) : visible;
  const extra = visible.length > fit ? visible.slice(fit - 1) : [];
  const runTool = (t: HudTool) => (t.panel ? setShown(t.id) : (setShown(null), t.onClick?.()));
  const tool = tools.find((t) => t.id === shown && t.panel);
  const style = { '--hud-scale': s.fontScale, '--hud-size': `${BUTTON_PX[s.buttonSize]}px`, '--hud-size-base': `${BUTTON_PX[s.buttonSize]}px`, '--hud-opacity': s.controlOpacity } as CSSProperties;
  const cls = ['tc-hud', s.moveHand === 'right' ? 'tc-hud-swap' : '', quiet ? 'tc-hud-quiet' : '', lite ? 'tc-hud-lite' : '', docked ? 'tc-hud-docked' : '', s.minimap === 'right' ? 'tc-hud-map-right' : '', s.toolbarLabels ? 'tc-hud-labels' : ''].filter(Boolean).join(' ');

  return (
    <div ref={root} className={cls} style={style}>
      <div className="tc-hud-bar" role="toolbar" aria-label="Thanh công cụ trong game">
        <span className="tc-hud-title">{title}</span>
        <div className="tc-hud-tools">
          {inBar.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tc-hud-btn"
                aria-label={t.label}
                title={t.label}
                aria-pressed={t.panel ? shown === t.id : t.pressed}
                onClick={() => (t.panel ? setShown(shown === t.id ? null : t.id) : t.onClick?.())}
              >
                <t.icon aria-hidden />
                {s.toolbarLabels && <small>{t.label}</small>}
              </button>
            ))}
          {extra.length > 0 && (
            <button type="button" className="tc-hud-btn" aria-label="Thêm" title="Thêm" aria-pressed={shown === '__more'} onClick={() => setShown(shown === '__more' ? null : '__more')}>
              <Ellipsis aria-hidden />
              {s.toolbarLabels && <small>Thêm</small>}
            </button>
          )}
        </div>
      </div>
      {coordBar && s.coordBar && !docked && coordBar}
      {minimap && s.minimap !== 'off' && !docked && <div className="tc-hud-map">{minimap}</div>}
      {rail && !docked && rail}
      {move && <div className="tc-hud-move">{move}</div>}
      {skills && <div className="tc-hud-skills">{skills}</div>}
      {shown === '__more' && (
        <HudPanel title="Thêm" onClose={() => setShown(null)}>
          <div className="tc-hud-panel-body tc-hud-more">
            {extra.map((t) => (
              <button key={t.id} type="button" onClick={() => runTool(t)}>
                <t.icon size={20} aria-hidden /> {t.label}
              </button>
            ))}
          </div>
        </HudPanel>
      )}
      {tool?.panel && (
        <HudPanel title={tool.label} onClose={() => setShown(null)} rainbow={tool.rainbow}>
          {tool.panel()}
        </HudPanel>
      )}
    </div>
  );
}

/**
 * A frosted panel over the page (like the question frame), closed by its button, Esc or the scrim.
 * Rendered into the fullscreen element when there is one, else into <body> (the stage frame has a
 * CSS filter, which would trap a fixed panel inside it).
 */
export function HudPanel({ title, onClose, children, wide, rainbow }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; rainbow?: boolean }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => {
    const pick = () => setTarget(document.fullscreenElement ?? document.body);
    pick();
    document.addEventListener('fullscreenchange', pick);
    return () => document.removeEventListener('fullscreenchange', pick);
  }, []);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button, [href], input, select')?.focus();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      prev?.focus?.();
    };
  }, [onClose, target]);
  if (!target) return null;
  const panel = (
    <div ref={box} className={`tc-hud-panel${rainbow ? ' tc-hud-panel-rb' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} style={wide ? { width: 'min(820px, 100%)' } : undefined}>
      <div className="tc-hud-panel-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="tc-hud-close" onClick={onClose} aria-label="Đóng">
          <X size={18} aria-hidden />
        </button>
      </div>
      {children}
    </div>
  );
  return createPortal(
    <div className="tc-hud-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      {rainbow ? (
        // Same frame as the question frame (C4.1); the CSS version keeps WebGL contexts for the scene.
        <RainbowEdge mode="css" radius={14} style={{ width: 'min(680px, 100%)' }}>
          {panel}
        </RainbowEdge>
      ) : (
        panel
      )}
    </div>,
    target,
  );
}

/** A round skill button with a fill ring (charge, MP or cooldown) and its key on computers. */
export function SkillButton({ icon: Icon, label, sub, fill = 1, disabled, onClick, hotkey, main }: { icon: LucideIcon; label: string; sub?: string; fill?: number; disabled?: boolean; onClick: () => void; hotkey?: string; main?: boolean }) {
  useEffect(() => {
    if (!hotkey || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || typingTarget(e.target)) return;
      if (e.key.toLowerCase() === hotkey.toLowerCase()) onClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey, disabled, onClick]);
  return (
    <button type="button" className={`tc-hud-skill${main ? ' tc-hud-skill-main' : ''}`} style={{ '--fill': Math.max(0, Math.min(1, fill)) } as CSSProperties} disabled={disabled} onClick={onClick} aria-label={sub ? `${label}, ${sub}` : label} title={sub ? `${label} · ${sub}` : label}>
      <span>
        <Icon aria-hidden />
      </span>
      {sub && <i>{sub}</i>}
      {hotkey && <kbd aria-hidden>{hotkey.toUpperCase()}</kbd>}
    </button>
  );
}

/** Typing an answer must never move the boat or fire a skill. */
export function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/**
 * Horizontal steering (-1..1): drag on touch, A/D or ←/→ on a keyboard (held keys, eased back to the
 * centre when released). The hint for the keys fades after 10 s.
 */
export function SteerPad({ onSteer }: { onSteer: (x: number) => void }) {
  const [x, setX] = useState(0);
  const [hint, setHint] = useState(true);
  const track = useRef<HTMLDivElement>(null);
  const keys = useRef({ l: false, r: false });
  const drag = useRef(false);
  const xRef = useRef(0);
  const set = useCallback(
    (v: number) => {
      const c = Math.max(-1, Math.min(1, v));
      xRef.current = c;
      setX(c);
      onSteer(c);
    },
    [onSteer],
  );
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 10_000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let raf = 0;
    let v = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!drag.current) {
        const want = (keys.current.r ? 1 : 0) - (keys.current.l ? 1 : 0);
        const nv = want ? Math.max(-1, Math.min(1, v + want * dt * 3)) : Math.abs(v) < 0.02 ? 0 : v - Math.sign(v) * dt * 3;
        if (nv !== v) {
          v = nv;
          set(v);
        }
      } else v = xRef.current;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const down = (e: KeyboardEvent, on: boolean) => {
      if (typingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') keys.current.l = on;
      else if (k === 'd' || k === 'arrowright') keys.current.r = on;
    };
    const kd = (e: KeyboardEvent) => down(e, true);
    const ku = (e: KeyboardEvent) => down(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [set]);
  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r) set(((clientX - r.left) / r.width) * 2 - 1);
  };
  return (
    <div
      ref={track}
      className="tc-hud-steer"
      role="slider"
      aria-label="Lái sang trái hoặc phải"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Math.round(x * 10) / 10}
      tabIndex={0}
      onPointerDown={(e) => {
        drag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => drag.current && fromPointer(e.clientX)}
      onPointerUp={() => {
        drag.current = false;
        set(0);
      }}
      onPointerCancel={() => {
        drag.current = false;
        set(0);
      }}
    >
      <span className="tc-hud-steer-hint" style={{ opacity: hint ? 1 : 0 }} aria-hidden>
        Lái: <kbd>A</kbd> <kbd>D</kbd> hoặc <kbd>←</kbd> <kbd>→</kbd>
      </span>
      <span className="tc-hud-steer-thumb" style={{ '--x': x } as CSSProperties} />
    </div>
  );
}
