'use client';

import { useEffect, useRef } from 'react';
import type { BattleEvent, BossAvatar, BossProfile, MapSetting } from '../engine';

// 2D canvas battle scene: hero vs boss, smooth HP drain, attack VFX, floating
// damage numbers, screen shake, boss dialogue, boss shatter and gacha chest drop.
// Everything is drawn procedurally — no image assets to download.

export interface BattleCanvasProps {
  boss: BossProfile;
  heroAvatar: string;
  heroName: string;
  bossHp: number;
  bossMax: number;
  hp: number;
  hpMax: number;
  shield: boolean;
  event: { kind: BattleEvent; n: number; amount?: number } | null;
}

type Vec = { x: number; y: number };
interface Particle { x: number; y: number; vx: number; vy: number; color: string; born: number; life: number; size: number }
interface Floater { x: number; y: number; text: string; color: string; size: number; born: number; life: number }
interface Projectile { from: 'hero' | 'boss'; start: number; dur: number; color: string; onHit: () => void; done?: boolean }

const BOSS_COLORS: Record<BossAvatar, { body: string; accent: string; eye: string; shot: string }> = {
  dragon: { body: '#b91c1c', accent: '#f97316', eye: '#fde047', shot: '#fb923c' },
  golem: { body: '#78716c', accent: '#a8a29e', eye: '#22d3ee', shot: '#d6d3d1' },
  wizard: { body: '#6d28d9', accent: '#a78bfa', eye: '#f0abfc', shot: '#c084fc' },
  shadow_king: { body: '#1e1b4b', accent: '#facc15', eye: '#ef4444', shot: '#8b5cf6' },
};

const MAPS: Record<MapSetting, { sky: [string, string]; ground: string; detail: string }> = {
  forest: { sky: ['#052e16', '#166534'], ground: '#14532d', detail: '#22c55e' },
  castle: { sky: ['#0f172a', '#334155'], ground: '#475569', detail: '#94a3b8' },
  volcano: { sky: ['#1c0505', '#7c2d12'], ground: '#292524', detail: '#f97316' },
  ice_cave: { sky: ['#082f49', '#0e7490'], ground: '#bae6fd', detail: '#e0f2fe' },
  dungeon: { sky: ['#09090b', '#27272a'], ground: '#3f3f46', detail: '#f59e0b' },
  sky_arena: { sky: ['#1e3a8a', '#60a5fa'], ground: '#f1f5f9', detail: '#ffffff' },
};

