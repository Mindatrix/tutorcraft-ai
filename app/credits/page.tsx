import type { Metadata } from 'next';
import Link from 'next/link';
import credits from '../../src/config/modelCredits.json';
import audio from '../../content/audio_catalog.json';

export const metadata: Metadata = { title: 'Ghi công · TutorCraft AI', description: 'Tác giả và giấy phép của mô hình 3D, nhạc và âm thanh dùng trong game.' };

interface Sound {
  id: string;
  kind: string;
  author: string;
  license: string;
  source: string;
  ai?: boolean;
}

/** One line per source page (a pack of 9 footsteps is one credit), music first. */
function soundCredits() {
  const by = new Map<string, { names: string[]; author: string; license: string; source: string; ai: boolean; kind: string }>();
  for (const s of audio as Sound[]) {
    const key = s.source || `${s.author}|${s.id}`;
    const e = by.get(key) ?? { names: [], author: s.author, license: s.license, source: s.source, ai: !!s.ai, kind: s.kind };
    e.names.push(s.id);
    by.set(key, e);
  }
  return [...by.values()].sort((a, b) => (a.kind === 'music' ? 0 : 1) - (b.kind === 'music' ? 0 : 1) || a.author.localeCompare(b.author));
}

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

        <h2 className="font-display mt-10 text-2xl font-extrabold text-amber-300">Nhạc và âm thanh</h2>
        <p className="mt-3 text-slate-400">Tất cả đều CC0 hoặc public domain. Âm thanh ghi “AI” do nhà cung cấp tạo bằng AI/tổng hợp và công bố CC0.</p>
        <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {soundCredits().map((c) => (
            <li key={c.source + c.names[0]} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between">
              <span>
                {c.source ? (
                  <a href={c.source} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-amber-300">
                    {c.names.length > 3 ? `${c.names.slice(0, 3).join(', ')} và ${c.names.length - 3} âm khác` : c.names.join(', ')}
                  </a>
                ) : (
                  <span className="font-semibold text-white">{c.names.join(', ')}</span>
                )}
                {c.kind === 'music' && <span className="ml-2 text-xs text-sky-300">nhạc</span>}
                {c.ai && <span className="ml-2 text-xs text-fuchsia-300">AI</span>}
              </span>
              <span className="text-sm text-slate-400">
                {c.author && !/không ghi|chưa ghi/i.test(c.author) ? c.author : 'Không rõ tác giả'} · {c.license.replace(/\s*\(.*\)$/, '')}
              </span>
            </li>
          ))}
        </ul>

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
