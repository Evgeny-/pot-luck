import type { Tier } from '../core/types';
import type { SaveData } from './save';

/**
 * Tips: the diner's currency. Clearing a level and earning stars pays tips, and the market sells
 * art sets for them. Everything here is pure, so the numbers are easy to test and tune.
 */

/** Tips for the first clear of a level, by tier (levels without a tier count as normal). */
export const FIRST_CLEAR_TIPS: Record<Tier, number> = { intro: 10, easy: 10, relax: 10, normal: 10, hard: 20, superhard: 30 };
/** Tips for every star earned for the first time. */
export const STAR_TIPS = 5;

/** The free art set every player starts with. */
export const DEFAULT_ART_SET = 'sticker';

export interface ArtSet {
  id: string;
  name: string;
  blurb: string;
  /** Price in tips (0: free). */
  price: number;
}

/** Ingredient art sets sold in the market, in shop order. */
export const ART_SETS: readonly ArtSet[] = [
  { id: 'sticker', name: 'Sticker', blurb: 'Bold die-cut stickers, the classic look', price: 0 },
  { id: 'kawaii', name: 'Kawaii', blurb: 'Ingredients with happy little faces', price: 300 },
  { id: 'watercolor', name: 'Watercolor', blurb: 'Soft hand-painted washes', price: 450 },
  { id: 'retro', name: 'Retro Diner', blurb: 'Fifties menu-board charm', price: 600 },
];

/** Ingredients the market draws to preview each set. */
export const ART_PREVIEW: readonly string[] = ['tomato', 'carrot', 'mushroom', 'onion', 'cheese'];

export function artSetById(id: string): ArtSet | undefined {
  return ART_SETS.find((s) => s.id === id);
}

/**
 * Tips for winning a level of `tier` with `newStars`, when the best before was `prevStars`
 * (0 = never cleared). The first clear pays the tier's base; each star above the old best pays
 * STAR_TIPS, so replaying for a better score still pays and replaying without one pays nothing.
 */
export function tipsForWin(tier: Tier | undefined, prevStars: number, newStars: number): number {
  const prev = clampStars(prevStars);
  const next = clampStars(newStars);
  if (next === 0) return 0;
  const base = prev === 0 ? FIRST_CLEAR_TIPS[tier ?? 'normal'] ?? FIRST_CLEAR_TIPS.normal : 0;
  return base + Math.max(0, next - prev) * STAR_TIPS;
}

/** Tips a player would have earned for the stars already on the map (to migrate old saves). */
export function retroTips(stars: Record<number, number>, tierOf: (n: number) => Tier | undefined): number {
  let sum = 0;
  for (const [n, s] of Object.entries(stars)) sum += tipsForWin(tierOf(Number(n)), 0, s);
  return sum;
}

type Wallet = Pick<SaveData, 'tips' | 'owned' | 'artSet'>;

/** Whether the set exists, isn't owned yet and the player has the tips for it. */
export function canBuy(save: Wallet, id: string): boolean {
  const set = artSetById(id);
  return !!set && !save.owned.includes(id) && save.tips >= set.price;
}

/** Buys and equips a set: deducts its price and adds it to `owned`. False (and no change) if not allowed. */
export function buy(save: Wallet, id: string): boolean {
  if (!canBuy(save, id)) return false;
  save.tips -= artSetById(id)!.price;
  save.owned.push(id);
  save.artSet = id;
  return true;
}

/** Equips an owned set. False (and no change) if the player doesn't own it. */
export function equip(save: Wallet, id: string): boolean {
  if (!save.owned.includes(id)) return false;
  save.artSet = id;
  return true;
}

function clampStars(s: number): number {
  return Number.isFinite(s) ? Math.max(0, Math.min(3, Math.floor(s))) : 0;
}
