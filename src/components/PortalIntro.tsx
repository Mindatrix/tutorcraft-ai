'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Full-screen "step through the portal" intro (~1.6 s) before a match.
 * Uses the Magic_Portal ring from /models/portal_scene.glb (falls back to a torus).
 * Calls onDone when finished or if WebGL is unavailable, so it never blocks the game.
 */
export default function PortalIntro({ onDone, duration = 1600 }: { onDone: () => void; duration?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      done.current();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.1, 100);
    const ring = new THREE.Group();
    scene.add(ring);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8b7bff });
    const fallback = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.15, 16, 64), mat);
    ring.add(fallback);
    new GLTFLoader().loadAsync('/models/portal_scene.glb').then((g) => {
      const node = g.scene.getObjectByName('Magic_Portal');
      if (!node) return;
      const m = node.clone(true);
      m.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat; });
      // The glb bakes its placement into the vertices: centre it and stand the ring up facing the camera.
      m.position.set(0, 0, 0);
      m.quaternion.identity();
      m.scale.set(1, 1, 1);
      const box = new THREE.Box3().setFromObject(m);
      const c = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      m.position.sub(c);
      holder.add(m);
      holder.rotation.x = Math.PI / 2;
      const m2 = holder;
      ring.remove(fallback);
      ring.add(m2);
    }).catch(() => undefined);

    // Disc inside the ring + sparkles around it.
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), new THREE.MeshBasicMaterial({ color: 0x1e1b4b, transparent: true, opacity: 0.9 }));
    disc.position.z = -0.01;
    scene.add(disc);
    const N = 260;
    const pos = new Float32Array(N * 3);
    const seed = Array.from({ length: N }, () => ({ a: Math.random() * Math.PI * 2, r: 1.2 + Math.random() * 1.6, z: (Math.random() - 0.5) * 2, s: 0.5 + Math.random() }));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfbbf24, size: 0.06, transparent: true, opacity: 0.9 }));
    scene.add(pts);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = reduce ? 300 : duration;
    const t0 = performance.now();
    let raf = 0;
    let finished = false;
    const fade = el.querySelector<HTMLElement>('[data-fade]');
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / total);
      const e = k * k * (3 - 2 * k);
      cam.position.set(0, 0, 6 - e * 7.5); // fly through the ring
      cam.lookAt(0, 0, -2);
      ring.rotation.z = now * 0.0006;
      disc.visible = cam.position.z > 0.2;
      seed.forEach((p, i) => {
        const a = p.a + now * 0.001 * p.s;
        pos[i * 3] = Math.cos(a) * p.r;
        pos[i * 3 + 1] = Math.sin(a) * p.r;
        pos[i * 3 + 2] = p.z;
      });
      geo.attributes.position.needsUpdate = true;
      if (fade) fade.style.opacity = String(Math.max(0, (k - 0.7) / 0.3));
      renderer.render(scene, cam);
      if (k < 1) raf = requestAnimationFrame(frame);
      else if (!finished) { finished = true; done.current(); }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      geo.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [duration]);

  return (
    <div ref={host} className="fixed inset-0 z-50 bg-slate-950" role="status" aria-label="Đang vào đấu trường">
      <div data-fade className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: 0 }} />
      <div className="absolute bottom-8 inset-x-0 text-center text-sm text-slate-300">Đang vào đấu trường…</div>
    </div>
  );
}
