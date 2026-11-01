'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { QUESTION_RULES, type GameMode, type HintPayload } from '../../engine';
import { playQuestionSfx } from '../../client/questionSfx';
import { holdDuck } from '../../client/audio';
import RainbowEdge, { useReducedMotion } from '../fx/RainbowEdge';
import type { RenderTier } from '../modes/gfxTier';
import { answerLayout, skinFor, type TimerKind } from './skins';
import './questionFrame.css';

/** Class names of questionFrame.css (plain global CSS: this project's Turbopack rule turns every .css into global CSS). */
const styles = { bottom: 'tc-qf-bottom', bump: 'tc-qf-bump', busy: 'tc-qf-busy', chosen: 'tc-qf-chosen', closing: 'tc-qf-closing', coat: 'tc-qf-coat', coinBar: 'tc-qf-coinBar', coinIcon: 'tc-qf-coinIcon', column: 'tc-qf-column', edge: 'tc-qf-edge', faded: 'tc-qf-faded', flyCoin: 'tc-qf-flyCoin', foot: 'tc-qf-foot', golden: 'tc-qf-golden', head: 'tc-qf-head', hintBtn: 'tc-qf-hintBtn', inner: 'tc-qf-inner', key: 'tc-qf-key', lines: 'tc-qf-lines', matched: 'tc-qf-matched', note: 'tc-qf-note', option: 'tc-qf-option', pairCol: 'tc-qf-pairCol', pairs: 'tc-qf-pairs', panelWrap: 'tc-qf-panelWrap', picked: 'tc-qf-picked', prompt: 'tc-qf-prompt', right: 'tc-qf-right', root: 'tc-qf-root', row: 'tc-qf-row', scrim: 'tc-qf-scrim', scrimBlur: 'tc-qf-scrimBlur', scrimLight: 'tc-qf-scrimLight', sign: 'tc-qf-sign', still: 'tc-qf-still', stud: 'tc-qf-stud', timer: 'tc-qf-timer', top: 'tc-qf-top', whisper: 'tc-qf-whisper', whisperFace: 'tc-qf-whisperFace', wrong: 'tc-qf-wrong' } as const;

// The shared in-scene question frame (phase C4.1–C4.5), one component for the six games, each in
// its own coat (skins.ts). The question is an action in the game, not a wall: the overlay only
// takes taps on its panel, the game keeps running behind it, and it never decides anything — the
// game sends the choice to the server and passes the server's verdict back as `feedback`.
//   - layout: long answers stacked, short ones in a row, matching in two columns (tap left, then
//     right; a light line joins them); text ≥ 16 px, buttons ≥ 44 px, fits a 360 px phone;
//   - high tier: the 3D scene zooms and dims (questionCamera.ts); low tier and 2D: frame + blur;
//   - the 25 s timer is an object in the scene (sceneTimer.ts); on low / 2D it sits in the frame;
//     time out = a light wrong;
//   - hint button after 8 s, blinking softly; the companion whispers the hint;
//   - ~1.5 s feedback that does not block: right → coins fly to the coin bar; wrong → the right
//     answer shows on a sign (in the scene on the high tier, in the frame otherwise).

export interface FrameQuestion {
  id: number;
  type: 'mcq' | 'matching';
  prompt: string;
  options?: string[];
  leftItems?: string[];
  rightItems?: { id: number; text: string }[];
}

export interface FrameFeedback {
  correct: boolean;
  /** The right option (mcq), revealed by the server after the answer. */
  rightIdx?: number;
  rightText?: string;
  coins?: number;
  timeout?: boolean;
}

export interface FrameHint {
  hint: HintPayload;
  line: string;
}

