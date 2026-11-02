'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { busVolume, onSoundChange, setBusVolume, setMusicEnabled, setSfxEnabled, soundSwitches } from '../../client/audio';
import { setHudSettings, useHudSettings, type HudSettings } from '../../client/hudSettings';
import type { RenderTier } from '../modes/gfxTier';

// Settings (WP10 U2, 02/11/2026). Layout learnt from the reference settings screen: tabs down the left,
// one labelled row per option, quality as labelled steps, a "restore defaults" at the bottom. Every
// option works the moment it is picked (no "apply" button). Only options that are wired are shown.

type Tab = 'chung' | 'dieu_khien' | 'giao_dien' | 'am_thanh';
const TABS: [Tab, string][] = [
  ['chung', 'Chung'],
  ['dieu_khien', 'Điều khiển'],
  ['giao_dien', 'Giao diện'],
  ['am_thanh', 'Âm thanh'],
];

export function Seg<T extends string | number | boolean>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tc-hud-seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Row({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="tc-hud-row">
      <span>
        {title}
        {note && <small>{note}</small>}
      </span>
      {children}
    </div>
  );
}

/** Music / effects / ambience: a switch and a volume each (AudioManager, WP2). */
export function SoundRows() {
  const [sw, setSw] = useState(soundSwitches);
  const [vol, setVol] = useState(() => ({ music: busVolume('music'), sfx: busVolume('sfx'), ambient: busVolume('ambient') }));
  useEffect(() => onSoundChange(setSw), []);
  const id = useId();
  const slider = (b: 'music' | 'sfx' | 'ambient', disabled: boolean) => (
    <div className="tc-hud-range">
      <input
        id={`${id}-${b}`}
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(vol[b] * 100)}
        disabled={disabled}
        aria-label={`Âm lượng ${b === 'music' ? 'nhạc' : b === 'sfx' ? 'hiệu ứng' : 'âm nền'}`}
        onChange={(e) => {
          const v = Number(e.target.value) / 100;
          setVol((o) => ({ ...o, [b]: v }));
          setBusVolume(b, v);
        }}
      />
      <output htmlFor={`${id}-${b}`}>{Math.round(vol[b] * 100)}</output>
    </div>
  );
  return (
    <>
      {sw.classMuted && <p style={{ margin: '0 0 8px', color: '#fbbf24' }}>Gia sư đang tắt tiếng cả lớp.</p>}
      <Row title="Nhạc">
        <div style={{ display: 'grid', gap: 6 }}>
          <Seg label="Nhạc" value={sw.music} options={[[true, 'Bật'], [false, 'Tắt']]} onChange={(v) => setMusicEnabled(v)} />
          {slider('music', !sw.music)}
        </div>
      </Row>
      <Row title="Hiệu ứng" note="Tiếng nước, bước chân, đúng / sai">
        <div style={{ display: 'grid', gap: 6 }}>
          <Seg label="Hiệu ứng" value={sw.sfx} options={[[true, 'Bật'], [false, 'Tắt']]} onChange={(v) => setSfxEnabled(v)} />
          {slider('sfx', !sw.sfx)}
        </div>
      </Row>
      <Row title="Âm nền" note="Gió, sóng, lửa trại (đi cùng hiệu ứng)">
        {slider('ambient', !sw.sfx)}
      </Row>
    </>
  );
}

