#!/usr/bin/env node
// Character card thumbnails for the demo entry (WP10 U6, 02/11/2026).
//   node scripts/render-character-thumbs.mjs [--only chuỗi] [--size 320]
// Reads content/character_casting.json, renders each character's demo model
// (<library>/_mid/nhan_vat_demo/…, made by optimize-glb.mjs --low --tris 10000 from _ung_vien/nhan_vat)
// with Blender (scripts/render-character-thumbs.py), then writes public/characters/thumbs/<id>.webp.
// Does not touch the library files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const ONLY = opt('--only');
const SIZE = Number(opt('--size') ?? 320);
const LIB = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft/TutorCraft/01_assets_source').replace(/^~/, os.homedir()));
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';
const OUT = path.resolve('public/characters/thumbs');
const SRC_PREFIX = '_ung_vien/nhan_vat/';

const { characters } = JSON.parse(fs.readFileSync('content/character_casting.json', 'utf8'));
const list = [];
const missing = [];
for (const c of characters) {
  if (ONLY && !c.proposed_id.includes(ONLY)) continue;
  if (!c.file.startsWith(SRC_PREFIX)) {
    missing.push(`${c.proposed_id}: ngoài ${SRC_PREFIX}`);
    continue;
  }
  const glb = path.join(LIB, '_mid/nhan_vat_demo', c.file.slice(SRC_PREFIX.length));
  if (!fs.existsSync(glb)) missing.push(`${c.proposed_id}: chưa có bản demo ${glb}`);
  else list.push({ id: c.proposed_id, glb });
}
if (missing.length) console.warn('Bỏ qua:\n  ' + missing.join('\n  '));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-thumbs-'));
fs.writeFileSync(path.join(tmp, 'list.json'), JSON.stringify(list));
console.log(`Dựng ${list.length} ảnh bằng Blender…`);
const log = execFileSync(BLENDER, ['--background', '--python', 'scripts/render-character-thumbs.py', '--', path.join(tmp, 'list.json'), tmp, '--size', String(SIZE)], { encoding: 'utf8', maxBuffer: 64 << 20 });
const summary = log.trim().split('\n').reverse().find((l) => l.startsWith('{"done"'));
console.log(summary ?? '(không đọc được tóm tắt của Blender)');

fs.mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const { id } of list) {
  const png = path.join(tmp, `${id}.png`);
  if (!fs.existsSync(png)) continue;
  const out = path.join(OUT, `${id}.webp`);
  await sharp(png).webp({ quality: 78, alphaQuality: 80 }).toFile(out);
  bytes += fs.statSync(out).size;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`XONG: ${fs.readdirSync(OUT).filter((f) => f.endsWith('.webp')).length} ảnh trong ${path.relative(process.cwd(), OUT)}, đợt này ${(bytes / 1024).toFixed(0)} KB.`);
