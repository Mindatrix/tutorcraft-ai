'use client';

import { useMemo, useState } from 'react';
import { AVATAR_COLORS, avatarTemplates, lookKey, suggestLook, type Look } from '../engine';

// Avatar picker when a student joins a class match (plan C2.1): a template (journey character, or a
// baby dinosaur in Dino Journey), one of 12 colours (with its name, for colour-blind students) and
// a display name. Template + colour is unique in the match: taken ones are crossed out and a free
// one is suggested; the server checks again and answers with its own suggestion if two students
// pick the same look at the same moment.

const ICON: Record<string, string> = {
  sunny: '🧒',
  orange_tee: '👦',
  gamer: '🎮',
  leaf_hood: '🍃',
  dancer: '💃',
  hiker: '🥾',
  trex: '🦖',
  raptor: '🦎',
  triceratops: '🦏',
  stegosaurus: '🐊',
  diplodocus: '🦕',
  sauropod: '🦒',
};

export interface AvatarPickerProps {
  game: string | null;
  /** Looks already taken in the match (from the roster). */
  taken: Look[];
  initialName?: string;
  busy?: boolean;
  /** The server refused the pick (someone took it at the same moment), with its suggestion. */
  error?: { message: string; suggest?: Look | null } | null;
  onPick(pick: Look & { name: string }): void;
}

export default function AvatarPicker({ game, taken, initialName = '', busy, error, onPick }: AvatarPickerProps) {
  const templates = avatarTemplates(game);
  const used = useMemo(() => new Set(taken.map(lookKey)), [taken]);
  const first = useMemo(() => suggestLook(game, {}, taken), [game, taken]);
  const [template, setTemplate] = useState(first?.template ?? templates[0].id);
  const [color, setColor] = useState(first?.color ?? AVATAR_COLORS[0].hex);
  const [name, setName] = useState(initialName);
  const isTaken = used.has(lookKey({ template, color }));
  const suggestion = isTaken ? suggestLook(game, { template, color }, taken) : null;
  const apply = (l: Look) => {
    setTemplate(l.template);
    setColor(l.color);
  };
  const tName = (id: string) => templates.find((t) => t.id === id)?.nameVi ?? id;
  const cName = (hex: string) => AVATAR_COLORS.find((c) => c.hex === hex)?.nameVi ?? hex;

  return (
    <form
      className="space-y-4 text-slate-100"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isTaken && name.trim()) onPick({ template, color, name: name.trim().slice(0, 24) });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-extrabold uppercase tracking-wider text-amber-200">Chọn nhân vật</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={template === t.id}
              onClick={() => setTemplate(t.id)}
              className={`flex flex-col items-center gap-1 border-2 px-2 py-2 text-xs font-bold ${template === t.id ? 'border-amber-300 bg-amber-300/15' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}
            >
              <span className="text-3xl" aria-hidden>
                {ICON[t.id] ?? '⭐'}
              </span>
              {t.nameVi}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-extrabold uppercase tracking-wider text-amber-200">Chọn màu</legend>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {AVATAR_COLORS.map((c) => {
            const off = used.has(lookKey({ template, color: c.hex }));
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={color === c.hex}
                aria-label={`${c.nameVi}${off ? ' (đã có bạn chọn)' : ''}`}
                title={c.nameVi}
                onClick={() => setColor(c.hex)}
                className={`relative h-10 border-2 ${color === c.hex ? 'border-white ring-2 ring-amber-300' : 'border-slate-800'}`}
                style={{ background: c.hex }}
              >
                {off && (
                  <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/45 text-lg font-black text-white">
                    ✕
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-300">
          Đang chọn: {tName(template)}, màu {cName(color)}
        </p>
      </fieldset>

      {(isTaken || error) && (
        <div role="alert" className="border border-amber-400/60 bg-amber-400/10 p-3 text-sm">
          <p>{error?.message ?? 'Kiểu này đã có bạn chọn.'}</p>
          {(error?.suggest ?? suggestion) && (
            <button type="button" className="mt-2 bg-amber-300 px-3 py-1 font-bold text-slate-900" onClick={() => apply((error?.suggest ?? suggestion)!)}>
              Dùng gợi ý: {tName((error?.suggest ?? suggestion)!.template)}, màu {cName((error?.suggest ?? suggestion)!.color)}
            </button>
          )}
        </div>
      )}

      <label className="block text-sm font-bold">
        Tên hiển thị
        <input
          value={name}
          maxLength={24}
          required
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          placeholder="Tên của em"
        />
      </label>

      <button type="submit" disabled={busy || isTaken || !name.trim()} className="w-full bg-emerald-400 py-2 font-extrabold text-slate-900 disabled:opacity-50">
        {busy ? 'Đang vào…' : 'Vào trận'}
      </button>
    </form>
  );
}
