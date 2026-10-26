// Tạo model 3D bằng Meshy API cho TutorCraft AI.
// Chạy:  node --env-file=.env.local scripts/generate-meshy-models.mjs [--dry] [--only a,b] [--preview-only] [--lite] [--force]
//  --dry           chỉ in lệnh, không gọi API, không tốn điểm
//  --only a,b      chỉ tạo các model này
//  --preview-only  chỉ tạo bản nháp (chưa tô màu) và in link ảnh để bạn duyệt; chạy lại không kèm cờ này để tô màu tiếp
//  --lite          dùng meshy-6-lite (rẻ hơn, để thử)
//  --force         tạo lại dù file đã có
//  --group g       chỉ tạo nhóm g: camp | fishing | survival (các món bạn không tìm được, xem scripts/meshy-models-extra.mjs)
// Món trong meshy-models-extra.mjs được lưu vào ~/Documents/3D_tutorcraft/<nhóm>/<tên>.glb
// Tiến độ lưu ở .meshy-state.json để chạy lại không tốn điểm lần nữa.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { EXTRA } from './meshy-models-extra.mjs';

const API = 'https://api.meshy.ai/openapi';
const KEY = process.env.MESHY_API_KEY;
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const oi = args.indexOf('--only');
const only = oi >= 0 ? (args[oi + 1] || '').split(',').filter(Boolean) : null;
const gi = args.indexOf('--group');
const group = gi >= 0 ? args[gi + 1] : null;
const SRC = process.env.MESHY_SRC_DIR || path.join(os.homedir(), 'Documents', '3D_tutorcraft');
const DRY = has('--dry'), PREVIEW_ONLY = has('--preview-only'), LITE = has('--lite'), FORCE = has('--force');
const MAX_BYTES = 8 * 1024 * 1024;
const OUT = 'public/assets/3d';
const STATE = '.meshy-state.json';

const STYLE = 'stylized low-poly fantasy game asset, hand-painted toon texture, clean bold silhouette, soft shading, saturated but harmonious colors, cute friendly proportions, no text, no logo, single object, centered, plain background';

// name = tên trong src/config/threeAssets.ts ; faces = số mặt mục tiêu ; rig = gắn xương (chỉ người/nhân dạng có kết cấu)
const MODELS = {
  ice_block:       { faces: 1500,  prompt: 'chunk of translucent blue ice with frosty edges and small icicles' },
  plant_monster:   { faces: 3000,  prompt: 'cute angry carnivorous plant monster in a clay pot, big toothy mouth, leafy arms' },
  boss:            { faces: 10000, rig: true, pose: 't-pose', height: 2.4, prompt: 'dark armored lord boss, horned helmet, purple glowing eyes, big shoulder armor, heavy axe, menacing but cartoonish, full body' },
  world_castle:    { faces: 12000, prompt: 'small floating island diorama with a ruined gothic castle, stone path, foggy purple and blue dark fantasy mood' },
  world_cyberpunk: { faces: 12000, prompt: 'small floating island diorama of a neon cyberpunk street with skyscrapers, pink and cyan glowing panels, dark blue ground' },
};

Object.assign(MODELS, EXTRA);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

async function call(method, url, body) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
    return json;
  }
  throw new Error('Quá nhiều lần bị giới hạn tốc độ (429)');
}

async function poll(url, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < 25 * 60 * 1000) {
    const t = await call('GET', url);
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`${label}: ${t.status} ${t.task_error?.message || ''}`);
    process.stdout.write(`\r  ${label}: ${t.status} ${t.progress ?? 0}%   `);
    await sleep(6000);
  }
  throw new Error(`${label}: quá thời gian chờ`);
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tải thất bại ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf.length;
}

function patchManifest(name) {
  const f = 'src/config/threeAssets.ts';
  const src = fs.readFileSync(f, 'utf8');
  const next = src.replaceAll(`glb('${name}')`, `'/assets/3d/${name}.glb'`);
  if (next !== src) fs.writeFileSync(f, next);
}

