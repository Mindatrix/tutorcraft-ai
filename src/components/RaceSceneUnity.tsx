'use client';

import { useEffect, useRef, useState } from 'react';

// Boat Race scene built in Unity (unity/BoatRace3D → public/unity/boatrace, WebGL).
// The engine decides the race; Unity only draws it. Positions are sent as "player,bot" in 0..1.
// Falls back (onUnavailable) when the build is missing or WebGL/WASM can't start.

interface UnityInstance {
  SendMessage: (obj: string, method: string, value?: string | number) => void;
  Quit: () => Promise<void>;
}
type CreateUnity = (canvas: HTMLCanvasElement, config: Record<string, unknown>, onProgress?: (p: number) => void) => Promise<UnityInstance>;
declare global {
  interface Window {
    createUnityInstance?: CreateUnity;
  }
}

const BASE = '/unity/boatrace/Build/boatrace';

interface Props {
  playerPos: number;
  botPos: number;
  result?: 'win' | 'lose' | 'draw' | null;
  onUnavailable?: () => void;
}

export default function RaceSceneUnity({ playerPos, botPos, result, onUnavailable }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const unity = useRef<UnityInstance | null>(null);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let script: HTMLScriptElement | null = null;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      try {
        const head = await fetch(`${BASE}.loader.js`, { method: 'HEAD' });
        if (!head.ok) throw new Error('missing build');
        await new Promise<void>((resolve, reject) => {
          script = document.createElement('script');
          script.src = `${BASE}.loader.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('loader failed'));
          document.body.appendChild(script);
        });
        if (cancelled || !window.createUnityInstance) return;
        const inst = await window.createUnityInstance(
          canvas,
          {
            dataUrl: `${BASE}.data`,
            frameworkUrl: `${BASE}.framework.js`,
            codeUrl: `${BASE}.wasm`,
            streamingAssetsUrl: 'StreamingAssets',
            companyName: 'TutorCraft',
            productName: 'BoatRace3D',
            productVersion: '1.0',
          },
          (p) => !cancelled && setProgress(p),
        );
        if (cancelled) {
          void inst.Quit();
          return;
        }
        unity.current = inst;
        setReady(true);
      } catch {
        if (!cancelled) onUnavailable?.();
      }
    })();

    return () => {
      cancelled = true;
      const inst = unity.current;
      unity.current = null;
      if (inst) void inst.Quit().catch(() => {});
      script?.remove();
    };
  }, [onUnavailable]);

  useEffect(() => {
    if (ready) unity.current?.SendMessage('RaceController', 'SetPositions', `${playerPos.toFixed(4)},${botPos.toFixed(4)}`);
  }, [ready, playerPos, botPos]);

  useEffect(() => {
    if (ready && result) unity.current?.SendMessage('RaceController', 'SetResult', result);
  }, [ready, result]);

  return (
    <div className="relative w-full h-56 sm:h-72 rounded-2xl overflow-hidden border border-sky-500/30" aria-hidden>
      {/* Unity's Emscripten input layer looks the canvas up by id ("#" + id); without one it throws. */}
      <canvas ref={canvasRef} id="unity-boatrace-canvas" className="absolute inset-0 w-full h-full" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-xs text-slate-200 bg-sky-900/40">Đang tải sông 3D… {Math.round(progress * 100)}%</div>}
    </div>
  );
}
