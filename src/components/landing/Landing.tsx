import Link from 'next/link';
import { SCENARIOS, SCENARIO_IDS, LEVELS, LEVEL_IDS } from '../../engine';
import { LOOK } from '../scenarioLook';
import Tilt from '../Tilt';
import JoinForm from '../JoinForm';

const STEPS = [
  { n: '01', t: 'Dán bài học', d: 'Gia sư nhập chủ đề, đoạn văn hoặc tải tài liệu lên.' },
  { n: '02', t: 'AI sinh trận đấu', d: 'Boss, câu hỏi và luật chơi được tạo theo mức độ khó bạn chọn.' },
  { n: '03', t: 'Chia sẻ mã lớp', d: 'Học viên nhập mã, vào trận trên điện thoại, không cần tài khoản.' },
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pt-16 pb-14 md:pt-24" style={{ background: 'radial-gradient(circle at 72% 20%, #2836bd 0, #141342 24%, #020617 66%)' }}>
      <div aria-hidden className="absolute -right-[14vw] -top-[25vw] w-[44vw] aspect-square rounded-full border border-indigo-300/30 -z-10" />
      <div aria-hidden className="absolute -left-[10vw] bottom-[-18vw] w-[36vw] aspect-square rounded-full border border-indigo-300/20 -z-10" />
      <div className="max-w-5xl mx-auto grid md:grid-cols-[1.3fr_1fr] gap-10 items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">✦ Game học tiếng Anh cho gia sư</p>
          <h1 className="mt-4 text-4xl md:text-6xl font-black leading-[1.05]">Biến mỗi bài học thành <em className="not-italic text-amber-300">một trận chiến.</em></h1>
          <p className="mt-5 text-slate-300 max-w-lg">TutorCraft AI sinh Boss, câu hỏi và đua thuyền từ chính bài của bạn. Chơi cùng lớp, theo mức độ từ A1 cho bé 5 tuổi.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/tutor/create" className="rounded-full px-6 py-3 font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500">🧑‍🏫 Gia sư — Mở Game Studio</Link>
            <Link href="/student" className="rounded-full px-6 py-3 border border-white/30 bg-white/10 backdrop-blur hover:bg-white/15">Chơi thử trận demo →</Link>
          </div>
        </div>
        <section className="bg-slate-900/80 backdrop-blur border border-amber-500/30 rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-amber-400">🎮 Học sinh — Nhập Mã Đấu trường</h2>
          <JoinForm />
        </section>
      </div>
    </section>
  );
}

export function Games() {
  return (
    <section className="px-4 py-16 bg-slate-950">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-slate-500">01 / 03</p>
        <h2 className="text-3xl md:text-4xl font-black mt-1">Bốn kiểu chơi,<br /><span className="text-amber-300">một bài học.</span></h2>
        <p className="text-slate-400 mt-3 max-w-xl">Rê chuột để thẻ nghiêng theo. Gia sư chọn kiểu chơi ngay khi tạo trận.</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SCENARIO_IDS.map((id, i) => {
            const l = LOOK[id];
            return (
              <Tilt key={id}>
                <article className={`h-full min-h-[230px] rounded-2xl p-5 bg-gradient-to-br ${l.grad} flex flex-col justify-between`}>
                  <div className="flex justify-between items-start"><span className="text-4xl" aria-hidden>{l.icon}</span><span className="text-xs opacity-70">0{i + 1}</span></div>
                  <div>
                    <h3 className="font-extrabold text-lg leading-tight">{SCENARIOS[id].nameVi}</h3>
                    <p className="text-sm opacity-85 mt-1">{l.blurb}</p>
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
    <section className="px-4 py-16 bg-slate-900/60 border-y border-slate-800">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-slate-500">02 / 03</p>
        <h2 className="text-3xl md:text-4xl font-black mt-1">Ba bước là có trận.</h2>
        <ol className="mt-8 grid md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <li key={s.n} className="border-t border-slate-700 pt-4">
              <div className="text-amber-300 font-black">{s.n}</div>
              <div className="font-bold mt-1">{s.t}</div>
              <p className="text-sm text-slate-400 mt-1">{s.d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid grid-cols-3 gap-4 text-center">
          <div><strong className="block text-3xl font-black">{LEVEL_IDS.length}</strong><span className="text-xs text-slate-400">mức độ, từ {LEVELS[LEVEL_IDS[0]].nameVi} đến {LEVELS[LEVEL_IDS[LEVEL_IDS.length - 1]].nameVi}</span></div>
          <div><strong className="block text-3xl font-black">{SCENARIO_IDS.length}</strong><span className="text-xs text-slate-400">kiểu chơi</span></div>
          <div><strong className="block text-3xl font-black">5+</strong><span className="text-xs text-slate-400">tuổi, bé nào cũng chơi được</span></div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="px-4 py-14 bg-slate-950">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs text-slate-500">03 / 03</p>
          <h2 className="text-3xl font-black mt-1">Sẵn sàng mở<br /><span className="text-amber-300">trận đầu tiên?</span></h2>
        </div>
        <Link href="/tutor/create" className="rounded-full px-6 py-3 font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 self-start md:self-auto">Mở Game Studio →</Link>
      </div>
      <p className="max-w-5xl mx-auto mt-10 text-xs text-slate-600">© TutorCraft AI</p>
    </footer>
  );
}
