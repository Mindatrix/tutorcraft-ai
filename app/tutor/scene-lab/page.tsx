'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ArrowLeft } from 'lucide-react';
import consequences from '../../../content/consequences_v2.json';
import sceneKits from '../../../content/scene_kits.json';
import { ASSET_ALIASES, ASSET_LIBRARY } from '../../../src/config/assetLibrary';
import { THREE_ASSET_MANIFEST } from '../../../src/config/threeAssets';
import {
  AVATAR_COLORS,
  GameMode,
  STUDENT_LOD,
  WEAK_STUDENT_LOD,
  avatarTemplates,
  lodLevels,
  buildSceneLayout,
  castModels,
  isGameMode,
  planRun,
  type CatalogAsset,
  type SceneKits,
  type LodLevel,
  type ScenarioAssets,
  type StoryCharacter,
} from '../../../src/engine';
import { browserSupabase } from '../../../src/client/supabaseBrowser';
import { playFootstep } from '../../../src/client/audio';
import SoundLab from '../../../src/components/SoundLab';
import type { SoundPlace } from '../../../src/engine/audioPlan';
import { createRuntime, runtimeCounters, type GfxTier, type RuntimeStats } from '../../../src/components/modes/three/SceneRuntime';
import { buildRiverWorld } from '../../../src/components/modes/three/riverWorld';
import { AVATAR_STATES, LodAvatar, avatarMaterialCount, createAvatar, type Avatar } from '../../../src/components/modes/three/avatar';
import { NameBoard } from '../../../src/components/modes/three/nameBoard';
import { playOutcome, type Outcome } from '../../../src/components/modes/three/director';
import { Effects } from '../../../src/components/modes/three/effects';
import { FootprintTrail, FootprintWalker } from '../../../src/components/modes/three/footprints';
import { textSprite } from '../../../src/components/modes/kit';
import { DEMO_BOSS } from '../../../src/engine/demo';

// Scene lab (plan C gate): one river / meadow stage built from a real scenario's data, its 12
// story characters and up to 50 student avatars (3 levels of detail) walking with footprints,
// effects on demand, and the numbers that matter on a weak phone: FPS, draw calls, triangles,
// estimated GPU memory, effect time. "Máy yếu" = pixel ratio 0.75, no shadows, fewer full avatars;
// "Đo 10 giây" measures real frame times and prints them with the device's GPU for a screenshot.
// "Vào ra 10 lần" mounts and unmounts the scene ten times to check nothing leaks. The camera row
// tries the C4 groundwork: dolly to an anchor and back, dimmed background, named outcomes, rails.

const Multiverse = dynamic(() => import('../../../src/components/modes/MultiversePortalRPG'), { ssr: false });
const TeacherBoard = dynamic(() => import('../../../src/components/TeacherBoard'), { ssr: false });
const QuestionLab = dynamic(() => import('../../../src/components/question/QuestionLab'), { ssr: false });
const KayakHudLab = dynamic(() => import('../../../src/components/hud/KayakHudLab'), { ssr: false });
const BossHudLab = dynamic(() => import('../../../src/components/hud/BossHudLab'), { ssr: false });
import type { BoardStats } from '../../../src/components/TeacherBoard';
import AvatarPicker from '../../../src/components/AvatarPicker';
import type { Look, MatchView } from '../../../src/engine';

type Row = ScenarioAssets & { game: string; title: string; tags: string[] | null };

/** Every outcome of content/consequences_v2.json (game · task · correct / wrong / wrongStreak / recover). */
type Games = Record<string, { tasks?: Record<string, Record<string, unknown>> }>;
const OUTCOMES: { key: string; label: string; o: Outcome }[] = Object.entries((consequences as { games: Games }).games).flatMap(([g, v]) =>
  Object.entries(v.tasks ?? {}).flatMap(([task, t]) =>
    (['correct', 'wrong', 'wrongStreak', 'recover'] as const)
      .filter((k) => t[k])
      .map((k) => {
        const o = t[k] as Outcome;
        return { key: `${g}/${task}/${k}`, label: `${g} · ${task} · ${k}: ${o.effect}${o.camera ? ` + ${o.camera}` : ''}`, o };
      }),
  ),
);
/** Anchors the content zooms to (zoom_grill → "grill"…). */
const ZOOM_ANCHORS = Array.from(new Set(OUTCOMES.map((x) => /^zoom_(\w+)$/.exec(x.o.camera ?? '')?.[1]).filter((x): x is string => !!x)));

const SKY: Record<string, { hdri: string; fog: number }> = {
  day: { hdri: 'day', fog: 0xbfe6f2 },
  dawn: { hdri: 'dawn', fog: 0xf0d6bd },
  sunset: { hdri: 'sunset', fog: 0xf3c493 },
  night: { hdri: 'night', fog: 0x1d2a44 },
  cloudy: { hdri: 'cloudy', fog: 0xaebbc6 },
};
function skyFor(tags: string[]): (typeof SKY)[string] {
  if (tags.includes('night')) return SKY.night;
  if (tags.includes('dawn')) return SKY.dawn;
  if (tags.includes('dusk') || tags.includes('sunset')) return SKY.sunset;
  if (tags.includes('storm') || tags.includes('rain')) return SKY.cloudy;
  return SKY.day;
}

interface Hud {
  stats: RuntimeStats | null;
  loading: string;
  world: { drawCalls: number; instances: number; models: number; failed: number } | null;
  avatars: number;
  /** Students per level of detail; models = how many 3D models are actually drawn. */
  lod: { near: number; mid: number; far: number; models: number };
  materials: number;
  fxMs: number;
  footprints: number;
  runtimes: { live: number; created: number };
  heapMb: number | null;
  device?: string;
  measure?: string | null;
}

