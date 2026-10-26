// Tô màu (retexture) cho model chưa có màu bằng Meshy, rồi (tùy chọn) gắn lại xương.
// Chạy:  node --env-file=.env.local scripts/retexture-meshy.mjs --in <file.glb> --out <file.glb> --prompt "mô tả màu sắc" [--rig] [--height 1.7] [--dry]
//   --rig   sau khi tô màu thì gắn xương + hoạt ảnh Walking/Running (chỉ cho nhân vật dáng người)
//   --dry   chỉ kiểm tra tệp, không gọi API, không tốn điểm
// Ví dụ (tiên rừng của Multiverse):
//   node --env-file=.env.local scripts/retexture-meshy.mjs --in ~/Documents/3D_tutorcraft/multiverse/mv_npc_druid_elf.glb \
//     --out ~/Documents/3D_tutorcraft/multiverse/mv_npc_druid_elf_color.glb --rig \
//     --prompt "stylized hand-painted fantasy forest healer, deep green leaf robe, brown leather, gold trim, soft toon colors, friendly"
// Lưu ý: tô màu tạo ra model MỚI; xương và hoạt ảnh cũ có thể mất, nên dùng --rig để gắn lại.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.meshy.ai/openapi';
const KEY = process.env.MESHY_API_KEY;
const args = process.argv.slice(2);
const get = (f, d = null) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const expand = (p) => (p ? p.replace(/^~(?=\/|$)/, process.env.HOME) : p);
const IN = expand(get('--in')), OUT = expand(get('--out')), PROMPT = get('--prompt');
const RIG = args.includes('--rig'), DRY = args.includes('--dry'), HEIGHT = Number(get('--height', 1.7));
if (!IN || !OUT || !PROMPT) { console.error('Thiếu --in, --out hoặc --prompt (xem đầu tệp).'); process.exit(1); }
if (!fs.existsSync(IN)) { console.error('Không thấy tệp:', IN); process.exit(1); }
const size = fs.statSync(IN).size;
if (size > 100 * 1024 * 1024) { console.error('Tệp trên 100 MB: Meshy không nhận qua data URI. Dùng bản trong _optimized/.'); process.exit(1); }
if (DRY) { console.log(`Sẽ tô màu ${path.basename(IN)} (${(size / 1048576).toFixed(1)} MB)${RIG ? ' rồi gắn xương' : ''}.\nMô tả: ${PROMPT}`); process.exit(0); }
if (!KEY) { console.error('Thiếu MESHY_API_KEY (chạy với --env-file=.env.local).'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, url, body) {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  }
  throw new Error('Bị giới hạn tốc độ quá nhiều lần');
}
async function poll(url, label) {
  for (;;) {
    const t = await call('GET', url);
    process.stdout.write(`\r  ${label}: ${t.status} ${t.progress ?? 0}%   `);
    if (t.status === 'SUCCEEDED') { process.stdout.write('\n'); return t; }
    if (['FAILED', 'CANCELED'].includes(t.status)) throw new Error(`${label} ${t.status}: ${t.task_error?.message || ''}`);
    await sleep(6000);
  }
}
async function download(url, file) {
  const res = await fetch(url); if (!res.ok) throw new Error('Tải thất bại ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer()); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); return buf.length;
}

let credits = 0;
const data = 'data:application/octet-stream;base64,' + fs.readFileSync(IN).toString('base64');
const task = (await call('POST', `${API}/v1/retexture`, { model_url: data, text_style_prompt: PROMPT.slice(0, 800), ai_model: 'meshy-6', enable_original_uv: true, enable_pbr: false, remove_lighting: true, texture_resolution: '2k' })).result;
const rt = await poll(`${API}/v1/retexture/${task}`, 'tô màu');
credits += rt.consumed_credits || 0;
let url = rt.model_urls?.glb;
if (RIG) {
  try {
    const rg = (await call('POST', `${API}/v1/rigging`, { input_task_id: task, height_meters: HEIGHT })).result;
    const r = await poll(`${API}/v1/rigging/${rg}`, 'gắn xương');
    credits += r.consumed_credits || 0;
    url = (r.result ?? r).rigged_character_glb_url || url;
  } catch (e) { console.log('\n⚠ Không gắn được xương (' + e.message.slice(0, 120) + '). Giữ bản tĩnh đã tô màu.'); }
}
const bytes = await download(url, OUT);
console.log(`\n✓ ${OUT}: ${(bytes / 1048576).toFixed(2)} MB, ${credits} điểm`);
