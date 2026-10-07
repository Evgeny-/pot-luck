import type { Tier } from '../core/types';
import { DEFAULT_ART_SET, retroTips } from './economy';

export interface SaveData {
  /** Highest level unlocked. */
  unlocked: number;
  stars: Record<number, number>;
  /** Mechanic intros already shown. */
  seen: string[];
  settings: { debug: boolean; sound: boolean; music: boolean };
  /** Tips to spend in the market. */
  tips: number;
  /** Art sets bought (always includes the free default). */
  owned: string[];
  /** Equipped art set. */
  artSet: string;
}

/** Looks up a level's tier, so saves from before tips existed can be paid for their stars. */
export type TierOf = (n: number) => Tier | undefined;

const KEY = 'pot-luck-save-v2';

function freshSave(): SaveData {
  return {
    unlocked: 1, stars: {}, seen: [], settings: { debug: false, sound: true, music: true },
    tips: 0, owned: [DEFAULT_ART_SET], artSet: DEFAULT_ART_SET,
  };
}

/**
 * Save data from its stored JSON (null: nothing stored). A save without a `tips` field predates
 * the market: it gets the tips its stars would have earned (`tierOf` gives the real level tiers;
 * unknown levels count as normal).
 */
export function parseSave(raw: string | null, tierOf: TierOf = () => undefined): SaveData {
  const fresh = freshSave();
  if (!raw) return fresh;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    const s: SaveData = { ...fresh, ...d, settings: { ...fresh.settings, ...(d.settings ?? {}) } };
    s.tips = typeof d.tips === 'number' && Number.isFinite(d.tips) ? Math.max(0, Math.floor(d.tips)) : retroTips(s.stars, tierOf);
    const owned = Array.isArray(d.owned) ? d.owned.filter((id) => typeof id === 'string') : [];
    s.owned = [...new Set([DEFAULT_ART_SET, ...owned])];
    s.artSet = typeof d.artSet === 'string' && s.owned.includes(d.artSet) ? d.artSet : DEFAULT_ART_SET;
    return s;
  } catch {
    return fresh;
  }
}

export function loadSave(tierOf?: TierOf): SaveData {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage may be unavailable (private mode) */
  }
  return parseSave(raw, tierOf);
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function resetSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
