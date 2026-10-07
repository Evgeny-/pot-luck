# Pot Luck soundtrack

The music uses written eight-bar melodies inside a 32-bar arrangement. A statement leads into a
response, followed by a quieter bridge and a return. Cadences leave space between phrases. Later
passes change a few melodic turns and pickups while keeping the tune recognizable.

Italy uses single mandolin plucks with accordion accompaniment, then hands the melody to the
accordion in the bridge. The rapid repeated picking from the earlier arrangement is gone.
Japan alternates koto and flute phrases over a sparse bass line. The diner keeps a swung rhythm,
with moving bass and electric piano voicings. India's sitar answers a lighter flute section.

Every cuisine keeps its instrument palette. The score and instrument voices are original Web
Audio synthesis. Music stays beneath the game sounds; its volume, mute state and crossfades use
the existing mixer. Voice caps remain at 12 per song and 16 across a crossfade.

## Listen to an offline preview

Install the optional renderer into the ignored cache, then render the same score and synth voices
the game uses:

```bash
npm install --prefix .cache/audio/runtime --no-audit --no-fund web-audio-engine@0.13.4
bun scripts/audio/preview.ts italy japan
```

This writes `.cache/audio/italy-preview.wav` and `.cache/audio/japan-preview.wav`. Each file lasts
60 seconds. Preview peaks are normalized to a consistent listening level; the game keeps its
quieter mix. The renderer adds no dependency to the shipped game.

Other accepted themes are `menu`, `mexico`, `usa`, `india` and `china`.

## Verify changes

```bash
npx vitest run tests/audio.test.ts
npm run typecheck
```

Tests check melodic movement, changes in the lead instrument and quieter bridges. Every phrase
cycle leaves a rest at its cadence. Playback runs for 120 seconds per theme to reach the bridge
and return, checking scheduling, voice budgets and cleanup. Separate cases cover crossfades,
mute, volume controls and the offline renderer.
