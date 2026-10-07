# Rule experiments

**Question.** Which rules make Pot Luck worth thinking about, and which only add things to learn?

**Method.**

- Each variant gets 40 generated levels, all solver-verified.
- Each level is played by four simulated players:
  - *random*, which taps any legal move;
  - *casual*, which delivers when it can and otherwise parks at random;
  - *greedy*, which makes the best-looking move: deliver, else park what is needed soon and frees
    something;
  - *thinker*: for each of its 4 most natural moves, it imagines the next 5 moves of natural play
    and avoids moves that jam the kitchen within that horizon. This is a person who thinks a few
    moves ahead.
- Every level also has its reference solution walked:
  - *critical* counts the steps where some other legal move loses;
  - *trap density* is the share of legal moves that lose, averaged over the line.
- *Par* is the fewest bowl uses of any solution.
- Rerun with `bun scripts/experiment.ts` (with `PART=k/8` for parallel runs), then
  `bun scripts/experiment.ts table`. The variant definitions are in `scripts/lib/variants.ts`.

The **baseline** is a 6×6 board with 28 tiles and four pots, one per edge, with seven-step strict
recipes and a 3-spot *router* bowl with automatic delivery. Unless a row says otherwise, the
generator runs with detour 0.6 and tight 0.9.

## Results (40 levels per row)

