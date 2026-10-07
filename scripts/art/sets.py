"""Job queue for generate.py: every ingredient and dish of the game in one art set.

usage: python3 scripts/art/sets.py sticker > .cache/art/sets.jsonl          (new pictures only)
       python3 scripts/art/sets.py sticker --all > .cache/art/sets.jsonl    (also redo the five style samples)
       python3 scripts/art/sets.py sticker --only dishes                    (ingredients | dishes)
       python3 scripts/art/sets.py sticker --only ingredients --redo onion  (new ingredients plus a replacement)

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
    'onion': 'a single round purple red onion bulb with curved purple skin stripes, a short dry tan stem and tiny roots, no green leaves',
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
    'chili': 'a single long curved bright red chili pepper with a pointed tip and a small green stem, side view',
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

# Dishes sit inside the game's own plate. Keep containers small and filled so the food reads
# at icon size; broad empty plates and long pan handles would shrink the portion after centring.
DISHES = {
    'soup': 'a small deep red bowl filled to the brim with golden vegetable soup and visible carrot and tomato chunks, compact three-quarter view',
    'stew': 'a small brown ceramic bowl filled to the brim with rich beef stew, chunky meat, orange carrots and potatoes, compact three-quarter view',
    'curry': 'a compact serving of golden curry and white rice filling a small shallow white bowl with a narrow rim, three-quarter view',
    'salad': 'a small blue bowl packed with crisp green lettuce leaves and red tomato wedges, compact three-quarter view',
    'pasta': 'a compact mound of golden spaghetti with thick red tomato sauce and one basil leaf, filling a small shallow white bowl with a narrow rim, three-quarter view',
    'ramen': 'a small dark blue bowl filled to the brim with ramen noodles, a halved egg and green scallions, compact three-quarter view',
    'omelette': 'a single plump golden folded omelette with a few tiny green herb flecks, compact three-quarter view',
    'sandwich': 'a single thick triangular sandwich with lettuce, red tomato and yellow cheese visible between two slices of bread, compact three-quarter view',
    'pizza': 'a single triangular slice of pizza with melted yellow cheese, red pepperoni and a golden crust, compact three-quarter view',
    'taco': 'a single golden taco shell stuffed with meat, green lettuce and red salsa, compact three-quarter view',
    'dumplings': 'three plump white steamed dumplings nestled closely together, folded tops clearly visible, compact three-quarter view',
    'burrito': 'a single short burrito cut in half with beans, rice and red tomato visible inside, the two halves nestled together, compact three-quarter view',
    'sushi': 'one salmon nigiri beside one thick sushi roll with green cucumber filling, nestled closely together, compact three-quarter view',
    'bento': 'a small square red bento box filled edge to edge with white rice, salmon, a yellow egg roll and green vegetables, compact three-quarter view',
    'onigiri': 'a single plump triangular white onigiri rice ball with a dark seaweed band at its base, compact three-quarter view',
    'oden': 'a short diagonal oden skewer holding a pale daikon round, a golden fish cake and a white triangular fish cake, compact three-quarter view',
    'tamale': 'a single short Mexican tamale made of smooth pale golden masa dough, shaped like a plump rectangular parcel with red filling visible at one cut end, cradled in an opened tan dried corn husk, compact three-quarter view',
    'burger': 'a single tall hamburger with a golden sesame bun, red tomato, yellow cheese and green lettuce, compact three-quarter view',
    'fries': 'a small red carton densely packed with crisp golden french fries, compact three-quarter view',
    'hotdog': 'a single plump red sausage in a golden hot dog bun with a yellow mustard zigzag, compact three-quarter view',
    'pancakes': 'a small compact stack of three golden pancakes with brown syrup and a square of butter on top, three-quarter view',
    'flatbread': 'a single oval golden naan flatbread with toasted brown spots and a few tiny green herb flecks, compact three-quarter view',
    'takeout': 'a small red and white open takeout carton filled to the brim with curling golden noodles and green vegetables, compact three-quarter view',
    'hotpot': 'a small red cooking pot filled to the brim with spicy red broth, green vegetables and red chili peppers, two short side handles, compact three-quarter view',
    'mooncake': 'a single round golden mooncake with a scalloped edge and a simple flower pattern pressed into its top, compact three-quarter view',
    'fortune': 'a single golden folded fortune cookie with a tiny plain white paper slip, compact three-quarter view',
    'kebab': 'a single short stuffed flatbread wrap with grilled meat, green lettuce and red tomato visible at its open top, compact three-quarter view',
}

SAMPLED = {'tomato', 'carrot', 'mushroom', 'onion', 'cheese'}
SEEDS = {('sticker', 'tamale'): 11}

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args or args[0] not in STYLES:
        sys.exit(f'usage: sets.py <{"|".join(STYLES)}> [--all] [--only ingredients|dishes]')
    style = args[0]
    only = args[args.index('--only') + 1] if '--only' in args else ''
    redo = set(args[args.index('--redo') + 1].split(',')) if '--redo' in args else set()
    subjects = {}
    if only in ('', 'ingredients'):
        subjects.update(INGREDIENTS)
    if only in ('', 'dishes'):
        subjects.update(DISHES)
    tpl = STYLES[style]
    for key, s in subjects.items():
        if key in SAMPLED and '--all' not in args and key not in redo:
            continue
        prompt = tpl.replace('{S}', s[0].upper() + s[1:]).replace('{s}', s)
        print(json.dumps({'id': f'{style}-{key}', 'seed': SEEDS.get((style, key), 7), 'prompt': prompt}))
