'use client';

import { useMemo, useState } from 'react';
import ScenarioCarousel3D from '../ScenarioCarousel3D';
import ParticleThinking from '../ParticleThinking';
import { Sparkles, Loader2, Upload, AlertTriangle, X } from 'lucide-react';
import {
  MAX_DURATION,
  MIN_DURATION,
  THEMES,
  THEME_IDS,
  LEVELS,
  LEVEL_IDS,
  computeScaling,
  timeLimitFor,
  variantCodes,
  type ThemeId,
  QUESTION_TYPES,
  QUESTION_TYPE_IDS,
  plannedQuestionCount,
  type QuestionType,
} from '../../engine';
import { field, label, type StudioDraft, type StudioSettings } from './types';
import { authFetch } from '../../client/supabaseBrowser';

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
  level: 3,
  scenario: 'homework',
  mode: 'gamified',
  themes: ['rpg_classic'],
  durationMinutes: 10,
  studentCount: 1,
  teamSize: 4,
  questionTypes: ['mcq'],
};

export default function LessonStep({ initial, onGenerated }: { initial: StudioSettings; onGenerated: (d: StudioDraft) => void }) {
  const [s, setS] = useState<StudioSettings>(initial);
  const [doc, setDoc] = useState<UploadedDoc | null>(null);
  const [lessonText, setLessonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof StudioSettings>(k: K, v: StudioSettings[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const plannedCount = plannedQuestionCount(s.durationMinutes, s.questionTypes);
  // Estimate only: the real Boss HP is weighted by each question's format in step 2.
  const scaling = useMemo(() => computeScaling({ durationMinutes: s.durationMinutes, scenario: s.scenario, teamSize: s.teamSize, level: s.level }, plannedCount), [s.durationMinutes, s.scenario, s.teamSize, s.level, plannedCount]);
  const avgWeight = s.questionTypes.reduce((n, t) => n + QUESTION_TYPES[t].weight, 0) / Math.max(1, s.questionTypes.length);
  const toggleType = (t: QuestionType) =>
    set('questionTypes', s.questionTypes.includes(t) ? (s.questionTypes.length > 1 ? s.questionTypes.filter((x) => x !== t) : s.questionTypes) : [...s.questionTypes, t]);
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
      const res = await authFetch('/api/generate-battle', {
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
          level: s.level,
          questionTypes: s.questionTypes,
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
    <form onSubmit={generate} className="px-1 py-2">
      <Section n={1} title="Bài học của bạn" hint="Gõ chủ đề, dán văn bản hoặc tải tệp. Chỉ cần một trong ba.">
        <div className="space-y-5">
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
              <div className="flex items-center justify-between gap-2 border-2 border-slate-600 px-4 py-3 text-sm">
                <span className="truncate">{doc.name}</span>
                <button type="button" onClick={() => setDoc(null)} aria-label="Bỏ tệp" className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-600 px-4 py-4 text-sm text-slate-400 cursor-pointer hover:border-amber-300 hover:text-amber-200">
                <Upload className="w-4 h-4" /> PDF · Ảnh giáo án (PNG/JPG) · TXT/MD — tối đa 4MB
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
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
              <select id="cefr" value={s.cefrLevel} onChange={(e) => set('cefrLevel', e.target.value)} className={`${field} [&>option]:bg-slate-900`}>
                <option value="">Tự động</option>
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>
      </Section>

      <Section n={2} title="Chọn kiểu chơi" hint="Kéo hoặc bấm vào thẻ để chọn.">
        <ScenarioCarousel3D value={s.scenario} onChange={(id) => set('scenario', id)} />
      </Section>

      <Section n={3} title="Mức độ khó" hint="Dành cho học viên từ 5 tuổi. Càng lên cao câu càng khó, thời gian mỗi câu càng ngắn, bot đua thuyền càng mạnh.">
        <div className="flex items-end" role="group" aria-label="Mức độ khó">
          {LEVEL_IDS.map((lv, i) => {
            const on = s.level === lv;
            return (
              <button type="button" key={lv} onClick={() => set('level', lv)} aria-pressed={on} style={{ height: 78 + i * 24, background: STAIR_TONES[i] }}
                className={`tc-stripes relative flex-1 -ml-[2px] first:ml-0 flex flex-col justify-end border-2 border-slate-950 p-2 text-left text-slate-950 transition ${on ? 'z-10 shadow-[0_0_0_4px_#fff] brightness-105' : 'opacity-55 hover:opacity-90'}`}>
                <span className="text-[10px] font-bold opacity-70">{LEVELS[lv].cefr}</span>
                <span className="text-sm font-extrabold leading-tight">{LEVELS[lv].nameVi}</span>
                {on && <span aria-hidden className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-slate-950 text-[11px] text-white">✓</span>}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3">{s.cefrLevel ? `CEFR bạn chọn: ${s.cefrLevel}.` : `CEFR tự động: ${LEVELS[s.level].cefr}.`}</p>
      </Section>

      <Section n={4} title="Chế độ và dạng bài">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([['gamified', '⚔️ Gamified RPG Battle', 'Boss, đồ hoạ trận đấu, kỹ năng'], ['standard', '📋 Standard Academic', 'Gọn, không gây xao nhãng']] as const).map(([id, name, desc]) => {
            const on = s.mode === id;
            return (
              <button type="button" key={id} onClick={() => set('mode', id)} aria-pressed={on} className={`flex items-start gap-3 border-2 p-3 text-left transition ${on ? 'border-slate-950 bg-amber-300 text-slate-950 shadow-[4px_4px_0_#000]' : 'border-slate-600 hover:border-amber-300'}`}>
                <span aria-hidden className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-slate-950' : 'border-slate-500'}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-slate-950" />}</span>
                <span><span className="block text-sm font-extrabold">{name}</span><span className={`block text-xs ${on ? 'text-slate-800' : 'text-slate-400'}`}>{desc}</span></span>
              </button>
            );
          })}
        </div>
        <p className={`${label} mt-6`}>Dạng bài, chọn 1 hoặc trộn nhiều ({s.questionTypes.length} đã chọn)</p>
        <div className="flex flex-wrap gap-3">
          {QUESTION_TYPE_IDS.map((t) => {
            const def = QUESTION_TYPES[t];
            const on = s.questionTypes.includes(t);
            return (
              <button type="button" key={t} onClick={() => toggleType(t)} aria-pressed={on} title={def.blurb} className={`flex items-center gap-2 border-2 px-3 py-2 text-sm font-bold transition ${on ? 'border-slate-950 bg-emerald-300 text-slate-950 shadow-[3px_3px_0_#000]' : 'border-slate-600 text-slate-200 hover:border-emerald-300'}`}>
                <span aria-hidden>{on ? '✓' : def.icon}</span> {def.nameVi} <span className={`font-mono text-xs ${on ? 'text-rose-700' : 'text-rose-300'}`}>×{def.weight}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-500 mt-3">Tự luận và Đọc hiểu được AI chấm theo Rubric (gia sư chỉnh ở bước sau). Bài dài hơn nên cùng thời lượng sẽ có ít câu hơn.</p>
      </Section>

      <Section n={5} title="Bối cảnh game" hint={`Chọn 1 hoặc trộn nhiều (${s.themes.length} đã chọn).`}>
        <fieldset disabled={s.mode === 'standard'} className="disabled:opacity-40">
          <div className="flex flex-wrap gap-x-5 gap-y-4">
            {THEME_IDS.map((id) => {
              const t = THEMES[id];
              const on = s.themes.includes(id);
              return (
                <button type="button" key={id} onClick={() => toggleTheme(id)} aria-pressed={on} className="group flex w-24 flex-col items-center gap-1.5 text-center">
                  <span className={`grid h-16 w-16 place-items-center rounded-full border-2 text-3xl transition ${on ? 'border-slate-950 bg-amber-300 shadow-[4px_4px_0_#000] scale-105' : 'border-slate-600 bg-slate-800 group-hover:border-amber-300'}`}>{t.emoji}</span>
                  <span className={`text-xs font-bold leading-tight ${on ? 'text-amber-300' : 'text-slate-200'}`}>{t.name}</span>
                  <span className="text-[10px] leading-tight text-slate-500">{t.genre}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </Section>

      <Section n={6} title="Thời lượng và lớp học" last>
        <label className={label} htmlFor="duration">Thời lượng: <span className="text-amber-300">{s.durationMinutes} phút</span></label>
        <input id="duration" type="range" min={MIN_DURATION} max={MAX_DURATION} value={s.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} className="w-full accent-amber-400" />
        <div className="mt-5 flex flex-wrap justify-center gap-6">
          <Metric label="Số câu hỏi" value={scaling.totalQuestions} color="#fb923c" />
          <Metric label="Boss HP (ước tính)" value={`~${Math.round((scaling.bossHp * avgWeight) / 50) * 50}`} color="#ec4899" />
          <Metric label="Thời gian / câu" value={`${timeLimitFor('easy', s.level)}–${timeLimitFor('hard', s.level)}s`} color="#38bdf8" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-5">
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
          <p className="mt-4 text-xs text-emerald-400">🛡️ Chống gian lận bật: {variants.length} mã đề ({variants[0]}–{variants[variants.length - 1]}), xáo trộn thứ tự câu hỏi và đáp án.</p>
        )}
      </Section>

      <div className="mt-10">
        {loading && <ParticleThinking text="Đang soạn bài…" hint={`AI đang thiết kế Boss & ${scaling.totalQuestions} câu hỏi`} />}
        <button type="submit" disabled={loading || !canGenerate} className="tc-sticker w-full !py-4 !text-lg disabled:opacity-50 disabled:pointer-events-none">
          {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> AI đang thiết kế Boss & {scaling.totalQuestions} câu hỏi…</> : <><Sparkles className="w-5 h-5" /> AI sinh Đấu trường RPG</>}
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-rose-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>}
      </div>
    </form>
  );
}

const STAIR_TONES = ['#6ee7b7', '#bef264', '#fcd34d', '#fb923c', '#fb7185'];

function Section({ n, title, hint, last = false, children }: { n: number; title: string; hint?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section className={`relative pl-14 ${last ? '' : 'pb-10'}`}>
      {!last && <span aria-hidden className="absolute bottom-0 left-[19px] top-11 border-l-2 border-dashed border-slate-700" />}
      <span aria-hidden className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border-2 border-slate-950 bg-amber-300 font-display text-lg font-extrabold text-slate-950 shadow-[3px_3px_0_rgb(0_0_0/.6)]">{n}</span>
      <h2 className="font-display text-2xl font-extrabold leading-tight text-white">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-slate-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label: l, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="grid h-28 w-28 place-items-center rounded-full border-[6px] bg-slate-900 text-center" style={{ borderColor: color }}>
      <div>
        <div className="font-display text-2xl font-extrabold leading-none" style={{ color }}>{value}</div>
        <div className="mx-auto mt-1 max-w-[5.5rem] text-[10px] leading-tight text-slate-300">{l}</div>
      </div>
    </div>
  );
}
