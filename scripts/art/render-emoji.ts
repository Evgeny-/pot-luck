/** Renders the Fluent emoji of every ingredient to PNG (resvg) for the art review. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { DISHES, INGREDIENTS } from '../../src/core/ingredients';

const set = JSON.parse(readFileSync('node_modules/@iconify-json/fluent-emoji-flat/icons.json', 'utf8'));
mkdirSync('.cache/art/emoji', { recursive: true });
for (const [key, icon] of [...INGREDIENTS.map((i) => [i.key, i.icon]), ['pot', DISHES.soup.icon], ['salad', DISHES.salad.icon]]) {
  const ic = set.icons[icon];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ic.width ?? set.width} ${ic.height ?? set.height}">${ic.body}</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } }).render().asPng();
  writeFileSync(`.cache/art/emoji/${key}.png`, png);
}
console.log('rendered', INGREDIENTS.length + 2, 'emoji');
