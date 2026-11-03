'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PhoneticStoneStateMachine, type PhoneticStoneTarget } from '../../client/phoneticStones';
import { survivalStonesOpen, type SurvivalEvent } from '../../engine';
import PhoneticStonesHud from '../hud/PhoneticStonesHud';
import { createRuntime } from './three/SceneRuntime';
import { createPhoneticStonesRig, type PhoneticStonesRig } from './three/phoneticStones';
import { buildRiverSurvivalEnvironment, type RiverSurvivalEnvironment } from './three/RiverSurvival/RiverSurvivalScene';
import { applySurvivalSpeechEffect, type SurvivalClueReveal } from './three/RiverSurvival/speechEffects';
import { RIVER_SURVIVAL_ZONES, type SurvivalZoneId } from './three/RiverSurvival/zones';
import { placePlayers } from './three/RiverSurvival/livePlayers';
import type { BossSceneProps } from './types';

// River Survival "Cướp Lưới" in a live match (03/11/2026).
//
//   - The 3-zone world, Wooden Pens and Tag Net (Antigravity, RiverSurvivalScene.ts).
//   - Players are drawn from the SERVER's survival state (survivalRules.ts via the match channel):
//     free escapers in the clearings, caught ones inside the Wooden Pen, frozen ones blue, pursuers
//     at the net stations; tag / caught / rescued / net events replay as 3D effects.
//   - Actions (tung lưới, cướp lưới, mở chuồng, đóng băng, lấy lại lưới) go to /api/match/action;
//     the server checks every rule and answers with its own reason when refused.
//   - "Thợ giải mã": server-graded Phonetic Stones in the clearing; `decoder_clue` effects unlock the
//     Wooden Pen clue, then the Tag Net clue (beacon + camera to the spot).
//   - Stones never open during the 6 s "Né lưới" / 8 s "Cướp lưới" windows or a class question
//     (survivalStonesOpen); during those windows the question itself is served (classSession urgent).

const DECODER_ZONE: SurvivalZoneId = 'zone_bravo';
const zoneById = (id: SurvivalZoneId) => RIVER_SURVIVAL_ZONES.find((z) => z.id === id)!;

type Live = NonNullable<BossSceneProps['match']>;

