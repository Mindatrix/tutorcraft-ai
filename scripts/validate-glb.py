"""A3.3 — Kiểm tra GLB bằng Blender: hiện đen, thiếu chất liệu, ảnh hỏng, số mặt, kích thước.

Chạy (Blender 4.2+ đọc được meshopt + WebP):
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/validate-glb.py -- \
      <thư mục GLB> <tệp báo cáo .json> [--limit 100] [--only chuỗi] [--thumbs <thư mục ảnh>]

Ghi báo cáo JSON (mỗi tệp một dòng) và in danh sách tệp lỗi. --thumbs chụp ảnh 384 px mỗi model
(nền xám, đèn trời) để duyệt bằng mắt, ví dụ trước/sau khi tối ưu.
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

# A face is "dark" when its texture luminance is below DARK_LUM; a file is flagged when more than
# DARK_SHARE of its textured surface is dark (tuned on the whole library, 27/10/2026).
DARK_LUM = 0.12
DARK_SHARE = 0.4
# Looked at the renders: dark on purpose, not a defect. Add a file here only after checking its thumbnail.
DARK_OK = {
    'mv_minion_shadow': 'quái bóng tối, đen có chủ ý',
    'mv_ruin_building': 'phần tối là bên trong nhà đổ, mặt ngoài xám',
    'ground_soil_patch': 'đất ẩm màu sẫm',
    'char_crimson_kick': 'quần áo đen',
}

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    print('Dùng: Blender --background --python scripts/validate-glb.py -- <thư mục> <báo cáo.json> [--limit N] [--only s] [--thumbs dir]')
    sys.exit(1)
SRC, OUT = os.path.expanduser(argv[0]), os.path.expanduser(argv[1])
opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv and argv.index(k) + 1 < len(argv) else d
LIMIT = int(opt('--limit', '100000'))
ONLY = opt('--only')
THUMBS = opt('--thumbs')
THUMBS = os.path.expanduser(THUMBS) if THUMBS else None

files = []
for root, dirs, names in os.walk(SRC):
    dirs[:] = sorted(d for d in dirs if not d.startswith(('_', '.')))
    for n in sorted(names):
        if n.lower().endswith('.glb') and (not ONLY or ONLY in os.path.join(root, n)):
            files.append(os.path.join(root, n))
files = files[:LIMIT]


def luminance(rgba):
    r, g, b = rgba[:3]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def principled(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None


def linked_image(socket):
    """Image texture feeding a socket (through simple nodes such as Mix / Separate)."""
    seen = set()
    stack = [l.from_node for l in socket.links]
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        if n.type == 'TEX_IMAGE':
            return n.image
        for inp in n.inputs:
            stack.extend(l.from_node for l in inp.links)
    return None


def check_material(mat):
    issues = []
    bsdf = principled(mat)
    if bsdf is None:
        return ['chất liệu không có Principled BSDF']
    base = bsdf.inputs['Base Color']
    img = linked_image(base)
    if img is not None:
        if not img.has_data and img.size[0] == 0:
            issues.append(f'ảnh nền "{img.name}" hỏng/không đọc được')
    elif luminance(base.default_value) < 0.06:
        issues.append('màu nền gần đen, không có ảnh → HIỆN ĐEN')
    metal = bsdf.inputs['Metallic']
    if not metal.links and metal.default_value > 0.5 and linked_image(bsdf.inputs['Roughness']) is None:
        issues.append('kim loại 100% không có bản đồ độ bóng → HIỆN ĐEN khi thiếu HDRI')
    return issues


_pixels = {}


def image_pixels(img):
    """H×W×4 array of the image (cached per image; textures are shared between meshes)."""
    if img.name not in _pixels:
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        _pixels[img.name] = px.reshape(h, w, 4)
    return _pixels[img.name]


def dark_surface(meshes):
    """
    Share of the textured surface whose base-colour texture is near black, sampled at each face's UV
    centre and weighted by area. Catches what the material check cannot: a texture that exists but is
    black over large areas (27/10: Meshy baked two black backdrop panels into camp_grill).
    Returns None when no mesh has a base-colour texture.
    """
    dark_area = known_area = 0.0
    for o in meshes:
        me = o.data
        n = len(me.polygons)
        if not n or not me.uv_layers.active:
            continue
        area = np.empty(n, np.float32)
        me.polygons.foreach_get('area', area)
        start = np.empty(n, np.int32)
        me.polygons.foreach_get('loop_start', start)
        count = np.empty(n, np.int32)
        me.polygons.foreach_get('loop_total', count)
        mat = np.empty(n, np.int32)
        me.polygons.foreach_get('material_index', mat)
        uv = np.empty(len(me.loops) * 2, np.float32)
        me.uv_layers.active.data.foreach_get('uv', uv)
        centre = np.add.reduceat(uv.reshape(-1, 2), start, axis=0) / count[:, None]
        for i, slot in enumerate(o.material_slots):
            bsdf = principled(slot.material)
            img = linked_image(bsdf.inputs['Base Color']) if bsdf else None
            if img is None or not img.size[0]:
                continue
            sel = mat == i
            if not sel.any():
                continue
            px = image_pixels(img)
            h, w = px.shape[:2]
            x = ((centre[sel, 0] % 1) * (w - 1)).astype(int)
            y = ((centre[sel, 1] % 1) * (h - 1)).astype(int)
            c = px[y, x]
            lum = 0.2126 * c[:, 0] + 0.7152 * c[:, 1] + 0.0722 * c[:, 2]
            known_area += float(area[sel].sum())
            dark_area += float(area[sel][lum < DARK_LUM].sum())
    return dark_area / known_area if known_area > 0 else None


def setup_thumb_scene():
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
    scn.render.resolution_x = scn.render.resolution_y = 384
    scn.render.film_transparent = False
    world = bpy.data.worlds.new('w') if not scn.world else scn.world
    scn.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.62, 0.66, 0.7, 1)
        bg.inputs[1].default_value = 1.4
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scn.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    return cam


def frame(cam, lo, hi):
    center = (lo + hi) / 2
    size = max((hi - lo).length, 1e-3)
    d = size * 1.25
    cam.location = center + Vector((d * 0.75, -d * 0.95, d * 0.6))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = d * 10


report = []
t_all = time.time()
for i, f in enumerate(files):
    rel = os.path.relpath(f, SRC)
    entry = {'file': rel, 'mb': round(os.path.getsize(f) / 1e6, 2)}
    t0 = time.time()
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        _pixels.clear()  # image names ("Image_0"…) repeat from file to file
        bpy.ops.import_scene.gltf(filepath=f)
        # The glTF importer adds an "Icosphere" as the display shape of bones: not part of the file.
        bone_shapes = {pb.custom_shape for o in bpy.context.scene.objects if o.type == 'ARMATURE' for pb in o.pose.bones if pb.custom_shape}
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in bone_shapes]
        entry['meshes'] = len(meshes)
        entry['faces'] = sum(len(o.data.polygons) for o in meshes)
        issues = []
        if not meshes:
            issues.append('không có lưới (mesh) nào')
        lo = Vector((math.inf,) * 3)
        hi = Vector((-math.inf,) * 3)
        mats = set()
        for o in meshes:
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
            if not o.material_slots or all(s.material is None for s in o.material_slots):
                if not o.data.color_attributes:
                    issues.append(f'lưới "{o.name}" không có chất liệu và không có màu đỉnh → HIỆN XÁM/ĐEN')
            for s in o.material_slots:
                if s.material:
                    mats.add(s.material)
        for m in mats:
            for msg in check_material(m):
                issues.append(f'{m.name}: {msg}')
        if meshes:
            dims = hi - lo
            entry['size_m'] = [round(v, 3) for v in dims]
            biggest = max(dims)
            if biggest > 500:
                issues.append(f'quá lớn ({biggest:.0f} m) — có thể sai đơn vị')
            elif biggest < 0.01:
                issues.append(f'quá nhỏ ({biggest:.4f} m) — có thể sai đơn vị')
        # Rig scale: the root bone (hips) must sit inside the body. A rig exported without its 0.01
        # armature scale keeps the hips metres up (e.g. 58.9 m on a 1.3 m body) and plays every
        # animation 100× too big. (char_sunny_boy is in cm throughout and passes: its hips are inside.)
        for arm in [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']:
            if not arm.data.bones or not meshes:
                continue
            root = arm.data.bones[0]
            hips = (arm.matrix_world @ root.head_local).z
            body = max((hi - lo).z, 1e-3)
            if abs(hips) > body * 3:
                issues.append(f'xương sai tỉ lệ (hông ở {hips:.1f} m, thân cao {body:.2f} m): hoạt ảnh sẽ phóng to — xuất lại với tỉ lệ khung xương 0,01')
        entry['materials'] = len(mats)
        share = dark_surface(meshes)
        if share is not None:
            entry['dark_pct'] = round(share * 100, 1)
            if share > DARK_SHARE and os.path.splitext(os.path.basename(f))[0] not in DARK_OK:
                issues.append(f'{share * 100:.0f}% bề mặt phủ ảnh gần đen → HIỆN ĐEN TỪNG MẢNG (xem ảnh chụp; nếu tối có chủ ý thì thêm vào DARK_OK)')
        entry['issues'] = sorted(set(issues))
        if THUMBS and meshes:
            cam = setup_thumb_scene()
            frame(cam, lo, hi)
            out = os.path.join(THUMBS, os.path.splitext(rel)[0].replace(os.sep, '__') + '.png')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            bpy.context.scene.render.filepath = out
            bpy.ops.render.render(write_still=True)
            entry['thumb'] = out
    except Exception as e:  # noqa: BLE001 — report and continue with the next file
        entry['issues'] = [f'không mở được: {str(e)[:200]}']
    entry['sec'] = round(time.time() - t0, 1)
    report.append(entry)
    flag = '✗' if entry['issues'] else '✓'
    print(f"[{i + 1}/{len(files)}] {flag} {rel} · {entry.get('faces', '?')} mặt · {entry['sec']}s" + (f" — {'; '.join(entry['issues'])}" if entry['issues'] else ''), flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)

bad = [r for r in report if r['issues']]
print(f'XONG: {len(report)} tệp trong {time.time() - t_all:.0f}s, {len(bad)} tệp có lỗi → {OUT}')
