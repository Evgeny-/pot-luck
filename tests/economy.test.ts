import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The icon renderer reaches the audio module through dom.ts; keep the tests independent of it.
vi.mock('../src/audio/audio', () => ({ audio: { play() {}, unlock() {} } }));
// A small manifest to test the fallback order (the real one is checked below via importActual).
vi.mock('../src/ui/art.generated', () => ({
  ART_KEYS: { sticker: ['tomato', 'carrot', 'soup'], kawaii: ['tomato'] },
}));

import levelsData from '../src/data/levels.json';
import { ART_PREVIEW, ART_SETS, DEFAULT_ART_SET, buy, canBuy, equip, retroTips, tipsForWin } from '../src/app/economy';
import { loadSave, parseSave } from '../src/app/save';
import { DISHES, INGREDIENTS } from '../src/core/ingredients';
import { WILD, tokenOf, type LevelDef, type Tier } from '../src/core/types';
import { artSet, artSrc, dishHtml, ingredientHtml, setArtSet, tokenHtml } from '../src/ui/iconStyle';

const LEVELS = levelsData as unknown as LevelDef[];
const wallet = (tips: number, owned = ['sticker'], set = 'sticker') => ({ tips, owned: [...owned], artSet: set });

describe('tips for a win', () => {
  it.each([
    ['intro', 10], ['easy', 10], ['relax', 10], ['normal', 10], ['hard', 20], ['superhard', 30],
  ] as [Tier, number][])('first clear of a %s level pays %i plus 5 a star', (tier, base) => {
    expect(tipsForWin(tier, 0, 1)).toBe(base + 5);
    expect(tipsForWin(tier, 0, 3)).toBe(base + 15);
  });

  it('counts a level without a tier as normal', () => {
    expect(tipsForWin(undefined, 0, 2)).toBe(20);
  });

  it('pays only the new stars on a replay', () => {
    expect(tipsForWin('normal', 1, 3)).toBe(10);
    expect(tipsForWin('superhard', 2, 3)).toBe(5);
  });

  it('pays nothing for a replay without a better score', () => {
    expect(tipsForWin('hard', 3, 3)).toBe(0);
    expect(tipsForWin('normal', 2, 1)).toBe(0);
  });

  it('adds up to exactly the first-clear amount however the stars come in', () => {
    const steps = tipsForWin('hard', 0, 1) + tipsForWin('hard', 1, 2) + tipsForWin('hard', 2, 3);
    expect(steps).toBe(tipsForWin('hard', 0, 3));
  });
});

describe('retro tips', () => {
  const tiers: Record<number, Tier> = { 1: 'intro', 2: 'normal', 3: 'hard', 4: 'superhard' };
  const tierOf = (n: number) => tiers[n];

  it('pays every cleared level as a first clear with its stars', () => {
    expect(retroTips({ 1: 3, 2: 1, 3: 2, 4: 3 }, tierOf)).toBe(25 + 15 + 30 + 45);
  });

  it('pays nothing without stars', () => {
    expect(retroTips({}, tierOf)).toBe(0);
    expect(retroTips({ 2: 0 }, tierOf)).toBe(0);
  });

  it('lets a perfect campaign afford every art set', () => {
    const all = Object.fromEntries(LEVELS.map((l) => [l.n, 3]));
    const total = retroTips(all, (n) => LEVELS[n - 1]?.tier);
    expect(total).toBeGreaterThanOrEqual(ART_SETS.reduce((a, s) => a + s.price, 0));
  });
});

describe('art set catalogue', () => {
  it('has the free sticker set first and unique ids', () => {
    expect(ART_SETS[0]).toMatchObject({ id: DEFAULT_ART_SET, price: 0 });
    expect(new Set(ART_SETS.map((s) => s.id)).size).toBe(ART_SETS.length);
    expect(ART_SETS.map((s) => [s.id, s.price])).toEqual([['sticker', 0], ['kawaii', 300], ['watercolor', 450], ['retro', 600]]);
  });
});

describe('buying and equipping', () => {
  it('refuses when tips are short, and changes nothing', () => {
    const w = wallet(299);
    expect(canBuy(w, 'kawaii')).toBe(false);
    expect(buy(w, 'kawaii')).toBe(false);
    expect(w).toEqual(wallet(299));
  });

  it('refuses a set already owned, or one that does not exist', () => {
    const w = wallet(1000, ['sticker', 'kawaii']);
    expect(canBuy(w, 'kawaii')).toBe(false);
    expect(buy(w, 'kawaii')).toBe(false);
    expect(canBuy(w, 'sticker')).toBe(false);
    expect(canBuy(w, 'gold-leaf')).toBe(false);
    expect(w.tips).toBe(1000);
  });

  it('deducts the price, adds the set and equips it', () => {
    const w = wallet(300);
    expect(canBuy(w, 'kawaii')).toBe(true);
    expect(buy(w, 'kawaii')).toBe(true);
    expect(w).toEqual({ tips: 0, owned: ['sticker', 'kawaii'], artSet: 'kawaii' });
  });

  it('equips only owned sets', () => {
    const w = wallet(0, ['sticker', 'retro'], 'retro');
    expect(equip(w, 'kawaii')).toBe(false);
    expect(w.artSet).toBe('retro');
    expect(equip(w, 'sticker')).toBe(true);
    expect(w.artSet).toBe('sticker');
  });
});

