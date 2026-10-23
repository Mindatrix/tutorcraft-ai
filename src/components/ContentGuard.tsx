'use client';

import { useEffect, useState } from 'react';

// Copy deterrents for exam content. These raise the effort of casually leaking a
// test (copy-paste, right-click save, Ctrl+U, print) and stamp every screenshot
// with who leaked it. They cannot stop a determined user (browser menus, phone
// cameras) — the real protection is that answers never reach the browser early.

const BLOCKED_KEYS = new Set(['F12']);

function isBlockedShortcut(e: KeyboardEvent): boolean {
  if (BLOCKED_KEYS.has(e.key)) return true;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return false;
  const k = e.key.toLowerCase();
  if (e.shiftKey && ['i', 'j', 'c'].includes(k)) return true; // DevTools panels
  if (e.altKey && ['i', 'j', 'c', 'u'].includes(k)) return true; // macOS DevTools / source
  return ['u', 's', 'p', 'c', 'a', 'x'].includes(k); // view-source, save, print, copy, select-all, cut
}

export function useContentGuard(enabled: boolean, onBlocked: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const stop = (e: Event) => {
      e.preventDefault();
      onBlocked();
    };
    const key = (e: KeyboardEvent) => {
      if (!isBlockedShortcut(e)) return;
      const target = e.target as HTMLElement | null;
      // Let students still use Ctrl+A / C inside the nickname input.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !['F12'].includes(e.key) && !e.shiftKey) return;
      stop(e);
    };
    document.addEventListener('contextmenu', stop);
    document.addEventListener('copy', stop);
    document.addEventListener('cut', stop);
    document.addEventListener('dragstart', stop);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('contextmenu', stop);
      document.removeEventListener('copy', stop);
      document.removeEventListener('cut', stop);
      document.removeEventListener('dragstart', stop);
      document.removeEventListener('keydown', key, true);
    };
  }, [enabled, onBlocked]);
}

/** Blur exam content while the window is in the background (deters alt-tab look-ups and capture tools). */
export function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    const vis = () => (document.hidden ? off() : on());
    window.addEventListener('focus', on);
    window.addEventListener('blur', off);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', off);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return focused;
}

/**
 * Dynamic watermark tiled over the arena: tutor, class, student id and a clock
 * that changes every minute, so any photo or recording of the test is traceable.
 */
export function Watermark({ tutorName, classCode, studentId, dark }: { tutorName: string; classCode: string; studentId: string; dark: boolean }) {
  const [stamp, setStamp] = useState('');
  useEffect(() => {
    const tick = () => setStamp(new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }));
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  const text = `${tutorName || 'TutorCraft'} · Lớp ${classCode || '—'} · HS ${studentId} · ${stamp}`;
  return (
    <div aria-hidden className="pointer-events-none select-none fixed inset-0 z-40 overflow-hidden">
      <div className="absolute -inset-1/2 flex flex-wrap content-start gap-x-16 gap-y-14 -rotate-[24deg]" style={{ opacity: dark ? 0.07 : 0.06 }}>
        {Array.from({ length: 80 }, (_, i) => (
          <span key={i} className={`whitespace-nowrap text-sm font-bold ${dark ? 'text-white' : 'text-slate-900'}`}>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
