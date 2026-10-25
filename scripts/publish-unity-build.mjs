#!/usr/bin/env node
// Publishes the Unity WebGL build (public/unity/boatrace/Build) to Supabase Storage so it is no
// longer part of the web deployment (45 MB → ~13 MB gzip on a CDN, cached for a year).
//
//   node --env-file=.env.local scripts/publish-unity-build.mjs [--dry]
//
// - gzips data / wasm / framework (the browser unzips them itself, so no special headers needed)
// - uploads to the public bucket "unity-builds" under boatrace/<content-hash>/ (immutable)
// - writes src/config/unityBuild.json, which RaceSceneUnity reads
// Uses SUPABASE_SERVICE_ROLE_KEY from the environment (never printed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import https from 'node:https';

const DRY = process.argv.includes('--dry');
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('Thiếu NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (chạy với --env-file=.env.local)');
  process.exit(1);
}

const BUCKET = 'unity-builds';
const SRC = path.resolve('public/unity/boatrace/Build');
const NAME = 'boatrace';
const MANIFEST = path.resolve('src/config/unityBuild.json');
const files = { loader: `${NAME}.loader.js`, framework: `${NAME}.framework.js`, data: `${NAME}.data`, code: `${NAME}.wasm` };
for (const f of Object.values(files)) {
  if (!fs.existsSync(path.join(SRC, f))) {
    console.error(`Không thấy ${f} trong ${SRC} — build Unity trước (BoatRaceSceneBuilder.BuildWebGL).`);
    process.exit(1);
  }
}

const H = { Authorization: `Bearer ${KEY}`, apikey: KEY };

async function ensureBucket() {
  const r = await fetch(`${URL_}/storage/v1/bucket/${BUCKET}`, { headers: H });
  if (r.ok) return;
  const c = await fetch(`${URL_}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 50 * 1024 * 1024 }),
  });
  if (!c.ok) throw new Error(`Tạo bucket thất bại: ${c.status} ${await c.text()}`);
  console.log(`✓ Đã tạo bucket công khai "${BUCKET}"`);
}

/** Already there with the same size (a previous run got it through)? Then skip it. */
async function alreadyUploaded(objectPath, size) {
  const r = await fetch(`${URL_}/storage/v1/object/info/${BUCKET}/${objectPath}`, { headers: H });
  if (!r.ok) return false;
  const info = await r.json().catch(() => ({}));
  return Number(info.size) === size;
}

// node:https instead of fetch: on a slow uplink a 10 MB file takes minutes, and fetch gives up
// after 300 s without response headers.
function upload(objectPath, body, contentType) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const req = https.request(`${URL_}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': contentType, 'Content-Length': body.length, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' },
    }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => (res.statusCode && res.statusCode < 300 ? resolve((Date.now() - started) / 1000) : reject(new Error(`Upload ${objectPath} thất bại: ${res.statusCode} ${text.slice(0, 300)}`))));
    });
    req.on('error', reject);
    req.end(body);
  });
}

const hash = crypto.createHash('sha256');
const out = {};
for (const [kind, f] of Object.entries(files)) {
  const raw = fs.readFileSync(path.join(SRC, f));
  hash.update(raw);
  // The loader is tiny and must run as a plain <script>; everything else ships gzipped.
  const gz = kind !== 'loader';
  out[kind] = { file: gz ? `${f}.gz` : f, body: gz ? zlib.gzipSync(raw, { level: 9 }) : raw, raw: raw.length };
}
const version = hash.digest('hex').slice(0, 12);
const base = `${URL_}/storage/v1/object/public/${BUCKET}/${NAME}/${version}`;

let total = 0;
for (const [kind, v] of Object.entries(out)) {
  total += v.body.length;
  console.log(`${kind.padEnd(9)} ${v.file.padEnd(26)} ${(v.raw / 1e6).toFixed(1)} MB → ${(v.body.length / 1e6).toFixed(1)} MB`);
}
console.log(`Tổng tải về: ${(total / 1e6).toFixed(1)} MB · phiên bản ${version}`);

if (DRY) {
  console.log('(--dry: không tải lên)');
  process.exit(0);
}

await ensureBucket();
for (const [kind, v] of Object.entries(out)) {
  const type = kind === 'loader' ? 'application/javascript' : 'application/gzip';
  const objectPath = `${NAME}/${version}/${v.file}`;
  if (await alreadyUploaded(objectPath, v.body.length)) {
    console.log(`= ${v.file} (đã có, bỏ qua)`);
    continue;
  }
  const secs = await upload(objectPath, v.body, type);
  console.log(`✓ ${v.file} (${secs.toFixed(0)}s)`);
}

const manifest = {
  $comment: 'Viết bởi scripts/publish-unity-build.mjs — bản Unity WebGL trên CDN (Supabase Storage). Đặt NEXT_PUBLIC_UNITY_BUILD_URL=/unity/boatrace/Build để dùng bản cục bộ.',
  version,
  baseUrl: base,
  gzip: true,
  files: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.file])),
  bytes: total,
};
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`✓ Đã ghi ${path.relative(process.cwd(), MANIFEST)}\n  ${base}`);
