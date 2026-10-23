'use client';

import { useMemo, useState } from 'react';
import { Sparkles, BookOpen, Sword, Loader2, CheckCircle2, Copy, Link as LinkIcon, Upload, AlertTriangle, BarChart3, RefreshCw, X } from 'lucide-react';
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
  type ExamMode,
  type Question,
  type ScenarioId,
  type ThemeId,
} from '../../src/engine';

const TEXT_TYPES = ['text/plain', 'text/markdown'];
const INLINE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_BYTES = 4 * 1024 * 1024;

interface UploadedDoc {
  name: string;
  mimeType: string;
  data?: string;
  text?: string;
}

interface GenerateResult {
  battle_id: string | null;
  provider: string;
  execution_time: string;
  attempts: { model: string; ok: boolean; ms: number; error?: string }[];
  variants: number[];
  db_warning?: string;
  review_topics: string[];
  teaching_notes: string[];
  knowledge_matrix?: { topic: string; skill_tag: string; summary: string }[];
  questions: Question[];
}

interface Diagnostics {
  participants?: number;
  diagnostics: { topic: string; skill_tag: string; attempts: number; wrong: number; failRate: number }[];
  leaderboard: { nickname: string; avatar: string; gems: number; accuracy: number }[];
}

function readFile(file: File): Promise<UploadedDoc> {
  const mimeType = file.type || (file.name.endsWith('.md') ? 'text/markdown' : '');
  if (TEXT_TYPES.includes(mimeType)) {
    return file.text().then((text) => ({ name: file.name, mimeType, text }));
  }
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

export default function TutorDashboard() {
  const [topic, setTopic] = useState('');
  const [doc, setDoc] = useState<UploadedDoc | null>(null);
  const [classCode, setClassCode] = useState('');
  const [cefrLevel, setCefrLevel] = useState('');
  const [scenario, setScenario] = useState<ScenarioId>('homework');
  const [mode, setMode] = useState<ExamMode>('gamified');
  const [themes, setThemes] = useState<ThemeId[]>(['minecraft']);
  const [duration, setDuration] = useState(10);
  const [studentCount, setStudentCount] = useState(1);
  const [teamSize, setTeamSize] = useState(4);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const scaling = useMemo(() => computeScaling({ durationMinutes: duration, scenario, teamSize }), [duration, scenario, teamSize]);
  const variants = variantCodes(studentCount);

  const toggleTheme = (id: ThemeId) =>
    setThemes((prev) => (prev.includes(id) ? (prev.length > 1 ? prev.filter((t) => t !== id) : prev) : [...prev, id]));

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    try {
      setDoc(await readFile(file));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() && !doc) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setDiag(null);
    try {
      const res = await fetch('/api/generate-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          scenario,
          mode,
          themes,
          durationMinutes: duration,
          studentCount,
          teamSize,
          classCode: classCode || undefined,
          cefrLevel: cefrLevel || undefined,
          examType: scenario === 'coop_raid' ? 'group' : 'individual',
          document: doc ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không thể tạo bài tập');
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDiagnostics = async () => {
    if (!result?.battle_id) return;
    setDiagLoading(true);
    try {
      const res = await fetch(`/api/battle-result?battleId=${result.battle_id}`);
      setDiag(await res.json());
    } finally {
      setDiagLoading(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseLink = result?.battle_id ? `${origin}/student/${result.battle_id}` : null;

  const field = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500';
  const label = 'block text-sm font-semibold text-slate-300 mb-2';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-5 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
          <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold rounded-full uppercase tracking-wider">TutorCraft AI · 3D Lego Engine</span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-2">Dashboard Soạn Đề & Giáo Án Gia Sư</h1>
        </div>

        <form onSubmit={handleGenerate} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-6">
          {/* Lesson */}
          <div className="space-y-4">
            <div>
              <label className={label} htmlFor="topic">🎯 Chủ đề bài học / Ngữ pháp / Từ vựng</label>
              <input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ví dụ: Passive Voice, IELTS Writing Task 1…" className={field} />
            </div>
            <div>
              <span className={label}>📄 Tài liệu bài giảng (tuỳ chọn) — AI chỉ ra đề từ tài liệu này</span>
              {doc ? (
                <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm">
                  <span className="truncate">{doc.name}</span>
                  <button type="button" onClick={() => setDoc(null)} aria-label="Remove document" className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 border border-dashed border-slate-700 rounded-xl px-4 py-4 text-sm text-slate-400 cursor-pointer hover:border-blue-500">
                  <Upload className="w-4 h-4" /> PDF · PNG/JPG (ảnh giáo án) · TXT/MD — tối đa 4MB
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="class">Mã lớp</label>
                <input id="class" value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="vd: IELTS-K12" className={field} />
              </div>
              <div>
                <label className={label} htmlFor="cefr">Trình độ CEFR</label>
                <select id="cefr" value={cefrLevel} onChange={(e) => setCefrLevel(e.target.value)} className={field}>
                  <option value="">Tự động</option>
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Dimension 1: Scenario */}
          <div>
            <span className={label}>① Kịch bản sư phạm</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SCENARIO_IDS.map((id) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => setScenario(id)}
                  className={`text-left p-3 rounded-xl border ${scenario === id ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}
                >
                  <div className="font-bold text-sm">{SCENARIOS[id].nameVi}</div>
                  <div className="text-xs text-slate-400">{SCENARIOS[id].style}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div>
            <span className={label}>Chế độ bài kiểm tra</span>
            <div className="grid grid-cols-2 gap-2">
              {([['gamified', '⚔️ Gamified RPG Battle', 'Boss HP, theme, kỹ năng, co-op'], ['standard', '📋 Standard Academic', 'Gọn, không gây xao nhãng']] as const).map(([id, name, desc]) => (
                <button type="button" key={id} onClick={() => setMode(id)} className={`text-left p-3 rounded-xl border ${mode === id ? 'border-blue-500 bg-blue-600/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                  <div className="font-bold text-sm">{name}</div>
                  <div className="text-xs text-slate-400">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Dimension 2: Themes */}
          <fieldset disabled={mode === 'standard'} className="disabled:opacity-40">
            <span className={label}>② Thư viện Game — chọn 1 hoặc trộn nhiều theme ({themes.length} đã chọn)</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {THEME_IDS.map((id) => {
                const t = THEMES[id];
                const on = themes.includes(id);
                return (
                  <button type="button" key={id} onClick={() => toggleTheme(id)} aria-pressed={on} className={`text-left p-3 rounded-xl border ${on ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                    <div className="text-sm font-bold">{t.emoji} {t.name}</div>
                    <div className="text-xs text-slate-400">{t.genre}</div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Dimension 3: Duration */}
          <div>
            <label className={label} htmlFor="duration">③ Thời lượng: <span className="text-amber-400">{duration} phút</span></label>
            <input id="duration" type="range" min={MIN_DURATION} max={MAX_DURATION} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-amber-500" />
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <Metric label="Số câu hỏi" value={scaling.totalQuestions} />
              <Metric label="Boss HP" value={scaling.bossHp.toLocaleString('en-US')} />
              <Metric label="Thời gian / câu" value={`${timeLimitFor('easy')}–${timeLimitFor('hard')}s`} />
            </div>
          </div>

          {/* Students / variants */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="students">Số học sinh</label>
              <input id="students" type="number" min={1} max={200} value={studentCount} onChange={(e) => setStudentCount(Math.max(1, Number(e.target.value) || 1))} className={field} />
            </div>
            {scenario === 'coop_raid' && (
              <div>
                <label className={label} htmlFor="team">Thành viên mỗi tổ</label>
                <input id="team" type="number" min={2} max={10} value={teamSize} onChange={(e) => setTeamSize(Math.min(10, Math.max(2, Number(e.target.value) || 2)))} className={field} />
              </div>
            )}
          </div>
          {variants.length > 0 && (
            <p className="text-xs text-emerald-400">🛡️ Chống gian lận bật: {variants.length} mã đề ({variants[0]}–{variants[variants.length - 1]}), xáo trộn thứ tự câu hỏi và đáp án.</p>
          )}

          <button type="submit" disabled={loading || (!topic.trim() && !doc)} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> AI đang sinh {scaling.totalQuestions} câu hỏi…</> : <><Sparkles className="w-5 h-5 text-amber-300" /> Tạo trận đấu & sinh link</>}
          </button>
          {error && <p role="alert" className="text-sm text-rose-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>}
        </form>

        {result && (
          <div className="space-y-5">
            <div className="flex items-start gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div>{result.provider} · {result.questions.length} câu · {result.execution_time}</div>
                <div className="text-xs text-emerald-400/70">
                  {result.attempts.map((a) => `${a.model}: ${a.ok ? 'OK' : a.error} (${a.ms}ms)`).join(' → ')}
                </div>
                {result.review_topics.length > 0 && <div className="text-xs text-sky-400">🔁 Ôn tập lặp lại: {result.review_topics.join(', ')}</div>}
              </div>
            </div>
            {result.db_warning && <p className="text-sm text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {result.db_warning}</p>}

            {baseLink && (
              <div className="bg-blue-900/30 border border-blue-500/40 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-bold"><LinkIcon className="w-5 h-5" /> Link cho học sinh</div>
                {(result.variants.length ? result.variants : [null]).map((code) => {
                  const link = code ? `${baseLink}?v=${code}` : baseLink;
                  return (
                    <div key={code ?? 'base'} className="flex items-center gap-2">
                      {code && <span className="text-xs font-mono font-bold text-amber-400 shrink-0">Mã {code}</span>}
                      <input readOnly value={link} className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-xs" />
                      <button onClick={() => copy(link)} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold flex items-center gap-1 shrink-0">
                        <Copy className="w-4 h-4" /> {copied === link ? 'Đã chép' : 'Chép'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {baseLink && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-rose-400 flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Chẩn đoán lỗ hổng kiến thức</h2>
                  <button onClick={loadDiagnostics} className="text-sm flex items-center gap-1 text-slate-300 hover:text-white"><RefreshCw className={`w-4 h-4 ${diagLoading ? 'animate-spin' : ''}`} /> Tải</button>
                </div>
                {!diag && <p className="text-sm text-slate-500">Sau khi học sinh làm bài, bấm “Tải” để xem các chủ điểm bị sai nhiều nhất.</p>}
                {diag && diag.diagnostics.length === 0 && <p className="text-sm text-slate-500">{diag.participants ? 'Chưa phát hiện điểm yếu.' : 'Chưa có học sinh nộp bài.'}</p>}
                {diag?.diagnostics.map((d) => (
                  <div key={d.topic} className="text-sm">
                    <div className="flex justify-between"><span>{d.topic} <span className="text-xs text-slate-500">({d.skill_tag})</span></span><span className="text-rose-400 font-mono">{Math.round(d.failRate * 100)}% sai</span></div>
                    <div className="h-2 bg-slate-950 rounded-full overflow-hidden mt-1"><div className="h-full bg-rose-500" style={{ width: `${d.failRate * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5">
              <h2 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-2"><BookOpen className="w-5 h-5" /> Gợi ý giáo án</h2>
              <ol className="space-y-2 list-decimal list-inside text-sm text-slate-300">
                {result.teaching_notes.map((n, i) => <li key={i}>{n}</li>)}
              </ol>
              {result.knowledge_matrix && result.knowledge_matrix.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-bold text-slate-300 mb-2">Ma trận kiến thức trích từ tài liệu</div>
                  <div className="flex flex-wrap gap-2">
                    {result.knowledge_matrix.map((k) => <span key={k.topic} title={k.summary} className="text-xs px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">{k.topic}</span>)}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h2 className="text-lg font-bold text-blue-400 flex items-center gap-2"><Sword className="w-5 h-5" /> Đề bài ({result.questions.length} câu)</h2>
              {result.questions.map((q, idx) => (
                <div key={q.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-blue-400">Câu {idx + 1}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800">{q.difficulty} · {timeLimitFor(q.difficulty)}s</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800">{q.topic}</span>
                    {q.is_review && <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">ôn tập</span>}
                  </div>
                  <p className="font-semibold">{q.question}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, o) => (
                      <div key={o} className={`p-2 rounded-lg border text-sm ${o === q.correct_idx ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' : 'border-slate-800 text-slate-400'}`}>{opt}</div>
                    ))}
                  </div>
                  {q.explanation && <p className="text-xs text-slate-500">💡 {q.explanation}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-black text-amber-400">{value}</div>
    </div>
  );
}
