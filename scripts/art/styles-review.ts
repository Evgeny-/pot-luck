/** Writes _review/style/index.html: icon style candidates on in-game tiles, plus emoji sets. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { INGREDIENTS } from '../../src/core/ingredients';

const ITEMS = ['tomato', 'carrot', 'mushroom', 'onion', 'cheese'];
const STYLES: [string, string, string][] = [
  ['sticker', 'Sticker', 'Die-cut stickers with a white border and bold outline: clean, readable at any size.'],
  ['kawaii', 'Kawaii', 'Flat ingredients with little faces: the most characterful, gives the game a personality of its own.'],
  ['clay', 'Clay', 'Soft 3D plasticine figurines (the model gave some of them faces): cozy and tactile.'],
  ['watercolor', 'Watercolor', 'Hand-painted cookbook look: elegant, but the soft edges read less crisply on small tiles.'],
  ['retro', 'Retro diner', '1950s cartoon with thick outlines and a limited palette.'],
  ['ceramic', 'Ceramic tile', 'Painted majolica tiles: the whole tile is the picture.'],
];
const SETS: [string, string][] = [['fluent-emoji-flat', 'Fluent flat (now)'], ['fluent-emoji', 'Fluent 3D'], ['noto', 'Noto'], ['twemoji', 'Twemoji'], ['openmoji', 'OpenMoji']];
const ICON: Record<string, string> = { tomato: 'tomato', carrot: 'carrot', mushroom: 'brown-mushroom', onion: 'onion', cheese: 'cheese-wedge' };
const color = (k: string) => INGREDIENTS.find((i) => i.key === k)?.color ?? '#ccc';
const arrow = '<span class="arr"><svg viewBox="0 0 24 24"><path d="M12 3 L21 14 H15 V21 H9 V14 H3 Z" fill="currentColor"/></svg></span>';
const tile = (k: string, inner: string, rot = 0, cls = '') => `<div class="tile ${cls}" style="--c:${color(k)}"><div class="body">${inner}</div><span class="arr-wrap" style="--rot:${rot}deg">${arrow}</span></div>`;
const svgOf = (set: string, name: string) => {
  const s = JSON.parse(readFileSync(`node_modules/@iconify-json/${set}/icons.json`, 'utf8'));
  const ic = s.icons[name] ?? s.icons[s.aliases?.[name]?.parent];
  if (!ic) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ic.left ?? 0} ${ic.top ?? 0} ${ic.width ?? s.width ?? 16} ${ic.height ?? s.height ?? 16}">${ic.body}</svg>`;
};
const rots = [0, 90, 270, 180, 0];
const styleBlock = ([key, title, note]: [string, string, string]) => {
  const ok = ITEMS.every((i) => existsSync(`_review/style/img/${key}-${i}.webp`));
  if (!ok) return '';
  const ceramic = key === 'ceramic';
  return `<section class="card"><h2>${title}</h2><p>${note}</p>
  <div class="big">${ITEMS.map((i) => `<img src="img/${key}-${i}.webp" alt="${i}">`).join('')}</div>
  <div class="row">${ITEMS.map((i, n) => tile(i, `<img src="img/${key}-${i}.webp" alt="">`, rots[n], ceramic ? 'ceramic' : '')).join('')}</div></section>`;
};
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pot Luck icon styles</title>
<style>
:root { --ink: #3b2a1e; --paper: #fffaf1; --edge: #dcc39a; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Baloo 2', system-ui, sans-serif; color: var(--ink); background: #fbf1e1;
  background-image: linear-gradient(90deg, rgba(226,84,66,.18) 50%, transparent 50%), linear-gradient(rgba(226,84,66,.18) 50%, transparent 50%); background-size: 38px 38px; }
main { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }
h1 { margin: 0 0 6px; font-size: 32px; } h2 { margin: 0 0 4px; font-size: 22px; }
p { margin: 0 0 12px; line-height: 1.45; font-weight: 600; max-width: 70ch; }
.card { background: var(--paper); border-radius: 20px; padding: 16px 18px; margin: 16px 0; box-shadow: 0 5px 0 var(--edge), 0 10px 22px rgba(60,35,15,.15); }
.big { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.big img { width: 110px; height: 110px; object-fit: contain; }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
.tile { position: relative; width: 74px; height: 74px; }
.tile .body { position: absolute; inset: 6%; border-radius: 28%; display: grid; place-items: center;
  background: radial-gradient(circle at 32% 26%, color-mix(in srgb, var(--c) 55%, #fff) 0, var(--c) 62%, color-mix(in srgb, var(--c) 85%, #3a2010) 100%);
  box-shadow: 0 5px 0 color-mix(in srgb, var(--c) 58%, #3a2010), 0 7px 9px rgba(60,35,15,.28), inset 0 0 0 3px rgba(255,255,255,.55); overflow: hidden; }
.tile .body img, .tile .body svg { width: 66%; height: 66%; object-fit: contain; filter: drop-shadow(0 2px 0 rgba(60,30,10,.2)); }
.tile.ceramic .body { background: #fff; }
.tile.ceramic .body img { width: 100%; height: 100%; filter: none; }
.arr-wrap { position: absolute; left: 50%; top: 50%; width: 36%; height: 36%; transform: translate(-50%, -50%) rotate(var(--rot)) translateY(-29.6px); }
.arr { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; background: var(--paper); color: var(--ink); box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--c) 50%, #3b2a1e), 0 2px 0 rgba(60,30,10,.35); }
.arr svg { width: 72%; height: 72%; }
table { border-collapse: separate; border-spacing: 8px 6px; }
td.name { font-weight: 800; white-space: nowrap; }
</style></head><body><main>
<h1>Pot Luck: icon styles</h1>
<p>The same five ingredients in six styles generated locally with Z-Image Turbo (mflux, 8 steps, ~45 s each), cut out and placed on the game's tiles with their arrow badges. Below: the emoji sets we could use without any generation. Pick one direction (or two to mix: e.g. kawaii ingredients with sticker pots).</p>
${STYLES.map(styleBlock).join('\n')}
<section class="card"><h2>Emoji sets (no generation needed)</h2><p>The prototype uses Fluent flat. Fluent 3D is softer and closer to the clay look.</p>
<table>${SETS.map(([set, name]) => `<tr><td class="name">${name}</td><td><div class="row">${ITEMS.map((i, n) => tile(i, svgOf(set, ICON[i]), rots[n])).join('')}</div></td></tr>`).join('')}</table></section>
</main></body></html>`;
writeFileSync('_review/style/index.html', html);
console.log('wrote _review/style/index.html', html.length);