const field = 'bg-slate-950 border border-slate-700 px-2 py-1 text-sm text-white';

export default function SceneLab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [scenarioId, setScenarioId] = useState('camp-01');
  const [stage, setStage] = useState(1);
  const [tier, setTier] = useState<GfxTier>('high');
  const [weak, setWeak] = useState(false);
  const [outcome, setOutcome] = useState(OUTCOMES[0]?.key ?? '');
  const [focusOn, setFocusOn] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [students, setStudents] = useState(50);
  const [cast, setCast] = useState(true);
  const [seed, setSeed] = useState(20261027);
  const [level, setLevel] = useState(3);
  const [mount, setMount] = useState(0);
  const [view, setView] = useState<'river' | 'cast' | 'board' | 'picker' | 'multiverse' | 'question' | 'hud' | 'hud2'>('river');
  const [hud, setHud] = useState<Hud | null>(null);
  const [leak, setLeak] = useState<string | null>(null);
  const api = useRef<LabApi | null>(null);

  useEffect(() => {
    const sb = browserSupabase();
    if (!sb) return;
    void sb
      .from('game_scenarios')
      .select('id, game, title, stages, asset_ids, tags')
      .eq('active', true)
      .order('id')
      .then(({ data }) => setRows(((data ?? []) as Row[]).filter((r) => r.game !== GameMode.MULTIVERSE_PORTAL_RPG)));
  }, []);

  const leakTest = async () => {
    const before = runtimeCounters();
    const heap = () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
    const h0 = heap();
    for (let i = 0; i < 10; i++) {
      setLeak(`Vào ra lần ${i + 1}/10…`);
      setMount((m) => m + 1);
      await new Promise((r) => setTimeout(r, view === 'river' ? 2500 : 1500));
    }
    await new Promise((r) => setTimeout(r, 1500));
    const after = runtimeCounters();
    const h1 = heap();
    setLeak(`10 lần vào ra: tạo thêm ${after.created - before.created} runtime, đang sống ${after.live} (phải là 1)${h0 && h1 ? ` · heap JS ${(h0 / 1e6).toFixed(0)} → ${(h1 / 1e6).toFixed(0)} MB` : ''}`);
  };

  const row = rows.find((r) => r.id === scenarioId);

  return (
    <main className="min-h-screen bg-slate-900 p-4 text-slate-100">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/tutor" className="inline-flex items-center gap-1 text-sm text-slate-300 hover:text-white">
          <ArrowLeft size={16} /> Gia sư
        </Link>
        <h1 className="mr-4 text-lg font-extrabold">Thử cảnh 3D (giai đoạn C)</h1>
        <select
          className={field}
          value={view}
          onChange={(e) => {
            setHud(null);
            setView(e.target.value as 'river' | 'cast' | 'board' | 'picker' | 'multiverse' | 'question');
          }}
        >
          <option value="river">Thế giới sông / đồng cỏ</option>
          <option value="cast">12 nhân vật truyện (kiểm trùng)</option>
          <option value="board">Màn hình gia sư (50 em)</option>
          <option value="picker">Chọn avatar</option>
          <option value="multiverse">Multiverse (kiểm tách lõi)</option>
          <option value="question">Khung hỏi + RainbowEdge (C4)</option>
          <option value="hud">HUD Kayak (WP10)</option>
          <option value="hud2">HUD 5 game còn lại (WP10)</option>
        </select>
        {(view === 'river' || view === 'cast') && (
          <select className={field} value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.title}
              </option>
            ))}
          </select>
        )}
        {view === 'river' && (
          <>
            <select className={field} value={stage} onChange={(e) => setStage(Number(e.target.value))}>
              {Array.from({ length: 8 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Chặng {i + 1}
                </option>
              ))}
            </select>
            <select className={field} value={students} onChange={(e) => setStudents(Number(e.target.value))}>
              {[0, 12, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n} học sinh
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={cast} onChange={(e) => setCast(e.target.checked)} /> 12 nhân vật truyện
            </label>
            <input className={`${field} w-28`} type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 1)} title="seed bố cục" />
            <select className={field} value={level} onChange={(e) => setLevel(Number(e.target.value))} title="cấp độ (bộ cảnh WP4)">
              {[0, 1, 2, 3, 4, 5, 6].map((l) => (
                <option key={l} value={l}>
                  Cấp {l}
                </option>
              ))}
            </select>
          </>
        )}
        <select className={field} value={tier} onChange={(e) => setTier(e.target.value as GfxTier)}>
          <option value="high">Bản cao</option>
          <option value="low">Bản thấp</option>
        </select>
        {view === 'river' && (
          <label className="flex items-center gap-1 text-sm" title="pixel ratio 0,75 · tắt bóng · 3 bạn đầy đủ + 6 bạn bản nhẹ · tầm nhìn ngắn">
            <input type="checkbox" checked={weak} onChange={(e) => setWeak(e.target.checked)} /> Máy yếu
          </label>
        )}
        {view === 'river' && (
          <button
            type="button"
            disabled={measuring}
            className="bg-emerald-400 px-3 py-1 text-sm font-bold text-slate-900 disabled:opacity-60"
            onClick={() => {
              if (!api.current) return;
              setMeasuring(true);
              void api.current.measure(10).finally(() => setMeasuring(false));
            }}
          >
            {measuring ? 'Đang đo…' : 'Đo 10 giây'}
          </button>
        )}
        <button type="button" className="bg-amber-400 px-3 py-1 text-sm font-bold text-slate-900" onClick={() => void leakTest()}>
          Vào ra 10 lần
        </button>
      </div>
      {view === 'river' && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          {['splash', 'bubbles', 'correct', 'wrong', 'fireworks', 'happy', 'sad', 'run'].map((k) => (
            <button key={k} type="button" className="border border-slate-600 px-2 py-1 hover:bg-slate-800" onClick={() => api.current?.fx(k)}>
              {k}
            </button>
          ))}
          <span className="mx-1 text-slate-500">|</span>
          <button type="button" className="border border-sky-600 px-2 py-1 hover:bg-slate-800" onClick={() => api.current?.dolly()}>
            Dolly 0,4 s
          </button>
          <button type="button" className={`border border-sky-600 px-2 py-1 hover:bg-slate-800 ${focusOn ? 'bg-sky-900' : ''}`} onClick={() => setFocusOn(api.current?.focus() ?? false)}>
            {focusOn ? 'Bỏ làm tối' : 'Làm tối nền'}
          </button>
          <button type="button" className="border border-sky-600 px-2 py-1 hover:bg-slate-800" onClick={() => api.current?.rail()}>
            Đường ray
          </button>
          <select className={`${field} max-w-[22rem]`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="border border-sky-600 px-2 py-1 hover:bg-slate-800"
            onClick={() => {
              const x = OUTCOMES.find((y) => y.key === outcome);
              if (x) api.current?.outcome(x.o);
            }}
          >
            Chạy hệ quả
          </button>
        </div>
      )}
      {leak && <p className="mb-2 text-sm text-amber-300">{leak}</p>}
      <div className="relative h-[70vh] w-full overflow-hidden bg-black">
        {view === 'river' && row && (
          <RiverStage key={`${mount}-${scenarioId}-${stage}-${tier}-${weak}-${students}-${cast}-${seed}-${level}`} row={row} stage={stage} tier={tier} weak={weak} students={students} cast={cast} seed={seed} level={level} onHud={setHud} apiRef={api} />
        )}
        {view === 'cast' && row && <CastStage key={`cast-${mount}-${scenarioId}-${tier}`} row={row} tier={tier} />}
        {view === 'multiverse' && <MultiverseStage key={`mv-${mount}-${tier}`} tier={tier} onHud={setHud} />}
        {view === 'board' && <BoardStage key={`board-${mount}-${tier}-${students}`} tier={tier} students={students || 50} onHud={setHud} />}
        {view === 'picker' && <PickerStage />}
        {view === 'question' && <QuestionLab key={`q-${mount}`} tier={tier} />}
        {view === 'hud' && <KayakHudLab key={`hud-${mount}`} />}
        {view === 'hud2' && <BossHudLab key={`hud2-${mount}`} />}
        {hud && (
          <pre className="pointer-events-none absolute left-2 top-2 max-w-[calc(100%-1rem)] whitespace-pre-wrap bg-black/70 p-2 text-[11px] leading-4 text-emerald-200">
            {[
              `FPS ${hud.stats?.fps ?? '…'} · khung ${hud.stats?.frameMs ?? '…'} ms · tầng ${hud.stats?.tier ?? tier}${weak && view === 'river' ? ' (máy yếu)' : ''}`,
              `draw call ${hud.stats?.calls ?? '…'} · tam giác ${hud.stats ? Math.round(hud.stats.triangles / 1000) : '…'} nghìn`,
              `bộ nhớ đồ họa ~${hud.stats?.textureMB ?? '…'} MB ảnh + ${hud.stats?.geometryMB ?? '…'} MB lưới · ${hud.stats?.textures ?? '…'} ảnh, ${hud.stats?.geometries ?? '…'} lưới · pixel ratio ${hud.stats?.pixelRatio ?? '…'}`,
              hud.world ? `cảnh: ${hud.world.models} mô hình, ${hud.world.instances} vật, ${hud.world.drawCalls} lần vẽ${hud.world.failed ? `, lỗi ${hud.world.failed}` : ''}` : hud.loading,
              `avatar ${hud.avatars}: gần ${hud.lod.near} · vừa ${hud.lod.mid} · xa ${hud.lod.far} (chỉ tên + màu) · đang vẽ ${hud.lod.models} mô hình · vật liệu màu ${hud.materials}`,
              `hiệu ứng ${hud.fxMs.toFixed(2)} ms/khung · dấu chân ${hud.footprints}`,
              `runtime đang sống ${hud.runtimes.live} / đã tạo ${hud.runtimes.created}${hud.heapMb ? ` · heap ${hud.heapMb} MB` : ''}`,
              ...(hud.device ? [hud.device] : []),
              ...(hud.measure ? [hud.measure] : []),
            ].join('\n')}
          </pre>
        )}
      </div>
      <SoundLab key={row?.game ?? 'menu'} initial={(row?.game as SoundPlace | undefined) ?? 'summer_camp'} />
    </main>
  );
}

