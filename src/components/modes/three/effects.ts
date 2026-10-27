'use client';

import * as THREE from 'three';
import { Sparks } from '../kit';

// Shared effects (plan C3.1): bubbles (fx_bubbles), water splash, right / wrong answer bursts and
// end-of-match fireworks, plus play(recipe) for the named effects of content/consequences_v2.json
// (smoke, fire, dust, glitch, puff, burst, sparkle; see engine/director.ts effectRecipe). Two pooled instanced particle systems (one additive for light, one
// normal for water and puffs) = 2 draw calls whatever plays; update() reports its own time so the
// scene lab can check the 2 ms per frame budget.

interface Rocket {
  p: THREE.Vector3;
  v: THREE.Vector3;
  fuse: number;
  color: THREE.Color;
}

const FIREWORK_COLORS = [0xffd166, 0xef476f, 0x06d6a0, 0x118ab2, 0xf78c6b, 0xc77dff];

export class Effects {
  readonly group = new THREE.Group();
  private light: Sparks;
  private matter: Sparks;
  private rockets: Rocket[] = [];
  private sources: { at: THREE.Vector3; rate: number; acc: number; until: number; emit: (at: THREE.Vector3) => void }[] = [];
  private clock = 0;
  /** Milliseconds spent in the last update(). */
  lastMs = 0;

  constructor(opts: { max?: number } = {}) {
    const max = opts.max ?? 400;
    this.light = new Sparks(max, new THREE.IcosahedronGeometry(0.07, 0), true);
    this.matter = new Sparks(Math.round(max * 0.75), new THREE.IcosahedronGeometry(0.06, 1), false);
    this.group.add(this.light.mesh, this.matter.mesh);
    this.group.name = 'effects';
  }

  /** Bubbles rising from a spot for `seconds` (fish under the boat, a diver, a cauldron). */
  bubbles(at: THREE.Vector3, seconds = 2, rate = 14) {
    this.source(at, seconds, rate, (p) =>
      this.matter.emit(p, 1, { color: 0xe0f7ff, speed: 0.25, up: 1.1, gravity: -1.2, drag: 0.8, life: 1.6, size: 0.9, spread: new THREE.Vector3(0.5, 0, 0.5) }),
    );
  }

  /** Something that keeps emitting for a while (bubbles, smoke, a fire). */
  private source(at: THREE.Vector3, seconds: number, rate: number, emit: (at: THREE.Vector3) => void) {
    this.sources.push({ at: at.clone(), rate, acc: 0, until: this.clock + seconds, emit });
  }

  /** A named effect from consequences_v2.json, by its recipe (kind, colour, strength). */
  play(r: { kind: string; color: number; strength: number }, at: THREE.Vector3) {
    const s = r.strength;
    const n = (k: number) => Math.max(1, Math.round(k * s));
    switch (r.kind) {
      case 'splash':
        return this.splash(at, s);
      case 'bubbles':
        return this.bubbles(at, 2 * s);
      case 'fireworks':
        return this.fireworks(at, n(5));
      case 'burst':
        this.light.emit(at, n(26), { color: r.color, speed: 2.4, up: 2.2, gravity: 2.5, life: 0.9, size: 1.2 });
        this.light.emit(at, n(10), { color: 0xffffff, speed: 1.4, up: 2.6, gravity: 1, life: 0.8, size: 0.7 });
        return;
      case 'puff':
        this.matter.emit(at, n(18), { color: r.color, speed: 0.9, up: 0.8, gravity: -0.6, drag: 2.5, life: 1, size: 1.6 });
        return;
      case 'smoke':
        return this.source(at, 1.4 * s, 18, (p) =>
          this.matter.emit(p, 1, { color: r.color, speed: 0.3, up: 1.3, gravity: -0.8, drag: 1, life: 1.8, size: 2, spread: new THREE.Vector3(0.4, 0, 0.4) }),
        );
      case 'fire':
        return this.source(at, 1.4 * s, 30, (p) =>
          this.light.emit(p, 1, { color: Math.random() < 0.5 ? r.color : 0xffd166, speed: 0.4, up: 1.8, gravity: -0.5, drag: 1.2, life: 0.8, size: 1.1, spread: new THREE.Vector3(0.35, 0, 0.35) }),
        );
      case 'glitch':
        for (let i = 0; i < 3; i++) this.light.emit(at, n(14), { color: i === 1 ? 0x22d3ee : r.color, speed: 3.5, up: 0, gravity: 0, drag: 4, life: 0.35 + i * 0.15, size: 1.4 });
        return;
      case 'dust':
        this.matter.emit(at, n(24), { color: r.color, speed: 1.8, up: 0.6, gravity: 1.2, drag: 2, life: 1.1, size: 1.5, spread: new THREE.Vector3(0.8, 0, 0.8) });
        return;
      default:
        this.light.emit(at, n(16), { color: r.color, speed: 1, up: 1.4, gravity: 0.4, life: 1.1, size: 0.7, spread: new THREE.Vector3(0.6, 0.4, 0.6) });
    }
  }

