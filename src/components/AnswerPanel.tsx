'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, Swords, Undo2 } from 'lucide-react';
import { GAP_RE, QUESTION_TYPES, normalizeText, wordCount, type AnswerReveal, type BattleState, type PublicQuestion } from '../engine';
import { correctPrefix, countKeyPhrases } from '../client/hash';

// Dynamic control panel under the battle scene: it becomes option buttons, a writing
// box, matching cards, a rewrite field, word chips or gap inputs depending on the
// current question. It never knows the answers — the server checks every submission.

export interface AnswerPayload {
  chosenIdx?: number;
  response?: unknown;
}

interface Props {
  question: PublicQuestion;
  state: BattleState;
  reveal: AnswerReveal | null;
  /** Feedback showing or a request in flight. */
  locked: boolean;
  pending: boolean;
  dark: boolean;
  onSubmit: (p: AnswerPayload) => void;
  onPair: (left: number, rightId: number) => void;
  /** 0..1 key phrases typed correctly (transform) → magic charge on the canvas. */
  onCharge?: (ratio: number) => void;
  /** 0..1 correct prefix placed (reorder) → hero steps toward the boss. */
  onAdvance?: (ratio: number) => void;
}

export default function AnswerPanel(props: Props) {
  const { question } = props;
  // Remount per question so local drafts never leak into the next one.
  switch (question.type) {
    case 'mcq':
      return <McqPanel key={question.id} {...props} />;
    case 'essay':
    case 'reading':
      return <WritingPanel key={question.id} {...props} />;
    case 'matching':
      return <MatchingPanel key={question.id} {...props} />;
    case 'transform':
      return <TransformPanel key={question.id} {...props} />;
    case 'reorder':
      return <ReorderPanel key={question.id} {...props} />;
    case 'cloze':
      return <ClozePanel key={question.id} {...props} />;
  }
}

const btn = (dark: boolean) => (dark ? 'bg-slate-950 border-slate-800 text-slate-200 hover:border-blue-500 hover:bg-blue-600/10' : 'bg-white border-slate-300 text-slate-800 hover:border-blue-500');
const inputCls = (dark: boolean) => `w-full rounded-xl px-3 py-2.5 border focus:outline-none focus:border-blue-500 ${dark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300'}`;
const blockPaste = (e: React.ClipboardEvent) => e.preventDefault();

function SubmitButton({ disabled, pending, onClick, label = 'Tung đòn' }: { disabled: boolean; pending: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 disabled:opacity-40 flex items-center justify-center gap-2">
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />} {label}
    </button>
  );
}

