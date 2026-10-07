import { CUISINES, LEVELS_PER_CUISINE, cuisineById, type CuisineId } from '../core/cuisines';
import { DISHES, INGREDIENTS } from '../core/ingredients';
import type { LevelDef } from '../core/types';
import { audio } from '../audio/audio';
import { CLOCHE_SVG } from '../view/BoardView';
import { button, emoji, h } from './dom';
import { heatHtml } from './Hud';
import { dishHtml, ingredientHtml } from './iconStyle';
import { KNIFE_SVG } from './knife';
import { FLAGS, GARLAND, SCENES, garland } from './scenery';
import { applyTheme } from './themes';
import './map.css';

export const MECH_ICON: Record<string, string> = {
  bowl: 'bowl-with-spoon', salad: 'green-salad', bowl2: 'bowl-with-spoon', stacks: 'pancakes', links: 'yarn', lids: 'locked',
  cloche: 'bellhop-bell', jar: 'jar', timer: 'timer-clock', queue: 'fork-and-knife-with-plate', pads: 'clockwise-vertical-arrows',
  knife: 'kitchen-knife', frozen: 'ice',
};

export interface MapData {
  levels: LevelDef[];
  stars: Record<number, number>;
  unlocked: number;
  debug: boolean;
  sound: boolean;
  /** Tips to spend in the market. */
  tips?: number;
}

export interface MapHandlers {
  play(n: number): void;
  settings(): void;
  toggleSound(): void;
  market?(): void;
}

const BANNER = 190;
const PAD_BOTTOM = 190;
const PAD_TOP = 170;

/** A small deterministic hash, so the scenery stays put between visits. */
const hash = (a: number, b = 0) => {
  let x = (a * 374761393 + b * 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/**
 * The level map: a food tour from cuisine to cuisine, level 1 at the bottom. Every region is a
 * little neighbourhood: its restaurant and a landmark drawn beside the road, a garland strung
 * across, props from its kitchen and a sign with the flag and the stars collected there.
 */
export function showMap(root: HTMLElement, d: MapData, on: MapHandlers): HTMLElement {
  const total = Object.values(d.stars).reduce((a, b) => a + b, 0);
  const map = h('div', { class: 'map' });
  const scroll = h('div', { class: 'map-scroll' });
  const inner = h('div', { class: 'map-inner' });
  scroll.append(inner);
  map.append(scroll);
  applyTheme(map, cuisineById(d.levels[Math.min(d.unlocked, d.levels.length) - 1]?.cuisine).id);

  const shown = d.debug ? d.levels.length : Math.min(d.levels.length, Math.max(d.unlocked + 5, 8));
  let builtFor = '';
  const build = () => {
    const W = map.clientWidth || window.innerWidth;
    const key = String(W);
    if (key === builtFor) return;
    // Keep the view anchored on the same spot when the window changes size.
    const anchor = builtFor ? (scroll.scrollTop + scroll.clientHeight / 2) / Math.max(1, inner.offsetHeight) : -1;
    builtFor = key;
    inner.textContent = '';
    const nodeY = layout(inner, W, d, shown, on);
    requestAnimationFrame(() => {
      scroll.scrollTop = anchor >= 0
        ? anchor * inner.offsetHeight - scroll.clientHeight / 2
        : nodeY(Math.min(d.unlocked, shown)) - scroll.clientHeight * 0.55;
    });
  };

  // Top bar and the bottom dock.
  const sound = h('button', { class: 'btn round paper', html: emoji(d.sound ? 'speaker-high-volume' : 'muted-speaker', 26), attrs: { 'aria-label': 'Sound' } });
  sound.addEventListener('click', () => on.toggleSound());
  const gear = h('button', { class: 'btn round paper', html: emoji('gear', 26), attrs: { 'aria-label': 'Settings' } });
  gear.addEventListener('click', () => {
    audio.play('button');
    on.settings();
  });
  const right = h('div', { class: 'right' }, h('div', { class: 'pill', html: `${emoji('star')}${total}` }));
  if (on.market) {
    const tips = h('button', { class: 'pill tips', html: `${emoji('coin')}${d.tips ?? 0}`, attrs: { 'aria-label': 'Tips: open the market' } });
    tips.addEventListener('click', () => {
      audio.play('button');
      on.market!();
    });
    right.append(tips);
  }
  right.append(sound, gear);
  map.append(h('div', { class: 'map-top' }, h('div', { class: 'logo', html: `${emoji('pot-of-food')}<span>Pot Luck</span>` }), right));
  if (d.debug) map.append(h('div', { class: 'curve-wrap' }, curve(d.levels)));
  const next = Math.min(d.unlocked, d.levels.length);
  const dock = h('div', { class: 'play-dock' });
  if (on.market) {
    const shop = h('button', { class: 'market-btn', html: `${emoji('basket')}<span>Market</span>`, attrs: { 'aria-label': 'Market' } });
    shop.addEventListener('click', () => {
      audio.play('button');
      on.market!();
    });
    dock.append(shop);
  }
  dock.append(button(`${emoji('play-button', 26)}Play · ${next}`, 'green', () => on.play(next)));
  map.append(dock);
  root.append(map);
  build();
  let timer = 0;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = window.setTimeout(build, 120);
  });
  ro.observe(map);
  // Stop watching once the map is gone.
  const mo = new MutationObserver(() => {
    if (!map.isConnected) {
      ro.disconnect();
      mo.disconnect();
    }
  });
  mo.observe(root, { childList: true });
  return map;
}

