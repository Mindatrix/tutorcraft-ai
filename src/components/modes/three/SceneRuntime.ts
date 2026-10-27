'use client';

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { THREE_ASSET_MANIFEST, THREE_DEFAULTS, assetOr } from '../../../config/threeAssets';
import { hdri, hdriSize } from '../../../config/assetLibrary';
import { prefersReducedMotion } from '../gfx';
import { CameraDirector } from './cameraDirector';

// The shared core of every 3D world (plan C1.1): renderer, camera, outdoor light rig, HDRI or
// gradient sky, the frame loop with the automatic quality ladder (C1.2), stats and a clean
// teardown that also gives the WebGL context back (browsers keep only ~16 alive, so 10 trips in
// and out of a game used to exhaust them). kit.ts createStage() is a thin wrapper on this, so
// Multiverse and Kayak run on the same core.
//
// Quality ladder: start on the tier the page asks for ('high' unless this device was marked);
// measure the frame rate in seconds 1.5–4.5; too slow on 'high' → switch to 'low' in place
// (pixel ratio 1, no shadows, gradient sky, no environment map) and tell the scene; still under
// the threshold for 5 s on 'low' → onSlow (the page falls back to the 2D canvas).

export type GfxTier = 'high' | 'low';

const GFX = THREE_ASSET_MANIFEST.graphicsSettings;
const FPS_MIN = assetOr(GFX.fpsFallbackThreshold, THREE_DEFAULTS.fpsFallbackThreshold);
const FPS_WINDOW = assetOr(GFX.fpsFallbackWindowMs, THREE_DEFAULTS.fpsFallbackWindowMs);
const MAX_DPR = assetOr(GFX.maxPixelRatio, THREE_DEFAULTS.maxPixelRatio);
const PROBE_FROM = 1.5;
const PROBE_TO = 4.5;

export const TIER_SETTINGS: Record<GfxTier, { maxDpr: number; shadows: boolean; hdri: boolean }> = {
  high: { maxDpr: MAX_DPR, shadows: true, hdri: true },
  low: { maxDpr: 1, shadows: false, hdri: false },
};

export interface RuntimeOptions {
  tier?: GfxTier;
  fov?: number;
  near?: number;
  far?: number;
  background?: THREE.ColorRepresentation | null;
  /** 'outdoor' adds a sky/ground hemisphere light and a sun (casting shadows on the high tier). */
  lights?: 'outdoor' | 'none';
  /** HDRI key (dawn, day, sunset, night, cloudy): 2K on the high tier, a gradient dome on 'low'. */
  sky?: { hdri?: string; gradient?: [THREE.ColorRepresentation, THREE.ColorRepresentation, THREE.ColorRepresentation] };
  fog?: { color: THREE.ColorRepresentation; near: number; far: number };
  /**
   * 'auto' (default): the frame-rate probe runs in seconds 1.5–4.5. 'manual': it waits for
   * armProbe(), for scenes that stream many models first (decoding makes the first seconds slow
   * on any device, which would wrongly mark a fast one as weak).
   */
  probe?: 'auto' | 'manual';
  /** Cap on the device pixel ratio below the tier's (weak-device mode: 0.75). */
  maxPixelRatio?: number;
  /** The probe found the high tier too slow: the runtime already switched to 'low'. */
  onLowQuality?: () => void;
  /** WebGL lost, or still too slow on 'low': show the 2D canvas instead. */
  onSlow?: () => void;
}

export interface RuntimeStats {
  fps: number;
  /** Draw calls and triangles of the last frame. */
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  /** Average JS + render time per frame over the last second (ms). */
  frameMs: number;
  tier: GfxTier;
  /** Estimated GPU memory (MB): textures (incl. sky, environment, shadow map) and geometry. */
  textureMB: number;
  geometryMB: number;
  /** Device pixel ratio actually rendered. */
  pixelRatio: number;
}

