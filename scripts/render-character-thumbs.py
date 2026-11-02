"""Character card thumbnails (WP10 U6, 02/11/2026), run by scripts/render-character-thumbs.mjs.

  Blender --background --python scripts/render-character-thumbs.py -- <list.json> <out dir> [--size 320]

<list.json>: [{"id": "...", "glb": "/abs/path.glb"}, ...]. Writes <out dir>/<id>.png: the character
from the front-left (3/4 view, like the card's resting angle), transparent background, framed to its
height. Animated files are posed on frame 1 of their first clip; rigged files without clips stay in
their bind pose.
"""
import bpy, json, math, os, sys, time
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    print('Dùng: Blender --background --python scripts/render-character-thumbs.py -- <list.json> <thư mục ảnh> [--size 320]')
    sys.exit(1)
LIST, OUT = os.path.expanduser(argv[0]), os.path.expanduser(argv[1])
SIZE = int(argv[argv.index('--size') + 1]) if '--size' in argv else 320
os.makedirs(OUT, exist_ok=True)
items = json.load(open(LIST))


def setup():
    scn = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scn.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    scn.render.resolution_x = scn.render.resolution_y = SIZE
    scn.render.film_transparent = True
    scn.render.image_settings.file_format = 'PNG'
    scn.render.image_settings.color_mode = 'RGBA'
    scn.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('w')
    scn.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.75, 0.8, 0.88, 1)
    bg.inputs[1].default_value = 1.1
    for name, energy, rot in (('key', 3.2, (50, 0, -35)), ('rim', 1.6, (60, 0, 160))):
        sun = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        sun.data.energy = energy
        sun.rotation_euler = tuple(math.radians(a) for a in rot)
        scn.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 70
    scn.collection.objects.link(cam)
    scn.camera = cam
    return cam


done, failed = 0, []
t_all = time.time()
for it in items:
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        cam = setup()
        bpy.ops.import_scene.gltf(filepath=it['glb'])
        scn = bpy.context.scene
        arms = [o for o in scn.objects if o.type == 'ARMATURE']
        for a in arms:
            if a.animation_data and a.animation_data.action:
                start = int(a.animation_data.action.frame_range[0])
                scn.frame_set(start)
        bone_shapes = {pb.custom_shape for a in arms for pb in a.pose.bones if pb.custom_shape}
        meshes = [o for o in scn.objects if o.type == 'MESH' and o not in bone_shapes]
        for s in bone_shapes:
            if s:
                s.hide_render = True
        dg = bpy.context.evaluated_depsgraph_get()
        lo = Vector((math.inf,) * 3)
        hi = Vector((-math.inf,) * 3)
        for o in meshes:
            ev = o.evaluated_get(dg)
            m = ev.to_mesh()
            for v in m.vertices:
                w = ev.matrix_world @ v.co
                lo = Vector(map(min, lo, w))
                hi = Vector(map(max, hi, w))
            ev.to_mesh_clear()
        center = (lo + hi) / 2
        h = max(hi.z - lo.z, (hi - lo).length * 0.6, 1e-3)
        # glTF +Z (front) becomes Blender −Y: camera in front, a little to the left and above.
        d = h * 2.3
        cam.location = center + Vector((-d * 0.42, -d, d * 0.18))
        cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.clip_end = d * 10
        scn.render.filepath = os.path.join(OUT, it['id'] + '.png')
        bpy.ops.render.render(write_still=True)
        done += 1
    except Exception as e:  # keep going: report the file
        failed.append({'id': it['id'], 'error': str(e)[:200]})
print(json.dumps({'done': done, 'failed': failed, 'seconds': round(time.time() - t_all, 1)}))
