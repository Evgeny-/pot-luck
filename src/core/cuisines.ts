import { INGREDIENTS } from './ingredients';

/**
 * Chapters of the campaign are cuisines: each brings its own ingredients (chosen so that every
 * pair of tile colours is easy to tell apart), dishes, background, music and map decorations.
 */
export type CuisineId = 'italy' | 'japan' | 'mexico' | 'usa' | 'india' | 'china';

export interface Cuisine {
  id: CuisineId;
  name: { en: string; ru: string };
  place: { en: string; ru: string };
  /** Emoji for the map banner and the level card. */
  icon: string;
  /** Ingredient keys, most characteristic first. */
  ingredients: string[];
  /** Dish keys for the pots (see DISHES). */
  dishes: string[];
  /** Map decorations. */
  deco: string[];
}

export const CUISINES: readonly Cuisine[] = [
  {
    id: 'italy', name: { en: 'Trattoria', ru: 'Траттория' }, place: { en: 'Italy', ru: 'Италия' }, icon: 'pizza',
    ingredients: ['tomato', 'basil', 'garlic', 'cheese', 'mushroom', 'olive', 'onion', 'eggplant'],
    dishes: ['pasta', 'pizza', 'soup', 'salad'],
    deco: ['olive', 'herb', 'cheese-wedge', 'tomato', 'garlic', 'spaghetti'],
  },
  {
    id: 'japan', name: { en: 'Izakaya', ru: 'Идзакая' }, place: { en: 'Japan', ru: 'Япония' }, icon: 'sushi',
    ingredients: ['rice', 'fish', 'shrimp', 'egg', 'cucumber', 'mushroom', 'carrot', 'eggplant'],
    dishes: ['sushi', 'ramen', 'bento', 'onigiri', 'oden'],
    deco: ['cherry-blossom', 'red-paper-lantern', 'chopsticks', 'fish-cake-with-swirl', 'mount-fuji', 'carp-streamer'],
  },
  {
    id: 'mexico', name: { en: 'Cantina', ru: 'Кантина' }, place: { en: 'Mexico', ru: 'Мексика' }, icon: 'taco',
    ingredients: ['corn', 'avocado', 'chili', 'beans', 'onion', 'garlic', 'lime', 'chicken'],
    dishes: ['taco', 'burrito', 'tamale', 'soup'],
    deco: ['cactus', 'hot-pepper', 'avocado', 'ear-of-corn', 'sun', 'lime'],
  },
  {
    id: 'usa', name: { en: 'Diner', ru: 'Дайнер' }, place: { en: 'USA', ru: 'США' }, icon: 'hamburger',
    ingredients: ['bread', 'cheese', 'meat', 'lettuce', 'tomato', 'onion', 'blueberry'],
    dishes: ['burger', 'fries', 'hotdog', 'pancakes', 'sandwich'],
    deco: ['hot-dog', 'french-fries', 'glass-of-milk', 'delivery-truck', 'statue-of-liberty', 'pancakes'],
  },
  {
    id: 'india', name: { en: 'Spice Market', ru: 'Рынок специй' }, place: { en: 'India', ru: 'Индия' }, icon: 'curry-rice',
    ingredients: ['rice', 'chili', 'onion', 'ginger', 'peas', 'carrot', 'coconut'],
    dishes: ['curry', 'flatbread', 'stew', 'kebab'],
    deco: ['diya-lamp', 'lotus', 'coconut', 'hot-pepper', 'mango', 'hindu-temple'],
  },
  {
    id: 'china', name: { en: 'Dim Sum House', ru: 'Дим-сам' }, place: { en: 'China', ru: 'Китай' }, icon: 'dumpling',
    ingredients: ['shrimp', 'egg', 'mushroom', 'lettuce', 'carrot', 'fish', 'chili', 'eggplant'],
    dishes: ['dumplings', 'takeout', 'hotpot', 'mooncake', 'fortune'],
    deco: ['red-paper-lantern', 'chopsticks', 'fortune-cookie', 'dumpling', 'bubble-tea', 'moon-cake'],
  },
];

export const LEVELS_PER_CUISINE = 10;

export function cuisineFor(n: number): Cuisine {
  return CUISINES[Math.floor((n - 1) / LEVELS_PER_CUISINE) % CUISINES.length];
}

export function cuisineById(id: string | undefined): Cuisine {
  return CUISINES.find((c) => c.id === id) ?? CUISINES[0];
}

/** Ingredient ids of a cuisine (in its order). */
export function cuisineIngredients(c: Cuisine): number[] {
  return c.ingredients.map((k) => {
    const ing = INGREDIENTS.find((i) => i.key === k);
    if (!ing) throw new Error(`unknown ingredient ${k}`);
    return ing.id;
  });
}
