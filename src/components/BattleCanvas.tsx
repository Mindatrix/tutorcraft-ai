'use client';

import { useEffect, useRef } from 'react';
import { animationFor, type AnimationProfile, type BattleEvent, type BossAvatar, type BossProfile, type MapSetting, type StoryBeat } from '../engine';

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
  event: { kind: BattleEvent; n: number; amount?: number; beats?: StoryBeat[] } | null;
  /** 2 = boss transformed (50% HP). */
  bossPhase?: 1 | 2;
  /** Boss enraged by the student's wrong streak. */
  enraged?: boolean;
  /** "Giải phóng Thần Thú" quest completed. */
  spiritBeast?: boolean;
  /** Timing / shake / camera data; defaults to the boss type's built-in profile. */
  animation?: AnimationProfile;
  /** 0..1 — MP bar; the hero glows brighter as mana builds up. */
  mpRatio?: number;
  /** 0..1 — reorder progress: the hero walks toward the boss. */
  heroAdvance?: number;
  /** 0..1 — transform "Charge Magic": an orb grows above the hero's sword. */
  charge?: number;
  /** Reading "Eye of Truth Trial": the boss holds a defensive stance until the answer is in. */
  bossGuard?: boolean;
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
    camera: null as { start: number; zoom: number; durationMs: number; focus: 'hero' | 'boss' | 'center' } | null,
    hitstopUntil: 0,
    sceneT: 0,
    advDisp: 0,
    chargeDisp: 0,
    mpDisp: 0,
    beamStart: -1e9,
    beamUntil: -1e9,
    phaseFlash: 0,
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
    const prof = propsRef.current.animation ?? animationFor(propsRef.current.boss.boss_avatar);
    const zoom = (spec: AnimationProfile['camera']['critical']) => {
      if (!a.reduced && spec.zoom > 1) a.camera = { start: now(), ...spec };
    };
    // Story beats land on impact: transformation, enrage taunt, quest fanfare.
    const playBeats = () => {
      for (const b of ev.beats ?? []) {
        const boss = propsRef.current.boss;
        if (b.kind === 'phase') {
          a.dialogue = { text: boss.phase2_dialogue, until: now() + 3400 };
          a.phaseFlash = now() + 500;
          zoom(prof.camera.phase);
          burst(bossPos, '#e879f9', 40, 260);
          float({ x: bossPos.x, y: bossPos.y - h * 0.32 }, 'PHASE 2!', '#f0abfc', 24);
        } else if (b.kind === 'enrage') {
          a.dialogue = { text: boss.enrage_dialogue, until: now() + 3400 };
          burst(bossPos, '#f97316', 26, 200);
        } else if (b.kind === 'quest') {
          burst(heroPos, '#34d399', 24, 180);
          float({ x: heroPos.x, y: heroPos.y - h * 0.38 }, '🏅 QUEST!', '#6ee7b7', 20);
        }
      }
    };

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

    if (ev.kind === 'miss') {
      // Wrong matching pair: the boss parries, no HP lost.
      a.bossFlash = t + 90;
      burst({ x: bossPos.x - h * 0.12, y: bossPos.y - h * 0.1 }, '#94a3b8', 10, 140);
      float({ x: bossPos.x - h * 0.1, y: bossPos.y - h * 0.3 }, '✖ BLOCK', '#cbd5e1', 18);
      shake(3, 150);
    } else if (ev.kind === 'correct' || ev.kind === 'critical' || ev.kind === 'ultimate') {
      const ultimate = ev.kind === 'ultimate';
      const crit = ev.kind === 'critical' || ultimate;
      if (ultimate) {
        // Ultimate Skill: a sustained energy beam from hero to boss.
        a.beamStart = t + prof.heroAttack.windupMs;
        a.beamUntil = a.beamStart + 750;
        a.sparkleUntil = t + 1200;
        a.sparkleColor = '#fde68a';
      }
      a.heroLunge = t;
      a.inFlight += 1;
      a.projectiles.push({
        from: 'hero', start: t + prof.heroAttack.windupMs, dur: prof.heroAttack.travelMs, color: crit ? '#facc15' : '#38bdf8',
        onHit: () => {
          a.inFlight -= 1;
          syncTargets();
          a.hitstopUntil = now() + prof.heroAttack.hitstopMs;
          a.bossFlash = now() + 160;
          burst(bossPos, crit ? '#facc15' : '#7dd3fc', crit ? 28 : 16);
          float({ x: bossPos.x, y: bossPos.y - h * 0.22 }, ultimate ? `TUYỆT KỸ! -${ev.amount ?? ''}` : crit ? `CRITICAL! -${ev.amount ?? ''}` : `-${ev.amount ?? ''}`, ultimate ? '#fde68a' : crit ? '#facc15' : '#ffffff', ultimate ? 30 : crit ? 26 : 20);
          if (ultimate) burst(bossPos, '#fef3c7', 40, 320);
          if (crit) {
            shake(prof.shake.critical.magnitude, prof.shake.critical.durationMs);
            zoom(prof.camera.critical);
          }
          if (propsRef.current.bossHp <= 0 && a.defeatStart === null) {
            a.defeatStart = now();
            zoom(prof.camera.bossBreak);
          }
          playBeats();
        },
      });
    } else if (ev.kind === 'wrong' || ev.kind === 'blocked') {
      const blocked = ev.kind === 'blocked';
      a.bossLunge = t;
      a.inFlight += 1;
      a.dialogue = { text: propsRef.current.boss.boss_dialogue_on_attack, until: t + 2600 };
      a.projectiles.push({
        from: 'boss', start: t + prof.bossAttack.windupMs, dur: prof.bossAttack.travelMs, color: propsRef.current.bossPhase === 2 ? '#e879f9' : colors.shot,
        onHit: () => {
          a.inFlight -= 1;
          syncTargets();
          a.hitstopUntil = now() + prof.bossAttack.hitstopMs;
          if (blocked) {
            burst(heroPos, '#60a5fa', 14, 160);
            float({ x: heroPos.x, y: heroPos.y - h * 0.25 }, 'BLOCKED!', '#93c5fd', 20);
          } else {
            a.heroFlash = now() + 220;
            burst(heroPos, '#f87171', 14, 180);
            float({ x: heroPos.x, y: heroPos.y - h * 0.25 }, `-${ev.amount ?? ''}`, '#f87171', 22);
            shake(prof.shake.playerHit.magnitude, prof.shake.playerHit.durationMs);
            if (propsRef.current.hp <= 0 && a.koStart === null) a.koStart = now();
          }
          playBeats();
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
      // Hitstop: freeze the world for a few frames on impact so hits feel heavy.
      const dt = t < a.hitstopUntil ? 0 : Math.min(0.05, (t - last) / 1000);
      last = t;
      a.sceneT += dt * 1000;
      const st = a.sceneT;
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
      // Dynamic camera: ease in and back out toward the focus point.
      if (a.camera) {
        const k = (t - a.camera.start) / a.camera.durationMs;
        if (k >= 1) a.camera = null;
        else {
          const z = 1 + (a.camera.zoom - 1) * Math.sin(Math.PI * Math.max(0, k));
          const fx = a.camera.focus === 'hero' ? w * 0.22 : a.camera.focus === 'boss' ? w * 0.74 : w / 2;
          const fy = groundY - h * 0.25;
          ctx.translate(fx, fy);
          ctx.scale(z, z);
          ctx.translate(-fx, -fy);
        }
      }
      drawMap(ctx, p.boss.map_setting, w, h, groundY, st);

      // Hero
      // Smoothly follow reorder progress / charge / MP (props jump, the scene glides).
      a.advDisp += ((p.heroAdvance ?? 0) - a.advDisp) * Math.min(1, dt * 5);
      a.chargeDisp += ((p.charge ?? 0) - a.chargeDisp) * Math.min(1, dt * 6);
      a.mpDisp += ((p.mpRatio ?? 0) - a.mpDisp) * Math.min(1, dt * 4);
      const heroBase = { x: w * 0.22 + w * 0.26 * a.advDisp, y: groundY };
      if (a.mpDisp > 0.05) drawManaAura(ctx, heroBase.x, groundY - Math.min(h * 0.3, w * 0.14) * 0.6, Math.min(h * 0.3, w * 0.14), st, a.mpDisp);
      const heroLungeT = (t - a.heroLunge) / 450;
      const heroOffset = heroLungeT >= 0 && heroLungeT <= 1 ? Math.sin(heroLungeT * Math.PI) * w * 0.09 : 0;
      const koT = a.koStart === null ? 0 : ease((t - a.koStart) / 700);
      drawHero(ctx, heroBase.x + heroOffset, heroBase.y, Math.min(h * 0.3, w * 0.14), st, p.heroAvatar, t < a.heroFlash, p.shield, koT, heroLungeT);
      if (p.spiritBeast && koT === 0) drawSpiritBeast(ctx, heroBase.x - w * 0.09, groundY - h * 0.42, Math.min(h, w) * 0.09, st);
      if (a.chargeDisp > 0.02 && koT === 0) {
        const hs = Math.min(h * 0.3, w * 0.14);
        glow(ctx, heroBase.x + heroOffset + hs * 0.35, groundY - hs * 1.25, hs * (0.06 + 0.16 * a.chargeDisp) * (1 + Math.sin(st / 120) * 0.08), '#c4b5fd', 0.55 + 0.45 * a.chargeDisp);
      }

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
        const bx = bossBase.x + bossOffset;
        if (p.bossPhase === 2 || p.enraged) drawAura(ctx, bx, bossBase.y - s * 0.8, s, st, p.enraged ? '#f97316' : '#d946ef');
        // Phase 2: the boss grows and changes palette.
        const grow = p.bossPhase === 2 ? 1.14 : 1;
        drawBoss(ctx, p.boss.boss_avatar, bx, bossBase.y, s * grow, st, t < a.bossFlash || t < a.phaseFlash, p.bossPhase === 2);
        if (p.bossGuard && dT < 0) drawGuard(ctx, bx, bossBase.y - s * 0.75, s * grow, st);
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

      // Ultimate Skill beam (matching: every pair connected)
      if (t >= a.beamStart && t <= a.beamUntil) {
        const k = (t - a.beamStart) / Math.max(1, a.beamUntil - a.beamStart);
        const hs = Math.min(h * 0.3, w * 0.14);
        const x1 = heroBase.x + hs * 0.35;
        const y1 = groundY - hs * 0.9;
        const x2 = bossBase.x;
        const y2 = groundY - s * 0.75;
        const width = hs * (0.12 + 0.18 * Math.sin(Math.PI * k));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        g.addColorStop(0, '#fde68a');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, '#34d399');
        ctx.strokeStyle = g;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#fde68a';
        ctx.shadowBlur = 24;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.lineWidth = width * 0.35;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
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
      drawBar(ctx, w - 12 - w * 0.42, 10, w * 0.42, p.bossPhase === 2 ? p.boss.phase2_name : p.boss.boss_name, a.bossDisp, a.bossGhost, p.bossMax, p.bossPhase === 2 ? '#a21caf' : '#dc2626', p.bossPhase === 2 ? '#f0abfc' : '#fb7185', 'right');

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
  // Idle: eased bob + gentle breathing (squash & stretch from the feet).
  const bob = ko > 0 ? 0 : Math.sin(t / 320) * 2.2;
  const breath = ko > 0 ? 1 : 1 + Math.sin(t / 520) * 0.018;
  ctx.translate(x, y);
  ctx.scale(2 - breath, breath);
  ctx.translate(-x, -y);
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

const PHASE2_BODY: Record<BossAvatar, string> = { dragon: '#4c1d95', golem: '#44403c', wizard: '#831843', shadow_king: '#3b0764' };

function drawBoss(ctx: CanvasRenderingContext2D, avatar: BossAvatar, x: number, y: number, s: number, t: number, flash: boolean, phase2 = false) {
  const base = BOSS_COLORS[avatar] ?? BOSS_COLORS.dragon;
  // Idle blink every ~3.4 s: eyes go dark for a few frames.
  const blink = t % 3400 < 120;
  const tone = phase2 ? { ...base, body: PHASE2_BODY[avatar] ?? base.body, eye: '#f43f5e' } : base;
  const c = blink ? { ...tone, eye: 'rgba(0,0,0,0)' } : tone;
  // Idle breathing: slow vertical swell from the feet.
  const swell = 1 + Math.sin(t / 640) * 0.022;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1 / Math.sqrt(swell), swell);
  ctx.translate(-x, -y);
  drawBossBody(ctx, avatar, x, y, s, t, flash, c);
  ctx.restore();
}

function drawBossBody(ctx: CanvasRenderingContext2D, avatar: BossAvatar, x: number, y: number, s: number, t: number, flash: boolean, c: { body: string; accent: string; eye: string; shot: string }) {
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

function drawAura(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, color: string) {
  ctx.save();
  const r = s * (1.1 + Math.sin(t / 180) * 0.06);
  const g = ctx.createRadialGradient(x, y, s * 0.2, x, y, r);
  g.addColorStop(0, `${color}66`);
  g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpiritBeast(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const bob = Math.sin(t / 300) * s * 0.25;
  glow(ctx, x, y + bob, s * 0.55, '#fde68a', 0.35);
  ctx.save();
  ctx.font = `${Math.round(s * 1.1)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🦁', x, y + bob);
  ctx.restore();
}

/** Mana glow around the hero: brighter and wider as MP builds; sparks orbit above 50%. */
function drawManaAura(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, mp: number) {
  ctx.save();
  const r = s * (0.55 + 0.35 * mp) * (1 + Math.sin(t / 260) * 0.04);
  const g = ctx.createRadialGradient(x, y, s * 0.1, x, y, r);
  g.addColorStop(0, `rgba(56,189,248,${0.32 * mp})`);
  g.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (mp >= 0.5) {
    for (let i = 0; i < 4; i++) {
      const ang = t / 380 + (i * Math.PI) / 2;
      glow(ctx, x + Math.cos(ang) * r * 0.85, y + Math.sin(ang) * r * 0.5, 2.2, '#7dd3fc', 0.8);
    }
  }
}

/** Reading trial: a shimmering shield dome in front of the boss. */
function drawGuard(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  ctx.save();
  const pulse = 0.5 + 0.5 * Math.sin(t / 300);
  ctx.strokeStyle = `rgba(103,232,249,${0.45 + 0.35 * pulse})`;
  ctx.fillStyle = `rgba(34,211,238,${0.08 + 0.06 * pulse})`;
  ctx.lineWidth = 3;
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.95, s * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#a5f3fc';
  ctx.fillText('🛡 THỦ THẾ NGÀN NĂM', x, y - s * 1.12);
  ctx.restore();
}
