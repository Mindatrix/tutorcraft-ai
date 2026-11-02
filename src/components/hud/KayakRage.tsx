'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Flame } from 'lucide-react';
import { KAYAK_RAGE, rageCanStart, rageInit, rageStart, rageStop, rageTick, type RageState } from '../../engine';
import { SkillButton } from './GameHUD';

// Kayak rage boost (WP10 U5, 02/11/2026): the bar fills while the race runs; when full it can be
// started only between questions (the question frame is closed) and stopped with a second press.
// The 3D scene reads `boost` (a ref, 0 or 1) for the speed-up look; the race result never changes.

const TICK_MS = 100;

export interface KayakRage {
  state: RageState;
  /** 1 while boosting (the scene eases it). */
  boost: { current: number };
  ready: boolean;
  toggle: () => void;
}

export function useKayakRage(running: boolean, questionOpen: boolean): KayakRage {
  const [state, setState] = useState<RageState>(rageInit);
  const st = useRef<RageState>(state);
  const boost = useRef(0);
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      st.current = rageTick(st.current, Math.min(0.5, (now - last) / 1000));
      last = now;
      boost.current = st.current.boosting ? 1 : 0;
      setState(st.current);
    }, TICK_MS);
    return () => {
      clearInterval(id);
      // Race over (or paused): the scene stops boosting.
      boost.current = 0;
    };
  }, [running]);
  const toggle = useCallback(() => {
    const s = st.current;
    st.current = s.boosting ? rageStop(s) : rageStart(s, questionOpen);
    boost.current = st.current.boosting ? 1 : 0;
    setState(st.current);
  }, [questionOpen]);
  return { state, boost, ready: rageCanStart(state, questionOpen), toggle };
}

/** Round "Nộ" button: fill ring = the bar; blinks when it can be started; counts seconds while on. */
export function RageButton({ rage, questionOpen }: { rage: KayakRage; questionOpen: boolean }) {
  const s = rage.state;
  const full = s.meter >= 1;
  const used = Math.floor(s.usedSec);
  const sub = s.boosting ? (s.usedSec > KAYAK_RAGE.longUseSec ? `${used}s · hồi lâu` : `${used}/${KAYAK_RAGE.longUseSec}s`) : full ? (questionOpen ? 'Đầy · chờ' : 'Bấm!') : `${Math.floor(s.meter * 100)}%`;
  const label = s.boosting ? 'Dừng tăng tốc' : full ? (questionOpen ? 'Nộ đầy: bấm khi chuyển câu' : 'Tăng tốc bằng Nộ') : 'Nộ đang tích';
  const cls = `tc-hud-rage ${s.boosting ? (s.usedSec > KAYAK_RAGE.longUseSec ? 'tc-hud-rage-on tc-hud-rage-long' : 'tc-hud-rage-on') : rage.ready ? 'tc-hud-rage-ready' : ''}`.trim();
  return <SkillButton icon={Flame} label={label} sub={sub} hotkey="4" main fill={s.meter} disabled={!s.boosting && !rage.ready} onClick={rage.toggle} className={cls} />;
}
