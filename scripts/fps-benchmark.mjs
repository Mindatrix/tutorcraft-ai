#!/usr/bin/env node
// Đại phẫu QA (03/11/2026): automatic FPS benchmark on phones.
//
// Opens /tutor/physics-lab in benchmark mode (autopilot walks the course with N moving students),
// waits for window.__tcBench (src/client/fpsProbe.ts) and writes a report. Gate (cổng C):
// average ≥ 30 FPS and worst full second ≥ 25 FPS; exit code 1 when a run misses it.
//
// Two ways to run (Terminal trong VS Code, ở thư mục dự án; start the app first: npx next build,
// then npx next start -p 3001):
//
//   1. Emulated phones in Chromium on this Mac (viewport, pixel ratio, touch, CPU slowed 4–6×):
//        node scripts/fps-benchmark.mjs
//        node scripts/fps-benchmark.mjs --profiles phone-low --tiers low --sec 30
//      The GPU is still the Mac's: the numbers rank changes against each other, they do not
//      replace a real phone.
//   2. A real Android phone over USB (Developer options → USB debugging, `adb devices` lists it,
//      Chrome installed). The phone must reach the server: use the LAN address.
//        node scripts/fps-benchmark.mjs --android --url http://192.168.1.99:3001
//   iPhone cannot be driven: open the same URL in Safari (…/tutor/physics-lab?bench=20&tier=low)
//   and take a screenshot of the result box.
//
// One-time setup for (1): npx playwright-core install chromium
//
// Options: --url <base> (default http://localhost:3001) · --profiles phone-mid,phone-low,iphone-se
//          · --tiers high,low · --crowd 50 · --sec 20 · --warmup 2 · --headless · --out <dir>

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { _android, chromium } from 'playwright-core';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A346E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Emulated phones. cpu = Chrome DevTools CPU slow-down factor. */
export const PROFILES = {
  'phone-mid': { label: 'Android tầm trung (412×915, dpr 2.6, CPU ÷4)', viewport: { width: 412, height: 915 }, dpr: 2.625, ua: ANDROID_UA, cpu: 4 },
  'phone-low': { label: 'Android yếu (360×780, dpr 2, CPU ÷6)', viewport: { width: 360, height: 780 }, dpr: 2, ua: ANDROID_UA, cpu: 6 },
  'iphone-se': { label: 'iPhone SE cỡ màn (375×667, dpr 2, CPU ÷4)', viewport: { width: 375, height: 667 }, dpr: 2, ua: IPHONE_UA, cpu: 4 },
};

function args(argv) {
  const out = { url: 'http://localhost:3001', profiles: ['phone-mid', 'phone-low'], tiers: ['high', 'low'], crowd: 50, sec: 20, warmup: 2, headless: false, android: false, out: null };
  const withValue = {
    '--url': (v) => (out.url = v.replace(/\/$/, '')),
    '--profiles': (v) => (out.profiles = v.split(',')),
    '--tiers': (v) => (out.tiers = v.split(',')),
    '--crowd': (v) => (out.crowd = Number(v)),
    '--sec': (v) => (out.sec = Number(v)),
    '--warmup': (v) => (out.warmup = Number(v)),
    '--out': (v) => (out.out = v),
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (withValue[k]) {
      withValue[k](argv[i + 1] ?? '');
      i++;
    } else if (k === '--headless') out.headless = true;
    else if (k === '--android') out.android = true;
    else if (k === '--help' || k === '-h') {
      console.log('Xem chú thích đầu file scripts/fps-benchmark.mjs');
      process.exit(0);
    } else throw new Error(`Tuỳ chọn không rõ: ${k}`);
  }
  for (const p of out.profiles) if (!PROFILES[p]) throw new Error(`Không có hồ sơ máy "${p}". Có: ${Object.keys(PROFILES).join(', ')}`);
  return out;
}

const benchUrl = (o, tier) => `${o.url}/tutor/physics-lab?bench=${o.sec}&warmup=${o.warmup}&tier=${tier}&crowd=${o.crowd}`;

async function runPage(page, url, timeoutMs) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__tcBench && window.__tcBench.done === true, null, { timeout: timeoutMs, polling: 500 });
  return page.evaluate(() => window.__tcBench);
}

