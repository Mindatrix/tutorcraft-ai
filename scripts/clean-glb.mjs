#!/usr/bin/env node
// Clean a library GLB before optimizing it (A3, 27/10/2026). Works on the RAW file in
// ~/Documents/3D_tutorcraft; the original is copied to <library>/_backup/<same path> first.
//
//   node scripts/clean-glb.mjs <file.glb> --inspect
//       meshes, bounding box, flat axis-aligned panels (share of the surface), loose pieces
//   node scripts/clean-glb.mjs <file.glb> [--drop-planes z=0.95,z=-0.95] [--drop-below 0.02]
//                                         [--keep-pieces-over 0.02] [--dry]
//       --drop-planes      remove triangles lying flat in these planes (±1 mm), e.g. backdrop panels
//       --drop-below y     remove triangles whose 3 corners are all below height y (a ground disk)
//       --keep-pieces-over k  keep only connected pieces holding at least k (0..1) of the surface
//                          (drops grass and pebbles scattered around a prop)
//       --keep-within r    keep only pieces lying inside |x| ≤ r and |z| ≤ r (a prop in the middle
//                          of a Meshy "diorama": drops backdrop slabs and debris around it)
//       --all              with --inspect: list every piece, not the 8 biggest
//       --dry              report what would go, write nothing
// Afterwards run optimize-glb.mjs on the file (high + --low) and validate-glb.py.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft/TutorCraft/01_assets_source').replace(/^~/, os.homedir()));
const [fileArg, ...rest] = process.argv.slice(2);
if (!fileArg) {
  console.error('Cách dùng: node scripts/clean-glb.mjs <file.glb> --inspect | --drop-planes z=0.95 | --drop-below 0.02 | --keep-pieces-over 0.02 [--dry]');
  process.exit(1);
}
const file = path.resolve(fileArg.replace(/^~/, os.homedir()));
const flag = (n) => rest.includes(n);
const opt = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : null);
const planes = (opt('--drop-planes') ?? '')
  .split(',')
  .filter(Boolean)
  .map((s) => {
    const m = /^([xyz])=(-?[\d.]+)$/.exec(s.trim());
    if (!m) throw new Error(`mặt phẳng không hợp lệ: ${s}`);
    return { axis: 'xyz'.indexOf(m[1]), value: Number(m[2]) };
  });
const below = opt('--drop-below') !== null ? Number(opt('--drop-below')) : null;
const keepOver = opt('--keep-pieces-over') !== null ? Number(opt('--keep-pieces-over')) : null;
const keepWithin = opt('--keep-within') !== null ? Number(opt('--keep-within')) : null;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(file);

/** World matrix of every node that holds a mesh (positions are measured in world space). */
function worldOf(node) {
  const m = node.getWorldMatrix();
  return (p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}

const prims = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const toWorld = worldOf(node);
  for (const prim of mesh.listPrimitives()) prims.push({ node, mesh, prim, toWorld });
}

const area3 = (a, b, c) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
};

// Triangles in world space, with area and connected piece (welded by position, 0.1 mm).
const tris = [];
for (const [pi, e] of prims.entries()) {
  const pos = e.prim.getAttribute('POSITION');
  const idx = e.prim.getIndices();
  const n = idx ? idx.getCount() / 3 : pos.getCount() / 3;
  const w = [];
  const p = [0, 0, 0];
  for (let i = 0; i < pos.getCount(); i++) w.push(e.toWorld(pos.getElement(i, p)));
  for (let t = 0; t < n; t++) {
    const ix = [0, 1, 2].map((k) => (idx ? idx.getScalar(t * 3 + k) : t * 3 + k));
    const [a, b, c] = ix.map((i) => w[i]);
    tris.push({ pi, t, ix, v: [a, b, c], area: area3(a, b, c) });
  }
}
const total = tris.reduce((s, x) => s + x.area, 0);

