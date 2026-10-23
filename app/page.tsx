import Link from 'next/link';
import JoinForm from '../src/components/JoinForm';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-2">
          <div className="text-5xl">⚔️</div>
          <h1 className="text-3xl font-black">TutorCraft AI</h1>
          <p className="text-slate-400">Biến mọi bài học tiếng Anh thành một trận chiến game.</p>
        </div>

        <section className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 space-y-3 text-left">
          <h2 className="font-bold text-amber-400">🎮 Học sinh — Nhập Mã Đấu trường</h2>
          <JoinForm />
          <Link href="/student" className="block text-center text-sm text-slate-400 hover:text-white">Hoặc chơi thử trận demo →</Link>
        </section>

        <Link href="/tutor/create" className="block py-4 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500">
          🧑‍🏫 Gia sư — Mở Game Studio
        </Link>
      </div>
    </main>
  );
}