  splash(at: THREE.Vector3, strength = 1) {
    this.matter.emit(at, Math.round(26 * strength), { color: 0xd9f4ff, speed: 2.6 * strength, up: 3.2 * strength, gravity: 9, life: 0.9, size: 1.1, spread: new THREE.Vector3(0.6, 0, 0.6) });
    this.matter.emit(at, Math.round(10 * strength), { color: 0x7fd3f7, speed: 1.2, up: 1.2, gravity: 6, life: 0.6, size: 0.8 });
  }

  correct(at: THREE.Vector3) {
    this.light.emit(at, 24, { color: 0xffe066, speed: 2.4, up: 2.2, gravity: 2.5, life: 0.9, size: 1.2 });
    this.light.emit(at, 14, { color: 0x6ee7b7, speed: 1.6, up: 3, gravity: 1, life: 1.1, size: 0.9 });
  }

  wrong(at: THREE.Vector3) {
    this.matter.emit(at, 18, { color: 0x9ca3af, speed: 0.9, up: 0.8, gravity: -0.6, drag: 2.5, life: 1.0, size: 1.6 });
    this.light.emit(at, 8, { color: 0xf87171, speed: 1.4, up: 0.5, gravity: 2, life: 0.5, size: 0.8 });
  }

  /** A short show over `center` (end of match): rockets climb, then burst. */
  fireworks(center: THREE.Vector3, rockets = 6) {
    for (let i = 0; i < rockets; i++) {
      const c = new THREE.Color(FIREWORK_COLORS[i % FIREWORK_COLORS.length]);
      this.rockets.push({
        p: center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 4)),
        v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 11 + Math.random() * 4, (Math.random() - 0.5) * 1.5),
        fuse: 0.9 + Math.random() * 0.6 + i * 0.25,
        color: c,
      });
    }
  }

  /** Advance everything; returns (and stores in lastMs) the milliseconds it took. */
  update(dt: number): number {
    const t0 = performance.now();
    this.clock += dt;
    for (const s of this.sources) {
      s.acc += s.rate * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        s.emit(s.at);
      }
    }
    this.sources = this.sources.filter((s) => s.until > this.clock);
    for (const r of this.rockets) {
      r.fuse -= dt;
      r.v.y -= 9 * dt;
      r.p.addScaledVector(r.v, dt);
      if (r.fuse > 0) this.light.emit(r.p, 1, { color: 0xfff1c9, speed: 0.2, up: 0, gravity: 2, life: 0.35, size: 0.7 });
      else {
        this.light.emit(r.p, 60, { color: r.color, speed: 6.5, up: 0.5, gravity: 2.2, drag: 1.2, life: 1.5, size: 1.3 });
        this.light.emit(r.p, 18, { color: 0xffffff, speed: 3, up: 0, gravity: 1.5, life: 0.8, size: 0.8 });
      }
    }
    this.rockets = this.rockets.filter((r) => r.fuse > 0);
    this.light.update(dt);
    this.matter.update(dt);
    this.lastMs = performance.now() - t0;
    return this.lastMs;
  }

  dispose() {
    this.group.removeFromParent();
    for (const s of [this.light, this.matter]) {
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
      s.mesh.dispose();
    }
  }
}
