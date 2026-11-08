# Headless Blender: make a static environment prop game-ready.
# Joins meshes, bakes transforms, puts the origin at the bottom-centre, downsizes textures
# (JPEG), exports GLB and renders a 3/4 preview. Args: in.glb out.glb tex_size preview.png
import bpy, sys, math, mathutils
a = sys.argv[sys.argv.index('--') + 1:]
src, out, tex, prev = a[0], a[1], int(a[2]), a[3]
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
for o in list(bpy.data.objects):
    if o != ob: bpy.data.objects.remove(o)
co = [v.co for v in ob.data.vertices]
mn = [min(c[i] for c in co) for i in range(3)]; mx = [max(c[i] for c in co) for i in range(3)]
ob.data.transform(mathutils.Matrix.Translation(mathutils.Vector((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))))
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, tex)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86)
dims = [mx[i] - mn[i] for i in range(3)]
print('DIMS', [round(d, 3) for d in dims], 'TRIS', sum(len(p.vertices) - 2 for p in ob.data.polygons))
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 360
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera = cam
h = max(dims)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = h * 1.35
# 3/4 front view (glTF +Z forward == Blender -Y).
cam.location = (h * 2.2, -h * 3.0, dims[2] / 2 + h * 0.4)
cam.rotation_euler = (math.radians(82), 0, math.radians(36))
sc.render.filepath = prev; bpy.ops.render.render(write_still=True)