function heapMb(): number | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1e6) : null;
}

interface LabApi {
  fx: (kind: string) => void;
  dolly: () => void;
  focus: () => boolean;
  rail: () => void;
  outcome: (o: Outcome) => void;
  measure: (seconds: number) => Promise<string>;
}

/** GPU name, pixel ratio, screen, cores, memory: what a phone screenshot must show. */
function deviceLine(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  return `${gpu} · DPR ${window.devicePixelRatio} · ${window.innerWidth}×${window.innerHeight} · ${navigator.hardwareConcurrency ?? '?'} lõi${mem ? ` · RAM ${mem} GB` : ''}`;
}

function RiverStage(props: { row: Row; stage: number; tier: GfxTier; weak: boolean; students: number; cast: boolean; seed: number; level: number; onHud: (h: Hud) => void; apiRef: { current: LabApi | null } }) {
  const host = useRef<HTMLDivElement>(null);
  const { row, stage, tier, weak, students, cast, seed, level, onHud, apiRef } = props;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const tags = row.tags ?? [];
    const sky = skyFor(tags);
    // Weak-device mode: low tier (no shadows, gradient sky), pixel ratio 0.75, shorter view, 3 + 6 avatars.
    const useTier: GfxTier = weak ? 'low' : tier;
    const budget = weak ? WEAK_STUDENT_LOD : STUDENT_LOD;
    const rt = createRuntime(el, {
      tier: useTier,
      probe: 'manual',
      maxPixelRatio: weak ? 0.75 : undefined,
      lights: 'outdoor',
      sky: { hdri: sky.hdri, gradient: [0x5aa9e6, sky.fog, 0x7aa25a] },
      fog: weak ? { color: sky.fog, near: 20, far: 95 } : { color: sky.fog, near: 30, far: 170 },
      far: weak ? 300 : 500,
      fov: 55,
    });
    if (sky.hdri === 'night') {
      rt.hemi!.intensity = 0.35;
      rt.sun!.intensity = 0.5;
      rt.sun!.color.set(0x9db4ff);
    }
    let alive = true;
    const game = isGameMode(row.game) ? row.game : GameMode.SUMMER_CAMP_QUESTS;
    const plan = planRun({ game, scenarioId: row.id, tags, seedKey: `lab#${seed}` });
    const stages = [stage - 1, stage, stage + 1].filter((n) => n >= 1 && n <= 8);
    const layout = buildSceneLayout({ scenario: row, catalog: ASSET_LIBRARY as CatalogAsset[], aliases: ASSET_ALIASES, layoutSeed: plan.layoutSeed, quality: useTier, stages, current: stage, fallbackNature: THREE_ASSET_MANIFEST.riverWorld.natureIds, kits: sceneKits as SceneKits, level });
    const area = layout.stages.find((s) => s.n === stage)!;
    const world = buildRiverWorld({ layout, stages, tier: useTier, fogColor: sky.fog, onProgress: (d, t) => (hud.loading = `Đang nạp mô hình ${d}/${t}`) });
    rt.scene.add(world.group);
    const hud: Hud = { stats: null, loading: 'Đang nạp mô hình…', world: null, avatars: 0, lod: { near: 0, mid: 0, far: 0, models: 0 }, materials: 0, fxMs: 0, footprints: 0, runtimes: runtimeCounters(), heapMb: heapMb(), device: deviceLine(rt.renderer), measure: null };
    void world.ready.then((r) => {
      hud.world = { drawCalls: r.drawCalls, instances: r.instances, models: r.models, failed: r.failed.length };
      // Measure the frame rate once the river and the avatars are in (not while decoding).
      setTimeout(() => alive && rt.armProbe(), 2500);
    });

    const focal = new THREE.Vector3(area.focal.x, 0, area.focal.z);
    const side = area.focal.side;
    rt.camera.position.set(-side * 4, 9, area.focal.z + 22);
    const controls = new OrbitControls(rt.camera, rt.renderer.domElement);
    controls.target.copy(focal);
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();
    if (rt.sun) {
      rt.sun.position.set(focal.x + 30, 50, focal.z + 20);
      rt.sun.target.position.copy(focal);
    }

    const effects = new Effects();
    rt.scene.add(effects.group);
    const trail = new FootprintTrail({ surface: game === GameMode.DINO_JOURNEY ? 'mud' : 'sand', max: 600 });
    rt.scene.add(trail.mesh);
    // Every zoom_<anchor> of the content points at the scene's focal spot until the game places its own.
    const spot = new THREE.Object3D();
    spot.position.copy(focal).add(new THREE.Vector3(side * 2, 0, 0));
    rt.scene.add(spot);
    for (const a of ZOOM_ANCHORS) rt.director.setAnchor(a, spot);

    // Story cast: a half circle behind the focal point.
    const castList: Avatar[] = [];
    if (cast) {
      void browserSupabase()
        ?.from('scenario_characters')
        .select('scenario_id, slot, name, age_group, gender, clothing_text, outfit_color')
        .eq('scenario_id', row.id)
        .order('slot')
        .then(async ({ data }) => {
          const chars = (data ?? []) as (StoryCharacter & { name: string })[];
          const models = castModels(game, chars);
          await Promise.all(
            chars.map(async (c, i) => {
              const m = models.get(c.slot)!;
              const h = castHeight(m.model, c.age_group);
              const a = await createAvatar({ model: m.model, color: m.tint, tintMix: 0.3, ring: false, height: h, quality: useTier }).catch(() => null);
              if (!a || !alive) return;
              const ang = Math.PI * (0.15 + (0.7 * i) / Math.max(1, chars.length - 1));
              a.root.position.set(focal.x + side * Math.sin(ang) * 7, 0, focal.z - Math.cos(ang) * 9);
              a.root.lookAt(focal.x, 0, focal.z + 6);
              const label = textSprite(c.name, { bg: 'rgba(15,23,42,.75)', height: 0.38 });
              label.position.y = h + 0.35;
              a.root.add(label);
              rt.scene.add(a.root);
              castList.push(a);
              if (c.slot === 1) rt.director.setAnchor('cast', a.root);
            }),
          );
        });
    }

    // Students: unique look each (template × colour), wandering around the focal area. Level of
    // detail (plan C2): the few nearest are full models, the next ones the ~5 k triangle file, the
    // rest only their name and a coloured ring + dot. All names are one draw call (NameBoard).
    interface Kid {
      lod: LodAvatar;
      target: THREE.Vector3;
      wait: number;
      walker: FootprintWalker;
      color: THREE.Color;
      level: LodLevel;
    }
    const kids: Kid[] = [];
    const templates = avatarTemplates(game);
    const names = new NameBoard(Math.max(1, students), { width: 1.5, height: 0.38 });
    rt.scene.add(names.mesh);
    const ringGeo = new THREE.CircleGeometry(0.4, 20).rotateX(-Math.PI / 2);
    const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }), Math.max(1, students));
    const dotGeo = new THREE.SphereGeometry(0.28, 10, 8);
    const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, students));
    rings.count = 0;
    dots.count = 0;
    rings.frustumCulled = false;
    dots.frustumCulled = false;
    rt.scene.add(rings, dots);
    const bankPoint = () => new THREE.Vector3(focal.x + side * (Math.random() * 10 - 4), 0, focal.z + (Math.random() - 0.5) * 26);
    for (let i = 0; i < students; i++) {
      const t = templates[i % templates.length];
      const col = AVATAR_COLORS[Math.floor(i / templates.length) % AVATAR_COLORS.length];
      const lod = new LodAvatar({ model: t.model, color: col.hex, tintMix: 0.55, ring: false, height: t.kind === 'dino' ? 1.5 : 1.35, nearQuality: useTier });
      lod.root.position.copy(bankPoint());
      rt.scene.add(lod.root);
      names.set(i, `Em ${i + 1}`, col.hex);
      kids.push({ lod, target: bankPoint(), wait: Math.random() * 2, walker: new FootprintWalker(trail, 0.5), color: new THREE.Color(col.hex), level: 'far' });
    }
    // WP2: the first child's feet make the footstep sound (one player only, as in a game).
    if (kids[0]) kids[0].lod.onStep = () => void playFootstep();

    const camPos = new THREE.Vector3();
    const nearestKid = () => {
      rt.camera.getWorldPosition(camPos);
      return [...kids].filter((k) => k.lod.shown).sort((a, b) => a.lod.root.position.distanceTo(camPos) - b.lod.root.position.distanceTo(camPos))[0] ?? null;
    };
    let focused = false;
    const meas = { until: 0, last: 0, gaps: [] as number[], done: null as ((s: string) => void) | null };
    apiRef.current = {
      fx: (k) => {
        const at = focal.clone().add(new THREE.Vector3(0, 1, 0));
        if (k === 'splash') effects.splash(new THREE.Vector3(0, 0, focal.z));
        else if (k === 'bubbles') effects.bubbles(new THREE.Vector3(side * 2, -0.1, focal.z), 4);
        else if (k === 'correct') effects.correct(at);
        else if (k === 'wrong') effects.wrong(at);
        else if (k === 'fireworks') effects.fireworks(new THREE.Vector3(0, 0, focal.z - 10));
        else for (const kid of kids) kid.lod.setState(k as (typeof AVATAR_STATES)[number]);
      },
      dolly: () => void rt.director.dollyTo(rt.director.anchors.get('cast') ?? spot, { hold: 1.2 }),
      focus: () => {
        focused = !focused;
        if (!focused) rt.director.clearFocus();
        else {
          const k = nearestKid();
          const castRoot = rt.director.anchors.get('cast') as THREE.Object3D | undefined;
          rt.director.focus([k?.lod.root, castRoot].filter((x): x is THREE.Object3D => !!x));
        }
        return focused;
      },
      rail: () => {
        rt.camera.getWorldPosition(camPos);
        // A Multiverse-style crossing: swoop over the river, past the far bank and back.
        void rt.director.rideRail(
          [camPos.clone(), new THREE.Vector3(-side * 6, 6, focal.z + 8), new THREE.Vector3(0, 2.5, focal.z), new THREE.Vector3(side * 9, 4, focal.z - 12), new THREE.Vector3(side * 2, 7, focal.z - 22), camPos.clone()],
          { seconds: 4, look: 'ahead' },
        );
      },
      outcome: (o) => {
        const k = nearestKid();
        const at = (k?.lod.root.position ?? focal).clone().add(new THREE.Vector3(0, 1, 0));
        void playOutcome(rt, effects, o, at, k?.lod);
      },
      measure: (seconds) =>
        new Promise((resolve) => {
          meas.gaps = [];
          meas.last = 0;
          meas.until = performance.now() + seconds * 1000;
          meas.done = resolve;
        }),
    };

    // Dev only: inspect the scene from the browser console.
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __lab?: unknown }).__lab = { rt, kids, castList, world, layout, THREE };
    const m = new THREE.Matrix4();
    const tmp = new THREE.Vector3();
    let fxMax = 0;
    let lastHud = 0;
    let lastLod = -1;
    let clock = 0;
    rt.run((dt, t) => {
      clock = t;
      if (meas.done) {
        const now = performance.now();
        if (meas.last) meas.gaps.push(now - meas.last);
        meas.last = now;
        if (now >= meas.until) {
          const report = measureReport(meas.gaps, rt.stats());
          hud.measure = report;
          meas.done(report);
          meas.done = null;
        }
      }
      world.update(dt, t);
      controls.update();
      rt.camera.getWorldPosition(camPos);
      if (t - lastLod > 0.3) {
        lastLod = t;
        const levels = lodLevels(
          kids.map((k) => k.lod.root.position.distanceTo(camPos)),
          budget,
        );
        kids.forEach((k, i) => {
          k.level = levels[i];
          k.lod.setLevel(levels[i]);
        });
      }
      const lod = { near: 0, mid: 0, far: 0, models: 0 };
      rings.count = kids.length;
      dots.count = kids.length;
      kids.forEach((k, i) => {
        const p = k.lod.root.position;
        const d = k.target.clone().sub(p);
        d.y = 0;
        if (k.wait > 0) {
          k.wait -= dt;
          if (k.lod.state === 'run') k.lod.setState('idle');
          if (k.wait <= 0) k.target = bankPoint();
        } else if (d.length() < 0.3) {
          k.wait = 1 + Math.random() * 3;
          if (Math.random() < 0.25) k.lod.setState((['happy', 'correct', 'wrong', 'sad'] as const)[Math.floor(Math.random() * 4)]);
        } else {
          if (k.lod.state === 'idle') k.lod.setState('run');
          d.normalize();
          p.addScaledVector(d, Math.min(1.6 * dt, d.length() * 10));
          k.lod.root.rotation.y = Math.atan2(d.x, d.z);
          k.walker.step(p, t);
        }
        lod[k.level]++;
        const shown = k.lod.shown;
        if (!shown && i === 0) k.lod.update(dt); // WP2: the footstep child keeps time while far
        if (shown) {
          lod.models++;
          k.lod.update(dt);
        }
        names.place(i, tmp.copy(p).setY(shown ? 1.95 : 1.55));
        rings.setMatrixAt(i, m.makeTranslation(p.x, 0.03, p.z));
        rings.setColorAt(i, k.color);
        dots.setMatrixAt(i, shown ? m.makeScale(0, 0, 0) : m.makeTranslation(p.x, 1.1, p.z));
        dots.setColorAt(i, k.color);
      });
      rings.instanceMatrix.needsUpdate = true;
      dots.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      for (const c of castList) c.update(dt);
      trail.update(t);
      fxMax = Math.max(fxMax, effects.update(dt));
      if (t - lastHud > 0.5) {
        lastHud = t;
        hud.stats = rt.stats();
        hud.avatars = kids.length + castList.length;
        hud.lod = lod;
        hud.materials = avatarMaterialCount();
        hud.fxMs = fxMax;
        hud.footprints = trail.visible(clock);
        hud.runtimes = runtimeCounters();
        hud.heapMb = heapMb();
        fxMax = 0;
        onHud({ ...hud });
      }
    });

    return () => {
      alive = false;
      apiRef.current = null;
      controls.dispose();
      world.dispose();
      effects.dispose();
      trail.dispose();
      names.dispose();
      for (const k of kids) k.lod.dispose();
      for (const c of castList) c.dispose();
      rt.dispose();
    };
  }, [row, stage, tier, weak, students, cast, seed, level, onHud, apiRef]);

  return <div ref={host} className="absolute inset-0" />;
}

