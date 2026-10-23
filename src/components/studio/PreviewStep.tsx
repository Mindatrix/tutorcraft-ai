'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, Plus, Rocket, Trash2, AlertTriangle, BookOpen } from 'lucide-react';
import {
  BOSS_AVATARS,
  MAP_SETTINGS,
  timeLimitFor,
  type BattleEvent,
  type BossProfile,
  type Difficulty,
  type Question,
} from '../../engine';
import BattleCanvas from '../BattleCanvas';
import { field, label, type PublishedBattle, type StudioDraft } from './types';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Reasons a question can't be published, or null if it's fine. */
function questionProblem(q: Question): string | null {
  if (!q.question.trim()) return 'Thiếu nội dung câu hỏi';
  const opts = q.options.map((o) => o.trim());
  if (opts.some((o) => !o)) return 'Có đáp án để trống';
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Có đáp án trùng nhau';
  return null;
}

export default function PreviewStep({ draft, onBack, onPublished }: { draft: StudioDraft; onBack: () => void; onPublished: (p: PublishedBattle) => void }) {
  const [boss, setBoss] = useState<BossProfile>(draft.boss);
  const [questions, setQuestions] = useState<Question[]>(draft.questions);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview scene state — buttons fire the same events the real battle uses.
  const bossMax = Math.max(1, questions.length) * 100;
  const [sim, setSim] = useState<{ bossHp: number; hp: number; event: { kind: BattleEvent; n: number; amount?: number } | null }>({ bossHp: bossMax, hp: 100, event: null });
  const fire = (kind: BattleEvent, bossDelta: number, hpDelta: number, amount?: number) =>
    setSim((p) => ({
      bossHp: Math.max(0, p.bossHp - bossDelta),
      hp: Math.max(0, p.hp - hpDelta),
      event: { kind, n: (p.event?.n ?? 0) + 1, amount },
    }));

  const setB = <K extends keyof BossProfile>(k: K, v: BossProfile[K]) => setBoss((b) => ({ ...b, [k]: v }));
  const updateQ = (i: number, patch: Partial<Question>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const updateOption = (i: number, o: number, value: string) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, options: q.options.map((x, k) => (k === o ? value : x)) } : q)));
  const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i));
  const addQ = () =>
    setQuestions((qs) => [
      ...qs,
      { id: qs.length + 1, question: '', options: ['', '', '', ''], correct_idx: 0, difficulty: 'medium', topic: draft.lessonTitle.slice(0, 60) || 'general', skill_tag: 'other' },
    ]);

  const problems = questions.map(questionProblem);
  const problemCount = problems.filter(Boolean).length;
  const canPublish = questions.length >= 2 && problemCount === 0 && boss.boss_name.trim().length > 0;

  const publish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setError(null);
    try {
      const s = draft.settings;
      const res = await fetch('/api/battles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: draft.lessonTitle,
          boss,
          teaching_notes: draft.teaching_notes,
          questions: questions.map((q) => ({ ...q, question: q.question.trim(), options: q.options.map((o) => o.trim()) })),
          config: {
            scenario: s.scenario,
            mode: s.mode,
            themes: s.themes,
            durationMinutes: s.durationMinutes,
            studentCount: s.studentCount,
            teamSize: s.teamSize,
            classCode: s.classCode || undefined,
            cefrLevel: s.cefrLevel || undefined,
            examType: s.scenario === 'coop_raid' ? 'group' : 'individual',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Không xuất bản được đấu trường');
      onPublished({ ...data, lessonTitle: draft.lessonTitle });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
        <div>
          <div>{draft.provider} · {draft.questions.length} câu · {draft.execution_time}</div>
          <div className="text-xs text-emerald-400/70">{draft.attempts.map((a) => `${a.model}: ${a.ok ? 'OK' : a.error} (${a.ms}ms)`).join(' → ')}</div>
          {draft.review_topics.length > 0 && <div className="text-xs text-sky-400">🔁 Ôn tập lặp lại: {draft.review_topics.join(', ')}</div>}
        </div>
      </div>

      {/* Boss + arena */}
      <section className="bg-slate-900 border border-rose-500/30 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-bold text-rose-400">👹 Boss & Bản đồ</h2>
        {draft.settings.mode === 'gamified' ? (
          <>
            <BattleCanvas boss={boss} heroAvatar="🦊" heroName="Học sinh" bossHp={sim.bossHp} bossMax={bossMax} hp={sim.hp} hpMax={100} shield={false} event={sim.event} />
            <div className="flex flex-wrap gap-2">
              <PreviewBtn onClick={() => fire('correct', 100, 0, 100)}>⚔️ Đòn đúng</PreviewBtn>
              <PreviewBtn onClick={() => fire('critical', 150, 0, 150)}>💥 Chí mạng</PreviewBtn>
              <PreviewBtn onClick={() => fire('wrong', 0, 25, 25)}>👹 Boss phản công</PreviewBtn>
              <PreviewBtn onClick={() => fire('critical', bossMax, 0, bossMax)}>🏆 Hạ Boss</PreviewBtn>
              <PreviewBtn onClick={() => setSim({ bossHp: bossMax, hp: 100, event: null })}>↺ Đặt lại</PreviewBtn>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Chế độ Standard Academic không hiển thị Boss cho học sinh.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="boss-name">Tên Boss</label>
            <input id="boss-name" value={boss.boss_name} onChange={(e) => setB('boss_name', e.target.value.slice(0, 60))} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="map-name">Tên đấu trường</label>
            <input id="map-name" value={boss.map_name} onChange={(e) => setB('map_name', e.target.value.slice(0, 60))} className={field} />
          </div>
        </div>
        <div>
          <span className={label}>Tạo hình Boss</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BOSS_AVATARS.map((a) => (
              <button key={a.id} type="button" onClick={() => setB('boss_avatar', a.id)} aria-pressed={boss.boss_avatar === a.id} className={`p-3 rounded-xl border text-sm font-bold ${boss.boss_avatar === a.id ? 'border-rose-500 bg-rose-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                {a.emoji} {a.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Bối cảnh bản đồ</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MAP_SETTINGS.map((m) => (
              <button key={m.id} type="button" onClick={() => setB('map_setting', m.id)} aria-pressed={boss.map_setting === m.id} className={`p-2.5 rounded-xl border text-sm ${boss.map_setting === m.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={label} htmlFor="dialogue">Lời thoại khi học sinh trả lời sai</label>
          <textarea id="dialogue" rows={2} value={boss.boss_dialogue_on_attack} onChange={(e) => setB('boss_dialogue_on_attack', e.target.value.slice(0, 160))} className={field} />
        </div>
        <div>
          <span className={label}>Kỹ năng Boss</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <input key={i} aria-label={`Kỹ năng ${i + 1}`} value={boss.boss_skills[i] ?? ''} onChange={(e) => {
                const skills = [0, 1, 2].map((j) => boss.boss_skills[j] ?? '');
                skills[i] = e.target.value.slice(0, 60);
                setB('boss_skills', skills);
              }} className={field} />
            ))}
          </div>
        </div>
      </section>

      {/* Teaching notes */}
      {draft.teaching_notes.length > 0 && (
        <section className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-amber-400 mb-3 flex items-center gap-2"><BookOpen className="w-5 h-5" /> Gợi ý giáo án</h2>
          <ol className="space-y-2 list-decimal list-inside text-sm text-slate-300">
            {draft.teaching_notes.map((n, i) => <li key={i}>{n}</li>)}
          </ol>
          {draft.knowledge_matrix && draft.knowledge_matrix.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {draft.knowledge_matrix.map((k) => <span key={k.topic} title={k.summary} className="text-xs px-2 py-1 rounded-lg bg-slate-950 border border-slate-800">{k.topic}</span>)}
            </div>
          )}
        </section>
      )}

      {/* Questions */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-blue-400">⚔️ Câu hỏi ({questions.length}) · Boss HP {(questions.length * 100).toLocaleString('en-US')}</h2>
          <button type="button" onClick={addQ} className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800"><Plus className="w-4 h-4" /> Thêm câu</button>
        </div>
        {questions.map((q, i) => (
          <div key={i} className={`bg-slate-950 p-4 rounded-xl border space-y-3 ${problems[i] ? 'border-rose-500/60' : 'border-slate-800'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-blue-400">Câu {i + 1}</span>
              <select aria-label="Độ khó" value={q.difficulty} onChange={(e) => updateQ(i, { difficulty: e.target.value as Difficulty })} className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1">
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d} · {timeLimitFor(d)}s</option>)}
              </select>
              <input aria-label="Chủ điểm" value={q.topic} onChange={(e) => updateQ(i, { topic: e.target.value.slice(0, 80) })} className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 flex-1 min-w-24" />
              {q.is_review && <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">ôn tập</span>}
              <button type="button" onClick={() => removeQ(i)} aria-label={`Xoá câu ${i + 1}`} className="ml-auto text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
            </div>
            <textarea aria-label={`Nội dung câu ${i + 1}`} rows={2} value={q.question} onChange={(e) => updateQ(i, { question: e.target.value.slice(0, 600) })} className={`${field} py-2`} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {q.options.map((opt, o) => (
                <label key={o} className={`flex items-center gap-2 rounded-lg border px-2 ${o === q.correct_idx ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-800'}`}>
                  <input type="radio" name={`correct-${i}`} checked={o === q.correct_idx} onChange={() => updateQ(i, { correct_idx: o })} aria-label={`Đáp án đúng ${String.fromCharCode(65 + o)}`} />
                  <span className="text-xs text-slate-500">{String.fromCharCode(65 + o)}</span>
                  <input value={opt} onChange={(e) => updateOption(i, o, e.target.value.slice(0, 200))} aria-label={`Đáp án ${String.fromCharCode(65 + o)}`} className="flex-1 bg-transparent py-2 text-sm focus:outline-none" />
                </label>
              ))}
            </div>
            {problems[i] && <p className="text-xs text-rose-400">{problems[i]}</p>}
          </div>
        ))}
      </section>

      <div className="sticky bottom-3 bg-slate-950/90 backdrop-blur border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={onBack} className="px-4 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 font-bold flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" /> Quay lại</button>
        <button type="button" onClick={publish} disabled={!canPublish || publishing} className="flex-1 py-3 rounded-xl font-bold bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 disabled:opacity-50 flex items-center justify-center gap-2">
          {publishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />} Xuất bản Đấu trường
        </button>
      </div>
      {(problemCount > 0 || questions.length < 2) && (
        <p className="text-sm text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {questions.length < 2 ? 'Cần ít nhất 2 câu hỏi.' : `${problemCount} câu cần sửa trước khi xuất bản.`}</p>
      )}
      {error && <p role="alert" className="text-sm text-rose-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</p>}
    </div>
  );
}

function PreviewBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="px-3 py-1.5 rounded-lg border border-slate-700 text-sm hover:bg-slate-800">
      {children}
    </button>
  );
}
