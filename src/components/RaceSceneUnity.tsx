'use client';

import { useEffect, useRef, useState } from 'react';
import { unityBuild, type UnityBuild } from '../config/unityBuild';

// Boat Race scene built in Unity (unity/BoatRace3D, WebGL).
// The engine decides the race; Unity only draws it. Positions are sent as "player,bot" in 0..1.
// The build is NOT part of the web deployment: it is served gzipped from a CDN
// (scripts/publish-unity-build.mjs → src/config/unityBuild.json) and unzipped here.
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

/** Download one build file, gunzip it in the browser if needed, and hand Unity a blob: URL. */
async function fetchPart(build: UnityBuild, file: string, type: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<string> {
  const url = `${build.baseUrl}/${file}`;
  const res = await fetch(url, { signal });
  if (!res.ok || !res.body) throw new Error(`missing ${file}`);
  let stream: ReadableStream<Uint8Array> = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({ transform: (chunk, c) => { onBytes(chunk.length); c.enqueue(chunk); } }),
  );
  if (build.gzip && file.endsWith('.gz')) stream = stream.pipeThrough(new DecompressionStream('gzip') as unknown as TransformStream<Uint8Array, Uint8Array>);
  const blob = await new Response(stream).blob();
  return URL.createObjectURL(new Blob([blob], { type }));
}

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
    const blobs: string[] = [];
    const abort = new AbortController();
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      try {
        const build = unityBuild();
        if (!build) throw new Error('no build configured');
        if (build.gzip && typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream'); // old Safari → 3D fallback
        await new Promise<void>((resolve, reject) => {
          script = document.createElement('script');
          script.src = `${build.baseUrl}/${build.files.loader}`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('loader failed'));
          document.body.appendChild(script);
        });
        if (cancelled || !window.createUnityInstance) return;

        // Download (≈70% of the bar), then Unity starts up (the rest).
        let got = 0;
        const onBytes = (n: number) => {
          got += n;
          if (!cancelled && build.bytes) setProgress(Math.min(0.7, (got / build.bytes) * 0.7));
        };
        const [dataUrl, codeUrl, frameworkUrl] = await Promise.all([
          fetchPart(build, build.files.data, 'application/octet-stream', onBytes, abort.signal),
          fetchPart(build, build.files.code, 'application/wasm', onBytes, abort.signal),
          fetchPart(build, build.files.framework, 'application/javascript', onBytes, abort.signal),
        ]);
        blobs.push(dataUrl, codeUrl, frameworkUrl);
        if (cancelled) return;
        const inst = await window.createUnityInstance(
          canvas,
          {
            dataUrl,
            frameworkUrl,
            codeUrl,
            streamingAssetsUrl: 'StreamingAssets',
            companyName: 'TutorCraft',
            productName: 'BoatRace3D',
            productVersion: build.version,
            // blob: URLs change every load — Unity's IndexedDB cache would only pile up copies.
            // The HTTP cache (1 year, immutable versioned paths) does the caching instead.
            cacheControl: () => 'no-store',
          },
          (p) => !cancelled && setProgress(0.7 + p * 0.3),
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
      abort.abort();
      const inst = unity.current;
      unity.current = null;
      if (inst) void inst.Quit().catch(() => {}).finally(() => blobs.forEach((u) => URL.revokeObjectURL(u)));
      else blobs.forEach((u) => URL.revokeObjectURL(u));
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
