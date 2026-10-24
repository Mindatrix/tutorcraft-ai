import Link from 'next/link';
import { SCENARIOS, SCENARIO_IDS, LEVELS, LEVEL_IDS } from '../../engine';
import { QUESTION_TYPES, QUESTION_TYPE_IDS } from '../../engine/questionTypes';
import { LOOK } from '../scenarioLook';
import Tilt from '../Tilt';
import JoinForm from '../JoinForm';
import Scenery from '../scenery/Scenery';

const STEPS = [
  { n: '01', icon: '📝', t: 'Dán bài học', d: 'Gia sư nhập chủ đề, đoạn văn hoặc tải tài liệu lên.' },
  { n: '02', icon: '✨', t: 'AI sinh trận đấu', d: 'Boss, câu hỏi và luật chơi được tạo theo mức độ khó bạn chọn.' },
  { n: '03', icon: '🎟️', t: 'Chia sẻ mã lớp', d: 'Học viên nhập mã, vào trận trên điện thoại, không cần tài khoản.' },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pt-16 pb-20 md:pt-28" style={{ background: 'radial-gradient(circle at 72% 20%, #1c2275 0, #0b0b2e 30%, #020617 70%)' }}>
      <div aria-hidden className="tc-aurora" />
      <div aria-hidden className="tc-grid" />
      <div className="max-w-5xl mx-auto grid md:grid-cols-[1.3fr_1fr] gap-10 items-center">
        <div className="tc-reveal">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.18em] text-indigo-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Game học tiếng Anh cho gia sư
          </p>
          <h1 className="mt-5 text-5xl md:text-7xl font-extrabold leading-[1.02]">
            Biến mỗi bài học thành <span className="tc-gold">một trận chiến.</span>
          </h1>
          <p className="mt-6 text-slate-300 max-w-lg text-lg leading-relaxed">TutorCraft AI sinh Boss, câu hỏi và đua thuyền từ chính bài của bạn. Chơi cùng lớp, theo mức độ từ A1 cho bé 5 tuổi.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/tutor/create" className="tc-btn rounded-full px-7 py-3.5 font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-fuchsia-600">🧑‍🏫 Gia sư — Mở Game Studio</Link>
            <Link href="/student" className="tc-btn rounded-full px-7 py-3.5 border border-white/25 bg-white/10 backdrop-blur">Chơi thử trận demo →</Link>
          </div>
          <dl className="mt-10 flex gap-8 text-sm">
            <div><dt className="text-slate-400">Dạng bài</dt><dd className="text-2xl font-extrabold">{QUESTION_TYPE_IDS.length}</dd></div>
            <div><dt className="text-slate-400">Mức độ</dt><dd className="text-2xl font-extrabold">{LEVEL_IDS.length}</dd></div>
            <div><dt className="text-slate-400">Kiểu chơi</dt><dd className="text-2xl font-extrabold">{SCENARIO_IDS.length}</dd></div>
          </dl>
        </div>
        <section className="tc-glass tc-reveal rounded-3xl p-6 space-y-4" style={{ animationDelay: '.15s' }}>
          <div>
            <h2 className="font-extrabold text-2xl text-amber-300">🎮 Vào trận ngay</h2>
            <p className="text-sm text-slate-300 mt-1">Học sinh nhập Mã Đấu trường do gia sư gửi.</p>
          </div>
          <JoinForm />
        </section>
      </div>
    </section>
  );
}

export function Formats() {
  const items = [...QUESTION_TYPE_IDS, ...QUESTION_TYPE_IDS];
  return (
    <section aria-label="Các dạng bài" className="bg-slate-950 border-y border-white/10 py-4 overflow-hidden">
      <div className="tc-marquee gap-3">
        {items.map((id, i) => (
          <span key={i} aria-hidden={i >= QUESTION_TYPE_IDS.length} className="mx-1.5 shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
            {QUESTION_TYPES[id].icon} <b>{QUESTION_TYPES[id].nameVi}</b> <span className="text-slate-400">· {QUESTION_TYPES[id].blurb}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export function Games() {
  return (
    <section className="px-4 py-20 bg-slate-950">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-slate-500 tracking-widest">01 / 03</p>
        <h2 className="text-4xl md:text-5xl font-extrabold mt-1">Bốn kiểu chơi,<br /><span className="tc-gold">một bài học.</span></h2>
        <p className="text-slate-400 mt-3 max-w-xl">Rê chuột để thẻ nghiêng theo. Gia sư chọn kiểu chơi ngay khi tạo trận.</p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SCENARIO_IDS.map((id, i) => {
            const l = LOOK[id];
            return (
              <Tilt key={id}>
                <article className="group relative h-full min-h-[300px] overflow-hidden rounded-3xl border border-white/10 flex flex-col justify-end">
                  <Scenery id={id} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-110" />
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  <span className="absolute top-4 left-4 text-4xl drop-shadow" aria-hidden>{l.icon}</span>
                  <span className="absolute top-4 right-4 text-xs text-white/70">0{i + 1}</span>
                  <div className="relative p-5">
                    <h3 className="font-extrabold text-xl leading-tight">{SCENARIOS[id].nameVi}</h3>
                    <p className="text-sm text-slate-200 mt-1">{l.blurb}</p>
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
    <section className="relative isolate overflow-hidden px-4 py-20 bg-slate-900/60 border-y border-slate-800">
      <div aria-hidden className="tc-grid" />
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-slate-500 tracking-widest">02 / 03</p>
        <h2 className="text-4xl md:text-5xl font-extrabold mt-1">Ba bước là có trận.</h2>
        <ol className="mt-10 grid md:grid-cols-3 gap-5">
          {STEPS.map((s) => (
            <li key={s.n} className="tc-glass rounded-3xl p-6">
              <div className="flex items-center justify-between"><span className="text-3xl" aria-hidden>{s.icon}</span><span className="tc-gold font-extrabold text-2xl">{s.n}</span></div>
              <div className="font-bold text-lg mt-4">{s.t}</div>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <h3 className="text-xl font-bold">Từ bé 5 tuổi đến người lớn</h3>
          <ul className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            {LEVEL_IDS.map((lv, i) => (
              <li key={lv} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                <div className="text-xs text-slate-400">Mức {i + 1}</div>
                <div className="font-extrabold mt-1">{LEVELS[lv].nameVi}</div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400" style={{ width: `${((i + 1) / LEVEL_IDS.length) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden px-4 py-20 bg-slate-950">
      <div aria-hidden className="tc-aurora" style={{ opacity: 0.3 }} />
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs text-slate-500 tracking-widest">03 / 03</p>
          <h2 className="text-4xl md:text-5xl font-extrabold mt-1">Sẵn sàng mở<br /><span className="tc-gold">trận đầu tiên?</span></h2>
        </div>
        <Link href="/tutor/create" className="tc-btn rounded-full px-7 py-3.5 font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-fuchsia-600 self-start md:self-auto">Mở Game Studio →</Link>
      </div>
      <p className="max-w-5xl mx-auto mt-14 text-xs text-slate-600">© TutorCraft AI</p>
    </footer>
  );
}
