#!/usr/bin/env node
// Nhập tài nguyên 3D tải về vào thư viện (~/Documents/3D_tutorcraft), 27/10/2026.
//   node scripts/import-inbox.mjs            chạy khô: đọc inbox/, báo file nào nhận / từ chối và vì sao
//   node scripts/import-inbox.mjs --apply    nhập thật
//   thêm --replace để thay một model đã có cùng mã
//
// Cách dùng: thả file vào <thư viện>/inbox/ (.glb, .gltf, .fbx, .obj; ảnh .png/.jpg/.webp cho tex_* và
// water_*), rồi điền <thư viện>/inbox/credits.csv, mỗi dòng một file:
//   file,id,title,author,source,license
//   axe_lowpoly.glb,camp_axe,Low poly axe,Quaternius,https://quaternius.com/...,CC0
// (hoặc một file cạnh nó: axe_lowpoly.glb.json với { "id", "title", "author", "source", "license" }).
//
// Với mỗi file:
//  - thiếu giấy phép, hoặc giấy phép không cho dùng thương mại / không cho sửa (NC, ND) → KHÔNG nhập;
//  - fx_fire / fx_smoke / fx_spark → không nhập: các hiệu ứng này làm bằng hạt trong code (effects.ts);
//  - anim_* → lưu ở anim/<id>.glb, đối chiếu tên xương với khung xương các nhân vật hiện có, báo khớp
//    với nhân vật nào; không khớp nhân vật nào thì báo;
//  - model → đổi tên theo mã, đặt vào thư mục theo tiền tố (camp_ → camp/, fish_ → fishing/, …);
//    .fbx / .obj / .gltf được Blender đổi sang .glb; rồi tối ưu bản cao và bản thấp, nhân vật và
//    khủng long thêm bản vừa (~5 nghìn tam giác);
//  - ảnh tex_* / water_* → textures/<id>.<đuôi>;
//  - ghi tác giả, nguồn, giấy phép vào content/asset_credits.json; file đã nhập chuyển sang inbox/_da_nhap/.
// Cuối cùng chạy lại build-asset-catalog.mjs (catalog + coverage) và in số mã còn thiếu.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');
const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft/TutorCraft/01_assets_source').replace(/^~/, os.homedir()));
const INBOX = path.join(ROOT, 'inbox');
const DONE = path.join(INBOX, '_da_nhap');
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const PROCEDURAL = new Set(['fx_fire', 'fx_smoke', 'fx_spark']);
const FOLDER = { camp: 'camp', fish: 'fishing', food: 'food', kayak: 'kayak', river: 'river_world', surv: 'survival', dino: 'dino', mv: 'multiverse', char: 'characters', fx: 'fx', anim: 'anim' };
const MODEL_EXT = new Set(['.glb', '.gltf', '.fbx', '.obj']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const today = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(INBOX)) {
  fs.mkdirSync(INBOX, { recursive: true });
  fs.writeFileSync(path.join(INBOX, 'credits.csv'), 'file,id,title,author,source,license\n');
  console.log(`Đã tạo ${INBOX} và mẫu credits.csv. Thả file vào đó rồi chạy lại.`);
  process.exit(0);
}

/** License check: commercial use and modification must be allowed. */
function licenseProblem(lic) {
  const l = String(lic ?? '').trim();
  if (!l) return 'thiếu giấy phép';
  if (/\bNC\b|non-?commercial|phi thương mại/i.test(l)) return `giấy phép "${l}" không cho dùng thương mại`;
  if (/\bND\b|no-?deriv/i.test(l)) return `giấy phép "${l}" không cho sửa (tối ưu là sửa)`;
  if (/^(unknown|không rõ|\?)$/i.test(l)) return `giấy phép "${l}" chưa rõ`;
  return null;
}