/** Real frame times over the measuring window (requestAnimationFrame gaps, not the clamped dt). */
function measureReport(gaps: number[], s: RuntimeStats): string {
  if (gaps.length < 2) return 'Đo: không đủ khung hình';
  const total = gaps.reduce((a, b) => a + b, 0);
  const sorted = [...gaps].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  // Worst one-second window.
  let worst = Infinity;
  let acc = 0;
  let n = 0;
  for (const g of gaps) {
    acc += g;
    n++;
    if (acc >= 1000) {
      worst = Math.min(worst, (n * 1000) / acc);
      acc = 0;
      n = 0;
    }
  }
  const avg = (gaps.length * 1000) / total;
  return [
    `ĐO ${(total / 1000).toFixed(1)} s: FPS trung bình ${avg.toFixed(1)} · giây tệ nhất ${Number.isFinite(worst) ? worst.toFixed(1) : '—'} · khung p95 ${p95.toFixed(1)} ms · tệ nhất ${sorted[sorted.length - 1].toFixed(0)} ms`,
    `   ${s.calls} draw call · ${Math.round(s.triangles / 1000)} nghìn tam giác · ~${s.textureMB} MB ảnh + ${s.geometryMB} MB lưới · pixel ratio ${s.pixelRatio} · tầng ${s.tier}`,
  ].join('\n');
}

