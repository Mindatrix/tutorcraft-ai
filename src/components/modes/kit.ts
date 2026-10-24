import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { THREE_ASSET_MANIFEST, THREE_DEFAULTS, assetOr } from '../../config/threeAssets';
import { prefersReducedMotion } from './gfx';

export { BEVEL_CLIP, canUseWebGL, prefersReducedMotion } from './gfx';

// Shared toolkit for the 5 game worlds: renderer + loop with the FPS guard,
// stylized materials, gradient skies, text sprites, spark bursts, GLB swap-in.
// Everything here is purely visual — the server owns answers, damage and Boss HP.

const GFX = THREE_ASSET_MANIFEST.graphicsSettings;
const FPS_MIN = assetOr(GFX.fpsFallbackThreshold, THREE_DEFAULTS.fpsFallbackThreshold);
const FPS_WINDOW = assetOr(GFX.fpsFallbackWindowMs, THREE_DEFAULTS.fpsFallbackWindowMs);
const MAX_DPR = assetOr(GFX.maxPixelRatio, THREE_DEFAULTS.maxPixelRatio);

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t: number) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** Frame-rate independent smoothing toward a target. */
export const damp = (cur: number, target: number, lambda: number, dt: number) => lerp(cur, target, 1 - Math.exp(-lambda * dt));

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}


export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  size: { w: number; h: number };
  reduced: boolean;
  /** Camera shake: call shake(strength 0..1, seconds). */
  shake: (mag: number, sec: number) => void;
  run: (frame: (dt: number, t: number) => void) => void;
  dispose: () => void;
}

export interface StageOptions {
  fov?: number;
  near?: number;
  far?: number;
  background?: THREE.ColorRepresentation | null;
  /** Called once if WebGL dies or FPS stays under the threshold for the whole window. */
  onSlow?: () => void;
}

/** Creates renderer + scene + camera inside `el`. Throws if WebGL is unavailable. */
export function createStage(el: HTMLElement, opts: StageOptions = {}): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: opts.background === null, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  if (opts.background !== null && opts.background !== undefined) scene.background = new THREE.Color(opts.background);
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 50, 2, opts.near ?? 0.1, opts.far ?? 400);
  const size = { w: 600, h: 300 };
  const reduced = prefersReducedMotion();

  const resize = () => {
    size.w = el.clientWidth || 600;
    size.h = el.clientHeight || 300;
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  let slowFired = false;
  const slow = () => {
    if (slowFired) return;
    slowFired = true;
    opts.onSlow?.();
  };
  const lost = (e: Event) => {
    e.preventDefault();
    slow();
  };
  canvas.addEventListener('webglcontextlost', lost);

  const shakeState = { until: 0, mag: 0, dur: 1 };
  let raf = 0;
  let alive = true;
  const clock = new THREE.Clock();

  return {
    renderer,
    scene,
    camera,
    size,
    reduced,
    shake: (mag, sec) => {
      if (reduced) return;
      const t = clock.getElapsedTime();
      shakeState.mag = Math.max(shakeState.until > t ? shakeState.mag : 0, mag);
      shakeState.until = t + sec;
      shakeState.dur = sec;
    },
    run(frame) {
      let fpsFrames = 0;
      let fpsStart = 0;
      let slowSince = -1;
      const tick = () => {
        if (!alive) return;
        raf = requestAnimationFrame(tick);
        const raw = clock.getDelta();
        const t = clock.getElapsedTime();
        // A hidden tab pauses rAF: ignore that gap for animation and for the FPS guard.
        const dt = raw > 0.25 ? 1 / 60 : raw;
        if (raw > 0.5) {
          fpsFrames = 0;
          fpsStart = t;
          slowSince = -1;
        } else if (t > 2.5) {
          // Skip the first seconds (shader compile / asset upload).
          fpsFrames++;
          if (t - fpsStart >= 1) {
            const fps = fpsFrames / (t - fpsStart);
            fpsFrames = 0;
            fpsStart = t;
            if (fps < FPS_MIN) {
              if (slowSince < 0) slowSince = t - 1;
              if ((t - slowSince) * 1000 >= FPS_WINDOW) slow();
            } else slowSince = -1;
          }
        } else fpsStart = t;
        frame(dt, t);
        let ox = 0;
        let oy = 0;
        if (shakeState.until > t) {
          const k = ((shakeState.until - t) / shakeState.dur) * shakeState.mag * 0.35;
          ox = (Math.random() - 0.5) * k;
          oy = (Math.random() - 0.5) * k;
          camera.position.x += ox;
          camera.position.y += oy;
        }
        renderer.render(scene, camera);
        camera.position.x -= ox;
        camera.position.y -= oy;
      };
      tick();
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      disposeObject(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

let toonRamp: THREE.DataTexture | null = null;
function ramp(): THREE.DataTexture {
  if (toonRamp) return toonRamp;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  toonRamp = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  toonRamp.minFilter = THREE.NearestFilter;
  toonRamp.magFilter = THREE.NearestFilter;
  toonRamp.needsUpdate = true;
  return toonRamp;
}

/** Cartoon shading for characters. */
export function toon(color: THREE.ColorRepresentation, emissive: THREE.ColorRepresentation = 0x000000, emissiveIntensity = 1): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: ramp(), emissive, emissiveIntensity });
}

/** Faceted low-poly look for props and terrain. */
export function lowpoly(color: THREE.ColorRepresentation, o: { rough?: number; metal?: number; emissive?: THREE.ColorRepresentation; glow?: number; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.glow ?? 1,
  });
  if (o.opacity !== undefined && o.opacity < 1) {
    m.transparent = true;
    m.opacity = o.opacity;
    m.depthWrite = false;
  }
  return m;
}

