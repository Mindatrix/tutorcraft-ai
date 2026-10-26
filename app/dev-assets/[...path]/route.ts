import { createReadStream, existsSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

// DEVELOPMENT ONLY: serves the local 3D library (~/Documents/3D_tutorcraft, outside the repo)
//   /dev-assets/web/<file> → <library>/_optimized/<file>
//   /dev-assets/low/<file> → <library>/_low/<file>
// Production uses NEXT_PUBLIC_ASSET_BASE_URL (a CDN); this route answers 404 there.

const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft').replace(/^~/, os.homedir()));
const DIRS: Record<string, string> = { web: '_optimized', low: '_low' };

export async function GET(_req: Request, ctx: RouteContext<'/dev-assets/[...path]'>) {
  if (process.env.NODE_ENV !== 'development') return new Response('Not found', { status: 404 });
  const [quality, ...rest] = (await ctx.params).path;
  const dir = DIRS[quality ?? ''];
  if (!dir || !rest.length || !rest.at(-1)!.toLowerCase().endsWith('.glb')) return new Response('Not found', { status: 404 });
  const base = path.join(ROOT, dir);
  const file = path.resolve(base, ...rest);
  if (!file.startsWith(base + path.sep) || !existsSync(file)) return new Response('Not found', { status: 404 });
  const size = statSync(file).size;
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { 'Content-Type': 'model/gltf-binary', 'Content-Length': String(size), 'Cache-Control': 'public, max-age=3600' } });
}
