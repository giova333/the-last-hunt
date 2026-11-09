# Key a flat green-screen image to alpha, despill, crop to content, resize.
# Usage: python key_image.py in.png out.png [--max W H] [--pad N]
# (needs Pillow + numpy; any venv will do — they are not project dependencies)
import sys, argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--max', nargs=2, type=int, default=None, help='fit inside W H')
ap.add_argument('--pad', type=int, default=2)
a = ap.parse_args()

im = np.asarray(Image.open(a.src).convert('RGB')).astype(np.float32)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
dom = g - np.maximum(r, b)                      # how much greener than anything else
alpha = 1 - np.clip((dom - 40) / (110 - 40), 0, 1)   # soft matte: <40 opaque, >110 clear
g2 = np.minimum(g, np.maximum(r, b))            # despill: no pixel stays greener than its R/B
out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)

ys, xs = np.nonzero(alpha > 0.05)
y0, y1 = max(ys.min() - a.pad, 0), min(ys.max() + a.pad + 1, out.shape[0])
x0, x1 = max(xs.min() - a.pad, 0), min(xs.max() + a.pad + 1, out.shape[1])
img = Image.fromarray(out[y0:y1, x0:x1])
if a.max:
    img.thumbnail(tuple(a.max), Image.LANCZOS)
img.save(a.out)
print(a.out, img.size)