/** Builds the map content for a width; returns the y of each level's plate. */
function layout(inner: HTMLElement, W: number, d: MapData, shown: number, on: MapHandlers): (n: number) => number {
  const regions = Math.ceil(shown / LEVELS_PER_CUISINE);
  const STEP = W >= 900 ? 112 : 104;
  const height = PAD_BOTTOM + shown * STEP + regions * BANNER + PAD_TOP;
  inner.style.width = `${W}px`;
  inner.style.height = `${height}px`;
  const region = (n: number) => Math.floor((n - 1) / LEVELS_PER_CUISINE);
  const nodeY = (n: number) => height - (PAD_BOTTOM + (n - 1) * STEP + (region(n) + 1) * BANNER - BANNER * 0.55);
  const amp = Math.min(160, W * 0.26);
  const nodeX = (n: number) => W / 2 + Math.sin(n * 0.85) * amp + Math.sin(n * 0.31) * amp * 0.25;
  /** Where the road is at height y (between plates), for keeping scenery off it. */
  const roadX = (y: number) => {
    let best = W / 2;
    let dist = Infinity;
    for (let n = 1; n <= shown; n++) {
      const dd = Math.abs(nodeY(n) - y);
      if (dd < dist) [dist, best] = [dd, nodeX(n)];
    }
    return best;
  };

  for (let r = 0; r < regions; r++) {
    const c = CUISINES[r % CUISINES.length];
    const id = c.id as CuisineId;
    const first = r * LEVELS_PER_CUISINE + 1;
    const last = Math.min(shown, (r + 1) * LEVELS_PER_CUISINE);
    const top = r === regions - 1 ? 0 : nodeY(last) - STEP / 2 - BANNER * 0.45;
    const bottom = r === 0 ? height : nodeY(first) + STEP / 2 + BANNER * 0.55;
    const bg = h('div', { class: `region r-${id}` });
    applyTheme(bg, id);
    Object.assign(bg.style, { top: `${top}px`, height: `${bottom - top}px` });
    inner.append(bg);

    // The sign at the entrance: flag, name, place and the stars collected here.
    let got = 0;
    for (let n = first; n < first + LEVELS_PER_CUISINE; n++) got += d.stars[n] ?? 0;
    const signY = nodeY(first) + STEP * 0.5 + 58;
    const sign = h('div', {
      class: 'sign',
      html: `<span class="flag">${FLAGS[id]}</span><span class="sign-text"><b>${c.name.en}</b><small>${c.place.en}</small></span>` +
        `<span class="sign-stars">${emoji('star', 20)}${got}<i>/${LEVELS_PER_CUISINE * 3}</i></span>`,
    });
    applyTheme(sign, id);
    sign.style.top = `${signY}px`;
    inner.append(sign);
    if (r > 0) {
      // A little plane flies in from the previous country.
      const side = r % 2 ? 1 : -1;
      const plane = h('div', { class: 'plane', html: `<svg viewBox="0 0 120 60"><path d="M4 54 Q50 52 96 12" fill="none" stroke="rgba(91,58,36,.45)" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/></svg>${emoji('airplane')}` });
      Object.assign(plane.style, { left: `${W / 2 + side * Math.min(W * 0.3, 230) - 60}px`, top: `${signY - 64}px`, transform: side < 0 ? 'scaleX(-1)' : '' });
      inner.append(plane);
    }

    // Garlands across the region.
    for (const [k, at] of [[0, 3.6], [1, 7.6]] as const) {
      const n = first + at;
      if (n > last + 0.5) continue;
      const y = (nodeY(Math.floor(n)) + nodeY(Math.ceil(n))) / 2 - 30;
      const g = garland(GARLAND[id], W, r * 2 + k);
      const el = h('div', { class: 'garland', html: g.svg });
      el.style.top = `${y}px`;
      inner.append(el);
    }

    // Two illustrations: the restaurant near the entrance, a landmark further up, each on the
    // side the road has swung away from.
    let firstSide: boolean | null = null;
    for (const k of [0, 1] as const) {
      const lo = first + (k === 0 ? 0 : 4);
      const hi = Math.min(last, first + (k === 0 ? 3 : 8));
      if (lo > last) continue;
      let pick = lo;
      let room = -1;
      let leftSide = true;
      for (let n = lo; n <= hi; n++) {
        const x = nodeX(n);
        for (const left of [true, false]) {
          if (firstSide !== null && left === firstSide) continue;
          const space: number = left ? x - 64 : W - x - 64;
          if (space > room) [room, pick, leftSide] = [space, n, left];
        }
      }
      firstSide = leftSide;
      const a = SCENES[id][k]();
      const w = Math.max(130, Math.min(a.w * (W >= 900 ? 1.35 : 1.05), room + 30));
      const hh = (w * a.h) / a.w;
      const roadAt = roadX(nodeY(pick));
      let x = leftSide ? Math.min(roadAt - 60 - w, W * 0.5 - amp * 0.55 - w) : Math.max(roadAt + 60, W * 0.5 + amp * 0.55);
      x = Math.max(-w * 0.28, Math.min(W - w * 0.72, x));
      const el = h('div', { class: 'scene', html: a.svg });
      Object.assign(el.style, { left: `${x}px`, top: `${nodeY(pick) - hh * 0.62}px`, width: `${w}px`, height: `${hh}px` });
      inner.append(el);
    }

    // Props from the region's kitchen, in the gaps beside the road.
    for (let i = 0; i < 6; i++) {
      const n = first + Math.floor((i + 0.5) * (LEVELS_PER_CUISINE / 6));
      if (n > last) break;
      const y = nodeY(n) + (hash(n, i) - 0.5) * 50;
      const road = roadX(y);
      const leftRoom = road - 70;
      const rightRoom = W - road - 70;
      const left = leftRoom > rightRoom;
      const size = 30 + Math.round(hash(i, n) * 18);
      const room = left ? leftRoom : rightRoom;
      if (room < size + 8) continue;
      const off = 20 + hash(n, i + 7) * Math.max(0, Math.min(room - size - 20, 130));
      const x = left ? road - 70 - off - size : road + 70 + off;
      const icon = c.deco[i % c.deco.length];
      const ingredient = INGREDIENTS.find((ing) => ing.icon === icon);
      const el = h('div', { class: 'deco', html: ingredient ? ingredientHtml(ingredient.id) : emoji(icon) });
      Object.assign(el.style, { left: `${x}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, transform: `rotate(${Math.round((hash(n, i + 3) - 0.5) * 36)}deg)` });
      inner.append(el);
    }

    // Weather: cherry petals in Japan, drifting clouds elsewhere.
    if (id === 'japan') {
      const box = h('div', { class: 'petals' });
      Object.assign(box.style, { top: `${top}px`, height: `${bottom - top}px` });
      for (let i = 0; i < 12; i++) {
        const p = h('i', {});
        p.style.left = `${Math.round(hash(i, 11) * 100)}%`;
        p.style.animationDelay = `${(-hash(i, 5) * 14).toFixed(2)}s`;
        p.style.animationDuration = `${(10 + hash(i, 9) * 8).toFixed(1)}s`;
        box.append(p);
      }
      inner.append(box);
    } else {
      for (let i = 0; i < 2; i++) {
        const cl = h('div', { class: 'cloud', html: emoji('cloud') });
        const s = 60 + hash(r, i) * 50;
        Object.assign(cl.style, { top: `${top + 40 + hash(i, r + 3) * (bottom - top - 120)}px`, width: `${s}px`, height: `${s}px`, animationDuration: `${80 + hash(r, i + 4) * 60}s`, animationDelay: `${-hash(i, r) * 120}s` });
        inner.append(cl);
      }
    }
  }

  // The road: a cream runner with stitched edges; the part already travelled is golden.
  const pts: [number, number][] = [];
  for (let n = 1; n <= shown; n++) pts.push([nodeX(n), nodeY(n)]);
  const cur = Math.min(d.unlocked, shown);
  const done = smoothPath(pts.slice(0, cur));
  const ahead = smoothPath(pts.slice(cur - 1));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('route');
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(height));
  const all = smoothPath(pts);
  svg.innerHTML =
    `<path d="${all}" fill="none" stroke="rgba(120,80,40,.22)" stroke-width="34" stroke-linecap="round" transform="translate(0 4)"/>` +
    `<path d="${all}" fill="none" stroke="#e7cfa6" stroke-width="32" stroke-linecap="round"/>` +
    `<path d="${all}" fill="none" stroke="#fffaf1" stroke-width="26" stroke-linecap="round"/>` +
    (ahead ? `<path d="${ahead}" fill="none" stroke="#d2b88e" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"/>` : '') +
    (done ? `<path d="${done}" fill="none" stroke="#f5a623" stroke-width="5" stroke-dasharray="12 9" stroke-linecap="round"/>` : '');
  inner.append(svg);

  // Plates.
  for (let n = 1; n <= shown; n++) {
    const lv = d.levels[n - 1];
    const stars = d.stars[n] ?? 0;
    const current = n === d.unlocked;
    const locked = n > d.unlocked && !d.debug;
    const kind = lv.pots[0]?.dishes[0]?.kind ?? 'soup';
    const dish = DISHES[kind] ?? DISHES.soup;
    const node = h('button', {
      class: 'node' + (current ? ' current' : '') + (locked ? ' locked' : '') + (lv.tier === 'superhard' ? ' feast' : ''),
      attrs: { 'aria-label': `Level ${n}${current ? ', next to cook' : ''}`, title: dish.en },
    });
    Object.assign(node.style, { left: `${nodeX(n)}px`, top: `${nodeY(n)}px` });
    if (current) {
      node.append(
        h('span', { class: 'halo' }),
        h('span', { class: 'dish', html: dishHtml(kind) }),
        h('span', { class: 'steam-puffs', html: '<i></i><i></i><i></i>' }),
        h('span', { class: 'lifted', html: CLOCHE_SVG }),
        h('span', { class: 'num', text: String(n) }),
      );
    } else if (stars || (d.debug && !locked)) {
      node.append(h('span', { class: 'dish', html: dishHtml(kind) }), h('span', { class: 'num', text: String(n) }));
    } else node.append(h('span', { class: 'num', text: String(n) }));
    if (stars) node.append(h('span', { class: 'nstars', html: [1, 2, 3].map((k) => emoji('star', 19, k <= stars ? '' : 'off')).join('') }));
    if (!locked && (lv.tier === 'hard' || lv.tier === 'superhard')) node.append(h('span', { html: heatHtml(lv.tier, 24) }).firstElementChild as HTMLElement);
    const newMech = lv.tier === 'intro' && n > 3 ? lv.mechanics?.[0] : undefined;
    if (newMech && !locked) node.append(h('span', { class: 'newmech', html: newMech === 'knife' ? KNIFE_SVG : emoji(MECH_ICON[newMech] ?? 'sparkles') }));
    if (d.debug && lv.stats) node.append(h('span', { class: 'dbg', text: `d ${lv.stats.d.toFixed(2)}` }));
    node.addEventListener('click', () => {
      audio.unlock();
      if (locked) {
        audio.play('blocked');
        node.animate([{ translate: '-4px 0' }, { translate: '4px 0' }, { translate: '0 0' }], { duration: 220 });
        return;
      }
      audio.play('map');
      on.play(n);
    });
    inner.append(node);
    if (current) {
      const chef = h('div', { class: 'chef', html: emoji('cook') });
      const side = nodeX(n) > W / 2 ? -1 : 1;
      Object.assign(chef.style, { left: `${nodeX(n) + side * 70}px`, top: `${nodeY(n)}px` });
      inner.append(chef);
    }
  }
  if (shown < d.levels.length || !d.debug) {
    const fog = h('div', { class: 'fog' });
    Object.assign(fog.style, { top: '0px', height: `${PAD_TOP + 60}px` });
    const txt = h('div', { class: 'fog-text', html: `${emoji('world-map', 26)}${shown < d.levels.length ? 'More kitchens ahead…' : 'More recipes coming soon…'}` });
    txt.style.top = `${PAD_TOP * 0.5}px`;
    inner.append(fog, txt);
  }
  return nodeY;
}

function smoothPath(p: [number, number][]): string {
  if (p.length < 2) return '';
  let s = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[Math.min(p.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    s += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return s;
}

const TIER_COLOR: Record<string, string> = { intro: '#2aa79b', relax: '#4cb35d', normal: '#ffc23d', hard: '#ee5a3c', superhard: '#8a2a1a' };

/** The campaign's difficulty as bars: the sawtooth at a glance (debug). */
function curve(levels: LevelDef[]): HTMLElement {
  const W = 400;
  const H = 100;
  const bw = W / Math.max(1, levels.length);
  const bars = levels.map((lv, i) => {
    const v = lv.stats?.d ?? 0;
    const hh = Math.max(2, v * (H - 8));
    return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(H - hh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hh.toFixed(1)}" rx="1.5" fill="${TIER_COLOR[lv.tier ?? 'normal']}"><title>${lv.n}: ${v.toFixed(2)}</title></rect>`;
  }).join('');
  return h('div', { class: 'curve', html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${bars}</svg><div class="cap">Difficulty per level · teal: new mechanic · yellow: normal · red: hard · dark: super hard</div>` });
}
