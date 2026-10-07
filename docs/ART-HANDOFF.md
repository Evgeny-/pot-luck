# Art handoff: generating ingredient and dish icon sets

This is everything another agent needs to continue the icon art for Pot Luck. It covers what was decided, what exists, the exact commands and prompts, how the pictures get into the game, and what is left.

## Where things stand (2026-10-07)

**The owner has decided:**
- **Sticker** is the default icon set, and it is free.
- **Kawaii**, **Watercolor** and **Retro Diner** are paid sets in the in-game Market (300 / 450 / 600 tips).
- Emoji sets (Noto, OpenMoji, Fluent) are not used as sets. Unicode has no basil, tamale and so on, and OpenMoji's CC BY-SA licence is awkward for a paid store.
- Clay and ceramic were rejected.

**Done:**
- Five sample ingredients in six candidate styles: tomato, carrot, mushroom, onion, cheese (30 images).
- Sticker now covers **all 32 ingredients**, including a new purple onion and curved red chili. The 27 missing ingredients and onion replacement were generated locally in one batch of 28.
- Kawaii, Watercolor and Retro Diner each retain their five samples. All 47 shipped pictures are cut out and centred in `public/art/<set>/<key>.webp`.
- Tiles, recipe tickets, map ingredient decorations and difficulty chilies use the equipped set, then Sticker, then Fluent emoji.
- The Market, the tips economy and the per-set rendering switch work.
- Board plates now use `dishHtml`, so dish artwork will appear as soon as it is available.

**Not done:**
- **27 Sticker dish icons** remain. Get approval for this next batch.
- The paid sets each need 54 more images to reach 59 icons. Generate them in the order the owner chooses.

## Ground rules from the owner

- **Ask before more than ~30 images in one go.** Split the sticker set into two batches of 27 (ingredients, then dishes) and get a yes for each.
- **Only generate when the machine is free.** Another project (`~/Projects/cooking`) also runs mflux and can keep the GPU busy. Check first:
  ```bash
  ps aux | grep -E "mflux|generate.py" | grep -v grep
  ```
  If something is running there, wait. Don't kill another project's process.
- Generated PNGs stay in `.cache/` (gitignored). Only the cut WebPs in `public/art/` and the manifest are committed.
- The owner authorized public GitHub publishing and automatic deployment on 2026-10-07. See [DEPLOYMENT.md](DEPLOYMENT.md) for the current setup.
- Commit messages are one plain sentence about what the player sees, ending with the `Co-Authored-By` line the session uses.
- Don't modify `~/Projects/ants` or `~/Projects/water-sort`; copying from them is fine.

## The generator