export interface QuestionFrameProps {
  game: GameMode;
  question: FrameQuestion;
  tier: RenderTier;
  /** Local clock (Date.now) when the question opened. */
  openedAt: number;
  limitMs?: number;
  hintAfterMs?: number;
  /** Where the asked-about object is on the stage (0..1): the frame grows from it and shrinks back. */
  anchor?: { x: number; y: number };
  placement?: 'bottom' | 'top';
  onAnswer: (choice: number) => void;
  onPair?: (left: number, rightId: number) => void;
  matched?: { left: number; right: number }[];
  onTimeout?: () => void;
  feedback: FrameFeedback | null;
  /** Buy a hint (the server charges and answers); null when refused. */
  onHint?: (tier: 1 | 2) => Promise<FrameHint | { error: string } | null>;
  /** C4.8: after 2 wrong in a row the tier-1 hint shows by itself. */
  autoHint?: FrameHint | null;
  coins?: number | null;
  /** The 2D timer in the frame (default: low / 2D tiers; the high tier has it in the scene). */
  showTimer?: boolean;
  /** The right-answer sign in the frame (default: low / 2D; the high tier puts it in the scene). */
  signInFrame?: boolean;
  /** Taken golden challenge: gold badge, double coins. */
  golden?: boolean;
  sound?: boolean;
  /** Force reduced motion (otherwise the system setting). */
  still?: boolean;
  onClosed?: () => void;
}

export default function QuestionFrame(props: QuestionFrameProps) {
  return <FrameInner key={props.question.id} {...props} />;
}

