import bpy, sys
path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
for o in bpy.data.objects:
    extra = ''
    if o.type == 'MESH': extra = f' tris={sum(len(p.vertices)-2 for p in o.data.polygons)} mats={[m.name for m in o.data.materials]}'
    if o.type == 'ARMATURE': extra = f' bones={len(o.data.bones)}'
    print('OBJ', o.type, o.name, 'dims', tuple(round(d,2) for d in o.dimensions), extra)
for a in bpy.data.actions:
    print('ACTION', a.name, 'frames', tuple(a.frame_range))
for img in bpy.data.images:
    print('IMG', img.name, img.size[:])