/** credits.csv (simple CSV: commas, optional "quotes") + sidecar <file>.json. */
function readCredits() {
  const out = new Map();
  const csv = path.join(INBOX, 'credits.csv');
  if (fs.existsSync(csv)) {
    const lines = fs.readFileSync(csv, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    const cells = (l) => [...l.matchAll(/("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g)].map((m) => (m[2] !== undefined ? m[2].replace(/""/g, '"') : m[1]).trim()).slice(0, -1);
    const head = cells(lines[0] ?? '').map((h) => h.toLowerCase());
    for (const l of lines.slice(1)) {
      const c = cells(l);
      const row = Object.fromEntries(head.map((h, i) => [h, c[i] ?? '']));
      if (row.file) out.set(row.file, row);
    }
  }
  for (const f of fs.readdirSync(INBOX)) {
    if (!f.endsWith('.json') || f === 'credits.json') continue;
    try {
      out.set(f.replace(/\.json$/, ''), { file: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(INBOX, f), 'utf8')) });
    } catch {
      /* reported below as missing credits */
    }
  }
  return out;
}

/** Bone names of every rigged character in the library: id → Set(names). */
async function characterRigs() {
  const rigs = new Map();
  const dir = path.join(ROOT, '_optimized', 'characters');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.glb') ? [path.join(d, e.name)] : []));
  if (!fs.existsSync(dir)) return rigs;
  for (const f of walk(dir)) {
    const g = glbJson(f);
    const skin = g?.skins?.[0];
    if (skin) rigs.set(path.basename(f, '.glb'), new Set(skin.joints.map((j) => clean(g.nodes[j].name))));
  }
  return rigs;
}
const clean = (n) => String(n ?? '').replace(/^mixamorig[:_]?/i, '').replace(/[:.\s]/g, '');
function glbJson(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) return null;
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

function toGlb(src, dst) {
  const ext = path.extname(src).toLowerCase();
  if (ext === '.glb') return fs.copyFileSync(src, dst);
  const imp = { '.fbx': 'bpy.ops.import_scene.fbx(filepath=src)', '.obj': 'bpy.ops.wm.obj_import(filepath=src)', '.gltf': 'bpy.ops.import_scene.gltf(filepath=src)' }[ext];
  const py = `import bpy,sys\nsrc,dst=sys.argv[-2],sys.argv[-1]\nbpy.ops.wm.read_factory_settings(use_empty=True)\n${imp}\nbpy.ops.export_scene.gltf(filepath=dst, export_format='GLB')\n`;
  execFileSync(BLENDER, ['--background', '--python-expr', py, '--', src, dst], { stdio: 'pipe' });
  if (!fs.existsSync(dst)) throw new Error('Blender không xuất được GLB');
}

const credits = readCredits();
const files = fs.readdirSync(INBOX).filter((f) => !f.startsWith('.') && !f.startsWith('_') && (MODEL_EXT.has(path.extname(f).toLowerCase()) || IMAGE_EXT.has(path.extname(f).toLowerCase())));
const catalog = JSON.parse(fs.readFileSync('content/asset_catalog.json', 'utf8'));
const known = new Set(catalog.map((c) => c.id));
const scenarioIds = new Set(JSON.parse(fs.readFileSync('content/scenarios_v2.json', 'utf8')).flatMap((s) => s.asset_ids ?? []));
const rigs = await characterRigs();
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const plan = [];
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  const c = credits.get(f) ?? {};
  const id = (c.id || path.basename(f, path.extname(f))).trim();
  const row = { f, ext, id, credit: c, problems: [], notes: [] };
  plan.push(row);
  if (!/^[a-z0-9_]+$/.test(id)) row.problems.push(`mã "${id}" không hợp lệ (chỉ a-z, 0-9, _): điền cột id trong credits.csv`);
  if (PROCEDURAL.has(id)) row.problems.push('hiệu ứng này làm bằng hạt trong code, không nhập file');
  const lp = licenseProblem(c.license);
  if (lp) row.problems.push(lp);
  if (!c.author && !/^cc0|public domain/i.test(String(c.license ?? ''))) row.problems.push('thiếu tác giả (giấy phép CC BY bắt buộc ghi tác giả)');
  if (!c.source) row.problems.push('thiếu nguồn (đường link tải)');
  if (known.has(id) && !REPLACE) row.problems.push(`mã ${id} đã có trong thư viện (thêm --replace để thay)`);
  if (!scenarioIds.has(id) && !known.has(id)) row.notes.push('mã chưa kịch bản nào gọi');
  const isImage = IMAGE_EXT.has(ext);
  if (isImage && !/^(tex|water)_/.test(id)) row.problems.push('ảnh chỉ nhận cho mã tex_* / water_*');
  if (!isImage && /^(tex|water)_/.test(id)) row.problems.push('mã tex_* / water_* cần file ảnh, không phải model');
  const prefix = id.split('_')[0];
  row.folder = isImage ? 'textures' : FOLDER[prefix] ?? 'misc';
  row.target = path.join(ROOT, row.folder, `${id}${isImage ? ext : '.glb'}`);
  row.rel = path.relative(ROOT, row.target).split(path.sep).join('/');
}

// Size and raw triangle count. optimize-glb.mjs decimates on import, but a model far over these
// numbers usually needs a by-hand pass (C2, 01/11) before it still looks right.
const HEAVY_MB = 25;
const HEAVY_TRIS = 300000;
/** Triangles drawn by a GLB, read from the JSON chunk only (instanced meshes counted per node). */
function glbTris(file) {
  const g = glbJson(file);
  if (!g?.meshes) return null;
  const uses = new Map();
  for (const n of g.nodes ?? []) if (n.mesh !== undefined) uses.set(n.mesh, (uses.get(n.mesh) ?? 0) + 1);
  let tris = 0;
  g.meshes.forEach((m, mi) => {
    for (const p of m.primitives ?? []) {
      if ((p.mode ?? 4) !== 4) continue;
      const count = g.accessors?.[p.indices ?? p.attributes?.POSITION]?.count ?? 0;
      tris += Math.floor(count / 3) * (uses.get(mi) ?? 1);
    }
  });
  return tris;
}
const byHash = new Map();
for (const row of plan) {
  const file = path.join(INBOX, row.f);
  row.mb = fs.statSync(file).size / 1e6;
  if (row.ext === '.glb') row.tris = glbTris(file);
  if (row.mb > HEAVY_MB || row.tris > HEAVY_TRIS) row.notes.push(`nặng (${row.mb.toFixed(1)} MB${row.tris ? `, ${row.tris.toLocaleString('vi-VN')} mặt` : ''}): cần giảm nặng và xem lại hình sau khi tối ưu (C2)`);
  const h = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  if (byHash.has(h)) row.problems.push(`trùng nội dung với ${byHash.get(h)}`);
  else byHash.set(h, row.f);
}

// Animations: check bones against the character rigs (needs a GLB; others are converted first).
for (const row of plan.filter((r) => r.id.startsWith('anim_') && !r.problems.length)) {
  let file = path.join(INBOX, row.f);
  if (row.ext !== '.glb') {
    const tmp = path.join(os.tmpdir(), `tc-anim-${process.pid}-${row.id}.glb`);
    try {
      toGlb(file, tmp);
      file = tmp;
    } catch (e) {
      row.problems.push(`không đổi được sang GLB: ${e.message}`);
      continue;
    }
  }
  const doc = await io.read(file);
  const anims = doc.getRoot().listAnimations();
  if (!anims.length) {
    row.problems.push('file không có đoạn hoạt ảnh nào');
    continue;
  }
  const bones = new Set(anims.flatMap((a) => a.listChannels().map((ch) => clean(ch.getTargetNode()?.getName()))).filter(Boolean));
  // Fit = share of the character's real bones the clip drives. Mixamo clips also carry finger bones the
  // Meshy rigs lack (65 vs ~24), and leaf helpers (*_End, headfront) are never animated, so neither counts.
  const helper = (b) => /_end$|^headfront$/i.test(b);
  const fits = [...rigs]
    .map(([rid, names]) => {
      const real = [...names].filter((b) => !helper(b));
      return [rid, real.filter((b) => bones.has(b)).length / Math.max(1, real.length)];
    })
    .sort((a, b) => b[1] - a[1]);
  row.anim = { clips: anims.map((a) => a.getName()), bones: bones.size, fits: fits.filter(([, k]) => k >= 0.9).map(([rid]) => rid) };
  if (!row.anim.fits.length) row.problems.push(`xương không khớp nhân vật nào (gần nhất: ${fits.slice(0, 2).map(([rid, k]) => `${rid} ${Math.round(k * 100)}%`).join(', ') || 'không có'})`);
}

const ok = plan.filter((r) => !r.problems.length);
console.log(`inbox: ${files.length} file · nhận ${ok.length} · từ chối ${plan.length - ok.length}`);
for (const r of plan) {
  const size = `${r.mb.toFixed(1)} MB${r.tris ? `, ${r.tris.toLocaleString('vi-VN')} mặt` : ''}`;
  const head = `${r.problems.length ? '✗' : '✓'} ${r.f} → ${r.rel} (${size})`;
  console.log(`${head}${r.anim ? ` · ${r.anim.clips.length} đoạn, khớp: ${r.anim.fits.join(', ') || '—'}` : ''}`);
  for (const p of r.problems) console.log(`    ✗ ${p}`);
  for (const n of r.notes) console.log(`    · ${n}`);
}
if (!APPLY) {
  console.log('Chạy khô: chưa nhập gì. Thêm --apply để nhập.');
  process.exit(0);
}

// ---------------------------------------------------------------- apply
const creditFile = 'content/asset_credits.json';
const allCredits = JSON.parse(fs.readFileSync(creditFile, 'utf8'));
fs.mkdirSync(DONE, { recursive: true });
const optimize = (rel, outDir, extra = []) =>
  execFileSync(process.execPath, ['--max-old-space-size=12288', 'scripts/optimize-glb.mjs', ROOT, path.join(ROOT, outDir), '--files', rel, '--force', ...extra], { stdio: 'pipe' }).toString();
for (const r of ok) {
  try {
    fs.mkdirSync(path.dirname(r.target), { recursive: true });
    if (IMAGE_EXT.has(r.ext)) fs.copyFileSync(path.join(INBOX, r.f), r.target);
    else {
      toGlb(path.join(INBOX, r.f), r.target);
      if (!r.id.startsWith('anim_')) {
        optimize(r.rel, '_optimized');
        optimize(r.rel, '_low', ['--low']);
        if (/^(characters|dino)\//.test(r.rel)) optimize(r.rel, '_mid', ['--low', '--tris', '10000']);
      }
    }
    allCredits[r.id] = {
      file: r.rel,
      title: r.credit.title || r.id,
      source: r.credit.source,
      authors: String(r.credit.author || '').split(/\s*;\s*|\s*,\s*/).filter(Boolean),
      license: r.credit.license,
      downloaded: today,
    };
    fs.renameSync(path.join(INBOX, r.f), path.join(DONE, r.f));
    console.log(`  ✓ đã nhập ${r.id}`);
  } catch (e) {
    console.log(`  ✗ ${r.id}: ${e.message.split('\n')[0]}`);
  }
}
fs.writeFileSync(creditFile, `${JSON.stringify(allCredits, null, 1)}\n`);
// The rename log tells build-asset-catalog.mjs where a model came from.
const logFile = path.join(ROOT, '_report', 'doi_ten.json');
let log = [];
try {
  log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
} catch {
  /* first import */
}
for (const r of ok.filter((x) => allCredits[x.id]?.downloaded === today)) {
  if (!log.some((e) => e.new === r.rel)) log.push({ old: r.f, new: r.rel, conf: 'cao', note: `nhập từ inbox ${today}: ${r.credit.title || r.id} (${r.credit.license})`, mb: +(fs.statSync(r.target).size / 1e6).toFixed(1) });
}
fs.mkdirSync(path.dirname(logFile), { recursive: true });
fs.writeFileSync(logFile, JSON.stringify(log, null, 1));
console.log(execFileSync(process.execPath, ['scripts/build-asset-catalog.mjs'], { stdio: 'pipe' }).toString().split('\n').slice(0, 2).join('\n'));