function FrameInner(props: QuestionFrameProps) {
  const { game, question: q, tier, openedAt, feedback, anchor, placement = 'bottom', golden, coins, sound = true } = props;
  const limit = props.limitMs ?? QUESTION_RULES.questionLimitMs;
  const hintAfter = props.hintAfterMs ?? QUESTION_RULES.hintAfterMs;
  const skin = skinFor(game);
  const systemStill = useReducedMotion();
  const still = props.still ?? systemStill;
  const showTimer = props.showTimer ?? tier !== 'high';
  const signInFrame = props.signInFrame ?? tier !== 'high';

  const [now, setNow] = useState(openedAt);
  const [chosen, setChosen] = useState<number | null>(null);
  const [leftPick, setLeftPick] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [hints, setHints] = useState<FrameHint[]>([]);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintNote, setHintNote] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [fly, setFly] = useState<{ x: number; y: number; dx: number; dy: number; n: number } | null>(null);
  const [bump, setBump] = useState(0);

  const root = useRef<HTMLDivElement>(null);
  const coinBar = useRef<HTMLDivElement>(null);
  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });

  const answered = chosen !== null || timedOut || !!feedback;
  const elapsed = Math.max(0, now - openedAt);
  const progress = Math.min(1, elapsed / limit);
  const done = useRef(false);

  // Music 8 dB down while the question is being read and answered (WP2).
  useEffect(() => (answered ? undefined : holdDuck()), [answered]);

  // Clock: 4 ticks a second while the question is open; time out once (a light wrong).
  useEffect(() => {
    if (feedback) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!done.current && t - openedAt >= limit) {
        done.current = true;
        setTimedOut(true);
        live.current.onTimeout?.();
      }
    }, 250);
    return () => clearInterval(id);
  }, [feedback, openedAt, limit]);

  // Opening sound of the coat.
  useEffect(() => {
    if (sound) playQuestionSfx(skin.openSfx);
  }, [sound, skin.openSfx]);

  // Feedback ~1.5 s, then the frame shrinks back to the object; the game never waits for it.
  useEffect(() => {
    if (!feedback) return;
    const raf = requestAnimationFrame(() => {
      if (!feedback.correct || !feedback.coins) return;
      const from = (chosen !== null ? optRefs.current[chosen] : null)?.getBoundingClientRect();
      const to = coinBar.current?.getBoundingClientRect();
      const box = root.current?.getBoundingClientRect();
      if (!from || !to || !box) return;
      const x = from.left + from.width / 2 - box.left - 24;
      const y = from.top - box.top - 8;
      setFly({ x, y, dx: to.left + to.width / 2 - box.left - 24 - x, dy: to.top - box.top - y, n: feedback.coins });
      if (sound) playQuestionSfx('coin');
    });
    const bumpAt = setTimeout(() => setBump((b) => b + 1), 850);
    const closeAt = setTimeout(() => setClosing(true), QUESTION_RULES.feedbackMs);
    const doneAt = setTimeout(() => live.current.onClosed?.(), QUESTION_RULES.feedbackMs + 300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(bumpAt);
      clearTimeout(closeAt);
      clearTimeout(doneAt);
    };
    // `chosen` is fixed once feedback arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, sound]);

  const allHints = props.autoHint ? [props.autoHint, ...hints.filter((h) => h.hint.tier !== 1)] : hints;
  const meaning = allHints.find((h) => h.hint.tier === 1);
  const removed = new Set(allHints.flatMap((h) => (h.hint.tier === 2 ? h.hint.remove : [])));

  const pick = (i: number) => {
    if (answered || done.current || removed.has(i)) return;
    done.current = true;
    setChosen(i);
    props.onAnswer(i);
  };
  // Keys 1–4 pick an answer (tablets with keyboards, accessibility).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (q.type !== 'mcq' || answered || !Number.isInteger(n) || n < 1 || n > (q.options?.length ?? 0)) return;
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      pick(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nextTier: 1 | 2 | null = !meaning ? 1 : q.type === 'mcq' && (q.options?.length ?? 0) >= 3 && !allHints.some((h) => h.hint.tier === 2) ? 2 : null;
  const canHint = !!props.onHint && !answered && elapsed >= hintAfter && nextTier !== null;
  const lastWhisper = allHints[allHints.length - 1] ?? null;

  const askHint = async () => {
    if (!props.onHint || !nextTier) return;
    setHintBusy(true);
    setHintNote(null);
    try {
      const r = await props.onHint(nextTier);
      if (r && 'hint' in r) {
        setHints((h) => [...h, r]);
        if (sound) playQuestionSfx('sfx_hint_chime');
      } else if (r && 'error' in r) setHintNote(r.error);
    } finally {
      setHintBusy(false);
    }
  };

  const layout = answerLayout(q, 300);
  const rightIdx = feedback?.rightIdx;
  const rightText = feedback?.rightText ?? (rightIdx != null ? q.options?.[rightIdx] : undefined);
  const anchorVars = anchor ? ({ '--tc-dx': `calc(${(anchor.x - 0.5).toFixed(3)} * 100cqw)`, '--tc-dy': `calc(${(anchor.y - (placement === 'bottom' ? 0.78 : 0.22)).toFixed(3)} * 100cqh)` } as CSSProperties) : {};
  const vars = { '--tc-coat': skin.coat, '--tc-coat-w': `${skin.coatWidth}px`, '--tc-accent': golden ? '#facc15' : skin.accent, ...anchorVars } as CSSProperties;

  return (
    <div ref={root} className={`${styles.root} ${still ? styles.still : ''}`} style={vars}>
      <div className={`${styles.scrim} ${tier === 'high' ? styles.scrimLight : styles.scrimBlur}`} style={{ opacity: closing ? 0 : 1 }} />
      {coins != null && (
        <div ref={coinBar} key={bump} className={`${styles.coinBar} ${bump ? styles.bump : ''}`} aria-label={`${coins} xu`}>
          <span className={styles.coinIcon}>xu</span>
          {coins}
        </div>
      )}
      {fly && !still && (
        <div className={styles.flyCoin} style={{ left: fly.x, top: fly.y, '--tc-fx': `${fly.dx}px`, '--tc-fy': `${fly.dy}px` } as CSSProperties}>
          +{fly.n}
        </div>
      )}
      <div
        className={`${styles.panelWrap} ${placement === 'top' ? styles.top : styles.bottom} ${closing ? styles.closing : ''} ${feedback ? styles.busy : ''}`}
        role="dialog"
        aria-modal="false"
        aria-label="Câu hỏi"
      >
        <div className={styles.coat}>
          {skin.studs && <Studs color={skin.studs.color} ring={skin.studs.ring} size={skin.studs.size} />}
          <RainbowEdge className={styles.edge} tier={tier} radius={12} still={still} style={{ width: '100%' }}>
            <div className={styles.inner}>
              <div className={styles.head}>
                <p className={styles.prompt}>{q.prompt}</p>
                {golden && <span className={styles.golden}>×2</span>}
                {showTimer && <TimerGlyph kind={skin.timer} p={feedback ? Math.min(progress, 1) : progress} accent={skin.accent} />}
              </div>

              {q.type === 'mcq' ? (
                <div className={layout === 'row' ? styles.row : styles.column}>
                  {(q.options ?? []).map((o, i) => {
                    const cls: string[] = [styles.option];
                    if (removed.has(i)) cls.push(styles.faded);
                    if (chosen === i && !feedback) cls.push(styles.chosen);
                    if (feedback && i === rightIdx) cls.push(styles.right);
                    if (feedback && !feedback.correct && chosen === i) cls.push(styles.wrong);
                    return (
                      <button
                        key={i}
                        ref={(el) => {
                          optRefs.current[i] = el;
                        }}
                        type="button"
                        className={cls.join(' ')}
                        disabled={answered || removed.has(i)}
                        aria-pressed={chosen === i}
                        onClick={() => pick(i)}
                      >
                        <span className={styles.key}>{i + 1}</span>
                        {o}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Pairs q={q} matched={props.matched ?? []} leftPick={leftPick} disabled={answered} onLeft={setLeftPick} onRight={(id) => {
                  if (leftPick === null) return;
                  props.onPair?.(leftPick, id);
                  setLeftPick(null);
                }} />
              )}

              {feedback && !feedback.correct && signInFrame && rightText && (
                <div className={styles.sign} style={{ background: skin.sign.bg, color: skin.sign.ink, borderColor: skin.sign.border }} role="status">
                  <small>{feedback.timeout ? 'Hết giờ! Đáp án đúng' : 'Đáp án đúng'}</small>
                  {rightText}
                </div>
              )}

              <div className={styles.foot}>
                {canHint && (
                  <button type="button" className={styles.hintBtn} disabled={hintBusy} onClick={() => void askHint()}>
                    {skin.companion.emoji} Gợi ý {nextTier} · {QUESTION_RULES.hintCost[nextTier!]} xu
                  </button>
                )}
                {lastWhisper && (
                  <div className={styles.whisper} role="status">
                    <span className={styles.whisperFace}>{skin.companion.emoji}</span>
                    <span>
                      <b>{skin.companion.name} thì thầm</b>
                      {lastWhisper.line}
                    </span>
                  </div>
                )}
                {hintNote && <span className={styles.note}>{hintNote}</span>}
              </div>
            </div>
          </RainbowEdge>
        </div>
      </div>
    </div>
  );
}

function Pairs(p: { q: FrameQuestion; matched: { left: number; right: number }[]; leftPick: number | null; disabled: boolean; onLeft: (i: number) => void; onRight: (id: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const lefts = useRef<(HTMLButtonElement | null)[]>([]);
  const rights = useRef(new Map<number, HTMLButtonElement | null>());
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const doneLeft = new Set(p.matched.map((m) => m.left));
  const doneRight = new Set(p.matched.map((m) => m.right));

  // Lines are placed imperatively from the buttons' boxes (no re-render), and again on resize.
  useLayoutEffect(() => {
    const place = () => {
      const b = box.current?.getBoundingClientRect();
      if (!b) return;
      p.matched.forEach((m, k) => {
        const l = lefts.current[m.left]?.getBoundingClientRect();
        const r = rights.current.get(m.right)?.getBoundingClientRect();
        const line = lines.current[k];
        if (!l || !r || !line) return;
        line.setAttribute('x1', String(l.right - b.left));
        line.setAttribute('y1', String(l.top + l.height / 2 - b.top));
        line.setAttribute('x2', String(r.left - b.left));
        line.setAttribute('y2', String(r.top + r.height / 2 - b.top));
      });
    };
    place();
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [p.matched]);

  return (
    <div ref={box} className={styles.pairs}>
      <div className={styles.pairCol}>
        {(p.q.leftItems ?? []).map((t, i) => (
          <button
            key={i}
            ref={(el) => {
              lefts.current[i] = el;
            }}
            type="button"
            className={`${styles.option} ${p.leftPick === i ? styles.picked : ''} ${doneLeft.has(i) ? styles.matched : ''}`}
            disabled={p.disabled || doneLeft.has(i)}
            onClick={() => p.onLeft(i)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={styles.pairCol}>
        {(p.q.rightItems ?? []).map((r) => (
          <button
            key={r.id}
            ref={(el) => {
              rights.current.set(r.id, el);
            }}
            type="button"
            className={`${styles.option} ${doneRight.has(r.id) ? styles.matched : ''}`}
            disabled={p.disabled || doneRight.has(r.id) || p.leftPick === null}
            onClick={() => p.onRight(r.id)}
          >
            {r.text}
          </button>
        ))}
      </div>
      <svg className={styles.lines} aria-hidden>
        {p.matched.map((m, k) => (
          <line
            key={`${m.left}-${m.right}`}
            ref={(el) => {
              lines.current[k] = el;
            }}
          />
        ))}
      </svg>
    </div>
  );
}

function Studs({ color, ring, size }: { color: string; ring?: string; size: number }) {
  // Corners plus the middle of the long sides: buoys on the rope, nails on wood, rivets on metal.
  const spots: CSSProperties[] = [
    { left: -size / 3, top: -size / 3 },
    { right: -size / 3, top: -size / 3 },
    { left: -size / 3, bottom: -size / 3 },
    { right: -size / 3, bottom: -size / 3 },
    { left: `calc(50% - ${size / 2}px)`, top: -size / 3 },
    { left: `calc(50% - ${size / 2}px)`, bottom: -size / 3 },
  ];
  const bg = ring ? `repeating-conic-gradient(${color} 0 25%, ${ring} 0 50%)` : `radial-gradient(circle at 35% 30%, #fff8, ${color} 60%)`;
  return (
    <>
      {spots.map((s, i) => (
        <span key={i} className={styles.stud} style={{ ...s, width: size, height: size, background: bg }} />
      ))}
    </>
  );
}

/** The 2D timer object: a torch burning down, a wave rising, or a ring of water closing. */
export function TimerGlyph({ kind, p, accent }: { kind: TimerKind; p: number; accent: string }) {
  const left = 1 - p;
  const urgent = left < 0.2;
  if (kind === 'torch') {
    const h = 6 + 22 * left;
    return (
      <svg className={styles.timer} viewBox="0 0 40 48" role="timer" aria-label={`Còn ${Math.ceil(left * 25)} giây`}>
        <rect x="17" y="26" width="6" height="20" rx="2" fill="#7a4c22" />
        <rect x="14" y="24" width="12" height="5" rx="1.5" fill="#4b2e14" />
        <path d={`M20 ${24 - h} C ${27} ${24 - h * 0.45}, ${26} 24, 20 24 C ${14} 24, ${13} ${24 - h * 0.45}, 20 ${24 - h} Z`} fill={urgent ? '#ef4444' : '#f97316'} />
        <path d={`M20 ${24 - h * 0.6} C ${23} ${24 - h * 0.3}, ${23} 24, 20 24 C ${17} 24, ${17} ${24 - h * 0.3}, 20 ${24 - h * 0.6} Z`} fill="#fde047" />
      </svg>
    );
  }
  if (kind === 'wave') {
    const y = 44 - 38 * p;
    return (
      <svg className={styles.timer} viewBox="0 0 40 48" role="timer" aria-label={`Còn ${Math.ceil(left * 25)} giây`}>
        <rect x="3" y="3" width="34" height="42" rx="6" fill="rgb(15 23 42 / 0.5)" stroke="#e2e8f0" strokeWidth="2" />
        <path d={`M4 ${y} Q 12 ${y - 4}, 20 ${y} T 36 ${y} V 44 H 4 Z`} fill={urgent ? '#f87171' : '#38bdf8'} />
      </svg>
    );
  }
  const c = 2 * Math.PI * 15;
  return (
    <svg className={styles.timer} viewBox="0 0 40 48" role="timer" aria-label={`Còn ${Math.ceil(left * 25)} giây`}>
      <circle cx="20" cy="24" r="15" fill="none" stroke="rgb(148 163 184 / 0.45)" strokeWidth="5" />
      <circle cx="20" cy="24" r="15" fill="none" stroke={urgent ? '#f87171' : accent} strokeWidth="5" strokeDasharray={`${c * left} ${c}`} transform="rotate(-90 20 24)" strokeLinecap="round" />
    </svg>
  );
}
