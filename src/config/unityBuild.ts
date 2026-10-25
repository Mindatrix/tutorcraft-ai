import published from './unityBuild.json';

// Where the Unity WebGL build is served from. It is kept OUT of the web deployment
// (public/unity is git- and vercel-ignored): `node --env-file=.env.local scripts/publish-unity-build.mjs`
// gzips it, uploads it to Supabase Storage and rewrites unityBuild.json.
// NEXT_PUBLIC_UNITY_BUILD_URL overrides it, e.g. "/unity/boatrace/Build" for a fresh local build
// (plain files) or a Cloudflare R2 / CDN folder holding the same gzipped files.

export interface UnityBuild {
  version: string;
  baseUrl: string;
  /** true = data / wasm / framework are .gz files the browser unzips itself. */
  gzip: boolean;
  files: { loader: string; framework: string; data: string; code: string };
  /** Total download size (for the progress bar); 0 = unknown. */
  bytes: number;
}

const LOCAL: UnityBuild = {
  version: 'local',
  baseUrl: '/unity/boatrace/Build',
  gzip: false,
  files: { loader: 'boatrace.loader.js', framework: 'boatrace.framework.js', data: 'boatrace.data', code: 'boatrace.wasm' },
  bytes: 0,
};

export function unityBuild(): UnityBuild | null {
  const override = process.env.NEXT_PUBLIC_UNITY_BUILD_URL?.replace(/\/$/, '');
  if (override) {
    const gzip = process.env.NEXT_PUBLIC_UNITY_BUILD_GZIP === '1';
    return { ...LOCAL, baseUrl: override, gzip, files: gzip ? { ...LOCAL.files, framework: `${LOCAL.files.framework}.gz`, data: `${LOCAL.files.data}.gz`, code: `${LOCAL.files.code}.gz` } : LOCAL.files };
  }
  const p = published as Partial<UnityBuild>;
  if (p.baseUrl && p.files?.loader && p.files.code && p.files.data && p.files.framework) {
    return { version: p.version ?? 'cdn', baseUrl: p.baseUrl, gzip: !!p.gzip, files: p.files, bytes: p.bytes ?? 0 };
  }
  // Nothing published yet: only a local dev build can work.
  return process.env.NODE_ENV === 'development' ? LOCAL : null;
}