- **Model:** Z-Image Turbo, run locally through [mflux](https://github.com/filipstrand/mflux), 4-bit quantised (`mflux-community/z-image-turbo-mflux-q4`).
- **Script:** `scripts/art/generate.py` loads the model once, then works through a JSONL queue:
  - it re-reads the queue after every image, so you can append jobs while it runs;
  - it skips any job whose `<outdir>/<id>.png` already exists, so it is resumable, and to redo a picture you delete its PNG;
  - a failed job leaves an empty PNG and the run continues; the cut step ignores empty files;
  - the log goes to `<outdir>/_gen.log`, one line per image with its time.
- **Settings:**
  - 640×640 and 8 steps (the defaults; positional args 3–5 override width, height and steps);
  - seed 7 for everything so far.
- **Speed on this Mac:** the completed 28-image batch took about 25 minutes, with individual images taking 40–90 s. Load can increase that time.

Run (installs mflux into a throwaway uv env, nothing to set up):

```bash
uv run --no-project --with mflux python scripts/art/generate.py .cache/art/sets.jsonl .cache/art/sets
```

Start it in the background (`nohup … &` or the agent's background mode) and watch `.cache/art/sets/_gen.log`.

## Prompts

Each style is one template in `scripts/art/styles.py` (`STYLES`), with `{s}` replaced by the subject. These are the four kept styles, verbatim:

| Set | Template |
|---|---|
| sticker | `Die-cut sticker illustration of {s}, thick white sticker border, flat vector art, bold clean dark outline, simple cel shading, vibrant colors, centered, plain light grey background, no text.` |
| kawaii | `Kawaii character of {s} with a cute happy face, big shiny eyes, rosy cheeks, flat vector illustration, thick rounded outline, pastel colors, centered, plain background, no text.` |
| watercolor | `Loose watercolor and ink illustration of {s}, hand painted, soft washes, delicate ink outlines, visible paper texture, centered, plain white background, no text.` |
| retro | `1950s retro cartoon illustration of {s}, vintage diner advertisement style, thick black outlines, limited warm palette, halftone shading, centered, plain cream background, no text.` |

**Subjects** are in `scripts/art/sets.py`: `INGREDIENTS` (32) and `DISHES` (27), keyed exactly like `src/core/ingredients.ts`. For example:
- tomato: `a ripe red tomato with a green stem`
- basil: `a sprig of fresh green basil leaves`
- pizza: `a slice of pizza with melted cheese`

Guidelines when editing subjects:
- **Match the tile colour.** Each ingredient sits on a tile of its own colour (`color` in `ingredients.ts`): onion lilac, garlic white, potato tan, and so on. A green onion on a lilac tile looks wrong.
- **Keep the background plain.** The cutout flood-fills the background from the picture's edges. The "plain … background" and "centered" words matter, and so does "no text" (otherwise the model writes labels).
- **One object.** Dishes should read at 40 px: one plate or bowl, no table scenes.

Build a queue:

```bash
python3 scripts/art/sets.py sticker --only ingredients > .cache/art/sets.jsonl   # 27 jobs
python3 scripts/art/sets.py sticker --only dishes >> .cache/art/sets.jsonl       # 27 more (next batch)
python3 scripts/art/sets.py sticker --all ...                                    # also redo the 5 samples
python3 scripts/art/sets.py sticker --only ingredients --redo onion             # the completed 28-job prompt set
```

The ids are `<set>-<key>`, which is what the cut step and the game expect. The five sample keys are skipped by default because they already exist in `.cache/art/styles/`.
`--redo key1,key2` includes specific sample keys in the queue; it does not delete cached PNGs.

**Redoing one bad picture:** delete `.cache/art/sets/<id>.png`, change that line's `seed` in the queue (e.g. 7 → 11) or tweak its subject, and run the generator again; it only renders missing files.

## Cutting pictures into game icons

```bash
python3 scripts/art/cut.py      # needs numpy + pillow; otherwise: uv run --no-project --with pillow --with numpy python scripts/art/cut.py
python3 scripts/art/cut.py --changed  # cut only new/changed sources; keep the manifest unchanged when its contents match
python3 scripts/art/contact-sheet.py sticker  # → .cache/art/sticker-ingredients-contact.png
```

`scripts/art/cut.py` reads `.cache/art/styles/*.png` and then `.cache/art/sets/*.png` (later wins) for the sets sticker, kawaii, watercolor and retro. For each picture it does five things:

1. **Cuts out the background.** It flood-fills from the picture's edges.
   - Sticker removes only the light grey background and its soft shadow, and keeps the white die-cut border.
   - Other styles also remove light low-saturation pixels.
2. **Centres it optically.** The centre sits halfway between the middle of the outline and the centre of mass, so a bulb with a thin sprout doesn't sink to the bottom of its chip.
3. **Squares it** with a 4% margin and resizes it to 192 px.
4. **Writes the files:**
   - `public/art/<set>/<key>.webp` for the game;
   - `_review/style/img/<set>-<key>.webp` for the review page.
5. **Rewrites the manifest** `src/ui/art.generated.ts` (`ART_KEYS`: which keys each set has). The game only requests files listed there.

It is slow-ish: pure Python flood fill, about 4 minutes for 20 pictures on a busy machine.

Emoji icons get the same optical centring at build time in `scripts/build-icons.ts` (resvg renders each food SVG and the viewBox is fitted).

## Checking the result

**Contact sheet:** paste into python3 and look at the JPG. Watch for:
- leftover background or halos;
- a missing sticker border;
- text in the picture;
- a colour that clashes with the tile;
- off-centre shapes.
```python
from PIL import Image; import glob
fs = sorted(glob.glob('public/art/sticker/*.webp')); W = 192; cols = 10
sheet = Image.new('RGBA', (W*cols, W*((len(fs)+cols-1)//cols)), (200,170,120,255))
for i, f in enumerate(fs): sheet.alpha_composite(Image.open(f).convert('RGBA'), ((i%cols)*W, (i//cols)*W))
sheet.convert('RGB').save('/tmp/sheet.jpg', quality=85)
```

**In the game:**
- run `npm run dev`, then open `http://localhost:5190/?level=12&icons=sticker` (the `icons=` param overrides the equipped set: sticker | kawaii | watercolor | retro);
- `?progress=40` unlocks the map, `?tips=2000` gives money for the Market, `?debug=1` shows difficulty numbers.

**Tests:** `npx vitest run`.
- `tests/economy.test.ts` checks that every manifest key is a real ingredient or dish and that its file exists. It also checks that every paid set has its 5 preview pictures (tomato, carrot, mushroom, onion, cheese).
- Run `npx tsc --noEmit -p .` too.
- The manifest test requires every ingredient to exist in the free Sticker set.

**Known looks:**
- Watercolor keeps a soft grey ground wash under objects; it's part of the style.
- Stickers keep a faint drop shadow on one side.

## How the game uses the art

- **`src/ui/iconStyle.ts`** has `ingredientHtml`, `tokenHtml`, `dishHtml`, `setArtSet` and `artSrc`.
  - The fallback order is equipped set → sticker → Fluent emoji.
  - Pictures render as `<img class="gen-icon" src="./art/<set>/<key>.webp">`.
- **`src/app/economy.ts`**:
  - `ART_SETS` holds ids, names, blurbs and prices;
  - tips: a first clear pays 10/20/30 by difficulty, plus 5 per new star.
- **`src/ui/Market.ts`** is the store UI, opened from the map's Market button or its tips pill. **`src/app/save.ts`** stores `tips`, `owned` and `artSet`.
- **Map plates** (`src/ui/MapScreen.ts`) already use `dishHtml`, so dish art appears there automatically.

### Board destinations

`src/view/BoardView.ts` draws plates with `dishHtml` and compares the returned HTML when deciding whether to redraw. Food targets the required ingredient's recipe icon using its dish and item indices. Each recipe tick appears after the food lands. Tickets show the current recipe; the next dish's ingredients appear after it is complete. Jar storage still follows last-in, first-out order.

## After generating a set

1. Run `python3 scripts/art/cut.py`, then the contact sheet, a look in the game, `npx vitest run` and `npx tsc --noEmit -p .`.
2. Regenerate outliers (new seed), then cut again.
3. Commit `public/art/<set>/`, `src/ui/art.generated.ts` and any prompt changes in `scripts/art/sets.py`, e.g. "Cook with sticker art for every ingredient".
4. Then the paid sets, in the order the owner picks (kawaii, watercolor, retro). Each is 54 more images, so two approvals per set.

## Other art scripts (older, from the first phase)

These are not needed for the icon sets:
- `scenes.py`, `tiles.py`, `pixelart.py`, `review.ts`, `render-emoji.ts`: the first art review (`_review/art/`).
- `styles.py`, `styles-tiles.py`, `styles-review.ts`: the six-style comparison page `_review/style/index.html`. `styles-tiles.py` is superseded by `cut.py`.

Map scenery (`src/ui/scenery.ts`) is hand-written SVG, not generated.
