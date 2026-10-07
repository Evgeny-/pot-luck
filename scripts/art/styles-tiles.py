"""Cuts the style candidates out of their backgrounds for the style review page.
usage: python3 scripts/art/styles-tiles.py  (reads .cache/art/styles, writes _review/style/img)"""
import os
import numpy as np
from PIL import Image, ImageFilter

SRC = '.cache/art/styles'
OUT = '_review/style/img'
os.makedirs(OUT, exist_ok=True)


def cut(im, tol=34):
    """Flood-fills the light background from the border (tolerant to soft gradients and shadows)."""
    a = np.array(im.convert('RGBA')).astype(int)
    h, w = a.shape[:2]
    rgb = a[:, :, :3]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    near = np.abs(rgb - bg).sum(2) < tol * 3
    # also treat very light, low-saturation pixels (soft shadows) as background
    light = (rgb.min(2) > 200) & (rgb.max(2) - rgb.min(2) < 22)
    cand = near | light
    mask = np.zeros((h, w), bool)
    stack = [(y, x) for y in (0, h - 1) for x in range(0, w, 4)] + [(y, x) for x in (0, w - 1) for y in range(0, h, 4)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or mask[y, x] or not cand[y, x]:
            continue
        mask[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    alpha = np.array(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.2)))
    a[:, :, 3] = alpha
    out = Image.fromarray(a.astype(np.uint8), 'RGBA')
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    s = int(max(out.size) * 1.06)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(out, ((s - out.width) // 2, (s - out.height) // 2))
    return sq.resize((256, 256), Image.LANCZOS)


n = 0
for f in sorted(os.listdir(SRC)):
    if not f.endswith('.png') or os.path.getsize(os.path.join(SRC, f)) == 0:
        continue
    im = Image.open(os.path.join(SRC, f))
    style = f.split('-')[0]
    if style == 'ceramic':
        # The glazed tile is the picture: crop it out of the dark surround, keep it square.
        a = np.array(im.convert('RGB')).astype(int)
        light = a.min(2) > 150
        ys, xs = np.where(light)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else (0, 0, im.width, im.height)
        im.convert('RGB').crop(box).resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, f[:-4] + '.webp'), 'WEBP', quality=86)
    else:
        cut(im).resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, f[:-4] + '.webp'), 'WEBP', quality=86, method=6)
    n += 1
print('wrote', n)