describe('save migration', () => {
  const tierOf = (n: number): Tier | undefined => (n === 3 ? 'hard' : 'normal');
  const old = JSON.stringify({ unlocked: 4, stars: { 1: 3, 2: 1, 3: 2 }, seen: ['start'], settings: { debug: false, sound: false, music: true } });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts a new player with no tips and the sticker set', () => {
    const s = parseSave(null, tierOf);
    expect(s).toMatchObject({ unlocked: 1, tips: 0, owned: ['sticker'], artSet: 'sticker' });
  });

  it('pays an old save for the stars it already has, keeping its progress', () => {
    const s = parseSave(old, tierOf);
    expect(s.tips).toBe(25 + 15 + 30);
    expect(s).toMatchObject({ unlocked: 4, seen: ['start'], owned: ['sticker'], artSet: 'sticker' });
    expect(s.settings.sound).toBe(false);
  });

  it('keeps the tips of a save that has them', () => {
    const s = parseSave(JSON.stringify({ ...JSON.parse(old), tips: 42, owned: ['sticker', 'kawaii'], artSet: 'kawaii' }), tierOf);
    expect(s).toMatchObject({ tips: 42, owned: ['sticker', 'kawaii'], artSet: 'kawaii' });
  });

  it('keeps a spent-out balance of 0 (not re-migrated)', () => {
    expect(parseSave(JSON.stringify({ ...JSON.parse(old), tips: 0 }), tierOf).tips).toBe(0);
  });

  it('always owns the sticker set and only equips an owned set', () => {
    const s = parseSave(JSON.stringify({ tips: 5, owned: ['kawaii'], artSet: 'retro' }), tierOf);
    expect(s.owned).toEqual(['sticker', 'kawaii']);
    expect(s.artSet).toBe('sticker');
  });

  it('falls back to a fresh save on broken JSON', () => {
    expect(parseSave('{nope', tierOf)).toMatchObject({ unlocked: 1, tips: 0 });
  });

  it('loadSave migrates what is in localStorage', () => {
    vi.stubGlobal('localStorage', { getItem: () => old });
    expect(loadSave(tierOf).tips).toBe(70);
  });
});

describe('icon renderer', () => {
  const ing = (key: string) => INGREDIENTS.findIndex((i) => i.key === key);

  afterEach(() => setArtSet('sticker'));

  it('knows which pictures a set has', () => {
    expect(artSrc('sticker', 'tomato')).toBe('./art/sticker/tomato.webp');
    expect(artSrc('sticker', 'basil')).toBeNull();
    expect(artSrc('nope', 'tomato')).toBeNull();
  });

  it('draws the equipped set first', () => {
    setArtSet('kawaii');
    expect(artSet()).toBe('kawaii');
    expect(ingredientHtml(ing('tomato'))).toBe('<img class="gen-icon" src="./art/kawaii/tomato.webp" alt="Tomato" draggable="false">');
    expect(tokenHtml(tokenOf(ing('tomato'), 1))).toContain('./art/kawaii/tomato.webp');
  });

  it('falls back to the sticker set, then to the emoji', () => {
    setArtSet('kawaii');
    expect(ingredientHtml(ing('carrot'))).toContain('./art/sticker/carrot.webp');
    expect(ingredientHtml(ing('basil'))).toMatch(/^<span class="emo /);
    setArtSet('retro');
    expect(ingredientHtml(ing('tomato'))).toContain('./art/sticker/tomato.webp');
  });

  it('draws the magic spice and unknown ids as emoji', () => {
    expect(tokenHtml(WILD)).toMatch(/^<span class="emo /);
    expect(ingredientHtml(999)).toMatch(/^<span class="emo /);
  });

  it('draws dishes with the same chain', () => {
    expect(dishHtml('soup')).toContain('./art/sticker/soup.webp');
    expect(dishHtml('pizza')).toMatch(/^<span class="emo /);
    expect(dishHtml('no-such-dish')).toContain('./art/sticker/soup.webp');
  });
});

describe('art manifest', () => {
  const realKeys = async () => (await vi.importActual<typeof import('../src/ui/art.generated')>('../src/ui/art.generated')).ART_KEYS;
  const known = new Set([...INGREDIENTS.map((i) => i.key), ...Object.keys(DISHES)]);

  it.each(ART_SETS.map((s) => [s.id] as const))('%s has every market preview picture', async (id) => {
    const ART_KEYS = await realKeys();
    for (const key of ART_PREVIEW) expect(ART_KEYS[id], `${id}/${key}`).toContain(key);
  });

  it('the free sticker set has every ingredient picture', async () => {
    const ART_KEYS = await realKeys();
    for (const { key } of INGREDIENTS) expect(ART_KEYS.sticker, `sticker/${key}`).toContain(key);
  });

  it('the free sticker set has every dish picture', async () => {
    const ART_KEYS = await realKeys();
    for (const key of Object.keys(DISHES)) expect(ART_KEYS.sticker, `sticker/${key}`).toContain(key);
  });

  it('lists only real ingredient or dish keys, and every file exists', async () => {
    const ART_KEYS = await realKeys();
    for (const [set, keys] of Object.entries(ART_KEYS)) {
      for (const key of keys) {
        expect(known.has(key), `${set}/${key} is not an ingredient or dish`).toBe(true);
        expect(existsSync(new URL(`../public/art/${set}/${key}.webp`, import.meta.url)), `${set}/${key}.webp`).toBe(true);
      }
    }
  });
});
