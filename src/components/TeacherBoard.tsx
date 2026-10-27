'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { avatarTemplate, avatarTemplates, AVATAR_COLORS, BOARD_LOD, lodLevels, type LodLevel, type MatchView } from '../engine';
import { createRuntime, type GfxTier, type RuntimeStats } from './modes/three/SceneRuntime';
import { LodAvatar } from './modes/three/avatar';
import { NameBoard } from './modes/three/nameBoard';

// The tutor's shared screen (plan C2.4): every student of the match as an avatar, grouped by team
// and squad, with name and stars above. Built to stay above 30 FPS with 50 students:
//  - three levels of detail (BOARD_LOD): the 14 students nearest the camera are full animated
//    models, the next 24 the ~5 k triangle file, the rest only a coloured ring + their name tag;
//  - all name tags are one draw call (NameBoard atlas), all rings another (instanced).
// Purely visual: the numbers come from the match view (server), nothing is decided here.

const SPACING = 2.4;

export type BoardStats = RuntimeStats & { models: number; lod: Record<LodLevel, number> };

export interface TeacherBoardProps {
  view: MatchView;
  tier?: GfxTier;
  /** Stats every 0.5 s (FPS, draw calls…), for the scene lab and the gate check. */
  onStats?: (s: BoardStats) => void;
}

interface Seat {
  id: string;
  pos: THREE.Vector3;
  color: string;
  model: string;
  avatar: LodAvatar | null;
  level: LodLevel;
}

/** Seats: teams side by side (left / right), squads as rows, the class in a grid otherwise. */
function seatsFor(view: MatchView): Map<string, THREE.Vector3> {
  const out = new Map<string, THREE.Vector3>();
  const active = view.roster.filter((p) => !p.left);
  const teams = Array.from(new Set(active.map((p) => p.team ?? '')));
  teams.forEach((team, ti) => {
    const members = active.filter((p) => (p.team ?? '') === team).sort((a, b) => (a.grp ?? 0) - (b.grp ?? 0) || a.nickname.localeCompare(b.nickname));
    const cols = Math.max(4, Math.ceil(Math.sqrt(members.length * 1.6)));
    const width = (cols - 1) * SPACING;
    const offset = teams.length > 1 ? (ti === 0 ? -1 : 1) * (width / 2 + 3) : 0;
    members.forEach((p, k) => {
      const row = Math.floor(k / cols);
      const col = k % cols;
      out.set(p.id, new THREE.Vector3(offset - width / 2 + col * SPACING + (row % 2) * 0.6, 0, -row * SPACING));
    });
  });
  return out;
}

export default function TeacherBoard({ view, tier = 'high', onStats }: TeacherBoardProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef(view);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    live.current = view;
  });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let rt: ReturnType<typeof createRuntime>;
    try {
      rt = createRuntime(el, { tier, lights: 'outdoor', sky: { gradient: [0x7cc4f5, 0xe7f5ff, 0x9ccf7a] }, fog: { color: 0xe7f5ff, near: 40, far: 120 }, fov: 45 });
    } catch {
      const msg = 'Thiết bị này không vẽ được 3D: dùng bảng điểm dạng chữ bên dưới.';
      const t = setTimeout(() => setError(msg), 0);
      return () => clearTimeout(t);
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8cc56a, roughness: 1 }));
    ground.receiveShadow = true;
    rt.scene.add(ground);
    const names = new NameBoard(64, { width: 2.3, height: 0.58 });
    rt.scene.add(names.mesh);
    const ringMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const rings = new THREE.InstancedMesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), ringMat, 64);
    rings.count = 0;
    rings.frustumCulled = false;
    rt.scene.add(rings);

    const seats = new Map<string, Seat>();
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const tmp = new THREE.Vector3();
    const templates = avatarTemplates(live.current.game);

    const sync = () => {
      const v = live.current;
      const pos = seatsFor(v);
      const ids = [...pos.keys()];
      ids.forEach((id, i) => {
        const p = v.roster.find((x) => x.id === id)!;
        const color = p.color ?? AVATAR_COLORS[i % AVATAR_COLORS.length].hex;
        const model = avatarTemplate(v.game, p.species)?.model ?? templates[i % templates.length].model;
        let seat = seats.get(id);
        if (!seat) {
          seat = { id, pos: pos.get(id)!, color, model, avatar: null, level: 'far' };
          seats.set(id, seat);
        }
        seat.pos.copy(pos.get(id)!);
        seat.color = color;
        const stars = v.scores.players[id] ?? 0;
        names.set(i, p.nickname, color, `★ ${stars}${p.online ? '' : ' · mất kết nối'}`);
        names.place(i, tmp.copy(seat.pos).setY(2.3));
        rings.setMatrixAt(i, m.makeTranslation(seat.pos.x, 0.03, seat.pos.z));
        rings.setColorAt(i, c.set(color));
      });
      rings.count = ids.length;
      names.mesh.count = ids.length;
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      for (const [id, seat] of seats) {
        if (!pos.has(id)) {
          seat.avatar?.dispose();
          seats.delete(id);
        }
      }
      // Camera frames the whole class.
      const box = new THREE.Box3();
      for (const s of seats.values()) box.expandByPoint(s.pos);
      if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        const span = Math.max(8, box.getSize(new THREE.Vector3()).length());
        rt.camera.position.set(center.x, span * 0.42 + 3, center.z + span * 0.62 + 4);
        rt.camera.lookAt(center.x, 0.8, center.z);
      }
    };
    sync();

    let lastSync = 0;
    let lastLod = -1;
    let lastStats = 0;
    rt.run((dt, t) => {
      if (t - lastSync > 1) {
        lastSync = t;
        sync();
      }
      // Level of detail every 0.5 s from the distance to the camera (models load on first need).
      if (t - lastLod > 0.5) {
        lastLod = t;
        const list = [...seats.values()];
        const levels = lodLevels(
          list.map((s) => s.pos.distanceTo(rt.camera.position)),
          BOARD_LOD,
        );
        list.forEach((s, k) => {
          s.level = levels[k];
          if (!s.avatar && s.level !== 'far') {
            s.avatar = new LodAvatar({ model: s.model, color: s.color, tintMix: 0.55, ring: false, height: 1.5, nearQuality: rt.tier });
            s.avatar.root.position.copy(s.pos);
            s.avatar.root.rotation.y = Math.atan2(rt.camera.position.x - s.pos.x, rt.camera.position.z - s.pos.z);
            rt.scene.add(s.avatar.root);
          }
          s.avatar?.setLevel(s.level);
        });
      }
      const recent = new Set(live.current.scores.recent);
      let models = 0;
      const lod: Record<LodLevel, number> = { near: 0, mid: 0, far: 0 };
      for (const s of seats.values()) {
        lod[s.level]++;
        if (!s.avatar?.shown) continue;
        models++;
        s.avatar.root.position.copy(s.pos);
        if (recent.has(s.id) && s.avatar.state === 'idle') s.avatar.setState('correct');
        s.avatar.update(dt);
      }
      if (onStats && t - lastStats > 0.5) {
        lastStats = t;
        onStats({ ...rt.stats(), models, lod });
      }
    });

    return () => {
      for (const s of seats.values()) s.avatar?.dispose();
      names.dispose();
      rings.dispose();
      rt.dispose();
    };
  }, [tier, onStats]);

  return (
    <div className="relative h-full w-full">
      <div ref={host} className="absolute inset-0" />
      {error && <p className="absolute inset-x-0 top-1/2 text-center text-sm text-slate-200">{error}</p>}
    </div>
  );
}