/** Score, AI rubric bars, feedback and model answer — shown after locking in. */
function RevealBox({ reveal, dark }: { reveal: AnswerReveal | null; dark: boolean }) {
  if (!reveal || reveal.type === 'mcq') return null;
  const pct = Math.round((reveal.score ?? 0) * 100);
  const c = reveal.grade?.criteria;
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  return (
    <div className={`rounded-xl border p-3 space-y-2 text-sm ${pct >= 60 ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-rose-500/40 bg-rose-500/10'}`}>
      <div className="flex items-center justify-between font-bold">
        <span>{pct >= 90 ? '💥 CRITICAL' : pct >= 60 ? '✅ Đạt' : '❌ Chưa đạt'} · {pct}%</span>
        {reveal.grade?.by && <span className={`text-xs font-normal ${muted}`}>{reveal.grade.by === 'ai' ? 'AI chấm theo Rubric' : reveal.grade.by === 'fallback' ? 'Chấm tự động (AI bận)' : 'Chấm theo đáp án'}</span>}
      </div>
      {c && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          {([['Ngữ pháp', c.grammar], ['Từ vựng', c.vocabulary], ['Ý chính', c.ideas]] as const).map(([name, v]) => (
            <div key={name}>
              <div className="flex justify-between"><span>{name}</span><span className="font-mono">{v}</span></div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-sky-500 to-emerald-400" style={{ width: `${v}%` }} /></div>
            </div>
          ))}
        </div>
      )}
      {reveal.grade?.feedback && <p>💬 {reveal.grade.feedback}</p>}
      {reveal.solution?.filter(Boolean).length ? <p className={muted}>📘 Đáp án: {reveal.solution.filter(Boolean).slice(0, 3).join('  /  ')}</p> : null}
      {reveal.deepInsight && <p className="text-amber-300">🌟 Giải mã chuyên sâu: {reveal.deepInsight}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

function McqPanel({ question, state, reveal, locked, dark, onSubmit }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {(question.options ?? []).map((opt, i) => {
        const hidden = state.removed.includes(i);
        let cls = btn(dark);
        if (reveal) {
          if (i === reveal.correctIdx) cls = 'bg-emerald-500/20 border-emerald-500 text-emerald-600 ring-2 ring-emerald-500';
          else if (i === reveal.chosenIdx) cls = 'bg-rose-500/20 border-rose-500 text-rose-500';
        }
        return (
          <button key={i} onClick={() => onSubmit({ chosenIdx: i })} disabled={locked || hidden} className={`p-4 rounded-xl border text-left font-semibold text-sm transition-all ${cls} ${hidden ? 'opacity-20 line-through' : ''}`}>
            <span className="mr-2 opacity-60">{String.fromCharCode(65 + i)}.</span>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function WritingPanel({ question, reveal, locked, pending, dark, onSubmit }: Props) {
  const [text, setText] = useState('');
  const [pasteNote, setPasteNote] = useState(false);
  const words = wordCount(text);
  const min = question.minWords ?? 1;
  const max = question.maxWords ?? 999;
  const reading = question.type === 'reading';
  const box = (
    <div className="space-y-2">
      <textarea
        aria-label="Bài làm"
        rows={reading ? 5 : 6}
        value={text}
        disabled={locked}
        onChange={(e) => setText(e.target.value.slice(0, 4000))}
        onPaste={(e) => {
          blockPaste(e);
          setPasteNote(true);
        }}
        placeholder={reading ? 'Thông điệp chính của đoạn văn là…' : 'Viết bài của bạn bằng tiếng Anh…'}
        className={`${inputCls(dark)} select-text`}
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs font-mono ${words < min ? 'text-amber-400' : words > max ? 'text-rose-400' : 'text-emerald-400'}`}>
          {words} từ · yêu cầu {min}–{max}
          {pasteNote && <span className="ml-2 text-amber-400">· Hãy tự gõ câu trả lời (không dán)</span>}
        </span>
        <SubmitButton disabled={locked || words === 0} pending={pending} onClick={() => onSubmit({ response: normalizeText(text) })} label={pending ? 'AI đang chấm…' : 'Nộp bài & tung đòn'} />
      </div>
      <RevealBox reveal={reveal} dark={dark} />
    </div>
  );
  if (!reading) return box;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <article className={`rounded-xl border p-4 text-sm leading-relaxed max-h-80 overflow-auto ${dark ? 'border-sky-500/30 bg-sky-950/30' : 'border-sky-200 bg-sky-50'}`}>
        <div className="text-xs font-bold text-sky-400 mb-2">👁️ THỬ THÁCH MẮT THẦN — đọc kỹ đoạn văn</div>
        {question.passage}
      </article>
      {box}
    </div>
  );
}

function MatchingPanel({ question, state, reveal, locked, pending, dark, onPair, onSubmit }: Props) {
  const [left, setLeft] = useState<number | null>(null);
  const [miss, setMiss] = useState<{ left: number; right: number } | null>(null);
  const lastTry = useRef<{ left: number; right: number } | null>(null);
  const missN = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const lefts = useRef<(HTMLButtonElement | null)[]>([]);
  const rights = useRef<Map<number, HTMLButtonElement | null>>(new Map());
  const [beams, setBeams] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);
  // After the last pair the reveal carries the full key: draw every beam, not the pre-completion state.
  const matched = reveal?.pairs
    ? reveal.pairs.flatMap((p, i) => {
        const r = question.rightItems?.find((x) => x.text === p.right);
        return r ? [{ left: i, right: r.id }] : [];
      })
    : (question.matched ?? []);
  const matchedLeft = new Set(matched.map((m) => m.left));
  const matchedRight = new Set(matched.map((m) => m.right));

  // Wrong pair from the server → flash those two cards red.
  useEffect(() => {
    const ev = state.event;
    if (ev?.kind === 'miss' && ev.n !== missN.current && lastTry.current) {
      missN.current = ev.n;
      const tried = lastTry.current;
      const t1 = setTimeout(() => setMiss(tried), 0);
      const t2 = setTimeout(() => setMiss(null), 700);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [state.event]);

  // Energy beams between matched cards.
  useLayoutEffect(() => {
    const measure = () => {
      const box = wrap.current?.getBoundingClientRect();
      if (!box) return;
      setBeams(
        matched.flatMap((m) => {
          const a = lefts.current[m.left]?.getBoundingClientRect();
          const b = rights.current.get(m.right)?.getBoundingClientRect();
          return a && b ? [{ x1: a.right - box.left, y1: a.top + a.height / 2 - box.top, x2: b.left - box.left, y2: b.top + b.height / 2 - box.top }] : [];
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(matched)]);

  const pickRight = (id: number) => {
    if (left === null || locked) return;
    lastTry.current = { left, right: id };
    onPair(left, id);
    setLeft(null);
  };

  const card = (on: boolean, done: boolean, bad: boolean) =>
    `w-full text-left p-3 rounded-xl border text-sm font-semibold transition-all ${
      done ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.35)]' : bad ? 'border-rose-500 bg-rose-500/20 animate-pulse' : on ? 'border-amber-400 bg-amber-400/15 ring-2 ring-amber-400' : btn(dark)
    }`;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-fuchsia-400/50 bg-gradient-to-r from-fuchsia-600/25 via-indigo-600/25 to-sky-600/25 px-4 py-3 text-center shadow-[0_0_30px_rgba(192,38,211,0.25)]">
        <div className="text-[10px] tracking-[0.3em] text-fuchsia-200/80 font-bold">KHÁI NIỆM TRUNG TÂM</div>
        <div className="text-lg md:text-xl font-black">{question.hub || question.topic}</div>
        <div className="text-xs opacity-70">Đã nối {matched.length}/{question.leftItems?.length ?? 0} · mỗi cặp đúng = 1 đòn combo, nối hết = Tuyệt kỹ</div>
      </div>
      <div ref={wrap} className="relative grid grid-cols-2 gap-x-10 gap-y-2">
        <svg className="pointer-events-none absolute inset-0 w-full h-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="beam" x1="0" x2="1">
              <stop offset="0" stopColor="#fbbf24" />
              <stop offset="1" stopColor="#34d399" />
            </linearGradient>
          </defs>
          {beams.map((b, i) => (
            <g key={i}>
              <line {...b} stroke="url(#beam)" strokeWidth="6" strokeOpacity="0.25" strokeLinecap="round" />
              <line {...b} stroke="url(#beam)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 6" className="animate-[beam_0.6s_linear_infinite]" />
            </g>
          ))}
        </svg>
        <div className="space-y-2">
          {(question.leftItems ?? []).map((t, i) => (
            <button key={i} ref={(el) => { lefts.current[i] = el; }} disabled={locked || matchedLeft.has(i)} onClick={() => setLeft(i)} className={card(left === i, matchedLeft.has(i), miss?.left === i)}>
              {t}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {(question.rightItems ?? []).map((r) => (
            <button key={r.id} ref={(el) => { rights.current.set(r.id, el); }} disabled={locked || matchedRight.has(r.id) || left === null} onClick={() => pickRight(r.id)} className={card(false, matchedRight.has(r.id), miss?.right === r.id)}>
              {r.text}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs opacity-80">
        <span>{left === null ? 'Chọn một thẻ bên trái, rồi thẻ khớp bên phải.' : 'Giờ chọn thẻ khớp ở cột phải →'}</span>
        {!locked && matched.length > 0 && (
          <button type="button" onClick={() => onSubmit({ chosenIdx: -1 })} disabled={pending} className="underline">Kết thúc với {matched.length} cặp</button>
        )}
      </div>
      {reveal?.pairs && (
        <ul className="text-xs space-y-1">
          {reveal.pairs.map((p, i) => <li key={i}>🔗 <b>{p.left}</b> → {p.right}</li>)}
        </ul>
      )}
      <RevealBox reveal={reveal} dark={dark} />
    </div>
  );
}

function TransformPanel({ question, reveal, locked, pending, dark, onSubmit, onCharge }: Props) {
  const [text, setText] = useState('');
  const [charged, setCharged] = useState(0);
  const total = question.keyHashes?.length ?? 0;

  // "Charge Magic": light up as key phrases appear (checked against salted hashes).
  useEffect(() => {
    if (!question.salt || !total) return;
    let live = true;
    const t = setTimeout(async () => {
      const n = await countKeyPhrases(question.salt!, question.keyHashes!, text);
      if (!live) return;
      setCharged(n);
      onCharge?.(n / total);
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, question.salt, question.keyHashes, total, onCharge]);

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-3 ${dark ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
        <div className="text-xs opacity-60">Câu gốc</div>
        <div className="font-semibold">{question.source}</div>
        {question.cue && <div className="mt-1 text-sm">Dùng từ: <span className="px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-400/50 font-bold">({question.cue})</span></div>}
      </div>
      <input aria-label="Câu viết lại" value={text} disabled={locked} onPaste={blockPaste} onChange={(e) => setText(e.target.value.slice(0, 600))} placeholder="Viết lại câu…" className={`${inputCls(dark)} select-text`} spellCheck={false} />
      {total > 0 && (
        <div className="flex items-center gap-2 text-xs font-bold text-violet-300">
          ✨ Tụ Lực Phép Thuật
          <div className="flex gap-1">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`w-4 h-4 rounded-full border transition-all ${i < charged ? 'bg-violet-400 border-violet-200 shadow-[0_0_12px_rgba(167,139,250,0.9)]' : 'border-violet-500/40'}`} />
            ))}
          </div>
          <span className="font-mono">{charged}/{total}</span>
        </div>
      )}
      <div className="flex justify-end">
        <SubmitButton disabled={locked || !text.trim()} pending={pending} onClick={() => onSubmit({ response: normalizeText(text) })} />
      </div>
      <RevealBox reveal={reveal} dark={dark} />
    </div>
  );
}

function ReorderPanel({ question, reveal, locked, pending, dark, onSubmit, onAdvance }: Props) {
  const chips = question.chips ?? [];
  const [placed, setPlaced] = useState<number[]>([]);
  const [steps, setSteps] = useState(0);
  const byId = new Map(chips.map((c) => [c.id, c.text]));

  // Hero steps forward for every correctly placed chip from the start of the sentence.
  useEffect(() => {
    if (!question.salt || !question.prefixHashes) return;
    let live = true;
    void correctPrefix(question.salt, question.prefixHashes, placed.map((id) => byId.get(id) ?? '')).then((k) => {
      if (!live) return;
      setSteps(k);
      onAdvance?.(chips.length ? k / chips.length : 0);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, question.salt, question.prefixHashes]);

  const chip = 'px-3 py-2 rounded-lg border text-sm font-semibold transition-all';
  return (
    <div className="space-y-3">
      <div className={`min-h-14 rounded-xl border-2 border-dashed p-2 flex flex-wrap gap-2 ${dark ? 'border-slate-700' : 'border-slate-300'}`} aria-label="Câu đang xếp">
        {placed.length === 0 && <span className="text-xs opacity-50 self-center px-1">Bấm các mảnh ghép theo đúng thứ tự…</span>}
        {placed.map((id, i) => (
          <button key={id} disabled={locked} onClick={() => setPlaced((p) => p.filter((x) => x !== id))} className={`${chip} ${i < steps ? 'border-emerald-400 bg-emerald-500/20' : 'border-sky-500/60 bg-sky-500/10'}`}>
            {byId.get(id)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.filter((c) => !placed.includes(c.id)).map((c) => (
          <button key={c.id} disabled={locked} onClick={() => setPlaced((p) => [...p, c.id])} className={`${chip} ${btn(dark)}`}>
            {c.text}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-emerald-400">🦶 Hero tiến {steps}/{chips.length} bước</span>
        <div className="flex gap-2">
          <button type="button" disabled={locked || !placed.length} onClick={() => setPlaced([])} className={`${chip} ${btn(dark)} flex items-center gap-1`}><Undo2 className="w-4 h-4" /> Xếp lại</button>
          <SubmitButton disabled={locked || placed.length !== chips.length} pending={pending} onClick={() => onSubmit({ response: placed })} label="Đòn dứt điểm" />
        </div>
      </div>
      <RevealBox reveal={reveal} dark={dark} />
    </div>
  );
}

function ClozePanel({ question, reveal, locked, pending, dark, onSubmit }: Props) {
  const n = question.gapCount ?? 0;
  const [values, setValues] = useState<string[]>(() => Array(n).fill(''));
  const parts = (question.clozeText ?? '').split(GAP_RE);
  // split with a capture group → [text, gapNo, text, gapNo, …]
  const set = (k: number, v: string) => setValues((vs) => vs.map((x, i) => (i === k ? v.slice(0, 60) : x)));
  const sel = `inline-block mx-1 my-0.5 rounded-lg border px-2 py-1 text-sm ${dark ? 'bg-slate-950 border-amber-500/60' : 'bg-white border-amber-500'}`;
  return (
    <div className="space-y-3">
      <p className="leading-loose text-base">
        {parts.map((p, i) => {
          if (i % 2 === 0) return <span key={i}>{p}</span>;
          const k = Number(p) - 1;
          return question.wordBank?.length ? (
            <select key={i} aria-label={`Ô trống ${k + 1}`} disabled={locked} value={values[k] ?? ''} onChange={(e) => set(k, e.target.value)} className={sel}>
              <option value="">({k + 1}) …</option>
              {question.wordBank.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          ) : (
            <input key={i} aria-label={`Ô trống ${k + 1}`} disabled={locked} value={values[k] ?? ''} onPaste={blockPaste} onChange={(e) => set(k, e.target.value)} placeholder={`(${k + 1})`} className={`${sel} w-28 select-text`} spellCheck={false} />
          );
        })}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs opacity-70">{QUESTION_TYPES.cloze.icon} {values.filter((v) => v.trim()).length}/{n} ô đã điền</span>
        <SubmitButton disabled={locked || values.every((v) => !v.trim())} pending={pending} onClick={() => onSubmit({ response: values.map((v) => normalizeText(v)) })} />
      </div>
      <RevealBox reveal={reveal} dark={dark} />
    </div>
  );
}