/** Story character height (m): dinosaurs bigger, adults taller than children. */
function castHeight(model: string, age: string | null | undefined): number {
  const adult = age === 'adult' || age === 'elder';
  return /^dino_/.test(model) ? (adult ? 3.6 : 1.8) : adult ? 1.75 : 1.4;
}

interface CastEntry {
  slot: number;
  name: string;
  model: string;
  tint: string | null;
  source: string;
  age: string;
  gender: string;
  avatar: Avatar | null;
}

/**
 * The 12 story characters of one scenario in a row, each with its slot, name, model and outfit
 * colour, to check by eye that no two look alike. snap() (dev console / capture) renders a
 * contact sheet: one framed cell per character with a caption, as a JPEG data URL.
 */
function CastStage({ row, tier }: { row: Row; tier: GfxTier }) {
  const host = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState('Đang nạp nhân vật…');
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const rt = createRuntime(el, { tier, probe: 'manual', lights: 'outdoor', sky: { gradient: [0x9fd3f7, 0xeef7ff, 0xc9dfb4] }, fov: 28, far: 300 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8e8c4, roughness: 1 }));
    ground.receiveShadow = true;
    rt.scene.add(ground);
    let alive = true;
    const game = isGameMode(row.game) ? row.game : GameMode.SUMMER_CAMP_QUESTS;
    const state = { ready: false, chars: [] as CastEntry[], summary: '' };
    const labels: THREE.Sprite[] = [];
    void browserSupabase()
      ?.from('scenario_characters')
      .select('scenario_id, slot, name, age_group, gender, clothing_text, outfit_color')
      .eq('scenario_id', row.id)
      .order('slot')
      .then(async ({ data }) => {
        const chars = ((data ?? []) as (StoryCharacter & { name: string })[]).sort((a, b) => a.slot - b.slot);
        const models = castModels(game, chars);
        const dino = chars.some((c) => /^dino_/.test(models.get(c.slot)!.model));
        const gap = dino ? 5 : 2.6;
        state.chars = chars.map((c) => {
          const m = models.get(c.slot)!;
          return { slot: c.slot, name: c.name, model: m.model, tint: m.tint, source: m.source, age: String(c.age_group ?? ''), gender: String(c.gender ?? ''), avatar: null };
        });
        await Promise.all(
          state.chars.map(async (e, i) => {
            const h = castHeight(e.model, e.age);
            const a = await createAvatar({ model: e.model, color: e.tint, tintMix: 0.3, ring: false, height: h, quality: 'high' }).catch(() => null);
            if (!a || !alive) return;
            a.root.position.set((i - (state.chars.length - 1) / 2) * gap, 0, 0);
            const top = textSprite(`${e.slot}. ${e.name}`, { bg: e.tint ?? 'rgba(15,23,42,.85)', height: 0.3 });
            top.position.y = h + 0.3;
            labels.push(top);
            a.root.add(top);
            rt.scene.add(a.root);
            e.avatar = a;
          }),
        );
        const counts = new Map<string, number>();
        for (const c of state.chars) counts.set(c.model, (counts.get(c.model) ?? 0) + 1);
        const dup = [...counts].filter(([, n]) => n > 1);
        state.summary = `${state.chars.length} nhân vật, ${counts.size} mô hình khác nhau${dup.length ? ` · dùng lại: ${dup.map(([k, n]) => `${k} ×${n}`).join(', ')}` : ' · không mô hình nào lặp'}`;
        setInfo(`${row.id}: ${state.summary}`);
        const span = state.chars.length * gap;
        rt.camera.position.set(0, dino ? 6 : 3.2, span * 0.95);
        rt.camera.lookAt(0, dino ? 1.6 : 0.9, 0);
        state.ready = true;
      });
    rt.run((dt) => {
      for (const c of state.chars) c.avatar?.update(dt);
    });

    /** One framed cell per character + caption (slot, name, age / gender, model, colour). */
    const snap = (cols = 6, cellW = 420, cellH = 560) => {
      const r = rt.renderer;
      const list = state.chars;
      const rows = Math.ceil(list.length / cols);
      const capH = 92;
      const titleH = 64;
      const prevDpr = r.getPixelRatio();
      r.setPixelRatio(1);
      r.setSize(cols * cellW, rows * cellH, false);
      r.setScissorTest(true);
      for (const l of labels) l.visible = false;
      const cam = new THREE.PerspectiveCamera(28, cellW / cellH, 0.1, 300);
      const box = new THREE.Box3();
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      const vHalf = Math.tan(THREE.MathUtils.degToRad(14));
      // Let every clip finish fading in, then draw the sheet twice: the first pass after a resize
      // can frame a cell on stale matrices.
      for (let k = 0; k < 8; k++) for (const c of list) c.avatar?.update(0.125);
      for (const pass of [0, 1]) list.forEach((c, i) => {
        void pass;
        if (!c.avatar) return;
        const x = (i % cols) * cellW;
        const y = (rows - 1 - Math.floor(i / cols)) * cellH;
        r.setViewport(x, y, cellW, cellH);
        r.setScissor(x, y, cellW, cellH);
        box.setFromObject(c.avatar.body).getSize(size);
        box.getCenter(center);
        const d = Math.max((size.y * 1.15) / (2 * vHalf), (Math.max(size.x, size.z) * 1.15) / (2 * vHalf * cam.aspect)) + size.z / 2;
        const dir = new THREE.Vector3(0.3, 0.18, 1).normalize();
        cam.position.copy(center).addScaledVector(dir, d);
        cam.lookAt(center);
        r.render(rt.scene, cam);
      });
      const out = document.createElement('canvas');
      out.width = cols * cellW;
      out.height = titleH + rows * (cellH + capH);
      const g = out.getContext('2d')!;
      g.fillStyle = '#0f172a';
      g.fillRect(0, 0, out.width, out.height);
      g.fillStyle = '#fff';
      g.font = '800 30px "Be Vietnam Pro", system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillText(`${row.id} · ${row.title} — ${state.summary}`, 20, titleH / 2);
      const counts = new Map<string, number>();
      for (const c of list) counts.set(c.model, (counts.get(c.model) ?? 0) + 1);
      list.forEach((c, i) => {
        const col = i % cols;
        const rw = Math.floor(i / cols);
        const dx = col * cellW;
        const dy = titleH + rw * (cellH + capH);
        g.drawImage(r.domElement, col * cellW, rw * cellH, cellW, cellH, dx, dy, cellW, cellH);
        const repeated = (counts.get(c.model) ?? 0) > 1;
        g.fillStyle = repeated ? '#7f1d1d' : '#1e293b';
        g.fillRect(dx, dy + cellH, cellW, capH);
        g.fillStyle = c.tint ?? '#64748b';
        g.fillRect(dx + 12, dy + cellH + 14, 26, 26);
        g.fillStyle = '#fff';
        g.font = '800 26px "Be Vietnam Pro", system-ui, sans-serif';
        g.fillText(`${c.slot}. ${c.name}`, dx + 48, dy + cellH + 27);
        g.font = '600 19px "Be Vietnam Pro", system-ui, sans-serif';
        g.fillStyle = repeated ? '#fecaca' : '#cbd5e1';
        g.fillText(`${c.model.replace(/^char_/, '')}${repeated ? ' (lặp)' : ''} · ${c.age}/${c.gender}`, dx + 12, dy + cellH + 62);
        g.strokeStyle = '#0f172a';
        g.lineWidth = 4;
        g.strokeRect(dx, dy, cellW, cellH + capH);
      });
      r.setScissorTest(false);
      for (const l of labels) l.visible = true;
      r.setPixelRatio(prevDpr);
      r.setSize(rt.size.w, rt.size.h, false);
      return out.toDataURL('image/jpeg', 0.9);
    };
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __lab?: unknown }).__lab = { rt, state, snap };
    return () => {
      alive = false;
      for (const c of state.chars) c.avatar?.dispose();
      rt.dispose();
    };
  }, [row, tier]);
  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <p className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 text-xs text-amber-200">{info}</p>
    </>
  );
}

