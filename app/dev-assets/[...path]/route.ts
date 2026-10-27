import { createReadStream, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

// DEVELOPMENT ONLY: serves the local 3D library (~/Documents/3D_tutorcraft, outside the repo)
//   /dev-assets/web/<file>  → <library>/_optimized/<file>   (.glb)
//   /dev-assets/low/<file>  → <library>/_low/<file>         (.glb)
//   /dev-assets/mid/<file>  → <library>/_mid/<file>         (.glb, ~5 k triangle avatars)
//   /dev-assets/fill/<file>, /dev-assets/fill_low/<file> → _fill, _fill_low (scattered scenery, ≤ 8 k / 3 k)
//   /dev-assets/hdri/<file> → <library>/hdri/<file>         (.hdr, 2K skies; the 1K ones are in /public)
// Production uses NEXT_PUBLIC_ASSET_BASE_URL (a CDN with web/, low/, mid/, fill/, fill_low/, hdri/: scripts/sync-assets-r2.mjs).
// This route answers 404 in production, unless TC_SERVE_LOCAL_ASSETS=1 (a production build tested on the LAN).

const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft').replace(/^~/, os.homedir()));
const DIRS: Record<string, { dir: string; ext: string; type: string }> = {
  web: { dir: '_optimized', ext: '.glb', type: 'model/gltf-binary' },
  low: { dir: '_low', ext: '.glb', type: 'model/gltf-binary' },
  mid: { dir: '_mid', ext: '.glb', type: 'model/gltf-binary' },
  fill: { dir: '_fill', ext: '.glb', type: 'model/gltf-binary' },
  fill_low: { dir: '_fill_low', ext: '.glb', type: 'model/gltf-binary' },
  hdri: { dir: 'hdri', ext: '.hdr', type: 'image/vnd.radiance' },
};

export async function GET(_req: Request, ctx: RouteContext<'/dev-assets/[...path]'>) {
  if (process.env.NODE_ENV !== 'development' && process.env.TC_SERVE_LOCAL_ASSETS !== '1') return new Response('Not found', { status: 404 });
  const [kind, ...rest] = (await ctx.params).path;
  const d = DIRS[kind ?? ''];
  if (!d || !rest.length || !rest.at(-1)!.toLowerCase().endsWith(d.ext)) return new Response('Not found', { status: 404 });
  const base = path.join(ROOT, d.dir);
  const file = path.resolve(base, ...rest);
  if (!file.startsWith(base + path.sep) || !existsSync(file)) return new Response('Not found', { status: 404 });
  const size = statSync(file).size;
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { 'Content-Type': d.type, 'Content-Length': String(size), 'Cache-Control': 'public, max-age=3600' } });
}
