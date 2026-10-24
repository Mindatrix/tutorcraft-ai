import Link from 'next/link';
import { SCENARIOS, SCENARIO_IDS, LEVELS, LEVEL_IDS } from '../../engine';
import { QUESTION_TYPES, QUESTION_TYPE_IDS } from '../../engine/questionTypes';
import { LOOK } from '../scenarioLook';
import Tilt from '../Tilt';
import JoinForm from '../JoinForm';
import Scenery from '../scenery/Scenery';
import { CurvedSlogan, DoodleBook, DoodleStar, DoodleSwirl, DoodleSword, Wave } from './Shapes';

const INK = '#1b1448';
const CREAM = '#fff6e9';
const SKY = '#d7ecff';

const STEPS = [
  { n: '01', icon: '📝', t: 'Dán bài học', d: 'Gia sư nhập chủ đề, đoạn văn hoặc tải tài liệu lên.', bg: '#fcd34d' },
  { n: '02', icon: '✨', t: 'AI sinh trận đấu', d: 'Boss, câu hỏi và luật chơi được tạo theo mức độ khó bạn chọn.', bg: '#fb7185' },
  { n: '03', icon: '🎟️', t: 'Chia sẻ mã lớp', d: 'Học viên nhập mã, vào trận trên điện thoại, không cần tài khoản.', bg: '#7dd3fc' },
];

const CARD_TONES = ['#fcd34d', '#fb7185', '#c4b5fd', '#6ee7b7'];
const STAIR_TONES = ['#6ee7b7', '#bef264', '#fcd34d', '#fb923c', '#fb7185'];

export function Hero() {
  return (
    <header id="top" className="relative isolate overflow-hidden bg-[#0b0b2e] text-white">
      <div aria-hidden className="tc-aurora" />
      <div aria-hidden className="tc-grid" />
      <nav aria-label="Điều hướng chính" className="max-w-6xl mx-auto px-4 pt-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <DoodleSword className="h-9 w-6 text-amber-300" /> TutorCraft<span className="text-amber-300">AI</span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <a href="#games" className="hidden md:block hover:text-amber-300">Kiểu chơi</a>
          <a href="#how" className="hidden md:block hover:text-amber-300">Cách dùng</a>
          <Link href="/tutor/create" className="tc-sticker !py-2 !px-4 !text-sm !shadow-[3px_3px_0_#1b1448]">Gia sư đăng nhập</Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 pt-12 pb-10 md:pt-16 grid md:grid-cols-[1.1fr_1fr] gap-10 items-center">
        <div className="tc-reveal">
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-indigo-200">
            <span aria-hidden className="inline-block h-2 w-2 bg-emerald-400" /> Game học tiếng Anh cho gia sư
          </p>
          <h1 className="mt-5 text-5xl md:text-7xl font-extrabold leading-[1.02]">
            Biến mỗi bài học thành <span className="tc-gold">một cuộc dạo chơi.</span>
          </h1>
          <DoodleSwirl className="mt-1 h-8 w-32 text-amber-300" />
          <p className="mt-4 text-slate-300 max-w-lg text-lg leading-relaxed">TutorCraft AI sinh Boss, câu hỏi và đua thuyền từ chính bài của bạn. Chơi cùng lớp, theo mức độ từ A1 cho bé 5 tuổi.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/tutor/create" className="tc-sticker">🧑‍🏫 Gia sư — Mở Game Studio</Link>
            <Link href="/student" className="tc-sticker tc-sticker--ghost">Chơi thử trận demo →</Link>
          </div>
        </div>

        <div className="tc-reveal flex flex-col items-center" style={{ animationDelay: '.15s' }}>
          <div className="relative w-[min(84vw,420px)] aspect-square">
            <svg aria-hidden viewBox="0 0 100 100" className="tc-spin-slow absolute inset-[-4%] h-[108%] w-[108%] text-amber-300/60"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1.5 3" /></svg>
            <div className="absolute left-0 top-[10%] w-[66%] aspect-square overflow-hidden rounded-full border-[3px] border-amber-300"><Scenery id="boat_race" className="h-full w-full" /></div>
            <div className="absolute right-0 top-0 w-[42%] aspect-square overflow-hidden rounded-full border-[3px] border-fuchsia-300"><Scenery id="coop_raid" className="h-full w-full" /></div>
            <div className="absolute right-[4%] bottom-[2%] w-[40%] aspect-square overflow-hidden rounded-full border-[3px] border-rose-300"><Scenery id="in_class" className="h-full w-full" /></div>
            <DoodleStar className="absolute -left-2 top-0 h-10 w-10 text-amber-300" />
            <DoodleStar className="absolute right-[40%] bottom-[8%] h-6 w-6 text-sky-300" />
          </div>
          <section aria-label="Vào trận" className="tc-ticket relative -mt-10 w-full max-w-sm -rotate-2 px-7 py-5 shadow-[6px_6px_0_rgb(0_0_0/.35)]">
            <p className="text-xs font-extrabold tracking-[0.2em] text-rose-500">🎟 VÉ VÀO TRẬN</p>
            <h2 className="font-display text-2xl font-extrabold leading-tight">Nhập Mã Đấu trường</h2>
            <div className="my-3 border-t-2 border-dashed border-[#1b1448]/30" />
            <JoinForm light />
          </section>
        </div>
      </div>
      <div className="bg-[#0b0b2e]"><Wave fill={CREAM} /></div>
    </header>
  );
}