export default function SettingsPanel({ tier, onTier, canFullscreen, hasMap }: { tier: RenderTier; onTier: (t: RenderTier) => void; canFullscreen?: boolean; hasMap?: boolean }) {
  const [tab, setTab] = useState<Tab>('chung');
  const s = useHudSettings();
  const set = (patch: Partial<HudSettings>) => setHudSettings(patch);
  const tabId = useId();
  return (
    <>
      <div className="tc-hud-settings">
        <div className="tc-hud-tablist" role="tablist" aria-orientation="vertical" aria-label="Mục cài đặt">
          {TABS.map(([id, name]) => (
            <button key={id} id={`${tabId}-${id}`} role="tab" type="button" className="tc-hud-tab" aria-selected={tab === id} aria-controls={`${tabId}-${id}-panel`} onClick={() => setTab(id)}>
              {name}
            </button>
          ))}
        </div>
        <div className="tc-hud-panel-body" role="tabpanel" id={`${tabId}-${tab}-panel`} aria-labelledby={`${tabId}-${tab}`}>
          {tab === 'chung' && (
            <>
              <Row title="Chất lượng hình ảnh" note="Máy yếu chọn Tiêu chuẩn">
                <Seg label="Chất lượng" value={tier} options={[['2d', 'Tiêu chuẩn'], ['low', 'Cao'], ['high', 'Siêu cao']]} onChange={onTier} />
              </Row>
              <Row title="Độ sáng">
                <Seg label="Độ sáng" value={s.brightness} options={[[1, 'Tối'], [2, '2'], [3, 'Vừa'], [4, '4'], [5, 'Sáng']]} onChange={(v) => set({ brightness: v })} />
              </Row>
              <Row title="Ngôn ngữ">
                <span>Tiếng Việt</span>
              </Row>
              {canFullscreen === false && (
                <Row title="Toàn màn hình" note="Trình duyệt này không hỗ trợ; trên iPhone hãy thêm trang vào màn hình chính">
                  <span>—</span>
                </Row>
              )}
            </>
          )}
          {tab === 'dieu_khien' && (
            <>
              <Row title="Tay điều khiển" note="Kỹ năng ở tay còn lại">
                <Seg label="Tay điều khiển" value={s.moveHand} options={[['left', 'Tay trái'], ['right', 'Tay phải']]} onChange={(v) => set({ moveHand: v })} />
              </Row>
              <Row title="Cỡ nút">
                <Seg label="Cỡ nút" value={s.buttonSize} options={[['s', 'Nhỏ'], ['m', 'Vừa'], ['l', 'Lớn']]} onChange={(v) => set({ buttonSize: v })} />
              </Row>
              <Row title="Độ rõ của nút">
                <Seg label="Độ rõ" value={s.controlOpacity} options={[[0.55, 'Mờ'], [0.75, 'Vừa'], [0.95, 'Rõ']]} onChange={(v) => set({ controlOpacity: v })} />
              </Row>
            </>
          )}
          {tab === 'giao_dien' && (
            <>
              <Row title="Cỡ chữ">
                <Seg label="Cỡ chữ" value={s.fontScale} options={[[0.9, 'Nhỏ'], [1, 'Vừa'], [1.15, 'Lớn']]} onChange={(v) => set({ fontScale: v })} />
              </Row>
              {hasMap && (
                <>
                  <Row title="Bản đồ nhỏ" note="Góc trên của màn chơi">
                    <Seg label="Bản đồ nhỏ" value={s.minimap} options={[['left', 'Trái'], ['right', 'Phải'], ['off', 'Tắt']]} onChange={(v) => set({ minimap: v })} />
                  </Row>
                  <Row title="Thanh tọa độ" note="Hướng nhìn, vị trí của em và đồng đội">
                    <Seg label="Thanh tọa độ" value={s.coordBar} options={[[true, 'Hiện'], [false, 'Ẩn']]} onChange={(v) => set({ coordBar: v })} />
                  </Row>
                </>
              )}
              <Row title="Tên dưới nút" note="Hiện chữ dưới các nút thanh công cụ">
                <Seg label="Tên dưới nút" value={s.toolbarLabels} options={[[false, 'Ẩn'], [true, 'Hiện']]} onChange={(v) => set({ toolbarLabels: v })} />
              </Row>
            </>
          )}
          {tab === 'am_thanh' && <SoundRows />}
        </div>
      </div>
      <div className="tc-hud-foot">
        <button
          type="button"
          className="tc-hud-ghost"
          onClick={() => {
            setHudSettings(null);
            onTier('high');
          }}
        >
          Khôi phục mặc định
        </button>
        <span style={{ alignSelf: 'center', fontSize: 12, opacity: 0.6 }}>Tự lưu trên máy này</span>
      </div>
    </>
  );
}
