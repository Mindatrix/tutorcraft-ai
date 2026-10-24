'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { THREE_ASSET_MANIFEST, assetUrl } from '../../config/threeAssets';
import { Sparks, canvasTexture, clamp, createStage, damp, easeOut, glow, mesh, ndc, skyDome, wrapText } from './kit';
import type { BossSceneProps, SceneEvent } from './types';

// GAME 3 — Cosmic Card Battler.
// A curved galaxy table, a Hub Header with the lesson's core concept, a boss crystal.
// MCQ: drag a card (A–D) into the Hub to answer — it calls the same server path as the
// answer buttons, so grading stays on the server. Correct → EnergyBeamShader laser from
// the card to the Hub to the boss; CRITICAL → camera shake + crystal shards.

const A = THREE_ASSET_MANIFEST.gameModes.cosmic_card;
const BEAM = A.palette.beam.startsWith('#') ? A.palette.beam : '#5eead4';
const CRIT = A.palette.critical.startsWith('#') ? A.palette.critical : '#facc15';
const NEBULA = A.palette.nebula.startsWith('#') ? A.palette.nebula : '#6d28d9';

const CLASSES = [
  { name: 'Đấu sĩ', from: '#f87171', to: '#7f1d1d', emblem: 'sword' },
  { name: 'Pháp sư', from: '#a78bfa', to: '#312e81', emblem: 'star' },
  { name: 'Linh thú', from: '#34d399', to: '#064e3b', emblem: 'spirit' },
  { name: 'Xạ thủ', from: '#fbbf24', to: '#78350f', emblem: 'bow' },
] as const;
const LETTERS = ['A', 'B', 'C', 'D'];
const CARD_W = 1.2;
const CARD_H = 1.7;
const HUB = new THREE.Vector3(0, 1.65, -3.2);
const CORE = new THREE.Vector3(0, 4.2, -5.8);

