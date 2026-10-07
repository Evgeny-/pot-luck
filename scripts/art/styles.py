"""Job queue for generate.py: the same five ingredients in six candidate art styles (30 images).
usage: python3 scripts/art/styles.py > .cache/art/styles.jsonl"""
import json

SUBJECTS = {
    'tomato': 'a ripe red tomato with a green stem',
    'carrot': 'an orange carrot with green leaves',
    'mushroom': 'a brown cap mushroom',
    'onion': 'a purple red onion',
    'cheese': 'a wedge of yellow cheese with holes',
}

STYLES = {
    'sticker': 'Die-cut sticker illustration of {s}, thick white sticker border, flat vector art, bold clean dark outline, simple cel shading, vibrant colors, centered, plain light grey background, no text.',
    'clay': 'Cute 3D clay figurine of {s}, handmade plasticine texture, soft rounded shapes, soft studio lighting, pastel colors, centered, plain light background, no text.',
    'watercolor': 'Loose watercolor and ink illustration of {s}, hand painted, soft washes, delicate ink outlines, visible paper texture, centered, plain white background, no text.',
    'kawaii': 'Kawaii character of {s} with a cute happy face, big shiny eyes, rosy cheeks, flat vector illustration, thick rounded outline, pastel colors, centered, plain background, no text.',
    'retro': '1950s retro cartoon illustration of {s}, vintage diner advertisement style, thick black outlines, limited warm palette, halftone shading, centered, plain cream background, no text.',
    'ceramic': '{S} hand painted on a white glazed ceramic tile, majolica pottery style, cobalt blue, yellow and green glaze brush strokes, centered, no text.',
}

if __name__ == '__main__':
    for style, tpl in STYLES.items():
        for key, s in SUBJECTS.items():
            prompt = tpl.replace('{S}', s[0].upper() + s[1:]).replace('{s}', s)
            print(json.dumps({'id': f'{style}-{key}', 'seed': 7, 'prompt': prompt}))
