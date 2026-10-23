'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Loader2, Upload, AlertTriangle, X } from 'lucide-react';
import {
  MAX_DURATION,
  MIN_DURATION,
  SCENARIOS,
  SCENARIO_IDS,
  THEMES,
  THEME_IDS,
  computeScaling,
  timeLimitFor,
  variantCodes,
  type ThemeId,
} from '../../engine';
import { field, label, type StudioDraft, type StudioSettings } from './types';

const TEXT_TYPES = ['text/plain', 'text/markdown'];
const INLINE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_BYTES = 4 * 1024 * 1024;

interface UploadedDoc {
  name: string;
  mimeType: string;
  data?: string;
  text?: string;
}

function readFile(file: File): Promise<UploadedDoc> {
  const mimeType = file.type || (file.name.endsWith('.md') ? 'text/markdown' : '');
  if (TEXT_TYPES.includes(mimeType)) return file.text().then((text) => ({ name: file.name, mimeType, text }));
  if (!INLINE_TYPES.includes(mimeType)) {
    return Promise.reject(new Error('Chỉ hỗ trợ PDF, ảnh (PNG/JPG/WEBP) hoặc TXT/MD. Với DOCX, hãy lưu thành PDF.'));
  }
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error('Tệp tối đa 4MB.'));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mimeType, data: String(r.result).split(',')[1] ?? '' });
    r.onerror = () => reject(new Error('Không đọc được tệp.'));
    r.readAsDataURL(file);
  });
}

export const DEFAULT_SETTINGS: StudioSettings = {
  topic: '',
  tutorName: '',
  classCode: '',
  cefrLevel: '',
  scenario: 'homework',
  mode: 'gamified',
  themes: ['rpg_classic'],
  durationMinutes: 10,
  studentCount: 1,
  teamSize: 4,
};