const now = () => performance.now();
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export default function BattleCanvas(props: BattleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  const lastEvent = useRef<number | null>(props.event?.n ?? null);

  // Mutable animation state, kept out of React so the loop runs at 60fps without re-rendering.
  const anim = useRef({
    bossDisp: props.bossHp, bossGhost: props.bossHp, bossTarget: props.bossHp,
    heroDisp: props.hp, heroGhost: props.hp, heroTarget: props.hp,
    inFlight: 0,
    particles: [] as Particle[],
    floaters: [] as Floater[],
    projectiles: [] as Projectile[],
    shakeUntil: 0, shakeMag: 0,
    heroLunge: -1e9, bossLunge: -1e9,
    bossFlash: 0, heroFlash: 0,
    dialogue: null as { text: string; until: number } | null,
    defeatStart: props.bossHp <= 0 ? -1e9 : null as number | null,
    chest: props.bossHp <= 0 ? { y: 0, vy: 0, landed: true } : null as { y: number; vy: number; landed: boolean } | null,
    koStart: props.hp <= 0 ? -1e9 : null as number | null,
    sparkleUntil: 0, sparkleColor: '#facc15',
    reduced: false,
    size: { w: 600, h: 260 },
  });

  useEffect(() => {
    propsRef.current = props;
  });

  // Turn reducer events into animations.
  useEffect(() => {
    const ev = props.event;
    if (!ev || ev.n === lastEvent.current) return;
    lastEvent.current = ev.n;
    const a = anim.current;
    const t = now();
    const { w, h } = a.size;
    const heroPos = { x: w * 0.22, y: h * 0.62 };
    const bossPos = { x: w * 0.74, y: h * 0.52 };
    const colors = BOSS_COLORS[propsRef.current.boss.boss_avatar];

    const burst = (p: Vec, color: string, n: number, speed = 220) => {
      const count = a.reduced ? Math.ceil(n / 3) : n;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        a.particles.push({ x: p.x, y: p.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - 80, color, born: t, life: 600 + Math.random() * 400, size: 2 + Math.random() * 3 });
      }
    };
    const float = (p: Vec, text: string, color: string, size: number) =>
      a.floaters.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y, text, color, size, born: now(), life: 1100 });
    const shake = (mag: number, ms: number) => {
      if (a.reduced) return;
      a.shakeMag = mag;
      a.shakeUntil = now() + ms;
    };
    const syncTargets = () => {
      a.bossTarget = propsRef.current.bossHp;
      a.heroTarget = propsRef.current.hp;
    };

    if (ev.kind === 'correct' || ev.kind === 'critical') {
      const crit = ev.kind === 'critical';
      a.heroLunge = t;
      a.inFlight += 1;
      a.projectiles.push({
        from: 'hero', start: t + 150, dur: 320, color: crit ? '#facc15' : '#38bdf8',
        onHit: () => {
          a.inFlight -= 1;
          syncTargets();
          a.bossFlash = now() + 160;
          burst(bossPos, crit ? '#facc15' : '#7dd3fc', crit ? 28 : 16);
          float({ x: bossPos.x, y: bossPos.y - h * 0.22 }, crit ? `CRITICAL! -${ev.amount ?? ''}` : `-${ev.amount ?? ''}`, crit ? '#facc15' : '#ffffff', crit ? 26 : 20);
          if (crit) shake(5, 220);
          if (propsRef.current.bossHp <= 0 && a.defeatStart === null) a.defeatStart = now();
        },
      });
    } else if (ev.kind === 'wrong' || ev.kind === 'blocked') {
      const blocked = ev.kind === 'blocked';
      a.bossLunge = t;
      a.inFlight += 1;
      a.dialogue = { text: propsRef.current.boss.boss_dialogue_on_attack, until: t + 2600 };
      a.projectiles.push({
        from: 'boss', start: t + 200, dur: 380, color: colors.shot,
        onHit: () => {
          a.inFlight -= 1;
          syncTargets();
          if (blocked) {
            burst(heroPos, '#60a5fa', 14, 160);
            float({ x: heroPos.x, y: heroPos.y - h * 0.25 }, 'BLOCKED!', '#93c5fd', 20);
          } else {
            a.heroFlash = now() + 220;
            burst(heroPos, '#f87171', 14, 180);
            float({ x: heroPos.x, y: heroPos.y - h * 0.25 }, `-${ev.amount ?? ''}`, '#f87171', 22);
            shake(12, 380);
            if (propsRef.current.hp <= 0 && a.koStart === null) a.koStart = now();
          }
        },
      });
    } else if (ev.kind === 'skill' || ev.kind === 'buff') {
      a.sparkleUntil = t + 900;
      a.sparkleColor = ev.kind === 'buff' ? '#facc15' : '#a5f3fc';
      burst({ x: heroPos.x, y: heroPos.y - h * 0.1 }, a.sparkleColor, 18, 120);
      float({ x: heroPos.x, y: heroPos.y - h * 0.3 }, ev.kind === 'buff' ? 'MIRACLE!' : 'SKILL!', a.sparkleColor, 18);
    }
  }, [props.event]);

  // Render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const a = anim.current;
    a.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const w = wrap.clientWidth;
      const h = Math.round(Math.min(300, Math.max(210, w * 0.48)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      a.size = { w, h };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = now();
    const frame = () => {
      const t = now();
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const p = propsRef.current;
      const { w, h } = a.size;

      // Restarted battle: reset the scene.
      if (p.bossHp >= p.bossMax && a.defeatStart !== null && a.inFlight === 0) {
        a.defeatStart = null;
        a.chest = null;
      }
      if (p.hp >= p.hpMax && a.koStart !== null) a.koStart = null;
      if (a.inFlight === 0) {
        a.bossTarget = p.bossHp;
        a.heroTarget = p.hp;
      }
      if (a.inFlight === 0 && p.bossHp <= 0 && a.defeatStart === null) a.defeatStart = t;

      // Smooth HP drain: bar eases to target, a pale "ghost" bar trails behind.
      a.bossDisp += (a.bossTarget - a.bossDisp) * Math.min(1, dt * 7);
      a.heroDisp += (a.heroTarget - a.heroDisp) * Math.min(1, dt * 7);
      if (Math.abs(a.bossTarget - a.bossDisp) < 0.5) a.bossDisp = a.bossTarget;
      if (Math.abs(a.heroTarget - a.heroDisp) < 0.5) a.heroDisp = a.heroTarget;
      a.bossGhost = a.bossTarget > a.bossGhost ? a.bossTarget : a.bossGhost + (a.bossDisp - a.bossGhost) * Math.min(1, dt * 1.6);
      a.heroGhost = a.heroTarget > a.heroGhost ? a.heroTarget : a.heroGhost + (a.heroDisp - a.heroGhost) * Math.min(1, dt * 1.6);

      ctx.save();
      if (t < a.shakeUntil) {
        const k = (a.shakeUntil - t) / 380;
        ctx.translate((Math.random() - 0.5) * a.shakeMag * 2 * k, (Math.random() - 0.5) * a.shakeMag * 2 * k);
      }

      const groundY = h * 0.8;
      drawMap(ctx, p.boss.map_setting, w, h, groundY, t);

      // Hero
      const heroBase = { x: w * 0.22, y: groundY };
      const heroLungeT = (t - a.heroLunge) / 450;
      const heroOffset = heroLungeT >= 0 && heroLungeT <= 1 ? Math.sin(heroLungeT * Math.PI) * w * 0.09 : 0;
      const koT = a.koStart === null ? 0 : ease((t - a.koStart) / 700);
      drawHero(ctx, heroBase.x + heroOffset, heroBase.y, Math.min(h * 0.3, w * 0.14), t, p.heroAvatar, t < a.heroFlash, p.shield, koT, heroLungeT);

      // Boss
      const s = Math.min(h * 0.34, w * 0.17);
      const bossBase = { x: w * 0.74, y: groundY };
      const bossLungeT = (t - a.bossLunge) / 500;
      const bossOffset = bossLungeT >= 0 && bossLungeT <= 1 ? -Math.sin(bossLungeT * Math.PI) * w * 0.06 : 0;
      const dT = a.defeatStart === null ? -1 : (t - a.defeatStart) / 1000;
      if (dT < 1.6) {
        ctx.save();
        if (dT > 0.6) {
          const fall = ease((dT - 0.6) / 1.0);
          ctx.globalAlpha = 1 - fall;
          ctx.translate(bossBase.x, bossBase.y);
          ctx.rotate(fall * 0.9);
          ctx.translate(-bossBase.x, -bossBase.y + fall * s * 0.3);
        }
        drawBoss(ctx, p.boss.boss_avatar, bossBase.x + bossOffset, bossBase.y, s, t, t < a.bossFlash);
        if (dT >= 0) drawCracks(ctx, bossBase.x, bossBase.y - s * 0.7, s, Math.min(1, dT / 0.6));
        ctx.restore();
        if (dT > 0.6 && dT - dt <= 0.6) {
          for (let i = 0; i < (a.reduced ? 10 : 36); i++) {
            const ang = Math.random() * Math.PI * 2;
            a.particles.push({ x: bossBase.x, y: bossBase.y - s * 0.7, vx: Math.cos(ang) * 260, vy: Math.sin(ang) * 260 - 120, color: BOSS_COLORS[p.boss.boss_avatar].body, born: t, life: 1200, size: 4 + Math.random() * 5 });
          }
          if (!a.reduced) { a.shakeMag = 10; a.shakeUntil = t + 400; }
        }
      }
      if (dT >= 1.4 && !a.chest) a.chest = { y: -40, vy: 0, landed: false };
      if (a.chest) {
        if (!a.chest.landed) {
          a.chest.vy += 1400 * dt;
          a.chest.y += a.chest.vy * dt;
          if (a.chest.y >= groundY) {
            a.chest.y = groundY;
            a.chest.vy = -a.chest.vy * 0.35;
            if (Math.abs(a.chest.vy) < 60) a.chest.landed = true;
          }
        }
        drawChest(ctx, bossBase.x, a.chest.landed ? groundY : a.chest.y, s * 0.55, t);
      }

      // Projectiles
      for (const pr of a.projectiles) {
        const k = (t - pr.start) / pr.dur;
        if (k < 0 || pr.done) continue;
        const from = pr.from === 'hero' ? { x: heroBase.x + w * 0.05, y: groundY - h * 0.22 } : { x: bossBase.x - s * 0.5, y: groundY - s * 0.9 };
        const to = pr.from === 'hero' ? { x: bossBase.x, y: groundY - s * 0.7 } : { x: heroBase.x, y: groundY - h * 0.2 };
        if (k >= 1) {
          pr.done = true;
          pr.onHit();
          continue;
        }
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * h * 0.12;
        glow(ctx, x, y, 9, pr.color);
        for (let i = 1; i <= 4; i++) {
          const kk = Math.max(0, k - i * 0.05);
          glow(ctx, from.x + (to.x - from.x) * kk, from.y + (to.y - from.y) * kk - Math.sin(kk * Math.PI) * h * 0.12, 9 - i * 1.8, pr.color, 0.5 - i * 0.1);
        }
      }
      a.projectiles = a.projectiles.filter((pr) => !pr.done);

      // Sparkles around the hero (skills / buffs)
      if (t < a.sparkleUntil) {
        for (let i = 0; i < 6; i++) {
          const ang = t / 200 + (i * Math.PI) / 3;
          glow(ctx, heroBase.x + Math.cos(ang) * h * 0.16, groundY - h * 0.18 + Math.sin(ang) * h * 0.12, 3, a.sparkleColor);
        }
      }

      // Particles
      a.particles = a.particles.filter((pt) => t - pt.born < pt.life);
      for (const pt of a.particles) {
        pt.vy += 500 * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        ctx.globalAlpha = 1 - (t - pt.born) / pt.life;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;

      // Floating damage numbers
      a.floaters = a.floaters.filter((f) => t - f.born < f.life);
      for (const f of a.floaters) {
        const k = (t - f.born) / f.life;
        const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
        ctx.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
        ctx.font = `900 ${Math.round(f.size * pop)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(f.text, f.x, f.y - k * 50);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y - k * 50);
      }
      ctx.globalAlpha = 1;

      // Boss dialogue bubble
      if (a.dialogue && t < a.dialogue.until && (a.defeatStart === null)) {
        drawBubble(ctx, a.dialogue.text, bossBase.x - s * 0.2, groundY - s * 1.55, Math.min(w * 0.5, 260));
      }

      ctx.restore();

      // HP bars (not shaken)
      drawBar(ctx, 12, 10, w * 0.42, p.heroName, a.heroDisp, a.heroGhost, p.hpMax, '#10b981', '#34d399', 'left');
      drawBar(ctx, w - 12 - w * 0.42, 10, w * 0.42, p.boss.boss_name, a.bossDisp, a.bossGhost, p.bossMax, '#dc2626', '#fb7185', 'right');

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950">
      <canvas
        ref={canvasRef}
        className="block w-full"
        role="img"
        aria-label={`${props.heroName} ${Math.round(props.hp)}/${props.hpMax} HP đối đầu ${props.boss.boss_name} ${Math.round(props.bossHp)}/${props.bossMax} HP`}
      />
    </div>
  );
}

// ---------- drawing helpers ----------

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1) {
  if (r <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMap(ctx: CanvasRenderingContext2D, map: MapSetting, w: number, h: number, groundY: number, t: number) {
  const m = MAPS[map] ?? MAPS.dungeon;
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, m.sky[0]);
  g.addColorStop(1, m.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, w + 40, groundY + 20);

  ctx.save();
  switch (map) {
    case 'forest':
      for (let i = 0; i < 9; i++) {
        const x = (i / 8) * w;
        const th = h * (0.25 + ((i * 37) % 10) / 40);
        ctx.fillStyle = i % 2 ? '#14532d' : '#166534';
        ctx.beginPath();
        ctx.moveTo(x - th * 0.35, groundY);
        ctx.lineTo(x, groundY - th);
        ctx.lineTo(x + th * 0.35, groundY);
        ctx.fill();
      }
      for (let i = 0; i < 8; i++) glow(ctx, ((i * 97 + t / 40) % w), groundY - h * 0.2 - Math.sin(t / 600 + i) * 20, 1.8, '#bef264', 0.7);
      break;
    case 'castle':
      ctx.fillStyle = '#1e293b';
      for (let i = 0; i < 5; i++) {
        const x = (i / 4) * w - 20;
        const tw = w * 0.1;
        const th = h * (0.3 + (i % 2) * 0.12);
        ctx.fillRect(x, groundY - th, tw, th);
        for (let c = 0; c < 3; c++) ctx.fillRect(x + c * (tw / 2.5), groundY - th - 8, tw / 5, 8);
      }
      glow(ctx, w * 0.85, h * 0.18, 14, '#fef9c3', 0.9);
      break;
    case 'volcano':
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.moveTo(w * 0.3, groundY);
      ctx.lineTo(w * 0.5, groundY - h * 0.45);
      ctx.lineTo(w * 0.58, groundY - h * 0.45);
      ctx.lineTo(w * 0.8, groundY);
      ctx.fill();
      glow(ctx, w * 0.54, groundY - h * 0.46, 10, '#f97316', 0.8 + Math.sin(t / 300) * 0.2);
      for (let i = 0; i < 10; i++) {
        const y = groundY - ((t / 12 + i * 47) % (h * 0.8));
        glow(ctx, (i * 61) % w, y, 1.6, '#fdba74', 0.8);
      }
      break;
    case 'ice_cave':
      ctx.fillStyle = '#cffafe';
      for (let i = 0; i < 14; i++) {
        const x = (i / 13) * w;
        const ih = h * (0.08 + ((i * 13) % 7) / 50);
        ctx.beginPath();
        ctx.moveTo(x - 8, 0);
        ctx.lineTo(x, ih);
        ctx.lineTo(x + 8, 0);
        ctx.fill();
      }
      for (let i = 0; i < 12; i++) glow(ctx, (i * 83 + t / 30) % w, ((t / 25 + i * 53) % groundY), 1.5, '#ffffff', 0.8);
      break;
    case 'dungeon':
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      for (let y = 0; y < groundY; y += 22) {
        for (let x = (y / 22) % 2 ? 0 : 20; x < w; x += 40) ctx.strokeRect(x, y, 40, 22);
      }
      glow(ctx, w * 0.08, h * 0.35, 6 + Math.sin(t / 90) * 1.5, '#f59e0b');
      glow(ctx, w * 0.92, h * 0.35, 6 + Math.cos(t / 110) * 1.5, '#f59e0b');
      break;
    case 'sky_arena':
      for (let i = 0; i < 5; i++) {
        const x = ((i * 170 + t / 30) % (w + 120)) - 60;
        const y = h * (0.15 + (i % 3) * 0.12);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.ellipse(x, y, 40, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 22, y - 6, 24, 12, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
  }
  ctx.restore();

  ctx.fillStyle = m.ground;
  ctx.fillRect(-20, groundY, w + 40, h - groundY + 20);
  ctx.fillStyle = m.detail;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(-20, groundY, w + 40, 3);
  ctx.globalAlpha = 1;
}

function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, avatar: string, flash: boolean, shield: boolean, ko: number, lungeT: number) {
  ctx.save();
  if (ko > 0) {
    ctx.translate(x, y);
    ctx.rotate(-ko * 1.4);
    ctx.translate(-x, -y);
    ctx.globalAlpha = 1 - ko * 0.4;
  }
  const bob = ko > 0 ? 0 : Math.sin(t / 300) * 2;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, s * 0.35, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs + body
  ctx.fillStyle = flash ? '#fecaca' : '#1d4ed8';
  ctx.fillRect(x - s * 0.18, y - s * 0.32, s * 0.12, s * 0.32);
  ctx.fillRect(x + s * 0.06, y - s * 0.32, s * 0.12, s * 0.32);
  ctx.fillStyle = flash ? '#fca5a5' : '#2563eb';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.25, y - s * 0.8 + bob, s * 0.5, s * 0.52, s * 0.1);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - s * 0.25, y - s * 0.5 + bob, s * 0.5, s * 0.06);
  // sword
  const swing = lungeT >= 0 && lungeT <= 1 ? Math.sin(lungeT * Math.PI) * 1.6 : 0;
  ctx.save();
  ctx.translate(x + s * 0.28, y - s * 0.55 + bob);
  ctx.rotate(-0.6 + swing);
  ctx.fillStyle = '#e5e7eb';
  ctx.fillRect(-s * 0.03, -s * 0.55, s * 0.06, s * 0.55);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(-s * 0.1, -s * 0.02, s * 0.2, s * 0.06);
  ctx.restore();
  // head = student's pet avatar
  ctx.font = `${Math.round(s * 0.5)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(avatar, x, y - s * 0.98 + bob);
  ctx.textBaseline = 'alphabetic';
  if (shield) {
    ctx.strokeStyle = 'rgba(96,165,250,0.9)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#60a5fa';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.6, s * 0.75 + Math.sin(t / 200) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBoss(ctx: CanvasRenderingContext2D, avatar: BossAvatar, x: number, y: number, s: number, t: number, flash: boolean) {
  const c = BOSS_COLORS[avatar] ?? BOSS_COLORS.dragon;
  const body = flash ? '#ffffff' : c.body;
  const bob = Math.sin(t / 400) * s * 0.03;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, s * 0.7, s * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (avatar) {
    case 'dragon': {
      const flap = Math.sin(t / 180) * 0.35;
      ctx.fillStyle = flash ? '#fff' : c.accent;
      for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(x + dir * s * 0.1, y - s * 0.9 + bob);
        ctx.rotate(dir * (0.3 + flap));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(dir * s * 0.9, -s * 0.55);
        ctx.lineTo(dir * s * 0.7, s * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = body;
      ctx.lineWidth = s * 0.14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + s * 0.4, y - s * 0.4);
      ctx.quadraticCurveTo(x + s * 0.95, y - s * 0.2, x + s * 0.9, y - s * 0.75 + Math.sin(t / 250) * s * 0.08);
      ctx.stroke();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.55 + bob, s * 0.55, s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#fca5a5';
      ctx.beginPath();
      ctx.ellipse(x - s * 0.1, y - s * 0.45 + bob, s * 0.3, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(x - s * 0.5, y - s * 1.0 + bob, s * 0.32, s * 0.24, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      for (const hx of [-0.45, -0.62]) {
        ctx.beginPath();
        ctx.moveTo(x + hx * s, y - s * 1.18 + bob);
        ctx.lineTo(x + (hx + 0.1) * s, y - s * 1.45 + bob);
        ctx.lineTo(x + (hx + 0.12) * s, y - s * 1.15 + bob);
        ctx.fill();
      }
      glow(ctx, x - s * 0.6, y - s * 1.03 + bob, s * 0.05, c.eye);
      break;
    }
    case 'golem': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.roundRect(x - s * 0.5, y - s * 1.15 + bob, s, s * 0.8, s * 0.12);
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : c.accent;
      ctx.beginPath();
      ctx.roundRect(x - s * 0.3, y - s * 1.55 + bob, s * 0.6, s * 0.42, s * 0.1);
      ctx.fill();
      ctx.fillStyle = body;
      const arm = Math.sin(t / 350) * s * 0.05;
      ctx.beginPath();
      ctx.roundRect(x - s * 0.82, y - s * 1.05 + bob + arm, s * 0.3, s * 0.75, s * 0.1);
      ctx.roundRect(x + s * 0.52, y - s * 1.05 + bob - arm, s * 0.3, s * 0.75, s * 0.1);
      ctx.fill();
      ctx.fillRect(x - s * 0.4, y - s * 0.38, s * 0.28, s * 0.38);
      ctx.fillRect(x + s * 0.12, y - s * 0.38, s * 0.28, s * 0.38);
      glow(ctx, x - s * 0.12, y - s * 1.36 + bob, s * 0.06, c.eye);
      glow(ctx, x + s * 0.12, y - s * 1.36 + bob, s * 0.06, c.eye);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.2, y - s * 1.1 + bob);
      ctx.lineTo(x, y - s * 0.85 + bob);
      ctx.lineTo(x - s * 0.1, y - s * 0.6 + bob);
      ctx.stroke();
      break;
    }
    case 'wizard': {
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.2 + bob);
      ctx.lineTo(x - s * 0.55, y);
      ctx.lineTo(x + s * 0.55, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#fde68a';
      ctx.beginPath();
      ctx.arc(x, y - s * 1.2 + bob, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(x - s * 0.15, y - s * 1.12 + bob);
      ctx.lineTo(x, y - s * 0.75 + bob);
      ctx.lineTo(x + s * 0.15, y - s * 1.12 + bob);
      ctx.fill();
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.32, y - s * 1.3 + bob);
      ctx.lineTo(x + s * 0.1, y - s * 2.0 + bob);
      ctx.lineTo(x + s * 0.32, y - s * 1.3 + bob);
      ctx.fill();
      glow(ctx, x - s * 0.07, y - s * 1.24 + bob, s * 0.035, c.eye);
      glow(ctx, x + s * 0.07, y - s * 1.24 + bob, s * 0.035, c.eye);
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y);
      ctx.lineTo(x - s * 0.6, y - s * 1.5 + bob);
      ctx.stroke();
      glow(ctx, x - s * 0.6, y - s * 1.55 + bob, s * (0.1 + Math.sin(t / 200) * 0.02), c.accent);
      break;
    }
    case 'shadow_king': {
      const aura = ctx.createRadialGradient(x, y - s * 0.8, s * 0.2, x, y - s * 0.8, s * 1.2);
      aura.addColorStop(0, 'rgba(139,92,246,0.45)');
      aura.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(x - s * 1.3, y - s * 2.1, s * 2.6, s * 2.2);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, y - s * 1.2 + bob);
      for (let i = 0; i <= 6; i++) {
        const px = x - s * 0.65 + (i / 6) * s * 1.3;
        ctx.lineTo(px, y - (i % 2 ? s * 0.08 : 0) + Math.sin(t / 200 + i) * 3);
      }
      ctx.lineTo(x + s * 0.3, y - s * 1.2 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = flash ? '#fff' : '#0f0a1e';
      ctx.beginPath();
      ctx.arc(x, y - s * 1.28 + bob, s * 0.28, 0, Math.PI * 2);
      ctx.fill();
      glow(ctx, x - s * 0.1, y - s * 1.3 + bob, s * 0.05, c.eye);
      glow(ctx, x + s * 0.1, y - s * 1.3 + bob, s * 0.05, c.eye);
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.26, y - s * 1.5 + bob);
      for (let i = 0; i <= 4; i++) ctx.lineTo(x - s * 0.26 + (i / 4) * s * 0.52, y - s * (i % 2 ? 1.62 : 1.8) + bob);
      ctx.lineTo(x + s * 0.26, y - s * 1.5 + bob);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawCracks(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, k: number) {
  ctx.save();
  ctx.strokeStyle = '#fef08a';
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const len = s * 0.7 * k;
    ctx.lineTo(x + Math.cos(ang) * len * 0.5 + 6, y + Math.sin(ang) * len * 0.5);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y - s * 0.4, 2, x, y - s * 0.4, s * 1.4);
  g.addColorStop(0, `rgba(250,204,21,${0.45 + Math.sin(t / 250) * 0.15})`);
  g.addColorStop(1, 'rgba(250,204,21,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - s * 1.5, y - s * 1.9, s * 3, s * 2.2);
  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.55, y - s * 0.6, s * 1.1, s * 0.6, 4);
  ctx.fill();
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.roundRect(x - s * 0.55, y - s * 0.95, s * 1.1, s * 0.4, [s * 0.3, s * 0.3, 2, 2]);
  ctx.fill();
  ctx.fillStyle = '#facc15';
  ctx.fillRect(x - s * 0.55, y - s * 0.6, s * 1.1, s * 0.07);
  ctx.fillRect(x - s * 0.08, y - s * 0.7, s * 0.16, s * 0.24);
  ctx.restore();
}

function drawBubble(ctx: CanvasRenderingContext2D, text: string, cx: number, bottom: number, maxW: number) {
  ctx.save();
  ctx.font = '600 13px system-ui, sans-serif';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW - 20 && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  const bw = Math.min(maxW, Math.max(...shown.map((l) => ctx.measureText(l).width)) + 20);
  const bh = shown.length * 17 + 12;
  const bx = Math.max(6, Math.min(cx - bw / 2, ctx.canvas.clientWidth - bw - 6));
  const by = Math.max(46, bottom - bh);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + 10, by + bh);
  ctx.lineTo(cx + 22, by + bh + 10);
  ctx.lineTo(cx + 24, by + bh);
  ctx.fill();
  ctx.fillStyle = '#7f1d1d';
  ctx.textAlign = 'left';
  shown.forEach((l, i) => ctx.fillText(l, bx + 10, by + 20 + i * 17));
  ctx.restore();
}

function drawBar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string,
  value: number, ghost: number, max: number, c1: string, c2: string, align: 'left' | 'right',
) {
  ctx.save();
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = align;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 4;
  const tx = align === 'left' ? x : x + w;
  const hpText = `${Math.max(0, Math.round(value))}/${max}`;
  // Truncate the name so it never runs into the HP numbers on narrow screens.
  const room = w - ctx.measureText(`${max}/${max}`).width - 10;
  let name = label;
  if (ctx.measureText(name).width > room) {
    while (name.length > 1 && ctx.measureText(`${name}…`).width > room) name = name.slice(0, -1);
    name = `${name.trimEnd()}…`;
  }
  ctx.fillText(name, tx, y + 11);
  ctx.textAlign = align === 'left' ? 'right' : 'left';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(hpText, align === 'left' ? x + w : x, y + 11);
  ctx.shadowBlur = 0;
  const by = y + 16;
  ctx.fillStyle = 'rgba(2,6,23,0.8)';
  ctx.beginPath();
  ctx.roundRect(x, by, w, 10, 5);
  ctx.fill();
  const pct = (v: number) => Math.max(0, Math.min(1, v / (max || 1)));
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(align === 'left' ? x : x + w * (1 - pct(ghost)), by, w * pct(ghost), 10, 5);
  ctx.fill();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(align === 'left' ? x : x + w * (1 - pct(value)), by, w * pct(value), 10, 5);
  ctx.fill();
  ctx.restore();
}
