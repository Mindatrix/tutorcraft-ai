// RainbowEdge core (phase C4.1 + D6.4): ONE light-edge effect for the question frame of all six
// games (rounded rectangle, one lap ≈ 4 s) and the Multiverse portal ring (circle, sparkles,
// faster while the portal blooms). The same fragment shader runs in the DOM component
// (RainbowEdge.tsx, its own tiny WebGL canvas) and in a 3D scene (rainbowEdgeMaterial.ts,
// a three.js ShaderMaterial); weak devices and the 2D tier use the CSS conic version instead.
// No three.js import here: safe for any page bundle.

export type RainbowShape = 'rect' | 'circle';

/** The seven colours of the band (CSS fallback and the shader's palette). */
export const RAINBOW_COLORS = ['#ff4d6d', '#ff9f1c', '#ffe066', '#5eea8a', '#38bdf8', '#6366f1', '#c084fc'] as const;

/** One lap of the light around the edge. */
export const RAINBOW_PERIOD_MS: Record<RainbowShape, number> = { rect: 4000, circle: 2600 };
/** While a portal blooms the band runs this much faster. */
export const RAINBOW_BLOOM_SPEEDUP = 2.6;

export interface RainbowEdgeParams {
  shape: RainbowShape;
  /** Border width (px). */
  width: number;
  /** Corner radius (px, rect only). */
  radius: number;
  /** How far the glow reaches outside the edge (px). */
  glow: number;
  /** Laps per second. */
  speed: number;
  /** Sparkles around the ring (circle). */
  sparkles: boolean;
  /** Darkness of the inside (0 = clear, 1 = black at the centre); brighter towards the edge. */
  inner: number;
}

export function rainbowDefaults(shape: RainbowShape, o: Partial<RainbowEdgeParams> & { bloom?: boolean } = {}): RainbowEdgeParams {
  const lap = RAINBOW_PERIOD_MS[shape] / 1000;
  return {
    shape,
    width: o.width ?? (shape === 'rect' ? 3 : 6),
    radius: o.radius ?? 14,
    glow: o.glow ?? (shape === 'rect' ? 18 : 30),
    speed: o.speed ?? (1 / lap) * (o.bloom ? RAINBOW_BLOOM_SPEEDUP : 1),
    sparkles: o.sparkles ?? shape === 'circle',
    inner: o.inner ?? (shape === 'rect' ? 0.38 : 0.2),
  };
}

const PALETTE_GLSL = RAINBOW_COLORS.map((h, i) => {
  const n = parseInt(h.slice(1), 16);
  return `c[${i}] = vec3(${((n >> 16) & 255) / 255}, ${((n >> 8) & 255) / 255}, ${(n & 255) / 255});`;
}).join(' ');

/**
 * Shared fragment body. Inputs: vUv (0..1 over the drawing area = the box plus `glow` on each side)
 * and uRes (that area in px). Output: straight (not premultiplied) alpha.
 */
export const RAINBOW_FRAGMENT = `
uniform float uTime;
uniform vec2 uRes;
uniform float uShape;
uniform float uRadius;
uniform float uWidth;
uniform float uGlow;
uniform float uSpeed;
uniform float uSparkle;
uniform float uInner;
uniform float uOpacity;
varying vec2 vUv;

vec3 band(float x) {
  vec3 c[8];
  ${PALETTE_GLSL}
  c[7] = c[0];
  float f = fract(x) * 7.0;
  float k = smoothstep(0.0, 1.0, fract(f));
  vec3 a = c[0];
  vec3 b = c[1];
  for (int j = 0; j < 7; j++) {
    if (float(j) == floor(f)) { a = c[j]; b = c[j + 1]; }
  }
  return mix(a, b, k);
}

float sdRound(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }

void main() {
  vec2 p = (vUv - 0.5) * uRes;
  vec2 halfBox = uRes * 0.5 - vec2(uGlow);
  float d = uShape < 0.5 ? sdRound(p, halfBox, min(uRadius, min(halfBox.x, halfBox.y))) : length(p) - min(halfBox.x, halfBox.y);
  float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
  float t = uTime * uSpeed;
  vec3 col = band(ang - t);
  // A brighter streak runs around with the band.
  float streak = pow(0.5 + 0.5 * cos(6.2831853 * (ang - fract(t))), 18.0);
  // The coloured border, just inside the edge.
  float edge = 1.0 - smoothstep(uWidth * 0.5 - 0.75, uWidth * 0.5 + 0.75, abs(d + uWidth * 0.5));
  // Soft light outside.
  float glow = d > 0.0 ? exp(-d / max(1.0, uGlow * 0.38)) * (0.55 + 0.45 * streak) : 0.0;
  // Inside: dimmed, brighter (and tinted) towards the edge.
  float inside = d < 0.0 ? 1.0 : 0.0;
  float nearEdge = exp(d / max(1.0, uGlow * 0.9));
  vec3 rgb = col * (edge * (1.0 + streak * 0.8) + glow) + col * nearEdge * 0.35 * inside;
  float a = clamp(edge + glow * 0.85 + inside * (uInner * (1.0 - nearEdge * 0.7) + nearEdge * 0.18), 0.0, 1.0);
  if (uSparkle > 0.5) {
    float R = min(halfBox.x, halfBox.y);
    for (int i = 0; i < 22; i++) {
      float fi = float(i);
      float th = fi / 22.0 * 6.2831853 + uTime * (0.5 + hash(fi) * 0.9) * (uSpeed * 2.0);
      float rr = R + (hash(fi + 7.0) * 2.0 - 1.0) * uGlow * 0.7;
      vec2 sp = vec2(cos(th), sin(th)) * rr;
      float tw = 0.5 + 0.5 * sin(uTime * (3.0 + hash(fi + 3.0) * 4.0) + fi);
      float s = smoothstep(2.6, 0.0, length(p - sp)) * tw;
      rgb += vec3(1.0, 0.97, 0.85) * s;
      a = max(a, s);
    }
  }
  gl_FragColor = vec4(clamp(rgb / max(a, 0.001), 0.0, 1.0), a * uOpacity);
}
`;

/** Vertex shader of the DOM canvas: one full-canvas quad. */
export const RAINBOW_VERTEX_RAW = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/**
 * CSS version (weak devices, 2D tier): a conic gradient turning with a registered custom property,
 * shown only on the border ring by a mask. Same colours and lap time.
 */
export function rainbowConic(angleVar = '--tc-rainbow-a'): string {
  const stops = [...RAINBOW_COLORS, RAINBOW_COLORS[0]].join(', ');
  return `conic-gradient(from var(${angleVar}, 0deg), ${stops})`;
}
