# TutorCraft character kit builder (run inside Blender: exec(open(path).read()))
# Every piece shares ONE coordinate frame (adult chibi, ~1.0 tall, faces -Y in Blender = +Z in glTF),
# so pieces can be stacked at the origin. Colour slots are named materials (M_skin, M_hair, M_primary,
# M_secondary, M_eye) that the web app tints at runtime. Age is a uniform scale applied at runtime.
import bpy, bmesh, math, json, os
from mathutils import Matrix, Vector, Euler

OUT = os.environ.get("KIT_OUT", "/Users/mindatix100/tutorcraft-ai/public/models/kit")
for sub in ("body", "hair", "outfit", "prop", "acc"):
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)

sc = bpy.data.scenes.get("CharKit") or bpy.data.scenes.new("CharKit")
bpy.context.window.scene = sc
for o in list(sc.objects): bpy.data.objects.remove(o, do_unlink=True)

MCOL = {"M_skin": (.85,.65,.5), "M_hair": (.2,.15,.1), "M_primary": (.8,.2,.2), "M_secondary": (.2,.3,.7),
        "M_eye": (.04,.04,.05), "M_shoe": (.12,.1,.1), "M_metal": (.6,.62,.66), "M_white": (.95,.95,.95),
        "M_wood": (.45,.3,.15), "M_glass": (.5,.7,.8)}
M = {}
for n, c in MCOL.items():
    m = bpy.data.materials.get(n) or bpy.data.materials.new(n)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*c, 1)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .8
    M[n] = m

OBJ = []
H = Vector((0, .005, .74))

def S(kind, loc, s, mat, rot=(0,0,0), seg=8, r2=0.0, name=None):
    bm = bmesh.new()
    if kind == "sphere": bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg//2+1), radius=1)
    elif kind == "box":  bmesh.ops.create_cube(bm, size=2)
    elif kind == "cyl":  bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=1, radius2=1, depth=2)
    elif kind == "cone": bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=1, radius2=r2, depth=2)
    sx, sy, sz = s if isinstance(s, (tuple, list)) else (s, s, s)
    mat4 = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1))
    bmesh.ops.transform(bm, matrix=mat4, verts=bm.verts)
    me = bpy.data.meshes.new(name or kind)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = False
    o = bpy.data.objects.new(name or kind, me)
    sc.collection.objects.link(o)
    o.data.materials.append(M[mat])
    OBJ.append(o)
    return o

def cut(o, fn):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if fn(v.co)], context='VERTS')
    bm.to_mesh(o.data); bm.free()

def cap(s=1.08, cutz=-.03, front=.1, mat="M_hair", name="cap"):
    o = S("sphere", H + Vector((0, .01, .01)), (.25*s, .235*s, .225*s), mat, seg=10, name=name)
    cut(o, lambda v: (v.z - H.z) < cutz or (v.y < -.1 and (v.z - H.z) < front))
    return o

def E(name, loc):
    e = bpy.data.objects.new(name, None); e.location = loc; sc.collection.objects.link(e); OBJ.append(e); return e

