import { tracePath, geometryOf, type Geometry } from '../core/board';
import { DISHES, INGREDIENTS, WILD_INFO } from '../core/ingredients';
import type { Sim, SimEvent } from '../core/sim';
import { DX, DY, WILD, formOf, ingOf, type Dir, type LevelDef, type Token } from '../core/types';
import { ARROW_SVG, emoji, h } from '../ui/dom';
import { audio } from '../audio/audio';

/**
 * The kitchen as DOM: a wooden board with ingredient tiles, a pot card on every edge that feeds a
 * pot, and the bowl (or skewer). It only shows what the simulation decided: `sync` mirrors the
 * state, `play` animates a batch of events.
 */

export interface BoardHandlers {
  press(tile: number): void;
  release(): void;
  tap(tile: number): void;
}

const HUD_TOP = 74;
const HUD_BOTTOM = 104;
const GAP = 8;
const PAD = 8;

function tokenIcon(t: Token): string {
  return t === WILD ? WILD_INFO.icon : INGREDIENTS[ingOf(t)]?.icon ?? 'red-question-mark';
}
function tokenColor(t: Token): string {
  return t === WILD ? '#fff3a8' : INGREDIENTS[ingOf(t)]?.color ?? '#ccc';
}
function formBadge(t: Token): string {
  const f = t === WILD ? 0 : formOf(t);
  if (f & 1) return `<span class="form-badge">${emoji('kitchen-knife')}</span>`;
  if (f & 2) return `<span class="form-badge">${emoji('fire')}</span>`;
  return '';
}

export class BoardView {
  readonly root: HTMLElement;
  private level: LevelDef;
  private g: Geometry;
  private boardEl: HTMLElement;
  private potEls: HTMLElement[] = [];
  private bowlEl: HTMLElement;
  private tiles = new Map<number, HTMLElement>();
  private laneEls: HTMLElement[] = [];
  private cell = 52;
  private chip = 24;
  private spot = 40;
  /** Board origin (top-left of cell 0,0) in kitchen pixels. */
  private ox = 0;
  private oy = 0;
  private handlers: BoardHandlers;
  private pressed = -1;
  private sim: Sim;
  private lidsShown = new Set<number>();
  private resizeObs: ResizeObserver;

  constructor(parent: HTMLElement, sim: Sim, handlers: BoardHandlers) {
    this.sim = sim;
    this.level = sim.level;
    this.g = geometryOf(this.level);
    this.handlers = handlers;
    this.root = h('div', { class: 'kitchen' });
    this.boardEl = h('div', { class: 'board' });
    this.bowlEl = h('div', { class: 'bowl' });
    this.root.append(this.boardEl, this.bowlEl);
    this.level.pots.forEach((p) => {
      const el = h('div', { class: 'pot' + (p.side === 1 || p.side === 3 ? ' vertical' : '') });
      this.potEls.push(el);
      this.root.append(el);
    });
    parent.append(this.root);
    this.layout();
    this.resizeObs = new ResizeObserver(() => {
      this.layout();
      this.sync(this.sim, true);
    });
    this.resizeObs.observe(parent);
    this.root.addEventListener('pointerup', () => this.endPress(-1));
    this.root.addEventListener('pointercancel', () => this.endPress(-1));
  }

  dispose(): void {
    this.resizeObs.disconnect();
    this.root.remove();
  }

  // ---------------------------------------------------------------- layout

