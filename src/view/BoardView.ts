import { tracePath, geometryOf, type Geometry } from '../core/board';
import { DISHES, INGREDIENTS, WILD_INFO } from '../core/ingredients';
import type { Sim, SimEvent } from '../core/sim';
import { DX, DY, WILD, formOf, ingOf, type Dir, type LevelDef, type Token } from '../core/types';
import { ARROW_SVG, emoji, h } from '../ui/dom';
import { dishHtml, ingredientHtml, tokenHtml } from '../ui/iconStyle';
import { frameFor } from '../ui/viewport';
import { audio } from '../audio/audio';
import { knifeBarSvg } from '../ui/knife';
import { CLOCHE_SVG } from '../ui/cloche';
import { lanePoints, pathMetrics, recipientCurve, roundedPath, routeOutsideBoard, type Point, type Rect } from './flight';

export { CLOCHE_SVG } from '../ui/cloche';

/**
 * The kitchen as DOM: a wooden board with ingredient tiles, an order ticket with a plate on every
 * edge that feeds a pot, and the bowl (or the jar). It only shows what the simulation decided:
 * `sync` mirrors the state, `play` animates a batch of events.
 */

export interface BoardHandlers {
  press(tile: number): void;
  release(): void;
  tap(tile: number): void;
  bowlInfo?(uses: number): void;
}

const GAP = 9;
const PAD = 8;
const USAGE_WIDTH = 84;
const USAGE_BESIDE = USAGE_WIDTH + 12;