export function Formats() {
  const items = [...QUESTION_TYPE_IDS, ...QUESTION_TYPE_IDS, ...QUESTION_TYPE_IDS];
  return (
    <section aria-label="Các dạng bài" style={{ background: CREAM }} className="overflow-hidden py-8">
      <div className="tc-band -mx-6 border-y-2 bg-amber-300 py-3" style={{ borderColor: INK }}>
        <div className="tc-marquee whitespace-nowrap">
          {items.map((id, i) => (
            <span key={i} aria-hidden={i >= QUESTION_TYPE_IDS.length} className="mx-5 flex items-center gap-5 font-extrabold text-[#1b1448]">
              <span>{QUESTION_TYPES[id].icon} {QUESTION_TYPES[id].nameVi}</span><span aria-hidden>✦</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Games() {
  return (
    <section id="games" style={{ background: CREAM, color: INK }} className="relative overflow-hidden px-4 pt-14 pb-24">
      <DoodleStar className="absolute right-[8%] top-10 h-14 w-14 text-rose-400" />
      <DoodleBook className="absolute left-[3%] top-[34%] hidden lg:block h-14 w-16 text-indigo-300" />
      <div className="max-w-6xl mx-auto relative">
        <p className="text-xs tracking-widest text-slate-500">01 / 04</p>
        <h2 className="text-4xl md:text-6xl font-extrabold mt-1 leading-[1.05]">Bốn kiểu chơi,<br /><span className="text-orange-500">một</span> <span className="text-rose-500">bài học.</span></h2>
        <p className="mt-3 max-w-xl text-slate-600">Rê chuột để thẻ nghiêng theo. Gia sư chọn kiểu chơi ngay khi tạo trận.</p>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-14">
          {SCENARIO_IDS.map((id, i) => {
            const l = LOOK[id];
            return (
              <Tilt key={id} className={i % 2 ? 'lg:mt-14' : ''}>
                <article className="group relative h-[400px] overflow-hidden rounded-t-[999px] border-[3px] bg-[#1b1448] shadow-[8px_8px_0_#1b1448] text-white" style={{ borderColor: INK }}>
                  <Scenery id={id} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-110" />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
                  <span className="absolute left-0 right-0 top-14 text-center text-5xl drop-shadow" aria-hidden>{l.icon}</span>
                  <span className="absolute right-3 top-1/2 text-xs font-bold text-white/80">0{i + 1}</span>
                  <div className="absolute inset-x-0 bottom-0 border-t-[3px] p-4 text-[#1b1448]" style={{ background: CARD_TONES[i], borderColor: INK }}>
                    <h3 className="font-extrabold text-xl leading-tight">{SCENARIOS[id].nameVi}</h3>
                    <p className="mt-1 text-sm leading-snug">{l.blurb}</p>
                  </div>
                </article>
              </Tilt>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function How() {
  return (
    <section id="how" style={{ background: CREAM, color: INK }} className="relative overflow-hidden px-4 pb-28">
      <div className="max-w-6xl mx-auto relative">
        <p className="text-xs tracking-widest text-slate-500">02 / 04</p>
        <h2 className="text-4xl md:text-6xl font-extrabold mt-1">Ba bước là <span className="text-sky-500">có trận.</span></h2>

        <div className="relative mt-14">
          <svg aria-hidden viewBox="0 0 1000 60" preserveAspectRatio="none" className="absolute left-[16%] right-[16%] top-[44px] hidden h-12 w-[68%] md:block">
            <path d="M0,30 C120,-10 200,70 330,30 S560,-10 670,30 S900,70 1000,30" fill="none" stroke={INK} strokeOpacity="0.4" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
          </svg>
          <ol className="relative grid gap-12 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="flex flex-col items-center text-center">
                <div className="relative grid h-28 w-28 place-items-center rounded-full border-[3px] text-5xl" style={{ background: s.bg, borderColor: INK, boxShadow: `6px 6px 0 ${INK}` }}>
                  <span aria-hidden>{s.icon}</span>
                  <span className="absolute -right-3 -top-2 bg-[#1b1448] px-2 py-0.5 text-sm font-extrabold text-white">{s.n}</span>
                </div>
                <h3 className="mt-6 text-2xl font-extrabold">{s.t}</h3>
                <p className="mt-1 max-w-xs text-slate-600 leading-relaxed">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-24">
          <h3 className="text-3xl md:text-4xl font-extrabold">Từ bé 5 tuổi <span className="text-orange-500">đến người lớn</span></h3>
          <p className="mt-2 text-slate-600">Năm bậc khó, bậc nào cũng đủ 7 dạng bài.</p>
          <ul className="mt-8 flex items-end">
            {LEVEL_IDS.map((lv, i) => (
              <li key={lv} className="tc-stripes relative flex flex-1 flex-col justify-end border-[3px] p-3 -ml-[3px] first:ml-0" style={{ height: 96 + i * 44, background: STAIR_TONES[i], borderColor: INK }}>
                <span className="text-xs font-bold opacity-70">Mức {i + 1} · {LEVELS[lv].cefr}</span>
                <span className="text-lg font-extrabold leading-tight">{LEVELS[lv].nameVi}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Numbers() {
  const items = [
    { n: QUESTION_TYPE_IDS.length, l: 'dạng bài', c: '#fb923c' },
    { n: LEVEL_IDS.length, l: 'mức độ khó', c: '#ec4899' },
    { n: SCENARIO_IDS.length, l: 'kiểu chơi', c: '#38bdf8' },
    { n: '5+', l: 'tuổi, bé nào cũng chơi được', c: '#fb7185', hot: true },
  ];
  return (
    <section style={{ background: SKY, color: INK }} className="relative">
      <div style={{ background: CREAM }}><Wave fill={SKY} /></div>
      <div className="relative max-w-6xl mx-auto px-4 pb-6 pt-4 text-center">
        <p className="text-xs tracking-widest text-slate-500">03 / 04</p>
        <h2 className="text-4xl md:text-5xl font-extrabold mt-1">Vài con số <span className="text-pink-500">đáng nhớ</span></h2>
        <ul className="mt-12 flex flex-wrap justify-center gap-10">
          {items.map((it) => (
            <li key={it.l} className="grid h-44 w-44 place-items-center rounded-full border-[12px] text-center" style={{ borderColor: it.c, background: it.hot ? it.c : '#fff', color: it.hot ? '#fff' : INK }}>
              <div>
                <div className="font-display text-5xl font-extrabold leading-none" style={{ color: it.hot ? '#fff' : it.c }}>{it.n}</div>
                <div className="mx-auto mt-1 max-w-[7rem] text-sm font-semibold leading-tight">{it.l}</div>
              </div>
            </li>
          ))}
        </ul>
        <CurvedSlogan className="mx-auto mt-10 w-full max-w-3xl" />
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative text-white" style={{ background: INK }}>
      <div style={{ background: SKY }}><Wave fill={INK} /></div>
      <div className="max-w-6xl mx-auto px-4 pb-10 pt-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs tracking-widest text-indigo-300">04 / 04</p>
            <h2 className="mt-1 text-4xl md:text-6xl font-extrabold leading-[1.05]">Sẵn sàng mở<br /><span className="tc-gold">trận đầu tiên?</span></h2>
          </div>
          <Link href="/tutor/create" className="tc-sticker self-start md:self-auto !shadow-[5px_5px_0_#fb7185]">Mở Game Studio →</Link>
        </div>
        <div className="mt-14 grid gap-8 border-t border-white/15 pt-8 text-sm sm:grid-cols-3">
          <div><h3 className="font-display text-lg font-extrabold text-amber-300">Gia sư</h3><ul className="mt-2 space-y-1 text-slate-300"><li><Link href="/tutor/create" className="hover:text-white">Đăng nhập / Đăng ký</Link></li><li><Link href="/tutor/create" className="hover:text-white">Mở Game Studio</Link></li></ul></div>
          <div><h3 className="font-display text-lg font-extrabold text-amber-300">Học sinh</h3><ul className="mt-2 space-y-1 text-slate-300"><li><a href="#top" className="hover:text-white">Nhập mã đấu trường</a></li><li><Link href="/student" className="hover:text-white">Chơi thử trận demo</Link></li></ul></div>
          <div><h3 className="font-display text-lg font-extrabold text-amber-300">TutorCraft AI</h3><p className="mt-2 text-slate-300">Game học tiếng Anh cho gia sư, từ bé 5 tuổi.</p></div>
        </div>
        <p className="mt-10 text-xs text-slate-400">© TutorCraft AI</p>
      </div>
    </footer>
  );
}
