"""Job queue for generate.py: every ingredient and dish of the game in one art set.

usage: python3 scripts/art/sets.py sticker > .cache/art/sets.jsonl          (new pictures only)
       python3 scripts/art/sets.py sticker --all > .cache/art/sets.jsonl    (also redo the five style samples)
       python3 scripts/art/sets.py sticker --only dishes                    (ingredients | dishes)

Sets: sticker, kawaii, watercolor, retro (prompt templates in styles.py). Ids are <set>-<key>, the
key being the ingredient or dish key from src/core/ingredients.ts, which is what cut.py and the game
expect. Pictures already in .cache/art/styles (the five samples per style) are skipped unless --all.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from styles import STYLES  # noqa: E402

# Ingredients: the subject should match the tile colour (src/core/ingredients.ts), so a lilac
# onion tile gets a purple onion, a white garlic tile a white bulb.
INGREDIENTS = {
    'tomato': 'a ripe red tomato with a green stem',
    'onion': 'a purple red onion',
    'carrot': 'an orange carrot with green leaves',
    'garlic': 'a white garlic bulb',
    'mushroom': 'a brown cap mushroom',
    'potato': 'a golden brown potato',
    'egg': 'a cracked egg with a bright yellow yolk',
    'pepper': 'a green bell pepper',
    'eggplant': 'a glossy purple eggplant',
    'fish': 'a blue fish',
    'shrimp': 'a pink shrimp',
    'broccoli': 'a green broccoli floret',
    'cheese': 'a wedge of yellow cheese with holes',
    'corn': 'a yellow ear of corn with green husks',
    'chili': 'a red chili pepper',
    'rice': 'a bowl of white rice',
    'meat': 'a red steak cut of meat',
    'lemon': 'a yellow lemon with a leaf',
    'cucumber': 'a green cucumber',
    'bread': 'a crusty loaf of bread',
    'basil': 'a sprig of fresh green basil leaves',
    'olive': 'two green olives on a small branch',
    'ginger': 'a knobbly ginger root',
    'peas': 'an open green pea pod with peas',
    'beans': 'a pile of red kidney beans',
    'coconut': 'a brown coconut cut in half showing white flesh',
    'lettuce': 'a head of green lettuce',
    'avocado': 'a halved avocado with the pit',
    'lime': 'a green lime',
    'peanut': 'a few peanuts in their shells',
    'chicken': 'a roasted chicken drumstick',
    'blueberry': 'a handful of blueberries',
}

DISHES = {
    'soup': 'a pot of vegetable soup',
    'stew': 'a shallow pan of hearty stew',
    'curry': 'a plate of curry with rice',
    'salad': 'a bowl of green salad',
    'pasta': 'a plate of spaghetti with tomato sauce',
    'ramen': 'a steaming bowl of ramen with noodles and egg',
    'omelette': 'a folded omelette in a frying pan',
    'sandwich': 'a sandwich with lettuce, tomato and cheese',
    'pizza': 'a slice of pizza with melted cheese',
    'taco': 'a taco with meat and salsa',
    'dumplings': 'three steamed dumplings',
    'burrito': 'a wrapped burrito cut in half',
    'sushi': 'a sushi roll and nigiri',
    'bento': 'a bento box with rice and sides',
    'onigiri': 'a rice ball onigiri with seaweed',
    'oden': 'an oden skewer with fish cakes',
    'tamale': 'a tamale in a corn husk',
    'burger': 'a hamburger with cheese and lettuce',
    'fries': 'a red carton of french fries',
    'hotdog': 'a hot dog with mustard',
    'pancakes': 'a stack of pancakes with syrup and butter',
    'flatbread': 'a round flatbread naan',
    'takeout': 'a takeout box of noodles with chopsticks',
    'hotpot': 'a red hot pot with chilies and vegetables',
    'mooncake': 'a golden mooncake with a pattern',
    'fortune': 'a fortune cookie',
    'kebab': 'a stuffed flatbread wrap',
}

SAMPLED = {'tomato', 'carrot', 'mushroom', 'onion', 'cheese'}

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] not in STYLES:
        sys.exit(f'usage: sets.py <{"|".join(STYLES)}> [--all] [--only ingredients|dishes]')
    style = args[0]
    only = args[args.index('--only') + 1] if '--only' in args else ''
    subjects = {}
    if only in ('', 'ingredients'):
        subjects.update(INGREDIENTS)
    if only in ('', 'dishes'):
        subjects.update(DISHES)
    tpl = STYLES[style]
    for key, s in subjects.items():
        if key in SAMPLED and '--all' not in args:
            continue
        prompt = tpl.replace('{S}', s[0].upper() + s[1:]).replace('{s}', s)
        print(json.dumps({'id': f'{style}-{key}', 'seed': 7, 'prompt': prompt}))
