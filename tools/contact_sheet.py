# Render frames of one clip to PNGs (workbench, fast). Args: glb clip start end step outdir
import bpy, sys, math
a = sys.argv[sys.argv.index('--') + 1:]
glb, clip, t0, t1, step, out = a[0], a[1], float(a[2]), float(a[3]), float(a[4]), a[5]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
arm.animation_data.action = bpy.data.actions[clip]
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 220
sc.render.fps = 24
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
sc.collection.objects.link(cam); sc.camera = cam
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
h = max(mesh.dimensions)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = h * 1.6
# 3/4 front view (glTF +Z forward becomes Blender -Y)
cam.location = (h * 2.2, -h * 3.0, h * 0.55)
cam.rotation_euler = (math.radians(90), 0, math.radians(36))
t = t0; i = 0
while t <= t1 + 1e-6:
    sc.frame_set(int(round(t * 24)))
    sc.render.filepath = f'{out}/{clip}_{i:02d}_{t:.1f}.png'
    bpy.ops.render.render(write_still=True)
    t += step; i += 1
