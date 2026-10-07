"""Review ingredient icons on their actual tile colours.

usage: python3 scripts/art/contact-sheet.py [sticker|kawaii|watercolor|retro]
writes .cache/art/<set>-ingredients-contact.png, with an inset at the game's icon size.
"""
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

style = sys.argv[1] if len(sys.argv) > 1 else 'sticker'
source = open('src/core/ingredients.ts').read().split('export const INGREDIENTS:')[0]
ingredients = re.findall(r"key: '([^']+)', en: '([^']+)'.*?color: '([^']+)'", source)
cols, width, height = 8, 176, 182
sheet = Image.new('RGB', (cols * width, ((len(ingredients) + cols - 1) // cols) * height + 42), '#f6efde')
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 15)
except OSError:
    font = ImageFont.load_default(size=15)
present = sum(os.path.exists(f'public/art/{style}/{key}.webp') for key, _, _ in ingredients)
draw.text((12, 12), f'{style.capitalize()} ingredients: {present}/{len(ingredients)}', fill='#443626', font=font)
for i, (key, name, color) in enumerate(ingredients):
    x, y = (i % cols) * width + 8, (i // cols) * height + 42
    draw.rounded_rectangle((x, y, x + 159, y + 151), radius=14, fill=color)
    path = f'public/art/{style}/{key}.webp'
    if os.path.exists(path):
        icon = Image.open(path).convert('RGBA')
        full = icon.resize((124, 124), Image.Resampling.LANCZOS)
        sheet.paste(full, (x + 16, y + 5), full)
        tiny = icon.resize((36, 36), Image.Resampling.LANCZOS)
        sheet.paste(tiny, (x + 113, y + 112), tiny)
    else:
        draw.text((x + 20, y + 50), 'Missing', fill='#443626', font=font)
    draw.text((x, y + 158), name, fill='#443626', font=font)
os.makedirs('.cache/art', exist_ok=True)
path = f'.cache/art/{style}-ingredients-contact.png'
sheet.save(path)
print(path)
