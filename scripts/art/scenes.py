"""Job queue for generate.py: ingredient tiles and pots for Pot Luck (same style as Pixel Picnic).
usage: python3 scripts/art/scenes.py > .cache/art/jobs.jsonl"""
import json

STYLE = ("16-bit retro video game pixel art, low resolution 64x64 sprite art upscaled with nearest neighbor, "
         "every pixel is a visible hard-edged square, no anti-aliasing, no gradients, limited 16-color palette, "
         "black 1-pixel outlines, cute, the scene fills the whole frame, no text.")
SIMPLE = "One big cute {s} in the center, filling most of the frame, simple plain background."

SUBJECTS = {
    'tomato': 'shiny red tomato with a green stem',
    'onion': 'purple red onion with a little sprout',
    'carrot': 'orange carrot with green leaves',
    'mushroom': 'brown cap mushroom',
    'garlic': 'white garlic bulb',
    'egg': 'white egg',
    'pot': 'red cooking pot with steam and a ladle',
    'salad': 'wooden salad bowl with green leaves',
}


def prompt(s: str) -> str:
    return SIMPLE.format(s=s) + ' ' + STYLE


if __name__ == '__main__':
    for key, s in SUBJECTS.items():
        print(json.dumps({'id': f'{key}-s11', 'seed': 11, 'prompt': prompt(s)}))