  private layout(): void {
    const W = this.root.parentElement!.clientWidth;
    const H = this.root.parentElement!.clientHeight;
    const { w, h: hh } = this.level;
    const sides = new Set(this.level.pots.map((p) => p.side));
    const nSide = (sides.has(1) ? 1 : 0) + (sides.has(3) ? 1 : 0);
    const nTB = (sides.has(0) ? 1 : 0) + (sides.has(2) ? 1 : 0);
    const midH = H - HUD_TOP - HUD_BOTTOM;
    // The pot cards and the bowl scale with the cell size (chip ≈ 0.44 cell).
    const byW = (W - 20 - 2 * PAD - nSide * (GAP + 12)) / (w + 0.64 * nSide);
    const byH = (midH - 2 * PAD - nTB * (GAP + 12) - 30) / (hh + 0.64 * nTB + 0.85);
    const cell = Math.max(30, Math.min(78, Math.floor(Math.min(byW, byH))));
    this.cell = cell;
    this.chip = Math.max(18, Math.min(32, Math.round(cell * 0.44)));
    this.spot = Math.max(34, Math.min(58, Math.round(cell * 0.8)));
    // Long recipes shrink their chips to fit: across the screen for top/bottom pots, along the
    // board for side pots. Dishes after the current one are drawn smaller.
    const weight = (p: LevelDef['pots'][0]) =>
      p.dishes.reduce((a, d, i) => a + d.items.length * (i === 0 ? 1 : 0.72), 0) + (p.dishes.length - 1) * 0.8 + 1.8;
    for (const p of this.level.pots) {
      const flat = p.side === 0 || p.side === 2;
      const room = flat ? W - 28 : hh * cell + 2 * PAD + 40;
      this.chip = Math.max(14, Math.min(this.chip, Math.floor(room / weight(p)) - 3));
    }
    const pot = this.chip * 1.45 + 12;
    const bw = w * cell + 2 * PAD;
    const bh = hh * cell + 2 * PAD;
    const blockW = bw + (sides.has(1) ? pot + GAP : 0) + (sides.has(3) ? pot + GAP : 0);
    const blockH = bh + (sides.has(0) ? pot + GAP : 0) + (sides.has(2) ? pot + GAP : 0) + this.spot + 26;
    const left = Math.round((W - blockW) / 2 + (sides.has(3) ? pot + GAP : 0));
    const top = Math.round(HUD_TOP + Math.max(0, (midH - blockH) / 2) + (sides.has(0) ? pot + GAP : 0));
    this.root.style.setProperty('--cell', `${cell}px`);
    this.root.style.setProperty('--chip', `${this.chip}px`);
    this.root.style.setProperty('--spot', `${this.spot}px`);
    Object.assign(this.boardEl.style, { left: `${left}px`, top: `${top}px`, width: `${bw}px`, height: `${bh}px` });
    this.ox = left + PAD;
    this.oy = top + PAD;
    // Walls on edges without a pot; floor marks, pads and bars.
    this.boardEl.querySelectorAll('.edge-wall,.cell-dot,.pad,.bar,.bar-icon').forEach((e) => e.remove());
    for (const side of [0, 1, 2, 3] as Dir[]) {
      const row = this.g.edge[side];
      for (let k = 0; k < row.length; k++) {
        if (row[k] >= 0) continue;
        const el = h('div', { class: 'edge-wall' });
        const s = side === 0 || side === 2;
        const x = s ? PAD + k * cell + 3 : side === 1 ? bw - 6 : 0;
        const y = s ? (side === 0 ? 0 : bh - 6) : PAD + k * cell + 3;
        Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${s ? cell - 6 : 6}px`, height: `${s ? 6 : cell - 6}px` });
        this.boardEl.append(el);
      }
    }
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const d = h('div', { class: 'cell-dot' });
      Object.assign(d.style, { left: `${PAD + (x + 0.5) * cell}px`, top: `${PAD + (y + 0.5) * cell}px` });
      this.boardEl.append(d);
    }
    for (const p of this.level.pads ?? []) {
      const el = h('div', { class: 'pad', html: `<span class="pad-arrow" style="transform:rotate(${p.dir * 90}deg)">${ARROW_SVG}</span>` });
      Object.assign(el.style, { left: `${PAD + p.x * cell}px`, top: `${PAD + p.y * cell}px` });
      this.boardEl.append(el);
    }
    for (const b of this.level.bars ?? []) {
      const el = h('div', { class: 'bar' + (b.kind === 'heat' ? ' heat' : '') });
      const icon = h('div', { class: 'bar-icon', html: emoji(b.kind === 'knife' ? 'kitchen-knife' : 'fire') });
      if (b.axis === 'h') {
        Object.assign(el.style, { left: `${PAD + b.from * cell - 4}px`, top: `${PAD + b.at * cell - 4}px`, width: `${(b.to - b.from) * cell + 8}px`, height: '8px' });
        Object.assign(icon.style, { left: `${PAD + b.from * cell - 6}px`, top: `${PAD + b.at * cell}px` });
      } else {
        Object.assign(el.style, { left: `${PAD + b.at * cell - 4}px`, top: `${PAD + b.from * cell - 4}px`, width: '8px', height: `${(b.to - b.from) * cell + 8}px` });
        Object.assign(icon.style, { left: `${PAD + b.at * cell}px`, top: `${PAD + b.from * cell - 6}px` });
      }
      this.boardEl.append(el, icon);
    }
    // Pot cards: centred on their stretch of edge.
    this.level.pots.forEach((p, i) => {
      const el = this.potEls[i];
      const mid = (p.from + p.to) / 2;
      let x: number;
      let y: number;
      let tf: string;
      if (p.side === 0) [x, y, tf] = [this.ox + mid * cell, top - GAP, 'translate(-50%, -100%)'];
      else if (p.side === 2) [x, y, tf] = [this.ox + mid * cell, top + bh + GAP + 6, 'translate(-50%, 0)'];
      else if (p.side === 3) [x, y, tf] = [left - GAP, this.oy + mid * cell, 'translate(-100%, -50%)'];
      else [x, y, tf] = [left + bw + GAP, this.oy + mid * cell, 'translate(0, -50%)'];
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, transform: tf });
    });
    const bowlTop = top + bh + GAP + 6 + (sides.has(2) ? pot + GAP : 0);
    Object.assign(this.bowlEl.style, { left: `${left + bw / 2}px`, top: `${bowlTop}px`, transform: 'translate(-50%, 0)' });
  }

  /** Centre of a cell in kitchen pixels. */
  private at(cell: number): [number, number] {
    const x = cell % this.level.w;
    const y = (cell - x) / this.level.w;
    return [this.ox + (x + 0.5) * this.cell, this.oy + (y + 0.5) * this.cell];
  }

  private centerOf(el: Element): [number, number] {
    const r = el.getBoundingClientRect();
    const k = this.root.getBoundingClientRect();
    return [r.left + r.width / 2 - k.left, r.top + r.height / 2 - k.top];
  }

  // ---------------------------------------------------------------- state

  sync(sim: Sim, full = false): void {
    this.sim = sim;
    if (full) {
      for (const el of this.tiles.values()) el.remove();
      this.tiles.clear();
    }
    const tiles = this.level.tiles;
    for (const t of tiles) {
      const show = sim.present[t.id] && sim.isTop(t.id);
      const el = this.tiles.get(t.id);
      if (!show) {
        if (el) {
          el.remove();
          this.tiles.delete(t.id);
        }
        continue;
      }
      if (!el) this.tiles.set(t.id, this.makeTile(t.id, !full));
      this.updateTile(t.id);
    }
    this.renderPots(sim);
    this.renderBowl(sim);
  }

  private makeTile(id: number, popIn: boolean): HTMLElement {
    const t = this.level.tiles[id];
    const tok = this.sim.tileToken(id);
    const color = tokenColor(tok);
    const el = h('div', { class: 'tile', style: `--c:${color}` });
    const icon = t.ing * 4 === WILD ? WILD_INFO.icon : INGREDIENTS[t.ing].icon;
    el.innerHTML =
      `<div class="tile-body"><div class="tile-icon">${emoji(icon)}</div>` +
      `<div class="tile-arrow" style="--rot:${t.dir * 90}deg">${ARROW_SVG}</div>${formBadge(tok)}</div>`;
    const below = this.level.tiles.filter((o) => o.x === t.x && o.y === t.y && (o.z ?? 0) < (t.z ?? 0)).sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0];
    if (below) {
      const ut = this.sim.tileToken(below.id);
      el.classList.add('has-under');
      el.style.setProperty('--uc', tokenColor(ut));
      el.append(h('div', { class: 'under', html: `<div class="u-icon">${emoji(INGREDIENTS[below.ing]?.icon ?? WILD_INFO.icon)}</div><div class="u-arrow" style="--urot:${below.dir * 90}deg">${ARROW_SVG}</div>` }));
    }
    const [x, y] = this.at(t.y * this.level.w + t.x);
    el.style.transform = `translate(${x - this.cell / 2}px, ${y - this.cell / 2}px)`;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.unlock();
      this.pressed = id;
      el.classList.add('pressed');
      this.handlers.press(id);
    });
    el.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      this.endPress(id);
    });
    el.addEventListener('pointerleave', () => {
      if (this.pressed === id) this.endPress(-1);
    });
    this.root.append(el);
    if (popIn) el.animate([{ scale: '0.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    return el;
  }

  private updateTile(id: number): void {
    const el = this.tiles.get(id)!;
    const frozen = this.sim.isFrozen(id);
    el.classList.toggle('frozen', frozen);
    let ice = el.querySelector('.ice');
    if (frozen && !ice) {
      ice = h('div', { class: 'ice', html: emoji('snowflake') });
      el.append(ice);
    } else if (!frozen && ice) ice.remove();
  }

  private endPress(id: number): void {
    const was = this.pressed;
    this.pressed = -1;
    for (const el of this.tiles.values()) el.classList.remove('pressed');
    this.handlers.release();
    if (was >= 0 && was === id) this.handlers.tap(id);
  }

  private renderPots(sim: Sim): void {
    const want: number[] = [];
    this.level.pots.forEach((p, i) => {
      const el = this.potEls[i];
      const done = sim.potDone(i);
      const cur = sim.potDish[i];
      sim.wants(i, want);
      const parts: string[] = [];
      p.dishes.forEach((d, di) => {
        if (di < cur) return;
        const info = DISHES[d.kind] ?? DISHES.soup;
        if (di === cur) parts.push(`<span class="dish">${emoji(info.icon)}</span>`);
        else parts.push(`<span class="dish-sep" title="${info.en}">${emoji(info.icon)}</span>`);
        const got = di === cur ? sim.potGot[i] : 0;
        const open = sim.potOpen(i);
        d.items.forEach((t, k) => {
          const isDone = (got >> k) & 1;
          let cls = 'chip';
          if (isDone) cls += ' done';
          else if (di === cur && open && want.includes(t) && (d.order !== 'strict' ? true : sim.acceptIndex(i, t) === k)) cls += d.order === 'strict' ? ' next' : ' free';
          else if (di > cur) cls += ' later';
          parts.push(`<span class="${cls}" style="--c:${tokenColor(t)}"><span class="c-icon">${emoji(tokenIcon(t))}</span>${formBadge(t)}</span>`);
        });
      });
      if (done) {
        const last = p.dishes[p.dishes.length - 1];
        parts.push(`<span class="dish">${emoji(DISHES[last.kind]?.icon ?? 'pot-of-food')}</span><span class="served">${emoji('check-mark-button', 22)}</span>`);
      }
      // Rebuild only when something changed (keeps the CSS animations calm).
      let html = `<span class="strip">${parts.join('')}</span>`;
      if (done) html = parts.join('');
      if (p.lid !== undefined && !sim.potOpen(i)) {
        const other = this.level.pots[p.lid];
        const icon = DISHES[other.dishes[other.dishes.length - 1].kind]?.icon ?? 'pot-of-food';
        html += `<div class="lid">${emoji('locked', 18)}after ${emoji(icon, 18)}</div>`;
        this.lidsShown.add(i);
      }
      el.classList.toggle('closed', p.lid !== undefined && !sim.potOpen(i));
      if (el.dataset.html !== html) {
        el.innerHTML = html;
        el.dataset.html = html;
      }
      el.classList.toggle('done', done);
    });
  }

  private renderBowl(sim: Sim): void {
    const cap = sim.bowlCap;
    const lifo = this.level.rules.bowlOrder === 'lifo';
    this.bowlEl.classList.toggle('hidden', cap === 0);
    this.bowlEl.classList.toggle('skewer', lifo);
    this.bowlEl.classList.toggle('full', cap > 0 && sim.bowlLen >= cap);
    const spots: string[] = [];
    for (let k = 0; k < cap; k++) {
      const t = sim.bowlTok[k];
      const top = lifo && k === sim.bowlLen - 1;
      spots.push(`<span class="spot${t >= 0 ? ' taken' : ''}${top ? ' top' : ''}" data-k="${k}">${t >= 0 ? `<span class="s-icon">${emoji(tokenIcon(t))}</span>${formBadge(t)}` : ''}</span>`);
    }
    const label = lifo ? `<span class="label">${emoji('oden', 26)}</span><span class="stick"></span>` : `<span class="label">${emoji('bowl-with-spoon', 26)}</span>`;
    const html = label + spots.join('') + (lifo ? '<span class="tip"></span>' : '');
    if (this.bowlEl.dataset.html !== html) {
      this.bowlEl.innerHTML = html;
      this.bowlEl.dataset.html = html;
    }
  }

  // ---------------------------------------------------------------- feedback

  /** Dots along the lane of a pressed tile, coloured by what would happen. */
  showLane(id: number, kind: 'ok' | 'bowl' | 'blocked' | 'none', blockerCell = -1): void {
    this.hideLane();
    const t = this.level.tiles[id];
    const path = tracePath(this.g, t.x, t.y, t.dir);
    const cls = kind === 'ok' ? '' : kind === 'bowl' ? ' bowl' : ' blocked';
    let n = 0;
    for (const c of path.cells) {
      const [x, y] = this.at(c);
      const d = h('div', { class: 'lane-dot' + cls });
      Object.assign(d.style, { left: `${x}px`, top: `${y}px`, animationDelay: `${n++ * 25}ms` });
      this.root.append(d);
      this.laneEls.push(d);
      if (c === blockerCell) break;
    }
    if (kind === 'blocked' && blockerCell >= 0) {
      const b = this.sim.topAt(blockerCell);
      const el = this.tiles.get(b);
      if (el) {
        el.classList.remove('blocker');
        void el.offsetWidth;
        el.classList.add('blocker');
      }
    }
    if (path.pot >= 0 && kind !== 'blocked') {
      const pe = this.potEls[path.pot];
      pe.classList.add(kind === 'ok' ? 'glow-ok' : 'glow-bowl');
    }
  }

  hideLane(): void {
    for (const d of this.laneEls) d.remove();
    this.laneEls = [];
    for (const p of this.potEls) p.classList.remove('glow-ok', 'glow-bowl');
  }

  shake(id: number): void {
    const el = this.tiles.get(id);
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  flashBowl(): void {
    this.bowlEl.classList.remove('flash');
    void this.bowlEl.offsetWidth;
    this.bowlEl.classList.add('flash');
  }

  hint(id: number | null): void {
    for (const el of this.tiles.values()) el.classList.remove('hint');
    if (id !== null) this.tiles.get(id)?.classList.add('hint');
  }

  // ---------------------------------------------------------------- animation

  /** Animates a batch of events; resolves when the board has caught up. */
  play(events: SimEvent[], sim: Sim): Promise<void> {
    this.sim = sim;
    let t = 0;
    let end = 0;
    const slideEnd = new Map<number, number>();
    for (const e of events) {
      if (e.t === 'slide') {
        const dur = this.slide(e);
        t = dur;
        end = Math.max(end, dur + 120);
        if (e.into === 'bowl') slideEnd.set(e.slot, dur);
      } else if (e.t === 'bowlOut') {
        const start = Math.max(slideEnd.get(e.slot) ?? 0, t) + 60;
        const dur = 320;
        setTimeout(() => this.fly(e.slot, e.pot, e.token), start);
        t = start + dur;
        end = Math.max(end, t + 60);
      } else if (e.t === 'dish') {
        setTimeout(() => this.cheer(e.pot, e.last), t + 60);
      } else if (e.t === 'lid') {
        setTimeout(() => {
          const lid = this.potEls[e.pot].querySelector('.lid');
          lid?.classList.add('open');
          audio.play('unlock');
        }, t + 300);
        end = Math.max(end, t + 900);
      } else if (e.t === 'thaw') {
        const el = this.tiles.get(e.tile);
        el?.animate([{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 400 });
        setTimeout(() => audio.play('thaw'), 80);
      } else if (e.t === 'won') {
        setTimeout(() => this.confetti(), t + 200);
      }
    }
    // Tiles that just became the top of their stack, frozen state, and the slid tile's removal.
    for (const tl of this.level.tiles) {
      if (!sim.present[tl.id] || !sim.isTop(tl.id)) continue;
      if (!this.tiles.has(tl.id)) this.tiles.set(tl.id, this.makeTile(tl.id, true));
      this.updateTile(tl.id);
    }
    return new Promise((res) => setTimeout(() => {
      this.renderPots(this.sim);
      this.renderBowl(this.sim);
      res();
    }, end));
  }

  private slide(e: Extract<SimEvent, { t: 'slide' }>): number {
    const el = this.tiles.get(e.tile);
    this.tiles.delete(e.tile);
    if (!el) return 0;
    const t = this.level.tiles[e.tile];
    // Waypoints: the start, every cell where the lane turns, and one cell beyond the edge.
    const pts: [number, number][] = [this.at(t.y * this.level.w + t.x)];
    let dir: Dir = t.dir;
    let prev = t.y * this.level.w + t.x;
    for (const c of e.cells) {
      const pad = this.g.pad[c];
      if (pad >= 0 && pad !== dir) {
        pts.push(this.at(c));
        dir = pad as Dir;
      }
      prev = c;
    }
    const [lx, ly] = this.at(prev);
    pts.push([lx + DX[dir] * this.cell * 1.1, ly + DY[dir] * this.cell * 1.1]);
    let target: [number, number];
    if (e.into === 'pot') {
      const dishEl = this.potEls[e.pot].querySelector('.dish') ?? this.potEls[e.pot];
      target = this.centerOf(dishEl);
    } else {
      const spot = this.bowlEl.querySelector(`.spot[data-k="${e.slot}"]`) ?? this.bowlEl;
      target = this.centerOf(spot);
    }
    const half = this.cell / 2;
    const frames: Keyframe[] = [];
    let dist = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      frames.push({ transform: `translate(${pts[i][0] - half}px, ${pts[i][1] - half}px) scale(1)`, offset: 0 });
    }
    const flyDist = Math.hypot(target[0] - pts[pts.length - 1][0], target[1] - pts[pts.length - 1][1]);
    const total = dist + flyDist * 0.8;
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      frames[i].offset = total ? acc / total : 0;
    }
    frames.push({ transform: `translate(${target[0] - half}px, ${target[1] - half}px) scale(${e.into === 'pot' ? 0.35 : 0.55})`, opacity: e.into === 'pot' ? 0.2 : 1, offset: 1 });
    const dur = Math.max(260, Math.min(900, 140 + total * 1.05));
    el.classList.add('flyer');
    el.style.zIndex = '20';
    audio.play('whoosh', { volume: 0.5 });
    el.animate(frames, { duration: dur, easing: 'cubic-bezier(.45,.05,.55,1)', fill: 'forwards' }).finished.then(() => {
      el.remove();
      if (e.into === 'pot') {
        this.bump(e.pot);
        audio.play('deliver', { pitch: 1 + Math.random() * 0.15 });
      } else audio.play('place');
    });
    return dur;
  }

  private fly(slot: number, pot: number, token: Token): void {
    const spot = this.bowlEl.querySelector(`.spot[data-k="${slot}"]`) ?? this.bowlEl;
    const from = this.centerOf(spot);
    const dishEl = this.potEls[pot].querySelector('.dish') ?? this.potEls[pot];
    const to = this.centerOf(dishEl);
    const icon = spot.querySelector('.s-icon');
    icon?.remove();
    const size = this.spot * 0.8;
    const el = h('div', { class: 'flyer', html: emoji(tokenIcon(token)), style: `width:${size}px;height:${size}px` });
    this.root.append(el);
    el.animate([
      { transform: `translate(${from[0] - size / 2}px, ${from[1] - size / 2}px) scale(1)` },
      { transform: `translate(${(from[0] + to[0]) / 2 - size / 2}px, ${Math.min(from[1], to[1]) - size / 2 - 40}px) scale(1.1)`, offset: 0.5 },
      { transform: `translate(${to[0] - size / 2}px, ${to[1] - size / 2}px) scale(0.5)`, opacity: 0.3 },
    ], { duration: 320, easing: 'ease-in-out', fill: 'forwards' }).finished.then(() => {
      el.remove();
      this.bump(pot);
      audio.play('deliver', { pitch: 1.1 });
    });
  }

  private bump(pot: number): void {
    const el = this.potEls[pot];
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  private cheer(pot: number, last: boolean): void {
    const el = this.potEls[pot];
    el.classList.remove('cheer');
    void el.offsetWidth;
    el.classList.add('cheer');
    audio.play(last ? 'boxDone' : 'star');
    const [x, y] = this.centerOf(el);
    this.burst(x, y, 14);
  }

  private burst(x: number, y: number, n: number): void {
    const colors = ['#ffc933', '#ff5a5f', '#5ccf4a', '#45b3ff', '#8b5cf6', '#ff9b3d'];
    for (let i = 0; i < n; i++) {
      const c = h('div', { class: 'confetti', style: `background:${colors[i % colors.length]};left:${x}px;top:${y}px` });
      this.root.append(c);
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 70;
      c.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r - 30}px) rotate(${Math.random() * 540}deg)`, opacity: 0 },
      ], { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => c.remove());
    }
  }

  confetti(): void {
    const r = this.boardEl.getBoundingClientRect();
    const k = this.root.getBoundingClientRect();
    for (let i = 0; i < 5; i++) setTimeout(() => this.burst(r.left - k.left + Math.random() * r.width, r.top - k.top + Math.random() * r.height, 16), i * 120);
  }
}
