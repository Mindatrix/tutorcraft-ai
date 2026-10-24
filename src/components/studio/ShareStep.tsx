'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, MessageCircle, Plus, RefreshCw, BarChart3, AlertTriangle } from 'lucide-react';
import type { TeamRace } from '../../engine';
import type { PublishedBattle } from './types';

interface Diagnostics {
  participants?: number;
  teams?: TeamRace | null;
  diagnostics: { topic: string; skill_tag: string; attempts: number; wrong: number; failRate: number }[];
  leaderboard: { nickname: string; avatar: string; gems: number; accuracy: number }[];
}

export default function ShareStep({ battle, onNew }: { battle: PublishedBattle; onNew: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Code link when the code column/config exists; direct id link otherwise.
  const joinLink = battle.code ? `${origin}/student/play?code=${battle.code}` : `${origin}/student/${battle.battle_id}`;
  const invite = `⚔️ Đấu trường "${battle.lessonTitle}" đã mở!${battle.code ? ` Mã tham gia: ${battle.code}.` : ''} Vào chiến ngay: ${joinLink}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinLink, { width: 480, margin: 1, color: { dark: '#020617', light: '#ffffff' } })
      .then((url) => !cancelled && setQr(url))
      .catch(() => !cancelled && setQr(null));
    return () => {
      cancelled = true;
    };
  }, [joinLink]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const copy = async (text: string, msg = 'Đã sao chép!') => {
    try {
      await navigator.clipboard.writeText(text);
      flash(msg);
    } catch {
      flash('Không sao chép được — hãy chọn và sao chép thủ công.');
    }
  };

  // On phones the native share sheet lists Zalo. On desktop: copy the invite and open Zalo Web.
  const shareZalo = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TutorCraft Đấu trường', text: invite, url: joinLink });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copy(invite, 'Đã chép lời mời — dán vào nhóm Zalo của lớp.');
    window.open('https://chat.zalo.me/', '_blank', 'noopener');
  };

  const loadDiagnostics = async (silent = false) => {
    if (!silent) setDiagLoading(true);
    try {
      const res = await fetch(`/api/battle-result?battleId=${battle.battle_id}`);
      setDiag(await res.json());
    } catch {
      /* keep the last board when the network blips */
    } finally {
      setDiagLoading(false);
    }
  };

  // Live board for team races: refresh every 6 s while the tutor keeps this screen open.
  useEffect(() => {
    if (!diag?.teams) return;
    const t = setInterval(() => void loadDiagnostics(true), 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!diag?.teams, battle.battle_id]);

  return (
    <div className="space-y-5">
      {battle.warning && <p className="text-sm text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> {battle.warning}</p>}

      <section className="bg-gradient-to-br from-blue-900/50 to-indigo-900/40 border border-blue-500/40 rounded-2xl p-6 text-center space-y-4">
        <div className="text-sm font-bold text-blue-300 uppercase tracking-wider">Mã Đấu trường</div>
        {battle.code ? (
          <button onClick={() => copy(battle.code!)} className="text-5xl md:text-6xl font-black tracking-[0.25em] text-white font-mono hover:text-amber-300" aria-label={`Mã ${battle.code}, bấm để sao chép`}>
            {battle.code}
          </button>
        ) : (
          <p className="text-sm text-slate-300">Chưa có mã ngắn (cần chạy supabase/schema.sql). Học sinh dùng link hoặc QR bên dưới.</p>
        )}
        <p className="text-sm text-slate-300">Học sinh vào trang chủ, nhập mã — hoặc quét QR.</p>

        {qr && (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated on the client */}
            <img src={qr} alt={`QR tham gia đấu trường ${battle.code ?? ''}`} width={220} height={220} className="rounded-xl bg-white p-2" />
            <a href={qr} download={`dau-truong-${battle.code ?? battle.battle_id}.png`} className="text-xs text-blue-300 hover:text-white flex items-center gap-1"><Download className="w-3.5 h-3.5" /> Tải ảnh QR</a>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md mx-auto">
          <button onClick={shareZalo} className="py-3 rounded-xl font-bold bg-[#0068ff] hover:bg-[#1a78ff] flex items-center justify-center gap-2">
            <MessageCircle className="w-5 h-5" /> Chia sẻ qua Zalo
          </button>
          <button onClick={() => copy(joinLink, 'Đã sao chép link!')} className="py-3 rounded-xl font-bold border border-slate-600 hover:bg-slate-800 flex items-center justify-center gap-2">
            <Copy className="w-4 h-4" /> Sao chép link
          </button>
        </div>
        {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
      </section>

      {battle.variants.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
          <h2 className="font-bold text-emerald-400">🛡️ Mã đề chống gian lận</h2>
          <p className="text-xs text-slate-400">Gửi mỗi nhóm học sinh ngồi cạnh nhau một mã đề khác — thứ tự câu hỏi và đáp án được xáo trộn.</p>
          {battle.variants.map((v) => {
            const link = `${joinLink}${joinLink.includes('?') ? '&' : '?'}v=${v}`;
            return (
              <div key={v} className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-amber-400 shrink-0">Mã {v}</span>
                <input readOnly value={link} className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono text-xs" />
                <button onClick={() => copy(link)} className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold shrink-0"><Copy className="w-4 h-4" /></button>
              </div>
            );
          })}
        </section>
      )}

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-rose-400 flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Chẩn đoán lỗ hổng kiến thức</h2>
          <button onClick={() => loadDiagnostics()} className="text-sm flex items-center gap-1 text-slate-300 hover:text-white"><RefreshCw className={`w-4 h-4 ${diagLoading ? 'animate-spin' : ''}`} /> Tải</button>
        </div>
        {!diag && <p className="text-sm text-slate-500">Sau khi học sinh làm bài, bấm “Tải” để xem chủ điểm bị sai nhiều nhất và bảng xếp hạng.</p>}
        {diag && diag.diagnostics.length === 0 && <p className="text-sm text-slate-500">{diag.participants ? 'Chưa phát hiện điểm yếu.' : 'Chưa có học sinh nộp bài.'}</p>}
        {diag?.diagnostics.map((d) => (
          <div key={d.topic} className="text-sm">
            <div className="flex justify-between"><span>{d.topic} <span className="text-xs text-slate-500">({d.skill_tag})</span></span><span className="text-rose-400 font-mono">{Math.round(d.failRate * 100)}% sai</span></div>
            <div className="h-2 bg-slate-950 rounded-full overflow-hidden mt-1"><div className="h-full bg-rose-500" style={{ width: `${d.failRate * 100}%` }} /></div>
          </div>
        ))}
        {diag?.teams && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {diag.teams.teams.map((t) => (
              <div key={t.team} className={`rounded-xl border p-3 ${t.team === 'A' ? 'border-sky-500/40' : 'border-orange-500/40'} ${diag.teams!.winner === t.team ? 'bg-emerald-500/10' : ''}`}>
                <div className="text-sm font-bold">{diag.teams!.winner === t.team ? '🏆 ' : ''}{t.name}</div>
                <div className="text-xs text-slate-400">{t.members.length} người · {t.distance.toFixed(1)} chặng/người</div>
                <ul className="text-xs text-slate-300 mt-1 space-y-0.5">{t.members.map((m, i) => <li key={i}>{m.avatar} {m.nickname} · {m.correct}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
        {diag && diag.leaderboard.length > 0 && (
          <ol className="text-sm space-y-1 pt-2">
            {diag.leaderboard.map((r, i) => (
              <li key={i} className="flex justify-between bg-slate-950 rounded-lg px-3 py-1.5"><span>{i + 1}. {r.avatar} {r.nickname}</span><span className="font-mono text-amber-400">{r.gems} 💎 · {Math.round(r.accuracy * 100)}%</span></li>
            ))}
          </ol>
        )}
      </section>

      <button onClick={onNew} className="w-full py-3 rounded-xl font-bold border border-slate-700 hover:bg-slate-800 flex items-center justify-center gap-2">
        <Plus className="w-4 h-4" /> Tạo đấu trường mới
      </button>
    </div>
  );
}