function MultiverseStage({ tier, onHud }: { tier: GfxTier; onHud: (h: Hud) => void }) {
  useEffect(() => {
    const id = setInterval(() => onHud({ stats: null, loading: 'Multiverse (số liệu runtime bên dưới)', world: null, avatars: 0, lod: { near: 0, mid: 0, far: 0, models: 0 }, materials: 0, fxMs: 0, footprints: 0, runtimes: runtimeCounters(), heapMb: heapMb() }), 500);
    return () => clearInterval(id);
  }, [onHud]);
  return (
    <Multiverse
      boss={DEMO_BOSS}
      heroName="Thử"
      topic="Lab"
      bossHp={800}
      bossMax={1000}
      hp={90}
      hpMax={100}
      shield={false}
      event={null}
      bossPhase={1}
      enraged={false}
      qIndex={2}
      qTotal={10}
      results={[true, false]}
      combo={1}
      finished={false}
      outcome={null}
      question={null}
      removed={[]}
      tier={tier}
      onUnavailable={() => undefined}
    />
  );
}

/** A fake class for the tutor board: n students, teams 60/40, stars going up, someone just answered. */
function fakeView(n: number, tick: number): MatchView {
  const templates = avatarTemplates(GameMode.RIVER_SURVIVAL);
  const roster = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    nickname: ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khoa', 'Lan', 'Minh', 'Ngọc'][i % 10] + ` ${i + 1}`,
    avatar: '🐣',
    team: i < Math.round(n * 0.6) ? 'escapers' : 'pursuers',
    grp: Math.floor((i % Math.round(n * 0.6)) / 5) + 1,
    species: templates[i % templates.length].id,
    color: AVATAR_COLORS[Math.floor(i / templates.length) % 12].hex,
    online: i % 17 !== 5,
    left: false,
  }));
  const players: Record<string, number> = {};
  roster.forEach((p, i) => (players[p.id] = ((i * 7 + tick * 3) % 23) + tick));
  return {
    id: 'lab', status: 'running', game: GameMode.RIVER_SURVIVAL, scenarioId: 'surv-01', level: 3, serverNow: Date.now(), runPlan: null, play: null, seq: tick, survival: null, result: null, muted: false,
    time: { status: 'running', startedAt: Date.now() - 60_000, pausedAt: null, pausedMs: 0, endedAt: null, stageMs: 300_000, coreStages: 6, extraStages: 2, extended: false },
    roster,
    scores: { players, correct: players, teams: {}, recent: [`p${(tick * 7) % n}`, `p${(tick * 11) % n}`] },
  };
}

function BoardStage({ tier, students, onHud }: { tier: GfxTier; students: number; onHud: (h: Hud) => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);
  const onStats = useCallback(
    (s: BoardStats) =>
      onHud({ stats: s, loading: 'Màn hình gia sư', world: null, avatars: students, lod: { ...s.lod, models: s.models }, materials: avatarMaterialCount(), fxMs: 0, footprints: 0, runtimes: runtimeCounters(), heapMb: heapMb() }),
    [onHud, students],
  );
  return <TeacherBoard view={fakeView(students, tick)} tier={tier} onStats={onStats} />;
}

function PickerStage() {
  const taken: Look[] = [
    { template: 'sunny', color: '#e53935' },
    { template: 'sunny', color: '#fb8c00' },
    { template: 'dancer', color: '#ec407a' },
  ];
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="h-full overflow-auto bg-slate-900 p-4">
      <div className="mx-auto max-w-xl">
        <AvatarPicker game={GameMode.SUMMER_CAMP_QUESTS} taken={taken} initialName="Minh" onPick={(p) => setPicked(JSON.stringify(p))} />
        {picked && <p className="mt-3 text-sm text-emerald-300">Đã chọn: {picked}</p>}
      </div>
    </div>
  );
}

