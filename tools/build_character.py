# Headless Blender: merge Tripo GLBs (same rig) into one game-ready GLB.
# Args: out.glb tex_size main.glb [extra_anim.glb ...]
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
out, tex, main, extras = a[0], int(a[1]), a[2], a[3:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=main)
keep = set(bpy.data.objects)
arm = next(o for o in keep if o.type == 'ARMATURE')
for path in extras:
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o not in keep: bpy.data.objects.remove(o, do_unlink=True)
# Tripo/importer helper shapes are not needed.
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o, do_unlink=True)
# Push every action onto the armature as an NLA track so the exporter writes all of them.
ad = arm.animation_data or arm.animation_data_create()
for act in bpy.data.actions:
    act.use_fake_user = True
    tr = ad.nla_tracks.new(); tr.name = act.name
    strip = tr.strips.new(act.name, int(act.frame_range[0]), act)
    if hasattr(strip, 'action_slot') and act.slots: strip.action_slot = act.slots[0]
ad.action = None
for img in bpy.data.images:
    if img.size[0] > tex: img.scale(tex, tex)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS',
    export_image_format='JPEG', export_jpeg_quality=88, export_draco_mesh_compression_enable=False)
print('ACTIONS', [x.name for x in bpy.data.actions])