STATS = {}
def export(sub, name):
    bpy.context.view_layer.update()
    for o in OBJ: o.select_set(True)
    bpy.context.view_layer.objects.active = OBJ[0]
    path = os.path.join(OUT, sub, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
    faces = sum(len(o.data.polygons) for o in OBJ if o.type == 'MESH')
    STATS[f"{sub}/{name}"] = {"faces": faces, "bytes": os.path.getsize(path)}
    for o in OBJ:
        d = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if d and d.users == 0 and hasattr(d, "polygons"): bpy.data.meshes.remove(d)
    OBJ.clear()

# ---------------- BODY ----------------
def body():
    S("sphere", H, (.25, .23, .22), "M_skin", seg=12, name="Head")
    for sx in (-1, 1):
        S("sphere", (sx*.085, -.205, .755), (.028, .02, .034), "M_eye", seg=6, name="Eye")
        S("cyl", (sx*.07, 0, .12), (.055, .055, .12), "M_skin", seg=8, name="Leg")
        S("box", (sx*.07, -.025, .03), (.06, .09, .03), "M_shoe", name="Foot")
        S("cyl", (sx*.155, 0, .38), (.04, .04, .12), "M_skin", rot=(0, sx*.12, 0), seg=8, name="Arm")
        S("sphere", (sx*.175, 0, .25), .05, "M_skin", seg=6, name="Hand")
    S("box", (0, 0, .36), (.115, .075, .15), "M_secondary", name="Torso")
    E("head_anchor", H); E("hat_anchor", (0, 0, .96)); E("hand_R_anchor", (.175, -.03, .25)); E("hand_L_anchor", (-.175, -.03, .25))
    E("back_anchor", (0, .1, .4)); E("neck_anchor", (0, -.02, .5))
    export("body", "base")

# ---------------- HAIR ----------------
def tail(x, z, y=.2, l=.2, r=.04, mat="M_hair"):
    S("cyl", (x, y, z - l/2), (r, r, l/2), mat, seg=6, name="tail")
    S("sphere", (x, y, z - l), r*1.2, mat, seg=6, name="tip")

def hair():
    C = lambda *a, **k: cap(*a, **k)
    C(1.02, cutz=.02, front=.12); export("hair", "buzz")
    C(1.08); export("hair", "short_neat")
    C(1.08); S("box", (.12, -.19, .93), (.1, .02, .035), "M_hair", rot=(0, .3, 0)); export("hair", "side_part")
    C(1.05, front=.14); S("box", (0, .19, .78), (.18, .04, .12), "M_hair"); export("hair", "slicked")
    C(1.1)
    for i in range(9):
        a = i/9*6.283; S("sphere", (math.cos(a)*.17, math.sin(a)*.14 + .01, .93 + (i % 3)*.015), .07, "M_hair", seg=5, name="curl")
    S("sphere", (0, 0, .98), .09, "M_hair", seg=5); export("hair", "curly")
    o = S("sphere", H + Vector((0, .02, .08)), (.34, .32, .31), "M_hair", seg=10, name="afro")
    cut(o, lambda v: (v.z - H.z) < -.02 or (v.y < -.12 and (v.z - H.z) < .14)); export("hair", "afro")
    C(1.08); S("box", (0, .2, .62), (.19, .03, .12), "M_hair", rot=(.1, 0, 0)); export("hair", "wavy")
    C(1.1)
    for i, (x, y, rz) in enumerate([(-.1, -.02, -.4), (.08, .03, .3), (0, .1, 0), (.14, -.04, .6), (-.14, .05, -.7)]):
        S("cone", (x, y, .97), (.045, .045, .09), "M_hair", rot=(rz*.5, rz, 0), seg=5, r2=0, name="tuft")
    export("hair", "messy")
    C(1.06)
    for i in range(7):
        a = i/7*6.283
        S("cone", (math.cos(a)*.11, math.sin(a)*.09, .98), (.04, .04, .11), "M_hair", rot=(math.sin(a)*.5, -math.cos(a)*.5, 0), seg=4, r2=0, name="spike")
    export("hair", "spiky")
    C(1.08); S("box", (-.22, .02, .66), (.03, .12, .15), "M_hair"); S("box", (.22, .02, .66), (.03, .12, .15), "M_hair")
    S("box", (0, .2, .64), (.2, .03, .14), "M_hair"); export("hair", "straight")
    C(1.1, cutz=-.12); S("cyl", (0, .01, .64), (.265, .245, .09), "M_hair", seg=10, name="bobring")
    export("hair", "bob")
    C(1.08); S("sphere", (0, .2, .93), .06, "M_hair", seg=6); tail(0, .93, .22, .24, .045); export("hair", "ponytail")
    C(1.08); S("sphere", (0, .21, .78), .055, "M_hair", seg=6); tail(0, .78, .23, .24, .045); export("hair", "ponytail_low")
    C(1.08)
    for sx in (-1, 1):
        S("sphere", (sx*.2, .08, .86), .055, "M_hair", seg=6); tail(sx*.2, .86, .1, .26, .045)
    export("hair", "pigtails")
    C(1.08)
    for sx in (-1, 1): S("sphere", (sx*.14, .02, 1.0), .09, "M_hair", seg=6, name="bun")
    export("hair", "twin_buns")
    C(1.08); S("sphere", (0, .09, 1.0), .11, "M_hair", seg=6, name="bun"); export("hair", "bun")
    C(1.08); S("sphere", (0, 0, 1.03), .075, "M_hair", seg=6, name="knot"); S("cyl", (0, 0, .98), (.03, .03, .04), "M_hair", seg=5); export("hair", "topknot")
    C(1.08)
    for i in range(4): S("sphere", (0, .21, .9 - i*.1), .055 - i*.005, "M_hair", seg=6, name="braid")
    export("hair", "braid")
    C(1.08); S("box", (0, .2, .7), (.19, .03, .12), "M_hair"); S("sphere", (0, .06, 1.0), .08, "M_hair", seg=6); export("hair", "half_up")
    # length modifiers (back panels, no cap)
    S("box", (0, .19, .66), (.2, .035, .1), "M_hair"); export("hair", "len_shoulder")
    S("box", (0, .19, .52), (.2, .035, .22), "M_hair"); export("hair", "len_long")

# ---------------- OUTFITS ----------------
def sleeves(l=.12, z=.38, r=.05, mat="M_primary"):
    for sx in (-1, 1): S("cyl", (sx*.155, 0, z + (.12 - l)), (r, r, l), mat, rot=(0, sx*.12, 0), seg=8, name="sleeve")

def legs(l=.12, r=.065, mat="M_secondary", z0=.12):
    for sx in (-1, 1): S("cyl", (sx*.07, 0, z0 + (.12 - l)), (r, r, l), mat, seg=8, name="pant")

def top(h=.15, w=.125, d=.085, z=.36, mat="M_primary"): S("box", (0, 0, z), (w, d, h), mat, name="top")

def outfits():
    top(); sleeves(.07); legs(.12); export("outfit", "casual")
    top(.2, .13, .09, .33); sleeves(.12, r=.052); legs(.12, .07)
    S("box", (0, -.001, .36), (.02, .092, .19), "M_secondary", name="trim"); export("outfit", "vn_traditional")
    top(.15, .13, .09); sleeves(.12, r=.05, mat="M_primary"); legs(.12, .065, "M_secondary")
    S("box", (0, -.09, .46), (.05, .01, .04), "M_white", name="collar"); S("box", (0, -.095, .38), (.015, .006, .07), "M_secondary", name="tie")
    export("outfit", "formal_smart")
    top(.14, .12, .085, .37); sleeves(.06); legs(.07, .07, "M_secondary", .12)
    S("box", (0, 0, .24), (.125, .088, .015), "M_wood", name="belt")
    for sx in (-1, 1): S("box", (sx*.07, -.088, .33), (.04, .01, .035), "M_secondary", name="pocket")
    export("outfit", "explorer")
    top(.18, .16, .11, .35); sleeves(.12, r=.07); legs(.12, .075)
    S("cyl", (0, -.005, .52), (.11, .09, .035), "M_white", seg=8, name="fur"); export("outfit", "arctic_winter")
    top(.15); sleeves(.06); legs(.07, .068, "M_secondary", .12)
    for sx in (-1, 1): S("cyl", (sx*.07, 0, .06), (.058, .058, .06), "M_white", seg=8, name="sock")
    S("box", (0, -.088, .38), (.04, .006, .05), "M_white", name="number"); export("outfit", "football")
    top(.15, .118, .08); sleeves(.12, r=.045); legs(.12, .062)
    S("cyl", (0, .12, .38), (.05, .05, .12), "M_metal", seg=8, name="tank"); export("outfit", "diving")
    top(.15, .13, .09); sleeves(.1, r=.052)
    legs(.12, .068, "M_secondary", .12)
    for sx in (-1, 1):
        S("sphere", (sx*.16, 0, .49), .065, "M_metal", seg=6, name="pad"); S("cyl", (sx*.07, 0, .05), (.07, .07, .05), "M_metal", seg=8, name="boot")
    S("box", (0, -.09, .4), (.07, .008, .06), "M_white", name="panel"); S("box", (0, 0, .24), (.125, .088, .015), "M_metal", name="belt")
    export("outfit", "fantasy_scifi")
    top(.15, .14, .1); sleeves(.05, r=.05, mat="M_secondary"); legs(.07, .07, "M_secondary", .12)
    S("box", (0, 0, .5), (.14, .1, .03), "M_primary", name="collar"); S("box", (0, -.098, .36), (.12, .008, .02), "M_white", name="strap")
    export("outfit", "life_jacket_sailing")
    o = S("cone", (0, 0, .3), (.2, .15, .2), "M_primary", seg=8, r2=.5, name="robe"); sleeves(.12, r=.055, mat="M_primary")
    S("box", (0, -.01, .3), (.19, .15, .02), "M_secondary", name="sash"); legs(.1, .065, "M_secondary", .12)
    export("outfit", "regional_traditional")
    S("cone", (0, 0, .2), (.19, .15, .1), "M_secondary", seg=8, r2=.6, name="skirt"); export("outfit", "bottom_skirt")

# ---------------- PROPS (right hand) ----------------
HR = Vector((.19, -.05, .25))
def P(kind, off, s, mat, rot=(0, 0, 0), **k): return S(kind, HR + Vector(off), s, mat, rot=rot, **k)

def props():
    P("cyl", (0, 0, .1), (.012, .012, .33), "M_wood", seg=5); P("sphere", (0, 0, .43), .03, "M_metal", seg=5); export("prop", "staff_cane")
    P("box", (0, 0, .13), (.01, .09, .09), "M_primary", rot=(0, 0, 0)); P("cyl", (0, 0, .03), (.01, .01, .06), "M_wood", seg=5); export("prop", "fan")
    P("cyl", (0, 0, .1), (.01, .01, .2), "M_wood", seg=5); P("box", (0, 0, .24), (.07, .008, .05), "M_secondary"); export("prop", "swatter_net")
    P("cyl", (0, 0, .1), (.012, .012, .24), "M_wood", seg=5); P("box", (0, 0, .02), (.05, .03, .04), "M_secondary"); export("prop", "broom_brush")
    P("cyl", (0, 0, .06), (.01, .01, .12), "M_wood", seg=5); P("sphere", (0, 0, .14), (.04, .04, .025), "M_wood", seg=6); export("prop", "ladle")
    P("cyl", (0, 0, .06), (.025, .025, .08), "M_white", rot=(1.57, 0, 0), seg=6); export("prop", "rolled_paper")
    P("box", (0, 0, .03), (.03, .08, .012), "M_secondary"); export("prop", "slipper")
    P("cyl", (0, 0, .07), (.025, .025, .08), "M_metal", seg=6); P("cone", (0, 0, .17), (.04, .04, .03), "M_white", seg=6, r2=.5); export("prop", "flashlight")
    P("cyl", (0, 0, .15), (.01, .01, .2), "M_wood", seg=5); P("box", (0, 0, .3), (.01, .04, .012), "M_metal"); export("prop", "toy_bow_sword")
    P("cyl", (0, 0, .1), (.012, .012, .2), "M_wood", seg=5); P("box", (0, 0, .22), (.05, .025, .03), "M_metal"); export("prop", "axe_hammer_tool")
    P("cyl", (0, 0, .05), (.07, .07, .04), "M_wood", rot=(1.57, 0, 0), seg=8); export("prop", "rope_climb")
    P("box", (0, 0, .08), (.035, .012, .09), "M_metal"); P("cyl", (0, 0, .2), (.05, .01, .015), "M_secondary", rot=(0, 1.57, 0), seg=8); export("prop", "detector_scanner")
    P("cyl", (0, 0, .1), (.015, .015, .12), "M_wood", rot=(1.57, 0, 0), seg=6); export("prop", "instrument")
    P("cyl", (0, 0, .1), (.06, .02, .06), "M_metal", rot=(1.57, 0, 0), seg=8); export("prop", "shield")
    P("cyl", (0, 0, .12), (.02, .02, .22), "M_secondary", seg=6); P("box", (0, 0, .02), (.05, .04, .03), "M_metal"); export("prop", "vacuum")
    P("cyl", (0, 0, .05), (.035, .015, .035), "M_white", rot=(1.57, 0, 0), seg=8); export("prop", "tape")

# ---------------- ACCESSORIES ----------------
def accs():
    S("sphere", H + Vector((0, 0, .1)), (.27, .25, .2), "M_primary", seg=8, name="cap"); S("box", (0, -.25, .84), (.1, .09, .012), "M_primary"); export("acc", "hat_cap")
    S("cyl", (0, 0, .93), (.34, .34, .012), "M_wood", seg=10, name="brim"); S("cyl", (0, 0, .98), (.17, .17, .05), "M_wood", seg=10); export("acc", "hat_wide")
    S("cone", (0, 0, 1.03), (.3, .3, .12), "M_wood", seg=10, r2=.05, name="conical"); export("acc", "hat_conical")
    S("sphere", H + Vector((0, 0, .06)), (.27, .25, .2), "M_primary", seg=8, name="beanie"); S("sphere", (0, 0, 1.0), .05, "M_white", seg=5); export("acc", "hat_beanie")
    for sx in (-1, 1): S("cyl", (sx*.085, -.215, .755), (.05, .008, .05), "M_glass", rot=(1.57, 0, 0), seg=8, name="lens")
    S("box", (0, -.215, .76), (.035, .006, .006), "M_metal"); export("acc", "glasses")
    S("sphere", (0, -.17, .6), (.14, .09, .1), "M_hair", seg=7, name="beard"); export("acc", "beard")
    S("box", (0, -.215, .67), (.09, .015, .015), "M_hair", name="mustache"); export("acc", "mustache")
    S("box", (0, .13, .36), (.09, .05, .11), "M_secondary", name="bag"); export("acc", "bag")
    S("cyl", (0, -.02, .5), (.1, .075, .012), "M_metal", seg=8, name="necklace"); export("acc", "necklace")
    S("cyl", (0, 0, .85), (.255, .24, .025), "M_primary", seg=10, name="headband"); export("acc", "headband")
    for sx in (-1, 1): S("cyl", (sx*.175, -.03, .25), (.05, .05, .012), "M_metal", seg=8, rot=(0, 1.57, 0), name="bracelet")
    export("acc", "bracelet")
    S("box", (0, -.05, .43), (.05, .03, .035), "M_metal", name="camera"); S("cyl", (0, -.09, .43), (.02, .02, .02), "M_glass", rot=(1.57, 0, 0), seg=6); export("acc", "camera")
    for sx in (-1, 1): S("sphere", (sx*.245, 0, .72), .02, "M_metal", seg=5, name="earring")
    export("acc", "earring")
    S("sphere", (.17, -.1, .93), .045, "M_primary", seg=6, name="flower"); S("sphere", (.17, -.13, .93), .02, "M_white", seg=4); export("acc", "flower")
    S("cyl", (-.178, -.03, .25), (.045, .045, .015), "M_metal", rot=(0, 1.57, 0), seg=8, name="watch"); export("acc", "watch")
    S("cyl", (0, -.1, .46), (.012, .012, .03), "M_metal", seg=5, name="whistle"); export("acc", "whistle")
    S("box", (-.19, -.04, .22), (.04, .005, .05), "M_white", name="notebook", rot=(0, 0, 0)); export("acc", "map_or_notebook")
    S("box", (.12, -.2, .86), (.03, .015, .02), "M_metal", name="cyber"); S("sphere", (.12, -.215, .86), .012, "M_primary", seg=4); export("acc", "cybernetic")
    S("sphere", (-.2, -.05, .1), (.07, .07, .06), "M_white", seg=6, name="pet"); export("acc", "pet_or_toy")
    S("box", (.06, -.1, .36), (.012, .012, .05), "M_white", rot=(0, .5, 0), name="bandage"); export("acc", "bandage")

body(); hair(); outfits(); props(); accs()
json.dump(STATS, open(os.path.join(OUT, "_stats.json"), "w"), indent=1)
print("built", len(STATS), "files; max faces", max(v["faces"] for v in STATS.values()))
