#!/usr/bin/env node
// Nén âm thanh cho web (WP2, 01/11/2026): <thư viện>/audio/{music,sfx,ambient} → <thư viện>/_audio_web/…mp3
//   node scripts/encode-audio.mjs            nén file mới hoặc đã đổi, ghi catalog + credits
//   node scripts/encode-audio.mjs --force    nén lại tất cả
//
// - MP3 cho mọi file: Safari trên iPhone cũ không giải mã OGG. Nhạc 112 kbps stereo; hiệu ứng và âm
//   nền 64 kbps mono. Máy không có ffmpeg: Blender (có sẵn ffmpeg bên trong) làm việc nén.
// - Giấy phép đọc từ audio/AUDIO_MANIFEST.csv (dòng sau ghi đè dòng trước khi cùng khớp một file).
//   Chỉ nhận CC0 / public domain. File chưa rõ giấy phép (wind_snow) hoặc không có dòng → không nén, báo.
//   "xem CREDITS.TXT mục X.zip" → tra tác giả trong audio/_nguon_cc0/CREDITS_OpenGameArt.TXT.
//   Không bao giờ lấy gì trong audio/_nguon_cc0/ (bản gốc, có cả CC-BY chưa dùng).
// - Ghi content/audio_catalog.json (file sinh bằng script: mã, đường dẫn, thời lượng, KB, giấy phép) và
//   thêm audio_<mã> vào content/asset_credits.json (trang /credits đọc catalog).
// Web phục vụ ở <NEXT_PUBLIC_ASSET_BASE_URL>/audio/<file> (dev: app/dev-assets, R2: sync-assets-r2.mjs).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FORCE = process.argv.includes('--force');
const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft/TutorCraft/01_assets_source').replace(/^~/, os.homedir()));
const SRC = path.join(ROOT, 'audio');
const OUT = path.join(ROOT, '_audio_web');
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const EXT = new Set(['.ogg', '.wav', '.mp3', '.flac']);
const KINDS = { music: { kbps: 112, mono: false }, sfx: { kbps: 64, mono: true }, ambient: { kbps: 64, mono: true } };

