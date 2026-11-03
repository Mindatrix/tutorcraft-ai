#!/usr/bin/env node
// A3.1 — Danh mục model 3D. Đây là script DUY NHẤT ghi content/asset_catalog.json và content/asset_coverage.json
// (bản Python cũ đã bỏ ngày 27/10/2026; định dạng giữ nguyên, có thêm trường).
//   node scripts/build-asset-catalog.mjs            (thư viện mặc định: ~/Documents/3D_tutorcraft/TutorCraft/01_assets_source)
//   TC_3D_DIR=/đường/dẫn node scripts/build-asset-catalog.mjs
// Ghi:
//   content/asset_catalog.json  — mỗi .glb: id, file, game, scope, source, games (kịch bản nào dùng),
//                                 tris_raw/tris_web/tris_low, mb_raw/mb_web/mb_low, textures,
//                                 tris_fill/tris_fill_low (bản cây rải ≤ 8 / 3 nghìn mặt, chỉ model làm cảnh rải)
//   content/asset_coverage.json — id kịch bản gọi nhưng CHƯA có file, và model chưa kịch bản nào dùng
// Chỉ đọc phần JSON đầu mỗi file GLB (không nạp hình học), nên chạy nhanh kể cả file vài trăm MB.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft/TutorCraft/01_assets_source').replace(/^~/, os.homedir()));
const OPT = path.join(ROOT, '_optimized');
const LOW = path.join(ROOT, '_low');
const FILL = path.join(ROOT, '_fill');
const FILL_LOW = path.join(ROOT, '_fill_low');
const GAME = { camp: 'summer_camp', fishing: 'river_fishing', survival: 'river_survival', multiverse: 'multiverse_portal', dino: 'dino_journey', kayak: 'kayak_rush' };

if (!fs.existsSync(ROOT)) {
  console.error(`Không thấy thư viện model: ${ROOT} (đặt TC_3D_DIR)`);
  process.exit(1);
}

/** Read only the GLB JSON chunk: meshes, accessors, images. */
export function glbInfo(file) {
  if (!fs.existsSync(file)) return null;
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(20);
    fs.readSync(fd, head, 0, 20, 0);
    if (head.readUInt32LE(0) !== 0x46546c67) return null; // 'glTF'
    const jsonLen = head.readUInt32LE(12);
    if (head.readUInt32LE(16) !== 0x4e4f534a) return null; // 'JSON'
    const buf = Buffer.alloc(jsonLen);
    fs.readSync(fd, buf, 0, jsonLen, 20);
    const g = JSON.parse(buf.toString('utf8'));
    let tris = 0;
    for (const m of g.meshes ?? []) {
      for (const p of m.primitives ?? []) {
        if (p.mode !== undefined && p.mode !== 4) continue;
        const acc = g.accessors?.[p.indices ?? p.attributes?.POSITION];
        tris += Math.round((acc?.count ?? 0) / 3);
      }
    }
    const imgBytes = (g.images ?? []).reduce((n, im) => n + (g.bufferViews?.[im.bufferView]?.byteLength ?? 0), 0);
    return {
      tris,
      textures: (g.images ?? []).length,
      materials: (g.materials ?? []).length,
      animations: (g.animations ?? []).length,
      skins: (g.skins ?? []).length,
      mbTextures: +(imgBytes / 1e6).toFixed(2),
      ext: g.extensionsUsed ?? [],
    };
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

/** Every .glb under the category folders. Loose files at the library root, and raw downloads still
 *  named "Meshy_AI_…", are not sorted yet (no id, not optimized): listed separately, never catalogued. */
const loose = [];
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.') || (dir === ROOT && e.name === 'inbox')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith('.glb')) (dir === ROOT || /^Meshy_AI_/.test(e.name) ? loose : out).push(p);
  }
  return out;
}

const mb = (f) => (fs.existsSync(f) ? +(fs.statSync(f).size / 1e6).toFixed(2) : null);
const readJson = (f, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return fallback;
  }
};

// Where each model came from: the rename log keeps the original (Meshy / downloaded) file name.
const renames = readJson(path.join(ROOT, '_report', 'doi_ten.json'), []);
const origin = new Map(renames.map((r) => [r.new, r.old]));
const credits = { ...readJson('content/asset_credits.json', {}) };
for (const c of readJson('src/config/modelCredits.json', [])) if (c?.file) credits[path.basename(c.file, '.glb')] = c;
function sourceOf(rel, id) {
  const old = origin.get(rel) ?? '';
  if (/^Meshy_AI/i.test(old) || /meshy/i.test(rel)) return 'meshy';
  if (credits[id] || old) return 'download';
  return 'self';
}

const scenarios = readJson('content/scenarios_v2.json', []);
const aliases = Object.fromEntries(Object.entries(readJson('content/asset_aliases.json', {})).filter(([k]) => !k.startsWith('_')));
const stem = (i) => i.replace(/(__alt\d+|_\d+)$/, '');
const usedBy = new Map(); // scenario asset id → set of games
for (const s of scenarios) for (const a of s.asset_ids ?? []) (usedBy.get(a) ?? usedBy.set(a, new Set()).get(a)).add(s.game);
// Multiverse rooms (D6) are used through content/multiverse_rooms.json: room "r_bedroom" covers
// the library files r_bedroom, r_bedroom_a, r_bedroom_b…
const roomIds = (readJson('content/multiverse_rooms.json', {}).rooms ?? []).map((r) => r.id).filter(Boolean);

