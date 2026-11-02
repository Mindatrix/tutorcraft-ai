'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { loadGltf } from '../modes/three/assetLoader';

// One WebGL canvas for the whole character grid (WP10 U6, 02/11/2026). It sits over the active card
// (hovered, else selected) and turns that character a full 360° every 7 s; the other cards are
// pre-rendered images. Animated models play an idle-like clip; the rest turn in their pose.
// The card's own image stays underneath until the model is in, so a slow load never shows a hole.

const TURN_SEC = 7;
const CLIP_ORDER = [/idle/i, /stand/i, /breath/i, /walk/i];

export interface SpinnerTarget {
  /** Card element to cover (its offset inside the grid's scroll box). */
  el: HTMLElement;
  url: string;
}

export default function CharacterSpinner({ target, onReady }: { target: SpinnerTarget | null; onReady?: (url: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ show: (t: SpinnerTarget | null) => void } | null>(null);
  const readyCb = useRef(onReady);
  useEffect(() => {
    readyCb.current = onReady;
  });

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    // A fresh canvas per mount: React's dev double-mount would otherwise reuse a lost context.
    const cv = document.createElement('canvas');
    cv.className = 'tc-demo-spin';
    cv.setAttribute('aria-hidden', 'true');
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the cards keep their images
    }
    box.appendChild(cv);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-2, 3, 4);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    const pivot = new THREE.Group();
    scene.add(pivot);
    let mixer: THREE.AnimationMixer | null = null;
    let current = '';
    let raf = 0;
    let last = performance.now();
    let alive = true;
    let lastT: SpinnerTarget | null = null;
    const onResize = () => lastT && place(lastT.el);
    window.addEventListener('resize', onResize);

    const place = (el: HTMLElement) => {
      cv.style.left = `${el.offsetLeft}px`;
      cv.style.top = `${el.offsetTop}px`;
      cv.style.width = `${el.offsetWidth}px`;
      cv.style.height = `${el.offsetHeight}px`;
      renderer.setSize(el.offsetWidth, el.offsetHeight, false);
      camera.aspect = el.offsetWidth / Math.max(1, el.offsetHeight);
      camera.updateProjectionMatrix();
    };

    const show = (t: SpinnerTarget | null) => {
      lastT = t;
      if (!t) {
        cv.style.opacity = '0';
        current = '';
        return;
      }
      place(t.el);
      if (t.url === current) return;
      current = t.url;
      cv.style.opacity = '0';
      const want = t.url;
      loadGltf(want)
        .then((g) => {
          if (!alive || current !== want) return;
          pivot.clear();
          mixer?.stopAllAction();
          mixer = null;
          const model = g.scene;
          model.position.set(0, 0, 0);
          model.scale.setScalar(1);
          model.rotation.set(0, 0, 0);
          pivot.rotation.y = -0.5;
          const clip = CLIP_ORDER.map((re) => g.animations.find((a) => re.test(a.name))).find(Boolean) ?? g.animations[0];
          if (clip) {
            mixer = new THREE.AnimationMixer(model);
            mixer.clipAction(clip).play();
            mixer.update(0);
          }
          // Fit: feet on the floor, height ~75% of the card (the name stays readable under it).
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const centre = box.getCenter(new THREE.Vector3());
          const s = 1 / Math.max(size.y, size.x * 0.8, 1e-3);
          model.scale.setScalar(s);
          model.position.set(-centre.x * s, -box.min.y * s, -centre.z * s);
          pivot.add(model);
          const dist = 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / 0.75;
          camera.position.set(0, 0.6, dist);
          camera.lookAt(0, 0.56, 0);
          cv.style.opacity = '1';
          readyCb.current?.(want);
        })
        .catch(() => {
          if (current === want) current = '';
        });
    };
    api.current = { show };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (current && cv.style.opacity === '1') {
        pivot.rotation.y += (dt * Math.PI * 2) / TURN_SEC;
        mixer?.update(dt);
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      alive = false;
      api.current = null;
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      mixer?.stopAllAction();
      pivot.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      cv.remove();
    };
  }, []);

  useEffect(() => {
    api.current?.show(target);
  }, [target]);

  // display: contents, so the canvas is placed against the grid's scroll box.
  return <div ref={host} style={{ display: 'contents' }} />;
}
