#!/usr/bin/env node
// Đẩy thư viện 3D ĐÃ TỐI ƯU lên Cloudflare R2 (API tương thích S3), không cần thư viện ngoài.
//   node scripts/sync-assets-r2.mjs              chạy khô: in danh sách, dung lượng, file nào sẽ đẩy
//   node scripts/sync-assets-r2.mjs --apply      đẩy thật (bỏ qua file đã có cùng nội dung)
//   node scripts/sync-assets-r2.mjs --cors       chỉ đọc cấu hình CORS của bucket (không sửa)
//   thêm --include-rooms để đẩy cả multiverse/rooms/ (mặc định bỏ qua tới khi nội dung được duyệt)
//
// Thư mục trên R2 = thư mục mà code đọc (src/config/assetLibrary.ts):
//   web/  ← <thư viện>/_optimized   low/ ← _low   mid/ ← _mid   hdri/ ← hdri (bầu trời 2K)
// Không bao giờ đẩy file gốc (các thư mục camp/, dino/, … và "Multiverse Portal/").
// Khóa đọc từ .env.local: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
// (R2_PUBLIC_URL tùy chọn). Script KHÔNG in giá trị khóa ra màn hình hay log.
// Kết quả: out/r2-manifest.json (mỗi file: khóa, dung lượng, md5, cache) và manifest.json trên bucket.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CORS = args.includes('--cors');
const ROOMS = args.includes('--include-rooms');
const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft').replace(/^~/, os.homedir()));
const FOLDERS = [
  { prefix: 'web', dir: '_optimized', ext: '.glb' },
  { prefix: 'low', dir: '_low', ext: '.glb' },
  { prefix: 'mid', dir: '_mid', ext: '.glb' },
  { prefix: 'hdri', dir: 'hdri', ext: '.hdr' },
];
const TYPES = { '.glb': 'model/gltf-binary', '.hdr': 'image/vnd.radiance', '.json': 'application/json' };
// File names are stable (a re-optimized model keeps its key), so no "immutable": browsers keep a
// copy a day and may serve it a week longer while they check for a new one.
const CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Thiếu biến trong .env.local: ${missing.join(', ')}`);
  process.exit(1);
}
const { R2_ACCOUNT_ID: ACCOUNT, R2_ACCESS_KEY_ID: KEY_ID, R2_SECRET_ACCESS_KEY: SECRET, R2_BUCKET: BUCKET } = process.env;
const HOST = `${ACCOUNT}.r2.cloudflarestorage.com`;

// ---------------------------------------------------------------- AWS Signature V4 (service s3, region auto)
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (key) => key.split('/').map(enc).join('/');

async function s3(method, key, { query = {}, body = null, headers = {} } = {}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const canonicalUri = `/${BUCKET}${key ? `/${encPath(key)}` : ''}`;
  const qs = Object.keys(query)
    .sort()
    .map((k) => `${enc(k)}=${enc(String(query[k]))}`)
    .join('&');
  const payloadHash = body ? sha256(body) : sha256('');
  const signed = { host: HOST, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(signed).sort();
  const canonical = [method, canonicalUri, qs, names.map((n) => `${n}:${signed[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, day), 'auto'), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  const res = await fetch(`https://${HOST}${canonicalUri}${qs ? `?${qs}` : ''}`, {
    method,
    headers: { ...headers, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, Authorization: auth },
    body,
  });
  const text = await res.text();
  if (!res.ok && !(method === 'GET' && res.status === 404)) {
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] ?? '';
    throw new Error(`R2 ${method} ${key || '/'}: HTTP ${res.status} ${code}`);
  }
  return { status: res.status, text };
}

/** Every object under a prefix: key → { size, etag }. */
async function listRemote(prefix) {
  const out = new Map();
  let token = null;
  do {
    const query = { 'list-type': '2', prefix: `${prefix}/`, 'max-keys': '1000', ...(token ? { 'continuation-token': token } : {}) };
    const { text } = await s3('GET', '', { query });
    for (const m of text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]+)<\/Key>/.exec(m[1])?.[1];
      const size = Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? -1);
      const etag = (/<ETag>([^<]+)<\/ETag>/.exec(m[1])?.[1] ?? '').replace(/&quot;|"/g, '');
      if (key) out.set(key.replace(/&amp;/g, '&'), { size, etag });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(text) ? /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(text)?.[1] ?? null : null;
  } while (token);
  return out;
}

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.toLowerCase().endsWith(ext) && !e.name.endsWith('.tmp')) out.push(p);
  }
  return out;
}

