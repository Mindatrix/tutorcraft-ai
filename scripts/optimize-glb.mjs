#!/usr/bin/env node
// Tối ưu GLB cho web (A3.4 / A3.5): giảm số mặt, thu nhỏ ảnh (WebP), lượng tử hoá, nén Meshopt.
// Không sửa file gốc.
//   node --max-old-space-size=8192 scripts/optimize-glb.mjs <nguồn> <đích> [--only chuỗi] [--force] [--low]
// Thường dùng:
//   bản cao : node … optimize-glb.mjs ~/Documents/3D_tutorcraft ~/Documents/3D_tutorcraft/_optimized
//   bản thấp: node … optimize-glb.mjs ~/Documents/3D_tutorcraft ~/Documents/3D_tutorcraft/_low --low
// --low = nửa số mặt, ảnh tối đa 512 px (máy yếu). Trần dung lượng: 8 MB mỗi file, đồ nhỏ 1 MB
// (bản thấp: 3 MB / 0,5 MB); vượt trần thì làm lại chặt hơn (tối đa 3 lượt).
// Model quét (Meshy) có nhiều đường nối UV làm bộ giản lược thường "kẹt": lượt 2 dùng chế độ
// Permissive (cho gộp qua đường nối), lượt 3 dùng Sloppy (chỉ theo vị trí) nếu vẫn quá nặng.
// Ghi an toàn: GLB dựng trong bộ nhớ, ghi ra tệp tạm cạnh tệp đích, kiểm đầu tệp glTF (magic, phiên bản 2,
// độ dài, khối JSON) rồi mới đổi tên đè lên. Lỗi giữa chừng thì tệp cũ còn nguyên.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, meshopt, prune, quantize, simplify, textureCompress, weld, weldPrimitive } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, dst, ...rest] = process.argv.slice(2);
if (!src || !dst) {
  console.error('Dùng: node scripts/optimize-glb.mjs <thư mục nguồn> <thư mục đích> [--only chuỗi] [--force] [--low]');
  process.exit(1);
}
const FORCE = rest.includes('--force');
// --over: (re)do only files whose output is missing, over the size cap or far over the triangle budget.
const OVER = rest.includes('--over');
const LOW = rest.includes('--low');
const oi = rest.indexOf('--only');
const ONLY = oi >= 0 ? rest[oi + 1] : null;
// --files a.glb,b.glb : exactly these library paths (relative to <nguồn>), e.g. after a visual review.
const fi = rest.indexOf('--files');
const FILES = fi >= 0 ? new Set(rest[fi + 1].split(',').map((x) => x.trim()).filter(Boolean)) : null;
const ti = rest.indexOf('--tris');
const TRIS = ti >= 0 ? Number(rest[ti + 1]) : null; // override the triangle budget (tests / single files)
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

/**
 * Why a buffer is not a valid GLB 2.0 file, or null when it is: "glTF" magic, version 2, header length
 * equal to the byte count, first chunk JSON. (27/10: a write through io.write() to a non-.glb name
 * produced .gltf JSON + side files and broke the whole library, so outputs are checked before use.)
 */
export function glbProblem(buf) {
  if (buf.byteLength < 20) return `quá ngắn (${buf.byteLength} byte)`;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (v.getUint32(0, true) !== 0x46546c67) return 'đầu tệp không phải "glTF"';
  if (v.getUint32(4, true) !== 2) return `phiên bản glTF ${v.getUint32(4, true)}, cần 2`;
  if (v.getUint32(8, true) !== buf.byteLength) return `độ dài ghi trong đầu tệp ${v.getUint32(8, true)} ≠ ${buf.byteLength} byte`;
  if (v.getUint32(16, true) !== 0x4e4f534a) return 'khối đầu tiên không phải JSON';
  return null;
}