async function emulated(o) {
  const browser = await chromium.launch({
    headless: o.headless,
    // Use the real GPU (headless Chromium would fall back to software rendering).
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
  });
  const results = [];
  try {
    for (const name of o.profiles) {
      const p = PROFILES[name];
      for (const tier of o.tiers) {
        const context = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.dpr, isMobile: true, hasTouch: true, userAgent: p.ua });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
        const url = benchUrl(o, tier);
        process.stdout.write(`• ${name} / ${tier} … `);
        try {
          const r = await runPage(page, url, (o.sec + o.warmup + 90) * 1000);
          results.push({ profile: name, profileLabel: p.label, tier, cpuSlowdown: p.cpu, url, ...r });
          console.log(`${r.summary.avgFps} FPS tb, giây tệ nhất ${r.summary.worstSecondFps} → ${r.summary.pass ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
        } catch (e) {
          results.push({ profile: name, profileLabel: p.label, tier, cpuSlowdown: p.cpu, url, error: String(e?.message ?? e) });
          console.log(`lỗi: ${e?.message ?? e}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function android(o) {
  const [device] = await _android.devices();
  if (!device) throw new Error('Không thấy máy Android: bật USB debugging và kiểm tra `adb devices`.');
  const model = device.model();
  console.log(`Máy Android: ${model} (${device.serial()})`);
  await device.shell('am force-stop com.android.chrome');
  const context = await device.launchBrowser();
  const results = [];
  try {
    for (const tier of o.tiers) {
      const page = await context.newPage();
      const url = benchUrl(o, tier);
      process.stdout.write(`• ${model} / ${tier} … `);
      try {
        const r = await runPage(page, url, (o.sec + o.warmup + 120) * 1000);
        results.push({ profile: `android:${model}`, profileLabel: `Android thật: ${model}`, tier, cpuSlowdown: 1, url, ...r });
        console.log(`${r.summary.avgFps} FPS tb, giây tệ nhất ${r.summary.worstSecondFps} → ${r.summary.pass ? 'ĐẠT' : 'CHƯA ĐẠT'}`);
      } catch (e) {
        results.push({ profile: `android:${model}`, profileLabel: `Android thật: ${model}`, tier, cpuSlowdown: 1, url, error: String(e?.message ?? e) });
        console.log(`lỗi: ${e?.message ?? e}`);
      }
      await page.close();
    }
  } finally {
    await context.close();
    await device.close();
  }
  return results;
}

function report(results, o) {
  const day = new Date().toISOString().slice(0, 10);
  const dir = o.out ?? join('_report', 'fps', day);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(dir, `fps-${o.android ? 'android' : 'emulated'}-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify({ options: o, results }, null, 2));
  const rows = results.map((r) =>
    r.error
      ? `| ${r.profileLabel} | ${r.tier} | lỗi: ${r.error.replace(/\|/g, '/')} | | | | |`
      : `| ${r.profileLabel} | ${r.tier} | ${r.summary.avgFps} | ${r.summary.worstSecondFps} | ${r.summary.low1Fps} | ${r.summary.p95Ms} ms | ${r.summary.pass ? '**ĐẠT**' : 'chưa đạt'} |`,
  );
  const gpu = results.find((r) => r.device)?.device;
  const md = [
    `# Đo FPS tự động — ${new Date().toLocaleString('vi-VN')}`,
    '',
    `Trang: \`/tutor/physics-lab\` (bench ${o.sec} s, khởi động ${o.warmup} s, ${o.crowd} học sinh di chuyển). Cổng: trung bình ≥ 30 FPS và giây tệ nhất ≥ 25 FPS.`,
    o.android ? 'Chạy trên máy Android thật qua ADB.' : 'Giả lập điện thoại trong Chromium trên máy Mac (GPU vẫn là của Mac): dùng để so sánh giữa các lần sửa, không thay số đo trên điện thoại thật.',
    gpu ? `GPU: ${gpu.gpu}` : '',
    '',
    '| Máy | Tầng | FPS tb | Giây tệ nhất | 1% thấp | p95 | Kết quả |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(`${base}.md`, md);
  return { json: `${base}.json`, md: `${base}.md` };
}

const o = args(process.argv);
const results = o.android ? await android(o) : await emulated(o);
const files = report(results, o);
const failed = results.filter((r) => r.error || !r.summary?.pass).length;
console.log(`\nBáo cáo: ${files.md}\n${results.length - failed}/${results.length} lượt đạt cổng.`);
process.exit(failed ? 1 : 0);
