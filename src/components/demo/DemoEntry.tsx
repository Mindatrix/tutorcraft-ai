'use client';

import { useCallback, useMemo, useState, useSyncExternalStore, type ComponentType } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Fish, Footprints, Orbit, Play, Sailboat, Tent, Trees } from 'lucide-react';
import { GAME_MODES, GAME_MODE_IDS, GameMode, demoBattleId, demoCharacters, type DemoCharacter } from '../../engine';
import { GAME_GUIDES } from '../../config/gameGuides';
import { assetBase } from '../../config/assetLibrary';
import { load, save } from '../../client/storage';
import { initAudio } from '../../client/audio';
import { initSfx } from '../../client/sfx';
import { readTier } from '../modes/gfxTier';
import BattleLoader from '../BattleLoader';
import CharacterSpinner, { type SpinnerTarget } from './CharacterSpinner';
import './demo.css';

// Demo entry (WP10 U6, 02/11/2026): pick a game, type a name (a 7-colour light runs round the box),
// pick any character (all of content/character_casting.json; the hovered / selected card turns in
// 3D through ONE shared canvas, the rest are pre-rendered images), read the rules, "Tạo game".
// Then the chosen game's real scene + HUD with the 20 demo questions. No account, nothing saved.

const ICONS: Record<GameMode, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  kayak_rush: Sailboat,
  multiverse_portal: Orbit,
  summer_camp: Tent,
  river_fishing: Fish,
  river_survival: Trees,
  dino_journey: Footprints,
};
/** Games whose match already runs in a 3D scene (the other four join in WP8; until then a 2D stage). */
const HAS_3D: GameMode[] = [GameMode.KAYAK_RUSH_3D, GameMode.MULTIVERSE_PORTAL_RPG];
const KIND_LABEL: Record<string, string> = { human: 'Người', animal: 'Động vật', fantasy: 'Kỳ ảo', robot: 'Robot' };

interface Saved {
  game: GameMode;
  name: string;
  character: string;
}

const noop = () => () => {};
/** True after hydration (the server renders a placeholder: saved choices live in this browser only). */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

export default function DemoEntry() {
  const mounted = useMounted();
  if (!mounted) return <div className="tc-demo" aria-busy />;
  return <DemoEntryInner />;
}

