/** Writes _review/art/index.html: emoji vs generated art, smooth vs pixel, on in-game tiles. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DISHES, INGREDIENTS } from '../../src/core/ingredients';

const set = JSON.parse(readFileSync('node_modules/@iconify-json/fluent-emoji-flat/icons.json', 'utf8'));
const svg = (name: string) => {
  const ic = set.icons[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ic.width ?? set.width} ${ic.height ?? set.height}">${ic.body}</svg>`;
};
const arrow = '<span class="arr"><svg viewBox="0 0 24 24"><path d="M12 3 L21 14 H15 V21 H9 V14 H3 Z" fill="currentColor"/></svg></span>';
const tile = (color: string, inner: string, px = false) => `<div class="tile${px ? ' px' : ''}" style="--c:${color}"><div class="body">${inner}</div>${arrow}</div>`;
const img = (src: string) => `<img src="${src}" alt="">`;
const items = [
  ...INGREDIENTS.map((i) => ({ key: i.key, name: i.en, color: i.color, icon: i.icon })),
  { key: 'pot', name: 'Soup pot', color: DISHES.soup.color, icon: DISHES.soup.icon },
  { key: 'salad', name: 'Salad bowl', color: DISHES.salad.color, icon: DISHES.salad.icon },
];
const generated = items.filter((i) => existsSync(`_review/art/img/gen-${i.key}.png`));
const row = (i: typeof items[0]) => `<tr><th>${i.name}</th>
  <td>${tile(i.color, svg(i.icon))}</td>
  <td>${tile(i.color, img(`img/emojipx-${i.key}.png`), true)}</td>
  <td>${existsSync(`_review/art/img/gen-${i.key}.png`) ? tile(i.color, img(`img/gen-${i.key}.png`)) : '<span class="na">—</span>'}</td>
  <td>${existsSync(`_review/art/img/genpx-${i.key}.png`) ? tile(i.color, img(`img/genpx-${i.key}.png`), true) : '<span class="na">—</span>'}</td></tr>`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pot Luck art directions</title>
<style>
:root { --ink: #2b2140; --cream: #fff7e8; }
body { margin: 0; font-family: Nunito, system-ui, sans-serif; color: var(--ink); background: #a8dccf;
  background-image: linear-gradient(rgba(255,255,255,.35) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.35) 2px, transparent 2px); background-size: 46px 46px; }
main { max-width: 860px; margin: 0 auto; padding: 24px 16px 60px; }
h1 { margin: 0 0 6px; font-size: 30px; } h2 { margin: 30px 0 8px; }
p { max-width: 70ch; line-height: 1.45; font-weight: 600; }
.card { background: var(--cream); border-radius: 22px; padding: 16px; box-shadow: 0 6px 0 #d6b98a, 0 10px 24px rgba(0,0,0,.15); overflow-x: auto; }
table { border-collapse: separate; border-spacing: 10px 8px; }
th { text-align: left; font-size: 14px; white-space: nowrap; } thead th { font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #8a6c47; text-align: center; }
.tile { position: relative; width: 72px; height: 72px; margin: 0 auto; }
.tile .body { position: absolute; inset: 7%; border-radius: 26%; display: grid; place-items: center;
  background: linear-gradient(180deg, color-mix(in srgb, var(--c) 60%, #fff), var(--c));
  box-shadow: 0 6px 0 color-mix(in srgb, var(--c) 62%, #3a2010), inset 0 2px 0 rgba(255,255,255,.65); }
.tile .body svg, .tile .body img { width: 64%; height: 64%; filter: drop-shadow(0 2px 0 rgba(0,0,0,.18)); }
.tile.px .body img { image-rendering: pixelated; }
.arr { position: absolute; left: 50%; top: 2%; width: 34%; height: 34%; transform: translate(-50%, -30%); border-radius: 50%; background: #fff; color: var(--ink); display: grid; place-items: center; box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--c) 55%, #2b2140), 0 2px 0 rgba(0,0,0,.3); }
.arr svg { width: 70%; height: 70%; }
.na { display: block; text-align: center; opacity: .4; }
.mini { display: flex; flex-wrap: wrap; gap: 4px; }
.mini .tile { width: 52px; height: 52px; }
</style></head><body><main>
<h1>Pot Luck: art directions</h1>
<p>Four ways to draw ingredient tiles, shown on the in-game tile so readability is judged in context. <b>A</b>: Fluent Emoji as vectors (what the prototype uses now). <b>B</b>: the same emoji pixelated to a 20×20 grid (the emoji path from Pixel Picnic). <b>C</b>: Z-Image Turbo, generated locally with mflux (8 steps, 640×640, ~1 min each), background cut out. <b>D</b>: C pixelated to 28×28.</p>
<div class="card"><table><thead><tr><th></th><th>A · emoji</th><th>B · emoji → pixels</th><th>C · Z-Image</th><th>D · Z-Image → pixels</th></tr></thead><tbody>
${generated.map(row).join('\n')}
</tbody></table></div>
<p>Notes: the generated set is consistent and reads well at tile size. White subjects (egg, garlic) vanish on a white background, so prompts for those need a coloured backdrop (or a brown egg / purple garlic). Pixelating the emoji keeps their colour identity but loses the fine shading that separates similar shapes; the pixelated generated art keeps its black outlines, which helps on small phones.</p>
<h2>Every ingredient (A and B)</h2>
<div class="card"><div class="mini">${items.map((i) => tile(i.color, svg(i.icon))).join('')}</div><div class="mini" style="margin-top:10px">${items.map((i) => tile(i.color, img(`img/emojipx-${i.key}.png`), true)).join('')}</div></div>
</main></body></html>`;
writeFileSync('_review/art/index.html', html);
console.log('wrote _review/art/index.html', html.length, 'bytes');
