import * as THREE from 'three';
import type { PetState } from '../../../../client/phoneticStones';
import { damp, disposeObject, glow, mesh, textSprite, toon } from '../../kit';

export function safeTextSprite(
  text: string,
  opts: Parameters<typeof textSprite>[1] = {},
): THREE.Sprite {
  if (typeof document === 'undefined') {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0xffffff, transparent: true }),
    );
    s.scale.set(1.2, opts?.height ?? 0.3, 1);
    return s;
  }
  return textSprite(text, opts);
}

// ============================================================================
// GDS-TC-2026-EXP v2.6 — Section 2: GPU Particle Systems & Visual FX (VFX)
// - 2a) Portal Energy Vortex (`PortalEnergyVortexFX`)
// - 2b) Phonetic Stone Burst (`PhoneticStoneBurstFX`)
// - 2c) Lumi Pet Companion FX (`LumiPetCompanionFX`)
// Zero per-frame heap allocations in `update(dt, t)`.
// ============================================================================

export type PortalVortexState = 'IDLE' | 'PORTAL_CHARGING' | 'PORTAL_STABILIZED';

export interface PortalEnergyVortexOptions {
  particleCount?: number;
  innerRadius?: number;
  outerRadius?: number;
  primaryColor?: number;
  secondaryColor?: number;
  position?: [number, number, number];
}

export interface PortalEnergyVortexFX {
  readonly group: THREE.Group;
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  readonly horizonRing: THREE.Mesh;
  getState(): PortalVortexState;
  setState(state: PortalVortexState): void;
  setThemeColors(primaryHex: number, secondaryHex: number): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

const VORTEX_VERTEX_SHADER = /* glsl */ `
  attribute float aAngle;
  attribute float aRadius;
  attribute float aSpeed;
  attribute float aSeed;

  uniform float uTime;
  uniform float uSpinMultiplier;
  uniform float uPullFactor;
  uniform float uStateFactor;
  uniform float uPointScale;

  varying float vMix;
  varying float vAlpha;

  void main() {
    float angularVel = aSpeed * uSpinMultiplier;
    float theta = aAngle + uTime * angularVel;

    // Radial contraction during PORTAL_CHARGING and harmonic lock during PORTAL_STABILIZED
    float radialPulse = sin(uTime * 3.2 + aSeed * 6.2831) * (0.08 + 0.10 * uStateFactor);
    float r = max(0.32, aRadius * (1.0 - uPullFactor * 0.22) + radialPulse);

    float zWave = cos(uTime * 2.4 + aSeed * 12.566) * (0.12 + 0.22 * uStateFactor);
    vec3 localPos = vec3(cos(theta) * r, sin(theta) * r, zWave);

    vMix = fract(aSeed + uTime * 0.15);
    vAlpha = clamp(0.38 + 0.62 * uStateFactor + 0.18 * sin(uTime * 5.0 + aSeed * 9.0), 0.15, 1.0);

    vec4 mvPosition = modelViewMatrix * vec4(localPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = max(1.0, -mvPosition.z);
    gl_PointSize = clamp((uPointScale * (1.0 + 0.55 * uStateFactor)) * (18.0 / dist), 2.0, 28.0);
  }
`;

const VORTEX_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColorPrimary;
  uniform vec3 uColorSecondary;
  uniform float uOpacity;

  varying float vMix;
  varying float vAlpha;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;

    float core = smoothstep(0.5, 0.05, d);
    vec3 col = mix(uColorPrimary, uColorSecondary, vMix);
    gl_FragColor = vec4(col * (1.1 + core * 0.6), core * vAlpha * uOpacity);
  }
