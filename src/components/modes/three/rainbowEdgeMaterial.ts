'use client';

import * as THREE from 'three';
import { RAINBOW_FRAGMENT, rainbowDefaults, type RainbowEdgeParams, type RainbowShape } from '../../fx/rainbowEdgeCore';

// RainbowEdge inside a 3D scene (D6.4 portal ring, or a question board standing in the world): the
// SAME fragment shader as the DOM component, on a plane. Sizes are in "virtual px" over the plane
// (pxPerUnit), so a portal and the question frame look alike.

export interface RainbowEdgeMesh {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** Call every frame with the scene time (s). */
  update: (t: number) => void;
  setBloom: (on: boolean) => void;
  dispose: () => void;
}

export function createRainbowEdgeMesh(o: { shape?: RainbowShape; size: [number, number]; pxPerUnit?: number; params?: Partial<RainbowEdgeParams>; still?: boolean }): RainbowEdgeMesh {
  const shape = o.shape ?? 'circle';
  const ppu = o.pxPerUnit ?? 120;
  let p = rainbowDefaults(shape, o.params);
  const glowUnits = p.glow / ppu;
  const w = o.size[0] + glowUnits * 2;
  const h = o.size[1] + glowUnits * 2;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(w * ppu, h * ppu) },
      uShape: { value: shape === 'circle' ? 1 : 0 },
      uRadius: { value: p.radius },
      uWidth: { value: p.width },
      uGlow: { value: p.glow },
      uSpeed: { value: p.speed },
      uSparkle: { value: p.sparkles ? 1 : 0 },
      uInner: { value: p.inner },
      uOpacity: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: RAINBOW_FRAGMENT,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = 10;
  return {
    mesh,
    update(t) {
      if (!o.still) mat.uniforms.uTime.value = t;
    },
    setBloom(on) {
      p = rainbowDefaults(shape, { ...o.params, bloom: on });
      mat.uniforms.uSpeed.value = p.speed;
    },
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