/** A ceramic vessel with a visible oval opening, curved sides and a small foot. */
function bowlShell(width: number, height: number, openingHeight: number): string {
  const cx = width / 2;
  const cy = openingHeight / 2 + 8;
  const rx = cx - 4;
  const ry = Math.min(openingHeight / 2 + 2, height * 0.24);
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs>` +
    '<linearGradient id="bowl-body" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf5"/><stop offset="1" stop-color="#e6dac1"/></linearGradient>' +
    '<radialGradient id="bowl-inside" cx="50%" cy="30%" r="75%"><stop stop-color="#fff8e6"/><stop offset="1" stop-color="#cbbd9d"/></radialGradient></defs>' +
    `<ellipse cx="${cx}" cy="${height - 3}" rx="${width * 0.22}" ry="3" fill="#cab591" opacity=".65"/>` +
    `<path d="M4 ${cy} Q${width * 0.07} ${height - 9} ${width * 0.32} ${height - 6} H${width * 0.68} Q${width * 0.93} ${height - 9} ${width - 4} ${cy} Z" fill="url(#bowl-body)" stroke="#c8b798" stroke-width="1.5"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fffdf6" stroke="#678faf" stroke-width="3"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${Math.max(1, rx - 4)}" ry="${Math.max(1, ry - 4)}" fill="url(#bowl-inside)"/>` +
    `<path d="M${width * 0.19} ${cy + ry + 2} Q${cx} ${height - 8} ${width * 0.81} ${cy + ry + 2}" fill="none" stroke="#fffdf4" stroke-width="2" opacity=".75"/></svg>`;
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
  /** Per pot: the plate (kept across updates so its animations survive), recipe chips and lid badge. */
  private potParts: { plate: HTMLElement; strip: HTMLElement; extra: HTMLElement; icon: string }[] = [];
  private bowlEl: HTMLElement;
  private bowlUsage: HTMLButtonElement;
  /** Tied pairs: a tray under both tiles and two cords stitched across the seam. */
  private tieUnder: SVGSVGElement;
  private tieOver: SVGSVGElement;
  private tiles = new Map<number, HTMLElement>();
  private laneEls: HTMLElement[] = [];
  private cell = 52;
  private chip = 24;
  private spot = 40;
  private usageBeside = false;
  private recipeGaps: number[] = [];
  /** Intended ticket positions along the board edge, independent of a recipe's width. */
  private ticketOrigins: Point[] = [];
  /** Board origin (top-left of cell 0,0) in kitchen pixels. */
  private ox = 0;
  private oy = 0;
  private handlers: BoardHandlers;
  private pressed = -1;
  private sim: Sim;
  /** What has visibly arrived, kept separate from the simulation's already-completed move. */
  private shown: Sim;
  private playQueue: Promise<void> = Promise.resolve();
  private epoch = 0;
  private disposed = false;
  private animations = new Set<Animation>();
  private timers = new Map<number, (() => void) | undefined>();
  private resizeObs: ResizeObserver;
  /** Chips that just got ticked (they animate once). */
  private fresh = new Set<string>();

  constructor(parent: HTMLElement, sim: Sim, handlers: BoardHandlers) {
    this.sim = sim;
    this.shown = sim.clone();
    this.level = sim.level;
    this.g = geometryOf(this.level);
    this.handlers = handlers;
    this.root = h('div', { class: 'kitchen' });
    this.boardEl = h('div', { class: 'board' });
    this.bowlEl = h('div', { class: 'bowl' });
    this.bowlUsage = h('button', { class: 'storage-usage', attrs: { type: 'button' } });
    this.bowlUsage.addEventListener('click', (event) => {
      event.stopPropagation();
      audio.unlock();
      audio.play('button');
      this.handlers.bowlInfo?.(this.shown.parks);
    });
    const svg = (cls: string) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      el.setAttribute('class', `ties ${cls}`);
      return el;
    };
    this.tieUnder = svg('under');
    this.tieOver = svg('over');
    this.root.append(this.boardEl, this.bowlEl, this.tieUnder, this.tieOver);
    this.level.pots.forEach((p) => {
      const el = h('div', { class: `pot side-${p.side}` + (p.side === 1 || p.side === 3 ? ' vertical' : '') });
      const parts = { plate: h('span', { class: 'plate' }), strip: h('span', { class: 'strip' }), extra: h('span', { style: 'display:contents' }), icon: '' };
      el.append(parts.plate, parts.strip, parts.extra);
      this.potEls.push(el);
      this.potParts.push(parts);
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
    this.disposed = true;
    this.cancelPlayback();
    this.resizeObs.disconnect();
    this.root.remove();
  }

  // ---------------------------------------------------------------- layout

  private bowlHeight(spot: number): number {
    const cap = this.sim.bowlCap;
    if (!cap) return 0;
    return this.bowlDimensions(spot, false).height + (this.usageBeside ? 0 : 50);
  }

  private bowlDimensions(spot: number, side: boolean): { width: number; height: number; slot: number; cols: number } {
    const cap = this.sim.bowlCap;
    if (this.level.rules.bowlOrder === 'lifo') return { width: spot + 28, height: cap * spot + 24, slot: spot, cols: 1 };
    const cols = side ? Math.min(2, cap) : cap;
    const slot = side && cap > 1 ? Math.round(spot * 0.52) : spot;
    const rows = Math.ceil(cap / Math.max(1, cols));
    return { width: cols * slot + Math.max(0, cols - 1) * 8 + 28, height: rows * slot + Math.max(0, rows - 1) * 8 + 32, slot, cols };
  }

  private ticketSize(pot: number): { width: number; height: number } {
    const p = this.level.pots[pot];
    const flat = p.side === 0 || p.side === 2;
    const count = Math.max(...p.dishes.map((dish) => dish.items.length));
    const recipe = count * this.chip + Math.max(0, count - 1) * (this.recipeGaps[pot] ?? 7);
    const plate = this.chip * 1.55;
    return flat ? { width: plate + recipe + 24, height: plate + 16 } : { width: plate + 16, height: plate + recipe + 24 };
  }

  private layout(): void {
    const W = this.root.parentElement!.clientWidth;
    const H = this.root.parentElement!.clientHeight;
    const fr = frameFor(W, H);
    const { w, h: hh } = this.level;
    const sides = new Set(this.level.pots.map((p) => p.side));
    const nSide = (sides.has(1) ? 1 : 0) + (sides.has(3) ? 1 : 0);
    const nTB = (sides.has(0) ? 1 : 0) + (sides.has(2) ? 1 : 0);
    const areaW = W - fr.left - fr.right;
    const lidSpace = this.level.pots.some((pot) => pot.side === 0 && pot.lid !== undefined) ? 18 : 0;
    const actions = this.root.closest('#app')?.querySelector('.hud-actions');
    const bounds = this.root.getBoundingClientRect();
    const actionsBounds = actions?.getBoundingClientRect();
    const actionTop = actionsBounds && bounds.height > 0 ? (actionsBounds.top - bounds.top) * H / bounds.height : H - fr.bottom;
    const bottomSpace = !fr.wide && actionsBounds?.height ? H - actionTop + 10 : fr.bottom;
    const midH = H - fr.top - bottomSpace - lidSpace;
    const jar = this.level.rules.bowlOrder === 'lifo';
    const cap = this.sim.bowlCap;
    this.usageBeside = false;
    // Tickets and the bowl scale with the cell size; tall screens keep recipe chips larger.
    // The bowl sits under the board on tall screens and beside it on wide ones.
    const side = fr.wide && cap > 0;
    const bowlRows = cap && !side ? (jar ? cap * 0.8 + 0.9 : 1.45) : 0;
    const bowlCols = side ? 1.15 : 0;
    const knifeLeft = this.level.bars?.some((bar) => bar.kind === 'knife' && bar.axis === 'h' && bar.from === 0) ? 32 : 0;
    const chipRatio = fr.wide ? 0.44 : 0.58;
    const horizontalTickets = nTB * 1.55 * chipRatio;
    const byW = (areaW - 20 - 2 * PAD - nSide * (GAP + 14) - (side ? 2 * GAP + 30 : 0) - knifeLeft) / (w + 1.55 * chipRatio * nSide + bowlCols);
    const byH = (midH - 2 * PAD - nTB * (GAP + 17) - 24) / (hh + horizontalTickets + bowlRows);
    let cell = Math.max(30, Math.min(fr.wide ? 118 : 96, Math.floor(Math.min(byW, byH))));
    this.cell = cell;
    this.chip = Math.max(fr.wide ? 18 : 26, Math.min(fr.wide ? 46 : 52, Math.round(cell * chipRatio)));
    this.spot = Math.max(32, Math.min(84, Math.round(cell * 0.8)));
    // Size for the longest recipe, but show one current recipe. Later ingredients appear when
    // their dish starts, keeping the required food readable without a second row.
    for (const p of this.level.pots) {
      const flat = p.side === 0 || p.side === 2;
      const longest = Math.max(...p.dishes.map((dish) => dish.items.length));
      const coefficient = 1.55 + longest;
      const room = flat ? areaW - 8 : midH - (cap && !side ? this.bowlHeight(this.spot) + 16 : 0) - 24;
      const fixed = 24 + Math.max(0, longest - 1) * 7;
      this.chip = Math.max(fr.wide ? 14 : 26, Math.min(this.chip, Math.floor((room - fixed) / coefficient)));
    }
    this.recipeGaps = this.level.pots.map((pot) => {
      if (pot.side === 1 || pot.side === 3) return 7;
      const count = Math.max(...pot.dishes.map((dish) => dish.items.length));
      return count > 1 ? Math.max(1, Math.min(7, Math.floor((areaW - 8 - this.chip * 1.55 - 24 - count * this.chip) / (count - 1)))) : 7;
    });
    let ticketSizes = this.level.pots.map((_, i) => this.ticketSize(i));
    const sideSize = (direction: Dir, dimension: 'width' | 'height') => Math.max(0, ...this.level.pots.map((pot, i) => pot.side === direction ? ticketSizes[i][dimension] : 0));
    const leftTicket = sideSize(3, 'width');
    const rightTicket = sideSize(1, 'width');
    const topTicket = sideSize(0, 'height');
    const bottomTicket = sideSize(2, 'height');
    // Minimum recipe sizes can exceed the proportional ticket estimate on a narrow screen.
    // Fit the board to the actual ticket widths while preserving readable recipe icons.
    const storageWidth = side ? Math.max(124, this.bowlDimensions(this.spot, true).width) : 0;
    const maxCellW = Math.floor((areaW - 8 - 2 * PAD - leftTicket - rightTicket - nSide * GAP - (side ? storageWidth + 2 * GAP : 0) - knifeLeft) / w);
    cell = Math.min(cell, Math.max(24, maxCellW));
    this.cell = cell;
    this.spot = Math.max(32, Math.min(84, Math.round(cell * 0.8)));
    const topBand = topTicket ? topTicket + GAP : 0;
    const bottomBand = bottomTicket ? bottomTicket + GAP + 4 : 0;
    const storageGap = GAP + 10 + (jar ? 12 : 0);
    const minimumSideHeight = Math.max(0, ...this.level.pots.map((pot) => {
      if (pot.side === 0 || pot.side === 2) return 0;
      const count = Math.max(...pot.dishes.map((dish) => dish.items.length));
      return this.chip * (count + 1.55) + Math.max(0, count - 1) + 24;
    }));
    const coreRoom = () => midH - topBand - bottomBand - (cap && !side ? this.bowlHeight(this.spot) + storageGap : 0);
    const storage = this.bowlDimensions(this.spot, false);
    // A crowded phone can keep the counter beside the vessel without reducing food sizes.
    if (cap && !side && coreRoom() < Math.max(hh * cell + 2 * PAD, minimumSideHeight) && storage.width + USAGE_BESIDE <= areaW - 8) this.usageBeside = true;
    for (let pass = 0; pass < 2; pass++) {
      const room = coreRoom();
      this.recipeGaps = this.recipeGaps.map((gap, i) => {
        const pot = this.level.pots[i];
        if (pot.side === 0 || pot.side === 2) return gap;
        const count = Math.max(...pot.dishes.map((dish) => dish.items.length));
        return count > 1 ? Math.max(1, Math.min(7, Math.floor((room - this.chip * (count + 1.55) - 24) / (count - 1)))) : 7;
      });
      cell = Math.min(cell, Math.max(24, Math.floor((room - 2 * PAD) / hh)));
      this.cell = cell;
      this.spot = Math.max(32, Math.min(84, Math.round(cell * 0.8)));
    }
    ticketSizes = this.level.pots.map((_, i) => this.ticketSize(i));
    const bw = w * cell + 2 * PAD;
    const bh = hh * cell + 2 * PAD;
    const bowlSize = this.bowlDimensions(this.spot, side);
    const bowlW = side ? Math.max(124, bowlSize.width) : 0;
    const leftOfBoard = (leftTicket ? leftTicket + GAP : 0) + (side ? bowlW + 2 * GAP : 0) + knifeLeft;
    const blockW = bw + leftOfBoard + (rightTicket ? rightTicket + GAP : 0);
    const coreH = Math.max(bh, sideSize(1, 'height'), sideSize(3, 'height'));
    const overshoot = (coreH - bh) / 2;
    const blockH = coreH + topBand + bottomBand + (cap && !side ? this.bowlHeight(this.spot) + storageGap : 0);
    const left = Math.round(fr.left + (areaW - blockW) / 2 + leftOfBoard);
    const coreTop = fr.top + lidSpace + Math.max(0, (midH - blockH) / 2) + topBand;
    const top = Math.round(coreTop + overshoot);
    this.root.style.setProperty('--cell', `${cell}px`);
    this.root.style.setProperty('--chip', `${this.chip}px`);
    this.root.style.setProperty('--spot', `${this.spot}px`);
    Object.assign(this.boardEl.style, { left: `${left}px`, top: `${top}px`, width: `${bw}px`, height: `${bh}px` });
    this.ox = left + PAD;
    this.oy = top + PAD;
    // Floor marks, pads and bars. Empty recipe edges need no extra rails.
    this.boardEl.querySelectorAll('.cell-dot,.pad,.bar,.bar-icon').forEach((e) => e.remove());
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
      const span = (b.to - b.from) * cell;
      if (b.kind === 'knife') {
        const thickness = Math.max(26, Math.min(46, cell * 0.38));
        const el = h('div', { class: `bar knife ${b.axis}`, html: knifeBarSvg(span, b.axis), attrs: { title: 'Knife: ingredients crossing the blade arrive chopped.', 'aria-label': 'Knife: crossing chops ingredients' } });
        if (b.axis === 'h') Object.assign(el.style, { left: `${PAD + b.from * cell - 32}px`, top: `${PAD + b.at * cell - thickness / 2}px`, width: `${span + 32}px`, height: `${thickness}px` });
        else Object.assign(el.style, { left: `${PAD + b.at * cell - thickness / 2}px`, top: `${PAD + b.from * cell - 32}px`, width: `${thickness}px`, height: `${span + 32}px` });
        this.boardEl.append(el);
        continue;
      }
      const el = h('div', { class: 'bar' + (b.kind === 'heat' ? ' heat' : '') });
      const icon = h('div', { class: 'bar-icon', html: emoji('fire') });
      if (b.axis === 'h') {
        Object.assign(el.style, { left: `${PAD + b.from * cell - 4}px`, top: `${PAD + b.at * cell - 4}px`, width: `${(b.to - b.from) * cell + 8}px`, height: '8px' });
        Object.assign(icon.style, { left: `${PAD + b.from * cell - 6}px`, top: `${PAD + b.at * cell}px` });
      } else {
        Object.assign(el.style, { left: `${PAD + b.at * cell - 4}px`, top: `${PAD + b.from * cell - 4}px`, width: '8px', height: `${(b.to - b.from) * cell + 8}px` });
        Object.assign(icon.style, { left: `${PAD + b.at * cell}px`, top: `${PAD + b.from * cell - 6}px` });
      }
      this.boardEl.append(el, icon);
    }
    // Tickets: centred on their stretch of edge.
    this.level.pots.forEach((p, i) => {
      const el = this.potEls[i];
      const mid = (p.from + p.to) / 2;
      let x: number;
      let y: number;
      let tf: string;
      if (p.side === 0) [x, y, tf] = [this.ox + mid * cell, coreTop - GAP, 'translate(-50%, -100%)'];
      else if (p.side === 2) [x, y, tf] = [this.ox + mid * cell, coreTop + coreH + GAP + 4, 'translate(-50%, 0)'];
      else if (p.side === 3) [x, y, tf] = [left - GAP - knifeLeft, this.oy + mid * cell, 'translate(-100%, -50%)'];
      else [x, y, tf] = [left + bw + GAP, this.oy + mid * cell, 'translate(0, -50%)'];
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, transform: tf });
      this.ticketOrigins[i] = [x, y];
    });
    this.bowlEl.classList.toggle('side', side);
    this.bowlEl.classList.toggle('usage-beside', this.usageBeside);
    this.bowlEl.style.setProperty('--bowl-slot', `${bowlSize.slot}px`);
    Object.assign(this.bowlEl.style, { width: jar ? '' : `${bowlSize.width}px`, height: jar ? '' : `${bowlSize.height}px` });
    if (side) {
      const x = left - (leftTicket ? leftTicket + GAP : 0) - GAP - bowlW / 2 - knifeLeft;
      Object.assign(this.bowlEl.style, { left: `${x}px`, top: `${top + bh / 2}px`, transform: 'translate(-50%, -50%)' });
    } else {
      const bowlTop = coreTop + coreH + bottomBand + storageGap;
      const groupWidth = this.usageBeside ? bowlSize.width + USAGE_BESIDE : Math.max(bowlSize.width, USAGE_WIDTH);
      const center = Math.max(fr.left + groupWidth / 2 + 4, Math.min(W - fr.right - groupWidth / 2 - 4, left + bw / 2));
      Object.assign(this.bowlEl.style, { left: `${center - (this.usageBeside ? USAGE_BESIDE / 2 : 0)}px`, top: `${bowlTop}px`, transform: 'translate(-50%, 0)' });
    }
    for (const el of [this.tieUnder, this.tieOver]) {
      el.setAttribute('width', String(W));
      el.setAttribute('height', String(H));
    }
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
    // DOM rectangles are viewport pixels; our waypoints and transforms use kitchen pixels.
    const sx = this.root.clientWidth / k.width || 1;
    const sy = this.root.clientHeight / k.height || 1;
    return [(r.left + r.width / 2 - k.left) * sx, (r.top + r.height / 2 - k.top) * sy];
  }

  private boardRect(): Rect {
    return { left: this.ox - PAD, top: this.oy - PAD, right: this.ox + this.level.w * this.cell + PAD, bottom: this.oy + this.level.h * this.cell + PAD };
  }

  private plateOf(pot: number): Element {
    return this.potParts[pot].plate;
  }

  /** Food lands on the exact recipe ingredient being filled, including after a dish change. */
  private targetOf(pot: number, item: number): Element {
    return this.potParts[pot].strip.querySelector(`.chip[data-dish="${this.shown.potDish[pot]}"][data-item="${item}"] .c-icon`) ?? this.plateOf(pot);
  }

  private widthOf(el: Element): number {
    const r = el.getBoundingClientRect();
    const root = this.root.getBoundingClientRect();
    return r.width * (this.root.clientWidth / root.width || 1);
  }

  // ---------------------------------------------------------------- state

  sync(sim: Sim, full = false): void {
    this.sim = sim;
    if (full) this.cancelPlayback();
    this.shown = sim.clone();
    if (full) {
      for (const el of this.tiles.values()) el.remove();
      this.tiles.clear();
    }
    for (const t of this.level.tiles) {
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
    this.renderTwine();
    this.renderPots(sim);
    this.renderBowl(sim);
  }

  private makeTile(id: number, popIn: boolean): HTMLElement {
    const t = this.level.tiles[id];
    const tok = this.shown.tileToken(id);
    const el = h('div', { class: 'tile', style: `--c:${tokenColor(tok)}` });
    const pic = t.ing * 4 === WILD ? emoji(WILD_INFO.icon) : ingredientHtml(t.ing);
    el.innerHTML =
      `<div class="tile-body"><div class="tile-icon">${pic}</div>` +
      `<div class="tile-arrow" style="--rot:${t.dir * 90}deg">${ARROW_SVG}</div></div>`;
    const below = this.level.tiles.filter((o) => o.x === t.x && o.y === t.y && (o.z ?? 0) < (t.z ?? 0)).sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0];
    if (below) {
      const ut = this.shown.tileToken(below.id);
      el.classList.add('has-under');
      el.style.setProperty('--uc', tokenColor(ut));
      const uPic = below.hidden ? emoji('red-question-mark') : ingredientHtml(below.ing);
      el.append(h('div', { class: 'under', html: `<div class="u-icon">${uPic}</div><div class="u-arrow" style="--urot:${below.dir * 90}deg">${ARROW_SVG}</div>` }));
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
    if (popIn) this.animate(el, [{ scale: '0.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    return el;
  }

  private updateTile(id: number): void {
    const el = this.tiles.get(id)!;
    const frozen = this.shown.isFrozen(id);
    el.classList.toggle('frozen', frozen);
    let ice = el.querySelector('.ice');
    if (frozen && !ice) {
      ice = h('div', { class: 'ice', html: emoji('ice') });
      el.append(ice);
    } else if (!frozen && ice) ice.remove();
    const covered = this.shown.isCovered(id);
    el.classList.toggle('covered', covered);
    let cl = el.querySelector('.cloche');
    if (covered && !cl) {
      cl = h('div', { class: 'cloche', html: CLOCHE_SVG });
      el.querySelector('.tile-body')!.append(cl);
    } else if (!covered && cl) cl.remove();
    const left = this.shown.timerLeft(id);
    el.classList.toggle('timed', left > 0);
    let tm = el.querySelector<HTMLElement>('.timer');
    if (left > 0) {
      if (!tm) {
        tm = h('div', { class: 'timer' });
        el.querySelector('.tile-body')!.append(tm);
      }
      tm.textContent = String(left);
    } else tm?.remove();
  }

  /**
   * Tied tiles share a kraft-paper tray (one unit, at a glance) and are stitched together by two
   * short cords across the seam, coloured from one ingredient into the other.
   */
  private renderTwine(): void {
    const seen = new Set<number>();
    let under = '';
    let over = '';
    const c = this.cell;
    for (const t of this.level.tiles) {
      if (t.link === undefined || seen.has(t.link)) continue;
      seen.add(t.link);
      const o = this.level.tiles.find((u) => u !== t && u.link === t.link);
      if (!o || !this.shown.present[t.id] || !this.shown.present[o.id]) continue;
      const [ax, ay] = this.at(t.y * this.level.w + t.x);
      const [bx, by] = this.at(o.y * this.level.w + o.x);
      const out = c * 0.035;
      const x0 = Math.min(ax, bx) - c / 2 - out;
      const y0 = Math.min(ay, by) - c / 2 - out;
      const w = Math.abs(ax - bx) + c + 2 * out;
      const hh = Math.abs(ay - by) + c + 2 * out;
      under += `<rect class="tray" x="${x0}" y="${y0}" width="${w}" height="${hh}" rx="${c * 0.32}"/>` +
        `<rect class="tray-stitch" x="${x0 + c * 0.035}" y="${y0 + c * 0.035}" width="${w - c * 0.07}" height="${hh - c * 0.07}" rx="${c * 0.28}"/>`;
      // Two loops of twine across the seam, clear of the arrow badge in the middle of the edge.
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const ux = Math.sign(bx - ax);
      const uy = Math.sign(by - ay);
      const depth = c * 0.19;
      const cw = Math.max(2.5, c * 0.06);
      for (const k of [-1, 1]) {
        const off = k * c * 0.24;
        const bulge = k * c * 0.05;
        const px = mx - ux * depth + uy * off;
        const py = my - uy * depth + ux * off;
        const qx = mx + ux * depth + uy * off;
        const qy = my + uy * depth + ux * off;
        const cx = mx + uy * (off + bulge);
        const cy = my + ux * (off + bulge);
        const d = `M${px},${py} Q${cx},${cy} ${qx},${qy}`;
        over += `<path class="cord-edge" d="${d}" stroke-width="${cw + 2.5}"/><path class="cord" d="${d}" stroke-width="${cw}"/>` +
          `<path class="cord-twist" d="${d}" stroke-width="${cw}" stroke-dasharray="${cw * 0.45} ${cw * 0.75}"/>` +
          `<circle class="cord-end" cx="${px}" cy="${py}" r="${cw * 0.75}"/><circle class="cord-end" cx="${qx}" cy="${qy}" r="${cw * 0.75}"/>`;
      }
    }
    this.tieUnder.innerHTML = under;
    this.tieOver.innerHTML = over;
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
      const wasDone = el.classList.contains('done');
      const anchor = this.potParts[i].icon ? this.centerOf(this.potParts[i].plate) : null;
      const done = sim.potDone(i);
      const cur = Math.min(sim.potDish[i], p.dishes.length - 1);
      sim.wants(i, want);
      const open = sim.potOpen(i);
      const dish = p.dishes[cur];
      const info = DISHES[dish.kind] ?? DISHES.soup;
      const parts: string[] = [];
      p.dishes.forEach((d, di) => {
        if (di !== cur) return;
        const recipe: string[] = [];
        const got = di === cur ? sim.potGot[i] : 0;
        d.items.forEach((t, k) => {
          const isDone = done || (di === cur && (got >> k) & 1);
          let cls = 'chip';
          if (isDone) cls += ' done' + (this.fresh.has(`${i}:${di}:${k}`) ? ' fresh' : '');
          else if (di === cur && open && want.includes(t) && (d.order !== 'strict' ? true : sim.acceptIndex(i, t) === k)) cls += d.order === 'strict' ? ' next' : ' free';
          recipe.push(`<span class="${cls}" data-dish="${di}" data-item="${k}" style="--c:${tokenColor(t)}"><span class="c-icon">${tokenHtml(t)}</span>${formBadge(t)}</span>`);
        });
        parts.push(`<span class="recipe current" data-dish="${di}" style="gap:${this.recipeGaps[i] ?? 7}px">${recipe.join('')}</span>`);
      });
      const pp = this.potParts[i];
      const picture = dishHtml(dish.kind) + (done ? '<span class="served-mark" aria-label="Dish ready"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' : '');
      if (pp.icon !== picture) {
        pp.plate.innerHTML = picture;
        pp.plate.title = info.en;
        pp.icon = picture;
      }
      const strip = parts.join('');
      if (pp.strip.dataset.html !== strip) {
        pp.strip.innerHTML = strip;
        pp.strip.dataset.html = strip;
      }
      let extra = '';
      if (p.lid !== undefined && !open) {
        const other = this.level.pots[p.lid];
        const icon = DISHES[other.dishes[other.dishes.length - 1].kind]?.icon ?? 'pot-of-food';
        extra += `<span class="lid">${emoji('locked', 18)}after ${emoji(icon, 18)}</span>`;
      }
      if (pp.extra.dataset.html !== extra) {
        pp.extra.innerHTML = extra;
        pp.extra.dataset.html = extra;
      }
      el.classList.toggle('done', done);
      el.classList.toggle('closed', p.lid !== undefined && !open);
      // Keep recipients still while cooking. A completed dish keeps the full ticket's centre.
      const origin = this.ticketOrigins[i];
      if (origin && (done || wasDone)) {
        el.style.left = `${origin[0]}px`;
        el.style.top = `${origin[1]}px`;
      } else if (anchor && !done && !wasDone) {
        const position = this.centerOf(pp.plate);
        el.style.left = `${parseFloat(el.style.left) + anchor[0] - position[0]}px`;
        el.style.top = `${parseFloat(el.style.top) + anchor[1] - position[1]}px`;
      }
      if (p.side === 0 || p.side === 2) {
        const frame = frameFor(this.root.clientWidth, this.root.clientHeight);
        const half = this.widthOf(el) / 2;
        const min = frame.left + half + 4;
        const max = this.root.clientWidth - frame.right - half - 4;
        const center = this.centerOf(el)[0];
        const x = min <= max ? Math.max(min, Math.min(max, center)) : (this.root.clientWidth + frame.left - frame.right) / 2;
        el.style.left = `${parseFloat(el.style.left) + x - center}px`;
      }
    });
    this.fresh.clear();
  }

  private renderBowl(sim: Sim): void {
    const cap = sim.bowlCap;
    const jar = this.level.rules.bowlOrder === 'lifo';
    this.bowlEl.classList.toggle('hidden', cap === 0);
    this.bowlEl.classList.toggle('jar', jar);
    this.bowlEl.classList.toggle('full', cap > 0 && sim.bowlLen >= cap);
    const spots: string[] = [];
    for (let k = 0; k < cap; k++) {
      const t = sim.bowlTok[k];
      const top = jar && k === sim.bowlLen - 1;
      spots.push(`<span class="spot${t >= 0 ? ' taken' : ''}${top ? ' top' : ''}" data-k="${k}">${t >= 0 ? `<span class="s-icon">${tokenHtml(t)}</span>${formBadge(t)}` : ''}</span>`);
    }
    const side = this.bowlEl.classList.contains('side');
    const size = this.bowlDimensions(this.spot, side);
    const rows = Math.ceil(cap / Math.max(1, size.cols));
    const opening = rows * size.slot + Math.max(0, rows - 1) * 8;
    const html = jar ? spots.join('') : `<span class="bowl-shell">${bowlShell(size.width, size.height, opening)}</span><span class="bowl-spots" style="grid-template-columns:repeat(${Math.max(1, size.cols)},${size.slot}px)">${spots.join('')}</span>`;
    if (this.bowlEl.dataset.html !== html) {
      this.bowlEl.innerHTML = html;
      this.bowlEl.dataset.html = html;
    }
    const word = jar ? 'Jar' : 'Bowl';
    const par = this.level.stats?.par ?? 0;
    this.bowlUsage.innerHTML = `<strong>${sim.parks}</strong><span>${sim.parks === 1 ? 'use' : 'uses'}</span>`;
    this.bowlUsage.setAttribute('aria-label', `${word} used ${sim.parks} ${sim.parks === 1 ? 'time' : 'times'}. Three stars allow up to ${par} ${par === 1 ? 'use' : 'uses'}. Show star scoring.`);
    this.bowlUsage.title = 'How storage use affects stars';
    this.bowlEl.append(this.bowlUsage);
  }

  // ---------------------------------------------------------------- feedback

  /** Dots along the lane of a pressed tile (and its tied partner), coloured by what would happen. */
  showLane(id: number, kind: 'ok' | 'bowl' | 'blocked' | 'none', blockerCell = -1, partner = -1): void {
    this.hideLane();
    this.drawLane(id, kind, blockerCell);
    if (partner >= 0) this.drawLane(partner, kind === 'blocked' ? 'blocked' : 'ok', -1);
  }

  private drawLane(id: number, kind: 'ok' | 'bowl' | 'blocked' | 'none', blockerCell: number): void {
    const t = this.level.tiles[id];
    const path = tracePath(this.g, t.x, t.y, t.dir);
    const cls = kind === 'ok' ? '' : kind === 'bowl' ? ' bowl' : ' blocked';
    let n = 0;
    for (const c of path.cells) {
      const [x, y] = this.at(c);
      const d = h('div', { class: 'lane-dot' + cls });
      Object.assign(d.style, { left: `${x}px`, top: `${y}px`, animationDelay: `${n++ * 22}ms` });
      this.root.append(d);
      this.laneEls.push(d);
      if (c === blockerCell) break;
    }
    if (kind === 'blocked' && blockerCell >= 0) {
      const el = this.tiles.get(this.sim.topAt(blockerCell));
      if (el) {
        el.classList.remove('blocker');
        void el.offsetWidth;
        el.classList.add('blocker');
      }
    }
    if (path.pot >= 0 && kind !== 'blocked') this.potEls[path.pot].classList.add(kind === 'ok' ? 'glow-ok' : 'glow-bowl');
  }

  hideLane(): void {
    for (const d of this.laneEls) d.remove();
    this.laneEls = [];
    for (const p of this.potEls) p.classList.remove('glow-ok', 'glow-bowl');
  }

  /** The tile bumps toward where it wanted to go, then settles back. */
  nudge(id: number): void {
    const el = this.tiles.get(id);
    if (!el) return;
    const t = this.level.tiles[id];
    const body = el.querySelector('.tile-body') as HTMLElement;
    const dx = DX[t.dir] * this.cell * 0.12;
    const dy = DY[t.dir] * this.cell * 0.12;
    this.animate(body, [
      { translate: '0 0' }, { translate: `${dx}px ${dy}px`, offset: 0.3 }, { translate: `${-dx * 0.3}px ${-dy * 0.3}px`, offset: 0.65 }, { translate: '0 0' },
    ], { duration: 280, easing: 'ease-out' });
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
    const after = sim.clone();
    const epoch = this.epoch;
    // Rapid taps and debug autoplay can finish several simulation moves before a flight lands.
    // Each batch retains its own state and waits for the preceding visual deliveries.
    const done = this.playQueue.then(() => this.playEvents(events, after, epoch));
    this.playQueue = done.catch(() => {});
    return done;
  }

  private async playEvents(events: SimEvent[], after: Sim, epoch: number): Promise<void> {
    if (epoch !== this.epoch || this.disposed) return;
    for (const e of events) {
      if (epoch !== this.epoch || this.disposed) return;
      if (e.t === 'slide') {
        if (e.partner && !await this.pause(90)) return;
        const cell = this.shown.s.cell[e.tile];
        this.shown.present[e.tile] = 0;
        this.shown.occ[cell]--;
        this.shown.left--;
        this.renderTwine();
        if (!await this.slide(e)) return;
        if (e.into === 'pot') this.tick(e.pot, e.item, e.token);
        else {
          this.shown.bowlTok[e.slot] = e.token;
          this.shown.bowlLen++;
          this.shown.parks++;
          this.renderBowl(this.shown);
          this.bowlEl.querySelector(`.spot[data-k="${e.slot}"]`)?.classList.add('land');
          audio.play('park', { pitch: 0.95 + Math.random() * 0.1 });
        }
      } else if (e.t === 'bowlOut') {
        if (!await this.pause(90) || !await this.fly(e.slot, e.pot, e.token, e.item)) return;
        this.tick(e.pot, e.item, e.token);
      } else if (e.t === 'dish') {
        // Show the last recipe tick on the dish it completed before revealing the next recipe.
        if (!await this.pause(110)) return;
        this.serve(e.pot, e.last);
        if (!e.last && !await this.pause(240)) return;
        this.shown.potDish[e.pot] = e.dish + 1;
        this.shown.potGot[e.pot] = 0;
        this.renderPots(this.shown);
        const mark = this.potParts[e.pot].plate.querySelector('.served-mark');
        if (mark) this.animate(mark, [{ scale: '0.4', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 220, easing: 'ease-out' });
      } else if (e.t === 'lid') {
        this.steam(...this.centerOf(this.plateOf(e.pot)));
        audio.play('lid');
      } else if (e.t === 'uncover') {
        this.liftCloche(e.tile);
        if (this.tiles.has(e.tile)) this.updateTile(e.tile);
      } else if (e.t === 'unlock' || e.t === 'thaw') {
        const el = this.tiles.get(e.tile);
        if (el) {
          this.updateTile(e.tile);
          this.animate(el, [{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], { duration: 400 });
        }
        audio.play(e.t === 'unlock' ? 'unlock' : 'thaw');
      } else if (e.t === 'reveal') {
        if (!this.tiles.has(e.tile)) this.tiles.set(e.tile, this.makeTile(e.tile, true));
      } else if (e.t === 'won') {
        this.confetti();
      }
    }
    if (epoch !== this.epoch || this.disposed) return;
    this.shown = after;
    this.refreshTiles();
    this.renderPots(this.shown);
    this.renderBowl(this.shown);
    await this.pause(120);
  }

  private refreshTiles(): void {
    for (const t of this.level.tiles) {
      const visible = this.shown.present[t.id] && this.shown.isTop(t.id);
      if (!visible) { this.tiles.get(t.id)?.remove(); this.tiles.delete(t.id); continue; }
      if (!this.tiles.has(t.id)) this.tiles.set(t.id, this.makeTile(t.id, true));
      this.updateTile(t.id);
    }
    this.renderTwine();
  }

  /** A recipe chip gets its tick only after its ingredient has reached that recipe icon. */
  private tick(pot: number, item: number, token: Token): void {
    const arrival = this.centerOf(this.targetOf(pot, item));
    this.fresh.add(`${pot}:${this.shown.potDish[pot]}:${item}`);
    this.shown.potGot[pot] |= 1 << item;
    this.shown.delivered++;
    this.renderPots(this.shown);
    this.land(pot, item, token, arrival);
  }

  private async slide(e: Extract<SimEvent, { t: 'slide' }>): Promise<boolean> {
    const epoch = this.epoch;
    const el = this.tiles.get(e.tile);
    this.tiles.delete(e.tile);
    if (!el) return true;
    // Entry scale is an individual CSS transform; letting it compose with this translation
    // can pull a rapidly revealed tile away from its lane.
    for (const animation of el.getAnimations()) animation.cancel();
    el.querySelector('.cloche')?.remove();
    const t = this.level.tiles[e.tile];
    const body = el.querySelector<HTMLElement>('.tile-body')!;
    const icon = el.querySelector<HTMLElement>('.tile-icon')!;
    const size = icon.clientWidth;
    const anchor: Point = [this.cell / 2, this.cell * 0.4824];
    const iconOffset = anchor[1] - this.cell / 2;
    const lane = lanePoints(this.g, t.y * this.level.w + t.x, e.cells, t.dir, (c) => {
      const point = this.at(c);
      return [point[0], point[1] + iconOffset];
    }, this.boardRect());
    const last = lane.points[lane.points.length - 1];
    const spot = this.bowlEl.querySelector<HTMLElement>(`.spot[data-k="${e.slot}"]`);
    const targetEl = e.into === 'pot' ? this.targetOf(e.pot, e.item) : spot ?? this.bowlEl;
    const target = this.centerOf(targetEl);
    const flight = e.into === 'pot' ? recipientCurve(last, target, lane.direction, this.cell) : this.bowlRoute(last, target, lane.direction, spot ? this.widthOf(spot) : this.spot);
    const points = [...lane.points, ...flight.slice(1)];
    const laneLength = pathMetrics(lane.points).total;
    const endSize = e.into === 'pot' ? this.widthOf(targetEl) : (spot ? this.widthOf(spot) : this.spot) * 0.76;
    // A copy of the picture stays put while its enamel tile and arrow fade away at the edge.
    // Its final size exactly matches the bowl icon, avoiding the old landing size jump.
    icon.style.visibility = 'hidden';
    el.querySelector('.under')?.remove();
    el.append(h('span', { html: tokenHtml(e.token), style: `position:absolute;left:${anchor[0] - size / 2}px;top:${anchor[1] - size / 2}px;width:${size}px;height:${size}px;filter:drop-shadow(0 2px 0 rgba(60,30,10,.2))` }));
    el.style.transformOrigin = `${anchor[0]}px ${anchor[1]}px`;
    const motion = this.motion(points, anchor, endSize / size, laneLength, e.into === 'pot');
    const edgeOffset = motion.laneOffset;
    this.animate(body, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: Math.max(0, edgeOffset - 120 / motion.duration) }, { opacity: 0, offset: edgeOffset }, { opacity: 0, offset: 1 }], { duration: motion.duration, fill: 'forwards', easing: 'linear' });
    el.classList.add('flyer');
    el.style.zIndex = '20';
    const jar = e.into === 'bowl' && this.level.rules.bowlOrder === 'lifo';
    if (jar) this.bowlEl.classList.add('pouring');
    audio.play(e.partner ? 'link' : 'slide', { volume: 0.6 });
    const landed = await this.animate(el, motion.frames, { duration: motion.duration, easing: 'linear', fill: 'forwards' }).finished;
    el.remove();
    if (jar && epoch === this.epoch) this.bowlEl.classList.remove('pouring');
    return landed;
  }

  /** The required ingredient acknowledges its delivery; the dish stays still until it is served. */
  private land(pot: number, item: number, token: Token, arrival: Point): void {
    const picture = this.targetOf(pot, item);
    // Pop the inset picture so even a one-pixel recipe gap stays clear of its neighbours.
    this.animate(picture, [{ scale: '1' }, { scale: '1.1', offset: 0.35 }, { scale: '1' }], { duration: 250, easing: 'ease-out' });
    const [x, y] = arrival;
    this.drops(x, y, tokenColor(token));
    audio.play('plop', { pitch: 0.9 + Math.random() * 0.25 });
  }

  /** The jar is filled through its mouth, rather than through the side of the glass. */
  private bowlMouth(): Point {
    const center = this.centerOf(this.bowlEl);
    return [center[0], center[1] - this.bowlEl.clientHeight / 2 - 10];
  }

  private bowlRoute(from: Point, to: Point, dir: Dir, spot = this.spot): Point[] {
    const clearance = Math.max(this.cell * 0.3, spot * 0.42);
    const outside: Point = [from[0] + DX[dir] * clearance, from[1] + DY[dir] * clearance];
    const jar = this.level.rules.bowlOrder === 'lifo';
    const mouth = jar ? this.bowlMouth() : to;
    const approach: Point = [mouth[0], mouth[1] - (jar ? clearance : spot * 0.45)];
    const around = routeOutsideBoard(outside, approach, this.boardRect(), clearance);
    const points = [from, ...around, mouth];
    if (jar) points.push(to);
    return roundedPath(points, clearance * 0.55);
  }

  /** Sample by travelled distance; scale and opacity change only during the final transfer. */
  private motion(route: Point[], anchor: Point, endScale: number, laneLength: number, fade: boolean): { frames: Keyframe[]; duration: number; laneOffset: number } {
    const points: Point[] = [route[0]];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]; const b = route[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 22));
      for (let k = 1; k <= steps; k++) points.push([a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps]);
    }
    const { lengths, total } = pathMetrics(points);
    const laneTime = laneLength / 1.2;
    const flightLength = Math.max(0, total - laneLength);
    const time = laneTime + flightLength / 1.6 || 1;
    const frames: Keyframe[] = points.map((point, i) => {
      const progress = flightLength ? Math.max(0, (lengths[i] - laneLength) / flightLength) : 1;
      const eased = progress * progress * (3 - 2 * progress);
      const scale = 1 + (endScale - 1) * eased;
      const elapsed = Math.min(lengths[i], laneLength) / 1.2 + Math.max(0, lengths[i] - laneLength) / 1.6;
      return { transform: `translate(${point[0] - anchor[0]}px, ${point[1] - anchor[1]}px) scale(${scale})`, opacity: fade ? 1 - Math.max(0, (progress - 0.86) / 0.14) : 1, offset: elapsed / time };
    });
    frames[0].offset = 0;
    frames[frames.length - 1].offset = 1;
    return { frames, duration: Math.max(300, Math.min(1800, Math.round(time))), laneOffset: laneTime / time };
  }

  private async fly(slot: number, pot: number, token: Token, item: number): Promise<boolean> {
    const epoch = this.epoch;
    const jar = this.level.rules.bowlOrder === 'lifo';
    if (jar) {
      this.bowlEl.classList.add('pouring');
      if (!await this.pause(120)) return false;
    }
    const spot = this.bowlEl.querySelector(`.spot[data-k="${slot}"]`) ?? this.bowlEl;
    const picture = spot.querySelector('.s-icon');
    const from = this.centerOf(picture ?? spot);
    const target = this.targetOf(pot, item);
    const to = this.centerOf(target);
    const size = picture ? this.widthOf(picture) : (spot as HTMLElement).clientWidth * 0.76;
    const clearance = Math.max(this.cell * 0.3, size * 0.55);
    const mouth = this.bowlMouth();
    const lead: Point[] = jar ? [from, mouth, [mouth[0], mouth[1] - clearance]] : [from];
    const route = routeOutsideBoard(lead[lead.length - 1], to, this.boardRect(), clearance);
    const points = roundedPath([...lead, ...route.slice(1)], clearance * 0.55);
    const el = h('div', { class: 'flyer', html: tokenHtml(token), style: `width:${size}px;height:${size}px` });
    el.style.transformOrigin = `${size / 2}px ${size / 2}px`;
    this.root.append(el);
    this.shown.bowlTok[slot] = -1;
    this.shown.bowlLen--;
    this.renderBowl(this.shown);
    audio.play('bowlOut');
    const motion = this.motion(points, [size / 2, size / 2], this.widthOf(target) / size, 0, true);
    const landed = await this.animate(el, motion.frames, { duration: motion.duration, easing: 'linear', fill: 'forwards' }).finished;
    el.remove();
    if (jar && epoch === this.epoch) this.bowlEl.classList.remove('pouring');
    return landed;
  }

  /** Pending waits resolve on cancellation so undo, restart and resizing never leave a queue stuck. */
  private cancelPlayback(): void {
    this.epoch++;
    this.pressed = -1;
    this.hideLane();
    this.playQueue = Promise.resolve();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    for (const [id, cancel] of this.timers) { window.clearTimeout(id); cancel?.(); }
    this.timers.clear();
    this.root.querySelectorAll('.flyer,.cloche-fly,.drop,.steam,.confetti').forEach((el) => el.remove());
    this.root.querySelectorAll('.serve,.squash').forEach((el) => el.classList.remove('serve', 'squash'));
    this.bowlEl.classList.remove('pouring');
    this.fresh.clear();
  }

  private animate(el: Element, frames: Keyframe[] | PropertyIndexedKeyframes, options: KeyframeAnimationOptions): { finished: Promise<boolean> } {
    const animation = el.animate(frames, options);
    this.animations.add(animation);
    const finished = animation.finished.then(() => true, () => false).then((done) => { this.animations.delete(animation); return done; });
    return { finished };
  }

  private later(action: () => void, delay: number): void {
    const id = window.setTimeout(() => { this.timers.delete(id); if (!this.disposed) action(); }, delay);
    this.timers.set(id, undefined);
  }

  private pause(delay: number): Promise<boolean> {
    return new Promise((resolve) => {
      const id = window.setTimeout(() => { this.timers.delete(id); resolve(true); }, delay);
      this.timers.set(id, () => resolve(false));
    });
  }

  private serve(pot: number, last: boolean): void {
    const plate = this.plateOf(pot);
    plate.classList.remove('serve');
    void (plate as HTMLElement).offsetWidth;
    plate.classList.add('serve');
    const [x, y] = this.centerOf(plate);
    this.steam(x, y);
    this.sparkle(x, y);
    audio.play('serve', { pitch: last ? 1 : 1.12 });
  }

  private liftCloche(tile: number): void {
    const el = this.tiles.get(tile);
    if (!el) return;
    const [x, y] = this.at(this.level.tiles[tile].y * this.level.w + this.level.tiles[tile].x);
    const size = this.cell * 0.74;
    const fly = h('div', { class: 'cloche-fly', html: CLOCHE_SVG, style: `left:${x - size / 2}px;top:${y - size * 0.45}px;width:${size}px;height:${size * 0.8}px` });
    this.root.append(fly);
    el.classList.remove('covered');
    el.querySelector('.cloche')?.remove();
    const icon = el.querySelector('.tile-icon');
    if (icon) this.animate(icon, [{ scale: '0.4', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    this.animate(fly, [{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: `translateY(${-this.cell * 0.9}px) rotate(-18deg)`, opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' }).finished.then(() => fly.remove());
    this.steam(x, y - this.cell * 0.2);
    audio.play('reveal');
  }

  private drops(x: number, y: number, color: string): void {
    for (let i = 0; i < 4; i++) {
      const d = h('div', { class: 'drop', style: `left:${x - 2}px;top:${y - 2}px;width:4px;height:4px;background:${color}` });
      this.root.append(d);
      const a = -Math.PI / 2 + (i - 1.5) * 0.55 + (Math.random() - 0.5) * 0.2;
      const r = 8 + Math.random() * 8;
      this.animate(d, [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(0.9)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${Math.cos(a) * r * 1.3}px, ${Math.sin(a) * r + 16}px) scale(0.4)`, opacity: 0 },
      ], { duration: 320, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => d.remove());
    }
  }

  private steam(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const s = h('div', { class: 'steam', style: `left:${x - 9 + (i - 1) * 10}px;top:${y - 14}px` });
      this.root.append(s);
      this.animate(s, [
        { transform: 'translateY(0) scale(0.6)', opacity: 0 },
        { transform: 'translateY(-14px) scale(1)', opacity: 0.9, offset: 0.3 },
        { transform: `translateY(-46px) translateX(${(i - 1) * 6}px) scale(1.5)`, opacity: 0 },
      ], { duration: 900 + i * 120, delay: i * 90, easing: 'ease-out', fill: 'forwards' }).finished.then(() => s.remove());
    }
  }

  private sparkle(x: number, y: number): void {
    const colors = ['#ffc23d', '#ee5a3c', '#4cb35d', '#2aa79b', '#ffffff'];
    for (let i = 0; i < 10; i++) {
      const c = h('div', { class: 'confetti', style: `background:${colors[i % colors.length]};left:${x}px;top:${y}px;width:6px;height:6px;border-radius:50%` });
      this.root.append(c);
      const a = (i / 10) * Math.PI * 2;
      const r = 30 + Math.random() * 20;
      this.animate(c, [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(0.3)`, opacity: 0 },
      ], { duration: 600, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => c.remove());
    }
  }

  confetti(): void {
    const r = this.boardRect();
    const colors = ['#ffc23d', '#ee5a3c', '#4cb35d', '#2aa79b', '#d6457a', '#3d5a9e'];
    for (let b = 0; b < 5; b++) {
      this.later(() => {
        const x = r.left + Math.random() * (r.right - r.left);
        const y = r.top + Math.random() * (r.bottom - r.top) * 0.6;
        for (let i = 0; i < 14; i++) {
          const c = h('div', { class: 'confetti', style: `background:${colors[i % colors.length]};left:${x}px;top:${y}px` });
          this.root.append(c);
          const a = Math.random() * Math.PI * 2;
          const rr = 40 + Math.random() * 80;
          this.animate(c, [
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${Math.cos(a) * rr}px, ${Math.sin(a) * rr + 60}px) rotate(${Math.random() * 540}deg)`, opacity: 0 },
          ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => c.remove());
        }
      }, b * 130);
    }
  }
}