/** Unlit glowing material (not affected by tone mapping, good for neon / magic). */
export function glow(color: THREE.ColorRepresentation, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1 || additive,
    opacity,
    toneMapped: false,
    depthWrite: !additive && opacity >= 1,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, at?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  if (at) m.position.set(at[0], at[1], at[2]);
  return m;
}

/** Jitter vertices for a hand-made low-poly feel (deterministic). */
export function roughen<T extends THREE.BufferGeometry>(geo: T, amount: number, seed = 1): T {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const offsets = new Map<string, [number, number, number]>();
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647 - 0.5) * 2;
  };
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (!offsets.has(k)) offsets.set(k, [rnd() * amount, rnd() * amount, rnd() * amount]);
    const o = offsets.get(k)!;
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Sky, text, canvas textures
// ---------------------------------------------------------------------------

/** Big inverted sphere with a 3-stop vertical gradient (+ optional stars). */
export function skyDome(top: THREE.ColorRepresentation, horizon: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation, o: { radius?: number; stars?: number } = {}): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      uTop: { value: new THREE.Color(top) },
      uHorizon: { value: new THREE.Color(horizon) },
      uBottom: { value: new THREE.Color(bottom) },
      uStars: { value: o.stars ?? 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform float uStars;
      varying vec3 vDir;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.6));
        if (uStars > 0.0 && h > 0.05) {
          vec3 cell = floor(vDir * 180.0);
          float s = step(1.0 - 0.0035 * uStars, hash(cell));
          c += vec3(s) * smoothstep(0.05, 0.4, h);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 180, 32, 16), mat);
  m.renderOrder = -100;
  m.frustumCulled = false;
  return m;
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Wrap text into at most `maxLines` lines that fit `maxWidth`. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/** Camera-facing label. `height` = world units. */
export function textSprite(text: string, o: { color?: string; bg?: string; height?: number; weight?: number; border?: string } = {}): THREE.Sprite {
  const font = `${o.weight ?? 800} 56px "Be Vietnam Pro", system-ui, sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text).width);
  const w = tw + 48;
  const h = 84;
  const tex = canvasTexture(w, h, (ctx) => {
    if (o.bg) {
      ctx.fillStyle = o.bg;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(w - 14, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w - 14, h);
      ctx.lineTo(14, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      ctx.fill();
      if (o.border) {
        ctx.strokeStyle = o.border;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
    }
    ctx.font = font;
    ctx.fillStyle = o.color ?? '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  const height = o.height ?? 0.5;
  sprite.scale.set((height * w) / h, height, 1);
  return sprite;
}

// ---------------------------------------------------------------------------
// Spark bursts (one InstancedMesh, pooled)
// ---------------------------------------------------------------------------

interface Spark { alive: boolean; p: THREE.Vector3; v: THREE.Vector3; life: number; age: number; size: number; gravity: number; drag: number }

export class Sparks {
  readonly mesh: THREE.InstancedMesh;
  private pool: Spark[] = [];
  private cursor = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private color = new THREE.Color();

  constructor(count = 160, geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.08, 0), additive = true) {
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.pool.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 1, age: 0, size: 1, gravity: 0, drag: 1 });
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.color.set(0xffffff));
    }
  }

  emit(at: THREE.Vector3, n: number, o: { color?: THREE.ColorRepresentation; speed?: number; life?: number; size?: number; gravity?: number; up?: number; spread?: THREE.Vector3; drag?: number; dir?: THREE.Vector3 } = {}) {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.pool.length;
      const sp = this.pool[i];
      sp.alive = true;
      sp.age = 0;
      sp.life = (o.life ?? 0.7) * (0.7 + Math.random() * 0.6);
      sp.size = (o.size ?? 1) * (0.6 + Math.random() * 0.8);
      sp.gravity = o.gravity ?? 6;
      sp.drag = o.drag ?? 1.5;
      sp.p.copy(at);
      if (o.spread) sp.p.add(new THREE.Vector3((Math.random() - 0.5) * o.spread.x, (Math.random() - 0.5) * o.spread.y, (Math.random() - 0.5) * o.spread.z));
      const sp0 = o.speed ?? 3;
      sp.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(sp0 * (0.4 + Math.random() * 0.8));
      sp.v.y += o.up ?? 1.5;
      if (o.dir) sp.v.addScaledVector(o.dir, 1);
      this.mesh.setColorAt(i, this.color.set(o.color ?? 0xffffff));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.pool.length; i++) {
      const sp = this.pool[i];
      if (!sp.alive) continue;
      sp.age += dt;
      if (sp.age >= sp.life) {
        sp.alive = false;
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      sp.v.y -= sp.gravity * dt;
      sp.v.multiplyScalar(Math.exp(-sp.drag * dt));
      sp.p.addScaledVector(sp.v, dt);
      const k = sp.age / sp.life;
      const sc = sp.size * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      this.s.setScalar(Math.max(0, sc));
      this.m.compose(sp.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// GLB swap-in: when the Founder fills a model URL in threeAssets.ts
// ---------------------------------------------------------------------------

const gltf = new GLTFLoader();
const glbCache = new Map<string, Promise<THREE.Group>>();

export function loadGlb(url: string): Promise<THREE.Group> {
  if (!glbCache.has(url)) glbCache.set(url, gltf.loadAsync(url).then((g) => g.scene));
  return glbCache.get(url)!;
}

/**
 * Replace the procedural children of `holder` with a .glb model (scaled to `height`).
 * Keeps the procedural model if the URL is empty or the file fails to load.
 */
export function swapInGlb(holder: THREE.Object3D, url: string | null, height: number, isAlive: () => boolean = () => true): void {
  if (!url) return;
  loadGlb(url)
    .then((src) => {
      if (!isAlive()) return;
      const model = src.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y || 1;
      model.scale.setScalar(height / h);
      model.position.y = -box.min.y * (height / h);
      for (const c of [...holder.children]) {
        if (c.userData.keep) continue;
        holder.remove(c);
        disposeObject(c);
      }
      holder.add(model);
    })
    .catch(() => {});
}

/** Pointer position in normalized device coords. */
export function ndc(e: PointerEvent | MouseEvent, el: HTMLElement): THREE.Vector2 {
  const r = el.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}
