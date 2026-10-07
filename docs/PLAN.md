# Pot Luck: plan

Pot Luck is Arrows with recipes. You tap a tile and, if its lane is clear, it slides off the board
into the pot on that edge. Pots want ingredients in recipe order, and an ingredient that arrives
too early waits in a small side bowl. You win when every dish is served. There is no timer, no
move limit, and undo is unlimited.

This file records what we're building and why, before any code.

## 1. What we take from Pixel Picnic (and water-sort)

Pixel Picnic and Pot Luck have the same skeleton: a few holding spots that can clog, a queue of
things that only opens up in a certain order, and levels that must be won by thinking, not luck.
Most of its machinery carries over with a one-to-one mapping:

| Pixel Picnic | Pot Luck |
|---|---|
| 4 slots that clog when a box can't eat yet | the side bowl (3 spots) that clogs with early arrivals |
| queue columns, only the front box is takeable | lanes, only a tile with a clear lane can leave |
| `dig`: the reference solution parks a box early | *detours*: the reference solution parks an ingredient in the bowl |
| `spread`: decoy boxes at the column fronts | *decoys*: free tiles nobody wants yet, placed in front of needed ones |
| fences and gates | walls, split edges, lids |
| frozen boxes, linked boxes | frozen tiles, stacked tiles |
| hidden boxes | not used: every rule and every tile stays visible, so nothing is a guess |

What gets reused:

- **A deterministic core.** `Sim` applies a move, emits events, and has a cheap `clone()` and a
  hashed `key()`. The view only animates the events. The game, the solver and the generator all
  run the same rules.
- **The solver.** It is a depth-first search with a memo of failed positions, move ordering and a
  node budget, and it returns solved, unsolvable or unknown.
- **Simulated players and critical decisions.** Random, casual, greedy and a lookahead planner
  play the level many times. A critical decision is a point on the solution where some other legal
  move leads into a dead end.
- **The generate, measure and tune loop.** The solution is built in by construction. A hardness
  knob is bisected against a target band, then a solver-checked local search tunes the level and
  `ensureCritical` keeps tuning until there are enough real decisions.
- **The campaign rhythm.** Every 5th level is hard and every 10th is super hard. Each new
  mechanic gets a gentle intro level with a one-screen dialog.
- **From water-sort:**
  - the *effort* metric (log2 of the positions a natural-order search with undo explores per
    solution move);
  - the annealing `harden` step;
  - the challenge level being followed by a level a notch easier.
- **Art.**
  - The emoji path: Fluent Emoji SVG, then resvg, then optionally `pixelize()`.
  - The local Z-Image Turbo path: mflux, `generate.py`, then `pixelart.py`.
  - OKLab readability checks from `palette.ts`, so that ingredient colours stay distinguishable.

What waits until the rules are settled:

- the three.js renderer. The prototype is DOM/CSS in Pixel Picnic's look, so changing a rule
  doesn't mean rebuilding a 3D scene;
- the shop, coins and hats, night mode, endless mode, adaptive render scale and deploys.

## 2. Baseline rules

- **Board.** A W×H grid of ingredient tiles, each with an arrow (up, right, down or left).
- **Pots.** Each edge of the board feeds a pot, or is a wall. A pot shows its recipe as a strip,
  with the next ingredient highlighted.
- **Tapping a tile.** The tile looks along its lane to the edge.
  - If any tile is in the lane, it shakes and nothing happens. There is no penalty.
  - Otherwise it slides off into that edge's pot.
  - If it is the pot's next ingredient, the recipe advances.
  - If not, it drops into the side bowl. When the bowl is full, that slide isn't allowed.
- **The bowl.** Bowl items go to a pot whose next ingredient they are. Two variants are tested:
  - *router*, as in the brief: a bowl item can go to any pot that wants it;
  - *hold*: an item waits for the pot it slid into, so the arrow always tells the truth.
- **Win and stuck.** You win when every pot is served, the board is empty and the bowl is empty.
  Levels are zero-waste. You are stuck when no move is legal; the game then offers undo or restart.

## 3. Where the depth comes from, and the "always safe" problem

The brief warns that delivering a pot's next ingredient is always safe, so a greedy player might
win everything. That warning is mostly true, but not entirely. There are three sources of real
decisions:

1. **Parking budget.** You can only park three things. Each one must be one that unblocks
   something soon *and* is itself wanted soon. This is Pixel Picnic's slot clog, and in Pixel
   Picnic it carried 280 levels.
2. **Which copy first.** When a recipe needs onion twice, or two pots both want onion, the onions
   are interchangeable for the pots but not for the board. You should use the copy that is
   *blocking* something now. Delivering the "next" ingredient is unsafe when it is the wrong copy.
3. **Twists that change the board's geometry or the pots' order.** Examples are stacks, bent lanes,
   lids and a knife bar.

So the plan is to measure first and then decide. We generate baseline levels, run the greedy
player, and look at its win rate next to the planner's. If greedy wins too often, the twists that
create the second and third kind of decision get priority.

## 4. Mechanics to test (rule flags, one engine)

The cost column is how much a new player has to learn. "Depth?" is my guess, which the experiments
will confirm or refute.