/** EnergyBeamShader: bright core, glow falloff by view angle, energy pulses running along the beam. */
function beamMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOn: { value: 0 }, uBroken: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vFace;
      void main(){
        vUv = uv;
        vec3 n = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFace = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uOn; uniform float uBroken;
      varying vec2 vUv; varying float vFace;
      float hash(float x){ return fract(sin(x * 91.17) * 43758.5453); }
      void main(){
        float core = pow(vFace, 6.0);
        float glowF = pow(vFace, 1.6);
        float pulse = 0.55 + 0.45 * sin(vUv.y * 46.0 - uTime * 28.0);
        float flick = 0.85 + 0.15 * hash(floor(uTime * 30.0));
        float gap = uBroken > 0.5 ? step(0.45, fract(vUv.y * 7.0 + hash(floor(uTime * 12.0)))) : 1.0;
        vec3 col = uColor * glowF * pulse * 1.6 + vec3(1.0) * core * 1.3;
        float a = (glowF * 0.9 + core) * uOn * flick * gap;
        gl_FragColor = vec4(col * a, a);
      }`,
  });
}

function placeBeam(m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, width: number, grow: number) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = Math.max(0.001, dir.length() * clamp(grow));
  dir.normalize();
  m.position.copy(from).addScaledVector(dir, len / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  m.scale.set(width, len, width);
}

function drawEmblem(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  if (kind === 'sword') {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.rotate(s * 0.6);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r * 0.65);
      ctx.moveTo(-r * 0.3, r * 0.45);
      ctx.lineTo(r * 0.3, r * 0.45);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.42 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'spirit') {
    ctx.beginPath();
    ctx.arc(0, -r * 0.1, r * 0.55, Math.PI, 0);
    ctx.quadraticCurveTo(r * 0.6, r * 0.8, 0, r);
    ctx.quadraticCurveTo(-r * 0.6, r * 0.8, -r * 0.55, -r * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    for (const x of [-0.2, 0.2]) {
      ctx.beginPath();
      ctx.arc(x * r, -r * 0.1, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.arc(-r * 0.2, 0, r * 0.85, -1.1, 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(r * 0.7, -r * 0.25);
    ctx.lineTo(r, 0);
    ctx.lineTo(r * 0.7, r * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, i: number, text: string | null, art: HTMLImageElement | null) {
  const W = 256;
  const H = 362;
  const c = CLASSES[i % CLASSES.length];
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c.from);
  g.addColorStop(1, c.to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (art) ctx.drawImage(art, 0, 0, W, H);
  else {
    // Procedural "splash art": light rays + sparkles + emblem.
    ctx.save();
    ctx.translate(W / 2, H * 0.38);
    for (let k = 0; k < 12; k++) {
      ctx.rotate(Math.PI / 6);
      ctx.fillStyle = `rgba(255,255,255,${k % 2 ? 0.05 : 0.11})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-18, -300);
      ctx.lineTo(18, -300);
      ctx.fill();
    }
    ctx.restore();
    for (let k = 0; k < 26; k++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + ((k * 37) % 50) / 100})`;
      ctx.beginPath();
      ctx.arc((k * 97) % W, (k * 61) % (H * 0.7), 1 + (k % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    const halo = ctx.createRadialGradient(W / 2, H * 0.38, 4, W / 2, H * 0.38, 90);
    halo.addColorStop(0, 'rgba(255,255,255,.55)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    drawEmblem(ctx, c.emblem, W / 2, H * 0.38, 54);
  }
  // Frame.
  ctx.strokeStyle = '#f5c451';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.strokeStyle = 'rgba(0,0,0,.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(13, 13, W - 26, H - 26);
  // Letter badge (diamond).
  ctx.fillStyle = '#0f0a2a';
  ctx.beginPath();
  ctx.moveTo(40, 14);
  ctx.lineTo(66, 40);
  ctx.lineTo(40, 66);
  ctx.lineTo(14, 40);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f5c451';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#fde68a';
  ctx.font = '900 30px "Be Vietnam Pro", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(LETTERS[i] ?? '?', 40, 42);
  // Text panel.
  ctx.fillStyle = 'rgba(8,6,28,.82)';
  ctx.fillRect(16, H * 0.64, W - 32, H * 0.33);
  ctx.fillStyle = '#fff';
  ctx.font = '800 22px "Be Vietnam Pro", system-ui, sans-serif';
  const lines = text ? wrapText(ctx, text, W - 52, 4) : [c.name];
  const lh = 26;
  const y0 = H * 0.805 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, k) => ctx.fillText(l, W / 2, y0 + k * lh));
}

function backTexture() {
  const url = assetUrl(A.cardBackTextureUrl);
  if (url) {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  return canvasTexture(256, 362, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 256, 362);
    g.addColorStop(0, '#1e1b4b');
    g.addColorStop(1, '#4c1d95');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 362);
    ctx.strokeStyle = 'rgba(245,196,81,.55)';
    ctx.lineWidth = 2;
    for (let k = -362; k < 362; k += 22) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + 362, 362);
      ctx.moveTo(k + 362, 0);
      ctx.lineTo(k, 362);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f5c451';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 352);
    ctx.fillStyle = '#f5c451';
    ctx.font = '900 64px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 128, 181);
  });
}

function galaxyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNebula: { value: new THREE.Color(NEBULA) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.z -= pow(max(0.0, p.y) * 0.16, 2.0) * 3.5; // the far end curves away like a horizon
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uNebula; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 uv = vUv;
        float neb = n(uv * 4.0 + uTime * 0.02) * 0.6 + n(uv * 9.0 - uTime * 0.03) * 0.4;
        vec3 col = vec3(0.02, 0.01, 0.07) + uNebula * pow(neb, 2.2) * 0.9 + vec3(0.1, 0.5, 0.9) * pow(n(uv * 3.0 + 7.0), 4.0) * 0.5;
        vec2 cell = floor(uv * vec2(90.0, 120.0));
        float star = step(0.985, h(cell)) * (0.6 + 0.4 * sin(uTime * 3.0 + h(cell) * 40.0));
        col += vec3(star);
        vec2 e = min(uv, 1.0 - uv);
        float border = smoothstep(0.03, 0.015, min(e.x, e.y * 0.75));
        float inner = smoothstep(0.006, 0.0, abs(min(e.x, e.y * 0.75) - 0.05));
        col = mix(col, vec3(0.96, 0.77, 0.32), max(border, inner * 0.7));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function nebulaSprite(color: string, size: number) {
  const tex = canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false }));
  s.scale.setScalar(size);
  return s;
}

interface Card {
  mesh: THREE.Mesh;
  face: THREE.CanvasTexture;
  faceMat: THREE.MeshBasicMaterial;
  home: THREE.Vector3;
  homeRot: THREE.Euler;
  lift: number;
  hidden: boolean;
  cracked: number;
  dragging: boolean;
}

export default function CosmicCardBattler(props: BossSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const live = useRef(props);
  const events = useRef<NonNullable<SceneEvent>[]>([]);
  const lastN = useRef<number | null>(props.event?.n ?? null);

  useEffect(() => {
    live.current = props;
  });
  useEffect(() => {
    const ev = props.event;
    if (!ev || ev.n === lastN.current) return;
    lastN.current = ev.n;
    events.current.push(ev);
  }, [props.event]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const unavailable = () => live.current.onUnavailable();
    let stage: ReturnType<typeof createStage>;
    try {
      stage = createStage(el, { fov: 50, background: 0x05031a, onSlow: unavailable });
    } catch {
      unavailable();
      return;
    }
    let alive = true;
    const { scene, camera, renderer } = stage;
    scene.add(skyDome(0x05031a, 0x1d0b4a, 0x05031a, { stars: 1.4 }));
    for (const [c, x, y, z, s] of [[NEBULA, -14, 9, -40, 46], ['#0ea5e9', 18, 6, -45, 38], ['#db2777', 4, 16, -55, 40]] as const) {
      const n = nebulaSprite(c, s);
      n.position.set(x, y, z);
      scene.add(n);
    }
    scene.add(new THREE.HemisphereLight(0xbfb6ff, 0x120a2a, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 8, 6);
    scene.add(key);

    // Curved galaxy table.
    const galaxy = galaxyMaterial();
    const table = mesh(new THREE.PlaneGeometry(9, 13, 30, 60), galaxy);
    table.rotation.x = -Math.PI / 2;
    table.position.set(0, 0, -1.5);
    scene.add(table);

    // Hub Header.
    const hub = new THREE.Group();
    hub.position.copy(HUB);
    scene.add(hub);
    const hubBody = mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0x120c33, metalness: 0.4, roughness: 0.3, emissive: 0x1a0f4d, flatShading: true }));
    hubBody.rotation.x = Math.PI / 2;
    hubBody.rotation.y = Math.PI / 6;
    hub.add(hubBody);
    const hubRim = new THREE.LineSegments(new THREE.EdgesGeometry(hubBody.geometry), new THREE.LineBasicMaterial({ color: 0xf5c451, toneMapped: false }));
    hubRim.rotation.copy(hubBody.rotation);
    hub.add(hubRim);
    let hubText = '';
    const hubTex = canvasTexture(512, 256, () => {});
    const hubLabel = mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: hubTex, transparent: true, toneMapped: false, depthWrite: false }));
    hubLabel.position.z = 0.11;
    hub.add(hubLabel);
    const paintHub = (text: string) => {
      hubText = text;
      const c = hubTex.image as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, 512, 256);
      ctx.fillStyle = '#fde68a';
      ctx.font = '800 26px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦ HUB ✦', 256, 52);
      ctx.fillStyle = '#fff';
      ctx.font = '900 54px "Be Vietnam Pro", system-ui, sans-serif';
      const lines = wrapText(ctx, text, 470, 2);
      lines.forEach((l, k) => ctx.fillText(l, 256, 140 + (k - (lines.length - 1) / 2) * 60));
      hubTex.needsUpdate = true;
    };
    const rings = [0x22d3ee, 0xc084fc].map((c, k) => {
      const r = mesh(new THREE.TorusGeometry(1.75 + k * 0.22, 0.025, 6, 64), glow(c, 0.85, true));
      hub.add(r);
      return r;
    });

    // Boss crystal.
    const crystal = new THREE.Group();
    crystal.position.copy(CORE);
    scene.add(crystal);
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x5b21b6, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.15, flatShading: true, transparent: true, opacity: 0.92 });
    const gem = mesh(new THREE.OctahedronGeometry(1.15, 0), crystalMat);
    gem.scale.set(0.9, 1.3, 0.9);
    crystal.add(gem);
    const coreGlow = mesh(new THREE.IcosahedronGeometry(0.45, 1), glow(0xf0abfc));
    crystal.add(coreGlow);
    const orbit: THREE.Mesh[] = [];
    for (let k = 0; k < 5; k++) {
      const s = mesh(new THREE.TetrahedronGeometry(0.22, 0), crystalMat);
      orbit.push(s);
      crystal.add(s);
    }

    // Cards.
    const back = backTexture();
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf5c451, toneMapped: false });
    const backMat = new THREE.MeshBasicMaterial({ map: back, toneMapped: false });
    const arts: (HTMLImageElement | null)[] = [null, null, null, null];
    const cards: Card[] = [0, 1, 2, 3].map((i) => {
      const face = canvasTexture(256, 362, (ctx) => drawFace(ctx, i, null, null));
      const faceMat = new THREE.MeshBasicMaterial({ map: face, toneMapped: false, transparent: true });
      const m = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, 0.03), [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, backMat]);
      const x = (i - 1.5) * 1.32;
      const home = new THREE.Vector3(x, 0.7 - Math.abs(i - 1.5) * 0.06, 1.9 + Math.abs(i - 1.5) * 0.12);
      const homeRot = new THREE.Euler(-0.95, 0, (1.5 - i) * 0.07);
      m.position.copy(home);
      m.rotation.copy(homeRot);
      m.userData.card = i;
      scene.add(m);
      return { mesh: m, face, faceMat, home, homeRot, lift: 0, hidden: false, cracked: 0, dragging: false };
    });
    const artDir = assetUrl(A.cardArtDir);
    if (artDir) {
      cards.forEach((c, i) => {
        const img = new Image();
        img.onload = () => {
          if (!alive) return;
          arts[i] = img;
          paintCards();
        };
        img.src = `${artDir.replace(/\/?$/, '/')}${i}.png`;
      });
    }
    const paintCards = () => {
      const q = live.current.question;
      cards.forEach((c, i) => {
        const ctx = (c.face.image as HTMLCanvasElement).getContext('2d')!;
        drawFace(ctx, i, q?.type === 'mcq' ? q.options?.[i] ?? null : null, arts[i]);
        c.face.needsUpdate = true;
      });
    };

    const beams = [beamMaterial(BEAM), beamMaterial(BEAM), beamMaterial('#fb7185')].map((mat) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), mat);
      b.visible = false;
      b.frustumCulled = false;
      scene.add(b);
      return b;
    });
    const [beamA, beamB, beamBoss] = beams;
    const sparks = new Sparks(240);
    scene.add(sparks.mesh);
    const shards = new Sparks(70, new THREE.TetrahedronGeometry(0.2, 0), false);
    scene.add(shards.mesh);

    const k = () => (stage.size.w / stage.size.h < 1 ? 1.5 : 1);
    const camPos = () => new THREE.Vector3(0, 4.7 * k(), 7.6 * k());
    camera.position.copy(camPos());
    const look = new THREE.Vector3(0, 1.6, -1.7);
    camera.lookAt(look);

    // --- Interaction: hover / select / drag a card into the Hub ---
    const ray = new THREE.Raycaster();
    // Tilted plane from the hand of cards up to the Hub: dragged cards slide along it.
    const dragPlane = new THREE.Plane().setFromCoplanarPoints(new THREE.Vector3(0, 0.7, 2.3), new THREE.Vector3(1, 0.7, 2.3), new THREE.Vector3(0, 1.35, -3.2));
    const hit = new THREE.Vector3();
    const drag = { card: -1, moved: false, start: new THREE.Vector2() };
    let hover = -1;
    let selected = -1;
    let lastPick = { card: -1, at: -1e9 };
    const canDrag = () => {
      const p = live.current;
      return !!p.onPickOption && p.question?.type === 'mcq' && !p.finished;
    };
    const pickCard = (e: PointerEvent) => {
      ray.setFromCamera(ndc(e, renderer.domElement), camera);
      const hits = ray.intersectObjects(cards.map((c) => c.mesh), false);
      const i = hits.length ? (hits[0].object.userData.card as number) : -1;
      return i >= 0 && !cards[i].hidden ? i : -1;
    };
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    const onDown = (e: PointerEvent) => {
      const i = pickCard(e);
      if (i < 0) return;
      drag.card = i;
      drag.moved = false;
      drag.start.set(e.clientX, e.clientY);
      cards[i].dragging = canDrag();
      selected = i;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (drag.card < 0) {
        hover = pickCard(e);
        canvas.style.cursor = hover >= 0 ? (canDrag() ? 'grab' : 'pointer') : 'default';
        return;
      }
      if (Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > 6) drag.moved = true;
      if (!cards[drag.card].dragging) return;
      ray.setFromCamera(ndc(e, canvas), camera);
      if (ray.ray.intersectPlane(dragPlane, hit)) cards[drag.card].mesh.position.lerp(hit, 0.6);
      canvas.style.cursor = 'grabbing';
    };
    const onUp = (e: PointerEvent) => {
      const i = drag.card;
      drag.card = -1;
      if (i < 0) return;
      const c = cards[i];
      const nearHub = c.mesh.position.distanceTo(HUB) < 2.1 || (drag.moved && c.mesh.position.z < 0.2);
      c.dragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
      const p = live.current;
      if (nearHub && canDrag() && p.onPickOption) {
        lastPick = { card: i, at: performance.now() };
        // Charging beam while the server grades.
        sparks.emit(c.mesh.position, 20, { color: BEAM, speed: 3, life: 0.6 });
        p.onPickOption(i);
      }
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // --- Events ---
    const st = {
      fire: -1e9,
      fireCard: 0,
      crit: false,
      wrong: -1e9,
      wrongCard: 0,
      bossHit: -1e9,
      dead: live.current.outcome === 'victory',
      deadAt: -1e9,
      defeat: live.current.outcome === 'defeat',
      deal: -1e9,
      qKey: '',
    };
    const handle = (ev: NonNullable<SceneEvent>, t: number) => {
      const k2 = ev.kind;
      const recent = performance.now() - lastPick.at < 8000 ? lastPick.card : -1;
      const card = recent >= 0 ? recent : selected >= 0 ? selected : live.current.qIndex % 4;
      if (k2 === 'correct' || k2 === 'critical' || k2 === 'ultimate' || k2 === 'victory') {
        st.fire = t;
        st.fireCard = card;
        st.crit = k2 !== 'correct';
        (beamA.material as THREE.ShaderMaterial).uniforms.uColor.value.set(st.crit ? CRIT : BEAM);
        (beamB.material as THREE.ShaderMaterial).uniforms.uColor.value.set(st.crit ? CRIT : BEAM);
        if (k2 === 'victory') {
          st.crit = true;
          st.deadAt = t + 0.9;
        }
      } else if (k2 === 'wrong' || k2 === 'miss' || k2 === 'defeat' || k2 === 'blocked') {
        st.wrong = t;
        st.wrongCard = card;
        if (k2 === 'defeat') st.defeat = true;
      } else {
        sparks.emit(HUB, 30, { color: '#a7f3d0', speed: 3, life: 0.8 });
      }
      selected = -1;
      lastPick = { card: -1, at: -1e9 };
    };

    const timers: { left: number; fn: () => void }[] = [];
    const later = (fn: () => void, sec: number) => timers.push({ left: sec, fn });

    stage.run((dt, t) => {
      const p = live.current;
      galaxy.uniforms.uTime.value = t;
      for (const b of beams) (b.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      const ev = events.current.shift();
      if (ev) handle(ev, t);

      // Re-deal on a new question; options removed by Eye of Truth turn face-down.
      const q = p.question;
      const qKey = `${p.qIndex}|${q?.type}|${q?.options?.join('¦') ?? ''}`;
      if (qKey !== st.qKey) {
        st.qKey = qKey;
        st.deal = t;
        cards.forEach((c) => (c.cracked = 0));
        later(() => paintCards(), 0.25);
      }
      const label = q?.hub || q?.topic || p.topic;
      if (label !== hubText) paintHub(label);

      if (hint.current) hint.current.style.opacity = canDrag() && t - st.fire > 1 ? '1' : '0';

      // Cards.
      cards.forEach((c, i) => {
        c.hidden = q?.type === 'mcq' ? p.removed.includes(i) || !q.options?.[i] : false;
        const dealT = (t - st.deal - i * 0.06) / 0.5;
        const flip = dealT < 1 && dealT > 0 ? Math.sin(clamp(dealT) * Math.PI) * Math.PI : 0;
        const firing = st.fireCard === i && t - st.fire < 1.1;
        const want = c.dragging ? 0 : (hover === i || selected === i ? 1 : 0) + (firing ? 1.4 : 0);
        c.lift = damp(c.lift, want, 10, dt);
        if (!c.dragging) {
          const target = c.home.clone().add(new THREE.Vector3(0, c.lift * 0.35, -c.lift * 0.25));
          c.mesh.position.lerp(target, 1 - Math.exp(-12 * dt));
        }
        const hide = c.hidden || st.defeat ? Math.PI : 0;
        c.mesh.rotation.set(c.homeRot.x + c.lift * 0.25, c.homeRot.y + flip + hide, c.homeRot.z);
        c.faceMat.opacity = 1 - c.cracked * 0.45;
        c.faceMat.color.setScalar(1 - c.cracked * 0.35);
        if (st.dead && t > st.deadAt) {
          c.mesh.position.y += Math.sin(t * 2 + i) * 0.002;
        }
      });

      // Hub + crystal idle.
      hub.position.y = HUB.y + Math.sin(t * 1.4) * 0.06;
      rings[0].rotation.set(t * 0.9, t * 0.5, 0);
      rings[1].rotation.set(-t * 0.6, 0, t * 0.8);
      const bossHit = clamp(1 - (t - st.bossHit) / 0.35);
      const phase2 = p.bossPhase === 2;
      crystalMat.color.setHex(phase2 ? 0xbe185d : 0x7c3aed);
      crystalMat.emissive.setHex(bossHit > 0 ? 0xffffff : p.enraged ? (Math.sin(t * 10) > 0 ? 0xdc2626 : 0x7f1d1d) : phase2 ? 0x9d174d : 0x5b21b6);
      crystal.rotation.y = t * 0.6;
      crystal.position.set(CORE.x + Math.sin(t * 40) * bossHit * 0.1, CORE.y + Math.sin(t * 1.2) * 0.18, CORE.z);
      const deadK = st.dead && t > st.deadAt ? 0 : 1;
      crystal.scale.setScalar(deadK * (phase2 ? 1.12 : 1) * (1 + bossHit * 0.12));
      crystal.visible = deadK > 0;
      coreGlow.scale.setScalar(0.9 + Math.sin(t * 5) * 0.12);
      orbit.forEach((s, j) => {
        const a = t * 1.3 + (j / orbit.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * 1.9, Math.sin(a * 2) * 0.4, Math.sin(a) * 1.9);
        s.rotation.set(t * 2, t * 3, 0);
      });

      // Beams: card → Hub, then Hub → crystal.
      const F = t - st.fire;
      const from = cards[st.fireCard]?.mesh.position ?? HUB;
      const onA = F >= 0 && F < 1.25;
      beamA.visible = onA;
      if (onA) {
        placeBeam(beamA, from, hub.position, st.crit ? 0.24 : 0.15, easeOut(F / 0.25));
        (beamA.material as THREE.ShaderMaterial).uniforms.uOn.value = F < 0.95 ? 1 : 1 - (F - 0.95) / 0.3;
      }
      const G = F - 0.28;
      const onB = G >= 0 && G < 1.1;
      beamB.visible = onB;
      if (onB) {
        placeBeam(beamB, hub.position, crystal.position, st.crit ? 0.4 : 0.24, easeOut(G / 0.2));
        (beamB.material as THREE.ShaderMaterial).uniforms.uOn.value = G < 0.8 ? 1 : 1 - (G - 0.8) / 0.3;
        if (G < 0.2 && G + dt >= 0.2) {
          st.bossHit = t;
          sparks.emit(crystal.position, st.crit ? 60 : 26, { color: st.crit ? CRIT : BEAM, speed: st.crit ? 8 : 5, life: 0.7, size: st.crit ? 1.6 : 1.1 });
          if (st.crit) {
            stage.shake(1, 0.5);
            shards.emit(crystal.position, 16, { color: 0xa78bfa, speed: 6, life: 1.1, gravity: 5 });
          }
        }
      }
      if (G >= 0 && G < 0.1) sparks.emit(hub.position, 2, { color: st.crit ? CRIT : BEAM, speed: 2, life: 0.4 });
      if (st.dead && t > st.deadAt && t - st.deadAt < dt * 1.5) {
        shards.emit(CORE, 60, { color: 0xc4b5fd, speed: 9, life: 1.8, gravity: 6, up: 3 });
        sparks.emit(CORE, 100, { color: CRIT, speed: 10, life: 1.4, up: 2 });
        stage.shake(1, 0.7);
      }
      if (st.dead && t > st.deadAt + 0.2 && Math.random() < 0.3) sparks.emit(CORE, 2, { color: CRIT, speed: 3, life: 1.2, up: 4, gravity: 2 });

      // Wrong: the crystal fires back at the card.
      const W = t - st.wrong;
      beamBoss.visible = W >= 0 && W < 0.7;
      if (beamBoss.visible) {
        const to = cards[st.wrongCard]?.mesh.position ?? HUB;
        placeBeam(beamBoss, crystal.position, to, 0.12, easeOut(W / 0.2));
        const m = beamBoss.material as THREE.ShaderMaterial;
        m.uniforms.uOn.value = W < 0.5 ? 1 : 1 - (W - 0.5) / 0.2;
        m.uniforms.uBroken.value = 1;
        if (W < 0.2 && W + dt >= 0.2) {
          cards[st.wrongCard].cracked = 1;
          sparks.emit(to, 18, { color: '#fb7185', speed: 4, life: 0.5 });
          stage.shake(0.5, 0.25);
        }
      }

      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].left -= dt;
        if (timers[i].left <= 0) timers.splice(i, 1)[0].fn();
      }
      const kk = k();
      camera.position.lerp(camPos(), 1 - Math.exp(-3 * dt));
      look.set(0, 1.6 * kk, -1.7);
      camera.lookAt(look);
      sparks.update(dt);
      shards.update(dt);
    });
    return () => {
      alive = false;
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      back.dispose();
      stage.dispose();
    };
  }, []);

  return (
    <>
      <div ref={host} className="absolute inset-0" aria-label="Bàn thẻ bài vũ trụ: kéo thẻ A–D vào Hub để chọn đáp án" />
      <div ref={hint} className="pointer-events-none absolute inset-x-0 bottom-9 z-10 text-center text-[11px] font-bold text-cyan-200 opacity-0 transition-opacity drop-shadow">
        Kéo thẻ A–D vào Hub để chọn đáp án
      </div>
    </>
  );
}

