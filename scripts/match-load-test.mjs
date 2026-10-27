#!/usr/bin/env node
// B3.1 / B3.2 — Class match load test, end to end and for real:
//   - N fake devices join ONE live match through the real HTTP API of a running server, each with
//     its own Supabase Realtime websocket, using the browser's own code (src/client/matchChannel.ts);
//   - each answers a random option every 5–15 s, starts a new session when it runs out of
//     questions (re-join keeps the score), and River Survival pursuers throw nets when charged;
//   - the tutor side (open, start, pause, resume) calls the match service directly with the
//     service role, so no tutor password is needed;
//   - a throwaway battle tagged [LOAD TEST] is created and deleted at the end (--keep keeps it).
//
//   npm run build && npx next start -p 3001          (another terminal, same .env.local)
//   npx tsc -p tsconfig.test.json                     (compiles the shared code to .test-build)
//   node --env-file=.env.local scripts/match-load-test.mjs --students 50 --stage-seconds 300
//
// Options: --url http://localhost:3001  --students 50  --stage-seconds 300 (6 × 5 min = 30 min)
//          --offline 10  --offline-seconds 20  --game river_survival  --scenario surv-01  --keep
// Pass criteria (plan B3): no broadcast lost, mean delay < 1 s, all devices on the same stage and
// second, every reconnected device has its score, a 100 req/s burst is cut without hurting others.