| Variant | Learn | Yield | Tiles | Random | Casual | Greedy | Thinker | Critical | Trap density | 1st-move traps | Par |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **Baseline** | 0 | 100% | 28 | 19% | 19% | 72% | 87% | 1.1 | 0.010 | 0% | 6.9 |
| Baseline, loose generator | 0 | 100% | 28 | 30% | 34% | 91% | 99% | 0.2 | 0.002 | 0% | 4.5 |
| 5×5, 20 tiles | 0 | 100% | 20 | 49% | 47% | 85% | 95% | 0.3 | 0.005 | 0% | 5.2 |
| 7×7, 40 tiles | 0 | 90% | 40 | 3% | 3% | 44% | 72% | 3.3 | 0.034 | 13% | 10.4 |
| Bowl 4 | 0 | 100% | 28 | 30% | 32% | 86% | 96% | 0.5 | 0.005 | 0% | 8.1 |
| Bowl 2 | 0 | 100% | 28 | 8% | 9% | 61% | 91% | 2.2 | 0.018 | 0% | 5.4 |
| Bowl 1 | 0 | 100% | 28 | 6% | 9% | 51% | 82% | 5.9 | 0.055 | 14% | 2.8 |
| No bowl (B2) | 0 | 100% | 28 | 62% | 62% | 74% | 80% | 3.5 | 0.029 | 4% | 0 |
| Hold bowl (items wait for their own pot) | 0 | 100% | 28 | 50% | 47% | 90% | 99% | 1.4 | 0.012 | 1% | 2.7 |
| Hold bowl, 2 spots | 0 | 95% | 28 | 30% | 30% | 77% | 97% | 2.8 | 0.025 | 3% | 2.3 |
| Router, player sends bowl items (tap) | 0 | 100% | 28 | 21% | 19% | 72% | 85% | 1.0 | 0.006 | 0% | 7.0 |
| **Skewer** (last in, first out), 3 | 1 | 100% | 28 | 4% | 13% | 57% | 72% | **6.4** | 0.056 | 1% | 5.5 |
| Skewer 4 | 1 | 98% | 28 | 2% | 12% | 59% | 68% | **8.1** | 0.067 | 6% | 6.8 |
| Any-order dishes (R2) | 1 | 100% | 28 | 100% | 100% | 100% | 100% | 0 | 0 | 0% | 0 |
| One any-order salad among strict pots | 1 | 100% | 28 | 17% | 19% | 72% | 90% | 2.1 | 0.015 | 1% | 5.8 |
| Base-first dishes (R3) | 1 | 100% | 28 | 55% | 50% | 84% | 92% | 1.2 | 0.011 | 0% | 5.3 |
| Dish queue, 2 × 4 per pot (R4) | 1 | 85% | 32 | 11% | 12% | 63% | 89% | 0.8 | 0.007 | 0% | 7.9 |
| Many copies of an ingredient | 0 | 100% | 28 | 41% | 43% | 87% | 98% | 0.4 | 0.003 | 0% | 6.5 |
| No copies | 0 | 100% | 28 | 14% | 15% | 62% | 86% | 1.0 | 0.010 | 0% | 7.2 |
| Two pots + walls (E2) | 0 | 78% | 28 | 4% | 4% | 58% | 89% | 1.0 | 0.013 | 0% | 6.4 |
| Split edges, 6 pots (E3) | 1 | 90% | 30 | 36% | 36% | 81% | 91% | 0.4 | 0.002 | 0% | 7.4 |
| **Lid** (salad opens after the stew) (M7) | 1 | 100% | 28 | 5% | 5% | **37%** | 72% | 3.7 | 0.038 | 1% | 7.3 |
| Stacked tiles, 6 stacks (M5) | 1 | 100% | 32 | 9% | 9% | 65% | 86% | 1.3 | 0.013 | 2% | 8.3 |
| Turn pads, 2 (M3) | 2 | 100% | 28 | 17% | 18% | 75% | 91% | 1.2 | 0.012 | 2% | 7.0 |
| Knife bar, 2 pots × 11 (M1) | 2 | 57% | 22 | 8% | 12% | 77% | 95% | 1.3 | 0.016 | 0% | 5.6 |
| … the same without the knife (control) | 0 | 100% | 22 | 12% | 15% | 77% | 96% | 1.1 | 0.018 | 0% | 4.9 |
| Frozen tiles, 5 (M9) | 1 | 100% | 28 | 17% | 17% | 59% | 82% | 1.1 | 0.010 | 1% | 7.2 |
| Wild spice, 2 (M8) | 1 | 100% | 28 | 6% | 8% | 21% | 33% | 9.1 | **0.133** | **52%** | 7.8 |
| Lid + bowl 2 | 1 | 100% | 28 | 3% | 4% | 40% | 84% | 4.5 | 0.049 | 2% | 5.2 |
| Stacks + bowl 2 | 1 | 100% | 32 | 4% | 5% | 47% | 83% | 3.4 | 0.028 | 1% | 6.3 |
| **Skewer + lid** | 2 | 95% | 28 | 1% | 6% | 48% | 75% | **7.5** | **0.089** | 3% | 5.6 |
| 7×7 + bowl 2 | 0 | 78% | 40 | 1% | 1% | 41% | 91% | 3.6 | 0.024 | 1% | 7.4 |

Yield is the share of seeds that produced a level. "Learn" is the number of extra rules a
player must learn.

## What the numbers say

1. **The baseline is not too shallow, if the board is dense.** At 28 tiles on 36 cells, greedy
   fails 28% of the time and random and casual players fail about 80%. That is already the brief's
   band for levels 11–40. It is *forgiving*, though: about one critical decision per level, and
   0.01 trap density. One wrong park is usually recoverable, and it takes several to lose. On
   sparse or small boards (5×5 with 20 tiles) it really is shallow: random wins half the time.
2. **Free levers (no new rules) cover a lot of the difficulty range:**
   - bowl size: 4 → 3 → 2 → 1 moves greedy from 86% to 72%, 61% and 51%, and critical decisions
     from 0.5 to 1.1, 2.2 and 5.9;
   - board size and density;
   - fewer copies of an ingredient (copies relax the puzzle, because any onion fits any pot that
     wants onion);
   - two-pot boards, which are hostile to random play but fair to a planner.
3. **"Delivering is always safe" is false whenever an ingredient has copies.** Using the wrong
   onion, the one that isn't blocking anything, is the most common trap in every variant (see the
   examples below). This trap needs no new rule. It just needs copies on the board and a tight
   bowl.
