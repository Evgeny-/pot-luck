import type { LevelDef } from '../core/types';
import { emoji, h, button } from './dom';
import { audio } from '../audio/audio';

export const MECH_ICON: Record<string, string> = {
  bowl: 'bowl-with-spoon', salad: 'green-salad', stacks: 'pancakes', lids: 'locked', queue: 'fork-and-knife-with-plate',
  skewer: 'oden', pads: 'clockwise-vertical-arrows', knife: 'kitchen-knife', frozen: 'snowflake',
};

const CHAPTERS = ['First dishes', 'Full kitchen', 'Lids on', 'The skewer', 'Turning tables', 'Sharp knives', 'Cold storage', 'Chef\'s table'];

export interface MapHandlers {
  play(n: number): void;
  reset(): void;
  toggleDebug(): void;
}

/** Level select: chapters of ten, tiers by colour, stars, and (debug) the difficulty curve. */
export function showMap(root: HTMLElement, levels: LevelDef[], stars: Record<number, number>, unlocked: number, debug: boolean, on: MapHandlers): HTMLElement {
  const total = Object.values(stars).reduce((a, b) => a + b, 0);
  const inner = h('div', { class: 'map-inner' });
  inner.append(h('div', { class: 'map-head' },
    h('div', { class: 'logo', html: `${emoji('pot-of-food', 44)} Pot Luck` }),
    h('div', { class: 'star-total', html: `${emoji('star', 28)} ${total}` }),
  ));
  if (debug) inner.append(curve(levels));
  for (let c = 0; c * 10 < levels.length; c++) {
    inner.append(h('div', { class: 'chapter', text: `${c * 10 + 1}–${Math.min(levels.length, c * 10 + 10)} · ${CHAPTERS[c] ?? 'More recipes'}` }));
    const grid = h('div', { class: 'levels' });
    for (const lv of levels.slice(c * 10, c * 10 + 10)) {
      const locked = lv.n > unlocked && !debug;
      const node = h('button', { class: `node ${lv.tier ?? 'normal'}${locked ? ' locked' : ''}${lv.n === unlocked ? ' current' : ''}` });
      node.innerHTML = `${lv.n}`;
      const st = stars[lv.n] ?? 0;
      if (st) node.append(h('div', { class: 'mini-stars', html: [1, 2, 3].map((i) => emoji('star', 16, i <= st ? '' : 'off')).join('') }));
      const intro = lv.tier === 'intro' && lv.mechanics?.length ? MECH_ICON[lv.mechanics[lv.mechanics.length - 1]] : '';
      if (intro) node.append(h('div', { class: 'mech', html: emoji(intro) }));
      if (debug && lv.stats) node.append(h('div', { class: 'dbg', text: lv.stats.d.toFixed(2) }));
      node.addEventListener('click', () => {
        audio.unlock();
        audio.play('button');
        if (!locked) on.play(lv.n);
      });
      grid.append(node);
    }
    inner.append(grid);
  }
  inner.append(h('div', { class: 'map-foot' },
    button(debug ? 'Debug: on' : 'Debug: off', 'white small', on.toggleDebug),
    button('Reset progress', 'red small', on.reset),
  ));
  const map = h('div', { class: 'map' }, inner);
  root.append(map);
  const cur = map.querySelector('.node.current');
  if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 50);
  return map;
}

const TIER_COLOR: Record<string, string> = { intro: '#2f8ff0', relax: '#3fb834', normal: '#ffb000', hard: '#f0542e', superhard: '#7a3cf0' };

/** The campaign's difficulty as bars: the sawtooth at a glance. */
function curve(levels: LevelDef[]): HTMLElement {
  const W = 400;
  const H = 100;
  const n = levels.length;
  const bw = W / Math.max(1, n);
  const bars = levels.map((lv, i) => {
    const d = lv.stats?.d ?? 0;
    const hh = Math.max(2, d * (H - 8));
    return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(H - hh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${TIER_COLOR[lv.tier ?? 'normal']}"><title>${lv.n}: ${d.toFixed(2)}</title></rect>`;
  }).join('');
  return h('div', { class: 'curve', html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}</svg><div class="cap">Difficulty per level (blue: new mechanic, green: relax, yellow: normal, orange: hard, purple: super hard)</div>` });
}
