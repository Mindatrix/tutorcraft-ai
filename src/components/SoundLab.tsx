'use client';

import { useEffect, useState } from 'react';
import type { Cue, MoodSignals, SoundPlace } from '../engine/audioPlan';
import { holdDuck, initAudio, playCue, playFootstep, setClassMuted, setMoodSignals, setMusicEnabled, setSfxEnabled, setSoundPlace, soundDebug, stopSound } from '../client/audio';
import { initSfx, play } from '../client/sfx';

// Scene lab: sound check (WP2). Pick a place, switch music / effects / the tutor's class mute, push the
// mood (kayak leading, a pursuer close), hold a question open (duck), play every cue. The readout shows
// what is playing, so the check does not depend on listening alone.

const PLACES: SoundPlace[] = ['menu', 'summer_camp', 'river_fishing', 'kayak_rush', 'river_survival', 'dino_journey', 'multiverse_portal', 'mv_bedroom', 'mv_cyber', 'mv_courtyard', 'mv_salon', 'mv_fortress', 'mv_desert'];
const CUES: Cue[] = ['cheer', 'win', 'giggle', 'splash', 'whoosh', 'rope', 'land', 'pop', 'menu'];

export default function SoundLab({ initial = 'summer_camp' }: { initial?: SoundPlace }) {
  const [on, setOn] = useState(false);
  const [place, setPlace] = useState<SoundPlace>(initial);
  const [music, setMusic] = useState(true);
  const [sfx, setSfx] = useState(true);
  const [classMute, setClassMute] = useState(false);
  const [weak, setWeak] = useState(false);
  const [duck, setDuck] = useState(false);
  const [signals, setSignals] = useState<MoodSignals>({});
  const [info, setInfo] = useState('');

  useEffect(() => {
    if (!on) return;
    setSoundPlace(place, { lowPower: weak });
  }, [on, place, weak]);
  useEffect(() => () => stopSound(), []);
  useEffect(() => (on && duck ? holdDuck() : undefined), [on, duck]);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      setMoodSignals(signals);
      setInfo(JSON.stringify(soundDebug()));
    }, 500);
    return () => clearInterval(id);
  }, [on, signals]);

  const btn = 'border border-slate-600 px-2 py-1 hover:bg-slate-800';
  return (
    <div className="mt-2 flex flex-col gap-2 text-sm" aria-label="Âm thanh (WP2)">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-amber-300">Âm thanh (WP2)</strong>
        {!on ? (
          <button
            type="button"
            className="bg-amber-400 px-3 py-1 font-bold text-slate-900"
            onClick={() => {
              initSfx(false);
              initAudio();
              setMusic(true);
              setSfx(true);
              setMusicEnabled(true);
              setSfxEnabled(true);
              setOn(true);
            }}
          >
            Bật âm (chạm)
          </button>
        ) : (
          <>
            <select className="bg-slate-800 px-2 py-1" value={place} onChange={(e) => setPlace(e.target.value as SoundPlace)}>
              {PLACES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={music} onChange={(e) => (setMusic(e.target.checked), setMusicEnabled(e.target.checked))} /> Nhạc
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={sfx} onChange={(e) => (setSfx(e.target.checked), setSfxEnabled(e.target.checked))} /> Hiệu ứng + nền
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={classMute} onChange={(e) => (setClassMute(e.target.checked), setClassMuted(e.target.checked))} /> Gia sư tắt tiếng lớp
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={weak} onChange={(e) => setWeak(e.target.checked)} /> Máy yếu (nền tổng hợp)
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={duck} onChange={(e) => setDuck(e.target.checked)} /> Câu hỏi đang mở (hạ nhạc)
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={!!signals.leading} onChange={(e) => setSignals((s) => ({ ...s, leading: e.target.checked }))} /> Kayak dẫn đầu
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={signals.pursuerDistance === 4} onChange={(e) => setSignals((s) => ({ ...s, pursuerDistance: e.target.checked ? 4 : undefined }))} /> Kẻ săn ở gần
            </label>
          </>
        )}
      </div>
      {on && (
        <div className="flex flex-wrap items-center gap-2">
          {CUES.map((c) => (
            <button key={c} type="button" className={btn} onClick={() => playCue(c)}>
              {c}
            </button>
          ))}
          <button type="button" className={btn} onClick={() => playFootstep()}>
            bước chân
          </button>
          <button type="button" className={btn} onClick={() => play('correct')}>
            đúng (tổng hợp)
          </button>
          <button type="button" className={btn} onClick={() => play('wrong')}>
            sai (tổng hợp)
          </button>
          <code className="basis-full break-all text-[11px] text-emerald-200">{info}</code>
        </div>
      )}
    </div>
  );
}