4. **Twists ranked by depth for the rules they cost:**
   - **Skewer** (one rule: "only the last item in can come out"). It is the deepest single twist:
     about 6–8 critical decisions per level, five to seven times the baseline, and the thinker
     drops to about 70%. The order in which you park now matters, not only what you park, and the
     rule is very easy to show on screen.
   - **Lids** (one rule: "this pot opens when that one is served"). Greedy drops to 37% and the
     thinker to 72%. Pots now compete, and freeing the pot that pays off immediately is often wrong.
   - **Stacks** (one rule: "there's another tile underneath"). They give a moderate gain on their
     own and become strong with a 2-spot bowl. They are also the cheapest way to get more
     ingredients onto a phone-sized board.
   - **Frozen tiles** and **dish queues**: small gains.
   - **Turn pads** and the **knife bar**: no planning depth at all (compare the knife with its
     control). They make lanes harder to *read*, which the solver can't measure. Use them for
     variety and perceptual challenge, sparingly.
5. **Things that make the game easier or worse:**
   - *Any-order dishes everywhere*: trivial, 100% for every player. One any-order salad among
     strict pots is fine, a nice change of pace.
   - *Hold bowl*, where items wait for their own pot: much easier (greedy 90%, planner 100%). It is
     readable and could serve as a tutorial mode, but the router bowl is the better default.
   - *Split edges*: easier, because more pots want things at once, and harder to read.
   - *Wild spice*: broken in zero-waste levels. The spice must stand in for one exact missing
     ingredient; spending it anywhere else leaves a tile that nothing will ever accept. 52% of
     first moves lose, and that is a hidden trap, not a puzzle. It only works if leftovers are
     allowed (G2), so it is shelved.
   - *Tap versus auto* bowl delivery: no difference in difficulty, so auto (fewer taps) is the
     default.
6. **What the thinker adds.** A player who looks 5 natural moves ahead wins 87% of baseline
   levels, but only 68–75% with a skewer, lids or a 7×7 board. Those traps bite later than a
   short look-ahead can see. An earlier version of the thinker imagined the *whole* rest of the
   game for every move and won almost everything. That is superhuman, so the horizon was cut to 5.
7. **The effort metric doesn't separate variants here.** It gives 0.03–0.2 everywhere except the
   wild spice. Its "natural" search uses the same strong heuristic as greedy, so it rarely
   backtracks. The campaign uses win rates and critical decisions instead.

## Recommended rule set

- **Baseline:**
  - dense boards;
  - strict recipes;
  - a router bowl with automatic delivery: a bowl item flies to the first pot, clockwise from the
    top, that wants it;
  - four pots, sometimes three or two with walls;
  - bowl size 4 on relax levels, 3 on normal levels and 2 on hard ones.
- **Twist 1: stacks.** Cheap, phone-friendly, and strong together with bowl 2.
- **Twist 2: lids.** These make the order of pots matter.
- **Twist 3: skewer.** The "boss" bowl, used on hard and super hard levels.
- **For variety, not depth:**
  - an any-order salad pot on relax levels;
  - two-dish pots;
  - turn pads and the knife bar later in the campaign;
  - frozen tiles.

## Trap examples

These were found with `bun scripts/traps.ts`, on 5×5 versions of the variants. Each is a position
on a real solution where the move that *looks* best loses.

How to read the boards:

- A cell shows the ingredient letter and its arrow.
  - `+` means another tile is underneath.
  - Letters: T tomato, O onion, C carrot, G garlic, M mushroom, P potato, E egg, B pepper,
    A eggplant, F fish, S shrimp.
- In a recipe, `[X]` is the next item and lowercase letters with ✓ are done.

### Skewer: use the copy that is in the way

```
    0  1  2  3  4
  +---------------+
0 | . O> M^  . M> |
1 |S< E< M<  .  . |
2 |E< A^ G< Bv  . |
3 | . Tv E^ S<  . |
4 | . S>  .  . M> |
  +---------------+
  pot 0 top:    soup:  [M] A C E G
  pot 1 right:  stew:  [M] O M S B
  pot 2 bottom: curry: p✓ [T] F B S
  pot 3 left:   salad: b✓ [E] S E M
  skewer: [F B C]  (full; C came in last)
```

