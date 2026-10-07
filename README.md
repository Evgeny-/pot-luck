# 🍲 Pot Luck

A cozy kitchen puzzle. Tap an ingredient and it slides off the board the way its arrow points,
straight into the pot on that side, if nothing is in its way. Every pot wants its recipe **in
order**. An ingredient that arrives too early waits in a tiny side bowl, and the bowl has only
three spots. Think ahead, or the kitchen jams.

- No timer, no move limit, unlimited undo
- 50 levels with a hard peak every 5th level, a super hard one every 10th, and breathers in between
- New ideas along the way: the salad bowl, stacked tiles, lids, two-dish pots, the skewer, turn
  pads, the knife bar and frozen tiles
- Three stars for a perfect cook: use the bowl as rarely as possible

## Development

```bash
npm install
npm run dev      # http://localhost:5190
npm test         # rules, and every level replays its stored solution
npm run build    # typecheck + production build
```

URL flags:

- `?level=N` opens a level;
- `?debug=1` shows each level's difficulty on the map, the difficulty curve, per-level stats in the
  HUD, and an auto-solve 🐞 button;
- `?progress=N` unlocks levels up to N;
- `?reset` clears saved progress.

Content and experiments (they use [Bun](https://bun.sh)):

```bash
bun scripts/build-levels.ts 1-50          # generate levels → .cache/levels (skips finished ones)
bun scripts/build-levels.ts merge         # → src/data/levels.json
bun scripts/build-levels.ts report        # the difficulty curve as text
bun scripts/experiment.ts                 # rule experiments (PART=k/8 to run in parallel)
bun scripts/experiment.ts table           # results table
bun scripts/traps.ts base,skewer3,lids    # find "tempting move loses" examples
bun scripts/build-icons.ts                # Fluent emoji → src/ui/emoji.generated.ts
```

Generated art (Z-Image Turbo, locally through mflux):

```bash
python3 scripts/art/scenes.py > .cache/art/jobs.jsonl
uv run --no-project --with mflux python scripts/art/generate.py .cache/art/jobs.jsonl .cache/art/gen
bun scripts/art/render-emoji.ts
uv run --no-project --with pillow --with numpy python scripts/art/tiles.py
bun scripts/art/review.ts                 # → _review/art/index.html
```

More documentation in `docs/`:

- [docs/PLAN.md](docs/PLAN.md): what was reused from Pixel Picnic and why;
- [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md): which rules make players think;
- [docs/DESIGN.md](docs/DESIGN.md): the rules, how difficulty is measured, the campaign curve and
  the open questions.

<sub>Icons: [Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (MIT). Font: [Nunito](https://fonts.google.com/specimen/Nunito) (OFL 1.1).
Sound is synthesized with the Web Audio API.</sub>
