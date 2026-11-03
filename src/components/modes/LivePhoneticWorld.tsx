'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { PhoneticStoneStateMachine, type PhoneticStoneTarget, type VoiceConfig } from '../../client/phoneticStones';
import { CAMP_STATIONS, hashString, type CampStation, type CatchBonus, type SpeechGameEffect } from '../../engine';
import PhoneticStonesHud from '../hud/PhoneticStonesHud';
import { glow, lowpoly, mesh, roughen } from './kit';
import { createRuntime } from './three/SceneRuntime';
import { createPhoneticStonesRig, type FishingLineState, type PhoneticStonesRig } from './three/phoneticStones';
import type { BossSceneProps } from './types';

// Live match 3D (03/11/2026): Summer Camp hub and the River Fishing dock inside a real session.
//
//   - Stones are the server's targets (words of questions already answered, refreshed after each
//     answer); attempts go to POST /api/session/speech. Score, stars, coins and the world effect
//     come back from the server; nothing is graded or paid in the browser (no mock, no presets).
//   - Voice only when the server allows it (`voice.enabled`); typed dictation / listen-and-repeat
//     always work and earn the same progress.
//   - Stones are locked while the question frame is open or the battle is over.
//   - Summer Camp: `camp_station` effects complete the student's stations; in a class match the
//     tent's Quest Board comes from the server broadcast (speech.tentQuest) and drives the 3D board
//     and flag.
//   - River Fishing: `catch_bonus` (pass ×1.0, 2★ ×1.1, 3★ ×1.2) unlocks a cast for that fish; the
//     catch weight is a world effect only; the line tension overlay reads the same numbers as the
//     3D rod (fishingLineState).

type World = 'summer_camp' | 'river_fishing';

const STATION_VI: Record<CampStation, string> = {
  camp_kitchen_station: 'Bếp',
  camp_tent_station: 'Lều',
  camp_water_station: 'Nước',
  camp_firewood_station: 'Củi',
};

interface Catch {
  targetId: string;
  word: string;
  multiplier: CatchBonus;
  kg: number;
}

/** Display weight of a fish (kg): its base from the word, times the server's bonus. */
export function catchWeightKg(targetId: string, multiplier: CatchBonus): number {
  const base = 0.6 + (hashString(`fish:${targetId}`) % 180) / 100; // 0.6 – 2.39 kg
  return Math.round(base * multiplier * 100) / 100;
}