- **The situation.** The stew wants a mushroom, and two mushrooms point at it: (4,0) and (4,4).
- **Tempting:** the mushroom at (4,4). It is free, the stew wants it, and it looks like a clean
  delivery.
- **Why it loses.** The stew then wants an onion. The only onion, at (1,0), points right, and its
  lane runs through two mushrooms: (2,0), which the soup will take, and the *other* stew mushroom
  at (4,0). That mushroom can no longer go into the stew
  (the stew wants onion now), and the skewer is full. The stew can never be served.
- **Right:** use the mushroom at (4,0) first, the one that is in the way. Then the onion's lane
  opens.

### Lid: free the pot that opens the lid

```
    0  1  2  3  4
  +---------------+
0 | .  . M^ C^ E> |
1 | .  .  . T^  . |
2 |Fv B< O< P> C> |
3 |Ov  .  . C> Gv |
4 |G<  .  . B^ A> |
  +---------------+
  pot 0 top:    soup:  a✓ f✓ [T] B M
  pot 1 right:  stew:  [P] C O E A
  pot 2 bottom: curry: s✓ [G] C O C
  pot 3 left:   salad (🔒 opens when the stew is served): G O C B F
  bowl: [O C _]
```

- **The situation.** There is one bowl spot left, and two carrots could be parked.
- **Tempting:** park the carrot at (3,0). It frees the tomato under it, and the soup takes the
  tomato at once.
- **Why it loses.** The bowl is now full, and the stew's potato at (3,2) is still stuck behind the
  carrot at (4,2). The stew can't progress, so the salad's lid never opens, and the salad needs
  half of what is on the board.
- **Right:** park the carrot at (4,2). That frees the potato, which unlocks the stew, which
  eventually opens the salad.

### No bowl: the same trap without any extra rule

```
    0  1  2  3  4
  +---------------+
0 |A< T< C^ B^ B^ |
1 |Ev T^  . F>  . |
2 |F<  . Av G> P> |
3 | .  . O> P^  . |
4 |A< Mv B< Cv Sv |
  +---------------+
  pot 0 top:    soup:  [B] C B P T
  pot 1 right:  stew:  s✓ [F] P G O
  pot 2 bottom: curry: [S] C M A E
  pot 3 left:   salad: [A] B A T F
```

- **The situation.** The salad wants an eggplant, and the eggplants at (0,0) and (0,4) both slide
  left into it.
- **Tempting:** the one at (0,0), the obvious delivery.
- **Why it loses.** The salad then wants the pepper at (2,4), but the pepper's lane runs through
  the eggplant at (0,4). That eggplant can't go anywhere: the salad wants pepper now, and there is
  no bowl.
- **Right:** use the eggplant at (0,4) first, any time before the salad needs its pepper.

### Bowl 2: what to park

```
    0  1  2  3  4
  +---------------+
0 |C< F> B^ F^ E> |
1 |T^ Tv Av F<  . |
2 |E^ S<  .  .  . |
3 | .  . S>  . Av |
4 |Ev P<  .  . Ov |
  +---------------+
  pot 0 top:    soup:  [T] B E F S
  pot 1 right:  stew:  b✓ [S] E M F
  pot 2 bottom: curry: e✓ g✓ [A] E A
  pot 3 left:   salad: [P] O C F T
  bowl: [M _]
```

- **Tempting:** park the egg at (0,4). It is in the potato's lane, and the salad wants the potato
  now.
- **Why it loses.** The bowl fills up, with the mushroom and the egg. The salad takes its potato
  and then wants the onion at (4,4). That onion slides *down* into the curry, so it has to go
  through the bowl, and the bowl is full.
- **Right:** park the onion first. It is the salad's next-but-one ingredient, and it has to pass
  through the bowl anyway.