export interface SceneRuntime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  size: { w: number; h: number };
  reduced: boolean;
  readonly tier: GfxTier;
  hemi: THREE.HemisphereLight | null;
  sun: THREE.DirectionalLight | null;
  /** Camera shake: strength 0..1 for `sec` seconds. */
  shake: (mag: number, sec: number) => void;
  run: (frame: (dt: number, t: number) => void) => void;
  setTier: (tier: GfxTier) => void;
  /** Start the 3 s frame-rate probe now (with probe: 'manual', once the scene has loaded). */
  armProbe: () => void;
  /** Weak-device mode: cap the pixel ratio below the tier's (e.g. 0.75); null = tier default. */
  setPixelRatioCap: (cap: number | null) => void;
  /** Camera direction (C4 groundwork): dolly to anchors, dim the background, named moves, rails. */
  director: CameraDirector;
  stats: () => RuntimeStats;
  dispose: () => void;
}

let liveRuntimes = 0;
let createdRuntimes = 0;
/** For leak checks: runtimes created and still alive in this page. */
export function runtimeCounters() {
  return { live: liveRuntimes, created: createdRuntimes };
}

function gradientDome(top: THREE.ColorRepresentation, horizon: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation, radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: { uTop: { value: new THREE.Color(top) }, uHorizon: { value: new THREE.Color(horizon) }, uBottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; varying vec3 vDir;' +
      'void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h,0.0,1.0),0.55)) : mix(uHorizon, uBottom, pow(clamp(-h,0.0,1.0),0.6)); gl_FragColor = vec4(c,1.0); }',
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), mat);
  m.renderOrder = -100;
  m.frustumCulled = false;
  m.userData.sky = true;
  return m;
}

