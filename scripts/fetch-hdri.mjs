// Tải 5 ảnh trời HDRI (CC0, Poly Haven) cho thế giới sông: sáng sớm, trưa, hoàng hôn, đêm sao, nhiều mây.
// Chạy trên máy bạn (cần mạng), trong Terminal của VS Code:  node scripts/fetch-hdri.mjs
// Mỗi ảnh tải 2 cỡ: 2K (máy tính) và 1K (điện thoại). Chạy lại sẽ bỏ qua file đã có (thêm --force để tải lại).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const SKIES = [
  { key: 'dawn', slug: 'kiara_1_dawn', vi: 'Sáng sớm' },
  { key: 'day', slug: 'kloofendal_48d_partly_cloudy_puresky', vi: 'Trưa (nắng, mây nhẹ)' },
  { key: 'sunset', slug: 'industrial_sunset_puresky', vi: 'Hoàng hôn' },
  { key: 'night', slug: 'rogland_clear_night', vi: 'Đêm sao' },
  { key: 'cloudy', slug: 'kloofendal_overcast_puresky', vi: 'Nhiều mây' },
];
const SIZES = ['2k', '1k'];
const OUT = 'public/assets/hdri';
const MANIFEST = 'src/config/threeAssets.ts';
const CREDITS = 'content/asset_credits.json';
const force = process.argv.includes('--force');
const H = { 'User-Agent': 'TutorCraftAI-asset-fetch/1.0' };

async function json(url) {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

mkdirSync(OUT, { recursive: true });
let manifest = readFileSync(MANIFEST, 'utf8');
const credits = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, 'utf8')) : {};
let total = 0;

for (const s of SKIES) {
  const [files, info] = await Promise.all([json(`https://api.polyhaven.com/files/${s.slug}`), json(`https://api.polyhaven.com/info/${s.slug}`)]);
  for (const size of SIZES) {
    const path = `${OUT}/river_${s.key}_${size}.hdr`;
    const src = files?.hdri?.[size]?.hdr?.url;
    if (!src) throw new Error(`Không có bản ${size} cho ${s.slug}`);
    if (!force && existsSync(path)) {
      console.log('• đã có', path);
    } else {
      const r = await fetch(src, { headers: H });
      if (!r.ok) throw new Error(`${r.status} ${src}`);
      writeFileSync(path, Buffer.from(await r.arrayBuffer()));
      console.log('✓', s.vi, size, path);
    }
    total += statSync(path).size;
    const web = path.replace(/^public/, '');
    manifest = manifest.replace(`at('${web}')`, `'${web}'`);
  }
  credits[`hdri_${s.key}`] = {
    file: `/assets/hdri/river_${s.key}_2k.hdr`, title: info.name, source: `https://polyhaven.com/a/${s.slug}`,
    authors: Object.keys(info.authors ?? {}), license: 'CC0', downloaded: new Date().toISOString().slice(0, 10),
  };
}

writeFileSync(MANIFEST, manifest);
mkdirSync('content', { recursive: true });
writeFileSync(CREDITS, JSON.stringify(credits, null, 1) + '\n');
console.log(`Xong: ${SKIES.length} ảnh trời × ${SIZES.length} cỡ, tổng ${(total / 1048576).toFixed(1)} MB. Đã ghi nguồn vào ${CREDITS}.`);
