import { DISHES, INGREDIENTS, WILD_INFO } from '../core/ingredients';
import { WILD, ingOf, type Token } from '../core/types';
import { ART_KEYS } from './art.generated';
import { emoji } from './dom';

/**
 * Ingredient and dish pictures in the equipped art set. A picture comes from the equipped set,
 * else from the free sticker set, else it is the Fluent emoji, so a set can ship before it covers
 * every ingredient. Which pictures exist is in art.generated.ts (public/art/<set>/<key>.webp).
 * Dev preview: `?icons=kawaii` draws that set whatever is equipped.
 */
const BASE_SET = 'sticker';
const KEYS = new Map(Object.entries(ART_KEYS).map(([set, keys]) => [set, new Set(keys)]));
const preview = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('icons') ?? '' : '';
let equipped = BASE_SET;

/** Equips an art set (pictures drawn from now on use it). */
export function setArtSet(id: string): void {
  equipped = id;
}

/** The art set pictures are drawn in: the `?icons=` preview if it names a set, else the equipped one. */
export function artSet(): string {
  return KEYS.has(preview) ? preview : equipped;
}

/** URL of `key`'s picture in `set`, or null when that set has no such picture. */
export function artSrc(set: string, key: string): string | null {
  return KEYS.get(set)?.has(key) ? `./art/${set}/${key}.webp` : null;
}

/** A picture for `key`, falling back from the active set to the sticker set to the emoji `icon`. */
function pictureHtml(key: string, alt: string, icon: string): string {
  const src = artSrc(artSet(), key) ?? artSrc(BASE_SET, key);
  return src ? `<img class="gen-icon" src="${src}" alt="${alt}" draggable="false">` : emoji(icon);
}

/** Ingredient picture by ingredient id. */
export function ingredientHtml(ing: number): string {
  const info = INGREDIENTS[ing];
  if (!info) return emoji(WILD_INFO.icon);
  return pictureHtml(info.key, info.en, info.icon);
}

export function tokenHtml(t: Token): string {
  return t === WILD ? emoji(WILD_INFO.icon) : ingredientHtml(ingOf(t));
}

/** Dish picture by dish kind (unknown kinds draw as soup). */
export function dishHtml(kind: string): string {
  const k = DISHES[kind] ? kind : 'soup';
  return pictureHtml(k, DISHES[k].en, DISHES[k].icon);
}