`;

/**
 * 2a) Portal Energy Vortex:
 * Swirling ambient GPU particle energy (`THREE.Points` + custom `THREE.ShaderMaterial`)
 * around the Spatial Portal frame during `IDLE`, `PORTAL_CHARGING`, and `PORTAL_STABILIZED`.
 */
export function createPortalEnergyVortexFX(
  options: PortalEnergyVortexOptions = {},
): PortalEnergyVortexFX {
  const count = Math.max(24, options.particleCount ?? 160);
  const innerR = options.innerRadius ?? 1.15;
  const outerR = options.outerRadius ?? 2.35;
  const primaryHex = options.primaryColor ?? 0x38bdf8;
  const secondaryHex = options.secondaryColor ?? 0xc084fc;
  const pos = options.position ?? [0, 2.75, 0.12];

  const group = new THREE.Group();
  group.name = 'PortalEnergyVortexFX';
  group.position.set(pos[0], pos[1], pos[2]);

  const positions = new Float32Array(count * 3);
  const angles = new Float32Array(count);
  const radii = new Float32Array(count);
  const speeds = new Float32Array(count);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const norm = i / count;
    const angle = norm * Math.PI * 2 * 3.0;
    const radius = innerR + ((i * 73) % 100) * 0.01 * (outerR - innerR);
    angles[i] = angle;
    radii[i] = radius;
    speeds[i] = 0.85 + ((i * 37) % 100) * 0.012;
    seeds[i] = ((i * 53) % 100) * 0.01;

    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(angle) * radius;
    positions[i * 3 + 2] = (((i * 19) % 100) * 0.01 - 0.5) * 0.25;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
  geo.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpinMultiplier: { value: 0.75 },
      uPullFactor: { value: 0.0 },
      uStateFactor: { value: 0.15 },
      uPointScale: { value: 8.5 },
      uColorPrimary: { value: new THREE.Color(primaryHex) },
      uColorSecondary: { value: new THREE.Color(secondaryHex) },
      uOpacity: { value: 0.88 },
    },
    vertexShader: VORTEX_VERTEX_SHADER,
    fragmentShader: VORTEX_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geo, material);
  points.name = 'PortalVortexPoints';
  points.frustumCulled = false;

  const horizonMat = glow(primaryHex, 0.32, true);
  const horizonRing = mesh(new THREE.RingGeometry(innerR * 0.92, outerR * 0.88, 40), horizonMat, [
    0,
    0,
    -0.03,
  ]);
  horizonRing.name = 'PortalStabilizedHorizonRing';

  group.add(horizonRing, points);

  let currentState: PortalVortexState = 'IDLE';
  let targetSpin = 0.75;
  let targetPull = 0.0;
  let targetStateFactor = 0.15;
  let targetHorizonOpacity = 0.22;

  return {
    group,
    points,
    material,
    horizonRing,

    getState() {
      return currentState;
    },

    setState(state: PortalVortexState) {
      currentState = state;
      if (state === 'PORTAL_CHARGING') {
        targetSpin = 2.65;
        targetPull = 0.85;
        targetStateFactor = 0.68;
        targetHorizonOpacity = 0.58;
      } else if (state === 'PORTAL_STABILIZED') {
        targetSpin = 1.95;
        targetPull = 0.35;
        targetStateFactor = 1.0;
        targetHorizonOpacity = 0.92;
      } else {
        targetSpin = 0.75;
        targetPull = 0.0;
        targetStateFactor = 0.15;
        targetHorizonOpacity = 0.22;
      }
    },

    setThemeColors(primaryColorHex: number, secondaryColorHex: number) {
      (material.uniforms.uColorPrimary.value as THREE.Color).setHex(primaryColorHex);
      (material.uniforms.uColorSecondary.value as THREE.Color).setHex(secondaryColorHex);
      horizonMat.color.setHex(primaryColorHex);
    },

    update(dt: number, t: number) {
      material.uniforms.uTime.value = t;
      material.uniforms.uSpinMultiplier.value = damp(
        material.uniforms.uSpinMultiplier.value,
        targetSpin,
        4.5,
        dt,
      );
      material.uniforms.uPullFactor.value = damp(
        material.uniforms.uPullFactor.value,
        targetPull,
        4.0,
        dt,
      );
      material.uniforms.uStateFactor.value = damp(
        material.uniforms.uStateFactor.value,
        targetStateFactor,
        4.5,
        dt,
      );

      horizonMat.opacity = damp(horizonMat.opacity, targetHorizonOpacity, 4.2, dt);
      const pulse =
        currentState === 'PORTAL_CHARGING'
          ? 1 + Math.sin(t * 9.5) * 0.09
          : currentState === 'PORTAL_STABILIZED'
            ? 1 + Math.sin(t * 3.8) * 0.04
            : 0.92 + Math.sin(t * 2.0) * 0.03;
      horizonRing.scale.setScalar(pulse);
      horizonRing.rotation.z = -t * (currentState === 'IDLE' ? 0.45 : 1.45);
    },

    dispose() {
      disposeObject(group);
    },
  };
}

// ============================================================================
// 2b) Phonetic Stone Burst (`PhoneticStoneBurstFX`)
// Radiant energy ring expansion and GPU `THREE.Points` burst FX upon successful
// voice/text calibration.
// ============================================================================

export interface PhoneticStoneBurstOptions {
  particleCount?: number;
  origin?: [number, number, number];
}

export interface PhoneticStoneBurstFX {
  readonly group: THREE.Group;
  readonly ringMesh: THREE.Mesh;
  readonly secondaryRingMesh: THREE.Mesh;
  readonly points: THREE.Points;
  readonly pointsMaterial: THREE.ShaderMaterial;
  isActive(): boolean;
  triggerBurst(
    origin?: THREE.Vector3 | [number, number, number],
    stars?: 1 | 2 | 3,
  ): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

const STONE_BURST_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aScale;

  uniform float uProgress;
  uniform float uPointSize;

  varying float vFade;
  varying float vSeed;

  void main() {
    float p = clamp(uProgress, 0.0, 1.0);
    // Decelerating outward radial burst with subtle upward buoyancy
    float easeOutP = 1.0 - pow(1.0 - p, 2.4);
    vec3 displaced = position + aVelocity * easeOutP + vec3(0.0, p * p * 0.65, 0.0);

    vFade = pow(max(0.0, 1.0 - p), 1.35);
    vSeed = aScale;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = max(1.0, -mvPosition.z);
    gl_PointSize = clamp(uPointSize * aScale * vFade * (16.0 / dist), 1.0, 30.0);
  }
`;

