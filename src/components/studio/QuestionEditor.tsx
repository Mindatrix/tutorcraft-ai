'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_IDS,
  clozeGapCount,
  convertQuestion,
  questionShare,
  questionTimeLimit,
  questionType,
  type Difficulty,
  type DifficultyLevel,
  type MatchPair,
  type PairRelation,
  type Question,
  type QuestionType,
} from '../../engine';
import { field } from './types';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const RELATIONS: { id: PairRelation; name: string }[] = [
  { id: 'term_definition', name: 'Thuật ngữ → Định nghĩa' },
  { id: 'formula_example', name: 'Công thức → Ví dụ' },
  { id: 'situation_response', name: 'Tình huống → Cách xử lý' },
  { id: 'cause_effect', name: 'Nguyên nhân → Kết quả' },
];
const small = 'text-xs bg-slate-900 border border-slate-700 rounded-lg px-2 py-1';
const lbl = 'block text-xs font-semibold text-slate-400 mb-1';

// Lists are edited as raw text and split without trimming, so Enter / commas never
// get swallowed while typing. The server trims and validates on publish.
const lines = (v: string) => v.split('\n');
const commas = (v: string) => v.split(',');

interface Props {
  q: Question;
  index: number;
  level?: DifficultyLevel;
  problem: string | null;
  onChange: (q: Question) => void;
  onRemove: () => void;
}

export default function QuestionEditor({ q, index, level, problem, onChange, onRemove }: Props) {
  const type = questionType(q);
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });

  return (
    <div className={`bg-slate-950 p-4 rounded-xl border space-y-3 ${problem ? 'border-rose-500/60' : 'border-slate-800'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-blue-400">Câu {index + 1}</span>
        <select aria-label="Dạng bài" value={type} onChange={(e) => onChange(convertQuestion(q, e.target.value as QuestionType))} className={`${small} font-bold text-amber-300`}>
          {QUESTION_TYPE_IDS.map((t) => (
            <option key={t} value={t}>{QUESTION_TYPES[t].icon} {QUESTION_TYPES[t].nameVi} · ×{QUESTION_TYPES[t].weight} HP</option>
          ))}
        </select>
        <select aria-label="Độ khó" value={q.difficulty} onChange={(e) => set({ difficulty: e.target.value as Difficulty })} className={small}>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{d} · {questionTimeLimit({ type, difficulty: d }, level)}s</option>)}
        </select>
        <input aria-label="Chủ điểm" value={q.topic} onChange={(e) => set({ topic: e.target.value.slice(0, 80) })} className={`${small} flex-1 min-w-24`} />
        <span className="text-xs text-rose-300 font-mono" title="Phần Boss HP của câu này">{questionShare(q)} HP</span>
        {q.is_review && <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">ôn tập</span>}
        <button type="button" onClick={onRemove} aria-label={`Xoá câu ${index + 1}`} className="ml-auto text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
      </div>

      <div>
        <label className={lbl} htmlFor={`q-${index}`}>{type === 'mcq' ? 'Câu hỏi' : 'Yêu cầu / đề bài'}</label>
        <textarea id={`q-${index}`} rows={2} value={q.question} onChange={(e) => set({ question: e.target.value.slice(0, 600) })} className={`${field} py-2`} />
      </div>

      {type === 'mcq' && <McqFields q={q} index={index} set={set} />}
      {(type === 'essay' || type === 'reading') && <WritingFields q={q} index={index} set={set} reading={type === 'reading'} />}
      {type === 'matching' && <MatchingFields q={q} index={index} set={set} />}
      {type === 'transform' && <TransformFields q={q} index={index} set={set} />}
      {type === 'reorder' && <ReorderFields key={q.id} q={q} index={index} set={set} />}
      {type === 'cloze' && <ClozeFields q={q} index={index} set={set} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input aria-label="Gợi ý" placeholder="Gợi ý (hiện khi mở Mắt Thần / Miracle Buff)" value={q.hint ?? ''} onChange={(e) => set({ hint: e.target.value.slice(0, 300) })} className={`${field} py-2 text-sm`} />
        <input aria-label="Giải thích" placeholder="Giải thích sau khi trả lời" value={q.explanation ?? ''} onChange={(e) => set({ explanation: e.target.value.slice(0, 600) })} className={`${field} py-2 text-sm`} />
      </div>
      {problem && <p className="text-xs text-rose-400">{problem}</p>}
    </div>
  );
}

type FieldProps = { q: Question; index: number; set: (p: Partial<Question>) => void };

function McqFields({ q, index, set }: FieldProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {q.options.map((opt, o) => (
        <label key={o} className={`flex items-center gap-2 rounded-lg border px-2 ${o === q.correct_idx ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-800'}`}>
          <input type="radio" name={`correct-${index}`} checked={o === q.correct_idx} onChange={() => set({ correct_idx: o })} aria-label={`Đáp án đúng ${String.fromCharCode(65 + o)}`} />
          <span className="text-xs text-slate-500">{String.fromCharCode(65 + o)}</span>
          <input value={opt} onChange={(e) => set({ options: q.options.map((x, k) => (k === o ? e.target.value.slice(0, 200) : x)) })} aria-label={`Đáp án ${String.fromCharCode(65 + o)}`} className="flex-1 bg-transparent py-2 text-sm focus:outline-none" />
        </label>
      ))}
    </div>
  );
}

