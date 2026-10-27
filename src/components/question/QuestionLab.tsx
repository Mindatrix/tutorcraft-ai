'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import {
  CONSEQUENCE_GAMES,
  GameMode,
  QUESTION_RULES,
  adaptState,
  answerCoins,
  companionLine,
  gameConsequences,
  gameTasks,
  hintFor,
  standardConsequences,
  type ConsequencePlan,
  type ConsequenceSystem,
  type Question,
} from '../../engine';
import { initSfx } from '../../client/sfx';
import { playQuestionSfx } from '../../client/questionSfx';
import ClassPodium from '../ClassPodium';
import RainbowEdge, { type RainbowMode } from '../fx/RainbowEdge';
import type { RenderTier } from '../modes/gfxTier';
import { createRuntime, type SceneRuntime } from '../modes/three/SceneRuntime';
import { Effects } from '../modes/three/effects';
import { createSceneTimer, type SceneTimer } from '../modes/three/sceneTimer';
import { openQuestionCamera, type QuestionCamera } from '../modes/three/questionCamera';
import { createSceneConsequences, type SceneConsequenceCtx } from '../modes/three/consequenceHooks';
import { createRainbowEdgeMesh, type RainbowEdgeMesh } from '../modes/three/rainbowEdgeMaterial';
import QuestionFrame, { type FrameFeedback, type FrameHint, type FrameQuestion } from './QuestionFrame';
import { FRAME_SKINS, answerLayout, skinFor } from './skins';

// Scene-lab demo for C4 (/tutor/scene-lab → "Khung hỏi + RainbowEdge"): the shared question frame
// in the six coats, three layouts, three render tiers (camera zoom + dim on high; frame + blur on
// low and 2D), the timer object in the scene, hints whispered by the companion, ~1.5 s feedback with
// the right/wrong hooks of each game, the RainbowEdge as a frame and as a portal (DOM shader, CSS,
// and the same shader in 3D), and the top-3 frames. The "server" here is simulated in the page
// (demo questions only); real games send answers and hint requests to /api/session/*.

const SAMPLES: Record<'long' | 'short' | 'pairs', { q: Question; frame: FrameQuestion }> = {
  long: {
    q: { id: 101, question: 'Which sentence is correct?', options: ['She have been to London twice.', 'She has been to London twice.', 'She been to London twice.', 'She is been to London twice.'], correct_idx: 1, difficulty: 'medium', topic: 'present perfect', skill_tag: 'grammar', hint: 'Chủ ngữ số ít đi với "has been"' },
    frame: { id: 101, type: 'mcq', prompt: 'Which sentence is correct?', options: ['She have been to London twice.', 'She has been to London twice.', 'She been to London twice.', 'She is been to London twice.'] },
  },
  short: {
    q: { id: 102, question: '"Con cá" in English is…', options: ['fish', 'bird', 'frog', 'duck'], correct_idx: 0, difficulty: 'easy', topic: 'animals', skill_tag: 'vocabulary', hint: 'Con vật sống dưới nước, có vây' },
    frame: { id: 102, type: 'mcq', prompt: '"Con cá" in English is…', options: ['fish', 'bird', 'frog', 'duck'] },
  },
  pairs: {
    q: { id: 103, type: 'matching', question: 'Match the words', options: [], correct_idx: -1, difficulty: 'easy', topic: 'camp', skill_tag: 'vocabulary', pairs: [{ left: 'tent', right: 'cái lều' }, { left: 'fire', right: 'lửa' }, { left: 'map', right: 'bản đồ' }] },
    frame: { id: 103, type: 'matching', prompt: 'Nối từ với nghĩa', leftItems: ['tent', 'fire', 'map'], rightItems: [{ id: 0, text: 'bản đồ' }, { id: 1, text: 'cái lều' }, { id: 2, text: 'lửa' }] },
  },
};
/** Right column display id → left index (demo key). */
const PAIR_KEY: Record<number, number> = { 0: 2, 1: 0, 2: 1 };

const CLASS = [
  { id: 'a', nickname: 'Minh', avatar: '🦊' },
  { id: 'b', nickname: 'Lan', avatar: '🐼' },
  { id: 'c', nickname: 'Huy', avatar: '🐯' },
  { id: 'd', nickname: 'Mai', avatar: '🐰' },
  { id: 'e', nickname: 'Tú', avatar: '🐸' },
];

const field = 'bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white';