export default function LiveRiverSurvival(props: BossSceneProps) {
  const { speech, match, tier = 'high' } = props;
  const host = useRef<HTMLDivElement>(null);
  const envRef = useRef<RiverSurvivalEnvironment | null>(null);
  const rigRef = useRef<PhoneticStonesRig | null>(null);
  const crowdRef = useRef<{ mesh: THREE.InstancedMesh; positions: Map<string, [number, number, number]> } | null>(null);
  const blockedRef = useRef(false);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const [targets, setTargets] = useState<PhoneticStoneTarget[]>([]);
  const [clue, setClue] = useState<{ solved: number; nextAt: number | null; reveals: SurvivalClueReveal[] }>({ solved: 0, nextAt: 2, reveals: [] });
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const machine = useMemo(() => new PhoneticStoneStateMachine({ targets: [], voiceConfig: { enabled: false, lang: 'en-US' } }), []);
  useEffect(() => {
    machine.setSubmitAttempt(speech ? (req) => speech.attempt(req) : () => Promise.reject(new Error('Chưa kết nối máy chủ.')));
  }, [machine, speech]);
  useEffect(() => () => machine.dispose(), [machine]);

  // Server state of this match.
  const view = match?.snap?.view ?? null;
  const me = match?.snap?.me ?? null;
  const survival = view?.survival ?? null;
  const players = useMemo(() => survival?.players ?? {}, [survival]);
  const roster = useMemo(() => view?.roster ?? [], [view]);
  const names = useMemo(() => new Map(roster.map((p) => [p.id, p.nickname])), [roster]);
  const myTeam = me?.team ?? null;
  const mine = me ? players[me.id] : undefined;
  const nowMs = match?.now() ?? 0;
  const dodge = me ? survival?.pendingTags.find((p) => p.escaper === me.id) : undefined;
  const snatchUntil = me?.snatchUntil ?? null;

  // Stones: closed during a class question, the dodge / snatch window, or after the battle.
  const classQuestion = Boolean(speech?.lockDuringQuestion) && Boolean(props.question) && !props.finished;
  const stonesOpen = !props.finished && survivalStonesOpen({ now: nowMs, questionOpen: classQuestion, dodgeUntil: dodge?.until ?? null, snatchUntil });
  useEffect(() => {
    blockedRef.current = !stonesOpen;
  }, [stonesOpen]);

  // Decoder stones: the server's targets (unlock as answers are revealed).
  useEffect(() => {
    if (!speech) return;
    let stale = false;
    speech.load().then(
      (r) => {
        if (stale) return;
        setTargets(r.targets);
        machine.setTargets(r.targets, r.voice);
        rigRef.current?.setTargets(r.targets);
      },
      () => undefined,
    );
    return () => {
      stale = true;
    };
  }, [speech, machine, props.qIndex]);

  useEffect(
    () =>
      machine.bus.on('stone:result', ({ response }) => {
        const env = envRef.current;
        if (!env || response.effect?.kind !== 'decoder_clue') return;
        const r = applySurvivalSpeechEffect(env, response.effect, DECODER_ZONE);
        setClue((c) => ({ solved: r.progress?.solved ?? c.solved, nextAt: r.progress?.nextAt ?? null, reveals: r.reveal ? [...c.reveals, r.reveal] : c.reveals }));
      }),
    [machine],
  );

  // The 3D world.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let runtime: ReturnType<typeof createRuntime>;
    try {
      runtime = createRuntime(el, {
        tier,
        fov: 50,
        near: 0.2,
        far: 320,
        lights: 'outdoor',
        sky: { hdri: 'day', gradient: [0x1e293b, 0x3b2f5c, 0x0f172a] },
        fog: { color: 0x1e293b, near: 28, far: 145 },
        onLowQuality: () => live.current.onLowQuality?.(),
        onSlow: () => live.current.onUnavailable(),
      });
    } catch {
      live.current.onUnavailable();
      return;
    }
    const env = buildRiverSurvivalEnvironment({ tier, director: runtime.director, initialTaggedCount: 0 });
    envRef.current = env;
    runtime.scene.add(env.rootGroup);
    const z = zoneById(DECODER_ZONE);
    runtime.camera.position.set(z.center[0], 16, z.center[2] + 26);
    runtime.camera.lookAt(z.center[0], 0, z.center[2]);

    const rig = createPhoneticStonesRig({ targets: machine.getSnapshot().targets, machine, director: runtime.director, worldMode: 'hub', radius: 2.6, center: [z.center[0], 0, z.center[2]], isBlocked: () => blockedRef.current });
    rigRef.current = rig;
    runtime.scene.add(rig.rootGroup);
    const detach = rig.attachCanvas(runtime.renderer.domElement);

    // One instanced capsule per player (50 max): no per-player meshes.
    const geo = new THREE.CapsuleGeometry(0.32, 0.9, 3, 8);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const mesh = new THREE.InstancedMesh(geo, mat, 50);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    runtime.scene.add(mesh);
    crowdRef.current = { mesh, positions: new Map() };

    runtime.run((dt, t) => {
      env.update(dt, t);
      rig.update(dt, t);
    });
    return () => {
      envRef.current = null;
      rigRef.current = null;
      crowdRef.current = null;
      detach();
      rig.dispose();
      env.dispose();
      geo.dispose();
      mat.dispose();
      runtime.dispose();
    };
  }, [machine, tier]);

  // Server players → 3D.
  useEffect(() => {
    const env = envRef.current;
    const crowd = crowdRef.current;
    if (!env || !crowd) return;
    const ids = Object.keys(players).sort();
    const { out, caught } = placePlayers(ids, players, env, nowMs);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    crowd.positions.clear();
    out.slice(0, 50).forEach((p, i) => {
      m4.makeTranslation(p.pos[0], 0.78, p.pos[2]);
      if (me && p.id === me.id) m4.scale(new THREE.Vector3(1.15, 1.15, 1.15));
      crowd.mesh.setMatrixAt(i, m4);
      crowd.mesh.setColorAt(i, col.setHex(p.color));
      crowd.positions.set(p.id, p.pos);
    });
    crowd.mesh.count = Math.min(50, out.length);
    crowd.mesh.instanceMatrix.needsUpdate = true;
    if (crowd.mesh.instanceColor) crowd.mesh.instanceColor.needsUpdate = true;
    env.mainWoodenPen.setTaggedCount(caught);
    env.tagNet.setOwnerState(Object.values(players).some((p) => p.stolenNet) ? 'snatched' : 'pursuers');
  }, [players, me, nowMs]);

  // Server events → 3D effects (net throw, pen gate on rescue, camera to the pen when caught).
  const seen = useRef(0);
  const events = useMemo(() => match?.events ?? [], [match?.events]);
  useEffect(() => {
    const env = envRef.current;
    const crowd = crowdRef.current;
    if (!env || !crowd) return;
    for (const e of events.slice(seen.current)) {
      if (e.t === 'tag') {
        const from = crowd.positions.get(e.by);
        for (const tid of e.targets) {
          const to = crowd.positions.get(tid);
          if (from && to) env.tagNet.throwNet([from[0], 1, from[2]], [to[0], 0.5, to[2]]);
        }
      } else if (e.t === 'rescued') {
        env.mainWoodenPen.setGateOpen(true);
        setTimeout(() => envRef.current?.mainWoodenPen.setGateOpen(false), 2500);
        env.focusZone(env.mainWoodenPen.zoneId);
      } else if (e.t === 'caught' && me && e.escaper === me.id) {
        env.focusZone(env.mainWoodenPen.zoneId);
      }
    }
    seen.current = events.length;
  }, [events, me]);

  const act = async (a: Parameters<Live['act']>[0]) => {
    if (!match) return;
    setBusy(true);
    setError(null);
    try {
      await match.act(a);
      setPicked([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được.');
    } finally {
      setBusy(false);
    }
  };

  const freeEscapers = Object.entries(players).filter(([, p]) => p.team === 'escapers' && p.free && (p.immuneUntil ?? 0) <= nowMs);
  const hunters = Object.entries(players).filter(([, p]) => p.team === 'pursuers');
  const holders = Object.entries(players).filter(([, p]) => p.stolenNet);
  const caughtCount = Object.values(players).filter((p) => p.team === 'escapers' && !p.free).length;
  const label = (id: string) => names.get(id) ?? '…';
  const lastEvent: SurvivalEvent | undefined = events[events.length - 1];

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" data-testid="live-world-river_survival" />
      <div className="pointer-events-none absolute left-2 top-[104px] z-10 space-y-1 text-[11px] text-white">
        <div className="rounded bg-black/55 px-2 py-1" data-testid="decoder-clues">
          🔎 Thợ giải mã: {clue.solved} đá{clue.nextAt ? ` · manh mối kế ở ${clue.nextAt}` : ' · đủ manh mối'}
          {clue.reveals.map((r) => (
            <div key={r.clue}>{r.clue === 'pen' ? '📍 Đã lộ vị trí Chuồng Gỗ' : '📍 Đã lộ trạm Lưới Gắn Thẻ'}</div>
          ))}
        </div>
        {survival && (
          <div className="rounded bg-black/55 px-2 py-1" data-testid="survival-status">
            Chuồng Gỗ: {caughtCount} bạn · {myTeam === 'pursuers' ? `Đội Săn Tìm · lưới ${me?.charge ?? 0}` : myTeam === 'escapers' ? (mine?.free === false ? 'Em đang ở trong chuồng' : 'Đội Chạy Trốn') : ''}
          </div>
        )}
        {dodge && <div className="rounded bg-rose-600/90 px-2 py-1 font-bold">⚡ Né lưới! Trả lời đúng câu hỏi trước khi hết giờ.</div>}
        {snatchUntil != null && snatchUntil > nowMs && <div className="rounded bg-amber-500/90 px-2 py-1 font-bold text-slate-950">🪢 Cướp lưới: trả lời đúng câu hỏi trong 8 giây!</div>}
        {lastEvent && <div className="rounded bg-black/45 px-2 py-0.5 text-slate-200">{eventLine(lastEvent, label)}</div>}
      </div>

      {match && me && survival && !props.finished && (
        <div className="absolute bottom-2 right-2 z-10 flex max-w-[70%] flex-wrap justify-end gap-1 text-[11px]">
          {myTeam === 'pursuers' && (
            <>
              {freeEscapers.slice(0, 8).map(([id]) => (
                <button key={id} type="button" onClick={() => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)))} className={`min-h-[44px] rounded px-2 font-bold ${picked.includes(id) ? 'bg-orange-400 text-slate-950' : 'bg-black/60 text-white'}`}>
                  {label(id)}
                </button>
              ))}
              <button type="button" disabled={busy || !picked.length} onClick={() => void act({ type: 'tag', targets: picked })} className="min-h-[44px] rounded bg-orange-500 px-3 font-black text-slate-950 disabled:opacity-50">
                🪢 Tung lưới ({picked.length}/2)
              </button>
              {holders.map(([id]) => (
                <button key={id} type="button" disabled={busy} onClick={() => void act({ type: 'retake', target: id })} className="min-h-[44px] rounded bg-amber-300 px-2 font-bold text-slate-950">
                  Lấy lại lưới từ {label(id)}
                </button>
              ))}
            </>
          )}
          {myTeam === 'escapers' && mine?.free && !mine.stolenNet &&
            hunters.map(([id]) => (
              <button key={id} type="button" disabled={busy || snatchUntil != null} onClick={() => void act({ type: 'snatch', target: id })} className="min-h-[44px] rounded bg-amber-400 px-2 font-bold text-slate-950 disabled:opacity-50">
                Cướp lưới của {label(id)}
              </button>
            ))}
          {myTeam === 'escapers' && mine?.free && mine.stolenNet && (
            <>
              <button type="button" disabled={busy || caughtCount === 0} onClick={() => void act({ type: 'rescue' })} className="min-h-[44px] rounded bg-emerald-400 px-3 font-black text-slate-950 disabled:opacity-50">
                🔓 Mở Chuồng Gỗ
              </button>
              {hunters.map(([id]) => (
                <button key={id} type="button" disabled={busy} onClick={() => void act({ type: 'freeze', target: id })} className="min-h-[44px] rounded bg-sky-300 px-2 font-bold text-slate-950">
                  ❄️ Đóng băng {label(id)}
                </button>
              ))}
            </>
          )}
          {error && <div className="w-full rounded bg-rose-700/90 px-2 py-1 text-right text-white">{error}</div>}
        </div>
      )}
      {speech && targets.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 text-center text-[11px] text-slate-200 drop-shadow">Trả lời câu hỏi để mở Đá Phát Âm cho Thợ giải mã</div>
      )}
      <PhoneticStonesHud machine={machine} showMockPresets={false} dialogueMode="survival" />
    </div>
  );
}

function eventLine(e: SurvivalEvent, name: (id: string) => string): string {
  switch (e.t) {
    case 'tag':
      return `${name(e.by)} tung lưới!`;
    case 'dodge_window':
      return `${name(e.escaper)} đang né lưới…`;
    case 'caught':
      return `${name(e.escaper)} vào Chuồng Gỗ.`;
    case 'dodged':
      return `${name(e.escaper)} né được lưới!`;
    case 'snatched':
      return `${name(e.escaper)} cướp được lưới!`;
    case 'snatch_failed':
      return `${name(e.escaper)} cướp lưới hụt.`;
    case 'frozen':
      return `${name(e.target)} bị đóng băng.`;
    case 'rescued':
      return `${name(e.by)} mở chuồng cứu ${e.freed.length} bạn!`;
    case 'net_back':
      return `Lưới đã về tay ${name(e.owner)}.`;
    default:
      return '';
  }
}