const STONE_BURST_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uBurstColorA;
  uniform vec3 uBurstColorB;

  varying float vFade;
  varying float vSeed;

  void main() {
    if (vFade <= 0.01) discard;
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;

    float glowCore = smoothstep(0.5, 0.04, d);
    vec3 col = mix(uBurstColorA, uBurstColorB, vSeed);
    gl_FragColor = vec4(col * (1.2 + glowCore * 0.6), glowCore * vFade);
  }
`;

export function createPhoneticStoneBurstFX(
  options: PhoneticStoneBurstOptions = {},
): PhoneticStoneBurstFX {
  const count = Math.max(24, options.particleCount ?? 96);
  const initialOrigin = options.origin ?? [0, 1.62, 2.2];

  const group = new THREE.Group();
  group.name = 'PhoneticStoneBurstFX';
  group.position.set(initialOrigin[0], initialOrigin[1], initialOrigin[2]);
  group.visible = false;

  // Radiant expanding energy shockwave rings
  const ringMat = glow(0xfacc15, 0.0, true);
  const ringMesh = mesh(new THREE.RingGeometry(0.35, 0.58, 36), ringMat, [0, 0, 0]);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.name = 'StoneBurstRadiantRing';

  const secondaryRingMat = glow(0x38bdf8, 0.0, true);
  const secondaryRingMesh = mesh(
    new THREE.RingGeometry(0.28, 0.42, 32),
    secondaryRingMat,
    [0, 0.06, 0],
  );
  secondaryRingMesh.rotation.x = -Math.PI / 2;
  secondaryRingMesh.name = 'StoneBurstSecondaryRing';

  // GPU `THREE.Points` burst
  const origins = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2 * 5.0;
    const phi = (((i * 41) % 100) * 0.01 - 0.25) * Math.PI * 0.65;
    const speed = 1.4 + ((i * 67) % 100) * 0.024;

    velocities[i * 3] = Math.cos(theta) * Math.cos(phi) * speed;
    velocities[i * 3 + 1] = Math.abs(Math.sin(phi)) * speed + 0.55;
    velocities[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * speed;
    scales[i] = 0.55 + ((i * 29) % 100) * 0.008;
  }

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(origins, 3));
  pointsGeo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  pointsGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  const pointsMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 1.0 },
      uPointSize: { value: 11.0 },
      uBurstColorA: { value: new THREE.Color(0xfacc15) },
      uBurstColorB: { value: new THREE.Color(0x38bdf8) },
    },
    vertexShader: STONE_BURST_VERTEX_SHADER,
    fragmentShader: STONE_BURST_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(pointsGeo, pointsMaterial);
  points.name = 'StoneBurstPoints';
  points.frustumCulled = false;

  group.add(ringMesh, secondaryRingMesh, points);

  const BURST_DURATION_SEC = 1.15;
  let burstElapsed = BURST_DURATION_SEC;
  let active = false;
  let starMultiplier = 1.0;

  return {
    group,
    ringMesh,
    secondaryRingMesh,
    points,
    pointsMaterial,

    isActive() {
      return active;
    },

    triggerBurst(origin, stars: 1 | 2 | 3 = 3) {
      if (origin) {
        if (Array.isArray(origin)) {
          group.position.set(origin[0], origin[1], origin[2]);
        } else {
          group.position.copy(origin);
        }
      }
      starMultiplier = stars === 3 ? 1.35 : stars === 2 ? 1.15 : 1.0;
      const primaryHex = stars === 3 ? 0xfacc15 : stars === 2 ? 0x38bdf8 : 0x34d399;
      const secondaryHex = stars === 3 ? 0x38bdf8 : stars === 2 ? 0xc084fc : 0xa7f3d0;

      ringMat.color.setHex(primaryHex);
      secondaryRingMat.color.setHex(secondaryHex);
      (pointsMaterial.uniforms.uBurstColorA.value as THREE.Color).setHex(primaryHex);
      (pointsMaterial.uniforms.uBurstColorB.value as THREE.Color).setHex(secondaryHex);
      pointsMaterial.uniforms.uProgress.value = 0;

      ringMesh.scale.setScalar(0.25);
      secondaryRingMesh.scale.setScalar(0.2);
      ringMat.opacity = 0.95;
      secondaryRingMat.opacity = 0.85;

      burstElapsed = 0;
      active = true;
      group.visible = true;
    },

    update(dt: number) {
      if (!active) return;
      burstElapsed += dt;
      const progress = Math.min(1, burstElapsed / BURST_DURATION_SEC);
      pointsMaterial.uniforms.uProgress.value = progress;

      // Expand radiant rings outward with smooth ease-out curve
      const easeOut = 1 - Math.pow(1 - progress, 2.2);
      const ringScale = (0.3 + easeOut * 4.2) * starMultiplier;
      ringMesh.scale.setScalar(ringScale);
      secondaryRingMesh.scale.setScalar(ringScale * 0.76);

      const fade = Math.max(0, 1 - progress);
      ringMat.opacity = fade * 0.92;
      secondaryRingMat.opacity = fade * fade * 0.85;

      if (progress >= 1) {
        active = false;
        group.visible = false;
      }
    },

    dispose() {
      disposeObject(group);
    },
  };
}

// ============================================================================
// 2c) Lumi Pet Companion FX (`LumiPetCompanionFX`)
// - Idle floating bob animation curve (`computeLumiBobCurve`)
// - Soft ambient glow aura (dual-layer glow shell + ground harmonic ring)
// - Movement particle trail (`THREE.Points` ring-buffer with zero per-frame allocs)
// ============================================================================

export interface LumiBobCurveSample {
  offsetY: number;
  swayX: number;
  pitchX: number;
  rollZ: number;
  wingAngle: number;
  auraPulse: number;
}

/**
 * Pure deterministic evaluator for Lumi Pet's floating bob animation curve.
 */
export function computeLumiBobCurve(t: number, state: PetState = 'idle'): LumiBobCurveSample {
  if (state === 'celebrate') {
    const offsetY = Math.abs(Math.sin(t * 7.8)) * 0.24 + Math.sin(t * 15.6) * 0.03;
    const swayX = Math.sin(t * 4.2) * 0.09;
    const pitchX = Math.sin(t * 7.8) * 0.16;
    const rollZ = Math.cos(t * 4.2) * 0.18;
    const wingAngle = Math.sin(t * 13.5) * 0.56;
    const auraPulse = 1.08 + Math.sin(t * 9.0) * 0.14;
    return { offsetY, swayX, pitchX, rollZ, wingAngle, auraPulse };
  }

  const freq = state === 'listening' ? 3.8 : state === 'coach' ? 3.4 : 2.6;
  const amp = state === 'listening' ? 0.11 : 0.085;
  const offsetY = Math.sin(t * freq) * amp + Math.cos(t * freq * 0.5) * (amp * 0.35);
  const swayX = Math.sin(t * 1.45) * 0.045;
  const pitchX = Math.cos(t * freq) * 0.07;
  const rollZ = Math.sin(t * 1.45) * 0.08;
  const wingRate = state === 'listening' ? 6.5 : 4.2;
  const wingAngle = Math.sin(t * wingRate) * 0.24;
  const auraPulse = 1.0 + Math.sin(t * 3.2) * 0.08;

  return { offsetY, swayX, pitchX, rollZ, wingAngle, auraPulse };
}

export interface LumiPetCompanionFXOptions {
  position?: [number, number, number];
  trailCount?: number;
  label?: string;
}

export interface LumiPetCompanionFX {
  readonly group: THREE.Group;
  readonly petMeshGroup: THREE.Group;
  readonly auraShellMesh: THREE.Mesh;
  readonly auraRingMesh: THREE.Mesh;
  readonly auraMat: THREE.MeshBasicMaterial;
  readonly bodyMat: THREE.MeshToonMaterial;
  readonly wingLeft: THREE.Mesh;
  readonly wingRight: THREE.Mesh;
  readonly trailPoints: THREE.Points;
  getPetState(): PetState;
  setPetState(state: PetState): void;
  setBasePosition(x: number, y: number, z: number): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

const LUMI_TRAIL_VERTEX_SHADER = /* glsl */ `
  attribute float aAge;
  uniform float uPointSize;
  varying float vLife;

  void main() {
    vLife = clamp(1.0 - aAge, 0.0, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float dist = max(1.0, -mvPosition.z);
    gl_PointSize = clamp(uPointSize * vLife * (14.0 / dist), 1.0, 22.0);
  }
`;

const LUMI_TRAIL_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uTrailColor;
  varying float vLife;

  void main() {
    if (vLife <= 0.02) discard;
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(uTrailColor * (1.1 + soft * 0.4), soft * vLife * 0.82);
  }
`;

export function createLumiPetCompanionFX(
  options: LumiPetCompanionFXOptions = {},
): LumiPetCompanionFX {
  const basePos = options.position ?? [1.35, 0.55, 2.1];
  const trailCount = Math.max(16, options.trailCount ?? 36);
  const labelText = options.label ?? 'LUMI PET';

  const group = new THREE.Group();
  group.name = 'LumiPetCompanionFX';

  const petMeshGroup = new THREE.Group();
  petMeshGroup.name = 'PortalPetCompanion';
  petMeshGroup.position.set(basePos[0], basePos[1], basePos[2]);
  group.add(petMeshGroup);

  const bodyMat = toon(0xa855f7, 0x6b21a8, 0.38);
  const body = mesh(new THREE.SphereGeometry(0.3, 16, 14), bodyMat, [0, 0.34, 0]);
  body.scale.set(1, 1.14, 0.95);

  const belly = mesh(
    new THREE.SphereGeometry(0.21, 12, 10),
    toon(0xf3e8ff, 0xd8b4fe, 0.2),
    [0, 0.3, 0.13],
  );

  const eyeWhiteMat = glow(0xffffff, 1);
  const pupilMat = glow(0x1e1b4b, 1);
  const leftEye = mesh(new THREE.SphereGeometry(0.065, 10, 10), eyeWhiteMat, [-0.1, 0.42, 0.22]);
  const rightEye = mesh(new THREE.SphereGeometry(0.065, 10, 10), eyeWhiteMat, [0.1, 0.42, 0.22]);
  const leftPupil = mesh(new THREE.SphereGeometry(0.032, 8, 8), pupilMat, [-0.1, 0.42, 0.27]);
  const rightPupil = mesh(new THREE.SphereGeometry(0.032, 8, 8), pupilMat, [0.1, 0.42, 0.27]);

  const beak = mesh(
    new THREE.ConeGeometry(0.06, 0.14, 6),
    toon(0xfacc15, 0xd97706, 0.4),
    [0, 0.36, 0.3],
  );
  beak.rotation.x = Math.PI / 2;

  const wingGeo = new THREE.BoxGeometry(0.12, 0.25, 0.18);
  const wingMat = toon(0x7e22ce, 0x581c87, 0.28);
  const wingLeft = mesh(wingGeo, wingMat, [-0.31, 0.34, 0]);
  const wingRight = mesh(wingGeo, wingMat, [0.31, 0.34, 0]);

  // Soft ambient glow aura shell + ground ring
  const auraMat = glow(0xc084fc, 0.42, true);
  const auraShellMesh = mesh(new THREE.SphereGeometry(0.46, 14, 12), auraMat, [0, 0.35, 0]);
  auraShellMesh.name = 'LumiAmbientGlowAuraShell';

  const auraRingMesh = mesh(new THREE.RingGeometry(0.32, 0.46, 24), auraMat, [0, 0.04, 0]);
  auraRingMesh.rotation.x = -Math.PI / 2;
  auraRingMesh.name = 'LumiAmbientGlowRing';

  const label = safeTextSprite(labelText, {
    color: '#f3e8ff',
    bg: 'rgba(59, 7, 100, 0.85)',
    border: '#c084fc',
    height: 0.24,
  });
  label.position.set(0, 0.86, 0);

  petMeshGroup.add(
    body,
    belly,
    leftEye,
    rightEye,
    leftPupil,
    rightPupil,
    beak,
    wingLeft,
    wingRight,
    auraShellMesh,
    auraRingMesh,
    label,
  );

  // GPU `THREE.Points` movement particle trail (pre-allocated ring buffer)
  const trailPositions = new Float32Array(trailCount * 3);
  const trailAges = new Float32Array(trailCount);
  for (let i = 0; i < trailCount; i++) {
    trailPositions[i * 3] = basePos[0];
    trailPositions[i * 3 + 1] = basePos[1] + 0.32;
    trailPositions[i * 3 + 2] = basePos[2];
    trailAges[i] = i / trailCount;
  }

  const trailGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(trailPositions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const ageAttr = new THREE.BufferAttribute(trailAges, 1);
  ageAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', posAttr);
  trailGeo.setAttribute('aAge', ageAttr);

  const trailMat = new THREE.ShaderMaterial({
    uniforms: {
      uPointSize: { value: 9.0 },
      uTrailColor: { value: new THREE.Color(0xc084fc) },
    },
    vertexShader: LUMI_TRAIL_VERTEX_SHADER,
    fragmentShader: LUMI_TRAIL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const trailPoints = new THREE.Points(trailGeo, trailMat);
  trailPoints.name = 'LumiMovementParticleTrail';
  trailPoints.frustumCulled = false;
  group.add(trailPoints);

  let currentPetState: PetState = 'idle';
  let anchorX = basePos[0];
  let anchorY = basePos[1];
  let anchorZ = basePos[2];
  let spawnCursor = 0;
  let spawnTimer = 0;

  return {
    group,
    petMeshGroup,
    auraShellMesh,
    auraRingMesh,
    auraMat,
    bodyMat,
    wingLeft,
    wingRight,
    trailPoints,

    getPetState() {
      return currentPetState;
    },

    setPetState(state: PetState) {
      currentPetState = state;
      const trailColor = trailMat.uniforms.uTrailColor.value as THREE.Color;
      if (state === 'listening') {
        auraMat.color.setHex(0x34d399);
        auraMat.opacity = 0.62;
        bodyMat.emissive.setHex(0x059669);
        trailColor.setHex(0x34d399);
      } else if (state === 'celebrate') {
        auraMat.color.setHex(0xfacc15);
        auraMat.opacity = 0.72;
        bodyMat.emissive.setHex(0xd97706);
        trailColor.setHex(0xfacc15);
      } else if (state === 'coach') {
        auraMat.color.setHex(0xfb923c);
        auraMat.opacity = 0.58;
        bodyMat.emissive.setHex(0xea580c);
        trailColor.setHex(0xfb923c);
      } else {
        auraMat.color.setHex(0xc084fc);
        auraMat.opacity = 0.42;
        bodyMat.emissive.setHex(0x6b21a8);
        trailColor.setHex(0xc084fc);
      }
    },

    setBasePosition(x: number, y: number, z: number) {
      anchorX = x;
      anchorY = y;
      anchorZ = z;
    },

    update(dt: number, t: number) {
      const sample = computeLumiBobCurve(t, currentPetState);
      const curX = anchorX + sample.swayX;
      const curY = anchorY + sample.offsetY;
      const curZ = anchorZ + Math.cos(t * 1.35) * 0.04;

      petMeshGroup.position.set(curX, curY, curZ);
      petMeshGroup.rotation.x = sample.pitchX;
      petMeshGroup.rotation.z = sample.rollZ;

      wingLeft.rotation.z = sample.wingAngle;
      wingRight.rotation.z = -sample.wingAngle;
      auraShellMesh.scale.setScalar(sample.auraPulse);
      auraRingMesh.scale.setScalar(0.95 + (sample.auraPulse - 1.0) * 1.4);

      // Update trail ages and spawn next ring-buffer particle along Lumi's floating path
      spawnTimer += dt;
      const spawnInterval = currentPetState === 'celebrate' ? 0.03 : 0.055;
      if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        const idx = spawnCursor % trailCount;
        spawnCursor = (spawnCursor + 1) % trailCount;
        const jitter = ((idx % 5) - 2) * 0.025;
        trailPositions[idx * 3] = curX + jitter;
        trailPositions[idx * 3 + 1] = curY + 0.28;
        trailPositions[idx * 3 + 2] = curZ - 0.06;
        trailAges[idx] = 0.0;
      }

      for (let i = 0; i < trailCount; i++) {
        trailAges[i] = Math.min(1.0, trailAges[i] + dt * 0.95);
        trailPositions[i * 3 + 1] += dt * 0.18;
      }
      posAttr.needsUpdate = true;
      ageAttr.needsUpdate = true;
    },

    dispose() {
      disposeObject(group);
    },
  };
}