export function LivePhoneticWorld(props: BossSceneProps & { world: World }) {
  const { world, speech, tier = 'high' } = props;
  const host = useRef<HTMLDivElement>(null);
  const rigRef = useRef<PhoneticStonesRig | null>(null);
  const blockedRef = useRef(false);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const [voice, setVoice] = useState<VoiceConfig>({ enabled: false, lang: 'en-US' });
  const [targets, setTargets] = useState<PhoneticStoneTarget[]>([]);
  const [myStations, setMyStations] = useState<CampStation[]>([]);
  const [casts, setCasts] = useState<Record<string, CatchBonus>>({});
  const [catches, setCatches] = useState<Catch[]>([]);
  const [line, setLine] = useState<FishingLineState>({ phase: 'idle', progress: 0, tension: 0 });

  // Attempts are graded on the server; the machine only drives the stone states and the Pet.
  const machine = useMemo(() => new PhoneticStoneStateMachine({ targets: [], voiceConfig: { enabled: false, lang: 'en-US' } }), []);
  useEffect(() => {
    // Never the mock evaluator in a match: without the server the attempt fails (stone → retry).
    machine.setSubmitAttempt(speech ? (req) => speech.attempt(req) : () => Promise.reject(new Error('Chưa kết nối máy chủ.')));
  }, [machine, speech]);

  // Class match: locked while a scheduled question is open (voice never eats the class's question
  // time). Always locked once the battle is over.
  const questionOpen = Boolean(speech?.lockDuringQuestion) && Boolean(props.question) && !props.finished;
  useEffect(() => {
    blockedRef.current = questionOpen || props.finished;
  }, [questionOpen, props.finished]);

  // Targets unlock as answers are revealed: reload after every answered question.
  useEffect(() => {
    if (!speech) return;
    let stale = false;
    speech.load().then(
      (r) => {
        if (stale) return;
        setVoice(r.voice);
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

  // Server world effects.
  useEffect(
    () =>
      machine.bus.on('stone:result', ({ response }) => {
        const e: SpeechGameEffect | undefined = response.effect;
        if (!e) return;
        if (e.kind === 'camp_station') setMyStations((s) => (s.includes(e.stationId) ? s : [...s, e.stationId]));
        if (e.kind === 'catch_bonus') setCasts((c) => ({ ...c, [response.targetId]: e.multiplier }));
      }),
    [machine],
  );

  // Quest Board: the tent's (class) or the student's own (solo).
  const tent = speech?.tentQuest ?? null;
  const done = tent ? tent.done : myStations;
  const progress = done.length / CAMP_STATIONS.length;
  const flag = tent ? tent.flag : done.length === CAMP_STATIONS.length;
  useEffect(() => {
    rigRef.current?.setCampQuestProgress(progress, flag);
  }, [progress, flag]);

  // The 3D world.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const isFishing = world === 'river_fishing';
    let runtime: ReturnType<typeof createRuntime>;
    try {
      runtime = createRuntime(el, {
        tier,
        fov: 48,
        lights: 'outdoor',
        sky: isFishing ? { gradient: [0x0c4a6e, 0x075985, 0x082f49] } : { gradient: [0x1e3a5f, 0x94a3b8, 0x1b4332] },
        fog: { color: isFishing ? 0x082f49 : 0x1e293b, near: 14, far: 48 },
        onLowQuality: () => live.current.onLowQuality?.(),
        onSlow: () => live.current.onUnavailable(),
      });
    } catch {
      live.current.onUnavailable();
      return;
    }
    const { scene, camera, renderer, director } = runtime;
    camera.position.set(0, 3.8, 7.2);
    camera.lookAt(0, 0.9, -1.2);
    const ground = new THREE.Group();
    const turf = mesh(roughen(new THREE.CylinderGeometry(10.5, 11.5, 0.4, 28, 1), 0.05, 7), lowpoly(isFishing ? 0x1e3a2f : 0x1b4332, { rough: 0.95 }), [0, -0.2, -0.8]);
    turf.receiveShadow = true;
    ground.add(turf);
    const ring = mesh(new THREE.RingGeometry(1.4, 4.8, 48), glow(isFishing ? 0x38bdf8 : 0xfbbf24, 0.14, true), [0, 0.02, -0.4]);
    ring.rotation.x = -Math.PI / 2;
    ground.add(ring);
    scene.add(ground);

    const rig = createPhoneticStonesRig({
      targets: machine.getSnapshot().targets,
      machine,
      director,
      worldMode: world,
      radius: 4.1,
      center: [0, 0, -0.4],
      isBlocked: () => blockedRef.current,
    });
    rigRef.current = rig;
    scene.add(rig.rootGroup);
    const detach = rig.attachCanvas(renderer.domElement);
    let lastTension = -1;
    runtime.run((dt, t) => {
      rig.update(dt, t);
      if (isFishing) {
        const l = rig.fishingLine();
        if (Math.abs(l.tension - lastTension) > 0.03 || (l.phase === 'idle') !== (lastTension <= 0)) {
          lastTension = l.phase === 'idle' ? 0 : l.tension;
          setLine(l);
        }
      }
    });
    return () => {
      rigRef.current = null;
      detach();
      rig.dispose();
      runtime.dispose();
    };
  }, [machine, tier, world]);

  useEffect(() => () => machine.dispose(), [machine]);

  const cast = (targetId: string) => {
    const multiplier = casts[targetId];
    if (!multiplier || blockedRef.current) return;
    rigRef.current?.triggerFishingCast(multiplier);
    const word = targets.find((x) => x.targetId === targetId)?.text ?? targetId;
    setCatches((c) => [{ targetId, word, multiplier, kg: catchWeightKg(targetId, multiplier) }, ...c].slice(0, 6));
    setCasts((c) => {
      const next = { ...c };
      delete next[targetId];
      return next;
    });
  };

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" data-testid={`live-world-${world}`} />
      {world === 'summer_camp' && (
        <div className="pointer-events-none absolute left-2 top-[104px] z-10 rounded bg-black/55 px-2 py-1 text-[11px] text-white" data-testid="camp-quest-board">
          <div className="font-bold">{tent ? 'Bảng nhiệm vụ của lều' : 'Bảng nhiệm vụ'} {flag ? '· 🚩 Cờ đã kéo!' : ''}</div>
          <div className="mt-0.5 flex gap-1.5">
            {CAMP_STATIONS.map((s) => (
              <span key={s} className={done.includes(s) ? 'text-emerald-300' : 'text-slate-300'}>
                {done.includes(s) ? '✓' : '○'} {STATION_VI[s]}
                {tent ? ` ${Math.min(tent.stations[s], tent.needed)}/${tent.needed}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {world === 'river_fishing' && (
        <div className="absolute bottom-2 left-2 z-10 max-w-[60%] space-y-1 text-[11px] text-white">
          <div className="pointer-events-none rounded bg-black/55 px-2 py-1" data-testid="fishing-line-tension">
            Dây câu {line.phase === 'casting' ? '· đang kéo' : ''}
            <div className="mt-0.5 h-2 w-32 bg-white/15">
              <div className={`h-full ${line.tension > 0.85 ? 'bg-rose-400' : 'bg-sky-300'}`} style={{ width: `${Math.round(line.tension * 100)}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(casts).map(([id, m]) => (
              <button key={id} type="button" disabled={questionOpen} onClick={() => cast(id)} className="min-h-[44px] rounded bg-sky-500 px-2 font-bold text-slate-950 disabled:opacity-50">
                🎣 Quăng: {targets.find((x) => x.targetId === id)?.text ?? id} ×{m.toFixed(1)}
              </button>
            ))}
          </div>
          {catches.length > 0 && (
            <div className="pointer-events-none rounded bg-black/55 px-2 py-1">
              {catches.map((c, i) => (
                <div key={`${c.targetId}-${i}`}>
                  🐟 {c.word}: {c.kg} kg {c.multiplier > 1 ? `(×${c.multiplier.toFixed(1)})` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {speech && targets.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 text-center text-[11px] text-slate-200 drop-shadow">
          Trả lời câu hỏi để mở Đá Phát Âm {voice.enabled ? '' : '(gõ chữ hoặc nghe và nhắc lại)'}
        </div>
      )}
      <PhoneticStonesHud machine={machine} showMockPresets={false} worldMode={world} />
    </div>
  );
}

export function SummerCampLiveScene(props: BossSceneProps) {
  return <LivePhoneticWorld {...props} world="summer_camp" />;
}

export function RiverFishingLiveScene(props: BossSceneProps) {
  return <LivePhoneticWorld {...props} world="river_fishing" />;
}
