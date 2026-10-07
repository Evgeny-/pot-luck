"""Ingredient sprites for the art review: generated pictures and emoji turned into small pixel art.
usage: python3 scripts/art/tiles.py   (reads .cache/art/gen and .cache/art/emoji, writes _review/art/img)"""
import os
import numpy as np
from PIL import Image

OUT = '_review/art/img'
os.makedirs(OUT, exist_ok=True)


def cut_background(rgba, tol=26):
    """Flood-fills the near-white background from the border and makes it transparent."""
    a = np.array(rgba).astype(int)
    h, w = a.shape[:2]
    rgb = a[:, :, :3]
    bg = rgb[0, 0]
    near = (np.abs(rgb - bg).sum(2) < tol) & (a[:, :, 3] > 0)
    mask = np.zeros((h, w), bool)
    stack = [(y, x) for y in (0, h - 1) for x in range(w)] + [(y, x) for x in (0, w - 1) for y in range(h)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or mask[y, x] or not near[y, x]:
            continue
        mask[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    a[mask, 3] = 0
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def crop_square(im, pad=0.06):
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    s = int(max(im.size) * (1 + pad))
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
    return out


def pixelize(im, g, colors=14):
    """Majority colour per cell of a g×g grid (crisp edges), alpha by coverage."""
    im = im.resize((g * 8, g * 8), Image.LANCZOS)
    rgb = im.convert('RGB').quantize(colors, method=Image.Quantize.MEDIANCUT)
    pal = np.array(rgb.getpalette()[:colors * 3]).reshape(-1, 3)
    idx = np.array(rgb)
    alpha = np.array(im)[:, :, 3]
    out = np.zeros((g, g, 4), np.uint8)
    for y in range(g):
        for x in range(g):
            a = alpha[y * 8:(y + 1) * 8, x * 8:(x + 1) * 8]
            if (a > 128).mean() < 0.45:
                continue
            block = idx[y * 8:(y + 1) * 8, x * 8:(x + 1) * 8][a > 128]
            c = np.bincount(block.ravel(), minlength=colors).argmax()
            out[y, x, :3] = pal[c]
            out[y, x, 3] = 255
    return Image.fromarray(out, 'RGBA')


for f in sorted(os.listdir('.cache/art/gen')):
    if not f.endswith('.png'):
        continue
    key = f.split('-')[0]
    im = crop_square(cut_background(Image.open(f'.cache/art/gen/{f}').convert('RGBA')))
    im.resize((256, 256), Image.LANCZOS).save(f'{OUT}/gen-{key}.png')
    pixelize(im, 28).resize((224, 224), Image.NEAREST).save(f'{OUT}/genpx-{key}.png')
for f in sorted(os.listdir('.cache/art/emoji')):
    key = f[:-4]
    im = crop_square(Image.open(f'.cache/art/emoji/{f}').convert('RGBA'))
    pixelize(im, 20).resize((220, 220), Image.NEAREST).save(f'{OUT}/emojipx-{key}.png')
print('wrote', len(os.listdir(OUT)), 'images')
