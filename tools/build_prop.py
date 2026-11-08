# Headless Blender: make a hand-held prop. Long axis → +Y, origin at the grip.
# Args: in.glb out.glb tex_size grip_fraction flip(0/1) preview.png
import bpy, sys, math, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
src, out, tex, grip, flip, prev = a[0], a[1], int(a[2]), float(a[3]), a[4] == '1', a[5]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
co = [v.co for v in ob.data.vertices]
mn = [min(c[i] for c in co) for i in range(3)]; mx = [max(c[i] for c in co) for i in range(3)]
ax = max(range(3), key=lambda i: mx[i] - mn[i])
L = mx[ax] - mn[ax]
g = mn[ax] + grip * L if not flip else mx[ax] - grip * L
ctr = [(mn[i] + mx[i]) / 2 for i in range(3)]; ctr[ax] = g
ob.data.transform(mathutils.Matrix.Translation(-mathutils.Vector(ctr)))
# Rotate long axis onto +Z (Blender up == glTF +Y); flip so the head points up.
if ax == 0: R = mathutils.Matrix.Rotation(math.radians(90 if flip else -90), 4, 'Y')
elif ax == 1: R = mathutils.Matrix.Rotation(math.radians(-90 if flip else 90), 4, 'X')
else: R = mathutils.Matrix.Rotation(math.radians(180), 4, 'X') if flip else mathutils.Matrix.Identity(4)
ob.data.transform(R)
s = 1.0 / L; ob.data.transform(mathutils.Matrix.Scale(s, 4))  # unit length; game scales it
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, tex)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=88, use_selection=False)
# Preview from the side: grip at origin (red marker), head should point up.
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = 300; sc.render.resolution_y = 400
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025, location=(0, 0, 0))
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.4
cam.location = (0, -3, 0.35); cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = prev; bpy.ops.render.render(write_still=True)
print('AXIS', ax, 'LEN', round(L, 3))