| Flag | Rule | Cost | Depth? | Why it might matter |
|---|---|---|---|---|
| bowl size 2/3/4 | | 0 | knob | the main difficulty lever, like Pixel Picnic's slot count |
| no bowl (B2) | wrong slides are impossible | 0 | ? | a pure ordering puzzle, where "which copy first" is everything |
| skewer (new) | the bowl is a stack: only the last item can leave | 1 | high? | parking order matters, not only what you park |
| hold vs router | where bowl items can go | 0 | ? | readability against flexibility |
| any-order pot (R2) | a salad bowl takes its items in any order | 1 | easier | relief levels, and variety between pots |
| base-first (R3) | e.g. "onion first, then the rest in any order" | 1 | low | a middle step between strict and any order |
| dish queue (R4) | a served pot loads its next dish | 1 | medium | more ingredients per pot, more duplicates, celebration beats |
| two pots and walls (E2) | only some edges are pots | 0 | lever | simple early boards, with all arrows up and down |
| split edges (E3) | half an edge per pot | 1 | medium | the destination depends on the tile's position |
| stacked tiles (M5) | another tile sits underneath, with its arrow shown | 1 | high? | removing a tile doesn't free its cell, and the tile underneath has its own plans |
| turn pads (M3/M10) | a floor arrow that turns sliding tiles | 2 | high? | bent lanes create blocking relations you have to trace |
| knife bar (M1) | crossing a steel bar makes X into "chopped X" | 2 | medium | pots want chopped or whole, so the same carrot means different things |
| lids (M7) | a pot opens when another pot is served | 1 | medium | the order in which pots finish matters |
| frozen tile (M9) | thaws when a neighbour leaves | 1 | low | a cheap extra dependency |
| wild spice (M8) | counts as whatever its pot needs | 1 | medium | a resource you shouldn't spend early |
| long tiles (M4), sticky dough (M6) | later | 2–3 | ? | dough changes the board and is the most complex, so it is last |

The goal of the experiments is to find which twists give the most depth for the least rules.

## 5. Measuring difficulty

Every generated level is measured, never guessed:

- **Solver**: it must report solvable. It also gives the reference line, the minimum number of
  bowl uses (*par*) and the peak bowl use.
- **Players**: win rates for random, casual (prefers deliveries), greedy (delivers when possible,
  otherwise parks by "needed soonest and unblocks something") and planner (two or three moves of
  lookahead). There are about 100–200 runs each.
- **Traps**:
  - critical decisions along the solution, counted as in Pixel Picnic;
  - trap density, the share of legal moves that lose, averaged along the solution;
  - first-move traps.
- **Effort**, from water-sort: log2(positions explored ÷ solution length) ÷ 6, taking the median
  of several noisy natural-order searches.
- **One score D (0–1)** for ordering and plotting. It blends greedy failure, planner failure and
  effort. It is calibrated on data, and later on the owner's playtests.

Stars are based on bowl uses. Three stars means a perfect cook (bowl uses at or below par). This
rewards thinking without a move limit.

## 6. The difficulty curve: a sawtooth, not a ramp

The curve is shaped like Pixel Picnic's, with peaks and valleys over a slowly rising base.

```
D
│            ▲10                 ▲20
│     ▲5     █           ▲15     █
│     █    ▄ █     ▄     █    ▄  █
│  ▄▄ █ ▄  █ █  ▄  █ ▄▄  █ ▄  █  █
│▄▄██▄█▄█▄▄█▄█▄▄█▄▄█▄██▄▄█▄█▄▄█▄▄█▄
└──────────────────────────────────── level
   ↑ intro (valley)    ↑ intro (valley)
```

- Each block of 10 runs: an intro or breather, three rising normal levels, a **hard** level, a
  breather, three rising normal levels, then a **super hard** level.
- A new mechanic arrives on a valley: a small board where the mechanic is the whole point.
- After a peak comes a "relax" level. These are big, satisfying boards with little thinking,
  which is the plain Arrows pleasure.
- Variety also comes from the shape of a level, not only its difficulty:
  - *rush*: many tiles, loose order;
  - *gridlock*: dense, with a tight bowl;
  - *twins*: two pots with the same ingredients;
  - *long recipe*;
  - *cross traffic*;
  - *columns*: all arrows up, like Pixel Picnic's queue.

## 7. Generator (reverse construction)

1. Pick recipes per pot, including dish queues.
2. Play a *virtual cook*, like Pixel Picnic's `buildSequence`, to get the reference removal order.
   At each step it either delivers some pot's next ingredient, sends a bowl item, or *parks* a
   future ingredient (a detour). The detour probability and how far ahead the parked item is
   needed are the hardness knobs.
3. Place tiles in reverse removal order. Tile *k* goes on an empty cell whose lane to its exit
   avoids every tile already placed (those leave after *k*).
   - Cells that sit in the lanes of soon-to-leave tiles are preferred. That turns detours into
     necessities and creates forced orders.
   - Mechanics use the same rule with their own path function (turn pads, knife bar, stacks).
4. Verify with the solver, measure, and bisect the hardness knob toward the level's target band.
   Then run a solver-checked local search (move or rotate a tile, swap two tiles, swap recipe
   items) and `ensureCritical`.

## 8. Build order

1. Engine (`src/core`): rules with every flag, events, clone/key, an ASCII printer, and tests.
2. Solver, players and metrics.
3. Generator and tuner.
4. Experiments (`scripts/experiment.ts`), written up in `docs/EXPERIMENTS.md`. This picks the
   baseline rule set and the order in which mechanics are introduced.
5. Campaign builder: the first ~40 levels on the sawtooth, every one solver-verified with a stored
   solution, and a test that replays them.
6. Playable DOM prototype (portrait first):
   - tap to slide, a shake when blocked, and a lane preview on press;
   - recipe strips, the bowl, and undo, restart and hint;
   - stars, a level map, intro dialogs, and `?debug=1` with metrics and auto-solve.
7. Art: Fluent emoji ingredient tiles now, a small Z-Image test batch, and a comparison page in
   `_review/art/`.
8. `docs/DESIGN.md`: final rules, recommended rule set, a ladder to level 100, and open questions.
