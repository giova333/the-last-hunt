# Tile PNGs into a grid using Blender's image API. Args: out.png cols files...
import bpy, sys
a = sys.argv[sys.argv.index('--') + 1:]
out, cols, files = a[0], int(a[1]), a[2:]
imgs = [bpy.data.images.load(f) for f in files]
w, h = imgs[0].size
rows = (len(imgs) + cols - 1) // cols
W, H = w * cols, h * rows
px = [0.0] * (W * H * 4)
for i, im in enumerate(imgs):
    src = list(im.pixels)
    cx, cy = i % cols, rows - 1 - i // cols
    for y in range(h):
        row = src[y * w * 4:(y + 1) * w * 4]
        o = ((cy * h + y) * W + cx * w) * 4
        px[o:o + w * 4] = row
res = bpy.data.images.new('m', W, H, alpha=True)
res.pixels = px
res.filepath_raw = out; res.file_format = 'PNG'; res.save()
