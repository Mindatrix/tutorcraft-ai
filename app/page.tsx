import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="text-5xl">⚔️</div>
        <h1 className="text-3xl font-black">TutorCraft AI</h1>
        <p className="text-slate-400">Biến mọi bài học tiếng Anh thành một trận chiến game.</p>
        <div className="grid gap-3">
          <Link href="/tutor" className="py-4 rounded-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500">
            🧑‍🏫 Gia sư — Tạo trận đấu
          </Link>
          <Link href="/student" className="py-4 rounded-xl font-bold border border-slate-700 hover:bg-slate-900">
            🎮 Học sinh — Chơi thử trận demo
          </Link>
        </div>
      </div>
    </main>
  );
}