export default function LessonStep({ initial, onGenerated }: { initial: StudioSettings; onGenerated: (d: StudioDraft) => void }) {
  const [s, setS] = useState<StudioSettings>(initial);
  const [doc, setDoc] = useState<UploadedDoc | null>(null);
  const [lessonText, setLessonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof StudioSettings>(k: K, v: StudioSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const scaling = useMemo(() => computeScaling({ durationMinutes: s.durationMinutes, scenario: s.scenario, teamSize: s.teamSize }), [s.durationMinutes, s.scenario, s.teamSize]);
  const variants = variantCodes(s.studentCount);
  const canGenerate = !!(s.topic.trim() || doc || lessonText.trim());

  const toggleTheme = (id: ThemeId) =>
    set('themes', s.themes.includes(id) ? (s.themes.length > 1 ? s.themes.filter((t) => t !== id) : s.themes) : [...s.themes, id]);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      setDoc(await readFile(file));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    // Pasted lesson text is sent as a text document; an uploaded file takes priority.
    const document = doc ?? (lessonText.trim() ? { name: 'Bài học', mimeType: 'text/plain', text: lessonText } : undefined);
    try {
      const res = await fetch('/api/generate-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: true,
          topic: s.topic,
          scenario: s.scenario,
          mode: s.mode,
          themes: s.themes,
          durationMinutes: s.durationMinutes,
          studentCount: s.studentCount,
          teamSize: s.teamSize,
          classCode: s.classCode || undefined,
          cefrLevel: s.cefrLevel || undefined,
          examType: s.scenario === 'coop_raid' ? 'group' : 'individual',
          document,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể tạo đấu trường');
      onGenerated({
        settings: s,
        lessonTitle: data.raw_input,
        boss: data.boss,
        teaching_notes: data.teaching_notes ?? [],
        knowledge_matrix: data.knowledge_matrix,
        questions: data.questions,
        provider: data.provider,
        execution_time: data.execution_time,
        attempts: data.attempts ?? [],
        review_topics: data.review_topics ?? [],
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={generate} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6">
      <div className="space-y-4">
        <div>
          <label className={label} htmlFor="topic">🎯 Chủ đề bài học</label>
          <input id="topic" value={s.topic} onChange={(e) => set('topic', e.target.value)} placeholder="Ví dụ: Past Simple, Passive Voice, IELTS Writing Task 1…" className={field} />
        </div>
        <div>
          <label className={label} htmlFor="lesson">📝 Dán văn bản bài học (tuỳ chọn)</label>
          <textarea id="lesson" value={lessonText} onChange={(e) => setLessonText(e.target.value.slice(0, 30000))} rows={4} disabled={!!doc} placeholder="Dán nội dung giáo án, đoạn văn, danh sách từ vựng… AI sẽ chỉ ra đề từ nội dung này." className={`${field} disabled:opacity-40`} />
        </div>
        <div>
          <span className={label}>📄 Hoặc tải tệp bài giảng</span>
          {doc ? (
            <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm">
              <span className="truncate">{doc.name}</span>
              <button type="button" onClick={() => setDoc(null)} aria-label="Bỏ tệp" className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 border border-dashed border-slate-700 rounded-xl px-4 py-4 text-sm text-slate-400 cursor-pointer hover:border-blue-500">
              <Upload className="w-4 h-4" /> PDF · Ảnh giáo án (PNG/JPG) · TXT/MD — tối đa 4MB
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={label} htmlFor="tutor">Tên gia sư</label>
            <input id="tutor" value={s.tutorName} onChange={(e) => set('tutorName', e.target.value.slice(0, 60))} placeholder="Hiện trong watermark" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="class">Mã lớp</label>
            <input id="class" value={s.classCode} onChange={(e) => set('classCode', e.target.value)} placeholder="vd: IELTS-K12" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="cefr">Trình độ CEFR</label>
            <select id="cefr" value={s.cefrLevel} onChange={(e) => set('cefrLevel', e.target.value)} className={field}>
              <option value="">Tự động</option>
              {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <span className={label}>① Kịch bản sư phạm</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SCENARIO_IDS.map((id) => (
            <button type="button" key={id} onClick={() => set('scenario', id)} aria-pressed={s.scenario === id} className={`text-left p-3 rounded-xl border ${s.scenario === id ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
              <div className="font-bold text-sm">{SCENARIOS[id].nameVi}</div>
              <div className="text-xs text-slate-400">{SCENARIOS[id].style}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={label}>Chế độ bài kiểm tra</span>
        <div className="grid grid-cols-2 gap-2">
          {([['gamified', '⚔️ Gamified RPG Battle', 'Boss, đồ hoạ trận đấu, kỹ năng'], ['standard', '📋 Standard Academic', 'Gọn, không gây xao nhãng']] as const).map(([id, name, desc]) => (
            <button type="button" key={id} onClick={() => set('mode', id)} aria-pressed={s.mode === id} className={`text-left p-3 rounded-xl border ${s.mode === id ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
              <div className="font-bold text-sm">{name}</div>
              <div className="text-xs text-slate-400">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      <fieldset disabled={s.mode === 'standard'} className="disabled:opacity-40">
        <span className={label}>② Thư viện Game — chọn 1 hoặc trộn nhiều theme ({s.themes.length} đã chọn)</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {THEME_IDS.map((id) => {
            const t = THEMES[id];
            const on = s.themes.includes(id);
            return (
              <button type="button" key={id} onClick={() => toggleTheme(id)} aria-pressed={on} className={`text-left p-3 rounded-xl border ${on ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                <div className="text-sm font-bold">{t.emoji} {t.name}</div>
                <div className="text-xs text-slate-400">{t.genre}</div>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label className={label} htmlFor="duration">③ Thời lượng: <span className="text-amber-400">{s.durationMinutes} phút</span></label>
        <input id="duration" type="range" min={MIN_DURATION} max={MAX_DURATION} value={s.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} className="w-full accent-amber-500" />
        <div className="grid grid-cols-3 gap-2 mt-3 text-center">
          <Metric label="Số câu hỏi" value={scaling.totalQuestions} />
          <Metric label="Boss HP" value={scaling.bossHp.toLocaleString('en-US')} />
          <Metric label="Thời gian / câu" value={`${timeLimitFor('easy')}–${timeLimitFor('hard')}s`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="students">Số học sinh</label>
          <input id="students" type="number" min={1} max={200} value={s.studentCount} onChange={(e) => set('studentCount', Math.max(1, Number(e.target.value) || 1))} className={field} />
        </div>
        {s.scenario === 'coop_raid' && (
          <div>
            <label className={label} htmlFor="team">Thành viên mỗi tổ</label>
            <input id="team" type="number" min={2} max={10} value={s.teamSize} onChange={(e) => set('teamSize', Math.min(10, Math.max(2, Number(e.target.value) || 2)))} className={field} />
          </div>
        )}
      </div>
      {variants.length > 0 && (
        <p className="text-xs text-emerald-400">🛡️ Chống gian lận bật: {variants.length} mã đề ({variants[0]}–{variants[variants.length - 1]}), xáo trộn thứ tự câu hỏi và đáp án.</p>
      )}

      <button type="submit" disabled={loading || !canGenerate} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
        {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> AI đang thiết kế Boss & {scaling.totalQuestions} câu hỏi…</> : <><Sparkles className="w-5 h-5 text-amber-300" /> AI sinh Đấu trường RPG</>}
      </button>
      {error && <p role="alert" className="text-sm text-rose-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>}
    </form>
  );
}

function Metric({ label: l, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
      <div className="text-xs text-slate-500">{l}</div>
      <div className="font-black text-amber-400">{value}</div>
    </div>
  );
}
