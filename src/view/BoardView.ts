import { tracePath, geometryOf, type Geometry } from '../core/board';
import { DISHES, INGREDIENTS, WILD_INFO } from '../core/ingredients';
import type { Sim, SimEvent } from '../core/sim';
import { DX, DY, WILD, formOf, ingOf, type Dir, type LevelDef, type Token } from '../core/types';
import { ARROW_SVG, emoji, h } from '../ui/dom';
import { ingredientHtml, tokenHtml } from '../ui/iconStyle';
import { frameFor } from '../ui/viewport';
import { audio } from '../audio/audio';

/**
 * The kitchen as DOM: a wooden board with ingredient tiles, an order ticket with a plate on every
 * edge that feeds a pot, and the bowl (or the jar). It only shows what the simulation decided:
 * `sync` mirrors the state, `play` animates a batch of events.
 */

export interface BoardHandlers {
  press(tile: number): void;
  release(): void;
  tap(tile: number): void;
}

const GAP = 9;
const PAD = 8;

export const CLOCHE_SVG =
  '<svg viewBox="0 0 40 32"><defs><linearGradient id="clg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset="1" stop-color="#a9b4c1"/></linearGradient></defs>' +
  '<path d="M4 26 Q4 8 20 8 Q36 8 36 26 Z" fill="url(#clg)" stroke="#7f8a97" stroke-width="1.5"/>' +
  '<rect x="1.5" y="25" width="37" height="5" rx="2.5" fill="#c3cbd5" stroke="#7f8a97" stroke-width="1.2"/>' +
  '<circle cx="20" cy="6.5" r="3" fill="#c3cbd5" stroke="#7f8a97" stroke-width="1.2"/>' +
  '<path d="M10 20 Q11 13 17 11" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/></svg>';

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
  /** Per pot: the plate (kept across updates so its animations survive), the chips, the stamp and the lid badge. */
  private potParts: { plate: HTMLElement; strip: HTMLElement; extra: HTMLElement; icon: string }[] = [];
  private bowlEl: HTMLElement;
  /** Tied pairs: a tray under both tiles and two cords stitched across the seam. */
  private tieUnder: SVGSVGElement;
  private tieOver: SVGSVGElement;
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
  private resizeObs: ResizeObserver;
  /** Chips that just got ticked (they animate once). */
  private fresh = new Set<string>();
  private served = new Set<number>();

  constructor(parent: HTMLElement, sim: Sim, handlers: BoardHandlers) {
    this.sim = sim;
    this.level = sim.level;
    this.g = geometryOf(this.level);
    this.handlers = handlers;
    this.root = h('div', { class: 'kitchen' });
    this.boardEl = h('div', { class: 'board' });
    this.bowlEl = h('div', { class: 'bowl' });
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
      const parts = { plate: h('span', { class: 'plate' }), strip: h('span', { class: 'strip' }), extra: h('span'), icon: '' };
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
    this.resizeObs.disconnect();
    this.root.remove();
  }

  // ---------------------------------------------------------------- layout

  private bowlHeight(spot: number): number {
    const cap = this.sim.bowlCap;
    if (!cap) return 0;
    return this.level.rules.bowlOrder === 'lifo' ? cap * (spot - 4) + 30 : spot + 18;
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
    const midH = H - fr.top - fr.bottom;
    const jar = this.level.rules.bowlOrder === 'lifo';
    const cap = this.sim.bowlCap;
    // The tickets and the bowl scale with the cell size (chip ≈ 0.44 cell, spot ≈ 0.8 cell). Tall
    // screens put the bowl under the board, wide ones beside it on the left.
    const side = fr.wide && cap > 0;
    const bowlRows = cap && !side ? (jar ? cap * 0.8 + 0.4 : 0.95) : 0;
    const bowlCols = side ? 1.15 : 0;
    const byW = (areaW - 20 - 2 * PAD - nSide * (GAP + 14) - (side ? 2 * GAP + 30 : 0)) / (w + 0.7 * nSide + bowlCols);
    const byH = (midH - 2 * PAD - nTB * (GAP + 14) - 24) / (hh + 0.7 * nTB + bowlRows);
    const cell = Math.max(30, Math.min(fr.wide ? 118 : 96, Math.floor(Math.min(byW, byH))));
    this.cell = cell;
    this.chip = Math.max(18, Math.min(46, Math.round(cell * 0.44)));
    this.spot = Math.max(32, Math.min(84, Math.round(cell * 0.8)));
    // Long recipes shrink their chips to fit: across the screen for top/bottom tickets, along the
    // board for side tickets. Dishes after the current one are drawn smaller.
    const weight = (p: LevelDef['pots'][0]) =>
      p.dishes.reduce((a, d, i) => a + d.items.length * (i === 0 ? (d.order === 'strict' ? 1 : 1.25) : 0.72), 0) + (p.dishes.length - 1) * 0.8 + 2.4;
    for (const p of this.level.pots) {
      const flat = p.side === 0 || p.side === 2;
      const room = flat ? areaW - 30 : hh * cell + 2 * PAD + 40;
      this.chip = Math.max(14, Math.min(this.chip, Math.floor(room / weight(p)) - 3));
    }
    const ticket = this.chip * 1.55 + 12;
    const bw = w * cell + 2 * PAD;
    const bh = hh * cell + 2 * PAD;
    const bowlW = side ? this.spot + 34 : 0;
    const leftOfBoard = (sides.has(3) ? ticket + GAP : 0) + (side ? bowlW + 2 * GAP : 0);
    const blockW = bw + leftOfBoard + (sides.has(1) ? ticket + GAP : 0);
    const blockH = bh + (sides.has(0) ? ticket + GAP : 0) + (sides.has(2) ? ticket + GAP : 0) + (cap && !side ? this.bowlHeight(this.spot) + 16 : 0);
    const left = Math.round(fr.left + (areaW - blockW) / 2 + leftOfBoard);
    const top = Math.round(fr.top + Math.max(0, (midH - blockH) / 2) + (sides.has(0) ? ticket + GAP : 0));
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
        const x = s ? PAD + k * cell + 3 : side === 1 ? bw - 5 : 0;
        const y = s ? (side === 0 ? 0 : bh - 5) : PAD + k * cell + 3;
        Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${s ? cell - 6 : 5}px`, height: `${s ? 5 : cell - 6}px` });
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
    // Tickets: centred on their stretch of edge.
    this.level.pots.forEach((p, i) => {
      const el = this.potEls[i];
      const mid = (p.from + p.to) / 2;
      let x: number;
      let y: number;
      let tf: string;
      if (p.side === 0) [x, y, tf] = [this.ox + mid * cell, top - GAP, 'translate(-50%, -100%)'];
      else if (p.side === 2) [x, y, tf] = [this.ox + mid * cell, top + bh + GAP + 4, 'translate(-50%, 0)'];
      else if (p.side === 3) [x, y, tf] = [left - GAP, this.oy + mid * cell, 'translate(-100%, -50%)'];
      else [x, y, tf] = [left + bw + GAP, this.oy + mid * cell, 'translate(0, -50%)'];
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, transform: tf });
    });
    this.bowlEl.classList.toggle('side', side);
    if (side) {
      const x = left - (sides.has(3) ? ticket + GAP : 0) - GAP - bowlW / 2;
      Object.assign(this.bowlEl.style, { left: `${x}px`, top: `${top + bh / 2}px`, transform: 'translate(-50%, -50%)' });
    } else {
      const bowlTop = top + bh + GAP + 10 + (sides.has(2) ? ticket + GAP : 0) + (jar ? 12 : 0);
      Object.assign(this.bowlEl.style, { left: `${left + bw / 2}px`, top: `${bowlTop}px`, transform: 'translate(-50%, 0)' });
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
    return [r.left + r.width / 2 - k.left, r.top + r.height / 2 - k.top];
  }

  private plateOf(pot: number): Element {
    return this.potParts[pot].plate;
  }

  // ---------------------------------------------------------------- state

  sync(sim: Sim, full = false): void {
    this.sim = sim;
    if (full) {
      for (const el of this.tiles.values()) el.remove();
      this.tiles.clear();
      this.served = new Set(this.level.pots.map((_, i) => i).filter((i) => sim.potDone(i)));
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
    const tok = this.sim.tileToken(id);
    const el = h('div', { class: 'tile', style: `--c:${tokenColor(tok)}` });
    const pic = t.ing * 4 === WILD ? emoji(WILD_INFO.icon) : ingredientHtml(t.ing);
    el.innerHTML =
      `<div class="tile-body"><div class="tile-icon">${pic}</div>` +
      `<div class="tile-arrow" style="--rot:${t.dir * 90}deg">${ARROW_SVG}</div>${formBadge(tok)}</div>`;
    const below = this.level.tiles.filter((o) => o.x === t.x && o.y === t.y && (o.z ?? 0) < (t.z ?? 0)).sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0];
    if (below) {
      const ut = this.sim.tileToken(below.id);
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
    if (popIn) el.animate([{ scale: '0.6', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    return el;
  }

  private updateTile(id: number): void {
    const el = this.tiles.get(id)!;
    const frozen = this.sim.isFrozen(id);
    el.classList.toggle('frozen', frozen);
    let ice = el.querySelector('.ice');
    if (frozen && !ice) {
      ice = h('div', { class: 'ice', html: emoji('ice') });
      el.append(ice);
    } else if (!frozen && ice) ice.remove();
    const covered = this.sim.isCovered(id);
    el.classList.toggle('covered', covered);
    let cl = el.querySelector('.cloche');
    if (covered && !cl) {
      cl = h('div', { class: 'cloche', html: CLOCHE_SVG });
      el.querySelector('.tile-body')!.append(cl);
    } else if (!covered && cl) cl.remove();
    const left = this.sim.timerLeft(id);
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
      if (!o || !this.sim.present[t.id] || !this.sim.present[o.id]) continue;
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
      const done = sim.potDone(i);
      const cur = Math.min(sim.potDish[i], p.dishes.length - 1);
      sim.wants(i, want);
      const open = sim.potOpen(i);
      const dish = p.dishes[cur];
      const info = DISHES[dish.kind] ?? DISHES.soup;
      const parts: string[] = [];
      p.dishes.forEach((d, di) => {
        if (di < cur && !done) return;
        if (done && di < p.dishes.length - 1) return;
        if (di > cur) parts.push(`<span class="dish-sep" title="${(DISHES[d.kind] ?? DISHES.soup).en}">${emoji((DISHES[d.kind] ?? DISHES.soup).icon)}</span>`);
        const got = di === cur ? sim.potGot[i] : 0;
        d.items.forEach((t, k) => {
          const isDone = done || (di === cur && (got >> k) & 1);
          let cls = 'chip';
          if (isDone) cls += ' done' + (this.fresh.has(`${i}:${di}:${k}`) ? ' fresh' : '');
          else if (di === cur && open && want.includes(t) && (d.order !== 'strict' ? true : sim.acceptIndex(i, t) === k)) cls += d.order === 'strict' ? ' next' : ' free';
          else if (di > cur) cls += ' later';
          parts.push(`<span class="${cls}" style="--c:${tokenColor(t)}"><span class="c-icon">${tokenHtml(t)}</span>${formBadge(t)}</span>`);
        });
      });
      const pp = this.potParts[i];
      if (pp.icon !== info.icon) {
        pp.plate.innerHTML = emoji(info.icon);
        pp.plate.title = info.en;
        pp.icon = info.icon;
      }
      const strip = parts.join('');
      if (pp.strip.dataset.html !== strip) {
        pp.strip.innerHTML = strip;
        pp.strip.dataset.html = strip;
      }
      let extra = '';
      if (done) extra += `<span class="stamp${this.served.has(i) ? '' : ' fresh'}">SERVED</span>`;
      if (p.lid !== undefined && !open) {
        const other = this.level.pots[p.lid];
        const icon = DISHES[other.dishes[other.dishes.length - 1].kind]?.icon ?? 'pot-of-food';
        extra += `<span class="lid">${emoji('locked', 18)}after ${emoji(icon, 18)}</span>`;
      }
      if (pp.extra.dataset.html !== extra) {
        pp.extra.innerHTML = extra;
        pp.extra.dataset.html = extra;
      }
      if (done) this.served.add(i);
      el.classList.toggle('done', done);
      el.classList.toggle('closed', p.lid !== undefined && !open);
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
    const label = jar ? '' : `<span class="label">${emoji('bowl-with-spoon', 26)}</span>`;
    const html = label + spots.join('');
    if (this.bowlEl.dataset.html !== html) {
      this.bowlEl.innerHTML = html;
      this.bowlEl.dataset.html = html;
    }
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
    body.animate([
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
    if (events.some((e) => e.t === 'slide' && e.partner)) this.renderTwine();
    let t = 0;
    let end = 0;
    const slideEnd = new Map<number, number>();
    for (const e of events) {
      if (e.t === 'slide') {
        const delay = e.partner ? 90 : 0;
        const dur = this.slide(e, delay);
        t = Math.max(t, delay + dur);
        end = Math.max(end, t + 120);
        if (e.into === 'bowl') slideEnd.set(e.slot, delay + dur);
        else this.tick(e.pot, e.item, delay + dur);
      } else if (e.t === 'bowlOut') {
        const start = Math.max(slideEnd.get(e.slot) ?? 0, t) + 80;
        const dur = 360;
        setTimeout(() => this.fly(e.slot, e.pot, e.token), start);
        this.tick(e.pot, e.item, start + dur);
        t = start + dur;
        end = Math.max(end, t + 80);
      } else if (e.t === 'dish') {
        setTimeout(() => this.serve(e.pot, e.last), t + 40);
        end = Math.max(end, t + 700);
      } else if (e.t === 'lid') {
        setTimeout(() => {
          const pe = this.potEls[e.pot];
          pe.querySelector('.lid')?.animate([{ transform: 'translateX(-50%)' }, { transform: 'translate(-50%, -24px) rotate(-14deg)', opacity: 0 }], { duration: 500, fill: 'forwards', easing: 'ease-in' });
          this.steam(...this.centerOf(this.plateOf(e.pot)));
          audio.play('lid');
        }, t + 250);
        end = Math.max(end, t + 800);
      } else if (e.t === 'uncover') {
        setTimeout(() => this.liftCloche(e.tile), 60);
      } else if (e.t === 'unlock') {
        setTimeout(() => {
          this.tiles.get(e.tile)?.querySelector('.tile-body')?.animate([{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], { duration: 420 });
          audio.play('unlock');
        }, t + 60);
      } else if (e.t === 'thaw') {
        this.tiles.get(e.tile)?.animate([{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 400 });
        setTimeout(() => audio.play('thaw'), 80);
      } else if (e.t === 'won') {
        setTimeout(() => this.confetti(), t + 250);
      }
    }
    // Tiles that just became the top of their stack, locks that changed, and the twine.
    setTimeout(() => {
      for (const tl of this.level.tiles) {
        if (!this.sim.present[tl.id] || !this.sim.isTop(tl.id)) continue;
        if (!this.tiles.has(tl.id)) this.tiles.set(tl.id, this.makeTile(tl.id, true));
        this.updateTile(tl.id);
      }
      this.renderTwine();
    }, 120);
    return new Promise((res) => setTimeout(() => {
      this.renderPots(this.sim);
      this.renderBowl(this.sim);
      res();
    }, end));
  }

  /** A recipe chip gets its tick when the ingredient lands. */
  private tick(pot: number, item: number, at: number): void {
    const p = this.level.pots[pot];
    // The dish may have been served by this very delivery: the chip belongs to the dish it filled.
    const filledLast = this.sim.potDone(pot) || (this.sim.potGot[pot] === 0 && this.sim.potDish[pot] > 0);
    const dish = Math.min(p.dishes.length - 1, filledLast ? this.sim.potDish[pot] - 1 : this.sim.potDish[pot]);
    this.fresh.add(`${pot}:${dish}:${item}`);
    setTimeout(() => this.renderPots(this.sim), at);
  }

  private slide(e: Extract<SimEvent, { t: 'slide' }>, delay: number): number {
    const el = this.tiles.get(e.tile);
    this.tiles.delete(e.tile);
    if (!el) return 0;
    el.querySelector('.cloche')?.remove();
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
    pts.push([lx + DX[dir] * this.cell * 1.0, ly + DY[dir] * this.cell * 1.0]);
    const target = e.into === 'pot'
      ? this.centerOf(this.plateOf(e.pot))
      : this.centerOf(this.bowlEl.querySelector(`.spot[data-k="${e.slot}"]`) ?? this.bowlEl);
    const half = this.cell / 2;
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const last = pts[pts.length - 1];
    const flyDist = Math.hypot(target[0] - last[0], target[1] - last[1]);
    const total = dist + flyDist;
    const frames: Keyframe[] = [];
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      frames.push({ transform: `translate(${pts[i][0] - half}px, ${pts[i][1] - half}px) scale(1)`, offset: total ? (acc / total) * 0.82 : 0, easing: 'ease-in' });
    }
    // A little hop into the plate (or bowl), shrinking as it drops in.
    const mx = (last[0] + target[0]) / 2;
    const my = Math.min(last[1], target[1]) - this.cell * 0.35;
    frames.push({ transform: `translate(${mx - half}px, ${my - half}px) scale(0.7) rotate(${e.into === 'pot' ? 12 : -8}deg)`, offset: 0.91 });
    frames.push({ transform: `translate(${target[0] - half}px, ${target[1] - half}px) scale(${e.into === 'pot' ? 0.32 : 0.62}) rotate(0deg)`, opacity: e.into === 'pot' ? 0.4 : 1, offset: 1 });
    const dur = Math.max(320, Math.min(900, 220 + total * 0.95));
    el.classList.add('flyer');
    el.style.zIndex = '20';
    setTimeout(() => audio.play(e.partner ? 'link' : 'slide', { volume: 0.6 }), delay);
    el.animate(frames, { duration: dur, delay, easing: 'linear', fill: 'forwards' }).finished.then(() => {
      el.remove();
      if (e.into === 'pot') this.land(e.pot, e.token);
      else {
        this.renderBowl(this.sim);
        const spot = this.bowlEl.querySelector(`.spot[data-k="${e.slot}"]`);
        spot?.classList.add('land');
        audio.play('park', { pitch: 0.95 + Math.random() * 0.1 });
      }
    });
    return dur + delay;
  }

  /** The ingredient drops into the pot: the plate squashes, a few drops splash. */
  private land(pot: number, token: Token): void {
    const plate = this.plateOf(pot);
    plate.classList.remove('squash');
    void (plate as HTMLElement).offsetWidth;
    plate.classList.add('squash');
    const [x, y] = this.centerOf(plate);
    this.drops(x, y, tokenColor(token));
    audio.play('plop', { pitch: 0.9 + Math.random() * 0.25 });
  }

  private fly(slot: number, pot: number, token: Token): void {
    const spot = this.bowlEl.querySelector(`.spot[data-k="${slot}"]`) ?? this.bowlEl;
    const from = this.centerOf(spot);
    const to = this.centerOf(this.plateOf(pot));
    spot.querySelector('.s-icon')?.remove();
    const size = this.spot * 0.8;
    const el = h('div', { class: 'flyer', html: tokenHtml(token), style: `width:${size}px;height:${size}px` });
    this.root.append(el);
    audio.play('bowlOut');
    el.animate([
      { transform: `translate(${from[0] - size / 2}px, ${from[1] - size / 2}px) scale(1)` },
      { transform: `translate(${(from[0] + to[0]) / 2 - size / 2}px, ${Math.min(from[1], to[1]) - size / 2 - 50}px) scale(1.1)`, offset: 0.5 },
      { transform: `translate(${to[0] - size / 2}px, ${to[1] - size / 2}px) scale(0.45)`, opacity: 0.5 },
    ], { duration: 360, easing: 'ease-in-out', fill: 'forwards' }).finished.then(() => {
      el.remove();
      this.land(pot, token);
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
    el.querySelector('.tile-icon')?.animate([{ scale: '0.4', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    fly.animate([{ transform: 'translateY(0) rotate(0)', opacity: 1 }, { transform: `translateY(${-this.cell * 0.9}px) rotate(-18deg)`, opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' }).finished.then(() => fly.remove());
    this.steam(x, y - this.cell * 0.2);
    audio.play('reveal');
  }

  private drops(x: number, y: number, color: string): void {
    for (let i = 0; i < 6; i++) {
      const d = h('div', { class: 'drop', style: `left:${x - 3}px;top:${y - 3}px;background:${color}` });
      this.root.append(d);
      const a = -Math.PI / 2 + (i - 2.5) * 0.45 + (Math.random() - 0.5) * 0.3;
      const r = 18 + Math.random() * 16;
      d.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(0.9)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${Math.cos(a) * r * 1.3}px, ${Math.sin(a) * r + 16}px) scale(0.4)`, opacity: 0 },
      ], { duration: 460, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => d.remove());
    }
  }

  private steam(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const s = h('div', { class: 'steam', style: `left:${x - 9 + (i - 1) * 10}px;top:${y - 14}px` });
      this.root.append(s);
      s.animate([
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
      c.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * r}px, ${Math.sin(a) * r}px) scale(0.3)`, opacity: 0 },
      ], { duration: 600, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => c.remove());
    }
  }

  confetti(): void {
    const r = this.boardEl.getBoundingClientRect();
    const k = this.root.getBoundingClientRect();
    const colors = ['#ffc23d', '#ee5a3c', '#4cb35d', '#2aa79b', '#d6457a', '#3d5a9e'];
    for (let b = 0; b < 5; b++) {
      setTimeout(() => {
        const x = r.left - k.left + Math.random() * r.width;
        const y = r.top - k.top + Math.random() * r.height * 0.6;
        for (let i = 0; i < 14; i++) {
          const c = h('div', { class: 'confetti', style: `background:${colors[i % colors.length]};left:${x}px;top:${y}px` });
          this.root.append(c);
          const a = Math.random() * Math.PI * 2;
          const rr = 40 + Math.random() * 80;
          c.animate([
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${Math.cos(a) * rr}px, ${Math.sin(a) * rr + 60}px) rotate(${Math.random() * 540}deg)`, opacity: 0 },
          ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }).finished.then(() => c.remove());
        }
      }, b * 130);
    }
  }
}