function DemoEntryInner() {
  const characters = useMemo(() => demoCharacters(), []);
  const saved = useMemo(() => load<Partial<Saved> | null>('tc:demo', null), []);
  const [game, setGame] = useState<GameMode>(() => (saved?.game && GAME_MODE_IDS.includes(saved.game) ? saved.game : GameMode.KAYAK_RUSH_3D));
  const [name, setName] = useState(saved?.name ?? '');
  const [charId, setCharId] = useState(() => (characters.some((c) => c.id === saved?.character) ? saved!.character! : characters[0]?.id));
  const [more, setMore] = useState(false);
  const [started, setStarted] = useState<{ battleId: string; nickname: string; avatar: string } | null>(null);
  // 3D cards: not on the low tier, not when the player asked for less motion.
  const [spin] = useState(() => readTier() === 'high' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hover, setHover] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [selEl, setSelEl] = useState<HTMLElement | null>(null);
  const [live, setLive] = useState<string | null>(null);
  const selected = characters.find((c) => c.id === charId) ?? characters[0];
  const urlOf = (c: DemoCharacter) => `${assetBase()}/${c.model}`;
  const target: SpinnerTarget | null = useMemo(() => {
    if (!spin) return null;
    if (hover) {
      const c = characters.find((x) => x.id === hover.id);
      return c ? { el: hover.el, url: urlOf(c) } : null;
    }
    return selEl && selected ? { el: selEl, url: urlOf(selected) } : null;
  }, [spin, hover, selEl, selected, characters]);
  const selRef = useCallback((el: HTMLButtonElement | null) => setSelEl(el), []);

  const create = () => {
    if (!selected) return;
    const nickname = name.trim().slice(0, 24) || 'Bạn nhỏ';
    save('tc:demo', { game, name: nickname, character: selected.id } satisfies Saved);
    // Sound needs the click itself (browser rule), so it is switched on here, before the arena.
    initSfx(load<boolean>('tc:muted', false));
    initAudio();
    try {
      performance.mark('tc:demo-create');
    } catch {
      /* old browser */
    }
    setStarted({ battleId: demoBattleId(game), nickname, avatar: selected.emoji });
  };

  if (started) return <BattleLoader battleId={started.battleId} autostart={{ nickname: started.nickname, avatar: started.avatar, onLeave: () => setStarted(null) }} />;

  const groups = Object.entries(KIND_LABEL)
    .map(([kind, label]) => ({ kind, label, list: characters.filter((c) => c.kind === kind) }))
    .concat([{ kind: 'other', label: 'Khác', list: characters.filter((c) => !(c.kind in KIND_LABEL)) }])
    .filter((g) => g.list.length);

  return (
    <main className="tc-demo">
      <header className="tc-demo-head">
        <Link href="/" className="tc-demo-back">
          <ArrowLeft size={18} aria-hidden /> Trang chủ
        </Link>
        <h1>Chơi thử</h1>
        <p>Không cần tài khoản. Chọn game, đặt tên, chọn nhân vật rồi bấm Tạo game.</p>
      </header>

      <div className="tc-demo-layout">
        <section className="tc-demo-left" aria-labelledby="demo-games">
          <h2 id="demo-games">1. Chọn game</h2>
          <div className="tc-demo-games" role="radiogroup" aria-label="Game chơi thử">
            {GAME_MODE_IDS.map((g) => {
              const Icon = ICONS[g];
              return (
                <button key={g} type="button" role="radio" aria-checked={game === g} className="tc-demo-game" onClick={() => setGame(g)}>
                  <Icon size={26} aria-hidden />
                  <span>
                    <b>{GAME_MODES[g].nameVi}</b>
                    <small>{HAS_3D.includes(g) ? 'Cảnh 3D' : 'Khung 2D (3D sắp có)'}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="tc-demo-goal">{GAME_GUIDES[game]?.goal}</p>

          <h2>
            <label htmlFor="demo-name">2. Tên của em</label>
          </h2>
          <div className="tc-demo-name">
            <input id="demo-name" value={name} maxLength={24} placeholder="Ví dụ: Minh An" autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </div>
        </section>

        <section className="tc-demo-mid" aria-label="Hướng dẫn và bắt đầu">
          <div className={`tc-demo-rules${more ? ' tc-demo-rules-open' : ''}`}>
            <h2>Hướng dẫn và điều khoản</h2>
            <p>
              Trận thử có 20 câu tiếng Anh dễ. Trả lời đúng để tiến lên; sai không bị trừ xu. Kết quả không được lưu.
            </p>
            {more && (
              <div id="demo-rules-more">
                <h3>Cách chơi</h3>
                <ul>
                  <li>Đọc câu hỏi ở khung dưới cảnh, chọn một đáp án. Đồng hồ đếm ngược từng câu.</li>
                  <li>Kỹ năng (phím 1, 2, 3): Khiên chặn một lần sai, Đóng băng dừng đồng hồ, Mắt thần bỏ bớt đáp án sai. Kỹ năng tốn MP; MP tăng khi trả lời đúng.</li>
                  <li>Kayak: lái bằng A / D hoặc kéo thanh lái; nút lửa (phím 4) là thanh Nộ, bấm lúc chuyển câu để tăng tốc.</li>
                  <li>Nút ? trên thanh công cụ mở lại hướng dẫn bất cứ lúc nào.</li>
                </ul>
                <h3>Điều khoản chơi thử</h3>
                <ul>
                  <li>Không cần đăng nhập, không thu thập thông tin cá nhân. Tên em nhập chỉ dùng trong trận này và lưu trên máy này để lần sau đỡ phải gõ lại.</li>
                  <li>Không có nạp tiền. Xu và phần thưởng chỉ kiếm được bằng cách chơi, và trận thử không cộng xu.</li>
                  <li>Xếp hạng chỉ dựa vào điểm trả lời. Hãy đặt tên lịch sự, không dùng tên thật đầy đủ.</li>
                  <li>Muốn chơi cả lớp: gia sư tạo trận và gửi mã cho em.</li>
                </ul>
              </div>
            )}
            <button type="button" className="tc-demo-more" aria-expanded={more} aria-controls="demo-rules-more" onClick={() => setMore((m) => !m)}>
              {more ? 'Thu gọn' : 'Tìm hiểu thêm'} {more ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            </button>
          </div>

          {selected && (
            <div className="tc-demo-pick">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.thumb} alt="" width={64} height={64} />
              <span>
                <b>{name.trim() || 'Bạn nhỏ'}</b>
                <small>
                  {selected.name} · {GAME_MODES[game].nameVi}
                </small>
              </span>
            </div>
          )}
          <button type="button" className="tc-demo-create" onClick={create} disabled={!selected}>
            <Play size={22} aria-hidden /> Tạo game
          </button>
        </section>

        <section className="tc-demo-right" aria-labelledby="demo-chars">
          <h2 id="demo-chars">3. Chọn nhân vật ({characters.length})</h2>
          <div className="tc-demo-grid-box" onPointerLeave={() => setHover(null)}>
            {spin && <CharacterSpinner target={target} onReady={setLive} />}
            {groups.map((g) => (
              <div key={g.kind} className="tc-demo-group">
                <h3>{g.label}</h3>
                <div className="tc-demo-grid" role="radiogroup" aria-label={`Nhân vật: ${g.label}`}>
                  {g.list.map((c) => {
                    const on = c.id === selected?.id;
                    const turning = !!target && live === target.url && target.url === urlOf(c);
                    return (
                      <button
                        key={c.id}
                        ref={on ? selRef : undefined}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={c.name}
                        title={c.name}
                        className={`tc-demo-card${turning ? ' tc-demo-card-live' : ''}`}
                        onClick={() => setCharId(c.id)}
                        onPointerEnter={(e) => e.pointerType === 'mouse' && setHover({ id: c.id, el: e.currentTarget })}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.thumb} alt="" loading="lazy" width={120} height={120} />
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