async function one(name, m) {
  const file = m.dir ? path.join(SRC, m.dir, `${name}.glb`) : path.join(OUT, `${name}.glb`);
  if (fs.existsSync(file) && !FORCE) { console.log(`= ${name}: đã có file, bỏ qua (dùng --force để tạo lại)`); return 0; }
  const prompt = `${STYLE}, ${m.prompt}`;
  if (prompt.length > 800) throw new Error('Lệnh dài quá 800 ký tự');
  if (DRY) { console.log(`- ${name} (${m.faces} mặt${m.rig ? ', rig' : ''}): ${m.prompt}`); return 0; }
  const s = (state[name] ||= {});
  let credits = 0;

  if (!s.preview) {
    const body = { mode: 'preview', prompt, model_type: 'standard', ai_model: LITE ? 'meshy-6-lite' : 'meshy-6', should_remesh: true, topology: 'triangle', target_polycount: m.faces };
    if (m.pose) body.pose_mode = m.pose;
    s.preview = (await call('POST', `${API}/v2/text-to-3d`, body)).result; save();
  }
  const pv = await poll(`${API}/v2/text-to-3d/${s.preview}`, `${name} nháp`);
  credits += pv.consumed_credits || 0;
  if (PREVIEW_ONLY) { console.log(`\n✓ ${name} nháp xong. Xem ảnh: ${pv.thumbnail_url}  (id ${s.preview})`); return credits; }

  if (!s.refine) {
    s.refine = (await call('POST', `${API}/v2/text-to-3d`, { mode: 'refine', preview_task_id: s.preview, enable_pbr: false })).result; save();
  }
  const rf = await poll(`${API}/v2/text-to-3d/${s.refine}`, `${name} tô màu`);
  credits += rf.consumed_credits || 0;
  let glbUrl = rf.model_urls?.glb;

  if (m.rig) {
    try {
      if (!s.rig) { s.rig = (await call('POST', `${API}/v1/rigging`, { input_task_id: s.refine, height_meters: m.height || 1.7 })).result; save(); }
      const rg = await poll(`${API}/v1/rigging/${s.rig}`, `${name} xương`);
      credits += rg.consumed_credits || 0;
      const r = rg.result ?? rg;
      if (r.rigged_character_glb_url) glbUrl = r.rigged_character_glb_url;
      for (const [k, v] of Object.entries(r.basic_animations || {})) {
        if (typeof v === 'string' && /glb/i.test(k) && v && !/armature/i.test(k)) {
          const n = await download(v, path.join(OUT, `${name}_${k.replace(/_glb_url$/, '')}.glb`));
          console.log(`\n  + ${name}_${k}: ${(n / 1024).toFixed(0)} KB`);
        }
      }
    } catch (e) { console.log(`\n  ! ${name}: không gắn được xương (${e.message}). Dùng bản không xương.`); }
  }

  if (!glbUrl) throw new Error(`${name}: không có file GLB`);
  const bytes = await download(glbUrl, file);
  console.log(`\n✓ ${name}: ${(bytes / 1048576).toFixed(2)} MB, ${credits} điểm${bytes > MAX_BYTES ? '  ⚠ vượt 8 MB, cần giảm bằng Blender' : ''}`);
  patchManifest(name);
  return credits;
}

if (!DRY && !KEY) { console.error('Thiếu MESHY_API_KEY trong .env.local'); process.exit(1); }
const names = Object.keys(MODELS).filter((n) => (!only || only.includes(n)) && (!group || MODELS[n].group === group));
const unknown = (only || []).filter((n) => !MODELS[n]);
if (unknown.length) { console.error('Tên không có trong danh sách:', unknown.join(', ')); process.exit(1); }

let total = 0;
for (const n of names) {
  try { total += await one(n, MODELS[n]); } catch (e) { console.log(`\n✗ ${n}: ${e.message}`); }
}
if (!DRY) console.log(`\nTổng điểm dùng lần chạy này: ${total}`);
if (!DRY && !PREVIEW_ONLY) { try { execSync('npm run typecheck', { stdio: 'inherit' }); } catch { console.log('Typecheck lỗi, xem ở trên.'); } }