// ---------------------------------------------------------------- licences
const cells = (l) => [...l.matchAll(/("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g)].map((m) => (m[2] !== undefined ? m[2].replace(/""/g, '"') : m[1]).trim()).slice(0, -1);
const manifest = fs.readFileSync(path.join(SRC, 'AUDIO_MANIFEST.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
const head = cells(manifest[0]);
const rows = manifest.slice(1).map((l) => Object.fromEntries(cells(l).map((v, i) => [head[i], v])));

/** "sfx/splash_1-6.ogg", "sfx/step_*.ogg (9 file)", "ambient/a.ogg, b.ogg" → regexes on the audio-relative path. */
function patterns(row) {
  const items = row.file.replace(/\([^)]*\)/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  // Music rows name the file only; its folder is in thu_muc.
  let dir = /^music\//.test(row.thu_muc) ? row.thu_muc : '';
  return items.map((it) => {
    if (it.includes('/')) dir = path.posix.dirname(it);
    const file = path.posix.join(dir, path.posix.basename(it));
    const esc = file.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const re = esc.replace(/\*/g, '[^/]*').replace(/(\d+)-(\d+)(?=\\\.)/g, (_, a, b) => {
      const w = a.length;
      const nums = [];
      for (let n = +a; n <= +b; n++) nums.push(String(n).padStart(w, '0'));
      return `(?:${nums.join('|')})`;
    });
    return new RegExp(`^${re}$`, 'i');
  });
}
const rules = rows.map((r) => ({ row: r, res: patterns(r) }));

/** OpenGameArt credits file: block with "File(s): * X.zip" → { author, url, title }. */
function ogaBlocks() {
  const f = path.join(SRC, '_nguon_cc0', 'CREDITS_OpenGameArt.TXT');
  if (!fs.existsSync(f)) return [];
  return fs
    .readFileSync(f, 'utf8')
    .replace(/\r\n?/g, '\n') // the file has Windows line ends: without this it reads as one block
    .split(/\n-{10,}\n/)
    .map((b) => {
      const field = (k) => (b.match(new RegExp(`${k}:\\s*\\n\\s*(.+)`)) ?? [])[1]?.trim();
      return { title: field('Title'), author: field('Author'), url: field('URL'), files: [...b.matchAll(/\*\s+(\S.*)/g)].map((m) => m[1].trim()) };
    });
}
const oga = ogaBlocks();

const okLicense = (l) => /^(cc0|public domain)/i.test(l) && !/chờ|chưa rõ|trống/i.test(l);
function creditFor(rel) {
  let row = null;
  for (const r of rules) if (r.res.some((re) => re.test(rel))) row = r.row;
  if (!row) return { problem: 'không có dòng trong AUDIO_MANIFEST.csv' };
  const lic = row.giay_phep;
  if (!okLicense(lic) || /CHỜ/i.test(row.ghi_chu)) return { problem: `giấy phép chưa dùng được: "${lic}" (${row.ghi_chu})` };
  let author = row.tac_gia;
  let source = row.trang_goc;
  const zip = /mục\s+(\S+\.zip)/i.exec(source)?.[1];
  if (zip) {
    // Several packs ship a "sfx.zip": the exact spelling first ("SFX.zip" = Random SFX, Écrivain).
    const b = oga.find((x) => x.files.includes(zip)) ?? oga.find((x) => x.files.some((f) => f.toLowerCase() === zip.toLowerCase()));
    if (b) {
      author = b.author ?? author;
      source = b.url ?? source;
    }
  }
  const notes = [];
  if (!author || /chưa ghi|không ghi/i.test(author)) notes.push('thiếu tác giả');
  if (!/^https?:\/\//.test(source)) notes.push('thiếu trang gốc');
  return { author: author || '', source: /^https?:\/\//.test(source) ? source : '', license: lic, ai: /\bAI\b|tổng hợp/i.test(lic), notes, use: row.dung_cho };
}

// ---------------------------------------------------------------- files
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name.startsWith('_') || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : EXT.has(path.extname(e.name).toLowerCase()) ? [path.join(d, e.name)] : [])) : []);
const files = Object.keys(KINDS).flatMap((k) => walk(path.join(SRC, k)));
const plan = [];
const refused = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join('/');
  const kind = rel.split('/')[0];
  const c = creditFor(rel);
  if (c.problem) {
    refused.push(`${rel}: ${c.problem}`);
    continue;
  }
  const outRel = rel.replace(/\.[^.]+$/, '.mp3');
  const id = path.posix.basename(rel).replace(/\.[^.]+$/, '');
  const dst = path.join(OUT, outRel);
  const stale = FORCE || !fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(f).mtimeMs;
  plan.push({ id, kind, rel, outRel, src: f, dst, stale, credit: c, place: kind === 'music' ? rel.split('/')[1] : undefined, ...KINDS[kind] });
}
const dup = plan.map((p) => p.id).filter((id, i, a) => a.indexOf(id) !== i);
if (dup.length) {
  console.error(`✗ trùng mã: ${[...new Set(dup)].join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------- encode (one Blender run)
const todo = plan.filter((p) => p.stale);
const durations = {};
if (todo.length) {
  const jobFile = path.join(os.tmpdir(), `tc-audio-${process.pid}.json`);
  const resFile = `${jobFile}.out`;
  fs.writeFileSync(jobFile, JSON.stringify(todo.map((p) => ({ src: p.src, dst: p.dst, kbps: p.kbps, mono: p.mono }))));
  const py = `
import bpy, json, os, sys
jobs = json.load(open(sys.argv[-2]))
sc = bpy.context.scene
sc.render.fps = 100
sc.render.fps_base = 1
ed = sc.sequence_editor_create()
coll = ed.strips if hasattr(ed, 'strips') else ed.sequences
out = {}
for j in jobs:
    for s in list(coll):
        coll.remove(s)
    s = coll.new_sound('a', j['src'], 1, 1)
    sc.frame_start = 1
    sc.frame_end = s.frame_final_end - 1
    sc.render.ffmpeg.audio_channels = 'MONO' if j['mono'] else 'STEREO'
    os.makedirs(os.path.dirname(j['dst']), exist_ok=True)
    tmp = j['dst'] + '.tmp.mp3'
    bpy.ops.sound.mixdown(filepath=tmp, container='MP3', codec='MP3', bitrate=j['kbps'], format='S16', mixrate=44100, accuracy=1024)
    os.replace(tmp, j['dst'])
    out[j['dst']] = s.frame_final_duration / 100.0
json.dump(out, open(sys.argv[-1], 'w'))
`;
  console.log(`Nén ${todo.length} file bằng Blender…`);
  execFileSync(BLENDER, ['--background', '--factory-startup', '--python-expr', py, '--', jobFile, resFile], { stdio: 'pipe' });
  Object.assign(durations, JSON.parse(fs.readFileSync(resFile, 'utf8')));
  fs.rmSync(jobFile, { force: true });
  fs.rmSync(resFile, { force: true });
}

// ---------------------------------------------------------------- catalog + credits
const catFile = 'content/audio_catalog.json';
const old = new Map((fs.existsSync(catFile) ? JSON.parse(fs.readFileSync(catFile, 'utf8')) : []).map((e) => [e.id, e]));
const catalog = plan
  .map((p) => {
    const sec = durations[p.dst] ?? old.get(p.id)?.sec ?? null;
    const kb = fs.existsSync(p.dst) ? Math.round(fs.statSync(p.dst).size / 1024) : null;
    return { id: p.id, kind: p.kind, ...(p.place ? { place: p.place } : {}), file: p.outRel, sec: sec === null ? null : +sec.toFixed(2), kb, author: p.credit.author, license: p.credit.license, source: p.credit.source, ...(p.credit.ai ? { ai: true } : {}) };
  })
  .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
fs.writeFileSync(catFile, `${JSON.stringify(catalog, null, 1)}\n`);

const credFile = 'content/asset_credits.json';
const credits = JSON.parse(fs.readFileSync(credFile, 'utf8'));
for (const k of Object.keys(credits)) if (k.startsWith('audio_')) delete credits[k];
for (const e of catalog)
  credits[`audio_${e.id}`] = {
    file: `audio/${e.file}`,
    title: e.id,
    source: e.source,
    authors: e.author ? e.author.split(/\s*;\s*/).filter(Boolean) : [],
    license: e.license,
    ...(e.ai ? { note: 'Âm thanh do AI/tổng hợp tạo, nhà cung cấp công bố CC0' } : {}),
  };
fs.writeFileSync(credFile, `${JSON.stringify(credits, null, 1)}\n`);

// ---------------------------------------------------------------- report
const sum = (k) => catalog.filter((e) => e.kind === k);
const mb = (l) => (l.reduce((a, e) => a + (e.kb ?? 0), 0) / 1024).toFixed(1);
const rawMb = (k) => (plan.filter((p) => p.kind === k).reduce((a, p) => a + fs.statSync(p.src).size, 0) / 1e6).toFixed(1);
for (const k of Object.keys(KINDS)) console.log(`${k}: ${sum(k).length} file · gốc ${rawMb(k)} MB → web ${mb(sum(k))} MB`);
console.log(`đã nén lần này: ${todo.length} · catalog: ${catFile} · credits: ${catalog.length} dòng audio_*`);
for (const r of refused) console.log(`  ✗ không dùng ${r}`);
for (const p of plan) if (p.credit.notes.length) console.log(`  · ${p.rel}: ${p.credit.notes.join(', ')} (bổ sung trong AUDIO_MANIFEST.csv)`);