const catalog = [];
for (const f of walk(ROOT).sort()) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  const id = path.basename(f, '.glb');
  const top = rel.split('/')[0];
  const raw = glbInfo(f);
  const web = glbInfo(path.join(OPT, rel));
  const low = glbInfo(path.join(LOW, rel));
  const fill = glbInfo(path.join(FILL, rel));
  const fillLow = glbInfo(path.join(FILL_LOW, rel));
  const games = new Set();
  for (const [a, gs] of usedBy) {
    const target = aliases[a]?.to;
    if (a === id || stem(a) === id || a === stem(id) || target === id || (target && stem(id) === target)) gs.forEach((g) => games.add(g));
  }
  if (roomIds.some((r) => id === r || id.startsWith(`${r}_`))) games.add('multiverse_portal');
  catalog.push({
    id,
    file: rel,
    mb_raw: mb(f),
    mb_web: mb(path.join(OPT, rel)),
    mb_low: mb(path.join(LOW, rel)),
    scope: top in GAME ? 'game' : 'shared',
    game: GAME[top] ?? null,
    games: [...games].sort(),
    source: sourceOf(rel, id),
    tris_raw: raw?.tris ?? null,
    tris_web: web?.tris ?? null,
    tris_low: low?.tris ?? null,
    ...(fill ? { tris_fill: fill.tris, mb_fill: mb(path.join(FILL, rel)) } : {}),
    ...(fillLow ? { tris_fill_low: fillLow.tris, mb_fill_low: mb(path.join(FILL_LOW, rel)) } : {}),
    textures: (web ?? raw)?.textures ?? 0,
    animations: raw?.animations ?? 0,
    skinned: (raw?.skins ?? 0) > 0,
  });
}
// Guard (27/10 incident): an output that exists but is not a binary GLB (e.g. glTF JSON saved
// under a .glb name) must stop the build instead of producing a catalog of empty models.
const broken = catalog.flatMap((c) => [
  ...(c.mb_web != null && !c.tris_web ? [`_optimized/${c.file}`] : []),
  ...(c.mb_low != null && !c.tris_low ? [`_low/${c.file}`] : []),
]);
if (broken.length) {
  console.error(`✗ ${broken.length} tệp đầu ra không phải GLB hợp lệ (không đọc được hình học), ví dụ: ${broken.slice(0, 5).join(', ')}`);
  console.error('  Chạy lại scripts/optimize-glb.mjs --force cho các tệp này. Danh mục KHÔNG được ghi.');
  process.exit(1);
}
fs.writeFileSync('content/asset_catalog.json', `${JSON.stringify(catalog, null, 1)}\n`);

// Coverage: ids the scenarios ask for without a file, and files no scenario uses.
const files = new Set(catalog.map((c) => c.id));
const stems = new Set(catalog.map((c) => stem(c.id)));
// Images (tex_*, water_*) live in <library>/textures/<id>.<ext>; fx_fire / fx_smoke / fx_spark are particles in code.
const TEX = path.join(ROOT, 'textures');
const images = new Set(fs.existsSync(TEX) ? fs.readdirSync(TEX).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, '')) : []);
const PROCEDURAL_IDS = new Set(['fx_fire', 'fx_smoke', 'fx_spark']);
const resolved = (a) =>
  files.has(a) || files.has(stem(a)) || stems.has(a) || images.has(a) || PROCEDURAL_IDS.has(a) || (aliases[a] && ('file' in aliases[a] || files.has(aliases[a].to)));
const missing = [...usedBy.keys()].filter((a) => !resolved(a)).sort();
const groups = {};
for (const a of missing) (groups[a.match(/^[a-z]+/)?.[0] ?? 'other'] ??= []).push(a);
const unused = catalog.filter((c) => !c.games.length).map((c) => c.id);
fs.writeFileSync('content/asset_coverage.json', `${JSON.stringify({ total_used: usedBy.size, have_file: usedBy.size - missing.length, missing_count: missing.length, missing_by_group: groups, unused_models: unused }, null, 1)}\n`);

const bySource = catalog.reduce((m, c) => ((m[c.source] = (m[c.source] ?? 0) + 1), m), {});
const over = catalog.filter((c) => (c.mb_web ?? c.mb_raw) > 8).map((c) => `${c.id} ${c.mb_web ?? c.mb_raw}MB`);
console.log(`${catalog.length} model (${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(', ')}) · chưa tối ưu: ${catalog.filter((c) => c.mb_web == null).length} · có bản thấp: ${catalog.filter((c) => c.mb_low != null).length}`);
console.log(`kịch bản gọi ${usedBy.size} id · THIẾU file ${missing.length} · model chưa kịch bản nào dùng: ${unused.length ? unused.join(', ') : 'không'}`);
if (over.length) console.log(`trên 8 MB (bản web): ${over.join(' · ')}`);
if (loose.length) console.log(`bỏ qua ${loose.length} file chưa đặt tên (gốc thư viện hoặc Meshy_AI_…): ${loose.map((f) => path.relative(ROOT, f)).join(', ')}`);
