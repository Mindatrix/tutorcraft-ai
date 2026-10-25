import type { Metadata } from 'next';
import Link from 'next/link';
import credits from '../../src/config/modelCredits.json';

export const metadata: Metadata = { title: 'Ghi công · TutorCraft AI', description: 'Tác giả và giấy phép của các mô hình 3D dùng trong game.' };

interface Credit {
  file: string;
  title: string;
  author: string;
  license: string;
  url: string;
}

const TECH = [
  ['Three.js', 'MIT', 'https://threejs.org'],
  ['Next.js, React', 'MIT', 'https://nextjs.org'],
  ['Supabase', 'Apache-2.0', 'https://supabase.com'],
] as const;

export default function CreditsPage() {
  const list = credits as Credit[];
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-indigo-300 hover:text-white">← Về trang chủ</Link>
        <h1 className="font-display mt-4 text-4xl font-extrabold md:text-5xl">Ghi công</h1>
        <p className="mt-3 text-slate-300">
          Cảm ơn các nghệ sĩ 3D đã chia sẻ mô hình với giấy phép Creative Commons. Mô hình được tải từ Sketchfab; bấm tên để xem trang gốc của tác giả.
        </p>

        <h2 className="font-display mt-10 text-2xl font-extrabold text-amber-300">Mô hình 3D</h2>
        {list.length === 0 ? (
          <p className="mt-3 text-slate-400">Hiện các thế giới đang dùng mô hình do TutorCraft tự dựng. Khi thêm mô hình của tác giả khác, danh sách sẽ hiện ở đây.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
            {list.map((c) => (
              <li key={c.file} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between">
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-amber-300">
                  {c.title}
                </a>
                <span className="text-sm text-slate-400">
                  {c.author} · {c.license}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2 className="font-display mt-10 text-2xl font-extrabold text-amber-300">Công nghệ</h2>
        <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {TECH.map(([name, lic, url]) => (
            <li key={name} className="flex items-baseline justify-between py-3">
              <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-amber-300">{name}</a>
              <span className="text-sm text-slate-400">{lic}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