import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const B = (p) => require(`${ROOT}.test-build/${p}`);
const E = B('src/engine/index.js');
const { connectMatch } = B('src/client/matchChannel.js');
const { createMatchService } = B('src/server/matchService.js');
const { SupabaseMatchStore } = B('src/server/matchStore.js');
const { realtimeBroadcaster } = B('src/server/matchBroadcast.js');
const { saveBattle, loadBattle } = B('src/server/battles.js');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const URL_ = String(opt('url', 'http://localhost:3001')).replace(/\/$/, '');
const N = Number(opt('students', 50));
const STAGE_S = Number(opt('stage-seconds', 300));
const OFFLINE = Number(opt('offline', 10));
const OFFLINE_S = Number(opt('offline-seconds', 20));
const GAME = String(opt('game', 'river_survival'));
const SCENARIO = String(opt('scenario', 'surv-01'));
const KEEP = !!opt('keep', false);
const [THINK_MIN, THINK_MAX] = String(opt('think', '5000-15000')).split('-').map(Number);
const CLASS_IP = '10.77.0.1'; // the whole class behind one school Wi-Fi
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !ANON || !SERVICE) throw new Error('Cần .env.local (chạy với node --env-file=.env.local).');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const http = new Map(); // "METHOD path" → status → count
function count(key, status) {
  const m = http.get(key) ?? new Map();
  m.set(status, (m.get(status) ?? 0) + 1);
  http.set(key, m);
}
/** fetch from the class IP, counting statuses per endpoint. */
const classFetch = async (input, init = {}) => {
  const url = String(input);
  const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
  const headers = new Headers(init.headers);
  headers.set('x-forwarded-for', CLASS_IP);
  try {
    const res = await fetch(url, { ...init, headers });
    count(key, res.status);
    return res;
  } catch (e) {
    count(key, 0);
    throw e;
  }
};
async function api(path, { method = 'GET', body, token } = {}) {
  const res = await classFetch(`${URL_}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'x-battle-session': token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ---------------------------------------------------------------------------------------- setup
const db = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });
const { data: tutors } = await db.from('profiles').select('id').eq('role', 'tutor').limit(1);
const tutorId = tutors?.[0]?.id;
if (!tutorId) throw new Error('Không có hồ sơ gia sư nào để làm chủ trận thử.');
const mcq = E.demoBattle().payload.questions.filter((q) => (q.type ?? 'mcq') === 'mcq');
const questions = Array.from({ length: 45 }, (_, i) => ({ ...mcq[i % mcq.length], id: i + 1 }));
const config = {
  ...E.normalizeConfig({ scenario: E.GAME_MODES[GAME].scenarios[0], themes: ['minecraft'], durationMinutes: 30, mode: 'gamified', examType: 'individual', studentCount: N, teamSize: 1, level: 2, questionCount: 45, gameMode: GAME, scenarioKey: SCENARIO }),
  classCode: 'LOADTEST',
  tutorName: '[LOAD TEST]',
};
const saved = await saveBattle({ topic: '[LOAD TEST] trận chung giai đoạn B', config, teachingNotes: [], questions, tutorId });
if (!saved.id) throw new Error(`Không tạo được đấu trường thử: ${saved.warning}`);
const battleId = saved.id;
const code = saved.code;
log(`đấu trường thử ${code} (${battleId}), game ${GAME}/${SCENARIO}, ${N} em, chặng ${STAGE_S}s`);

const tutor = createMatchService({ store: new SupabaseMatchStore(db), broadcaster: realtimeBroadcaster(), loadBattle, session: async () => { throw new Error('unused'); } });
const opened = await tutor.create(tutorId, battleId, { stageMs: STAGE_S * 1000 });
const matchId = opened.view.id;
log(`mở trận ${matchId}`);

let hold = false; // the script holds answers around pause / end so the score check is exact
let done = false;
const msgAt = new Map(); // seq → server send time
const typeOf = new Map(); // seq → type

class Device {
  constructor(i) {
    this.i = i;
    this.key = `lt-${matchId.slice(0, 8)}-${i}`;
    this.skew = rand(-180_000, 180_000); // phone clock up to 3 min off
    this.local = () => Date.now() + this.skew;
    this.correct = 0;
    this.stars = 0;
    this.got = new Set();
    this.delays = [];
    this.syncs = []; // [time, seq] of every authoritative state received
    this.live = []; // [from, to] while subscribed
    this.liveSince = null;
    this.offline = false;
    this.sessions = 0;
    this.tags = { ok: 0, refused: 0 };
    this.errors = 0;
  }
  async session() {
    const r = await api('/api/session', { method: 'POST', body: { code, nickname: `Thử ${this.i}`, avatar: '🧪', studentKey: this.key } });
    if (r.status !== 200) throw new Error(`session ${r.status} ${JSON.stringify(r.data)}`);
    this.token = r.data.token;
    this.q = r.data.view.question;
    this.sessions += 1;
  }
  mark(snap) {
    if (snap.link === 'realtime' && this.liveSince == null) this.liveSince = Date.now();
    if (snap.link !== 'realtime' && this.liveSince != null) this.endLive();
  }
  endLive() {
    if (this.liveSince != null) this.live.push([this.liveSince, Date.now()]);
    this.liveSince = null;
  }
  async connect(join = true) {
    this.sb = createClient(SUPA_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    this.conn = await connectMatch({
      token: this.token,
      baseUrl: URL_,
      fetch: classFetch,
      supabase: this.sb,
      events: null,
      localNow: this.local,
      join: join ? {} : false,
      onChange: (s) => this.mark(s),
      onSync: (seq) => this.syncs.push([Date.now(), seq]),
      // Arrived, but a fresher state from the server was already there: delivered, not lost.
      onStale: (m) => {
        this.got.add(m.s);
        this.delays.push(Date.now() - m.at);
      },
      onMessage: (m) => {
        this.got.add(m.s);
        this.delays.push(Date.now() - m.at);
        msgAt.set(m.s, m.at);
        typeOf.set(m.s, m.t);
      },
    });
  }
  disconnect() {
    this.endLive();
    this.conn?.close();
    this.sb?.realtime.disconnect();
  }
  async answer() {
    if (!this.q) return this.renew();
    const r = await api('/api/session/answer', { method: 'POST', token: this.token, body: { questionId: this.q.id, chosenIdx: Math.floor(Math.random() * 4) } });
    if (r.status !== 200) {
      this.errors += 1;
      if (r.status === 409) await this.renew();
      return;
    }
    if (r.data.scored) {
      this.correct += r.data.scored.correct ? 1 : 0;
      this.stars += r.data.scored.stars;
    }
    this.q = r.data.view.question;
    if (GAME === 'river_survival' && r.data.scored?.correct && this.conn.snapshot().me?.team === 'pursuers' && Math.random() < 0.5) await this.tag();
    if (!this.q || r.data.view.state.phase === 'result') await this.renew();
  }
  async tag() {
    const v = this.conn.snapshot().view;
    const free = Object.entries(v?.survival?.players ?? {}).filter(([, p]) => p.team === 'escapers' && p.free && p.immuneUntil < Date.now()).map(([id]) => id);
    if (!free.length) return;
    try {
      await this.conn.act({ type: 'tag', targets: [free[Math.floor(Math.random() * free.length)]], id: randomUUID().slice(0, 12) });
      this.tags.ok += 1;
    } catch {
      this.tags.refused += 1;
    }
  }
  /** Out of questions: submit the result, new session, re-join (score and team must stay). */
  async renew() {
    await api('/api/battle-result', { method: 'POST', token: this.token, body: {} });
    const old = { conn: this.conn, sb: this.sb };
    this.endLive();
    await this.session();
    await this.connect(true);
    old.conn?.close();
    old.sb?.realtime.disconnect();
  }
  async loop() {
    await sleep(rand(0, THINK_MAX));
    while (!done) {
      await sleep(rand(THINK_MIN, THINK_MAX));
      if (done || hold || this.offline) continue;
      const v = this.conn.snapshot().view;
      const c = this.conn.clock();
      if (v?.status !== 'running' || !c || c.totalRemainingMs < 4000) continue;
      try {
        await this.answer();
      } catch (e) {
        this.errors += 1;
        log(`thiết bị ${this.i}: ${e.message}`);
      }
    }
  }
}

// --------------------------------------------------------------------------------------- join
const devices = Array.from({ length: N }, (_, i) => new Device(i));
const t0 = Date.now();
await Promise.all(
  devices.map(async (d, i) => {
    await sleep(i * 120); // a class arrives over ~6 s
    await d.session();
    await d.connect(true);
  }),
);
log(`${N} thiết bị vào phòng trong ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await sleep(3000);

// ---------------------------------------------------------------------------------------- start
const started = await tutor.control(tutorId, matchId, 'start');
const startAt = started.view.time.startedAt;
const totalMs = 6 * STAGE_S * 1000;
const teams = {};
for (const p of started.players) teams[p.team ?? '-'] = (teams[p.team ?? '-'] ?? 0) + 1;
log(`bắt đầu: ${JSON.stringify(started.view.play)} · đội ${JSON.stringify(teams)}`);
devices.forEach((d) => void d.loop());

// Clock agreement: every device (each with its own skewed clock) computes the stage and the
// seconds left at the same instant; they must agree.
const spreads = [];
let stageDisagree = 0;
const clockTimer = setInterval(() => {
  const live = devices.filter((d) => !d.offline && d.conn);
  const cs = live.map((d) => d.conn.clock()).filter(Boolean);
  if (!cs.length || cs.some((c) => c.status !== 'running')) return;
  const el = cs.map((c) => c.elapsedMs);
  spreads.push(Math.max(...el) - Math.min(...el));
  if (new Set(cs.map((c) => c.stage)).size > 1 && Math.max(...el) % (STAGE_S * 1000) > 1500) stageDisagree += 1;
}, 5000);

const at = (frac) => startAt + totalMs * frac;
const waitUntil = async (t) => {
  while (Date.now() < t) await sleep(Math.min(1000, t - Date.now()));
};

// Pause / resume at 25 %
await waitUntil(at(0.25));
hold = true;
await sleep(3000);
const pauseSent = Date.now();
await tutor.control(tutorId, matchId, 'pause');
await sleep(1500);
const sawPause = devices.filter((d) => d.conn.snapshot().view?.status === 'paused').length;
log(`tạm dừng: ${sawPause}/${N} thiết bị thấy trong 1,5 s`);
await sleep(8000);
await tutor.control(tutorId, matchId, 'resume');
const pausedMs = Date.now() - pauseSent;
await sleep(1500);
const sawResume = devices.filter((d) => d.conn.snapshot().view?.status === 'running').length;
log(`chạy lại: ${sawResume}/${N}`);
hold = false;

// B3.2: 10 devices lose the network for 20 s at 40 %
await waitUntil(at(0.4) + pausedMs);
const victims = [...devices].sort(() => Math.random() - 0.5).slice(0, OFFLINE);
const reconnect = [];
await Promise.all(
  victims.map(async (d) => {
    d.offline = true;
    d.disconnect();
    await sleep(OFFLINE_S * 1000);
    const before = { correct: d.correct, stars: d.stars };
    await d.connect(false);
    d.offline = false;
    const me = d.conn.snapshot().me;
    reconnect.push({ i: d.i, ok: me?.correct === before.correct && me?.stars === before.stars, server: { correct: me?.correct, stars: me?.stars }, local: before, link: d.conn.snapshot().link });
  }),
);
log(`mất mạng ${OFFLINE_S}s: ${reconnect.filter((r) => r.ok).length}/${OFFLINE} vào lại đúng điểm`);

// B2.8: one student script fires 100 answers in one second
await waitUntil(at(0.6) + pausedMs);
const attacker = new Device(999);
await attacker.session();
const burst = new Map();
const othersBefore = new Map([...http.get('POST /api/session/answer') ?? []]);
await Promise.all(
  Array.from({ length: 100 }, async (_, k) => {
    await sleep(k * 10);
    const r = await api('/api/session/answer', { method: 'POST', token: attacker.token, body: { questionId: attacker.q.id, chosenIdx: 0 } });
    burst.set(r.status, (burst.get(r.status) ?? 0) + 1);
  }),
);
await sleep(3000);
const answers = http.get('POST /api/session/answer') ?? new Map();
const others429 = (answers.get(429) ?? 0) - (othersBefore.get(429) ?? 0) - (burst.get(429) ?? 0);
log(`đợt 100 yêu cầu/giây: ${JSON.stringify(Object.fromEntries(burst))} · em khác bị 429: ${others429}`);

// ----------------------------------------------------------------------------------------- end
const endAt = startAt + totalMs + pausedMs;
while (Date.now() < endAt + 1500) await sleep(1000);
await tutor.tutorMatch(tutorId, { matchId }); // the tutor's screen polls: ends the match on time
await sleep(4000);
done = true;
clearInterval(clockTimer);
const sawEnd = devices.filter((d) => d.conn.snapshot().view?.status === 'ended').length;
await Promise.all(devices.map((d) => d.conn.refresh().catch(() => undefined)));
const final = await tutor.tutorMatch(tutorId, { matchId });
devices.forEach((d) => d.disconnect());

// ------------------------------------------------------------------------------------- report
const { data: rows } = await db.from('match_players').select('student_key, correct, stars, team').eq('match_id', matchId);
const byKey = new Map((rows ?? []).map((r) => [r.student_key, r]));
const scoreBad = devices.filter((d) => {
  const r = byKey.get(d.key);
  return !r || r.correct !== d.correct || r.stars !== d.stars;
});
const allSeqs = [...msgAt.keys()];
let missing = 0;
let unrecovered = 0;
let expected = 0;
const recoverMs = [];
for (const d of devices) {
  for (const s of allSeqs) {
    const t = msgAt.get(s);
    if (!d.live.some(([a, b]) => t >= a + 1000 && t <= b - 1000)) continue;
    expected += 1;
    if (d.got.has(s)) continue;
    missing += 1;
    // Missed on the channel: was it made up by a state from the server (gap refresh / poll)?
    const sync = d.syncs.find(([at, seq]) => at >= t && seq >= s);
    if (sync && sync[0] - t <= 5000) recoverMs.push(sync[0] - t);
    else unrecovered += 1;
  }
}
const delays = devices.flatMap((d) => d.delays);
const byType = {};
for (const t of typeOf.values()) byType[t] = (byType[t] ?? 0) + 1;
const dropped = devices.reduce((s, d) => s + d.conn.snapshot().dropped, 0);
const stale = devices.reduce((s, d) => s + d.conn.snapshot().stale, 0);

console.log('\n================ KẾT QUẢ THỬ TẢI TRẬN CHUNG ================');
console.log(`Trận ${matchId} · ${GAME}/${SCENARIO} · ${N} thiết bị · ${(totalMs / 60000).toFixed(1)} phút chơi + ${(pausedMs / 1000).toFixed(0)} s tạm dừng`);
console.log('HTTP:');
for (const [k, m] of [...http.entries()].sort()) console.log(`  ${k.padEnd(28)} ${JSON.stringify(Object.fromEntries(m))}`);
console.log(`Phiên chơi: ${devices.reduce((s, d) => s + d.sessions, 0)} (vào lại sau khi hết câu) · lỗi thiết bị: ${devices.reduce((s, d) => s + d.errors, 0)}`);
console.log(`Tin phát: ${allSeqs.length} (${JSON.stringify(byType)}) · nhận ${delays.length} lượt`);
console.log(`Lỡ trên kênh Realtime: ${missing}/${expected} lượt cần nhận · bù lại từ máy chủ trong ≤ 5 s: ${recoverMs.length} (chậm nhất ${Math.max(0, ...recoverMs)} ms) · không bù được: ${unrecovered}`);
console.log(`Tin bị loại vì sai chữ ký/không hợp lệ: ${dropped} · tới muộn sau trạng thái mới hơn: ${stale}`);
console.log(`Độ trễ phát tin: trung bình ${mean(delays).toFixed(0)} ms · p50 ${pct(delays, 0.5)} · p95 ${pct(delays, 0.95)} · tối đa ${Math.max(0, ...delays)} ms`);
console.log(`Đồng hồ (lệch máy ±3 phút): chênh lớn nhất giữa các máy ${Math.max(0, ...spreads)} ms qua ${spreads.length} lần đo · lệch chặng ${stageDisagree}`);
console.log(`Tạm dừng: ${sawPause}/${N} thấy trong 1,5 s · chạy lại: ${sawResume}/${N} · kết thúc: ${sawEnd}/${N} thấy trước khi hỏi lại`);
console.log(`Mất mạng ${OFFLINE_S}s: ${reconnect.filter((r) => r.ok).length}/${reconnect.length} vào lại đúng điểm ${reconnect.filter((r) => !r.ok).map((r) => JSON.stringify(r)).join(' ')}`);
console.log(`Điểm cuối (máy đếm = máy chủ): ${N - scoreBad.length}/${N} khớp ${scoreBad.map((d) => `#${d.i} máy ${d.correct}/${d.stars} chủ ${JSON.stringify(byKey.get(d.key))}`).join(' ')}`);
console.log(`Đợt 100 yêu cầu/giây: ${JSON.stringify(Object.fromEntries(burst))} · em khác bị chặn: ${others429}`);
if (GAME === 'river_survival') console.log(`Tung lưới: ${devices.reduce((s, d) => s + d.tags.ok, 0)} được, ${devices.reduce((s, d) => s + d.tags.refused, 0)} bị từ chối`);
console.log(`Kết quả trận: ${JSON.stringify(final?.view.result && { winner: final.view.result.winner, why: final.view.result.why, free: final.view.result.free, caught: final.view.result.caught, totalStars: final.view.result.totalStars })}`);
const pass = {
  'không mất tin (lỡ trên kênh thì bù lại trong 5 s)': unrecovered === 0 && dropped === 0,
  'trễ trung bình < 1 s': mean(delays) < 1000,
  'cùng chặng, cùng giây (chênh < 1 s)': Math.max(0, ...spreads) < 1000 && stageDisagree === 0,
  'mất mạng vào lại đúng điểm': reconnect.every((r) => r.ok),
  'điểm cuối khớp': scoreBad.length === 0,
  'đợt 100 req/s bị chặn, em khác không bị': (burst.get(429) ?? 0) >= 90 && others429 === 0,
};
for (const [k, v] of Object.entries(pass)) console.log(`${v ? 'ĐẠT ' : 'TRƯỢT'} ${k}`);

if (!KEEP) {
  const del = await db.from('battles').delete().eq('id', battleId);
  log(del.error ? `xoá đấu trường thử lỗi: ${del.error.message}` : 'đã xoá đấu trường thử (và trận, phiên, kết quả đi kèm)');
}
process.exit(Object.values(pass).every(Boolean) ? 0 : 1);
