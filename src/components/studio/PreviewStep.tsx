'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, Plus, Rocket, AlertTriangle, BookOpen, RefreshCw, FileText } from 'lucide-react';
import {
  BOSS_AVATARS,
  MAP_SETTINGS,
  QUESTION_TYPES,
  QUESTION_TYPE_IDS,
  bossHpForQuestions,
  convertQuestion,
  questionProblem,
  questionType,
  type BattleEvent,
  type BossProfile,
  type Question,
  type QuestionType,
  type StoryBeat,
} from '../../engine';
import BattleCanvas from '../BattleCanvas';
import QuestionEditor from './QuestionEditor';
import { field, label, type PublishedBattle, type StudioDraft } from './types';
import { authFetch } from '../../client/supabaseBrowser';

export default function PreviewStep({ draft, onBack, onPublished }: { draft: StudioDraft; onBack: () => void; onPublished: (p: PublishedBattle) => void }) {
  const [boss, setBoss] = useState<BossProfile>(draft.boss);
  const [questions, setQuestions] = useState<Question[]>(draft.questions);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newType, setNewType] = useState<QuestionType>(draft.settings.questionTypes?.[0] ?? 'mcq');
  const [refilling, setRefilling] = useState(false);
  const [refillMsg, setRefillMsg] = useState<string | null>(null);

  // Questions the AI did not write (topped up from the general bank) — the tutor must know.
  const bankIdx = questions.flatMap((q, i) => (q.from_bank ? [i] : []));
  /** Ask the AI again for exactly the bank questions (same formats), and swap them in. */
  const refill = async () => {
    if (!draft.request || !bankIdx.length) return;
    setRefilling(true);
    setRefillMsg(null);
    try {
      const counts: Partial<Record<QuestionType, number>> = {};
      for (const i of bankIdx) counts[questionType(questions[i])] = (counts[questionType(questions[i])] ?? 0) + 1;
      const res = await authFetch('/api/generate-battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft.request, refill: true, questionCount: bankIdx.length, typeCounts: counts, questionTypes: Object.keys(counts) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI chưa trả lời được');
      const fresh = ((data.questions ?? []) as Question[]).filter((q) => !q.from_bank);
      if (!fresh.length) throw new Error('AI vẫn chưa tạo được câu mới — thử lại sau ít phút, hoặc tự sửa các câu này.');
      // Matched by question id (not position) and only while still untouched, so edits the
      // tutor made during the ~10 s wait are kept.
      const assign = new Map<number, Question>();
      for (const i of bankIdx) {
        const j = fresh.findIndex((f) => questionType(f) === questionType(questions[i])); // same format first
        const pick = j >= 0 ? fresh.splice(j, 1)[0] : fresh.shift();
        if (pick) assign.set(questions[i].id, pick);
      }
      setQuestions((qs) => qs.map((q) => (q.from_bank && assign.has(q.id) ? { ...assign.get(q.id)!, id: q.id, from_bank: undefined } : q)));
      setRefillMsg(assign.size === bankIdx.length ? `✓ AI đã viết lại cả ${assign.size} câu.` : `AI viết lại được ${assign.size}/${bankIdx.length} câu — các câu còn lại vẫn từ ngân hàng.`);
    } catch (e) {
      setRefillMsg((e as Error).message);
    } finally {
      setRefilling(false);
    }
  };

  // Boss HP weighted by format: essay ×3, reading ×2.5, matching ×2 … (mcq stays 100).
  const weightedHp = bossHpForQuestions(questions);
  // Preview scene state — buttons fire the same events the real battle uses.
  const bossMax = Math.max(100, weightedHp);
  type SimEvent = { kind: BattleEvent; n: number; amount?: number; beats?: StoryBeat[] };
  const [sim, setSim] = useState<{ bossHp: number; hp: number; phase: 1 | 2; event: SimEvent | null }>({ bossHp: bossMax, hp: 100, phase: 1, event: null });
  const fire = (kind: BattleEvent, bossDelta: number, hpDelta: number, amount?: number, beats?: StoryBeat[]) =>
    setSim((p) => {
      const bossHp = Math.max(0, p.bossHp - bossDelta);
      return {
        bossHp,
        hp: Math.max(0, p.hp - hpDelta),
        phase: p.phase === 2 || (bossHp > 0 && bossHp <= bossMax / 2) ? 2 : 1,
        event: { kind, n: (p.event?.n ?? 0) + 1, amount, beats },
      };
    });

  const setB = <K extends keyof BossProfile>(k: K, v: BossProfile[K]) => setBoss((b) => ({ ...b, [k]: v }));
  const replaceQ = (i: number, q: Question) => setQuestions((qs) => qs.map((x, j) => (j === i ? q : x)));
  const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i));
  const addQ = () =>
    setQuestions((qs) => {
      const blank: Question = { id: Math.max(0, ...qs.map((q) => q.id)) + 1, question: '', options: ['', '', '', ''], correct_idx: 0, difficulty: 'medium', topic: draft.lessonTitle.slice(0, 60) || 'general', skill_tag: 'other' };
      return [...qs, newType === 'mcq' ? blank : convertQuestion(blank, newType)];
    });
  const typeCounts = QUESTION_TYPE_IDS.map((t) => [t, questions.filter((q) => questionType(q) === t).length] as const).filter(([, n]) => n);

  const problems = questions.map(questionProblem);
  const problemCount = problems.filter(Boolean).length;
  const canPublish = questions.length >= 2 && problemCount === 0 && boss.boss_name.trim().length > 0;

  const publish = async () => {
    if (!canPublish) return;
    setPublishing(true);
    setError(null);
    try {
      const s = draft.settings;
      const res = await authFetch('/api/battles', {
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
            questionTypes: Array.from(new Set(questions.map(questionType))),
            tutorName: s.tutorName || undefined,
            cefrLevel: s.cefrLevel || undefined,
            level: s.level,
            gameMode: s.gameMode ?? undefined,
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

      {draft.document_info && (draft.document_info.truncated || draft.document_info.chunks > 1) && (
        <div className="flex items-start gap-2 px-4 py-3 border border-sky-500/30 bg-sky-500/10 rounded-xl text-sky-300 text-sm">
          <FileText className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Tài liệu “{draft.document_info.name}” dài {draft.document_info.chars.toLocaleString('en-US')} ký tự
            {draft.document_info.source === 'docx' ? ' (đọc từ Word)' : ''} — đã chia thành {draft.document_info.chunks} đoạn
            {draft.document_info.truncated
              ? `, AI dùng ${draft.document_info.usedChunks} đoạn liên quan nhất tới chủ đề và rải đều khắp tài liệu (≈${draft.document_info.usedChars.toLocaleString('en-US')} ký tự). Muốn tập trung một phần cụ thể, hãy ghi rõ trong ô Chủ đề (vd: “Unit 3 — Passive”).`
              : ', AI đọc toàn bộ và rải câu hỏi đều qua các đoạn.'}
          </div>
        </div>
      )}

      {(draft.fill || bankIdx.length > 0) && (
        <div role="alert" className="px-4 py-3 border-2 border-amber-400/70 bg-amber-500/10 rounded-xl text-amber-200 text-sm space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
            <div>
              {draft.fill?.reason === 'ai_failed'
                ? <><b>AI không phản hồi được</b> — toàn bộ {draft.fill.fromBank} câu đang lấy từ <b>ngân hàng câu hỏi chung</b> (tiếng Anh tổng quát, không theo bài học của bạn).</>
                : draft.fill
                  ? <><b>AI chỉ tạo được {draft.fill.fromAi}/{draft.fill.requested} câu hợp lệ.</b> {draft.fill.fromBank} câu còn lại được bù từ <b>ngân hàng câu hỏi chung</b>, không theo bài học của bạn.</>
                  : <>Còn câu lấy từ ngân hàng câu hỏi chung.</>}
              {' '}Các câu này có viền vàng và nhãn “⚠ ngân hàng dự phòng”{bankIdx.length ? ` (câu ${bankIdx.map((i) => i + 1).join(', ')})` : ''}. Hãy sửa, xoá, hoặc nhờ AI viết lại trước khi xuất bản.
            </div>
          </div>
          {bankIdx.length > 0 && draft.request && (
            <button type="button" onClick={refill} disabled={refilling} className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400/60 hover:bg-amber-500/20 disabled:opacity-50">
              {refilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Nhờ AI viết lại {bankIdx.length} câu này
            </button>
          )}
          {refillMsg && <p role="status" className="text-xs">{refillMsg}</p>}
        </div>
      )}

      {/* Boss + arena */}
      <section className="border-l-4 border-rose-400 bg-white/[0.04] p-5 space-y-4">
        <h2 className="text-lg font-bold text-rose-400">👹 Boss & Bản đồ</h2>
        {draft.settings.mode === 'gamified' ? (
          <>
            <BattleCanvas boss={boss} heroAvatar="🦊" heroName="Học sinh" bossHp={sim.bossHp} bossMax={bossMax} hp={sim.hp} hpMax={100} shield={false} event={sim.event} bossPhase={sim.phase} />
            <div className="flex flex-wrap gap-2">
              <PreviewBtn onClick={() => fire('correct', 100, 0, 100)}>⚔️ Đòn đúng</PreviewBtn>
              <PreviewBtn onClick={() => fire('critical', 150, 0, 150)}>💥 Chí mạng</PreviewBtn>
              <PreviewBtn onClick={() => fire('wrong', 0, 25, 25)}>👹 Boss phản công</PreviewBtn>
              <PreviewBtn onClick={() => fire('critical', Math.max(0, sim.bossHp - Math.floor(bossMax / 2)), 0, 150, [{ kind: 'phase', text: boss.phase2_dialogue }])}>⚡ Biến hình</PreviewBtn>
              <PreviewBtn onClick={() => fire('critical', bossMax, 0, bossMax)}>🏆 Hạ Boss</PreviewBtn>
              <PreviewBtn onClick={() => setSim({ bossHp: bossMax, hp: 100, phase: 1, event: null })}>↺ Đặt lại</PreviewBtn>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="p2name">Tên hình thái 2 (còn 50% HP)</label>
            <input id="p2name" value={boss.phase2_name} onChange={(e) => setB('phase2_name', e.target.value.slice(0, 60))} className={field} />
          </div>
          <div>
            <label className={label} htmlFor="p2line">Lời thoại khi biến hình</label>
            <input id="p2line" value={boss.phase2_dialogue} onChange={(e) => setB('phase2_dialogue', e.target.value.slice(0, 200))} className={field} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="enrage">Lời thoại cuồng nộ + gợi ý (khi sai 3 câu liên tiếp)</label>
          <input id="enrage" value={boss.enrage_dialogue} onChange={(e) => setB('enrage_dialogue', e.target.value.slice(0, 200))} className={field} />
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
        <section className="border-l-4 border-amber-400 bg-white/[0.04] p-5">
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
      <section className="border-l-4 border-slate-500 bg-white/[0.04] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-blue-400">⚔️ Câu hỏi ({questions.length}) · Boss HP {weightedHp.toLocaleString('en-US')}</h2>
            <p className="text-xs text-slate-500">
              {typeCounts.map(([t, n]) => `${QUESTION_TYPES[t].icon} ${QUESTION_TYPES[t].nameVi} ×${n}`).join(' · ')} — HP tính theo dạng bài và độ khó (tự luận ×3, đọc hiểu ×2.5, nối cặp ×2…)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="Dạng câu mới" value={newType} onChange={(e) => setNewType(e.target.value as QuestionType)} className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5">
              {QUESTION_TYPE_IDS.map((t) => <option key={t} value={t}>{QUESTION_TYPES[t].icon} {QUESTION_TYPES[t].nameVi}</option>)}
            </select>
            <button type="button" onClick={addQ} className="text-sm flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800"><Plus className="w-4 h-4" /> Thêm câu</button>
          </div>
        </div>
        {questions.map((q, i) => (
          <QuestionEditor key={q.id} q={q} index={i} level={draft.settings.level} problem={problems[i]} onChange={(nq) => replaceQ(i, nq)} onRemove={() => removeQ(i)} />
        ))}
      </section>

      <div className="sticky bottom-3 border-t-2 border-amber-300/70 bg-slate-950/95 backdrop-blur p-3 flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={onBack} className="tc-sticker tc-sticker--ghost"><ArrowLeft className="w-4 h-4" /> Quay lại</button>
        <button type="button" onClick={publish} disabled={!canPublish || publishing} className="tc-sticker tc-sticker--coral flex-1 disabled:opacity-50 disabled:pointer-events-none">
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
