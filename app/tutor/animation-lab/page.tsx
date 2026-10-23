'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Copy, Trash2, Upload, ArrowLeft } from 'lucide-react';
import {
  ANIMATION_PROFILES,
  BOSS_AVATARS,
  DEMO_BOSS,
  profileFromKeyframes,
  validateAnimationProfile,
  type BattleEvent,
  type BossAvatar,
  type CameraFocus,
  type Keyframe,
  type KeyframeType,
} from '../../../src/engine';
import BattleCanvas from '../../../src/components/BattleCanvas';

// Asset-pipeline tool: track hitframes, screen shakes and camera zooms on a
// reference video, turn them into an AnimationProfile and preview it live.

const field = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500';
const TYPE_LABEL: Record<KeyframeType, string> = { attack_start: 'Bắt đầu đòn', hitframe: 'Hitframe', shake: 'Rung màn hình', zoom: 'Zoom camera' };

export default function AnimationLab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState('');
  const [keys, setKeys] = useState<Keyframe[]>([]);
  const [base, setBase] = useState<BossAvatar>('dragon');
  const [id, setId] = useState('custom-profile');
  const [name, setName] = useState('Hồ sơ tuỳ chỉnh');
  const [shakeMag, setShakeMag] = useState(12);
  const [shakeDur, setShakeDur] = useState(400);
  const [zoomVal, setZoomVal] = useState(1.15);
  const [zoomFocus, setZoomFocus] = useState<CameraFocus>('boss');
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [sim, setSim] = useState<{ bossHp: number; hp: number; event: { kind: BattleEvent; n: number; amount?: number } | null }>({ bossHp: 1000, hp: 100, event: null });

  const profile = useMemo(() => profileFromKeyframes(keys, { id, name, video: videoName || undefined }, ANIMATION_PROFILES[base]), [keys, id, name, videoName, base]);
  const json = useMemo(() => JSON.stringify(profile, null, 2), [profile]);

  const mark = (type: KeyframeType) => {
    const v = videoRef.current;
    const t = Math.round((v?.currentTime ?? 0) * 1000);
    const k: Keyframe = { t, type };
    if (type === 'shake') Object.assign(k, { value: shakeMag, durationMs: shakeDur });
    if (type === 'zoom') Object.assign(k, { value: zoomVal, durationMs: 600, focus: zoomFocus });
    setKeys((ks) => [...ks, k].sort((a, b) => a.t - b.t));
  };

  const markRef = useRef(mark);
  useEffect(() => {
    markRef.current = mark;
  });

  // Keyboard: A / H / S / Z mark at the current video time; Space plays/pauses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const map: Record<string, KeyframeType> = { a: 'attack_start', h: 'hitframe', s: 'shake', z: 'zoom' };
      const type = map[e.key.toLowerCase()];
      if (type) {
        e.preventDefault();
        markRef.current(type);
      } else if (e.key === ' ' && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) void videoRef.current.play();
        else videoRef.current.pause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onVideo = (file: File | undefined) => {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file)); // stays local — never uploaded
    setVideoName(file.name);
  };

  const fire = (kind: BattleEvent, bossDelta: number, hpDelta: number, amount: number) =>
    setSim((p) => ({ bossHp: Math.max(0, p.bossHp - bossDelta), hp: Math.max(0, p.hp - hpDelta), event: { kind, n: (p.event?.n ?? 0) + 1, amount } }));

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.id}.animation.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProfile = () => {
    try {
      const p = validateAnimationProfile(JSON.parse(importText));
      setId(p.id);
      setName(p.name);
      setKeys(p.keyframes ?? []);
      flash(`Đã nhập ${p.keyframes?.length ?? 0} keyframe.`);
    } catch {
      flash('JSON không hợp lệ.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-5 md:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-5">
        <header className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2">
          <Link href="/tutor/create" className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Game Studio</Link>
          <h1 className="text-2xl font-extrabold">🎬 Animation Lab</h1>
          <p className="text-sm text-slate-400">
            Phân tích video mẫu (clip game, render 3D/4D): đánh dấu thời điểm ra chiêu, hitframe, rung màn hình và zoom camera. Hệ thống tính ra hồ sơ chuyển động (nhịp đòn, hitstop, rung, camera) để Đấu trường dùng lại. Video chỉ chạy trên máy bạn, không tải lên.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h2 className="font-bold">1. Video mẫu & đánh dấu</h2>
            <label className="flex items-center justify-center gap-2 border border-dashed border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-400 cursor-pointer hover:border-blue-500">
              <Upload className="w-4 h-4" /> {videoName || 'Chọn video (MP4/WebM)'}
              <input type="file" accept="video/*" className="hidden" onChange={(e) => onVideo(e.target.files?.[0])} />
            </label>
            {videoUrl ? (
              <video ref={videoRef} src={videoUrl} controls className="w-full rounded-xl bg-black max-h-72" />
            ) : (
              <div className="w-full h-40 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-xs text-slate-500">Chưa có video — vẫn có thể đánh dấu thủ công (t = 0)</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => mark('attack_start')} className="py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-bold">[A] Bắt đầu đòn</button>
              <button onClick={() => mark('hitframe')} className="py-2 rounded-xl border border-amber-600 hover:bg-amber-500/10 text-sm font-bold">[H] Hitframe</button>
              <button onClick={() => mark('shake')} className="py-2 rounded-xl border border-rose-600 hover:bg-rose-500/10 text-sm font-bold">[S] Rung</button>
              <button onClick={() => mark('zoom')} className="py-2 rounded-xl border border-sky-600 hover:bg-sky-500/10 text-sm font-bold">[Z] Zoom</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="space-y-1">Rung: {shakeMag}px<input type="range" min={1} max={30} value={shakeMag} onChange={(e) => setShakeMag(Number(e.target.value))} className="w-full" /></label>
              <label className="space-y-1">Thời lượng rung: {shakeDur}ms<input type="range" min={100} max={1200} step={50} value={shakeDur} onChange={(e) => setShakeDur(Number(e.target.value))} className="w-full" /></label>
              <label className="space-y-1">Zoom: x{zoomVal.toFixed(2)}<input type="range" min={1.02} max={1.5} step={0.01} value={zoomVal} onChange={(e) => setZoomVal(Number(e.target.value))} className="w-full" /></label>
              <label className="space-y-1">Tiêu điểm
                <select value={zoomFocus} onChange={(e) => setZoomFocus(e.target.value as CameraFocus)} className={field}>
                  <option value="boss">Boss</option><option value="hero">Hero</option><option value="center">Giữa</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-500">Phím tắt: A / H / S / Z đánh dấu tại thời điểm video, Space = phát / dừng. Mỗi cặp “Bắt đầu đòn → Hitframe” là một đòn đánh.</p>
            <ol className="max-h-48 overflow-auto space-y-1 text-xs">
              {keys.map((k, i) => (
                <li key={`${k.t}-${i}`} className="flex items-center justify-between bg-slate-950 rounded-lg px-2 py-1">
                  <span className="font-mono">{(k.t / 1000).toFixed(3)}s</span>
                  <span>{TYPE_LABEL[k.type]}{k.value ? ` · ${k.value}` : ''}{k.focus ? ` · ${k.focus}` : ''}</span>
                  <button onClick={() => setKeys((ks) => ks.filter((_, j) => j !== i))} aria-label="Xoá keyframe" className="text-slate-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </li>
              ))}
              {!keys.length && <li className="text-slate-500">Chưa có keyframe.</li>}
            </ol>
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h2 className="font-bold">2. Hồ sơ chuyển động & xem trước</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input aria-label="ID hồ sơ" value={id} onChange={(e) => setId(e.target.value.replace(/[^a-z0-9_-]/gi, '').slice(0, 40))} className={field} />
              <input aria-label="Tên hồ sơ" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className={field} />
              <select aria-label="Hồ sơ gốc" value={base} onChange={(e) => setBase(e.target.value as BossAvatar)} className={field}>
                {BOSS_AVATARS.map((b) => <option key={b.id} value={b.id}>Gốc: {b.name}</option>)}
              </select>
            </div>
            <BattleCanvas boss={{ ...DEMO_BOSS, boss_avatar: base }} heroAvatar="🦊" heroName="Preview" bossHp={sim.bossHp} bossMax={1000} hp={sim.hp} hpMax={100} shield={false} event={sim.event} animation={profile} />
            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={() => fire('correct', 100, 0, 100)} className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800">⚔️ Đòn thường</button>
              <button onClick={() => fire('critical', 150, 0, 150)} className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800">💥 Chí mạng (zoom)</button>
              <button onClick={() => fire('wrong', 0, 20, 20)} className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800">👹 Boss đánh (rung)</button>
              <button onClick={() => setSim({ bossHp: 1000, hp: 100, event: null })} className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800">↺</button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500">Boss: ra chiêu / bay / hitstop</dt><dd className="font-mono">{profile.bossAttack.windupMs} / {profile.bossAttack.travelMs} / {profile.bossAttack.hitstopMs} ms</dd>
              <dt className="text-slate-500">Hero: ra chiêu / bay</dt><dd className="font-mono">{profile.heroAttack.windupMs} / {profile.heroAttack.travelMs} ms</dd>
              <dt className="text-slate-500">Rung khi trúng đòn</dt><dd className="font-mono">{profile.shake.playerHit.magnitude}px · {profile.shake.playerHit.durationMs}ms</dd>
              <dt className="text-slate-500">Camera chí mạng</dt><dd className="font-mono">x{profile.camera.critical.zoom} · {profile.camera.critical.focus}</dd>
            </dl>
            <div className="flex gap-2">
              <button onClick={download} className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm flex items-center justify-center gap-2"><Download className="w-4 h-4" /> Tải JSON</button>
              <button onClick={() => navigator.clipboard.writeText(json).then(() => flash('Đã sao chép JSON.'))} className="flex-1 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 font-bold text-sm flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Sao chép</button>
            </div>
            <textarea aria-label="Nhập JSON hồ sơ" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Dán JSON hồ sơ để chỉnh tiếp…" className={field} />
            <button onClick={importProfile} className="w-full py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-bold">Nhập JSON</button>
            {msg && <p role="status" className="text-xs text-emerald-400">{msg}</p>}
            <p className="text-xs text-slate-500">Để dùng cho mọi trận: thêm hồ sơ vào <code>ANIMATION_PROFILES</code> trong <code>src/engine/animation.ts</code>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