function WritingFields({ q, index, set, reading }: FieldProps & { reading: boolean }) {
  return (
    <div className="space-y-2">
      {reading && (
        <div>
          <label className={lbl} htmlFor={`passage-${index}`}>Đoạn văn đọc hiểu (hiện bên trái màn hình học sinh)</label>
          <textarea id={`passage-${index}`} rows={5} value={q.passage ?? ''} onChange={(e) => set({ passage: e.target.value.slice(0, 4000) })} className={`${field} py-2 text-sm`} />
        </div>
      )}
      <div>
        <label className={lbl} htmlFor={`rubric-${index}`}>🎯 Tiêu chí chấm (Rubric) cho AI — học sinh không thấy</label>
        <textarea id={`rubric-${index}`} rows={2} value={q.rubric ?? ''} placeholder="VD: Dùng đúng quá khứ đơn; có ít nhất 3 hoạt động; câu rõ nghĩa." onChange={(e) => set({ rubric: e.target.value.slice(0, 800) })} className={`${field} py-2 text-sm`} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="text-xs text-slate-400">Số từ tối thiểu
          <input type="number" min={1} max={400} value={q.min_words ?? ''} onChange={(e) => set({ min_words: Number(e.target.value) || undefined })} className={`${field} py-2 mt-1`} />
        </label>
        <label className="text-xs text-slate-400">Số từ tối đa
          <input type="number" min={1} max={800} value={q.max_words ?? ''} onChange={(e) => set({ max_words: Number(e.target.value) || undefined })} className={`${field} py-2 mt-1`} />
        </label>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">Ý chính cần có (mỗi dòng 1 ý)
          <textarea rows={3} value={(q.key_points ?? []).join('\n')} onChange={(e) => set({ key_points: lines(e.target.value) })} className={`${field} py-2 mt-1 text-sm`} />
        </label>
        <label className="text-xs text-slate-400">Bài mẫu (hiện sau khi nộp)
          <textarea rows={3} value={q.sample_answer ?? ''} onChange={(e) => set({ sample_answer: e.target.value.slice(0, 1500) })} className={`${field} py-2 mt-1 text-sm`} />
        </label>
      </div>
    </div>
  );
}

function MatchingFields({ q, index, set }: FieldProps) {
  const pairs = q.pairs ?? [];
  const setPair = (k: number, patch: Partial<MatchPair>) => set({ pairs: pairs.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-2">
      <div>
        <label className={lbl} htmlFor={`hub-${index}`}>🔗 Khái niệm trung tâm (Hub Header)</label>
        <input id={`hub-${index}`} value={q.hub ?? ''} placeholder="VD: Thì Quá khứ Đơn — Past Simple" onChange={(e) => set({ hub: e.target.value.slice(0, 120) })} className={`${field} py-2`} />
      </div>
      {pairs.map((p, k) => (
        <div key={k} className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[1fr_1fr_11rem_auto] gap-2 items-center">
          <input aria-label={`Vế trái ${k + 1}`} value={p.left} onChange={(e) => setPair(k, { left: e.target.value.slice(0, 200) })} className={`${field} py-2 text-sm`} />
          <input aria-label={`Vế phải ${k + 1}`} value={p.right} onChange={(e) => setPair(k, { right: e.target.value.slice(0, 300) })} className={`${field} py-2 text-sm`} />
          <select aria-label={`Quan hệ ${k + 1}`} value={p.relation ?? ''} onChange={(e) => setPair(k, { relation: (e.target.value || undefined) as PairRelation | undefined })} className={`${small} hidden sm:block`}>
            <option value="">— quan hệ —</option>
            {RELATIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button type="button" onClick={() => set({ pairs: pairs.filter((_, j) => j !== k) })} aria-label={`Xoá cặp ${k + 1}`} className="text-slate-500 hover:text-rose-400"><X className="w-4 h-4" /></button>
        </div>
      ))}
      {pairs.length < 8 && (
        <button type="button" onClick={() => set({ pairs: [...pairs, { left: '', right: '' }] })} className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"><Plus className="w-3.5 h-3.5" /> Thêm cặp</button>
      )}
      <label className="text-xs text-slate-400 block">💡 Giải thích chuyên sâu (mở khoá khi nối đúng hết)
        <textarea rows={2} value={q.deep_insight ?? ''} onChange={(e) => set({ deep_insight: e.target.value.slice(0, 800) })} className={`${field} py-2 mt-1 text-sm`} />
      </label>
    </div>
  );
}

function TransformFields({ q, index, set }: FieldProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_9rem] gap-2">
        <label className="text-xs text-slate-400">Câu gốc
          <input value={q.source ?? ''} onChange={(e) => set({ source: e.target.value.slice(0, 400) })} className={`${field} py-2 mt-1`} />
        </label>
        <label className="text-xs text-slate-400">Từ gợi ý (ngoặc)
          <input value={q.cue ?? ''} onChange={(e) => set({ cue: e.target.value.slice(0, 60) })} className={`${field} py-2 mt-1`} />
        </label>
      </div>
      <label className="text-xs text-slate-400 block" htmlFor={`ans-${index}`}>Các câu viết lại được chấp nhận (mỗi dòng 1 câu)</label>
      <textarea id={`ans-${index}`} rows={2} value={(q.answers ?? []).join('\n')} onChange={(e) => set({ answers: lines(e.target.value) })} className={`${field} py-2 text-sm`} />
      <label className="text-xs text-slate-400 block">⚡ Cụm từ then chốt — tụ lực phép khi học sinh gõ đúng (cách nhau bởi dấu phẩy)
        <input value={(q.key_phrases ?? []).join(',')} onChange={(e) => set({ key_phrases: commas(e.target.value) })} className={`${field} py-2 mt-1 text-sm`} />
      </label>
    </div>
  );
}

