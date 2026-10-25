#!/usr/bin/env node
// Tải model .glb (CC0 / CC-BY, cho phép download) từ Sketchfab vào public/assets/3d/
// rồi điền đường dẫn vào src/config/threeAssets.ts.
// Chạy trên máy bạn:  node --env-file=.env.local scripts/fetch-sketchfab-models.mjs [--dry] [--only kayak,boss]
// Token đọc từ process.env.SKETCHFAB_API_TOKEN (không bao giờ in ra).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const TOKEN = process.env.SKETCHFAB_API_TOKEN;
if (!TOKEN) { console.error('Thiếu SKETCHFAB_API_TOKEN (chạy với --env-file=.env.local)'); process.exit(1); }
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const oi = args.indexOf('--only');
const only = oi >= 0 ? (args[oi + 1] || '').split(',').filter(Boolean) : [];
const OUT = path.resolve('public/assets/3d');
const MANIFEST = path.resolve('src/config/threeAssets.ts');
const H = { Authorization: `Token ${TOKEN}` };
const API = 'https://api.sketchfab.com/v3';
// Giấy phép cho phép dùng thương mại: CC0, CC-BY (cần ghi nguồn -> lưu vào CREDITS.md)
const licenseOk = (l) => {
  const t = `${l?.slug ?? ''} ${l?.label ?? ''} ${l?.fullName ?? ''}`.toLowerCase();
  if (/non.?commercial|noderiv|no.?deriv|sharealike|share.?alike|\bnc\b|\bnd\b|\bsa\b/.test(t)) return false;
  return /cc0|public domain|attribution|\bby\b/.test(t);
};
const MAX_FACES = 20000; // nhẹ cho điện thoại
const MAX_BYTES = 8 * 1024 * 1024;

// tên file trong manifest (glb('<tên>')) -> [từ khóa tìm kiếm, regex tên model bắt buộc khớp]
const MODELS = {
  kayak: ['low poly kayak', /kayak|canoe|boat|raft/i], hat_propeller: ['propeller hat', /propeller|beanie/i],
  hat_wizard: ['wizard hat', /wizard|witch|mage/i], hat_jester: ['jester hat', /jester|clown/i],
  hat_hardhat: ['hard hat helmet construction', /hard.?hat|construction|helmet/i], log_spinning: ['wooden log', /\blog\b|trunk|timber/i],
  ice_block: ['ice cube block', /\bice\b/i], plant_monster: ['plant monster', /plant|flower|cactus|venus|carnivor/i],
  scarlet_princess: ['female warrior', /warrior|knight|princess|heroine|swordswoman/i], boss: ['dark knight', /knight|boss|demon|monster|golem|orc|dragon/i],
  world_castle: ['castle', /castle|fortress|tower/i], world_cyberpunk: ['cyberpunk city', /cyber|neon|sci.?fi|futur/i],
  world_desert: ['desert ruins', /desert|ruin|temple|pyramid/i], cosmic_table: ['sci-fi table', /table|desk|altar/i],
  dino_green: ['cartoon dinosaur', /dino|rex|raptor|dragon/i], dino_friend: ['baby dinosaur', /dino|rex|raptor/i],
  iron_cage: ['cage', /\bcage\b/i], spiky_beetle: ['beetle', /beetle|bug|insect|spider/i],
  gacha_egg: ['dinosaur egg', /egg/i], isometric_office: ['isometric office', /office|room|desk/i],
  agent_orion: ['robot', /robot|bot|android|mech/i], agent_kai: ['cute robot', /robot|bot|android|mech/i],
  agent_quinn: ['android girl', /android|robot|girl|cyborg/i], student_avatar: ['student character', /student|kid|boy|girl|character|school/i],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: H });
    if (r.status === 429) { await sleep(3000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url.split('?')[0]}`);
    return r.json();
  }
  throw new Error('rate limited');
}

fs.mkdirSync(OUT, { recursive: true });
const credits = [];
const done = [];
for (const [name, [q, must]] of Object.entries(MODELS)) {
  if (only.length && !only.includes(name)) continue;
  const file = path.join(OUT, `${name}.glb`);
  if (fs.existsSync(file)) { done.push(name); console.log(`= ${name} (đã có)`); continue; }
  try {
    const s = await j(`${API}/search?type=models&downloadable=true&count=24&sort_by=-likeCount&q=${encodeURIComponent(q)}`);
    let pick = null;
    for (const c of (s.results || []).slice(0, 10)) {
      // kết quả tìm kiếm thường thiếu giấy phép/số mặt -> lấy chi tiết model
      const m = c.license && c.faceCount != null ? c : await j(`${API}/models/${c.uid}`);
      if (m.isDownloadable !== false && must.test(m.name) && licenseOk(m.license) && m.faceCount > 0 && m.faceCount <= MAX_FACES) { pick = { ...c, ...m }; break; }
      if (args.includes('--verbose')) console.log(`    x ${m.name} | license=${m.license?.label ?? JSON.stringify(m.license)} | mặt=${m.faceCount ?? 'thiếu'} | downloadable=${m.isDownloadable}`);
    }
    if (!pick) { console.log(`! ${name}: không có kết quả hợp lệ cho "${q}" (${(s.results || []).length} kết quả tìm được)`); continue; }
    console.log(`> ${name}: ${pick.name} (${pick.license.label}, ${pick.faceCount} mặt) by ${pick.user?.displayName}`);
    if (DRY) continue;
    const d = await j(`${API}/models/${pick.uid}/download`);
    const url = d.glb?.url;
    if (!url) { console.log(`! ${name}: không có bản glb`); continue; }
    if (d.glb.size && d.glb.size > MAX_BYTES) { console.log(`! ${name}: file ${(d.glb.size / 1048576).toFixed(1)} MB quá nặng, bỏ qua`); continue; }
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    if (buf.subarray(0, 4).toString() !== 'glTF') { console.log(`! ${name}: file tải về không phải glb`); continue; }
    fs.writeFileSync(file, buf);
    credits.push({ file: `${name}.glb`, title: pick.name, author: pick.user?.displayName || pick.user?.username || 'Không rõ', license: pick.license.label, url: pick.viewerUrl });
    done.push(name);
    await sleep(800);
  } catch (e) { console.log(`! ${name}: ${e.message}`); }
}
if (!DRY && done.length) {
  let src = fs.readFileSync(MANIFEST, 'utf8');
  for (const n of done) src = src.replaceAll(`glb('${n}')`, `'/assets/3d/${n}.glb'`);
  fs.writeFileSync(MANIFEST, src);
  if (credits.length) {
    // trang /credits đọc file này
    const CJ = path.resolve('src/config/modelCredits.json');
    let cur = [];
    try { cur = JSON.parse(fs.readFileSync(CJ, 'utf8')); } catch {}
    const byFile = new Map(cur.map((c) => [c.file, c]));
    for (const c of credits) byFile.set(c.file, c);
    fs.writeFileSync(CJ, JSON.stringify([...byFile.values()], null, 2) + '\n');
  }
  console.log(`\nĐã tải ${done.length} model vào public/assets/3d/ và cập nhật threeAssets.ts`);
  try { execFileSync('npm', ['run', 'typecheck'], { stdio: 'inherit' }); } catch { process.exit(1); }
}