/** Write next to the target, check the header, then rename over it: the old file stays until the new one is good. */
function writeGlbAtomic(out, glb) {
  const bad = glbProblem(glb);
  if (bad) throw new Error(`GLB tạo ra không hợp lệ: ${bad}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, glb);
    const back = glbProblem(fs.readFileSync(tmp));
    if (back) throw new Error(`tệp tạm ghi ra không hợp lệ: ${back}`);
    fs.renameSync(tmp, out);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.glb')) out.push(p);
  }
  return out;
}

/**
 * Per-file budgets decided by looking at the renders (scripts/validate-glb.py --thumbs), 27/10/2026:
 * at the class default these lost visible detail (canopy shading, grass tufts, streaks on soil).
 */
const OVERRIDES = {
  'river_world/cay_phu/tree_x02.glb': { tris: 300000, low: 60000, capMb: 8 },
  'river_world/ground/ground_grass_block.glb': { tris: 200000, low: 100000, capMb: 8 }, // low 60k streaked the soil sides
  'river_world/ground/ground_grass_emerald.glb': { tris: 200000, low: 60000, capMb: 8 },
  // Thin stems + cattails collapse below ~120k triangles (checked at 15k, 40k, 86k): low keeps 120k too.
  'river_world/river_reed.glb': { tris: 120000, low: 120000, capMb: 4, lowCapMb: 4 },
  // A smooth egg-shaped bush: 15k looked identical to the 1.5M original, 150k only cost download size.
  'river_world/cay_phu/tree_x08_verdant.glb': { tris: 20000, low: 10000, capMb: 1 },
};

/**
 * Target per kind: max triangles, max texture edge, size cap (MB).
 * Big scanned models (trees, bushes, caves, cabins, terrain, world backdrops) keep 150k triangles:
 * their UVs are split into thousands of islands and fewer triangles smear the texture
 * (checked visually with scripts/validate-glb.py --thumbs). The low variant halves textures and
 * keeps a third of the triangles for weak phones.
 */
export function budget(rel, low = false) {
  // Terrain slabs are nearly flat: far fewer triangles keep the same look.
  const ground = /(^|\/)ground\//.test(rel);
  const big = !ground && (/(^|\/)(mini|the_gioi|cay_phu)\//.test(rel) || /backdrop|world_|(tree|bush|fern|cave|cabin|woodpile|island)/.test(rel));
  let b;
  if (ground) b = { tris: 60000, tex: 1024, capMb: 4 };
  else if (big) b = { tris: 150000, tex: 1024, capMb: 6 };
  else if (/(^|\/)(characters|khung_long|thu_nho)\//.test(rel) || /\/char_/.test(rel)) b = { tris: 20000, tex: 1024, capMb: 4 };
  else if (/multiverse\/mv_(hero|boss|npc|minion)/.test(rel)) b = { tris: 20000, tex: 1024, capMb: 4 };
  else if (/fishing\/ca\//.test(rel)) b = { tris: 8000, tex: 512, capMb: 1 };
  else if (/^river_world\//.test(rel)) b = { tris: 15000, tex: 1024, capMb: 2 };
  else b = { tris: 8000, tex: 1024, capMb: 1 };
  if (low) b = { tris: Math.round(big ? b.tris / 5 : ground ? b.tris / 3 : b.tris / 2), tex: 512, capMb: big || ground ? 2 : Math.max(0.5, b.capMb / 2) };
  const o = OVERRIDES[rel.split(path.sep).join('/')];
  if (o) b = { ...b, tris: low ? o.low : o.tris, capMb: low ? (o.lowCapMb ?? Math.max(b.capMb, 3)) : o.capMb };
  if (TRIS) b = { ...b, tris: low ? Math.round(TRIS / 2) : TRIS };
  return b;
}

const countTris = (doc) => {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      if (p.getMode() !== 4) continue;
      const i = p.getIndices();
      n += (i ? i.getCount() : (p.getAttribute('POSITION')?.getCount() ?? 0)) / 3;
    }
  }
  return Math.round(n);
};

/**
 * Per-primitive simplification with meshoptimizer flags (gltf-transform's `simplify` has no
 * Permissive flag). mode 'permissive' collapses across UV seams; 'sloppy' ignores topology.
 */
function reduceTo(targetTris, mode) {
  return (doc) => {
    const prims = [];
    let total = 0;
    for (const m of doc.getRoot().listMeshes()) {
      for (const p of m.listPrimitives()) {
        if (p.getMode() !== 4 || !p.getAttribute('POSITION')) continue;
        if (!p.getIndices()) weldPrimitive(p, { tolerance: 0 });
        const idx = p.getIndices();
        if (!idx) continue;
        prims.push(p);
        total += idx.getCount() / 3;
      }
    }
    if (total <= targetTris) return;
    const ratio = targetTris / total;
    for (const p of prims) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      if (pos.getNormalized() || !(pos.getArray() instanceof Float32Array)) continue; // quantized already
      const indices = Uint32Array.from(idx.getArray());
      const positions = pos.getArray();
      const target = Math.max(3, Math.floor((indices.length * ratio) / 3) * 3);
      let out;
      if (mode === 'sloppy') {
        [out] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 0.05);
      } else {
        // Seam-aware: UVs (and vertex colours) are part of the error, so texture stays in place.
        const attrs = [];
        const weights = [];
        const uv = p.getAttribute('TEXCOORD_0');
        if (uv && uv.getArray() instanceof Float32Array) attrs.push([uv, 2, 1.0]);
        const col = p.getAttribute('COLOR_0');
        if (col && col.getArray() instanceof Float32Array) attrs.push([col, col.getElementSize(), 0.5]);
        if (attrs.length) {
          const n = pos.getCount();
          const stride = attrs.reduce((k, [, size]) => k + size, 0);
          const data = new Float32Array(n * stride);
          let off = 0;
          for (const [acc, size, w] of attrs) {
            const a = acc.getArray();
            for (let v = 0; v < n; v++) for (let c = 0; c < size; c++) data[v * stride + off + c] = a[v * size + c];
            for (let c = 0; c < size; c++) weights.push(w);
            off += size;
          }
          [out] = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, data, stride, weights, null, target, 1, ['Permissive', 'Prune']);
        } else {
          [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, 1, ['Permissive', 'Prune']);
        }
      }
      if (out.length >= 3 && out.length < indices.length) {
        idx.setArray(out);
        compactPrimitive(p);
      }
    }
  };
}

/** Meshy exports scanned meshes with metallic 1 and no roughness map: black without an env map. */
function fixBlackMetal(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    if (!m.getMetallicRoughnessTexture() && m.getMetallicFactor() > 0.5) {
      m.setMetallicFactor(0);
      m.setRoughnessFactor(0.85);
    }
  }
}

async function optimizeOnce(file, rel, b) {
  const doc = await io.read(file);
  const tris0 = countTris(doc);
  fixBlackMetal(doc);
  await doc.transform(dedup());
  let cur = tris0;
  let how = 'giữ nguyên';
  if (cur > b.tris) {
    await doc.transform(weld({ tolerance: 0.001, toleranceNormal: 1.2 }));
    // 1) normal (keeps UV seams), increasing error until close to the target
    for (const err of [0.03, 0.15, 0.5, 1]) {
      if (cur <= b.tris * 1.3) break;
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(b.tris / cur, 0.001), error: err }));
      cur = countTris(doc);
      how = 'giản lược';
    }
    // 2) Permissive: collapse across UV seams (scanned / Meshy meshes)
    if (cur > b.tris * 1.3) {
      await doc.transform(reduceTo(b.tris, 'permissive'));
      cur = countTris(doc);
      how = 'giản lược qua đường nối UV';
    }
    // 3) Sloppy: position-only, last resort for foliage and scans
    if (cur > b.tris * 1.5) {
      await doc.transform(reduceTo(b.tris, 'sloppy'));
      cur = countTris(doc);
      how = 'giản lược thô (sloppy)';
    }
  }
  await doc.transform(
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [b.tex, b.tex], quality: b.tex <= 512 ? 76 : 82 }),
    quantize(),
    // 'high' adds meshopt filters (octahedral normals…): 25–40% smaller, no visible difference (27/10 review).
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  return { doc, tris0, tris1: countTris(doc), how };
}

const files = walk(src)
  .filter((f) => !ONLY || f.includes(ONLY))
  .filter((f) => !FILES || FILES.has(path.relative(src, f).split(path.sep).join('/')))
  .sort((a, b) => fs.statSync(a).size - fs.statSync(b).size);
const report = [];
for (const f of files) {
  const rel = path.relative(src, f);
  const out = path.join(dst, rel);
  if (OVER && fs.existsSync(out)) {
    const b0 = budget(rel, LOW);
    const doc0 = await io.read(out).catch(() => null);
    const okSize = fs.statSync(out).size <= b0.capMb * 1e6;
    const okTris = doc0 ? countTris(doc0) <= b0.tris * 1.6 : false;
    if (okSize && okTris) continue;
  } else if (!FORCE && fs.existsSync(out)) continue;
  const t0 = Date.now();
  const before = fs.statSync(f).size;
  try {
    let b = budget(rel, LOW);
    let res;
    let glb;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await optimizeOnce(f, rel, b);
      glb = await io.writeBinary(res.doc);
      if (glb.byteLength <= b.capMb * 1e6) break;
      // Over the cap: tighter triangles and smaller textures, then try again.
      b = { ...b, tris: Math.round(b.tris * 0.6), tex: Math.max(256, b.tex / 2) };
    }
    writeGlbAtomic(out, glb);
    const after = fs.statSync(out).size;
    const over = after > budget(rel, LOW).capMb * 1e6;
    report.push({ file: rel, before, after, tris0: res.tris0, tris1: res.tris1, how: res.how, over, sec: Math.round((Date.now() - t0) / 1000) });
    console.log(`${over ? '!' : '✓'} ${rel}: ${(before / 1e6).toFixed(1)} → ${(after / 1e6).toFixed(2)} MB, ${res.tris0} → ${res.tris1} tam giác (${res.how}), ${Math.round((Date.now() - t0) / 1000)}s${over ? ' — VẪN VƯỢT TRẦN' : ''}`);
  } catch (e) {
    console.log(`✗ ${rel}: ${String(e.message).slice(0, 160)}`);
    report.push({ file: rel, error: String(e.message).slice(0, 200) });
  }
  fs.mkdirSync(dst, { recursive: true });
  fs.writeFileSync(path.join(dst, '_optimize_last.json'), JSON.stringify(report, null, 1));
}
console.log(`XONG: ${report.length} tệp, ${report.filter((r) => r.over).length} vẫn vượt trần, ${report.filter((r) => r.error).length} lỗi.`);
