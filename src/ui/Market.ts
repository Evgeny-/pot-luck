import { audio } from '../audio/audio';
import { ART_PREVIEW, ART_SETS, type ArtSet } from '../app/economy';
import { INGREDIENTS } from '../core/ingredients';
import { button, emoji, h } from './dom';
import { artSrc } from './iconStyle';
import './market.css';

/** What the market needs from the app: the wallet, and how to spend it. */
export interface MarketContext {
  tips(): number;
  owned(): string[];
  equipped(): string;
  /** Buys and equips a set (and saves); false if the purchase wasn't allowed. */
  buy(id: string): boolean;
  /** Equips an owned set (and saves). */
  equip(id: string): void;
  onClose(): void;
}

const CHECK_SVG = '<svg viewBox="0 0 24 24" class="tick"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** The market: a recipe-card overlay that sells ingredient art sets for tips. Returns a close function. */
export function openMarket(root: HTMLElement, ctx: MarketContext): () => void {
  const overlay = h('div', { class: 'overlay market-overlay' });
  const balance = h('div', { class: 'tips-chip big', attrs: { 'aria-label': 'Your tips' }, html: `${emoji('coin')}<b>${ctx.tips()}</b><small>tips</small>` });
  const amount = balance.querySelector('b')!;
  const list = h('div', { class: 'market-list' });

  const cards = ART_SETS.map((set) => {
    const action = h('div', { class: 'set-action' });
    const card = h('div', { class: 'set-card' },
      h('div', { class: 'set-name', text: set.name }),
      h('div', { class: 'set-blurb', text: set.blurb }),
      h('div', { class: 'set-tray', html: ART_PREVIEW.map((k) => previewHtml(set.id, k)).join('') }),
      action,
    );
    list.append(card);
    return { set, card, action };
  });

  const refresh = () => {
    const owned = ctx.owned();
    for (const c of cards) {
      const using = ctx.equipped() === c.set.id;
      c.card.classList.toggle('in-use', using);
      c.action.replaceChildren(
        using ? h('span', { class: 'in-use-tag', html: `In use${CHECK_SVG}` })
          : owned.includes(c.set.id) ? button('Use', 'green small', () => equipSet(c.set))
            : priceButton(c.set, ctx.tips(), () => purchase(c.set, c.card)),
      );
    }
  };

  const purchase = (set: ArtSet, card: HTMLElement) => {
    const before = ctx.tips();
    if (!ctx.buy(set.id)) return;
    audio.play('star');
    countTo(amount, before, ctx.tips());
    celebrate(card);
    refresh();
  };

  const equipSet = (set: ArtSet) => {
    ctx.equip(set.id);
    refresh();
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 180);
    ctx.onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);

  refresh();
  overlay.append(h('div', { class: 'dialog market' },
    h('div', { class: 'market-awning' }),
    h('div', { class: 'dialog-head', text: 'Market' }),
    h('div', { class: 'market-top' }, balance, h('div', { class: 'market-hint', text: 'Earn tips by clearing levels. Every new star pays extra.' })),
    list,
    h('div', { class: 'market-note', html: `${emoji('artist-palette')}More sets coming soon` }),
    h('div', { class: 'actions' }, button('Done', 'green', close)),
  ));
  root.append(overlay);
  return close;
}

/** Rolls the number shown in `el` from `from` to `to` (a new roll on the same element replaces the old one). */
export function countTo(el: HTMLElement, from: number, to: number, ms = 650, prefix = ''): void {
  const run = (rolls.get(el) ?? 0) + 1;
  rolls.set(el, run);
  const t0 = performance.now();
  const step = (now: number) => {
    if (rolls.get(el) !== run) return;
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = prefix + Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const rolls = new WeakMap<HTMLElement, number>();

/** The buy button: the price, or disabled with how many tips are missing. */
function priceButton(set: ArtSet, tips: number, onBuy: () => void): HTMLButtonElement {
  const need = set.price - tips;
  const b = h('button', {
    class: 'btn gold small price',
    html: `${emoji('coin')}<span>${set.price}</span>${need > 0 ? `<small class="need">Need ${need} more</small>` : ''}`,
    attrs: { 'aria-label': need > 0 ? `${set.name}: ${set.price} tips, need ${need} more` : `Buy ${set.name} for ${set.price} tips` },
  });
  b.disabled = need > 0;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onBuy();
  });
  return b;
}

/** One preview ingredient drawn in `set` (its emoji if the set has no picture for it yet). */
function previewHtml(set: string, key: string): string {
  const info = INGREDIENTS.find((i) => i.key === key);
  const src = artSrc(set, key);
  const pic = src ? `<img class="gen-icon" src="${src}" alt="${info?.en ?? key}" draggable="false">` : emoji(info?.icon ?? key);
  return `<span class="pic">${pic}</span>`;
}

/** A coin burst and a couple of sparkles over a freshly bought card. */
function celebrate(card: HTMLElement): void {
  card.classList.remove('bought');
  void card.offsetWidth;
  card.classList.add('bought');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const burst = h('div', { class: 'coin-burst' });
  card.append(burst);
  for (let i = 0; i < 12; i++) {
    const coin = h('span', { class: 'bit', html: emoji(i % 4 === 3 ? 'sparkles' : 'coin') });
    burst.append(coin);
    const a = -Math.PI * (0.12 + 0.76 * Math.random());
    const r = 60 + Math.random() * 70;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    const spin = (Math.random() - 0.5) * 540;
    coin.animate([
      { transform: 'translate(0, 0) scale(0.3) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.7}px, ${dy}px) scale(1) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy * 0.35 + 30}px) scale(0.7) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 750 + Math.random() * 250, delay: i * 18, easing: 'cubic-bezier(0.25, 0.7, 0.4, 1)', fill: 'both' });
  }
  setTimeout(() => burst.remove(), 1300);
}