if (CORS) {
  try {
    const { status, text } = await s3('GET', '', { query: { cors: '' } });
    if (status === 404) console.log('Bucket chưa có cấu hình CORS: trình duyệt ở tên miền khác sẽ không tải được model.');
    else console.log(text.replace(/></g, '>\n<'));
  } catch (e) {
    // An "Object Read & Write" token may not read bucket settings: check from a browser instead.
    console.log(`Không đọc được CORS bằng khóa này (${e.message}). Kiểm bằng trình duyệt: fetch một model từ R2_PUBLIC_URL ở trang localhost.`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- plan
const files = [];
for (const f of FOLDERS) {
  for (const abs of walk(path.join(ROOT, f.dir), f.ext)) {
    const rel = path.relative(path.join(ROOT, f.dir), abs).split(path.sep).join('/');
    if (!ROOMS && rel.startsWith('multiverse/rooms/')) continue;
    if (/^Meshy_AI_/.test(path.basename(rel))) continue;
    files.push({ prefix: f.prefix, key: `${f.prefix}/${rel}`, abs, size: fs.statSync(abs).size });
  }
}
console.log(`Thư viện: ${ROOT}`);
console.log(`Bucket: ${BUCKET} (khóa đọc từ .env.local, không in ra)${ROOMS ? '' : ' · bỏ qua multiverse/rooms/ (thêm --include-rooms để đẩy)'}`);
let remote = new Map();
try {
  for (const f of FOLDERS) for (const [k, v] of await listRemote(f.prefix)) remote.set(k, v);
} catch (e) {
  console.error(`Không đọc được bucket: ${e.message}`);
  process.exit(1);
}
const md5 = (abs) => crypto.createHash('md5').update(fs.readFileSync(abs)).digest('hex');
const todo = [];
let same = 0;
for (const f of files) {
  f.md5 = md5(f.abs);
  const r = remote.get(f.key);
  if (r && r.size === f.size && r.etag === f.md5) same++;
  else todo.push(f);
}
const mb = (n) => (n / 1e6).toFixed(1);
for (const p of FOLDERS) {
  const all = files.filter((f) => f.prefix === p.prefix);
  const up = todo.filter((f) => f.prefix === p.prefix);
  console.log(`  ${p.prefix.padEnd(5)} ${String(all.length).padStart(4)} file ${mb(all.reduce((a, f) => a + f.size, 0)).padStart(7)} MB · cần đẩy ${up.length} (${mb(up.reduce((a, f) => a + f.size, 0))} MB)`);
}
const extra = [...remote.keys()].filter((k) => !files.some((f) => f.key === k));
console.log(`Tổng: ${files.length} file, ${mb(files.reduce((a, f) => a + f.size, 0))} MB · đã có sẵn, giống hệt: ${same} · cần đẩy: ${todo.length} (${mb(todo.reduce((a, f) => a + f.size, 0))} MB)`);
if (extra.length) console.log(`Trên bucket có ${extra.length} file không còn trong thư viện (không xoá): ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '…' : ''}`);
const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
console.log(`Lớn nhất: ${largest.map((f) => `${f.key} ${mb(f.size)} MB`).join(' · ')}`);

const manifest = {
  generatedAt: new Date().toISOString(),
  bucket: BUCKET,
  cacheControl: CACHE,
  files: files.map((f) => ({ key: f.key, bytes: f.size, md5: f.md5 })),
};
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/r2-manifest.json', JSON.stringify(manifest, null, 1));
console.log('Manifest: out/r2-manifest.json');

if (!APPLY) {
  console.log('Chạy khô: chưa đẩy gì. Thêm --apply để đẩy thật.');
  process.exit(0);
}

// ---------------------------------------------------------------- upload
let done = 0;
let bytes = 0;
const failed = [];
const queue = [...todo];
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const body = fs.readFileSync(f.abs);
    try {
      await s3('PUT', f.key, { body, headers: { 'Content-Type': TYPES[path.extname(f.key)] ?? 'application/octet-stream', 'Cache-Control': CACHE } });
      done++;
      bytes += f.size;
      if (done % 25 === 0 || done === todo.length) console.log(`  đã đẩy ${done}/${todo.length} (${mb(bytes)} MB)`);
    } catch (e) {
      failed.push(`${f.key}: ${e.message}`);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
const mBody = Buffer.from(JSON.stringify(manifest));
await s3('PUT', 'manifest.json', { body: mBody, headers: { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-cache' } });
console.log(`XONG: đẩy ${done} file (${mb(bytes)} MB), lỗi ${failed.length}. manifest.json đã lên bucket.`);
for (const f of failed) console.log(`  ✗ ${f}`);
if (process.env.R2_PUBLIC_URL) console.log('Đặt NEXT_PUBLIC_ASSET_BASE_URL = giá trị R2_PUBLIC_URL (bỏ dấu / cuối). Link r2.dev bị giới hạn tốc độ: chỉ dùng thử, bản thật cần tên miền riêng.');
process.exit(failed.length ? 1 : 0);