/** Creates the runtime inside `el`. Throws when WebGL is unavailable. */
export function createRuntime(el: HTMLElement, opts: RuntimeOptions = {}): SceneRuntime {
  let tier: GfxTier = opts.tier ?? 'high';
  const renderer = new THREE.WebGLRenderer({ antialias: tier === 'high', alpha: opts.background === null, stencil: true, powerPreference: 'high-performance' });
  createdRuntimes += 1;
  liveRuntimes += 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // A frame can be several render() calls (the director's dimmed background): count them all.
  renderer.info.autoReset = false;
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  if (opts.background !== null && opts.background !== undefined) scene.background = new THREE.Color(opts.background);
  if (opts.fog) scene.fog = new THREE.Fog(opts.fog.color, opts.fog.near, opts.fog.far);
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 50, 2, opts.near ?? 0.1, opts.far ?? 400);
  const size = { w: 600, h: 300 };
  const reduced = prefersReducedMotion();

  let hemi: THREE.HemisphereLight | null = null;
  let sun: THREE.DirectionalLight | null = null;
  if (opts.lights === 'outdoor') {
    hemi = new THREE.HemisphereLight(0xdff3ff, 0x6b8f4e, 1.1);
    sun = new THREE.DirectionalLight(0xfff1c9, 2.2);
    sun.position.set(30, 50, 20);
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0005;
    scene.add(hemi, sun, sun.target);
  }

  // Sky: HDRI (high tier) or a gradient dome; the dome is always there as a fallback.
  const grad = opts.sky?.gradient ?? [0x5aa9e6, 0xcfe8f7, 0x9ac27a];
  // Inside the camera's far plane, or its top gets clipped (a black wedge in the sky).
  const dome = opts.sky ? gradientDome(grad[0], grad[1], grad[2], (opts.far ?? 400) * 0.9) : null;
  if (dome) scene.add(dome);
  let hdrTex: THREE.DataTexture | null = null;
  let alive = true;
  const loadSky = () => {
    if (!opts.sky?.hdri || !TIER_SETTINGS[tier].hdri || hdrTex) return;
    const url2k = hdri(opts.sky.hdri);
    const apply = (tex: THREE.DataTexture) => {
      if (!alive) return void tex.dispose();
      tex.mapping = THREE.EquirectangularReflectionMapping;
      hdrTex = tex;
      if (tier === 'high') {
        scene.background = tex;
        scene.environment = tex;
        if (dome) dome.visible = false;
      }
    };
    new RGBELoader().loadAsync(url2k).then(apply, () => new RGBELoader().loadAsync(hdriSize(url2k, '1k')).then(apply, () => undefined));
  };

  let dprCap: number | null = opts.maxPixelRatio ?? null;
  const applyTier = () => {
    const s = TIER_SETTINGS[tier];
    renderer.setPixelRatio(Math.min(s.maxDpr, dprCap ?? Infinity, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = s.shadows;
    if (sun) sun.castShadow = s.shadows;
    if (tier === 'low') {
      if (scene.background === hdrTex && hdrTex) scene.background = null;
      scene.environment = null;
      if (dome) dome.visible = true;
    } else if (hdrTex) {
      scene.background = hdrTex;
      scene.environment = hdrTex;
      if (dome) dome.visible = false;
    }
    // Shadow on/off changes the shaders: recompile on the next frame.
    scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) m.needsUpdate = true;
    });
    loadSky();
    resize();
  };

  const resize = () => {
    size.w = el.clientWidth || 600;
    size.h = el.clientHeight || 300;
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  applyTier();

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
  const shake = (mag: number, sec: number) => {
    if (reduced) return;
    const t = clock.getElapsedTime();
    shakeState.mag = Math.max(shakeState.until > t ? shakeState.mag : 0, mag);
    shakeState.until = t + sec;
    shakeState.dur = sec;
  };
  const director = new CameraDirector(camera, scene, renderer, shake);
  let memo = { at: -10, textureMB: 0, geometryMB: 0 };
  let raf = 0;
  const clock = new THREE.Clock();
  const stat = { fps: 60, frameMs: 0 };
  // Probe window in clock seconds; null = not armed yet (manual mode).
  let probeFrom: number | null = opts.probe === 'manual' ? null : PROBE_FROM;

  return {
    renderer,
    scene,
    camera,
    size,
    reduced,
    get tier() {
      return tier;
    },
    hemi,
    sun,
    shake,
    director,
    setPixelRatioCap(cap) {
      dprCap = cap;
      applyTier();
    },
    setTier(next) {
      if (next === tier) return;
      tier = next;
      applyTier();
    },
    armProbe() {
      probeFrom = clock.getElapsedTime() + 0.5;
    },
    stats: () => {
      // GPU memory estimate, refreshed at most every 2 s (it walks the scene).
      const t = clock.getElapsedTime();
      if (t - memo.at > 2) memo = { at: t, ...gpuMemory(scene, renderer) };
      return {
        fps: Math.round(stat.fps),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        frameMs: Math.round(stat.frameMs * 100) / 100,
        tier,
        textureMB: memo.textureMB,
        geometryMB: memo.geometryMB,
        pixelRatio: renderer.getPixelRatio(),
      };
    },
    run(frame) {
      let frames = 0;
      let since = 0;
      let busy = 0;
      let probeFrames = 0;
      let probed = false;
      let slowSince = -1;
      const tick = () => {
        if (!alive) return;
        raf = requestAnimationFrame(tick);
        const raw = clock.getDelta();
        const t = clock.getElapsedTime();
        // A hidden tab pauses rAF: ignore that gap for animation and for the FPS guard.
        const dt = raw > 0.25 ? 1 / 60 : raw;
        const t0 = performance.now();
        frame(dt, t);
        director.apply(dt);
        let ox = 0;
        let oy = 0;
        if (shakeState.until > t) {
          const k = ((shakeState.until - t) / shakeState.dur) * shakeState.mag * 0.35;
          ox = (Math.random() - 0.5) * k;
          oy = (Math.random() - 0.5) * k;
          camera.position.x += ox;
          camera.position.y += oy;
        }
        // The sky dome travels with the camera, so it never reaches the far plane (black wedge).
        if (dome) dome.position.copy(camera.position);
        renderer.info.reset();
        director.render();
        camera.position.x -= ox;
        camera.position.y -= oy;
        director.restore();
        busy += performance.now() - t0;
        if (raw > 0.5) {
          frames = 0;
          busy = 0;
          since = t;
          slowSince = -1;
          return;
        }
        frames++;
        const from = probeFrom;
        const to = from === null ? Infinity : from + (PROBE_TO - PROBE_FROM);
        if (!probed && from !== null && t >= from && t < to) probeFrames++;
        if (!probed && from !== null && t >= to) {
          probed = true;
          const fps = probeFrames / (PROBE_TO - PROBE_FROM);
          if (fps < FPS_MIN && tier === 'high') {
            tier = 'low';
            applyTier();
            opts.onLowQuality?.();
          }
        }
        if (t - since >= 1) {
          stat.fps = frames / (t - since);
          stat.frameMs = busy / Math.max(1, frames);
          frames = 0;
          busy = 0;
          since = t;
          if (probed && tier === 'low' && stat.fps < FPS_MIN) {
            if (slowSince < 0) slowSince = t - 1;
            if ((t - slowSince) * 1000 >= FPS_WINDOW) slow();
          } else if (stat.fps >= FPS_MIN) slowSince = -1;
          else if (probed && tier === 'high') {
            // Got slow later (more models loaded): step down once more, then the 2D canvas.
            if (slowSince < 0) slowSince = t - 1;
            if ((t - slowSince) * 1000 >= FPS_WINDOW) {
              tier = 'low';
              applyTier();
              opts.onLowQuality?.();
              slowSince = -1;
            }
          }
        }
      };
      tick();
    },
    dispose() {
      if (!alive) return;
      alive = false;
      liveRuntimes -= 1;
      cancelAnimationFrame(raf);
      director.dispose();
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      disposeTree(scene);
      hdrTex?.dispose();
      renderer.dispose();
      // Give the WebGL context back now instead of waiting for garbage collection.
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/** Free GPU memory of everything under `root` (geometries, materials, textures). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  });
}

const BYTES_PER_PIXEL: Partial<Record<number, number>> = { [THREE.UnsignedByteType]: 4, [THREE.HalfFloatType]: 8, [THREE.FloatType]: 16 };

/**
 * GPU memory estimate in MB: every texture in the scene at its decoded size (WebP / PNG decode to
 * RGBA8, the HDR sky to half floats; mipmaps +33%), the PMREM environment the renderer derives
 * from the sky, the shadow map, and geometry buffers (attributes, indices, instance matrices).
 * An estimate, not a driver figure, but it moves with what the scene really holds.
 */
export function gpuMemory(scene: THREE.Scene, renderer: THREE.WebGLRenderer): { textureMB: number; geometryMB: number } {
  const textures = new Map<string, number>();
  const addTex = (t: THREE.Texture | null | undefined, extra = 1) => {
    if (!t || textures.has(t.uuid)) return;
    const img = t.image as { width?: number; height?: number } | undefined;
    const w = img?.width ?? 0;
    const h = img?.height ?? 0;
    const bpp = BYTES_PER_PIXEL[t.type] ?? 4;
    textures.set(t.uuid, w * h * bpp * (t.generateMipmaps ? 4 / 3 : 1) * extra);
  };
  const geos = new Map<string, number>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !geos.has(m.geometry.uuid)) {
      let bytes = 0;
      for (const a of Object.values(m.geometry.attributes)) bytes += (a as THREE.BufferAttribute).array?.byteLength ?? 0;
      bytes += m.geometry.index?.array.byteLength ?? 0;
      geos.set(m.geometry.uuid, bytes);
    }
    if ((o as THREE.InstancedMesh).isInstancedMesh) geos.set(`${o.uuid}:inst`, (o as THREE.InstancedMesh).instanceMatrix.array.byteLength);
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) for (const v of Object.values(mat)) if (v instanceof THREE.Texture) addTex(v);
    for (const mat of mats) {
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const x of Object.values(u)) if (x?.value instanceof THREE.Texture) addTex(x.value);
    }
    const light = o as THREE.DirectionalLight;
    if (light.isDirectionalLight && light.castShadow && renderer.shadowMap.enabled) {
      const s = light.shadow.mapSize;
      textures.set(`${o.uuid}:shadow`, s.x * s.y * 4);
    }
  });
  if (scene.background instanceof THREE.Texture) addTex(scene.background);
  if (scene.environment instanceof THREE.Texture) {
    addTex(scene.environment);
    // The renderer turns an equirect environment into a PMREM (≈ 3 × 4 cells of width/4, half float).
    const w = (scene.environment.image as { width?: number })?.width ?? 0;
    const cube = Math.max(64, w / 4);
    textures.set(`${scene.environment.uuid}:pmrem`, 3 * cube * 4 * cube * 8);
  }
  const mb = (n: number) => Math.round((n / 1e6) * 10) / 10;
  return { textureMB: mb([...textures.values()].reduce((a, b) => a + b, 0)), geometryMB: mb([...geos.values()].reduce((a, b) => a + b, 0)) };
}