// Union-find over welded positions.
const parent = new Map();
const find = (k) => {
  while (parent.get(k) !== k) {
    parent.set(k, parent.get(parent.get(k)));
    k = parent.get(k);
  }
  return k;
};
const key = (v) => v.map((x) => Math.round(x * 1e4)).join(',');
for (const tr of tris) {
  const ks = tr.v.map(key);
  for (const k of ks) if (!parent.has(k)) parent.set(k, k);
  parent.set(find(ks[1]), find(ks[0]));
  parent.set(find(ks[2]), find(ks[0]));
}
const pieces = new Map();
for (const tr of tris) {
  const r = find(key(tr.v[0]));
  tr.piece = r;
  const pc = pieces.get(r) ?? { area: 0, tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  pc.area += tr.area;
  pc.tris++;
  for (const v of tr.v)
    for (let k = 0; k < 3; k++) {
      pc.min[k] = Math.min(pc.min[k], v[k]);
      pc.max[k] = Math.max(pc.max[k], v[k]);
    }
  pieces.set(r, pc);
}

const flatIn = (tr, axis, value) => tr.v.every((v) => Math.abs(v[axis] - value) < 1e-3);
const fmt = (a) => a.map((x) => x.toFixed(3)).join(', ');

if (flag('--inspect')) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const tr of tris)
    for (const v of tr.v)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], v[k]);
        max[k] = Math.max(max[k], v[k]);
      }
  console.log(`${path.basename(file)}: ${prims.length} primitive, ${tris.length} tam giác, khung [${fmt(min)}] → [${fmt(max)}]`);
  const planesFound = new Map();
  for (const tr of tris)
    for (let k = 0; k < 3; k++)
      if (Math.abs(tr.v[0][k] - tr.v[1][k]) < 1e-3 && Math.abs(tr.v[0][k] - tr.v[2][k]) < 1e-3) {
        const name = `${'xyz'[k]}=${tr.v[0][k].toFixed(2)}`;
        const e = planesFound.get(name) ?? { area: 0, tris: 0 };
        e.area += tr.area;
        e.tris++;
        planesFound.set(name, e);
      }
  console.log('Mặt phẳng phẳng lớn nhất (phần diện tích bề mặt):');
  for (const [k, e] of [...planesFound].sort((a, b) => b[1].area - a[1].area).slice(0, 6)) console.log(`  ${k}: ${((100 * e.area) / total).toFixed(1)}% · ${e.tris} tam giác`);
  console.log(`Mảnh rời: ${pieces.size}. Lớn nhất:`);
  for (const pc of [...pieces.values()].sort((a, b) => b.area - a.area).slice(0, flag('--all') ? 1e9 : 8))
    console.log(`  ${((100 * pc.area) / total).toFixed(1)}% · ${pc.tris} tam giác · [${fmt(pc.min)}] → [${fmt(pc.max)}]`);
  process.exit(0);
}

// Decide what goes.
const drop = new Set();
for (const tr of tris) {
  if (planes.some((pl) => flatIn(tr, pl.axis, pl.value))) drop.add(tr);
  else if (below !== null && tr.v.every((v) => v[1] < below)) drop.add(tr);
  else if (keepOver !== null && pieces.get(tr.piece).area / total < keepOver) drop.add(tr);
  else if (keepWithin !== null) {
    const pc = pieces.get(tr.piece);
    if ([0, 2].some((k) => pc.min[k] < -keepWithin || pc.max[k] > keepWithin)) drop.add(tr);
  }
}
const dropArea = [...drop].reduce((s, x) => s + x.area, 0);
console.log(`${path.basename(file)}: bỏ ${drop.size}/${tris.length} tam giác (${((100 * dropArea) / total).toFixed(1)}% bề mặt), giữ ${tris.length - drop.size}`);
if (flag('--dry') || !drop.size) process.exit(0);

// Rebuild each primitive's index list without the dropped triangles.
for (const [pi, e] of prims.entries()) {
  const keep = tris.filter((tr) => tr.pi === pi && !drop.has(tr));
  const count = e.prim.getAttribute('POSITION').getCount();
  const Arr = count > 65535 ? Uint32Array : Uint16Array;
  const out = new Arr(keep.length * 3);
  keep.forEach((tr, i) => out.set(tr.ix, i * 3));
  if (!keep.length) {
    e.prim.dispose();
    continue;
  }
  const acc = doc.createAccessor().setType('SCALAR').setArray(out);
  const old = e.prim.getIndices();
  e.prim.setIndices(acc);
  if (old && !old.listParents().some((p) => p !== doc.getRoot())) old.dispose();
}
await doc.transform(prune());

const rel = path.relative(ROOT, file);
if (!rel.startsWith('..')) {
  const backup = path.join(ROOT, '_backup', rel);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  console.log(`  bản gốc: ${backup}`);
}
// Binary GLB built in memory (io.write would pick JSON + side files from the .tmp extension),
// written next to the target, then renamed over it.
const bytes = await io.writeBinary(doc);
if (new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) !== 0x46546c67) throw new Error('kết quả không phải GLB');
const tmp = `${file}.${process.pid}.tmp`;
fs.writeFileSync(tmp, bytes);
fs.renameSync(tmp, file);
console.log(`  đã ghi ${file} (${(fs.statSync(file).size / 1e6).toFixed(2)} MB)`);