interface StageApi {
  open: () => QuestionCamera;
  anchor: () => { x: number; y: number };
  timer: (p: number) => void;
  consequence: (fn: (sys: ConsequenceSystem<SceneConsequenceCtx>, ctx: SceneConsequenceCtx) => void) => void;
  bloom: (on: boolean) => void;
}

export default function QuestionLab({ tier: labTier }: { tier: 'high' | 'low' }) {
  const [game, setGame] = useState<GameMode>(GameMode.SUMMER_CAMP_QUESTS);
  const [sample, setSample] = useState<keyof typeof SAMPLES>('short');
  const [tier, setTier] = useState<RenderTier>(labTier);
  const [width, setWidth] = useState<number | null>(360);
  const [still, setStill] = useState(false);
  const [golden, setGolden] = useState(false);
  const [sound, setSound] = useState(true);
  const [bloom, setBloom] = useState(false);
  const [open, setOpen] = useState<{ n: number; at: number; anchor: { x: number; y: number } } | null>(null);
  const [feedback, setFeedback] = useState<FrameFeedback | null>(null);
  const [matched, setMatched] = useState<{ left: number; right: number }[]>([]);
  const [coins, setCoins] = useState(40);
  const [results, setResults] = useState<boolean[]>([]);
  const [caption, setCaption] = useState<{ text: string; kind: string; n: number } | null>(null);
  const [modes, setModes] = useState<Record<string, RainbowMode>>({});
  const stage = useRef<StageApi | null>(null);
  const cam = useRef<QuestionCamera | null>(null);
  const sys2d = useRef<ConsequenceSystem<null> | null>(null);
  const [n, setN] = useState(1);

  const s = SAMPLES[sample];
  const skin = skinFor(game);
  const adapt = adaptState(results);
  const task = gameTasks(game)[0];

  const unlock = () => initSfx(!sound);

  const openQuestion = () => {
    unlock();
    cam.current?.close();
    cam.current = stage.current?.open() ?? null;
    setFeedback(null);
    setMatched([]);
    setN((k) => k + 1);
    setOpen({ n: n + 1, at: Date.now(), anchor: stage.current?.anchor() ?? { x: 0.5, y: 0.45 } });
  };

  const showCaption = useCallback((text: string, plan: ConsequencePlan) => setCaption({ text, kind: plan.kind, n: Date.now() }), []);

  // The hooks of the chosen game play the outcome: in the 3D scene (high / low), or as sound +
  // caption + the frame's sign on the 2D tier.
  const consequence = (correct: boolean, timeout: boolean, rightText: string) => {
    const a = { playerId: 'me', correct, timeout, rightAnswer: rightText, seed: `${game}:${n}` };
    if (tier === '2d') {
      sys2d.current ??= standardConsequences<null>((plan) => {
        if (sound) playQuestionSfx(plan.sfx);
        showCaption(plan.caption, plan);
      });
      void sys2d.current.answer(game, task, a, null);
    } else stage.current?.consequence((sys, ctx) => void sys.answer(game, task, a, { ...ctx, sound, onCaption: showCaption }));
  };

  const settle = (correct: boolean, timeout = false) => {
    const elapsed = open ? Date.now() - open.at : 0;
    const right = [...results, correct];
    const c = answerCoins({ correct, timeMs: elapsed, rightInRow: adaptState(right).rightInRow, golden });
    setResults(right);
    if (c.total) setCoins((x) => x + c.total);
    const rightIdx = s.q.correct_idx >= 0 ? s.q.correct_idx : undefined;
    setFeedback({ correct, timeout, rightIdx, rightText: rightIdx != null ? s.q.options[rightIdx] : 'tent – cái lều · fire – lửa · map – bản đồ', coins: c.total });
    consequence(correct, timeout, rightIdx != null ? s.q.options[rightIdx] : 'tent = cái lều');
  };

  const onHint = async (t: 1 | 2): Promise<FrameHint | { error: string }> => {
    const cost = adapt.autoHint && t === 1 ? 0 : QUESTION_RULES.hintCost[t];
    if (coins < cost) return { error: `Chưa đủ xu (cần ${cost} xu).` };
    const hint = hintFor(s.q, t, `lab:${n}`);
    if (!hint) return { error: 'Câu này không có gợi ý bậc 2.' };
    setCoins((x) => x - cost);
    return { hint, line: companionLine(game, t, `lab:${n}`, hint.tier === 1 ? { vi: hint.meaning } : {}) };
  };

  const autoHint: FrameHint | null =
    adapt.autoHint && s.q.hint ? { hint: { tier: 1, meaning: s.q.hint }, line: companionLine(game, 1, `lab:${n}:auto`, { vi: s.q.hint }) } : null;

  useEffect(() => stage.current?.bloom(bloom), [bloom]);

  const podiumScores = { players: { a: 9 + results.filter(Boolean).length, b: 12, c: 7, d: 3, e: 0 }, correct: { a: 4, b: 5, c: 3, d: 1, e: 0 } };
  const onModeFrame = useCallback((m: RainbowMode) => setModes((x) => (x.rect === m ? x : { ...x, rect: m })), []);
  const onModeCss = useCallback((m: RainbowMode) => setModes((x) => (x['rect-css'] === m ? x : { ...x, 'rect-css': m })), []);
  const onModePortal = useCallback((m: RainbowMode) => setModes((x) => (x.circle === m ? x : { ...x, circle: m })), []);

  return (
    <div className="flex h-full flex-col gap-2 overflow-auto bg-slate-900 p-2 text-slate-100">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className={field} value={game} onChange={(e) => setGame(e.target.value as GameMode)}>
          {CONSEQUENCE_GAMES.map((g) => (
            <option key={g} value={g}>
              {gameConsequences(g)?.name} · {FRAME_SKINS[g].label}
            </option>
          ))}
        </select>
        <select className={field} value={sample} onChange={(e) => setSample(e.target.value as keyof typeof SAMPLES)}>
          <option value="short">Đáp án ngắn (xếp ngang)</option>
          <option value="long">Đáp án dài (xếp dọc)</option>
          <option value="pairs">Ghép đôi (hai cột)</option>
        </select>
        <select className={field} value={tier} onChange={(e) => setTier(e.target.value as RenderTier)}>
          <option value="high">3D cao: áp sát + làm tối</option>
          <option value="low">3D thấp: khung + làm mờ</option>
          <option value="2d">2D: khung + làm mờ</option>
        </select>
        <select className={field} value={width ?? 0} onChange={(e) => setWidth(Number(e.target.value) || null)}>
          <option value={360}>Màn 360 px</option>
          <option value={412}>Màn 412 px</option>
          <option value={0}>Rộng hết</option>
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} /> Giảm chuyển động
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={golden} onChange={(e) => setGolden(e.target.checked)} /> Thử thách vàng
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> Âm thanh
        </label>
        <button type="button" className="bg-amber-400 px-3 py-1 font-bold text-slate-900" onClick={openQuestion}>
          Mở câu hỏi
        </button>
        <span className="text-slate-400">
          xu {coins} · chuỗi đúng {adapt.rightInRow} · sai liền {adapt.wrongInRow}
          {adapt.easier ? ' · câu dễ hơn + gợi ý tự hiện' : ''}
          {adapt.combo ? ` · combo ${adapt.combo}` : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <div className="relative overflow-hidden border border-slate-700 bg-black" style={{ width: width ?? '100%', height: 640, maxWidth: '100%' }}>
          <Stage key={`${tier}-${game}`} tier={tier} game={game} apiRef={stage} />
          {caption && (
            <div key={caption.n} className="pointer-events-none absolute left-1/2 top-12 z-40 -translate-x-1/2 bg-black/70 px-3 py-1 text-base font-bold" style={{ color: caption.kind === 'correct' ? '#bbf7d0' : caption.kind === 'recover' ? '#bae6fd' : '#fecaca' }}>
              {caption.text}
            </div>
          )}
          {open && (
            <QuestionFrame
              game={game}
              question={{ ...s.frame, id: s.frame.id * 1000 + open.n }}
              tier={tier}
              openedAt={open.at}
              anchor={open.anchor}
              golden={golden}
              coins={coins}
              still={still || undefined}
              sound={sound}
              feedback={feedback}
              matched={matched}
              autoHint={autoHint}
              onHint={onHint}
              onAnswer={(i) => settle(i === s.q.correct_idx)}
              onPair={(l, r) => {
                // A wrong pair just does not join (like the server); the question goes on.
                if (PAIR_KEY[r] !== l) return void (sound && playQuestionSfx('sfx_wrong_plop'));
                const next = [...matched, { left: l, right: r }];
                setMatched(next);
                if (next.length === 3) settle(true);
              }}
              onTimeout={() => settle(false, true)}
              onClosed={() => {
                cam.current?.close();
                cam.current = null;
                setOpen(null);
              }}
            />
          )}
        </div>

        <div className="flex min-w-[280px] flex-1 flex-col gap-3 text-sm">
          <section>
            <h3 className="mb-1 font-bold">RainbowEdge: một thành phần, hai dáng</h3>
            <div className="flex flex-wrap items-center gap-6 p-4" style={{ background: 'linear-gradient(135deg,#1e293b,#0f172a)' }}>
              <RainbowEdge tier="high" still={still} className="h-24 w-44" onMode={onModeFrame}>
                <div className="grid h-full place-items-center text-center text-base font-bold">Khung hỏi<br />shader</div>
              </RainbowEdge>
              <RainbowEdge mode="css" still={still} className="h-24 w-44" onMode={onModeCss}>
                <div className="grid h-full place-items-center text-center text-base font-bold">Khung hỏi<br />CSS (máy yếu)</div>
              </RainbowEdge>
              <RainbowEdge shape="circle" tier={tier === 'high' ? 'high' : 'low'} bloom={bloom} still={still} className="h-36 w-36" onMode={onModePortal}>
                <div className="grid h-full place-items-center text-base font-bold">Cổng</div>
              </RainbowEdge>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={bloom} onChange={(e) => setBloom(e.target.checked)} /> Cổng đang nở
              </label>
            </div>
            <p className="mt-1 text-slate-400">
              Đang vẽ: khung {modes.rect ?? '…'} · khung CSS {modes['rect-css'] ?? '…'} · cổng {modes.circle ?? '…'} · một vòng {(4000 / 1000).toFixed(0)} s (khung). Cổng trong cảnh 3D dùng cùng shader (bên phải cảnh).
            </p>
          </section>
          <section>
            <h3 className="mb-1 font-bold">Top 3 của lớp (màn em)</h3>
            <div className="bg-slate-950 p-3">
              <ClassPodium roster={CLASS} scores={podiumScores} me="a" />
            </div>
            <p className="mt-1 text-slate-400">Màn gia sư: chọn &quot;Màn hình gia sư (50 em)&quot; ở trên, top 3 có vòng vàng, bạc, đồng dưới chân và huy chương trên bảng tên.</p>
          </section>
          <section className="text-slate-300">
            <h3 className="mb-1 font-bold">Kiểm nhanh</h3>
            <ul className="list-disc pl-5">
              <li>Bố cục: {answerLayout(s.frame, (width ?? 560) - 40)} · chữ ≥ 16 px · nút ≥ 44 px</li>
              <li>Gợi ý hiện sau {QUESTION_RULES.hintAfterMs / 1000} s (giá {QUESTION_RULES.hintCost[1]} / {QUESTION_RULES.hintCost[2]} xu); sai 2 câu liền thì gợi ý bậc 1 tự hiện, miễn phí</li>
              <li>Hết {QUESTION_RULES.questionLimitMs / 1000} s tính là sai nhẹ; phản hồi {QUESTION_RULES.feedbackMs / 1000} s, không chặn game</li>
              <li>Đồng hồ trong cảnh: {skin.timer === 'torch' ? 'đuốc cháy dần' : skin.timer === 'wave' ? 'nước dâng' : 'vòng nước khép lại'}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/** The lab stage: a small 3D scene (high / low) with the asked-about object, or a 2D backdrop. */
function Stage({ tier, game, apiRef }: { tier: RenderTier; game: GameMode; apiRef: { current: StageApi | null } }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || tier === '2d') {
      apiRef.current = { open: () => ({ overlay: 'blur', close: () => undefined }), anchor: () => ({ x: 0.5, y: 0.42 }), timer: () => undefined, consequence: () => undefined, bloom: () => undefined };
      return;
    }
    let rt: SceneRuntime;
    try {
      rt = createRuntime(el, { tier, lights: 'outdoor', sky: { gradient: [0x7cc4f5, 0xe7f5ff, 0x9ccf7a] }, fog: { color: 0xe7f5ff, near: 20, far: 60 }, fov: 50 });
    } catch {
      return;
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8cc56a, roughness: 1 }));
    ground.receiveShadow = true;
    rt.scene.add(ground);
    // The asked-about object: a camp grill on stones.
    const thing = new THREE.Group();
    const stones = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.18, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8d8a83, roughness: 1 }));
    stones.position.y = 0.15;
    const grill = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.6, roughness: 0.4 }));
    grill.position.y = 0.55;
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xff8a3d, toneMapped: false }));
    fire.position.y = 0.32;
    thing.add(stones, grill, fire);
    thing.traverse((o) => (o.castShadow = true));
    rt.scene.add(thing);
    // A student stand-in with the reactions of the six avatar states.
    const kidMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa });
    const kid = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 12), kidMat);
    kid.position.set(-1.8, 0.75, 0.6);
    kid.castShadow = true;
    rt.scene.add(kid);
    let mood = { color: 0x60a5fa, jump: 0, until: 0 };
    const avatar = {
      setState(st: string) {
        const t = clock;
        mood = st === 'correct' || st === 'happy' ? { color: 0x22c55e, jump: 0.5, until: t + 1.2 } : st === 'wrong' || st === 'sad' ? { color: 0xf87171, jump: 0, until: t + 1.2 } : { color: 0x60a5fa, jump: 0, until: 0 };
      },
    };
    // The timer object next to the grill, by the game's coat.
    const timer: SceneTimer = createSceneTimer(skinFor(game).timer);
    timer.object.position.set(1.2, 0, 0.2);
    rt.scene.add(timer.object);
    let timerP = 0;
    // The Multiverse portal with the same RainbowEdge shader, standing to the right.
    const portal: RainbowEdgeMesh = createRainbowEdgeMesh({ shape: 'circle', size: [2, 2], still: rt.reduced });
    portal.mesh.position.set(3.4, 1.4, -1.5);
    portal.mesh.rotation.y = -0.5;
    rt.scene.add(portal.mesh);

    const effects = new Effects();
    rt.scene.add(effects.group);
    const sys = createSceneConsequences();
    rt.director.setAnchor('ask', thing);
    for (const a of ['grill', 'fire', 'peg', 'map', 'board', 'rod', 'float', 'baby']) rt.director.setAnchor(a, thing);
    rt.camera.position.set(0.5, 4.2, 8.5);
    rt.camera.lookAt(0, 0.8, 0);
    const at = new THREE.Vector3(0, 0.6, 0);
    let clock = 0;
    rt.run((dt, t) => {
      clock = t;
      effects.update(dt);
      portal.update(t);
      timer.set(timerP);
      fire.scale.y = 1 + Math.sin(t * 9) * 0.08;
      const active = mood.until > t;
      kidMat.color.setHex(active ? mood.color : 0x60a5fa);
      kid.position.y = 0.75 + (active && mood.jump ? Math.abs(Math.sin(t * 8)) * 0.35 : 0);
    });
    let timerStart = 0;
    let ticking = false;
    const iv = setInterval(() => {
      if (ticking) timerP = Math.min(1, (Date.now() - timerStart) / QUESTION_RULES.questionLimitMs);
    }, 100);
    apiRef.current = {
      open: () => {
        timerStart = Date.now();
        timerP = 0;
        ticking = true;
        const c = openQuestionCamera(rt, tier, { object: thing, focus: [thing, timer.object, kid], placement: 'bottom' });
        return {
          overlay: c.overlay,
          close: () => {
            ticking = false;
            timerP = 0;
            c.close();
          },
        };
      },
      anchor: () => {
        const p = at.clone().project(rt.camera);
        return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
      },
      timer: (p) => (timerP = p),
      consequence: (fn) => {
        ticking = false;
        fn(sys, { rt, effects, at, avatar });
      },
      bloom: (on) => portal.setBloom(on),
    };
    return () => {
      clearInterval(iv);
      apiRef.current = null;
      timer.dispose();
      portal.dispose();
      effects.dispose();
      rt.dispose();
    };
  }, [tier, game, apiRef]);

  if (tier === '2d') {
    const bg: CSSProperties = { background: 'linear-gradient(180deg,#7cc4f5 0%,#e7f5ff 55%,#9ccf7a 56%,#7fb85f 100%)' };
    return (
      <div className="absolute inset-0 grid place-items-center" style={bg}>
        <div className="text-7xl" style={{ marginTop: '-18%' }}>
          🔥
        </div>
        <span className="absolute left-2 top-2 bg-black/60 px-2 py-1 text-xs">2D: không 3D, chỉ khung + làm mờ</span>
      </div>
    );
  }
  return <div ref={host} className="absolute inset-0" />;
}
