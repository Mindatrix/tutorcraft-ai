"""Multiverse rooms at eye level (D6.1 review, 27/10/2026).

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/room-eye-views.py -- \
      <room.glb> <out dir> <id> <longest side in metres>

Scales the model so its longest horizontal side is that many metres (a 1.6 m person for scale),
stands a camera at eye height (1.6 m above the floor found below it) at three spots: the middle,
a third of the way to the front, a third of the way to a back corner, looking across the model.
Renders <id>_1.png … <id>_3.png and prints one JSON line per spot with what the eye sees:
  inside_solid  the eye is inside a closed mesh (first hits face away from it)
  ceiling_m     distance to something overhead (null = open sky)
  walls_5m      share of 16 horizontal directions that hit a surface within 5 m
  floor         a surface was found under the spot (else the model is not under the camera)
"""
import bpy, json, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out_dir, rid, size_m = argv[0], argv[1], argv[2], float(argv[3])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
roots = [o for o in bpy.context.scene.objects if o.parent is None]
dg = bpy.context.evaluated_depsgraph_get()


def bbox():
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


lo, hi = bbox()
span = max(hi.x - lo.x, hi.y - lo.y)
k = size_m / span
for o in roots:
    o.scale = o.scale * k
    o.location = o.location * k
bpy.context.view_layer.update()
lo, hi = bbox()
shift = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
for o in roots:
    o.location = o.location + shift
bpy.context.view_layer.update()
lo, hi = bbox()
dg = bpy.context.evaluated_depsgraph_get()
scene = bpy.context.scene


def cast(origin, direction, dist):
    hit, loc, normal, _i, _o, _m = scene.ray_cast(dg, origin, direction, distance=dist)
    return (hit, loc, normal)


cam_data = bpy.data.cameras.new('eye')
cam_data.lens = 20
cam_data.clip_start = 0.05
cam_data.clip_end = max(500, size_m * 4)
cam = bpy.data.objects.new('eye', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'TEXTURE'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.render.resolution_x = 960
scene.render.resolution_y = 600
scene.world = bpy.data.worlds.new('w')
scene.world.color = (0.62, 0.75, 0.86)
scene.display.shading.background_type = 'WORLD'

w, d = hi.x - lo.x, hi.y - lo.y
# The model is centred on the origin: middle, a third in from the front (-y), a third in from a back corner.
spots = [
    ('giữa', Vector((0, 0)), Vector((0, 1))),
    ('phía trước', Vector((0, lo.y + d / 3)), Vector((0, 1))),
    ('góc sau', Vector((hi.x - w / 3, hi.y - d / 3)), Vector((-0.6, -1))),
]

for n, (name, xy, look) in enumerate(spots, 1):
    top = hi.z + 10
    # Every surface on the vertical line through the spot, top to bottom.
    hits = []
    probe = Vector((xy.x, xy.y, top))
    for _ in range(40):
        h, l, nrm = cast(probe, Vector((0, 0, -1)), probe.z - lo.z + 10)
        if not h:
            break
        hits.append((l.copy(), nrm.copy()))
        probe = l - Vector((0, 0, 0.01))
    hit = bool(hits)
    # Stand on the LOWEST upward-facing surface with 1.9 m of headroom (a ground floor or a room
    # floor under a roof), not on the first roof the ray meets.
    floors = [l for l, nrm in hits if nrm.z > 0.5]
    z = 0.0
    for l in sorted(floors, key=lambda v: v.z):
        above, _l2, _n2 = cast(l + Vector((0, 0, 0.02)), Vector((0, 0, 1)), 1.9)
        if not above:
            z = l.z
            break
    else:
        z = floors[0].z if floors else 0.0
    eye = Vector((xy.x, xy.y, z + 1.6))
    look3 = Vector((look.x, look.y, -0.08)).normalized()
    cam.location = eye
    cam.rotation_euler = look3.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    # What the eye sees.
    up_hit, up_loc, _ = cast(eye, Vector((0, 0, 1)), 50)
    near, inside = 0, 0
    for i in range(16):
        a = 2 * math.pi * i / 16
        dvec = Vector((math.cos(a), math.sin(a), 0))
        h, l, nrm = cast(eye, dvec, 5.0)
        if h:
            near += 1
            if nrm.dot(dvec) > 0:
                inside += 1
    scene.render.filepath = f'{out_dir}/{rid}_{n}.png'
    bpy.ops.render.render(write_still=True)
    print('ROOMVIEW ' + json.dumps({
        'id': rid, 'spot': n, 'name': name, 'size_m': size_m,
        'model_m': [round(w, 1), round(d, 1), round(hi.z - lo.z, 1)],
        'eye': [round(eye.x, 2), round(eye.y, 2), round(eye.z, 2)],
        'floor': bool(hit), 'stand_z': round(z, 2),
        'ceiling_m': round(up_loc.z - eye.z, 2) if up_hit else None,
        'walls_5m': round(near / 16, 2), 'inside_solid': inside >= 8,
    }, ensure_ascii=False))
