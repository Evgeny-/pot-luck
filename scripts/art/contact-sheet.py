"""Review food icons on their tile colours and dish plates.

usage: python3 scripts/art/contact-sheet.py [sticker|kawaii|watercolor|retro] [--only ingredients|dishes|all] [--raw]
writes .cache/art/<set>-<selection>-contact.png, with an inset at the game's icon size.
--raw also reviews completed PNGs before they are cut into public assets (requires numpy).
"""
import argparse
import io
import os
import re
from PIL import Image, ImageDraw, ImageFont

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('style', nargs='?', default='sticker', choices=['sticker', 'kawaii', 'watercolor', 'retro'])
parser.add_argument('--only', default='ingredients', choices=['ingredients', 'dishes', 'all'])
parser.add_argument('--raw', action='store_true')
args = parser.parse_args()
style = args.style
source = open('src/core/ingredients.ts').read()
ingredients = [(*item, False) for item in re.findall(r"key: '([^']+)', en: '([^']+)'.*?color: '([^']+)'", source.split('export const INGREDIENTS:')[0])]
dishes = [(*item, True) for item in re.findall(r"^\s+(\w+): \{ en: '([^']+)', ru:.*?color: '([^']+)'", source.split('export const DISHES:')[1], re.MULTILINE)]
items = ingredients if args.only == 'ingredients' else dishes if args.only == 'dishes' else ingredients + dishes

def source_for(key):
    if args.raw:
        for folder in ['.cache/art/sets', '.cache/art/styles']:
            path = f'{folder}/{style}-{key}.png'
            if os.path.exists(path) and os.path.getsize(path):
                return path
    path = f'public/art/{style}/{key}.webp'
    return path if os.path.exists(path) else None

if args.raw:
    from cut import centre, cut

cols, width, height = 8, 176, 182
sheet = Image.new('RGB', (cols * width, ((len(items) + cols - 1) // cols) * height + 42), '#f6efde')
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
except OSError:
    font = ImageFont.load_default(size=15)
present = sum(source_for(key) is not None for key, _, _, _ in items)
title = 'food icons' if args.only == 'all' else args.only
draw.text((12, 12), f'{style.capitalize()} {title}: {present}/{len(items)}', fill='#443626', font=font)
for i, (key, name, color, dish) in enumerate(items):
    x, y = (i % cols) * width + 8, (i // cols) * height + 42
    draw.rounded_rectangle((x, y, x + 159, y + 151), radius=14, fill=color)
    if dish:
        draw.ellipse((x + 6, y + 2, x + 143, y + 139), fill='#fffdf5', outline='#e7d5ba', width=3)
        draw.ellipse((x + 105, y + 106, x + 157, y + 158), fill='#fffdf5', outline='#e7d5ba', width=2)
    path = source_for(key)
    if path:
        icon = Image.open(path).convert('RGBA')
        if path.endswith('.png'):
            icon = centre(cut(icon, style))
            encoded = io.BytesIO()
            icon.save(encoded, 'WEBP', quality=88, method=6)
            encoded.seek(0)
            icon = Image.open(encoded).convert('RGBA')
        full = icon.resize((124, 124), Image.Resampling.LANCZOS)
        sheet.paste(full, (x + 16, y + 5), full)
        tiny = icon.resize((36, 36), Image.Resampling.LANCZOS)
        sheet.paste(tiny, (x + 113, y + 112), tiny)
    else:
        draw.text((x + 20, y + 50), 'Missing', fill='#443626', font=font)
    draw.text((x, y + 158), name, fill='#443626', font=font)
os.makedirs('.cache/art', exist_ok=True)
path = f'.cache/art/{style}-{args.only}{"-raw" if args.raw else ""}-contact.png'
sheet.save(path)
print(path)
