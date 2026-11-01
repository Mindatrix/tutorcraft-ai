#!/usr/bin/env node
// Đưa một ứng viên từ _ung_vien/ vào inbox/ để import-inbox.mjs nhập kho (bước C1, 01/11/2026).
//   node scripts/promote-candidate.mjs <file trong _ung_vien> <mã>            chạy khô: in việc sẽ làm
//   node scripts/promote-candidate.mjs <file trong _ung_vien> <mã> --apply    sao chép thật
//
// <file>: đường dẫn tính từ _ung_vien/ (vd vat_pham/camp_bottle/Meshy_AI_….glb), hoặc từ thư viện,
// hoặc tuyệt đối. <mã>: mã đồ vật (a-z, 0-9, _).
//  - Mã đã có trong inbox hoặc trong thư viện → báo lỗi và gợi ý bản biến thể trống kế tiếp (<mã>_2, _3…).
//    Thêm --variant để tự lấy bản trống kế tiếp.
//  - Sao chép (không di chuyển, không xoá bản gốc) sang inbox/<mã><đuôi gốc>, thêm một dòng vào
//    inbox/credits.csv: file,id,title,author,source,license. title = tên file gốc.
//  - Giấy phép đoán theo nguồn: Meshy_AI_*.glb → Meshy Pro; .fbx trong mixamo_anim/ → Mixamo.
//    Nguồn khác phải ghi rõ: --author "…" --source "https://…" --license "CC0". Các cờ này cũng ghi đè
//    giá trị đoán được.
//  - Cùng nội dung đã nằm trong inbox (dưới mã khác) → báo lỗi.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const VALUE_FLAGS = ['--author', '--source', '--license', '--title'];
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(argv[i - 1]));
const APPLY = argv.includes('--apply');
const VARIANT = argv.includes('--variant');
const ROOT = path.resolve((process.env.TC_3D_DIR || '~/Documents/3D_tutorcraft').replace(/^~/, os.homedir()));
const CANDIDATES = path.join(ROOT, '_ung_vien');
const INBOX = path.join(ROOT, 'inbox');
const CREDITS = path.join(INBOX, 'credits.csv');
const HEADER = 'file,id,title,author,source,license';

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const [srcArg, idArg] = positional;
if (!srcArg || !idArg) fail('Dùng: node scripts/promote-candidate.mjs <file trong _ung_vien> <mã> [--variant] [--apply]');

const src = [path.resolve(srcArg), path.join(CANDIDATES, srcArg), path.join(ROOT, srcArg)].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
if (!src) fail(`không thấy file "${srcArg}" (tìm trong thư mục hiện tại, ${CANDIDATES}, ${ROOT})`);
const ext = path.extname(src).toLowerCase();
if (!['.glb', '.gltf', '.fbx', '.obj'].includes(ext)) fail(`đuôi ${ext} không nhận (chỉ .glb .gltf .fbx .obj)`);
if (!/^[a-z0-9_]+$/.test(idArg)) fail(`mã "${idArg}" không hợp lệ (chỉ a-z, 0-9, _)`);

/** Minimal CSV cell parser (commas, optional "quotes"), same rules as import-inbox.mjs. */
const cells = (l) => [...l.matchAll(/("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g)].map((m) => (m[2] !== undefined ? m[2].replace(/""/g, '"') : m[1]).trim()).slice(0, -1);
const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const creditLines = fs.existsSync(CREDITS) ? fs.readFileSync(CREDITS, 'utf8').split(/\r?\n/).filter((l) => l.trim()) : [HEADER];
const creditRows = creditLines.slice(1).map(cells);

// Ids already taken: inbox files, credits rows, library catalog.
const taken = new Set(creditRows.map((c) => c[1]).filter(Boolean));
for (const f of fs.existsSync(INBOX) ? fs.readdirSync(INBOX) : []) if (!f.startsWith('.') && !f.startsWith('_')) taken.add(path.basename(f, path.extname(f)));
try {
  for (const c of JSON.parse(fs.readFileSync('content/asset_catalog.json', 'utf8'))) taken.add(c.id);
} catch {
  console.log('· không đọc được content/asset_catalog.json (chạy lệnh ở thư mục dự án để kiểm mã trùng với thư viện)');
}

const stem = idArg.replace(/_\d+$/, '');
const nextFree = () => {
  if (!taken.has(stem)) return stem;
  for (let n = 2; ; n++) if (!taken.has(`${stem}_${n}`)) return `${stem}_${n}`;
};
let id = idArg;
if (taken.has(id)) {
  if (!VARIANT) fail(`mã ${id} đã có (inbox hoặc thư viện). Bản trống kế tiếp: ${nextFree()} (thêm --variant để tự lấy)`);
  id = nextFree();
}

// Same bytes already in the inbox under another name?
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const srcSize = fs.statSync(src).size;
const srcHash = hash(src);
for (const f of fs.existsSync(INBOX) ? fs.readdirSync(INBOX) : []) {
  const p = path.join(INBOX, f);
  if (fs.statSync(p).isFile() && fs.statSync(p).size === srcSize && hash(p) === srcHash) fail(`file này đã nằm trong inbox với tên ${f}`);
}

// License guess from where the file came from.
const base = path.basename(src);
const rel = path.relative(ROOT, src).split(path.sep).join('/');
let guess = {};
if (/^Meshy_AI_/i.test(base)) guess = { author: 'Meshy AI', source: 'meshy.ai', license: 'Meshy Pro plan (commercial)' };
else if (ext === '.fbx' && /(^|\/)mixamo_anim\//.test(rel)) guess = { author: 'Adobe Mixamo', source: 'mixamo.com', license: 'Mixamo (Adobe, free)' };
const credit = {
  title: flag('--title') ?? base,
  author: flag('--author') ?? guess.author,
  source: flag('--source') ?? guess.source,
  license: flag('--license') ?? guess.license,
};
const missing = ['author', 'source', 'license'].filter((k) => !credit[k]);
if (missing.length) fail(`không đoán được ${missing.join(', ')} cho ${rel}: ghi rõ bằng ${missing.map((k) => `--${k} "…"`).join(' ')}`);

const file = `${id}${ext}`;
const row = [file, id, credit.title, credit.author, credit.source, credit.license].map(csvCell).join(',');
console.log(`${APPLY ? '✓' : '·'} ${rel} (${(srcSize / 1e6).toFixed(1)} MB) → inbox/${file}${id !== idArg ? ` (mã ${idArg} đã có, dùng ${id})` : ''}`);
console.log(`  credits.csv: ${row}`);
if (!APPLY) {
  console.log('Chạy khô: chưa sao chép gì. Thêm --apply để sao chép.');
  process.exit(0);
}

fs.mkdirSync(INBOX, { recursive: true });
fs.copyFileSync(src, path.join(INBOX, file), fs.constants.COPYFILE_EXCL);
const body = creditLines.join('\n');
fs.writeFileSync(CREDITS, `${body}${body.endsWith('\n') ? '' : '\n'}${row}\n`);
console.log('Đã sao chép. Kiểm lại bằng: node scripts/import-inbox.mjs');