function ReorderFields({ q, index, set }: FieldProps) {
  const [raw, setRaw] = useState(() => (q.tokens ?? []).join(' | '));
  const parse = (v: string) => (v.includes('|') ? v.split('|') : v.split(' ')).map((t) => t.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      <label className="text-xs text-slate-400 block" htmlFor={`tok-${index}`}>Câu đúng — tách mảnh ghép bằng dấu | (không có | thì tách theo từ)</label>
      <input id={`tok-${index}`} value={raw} onChange={(e) => { setRaw(e.target.value); set({ tokens: parse(e.target.value) }); }} className={`${field} py-2`} />
      <div className="flex flex-wrap gap-1">
        {(q.tokens ?? []).map((t, k) => <span key={k} className="text-xs px-2 py-1 rounded-md bg-slate-800 border border-slate-700">{t}</span>)}
      </div>
      <label className="text-xs text-slate-400 block">Thứ tự khác cũng đúng (mỗi dòng 1 câu, tuỳ chọn)
        <textarea rows={1} value={(q.answers ?? []).join('\n')} onChange={(e) => set({ answers: lines(e.target.value) })} className={`${field} py-2 mt-1 text-sm`} />
      </label>
    </div>
  );
}

function ClozeFields({ q, index, set }: FieldProps) {
  const text = q.text ?? '';
  const n = clozeGapCount(text);
  const gaps = Array.from({ length: n }, (_, k) => q.gaps?.[k] ?? { answers: [] });
  const setText = (t: string) => {
    const count = clozeGapCount(t);
    set({ text: t.slice(0, 2000), gaps: Array.from({ length: count }, (_, k) => q.gaps?.[k] ?? { answers: [] }) });
  };
  return (
    <div className="space-y-2">
      <label className="text-xs text-slate-400 block" htmlFor={`cloze-${index}`}>Đoạn văn — viết ô trống là {'{{1}}'}, {'{{2}}'}…</label>
      <textarea id={`cloze-${index}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} className={`${field} py-2 text-sm`} />
      <button type="button" onClick={() => setText(`${text}${text && !text.endsWith(' ') ? ' ' : ''}{{${n + 1}}}`)} className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-800"><Plus className="w-3.5 h-3.5" /> Thêm ô trống</button>
      {gaps.map((g, k) => (
        <label key={k} className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono shrink-0">{`{{${k + 1}}}`}</span>
          <input aria-label={`Đáp án ô ${k + 1}`} placeholder="đáp án, cách viết khác…" value={g.answers.join(',')} onChange={(e) => set({ gaps: gaps.map((x, j) => (j === k ? { answers: commas(e.target.value) } : x)) })} className={`${field} py-1.5 text-sm`} />
        </label>
      ))}
      <label className="text-xs text-slate-400 block">Ngân hàng từ (tuỳ chọn, cách nhau bởi dấu phẩy) — có thì ô trống thành danh sách chọn
        <input value={(q.word_bank ?? []).join(',')} onChange={(e) => set({ word_bank: e.target.value.trim() ? commas(e.target.value) : undefined })} className={`${field} py-2 mt-1 text-sm`} />
      </label>
    </div>
  );
}
