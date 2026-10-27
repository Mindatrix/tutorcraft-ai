'use client';

import * as THREE from 'three';

// Names of a whole class in ONE draw call (plan C2.4): every name is drawn once into a cell of a
// shared canvas atlas, and an instanced quad per student faces the camera and samples its cell.
// A name tag costs no extra draw call or texture, so 50 tags cost the same as one.

export class NameBoard {
  readonly mesh: THREE.InstancedMesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private cellAttr: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private texts: string[] = [];
  readonly cellW = 256;
  readonly cellH = 64;
  readonly cols: number;

  constructor(readonly max = 64, opts: { width?: number; height?: number } = {}) {
    this.cols = 8;
    const rows = Math.ceil(max / this.cols);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols * this.cellW;
    this.canvas.height = rows * this.cellH;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1, 1);
    const cells = new Float32Array(max * 4);
    this.cellAttr = new THREE.InstancedBufferAttribute(cells, 4);
    geo.setAttribute('aCell', this.cellAttr);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: this.texture }, uSize: { value: new THREE.Vector2(opts.width ?? 1.6, opts.height ?? 0.4) } },
      vertexShader: /* glsl */ `
        attribute vec4 aCell;
        uniform vec2 uSize;
        varying vec2 vUv;
        void main() {
          vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 p = center + right * position.x * uSize.x + up * position.y * uSize.y;
          vUv = vec2(mix(aCell.x, aCell.z, uv.x), mix(aCell.y, aCell.w, uv.y));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec2 vUv;
        void main() { vec4 c = texture2D(map, vUv); if (c.a < 0.08) discard; gl_FragColor = c; }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'name-board';
  }

  /** Draw (or redraw) the tag of slot `i`: name on a bar of the student's colour, optional second line. */
  set(i: number, name: string, color: string, sub?: string) {
    const key = `${name}|${color}|${sub ?? ''}`;
    if (this.texts[i] === key) return;
    this.texts[i] = key;
    const x = (i % this.cols) * this.cellW;
    const y = Math.floor(i / this.cols) * this.cellH;
    const c = this.ctx;
    c.clearRect(x, y, this.cellW, this.cellH);
    c.fillStyle = 'rgba(15,23,42,0.82)';
    c.fillRect(x + 4, y + 6, this.cellW - 8, this.cellH - 12);
    c.fillStyle = color;
    c.fillRect(x + 4, y + 6, 14, this.cellH - 12);
    c.fillStyle = '#ffffff';
    c.font = `800 ${sub ? 22 : 28}px "Be Vietnam Pro", system-ui, sans-serif`;
    c.textBaseline = 'middle';
    let text = name;
    while (text.length > 1 && c.measureText(text).width > this.cellW - 34) text = text.slice(0, -1);
    c.fillText(text === name ? name : `${text}…`, x + 26, y + (sub ? 24 : this.cellH / 2));
    if (sub) {
      c.font = '700 18px "Be Vietnam Pro", system-ui, sans-serif';
      c.fillStyle = '#fde68a';
      c.fillText(sub, x + 26, y + 46);
    }
    const W = this.canvas.width;
    const H = this.canvas.height;
    // Canvas y goes down, UV v goes up.
    this.cellAttr.setXYZW(i, x / W, 1 - (y + this.cellH) / H, (x + this.cellW) / W, 1 - y / H);
    this.cellAttr.needsUpdate = true;
    this.texture.needsUpdate = true;
  }

  place(i: number, pos: THREE.Vector3) {
    this.mesh.setMatrixAt(i, this.m.makeTranslation(pos.x, pos.y, pos.z));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (i >= this.mesh.count) this.mesh.count = i + 1;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
    this.mesh.dispose();
  }
}
