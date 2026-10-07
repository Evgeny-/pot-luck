/**
 * Ingredient catalogue. `family` groups ingredients whose tile colours are easy to confuse: a level
 * uses at most one ingredient per family, so every pair on the board reads at a glance.
 */
export interface Ingredient {
  id: number;
  key: string;
  en: string;
  ru: string;
  /** Fluent Emoji (flat) icon name. */
  icon: string;
  /** Tile colour. */
  color: string;
  family: string;
  /** One letter for the ASCII printer. */
  abbr: string;
}

const raw: Omit<Ingredient, 'id'>[] = [
  { key: 'tomato', en: 'Tomato', ru: 'Помидор', icon: 'tomato', color: '#ff5a5f', family: 'red', abbr: 'T' },
  { key: 'onion', en: 'Onion', ru: 'Лук', icon: 'onion', color: '#c58af9', family: 'lilac', abbr: 'O' },
  { key: 'carrot', en: 'Carrot', ru: 'Морковь', icon: 'carrot', color: '#ff9b3d', family: 'orange', abbr: 'C' },
  { key: 'garlic', en: 'Garlic', ru: 'Чеснок', icon: 'garlic', color: '#f3ead9', family: 'white', abbr: 'G' },
  { key: 'mushroom', en: 'Mushroom', ru: 'Гриб', icon: 'brown-mushroom', color: '#a9805f', family: 'brown', abbr: 'M' },
  { key: 'potato', en: 'Potato', ru: 'Картошка', icon: 'potato', color: '#dcb575', family: 'tan', abbr: 'P' },
  { key: 'egg', en: 'Egg', ru: 'Яйцо', icon: 'egg', color: '#ffe066', family: 'yellow', abbr: 'E' },
  { key: 'pepper', en: 'Pepper', ru: 'Перец', icon: 'bell-pepper', color: '#5ccf4a', family: 'green', abbr: 'B' },
  { key: 'eggplant', en: 'Eggplant', ru: 'Баклажан', icon: 'eggplant', color: '#7b4fd6', family: 'purple', abbr: 'A' },
  { key: 'fish', en: 'Fish', ru: 'Рыба', icon: 'fish', color: '#45b3ff', family: 'blue', abbr: 'F' },
  { key: 'shrimp', en: 'Shrimp', ru: 'Креветка', icon: 'fried-shrimp', color: '#ff9fb4', family: 'pink', abbr: 'S' },
  { key: 'broccoli', en: 'Broccoli', ru: 'Брокколи', icon: 'broccoli', color: '#2f9e5b', family: 'green', abbr: 'R' },
  { key: 'cheese', en: 'Cheese', ru: 'Сыр', icon: 'cheese-wedge', color: '#ffc933', family: 'yellow', abbr: 'Q' },
  { key: 'corn', en: 'Corn', ru: 'Кукуруза', icon: 'ear-of-corn', color: '#ffd43b', family: 'yellow', abbr: 'K' },
  { key: 'chili', en: 'Chili', ru: 'Чили', icon: 'hot-pepper', color: '#d9343a', family: 'red', abbr: 'H' },
  { key: 'rice', en: 'Rice', ru: 'Рис', icon: 'cooked-rice', color: '#f7f7f2', family: 'white', abbr: 'I' },
  { key: 'meat', en: 'Meat', ru: 'Мясо', icon: 'cut-of-meat', color: '#c2554a', family: 'red', abbr: 'Z' },
  { key: 'lemon', en: 'Lemon', ru: 'Лимон', icon: 'lemon', color: '#fff176', family: 'yellow', abbr: 'L' },
  { key: 'cucumber', en: 'Cucumber', ru: 'Огурец', icon: 'cucumber', color: '#8fd97f', family: 'green', abbr: 'U' },
  { key: 'bread', en: 'Bread', ru: 'Хлеб', icon: 'bread', color: '#e3a35a', family: 'tan', abbr: 'D' },
];

export const INGREDIENTS: readonly Ingredient[] = raw.map((r, id) => ({ ...r, id }));

export const WILD_INFO = { key: 'spice', en: 'Magic spice', ru: 'Волшебная специя', icon: 'sparkles', color: '#ffffff', abbr: '*' };

/** Dish kinds: what a pot is cooking (icon only; the recipe is the dish's item list). */
export const DISHES: Record<string, { en: string; ru: string; icon: string; color: string }> = {
  soup: { en: 'Soup', ru: 'Суп', icon: 'pot-of-food', color: '#ff7a59' },
  stew: { en: 'Stew', ru: 'Рагу', icon: 'shallow-pan-of-food', color: '#f2a541' },
  curry: { en: 'Curry', ru: 'Карри', icon: 'curry-rice', color: '#ffc933' },
  salad: { en: 'Salad', ru: 'Салат', icon: 'green-salad', color: '#5ccf4a' },
  pasta: { en: 'Pasta', ru: 'Паста', icon: 'spaghetti', color: '#ff9b3d' },
  ramen: { en: 'Ramen', ru: 'Рамен', icon: 'steaming-bowl', color: '#45b3ff' },
  omelette: { en: 'Omelette', ru: 'Омлет', icon: 'cooking', color: '#ffe066' },
  sandwich: { en: 'Sandwich', ru: 'Сэндвич', icon: 'sandwich', color: '#e3a35a' },
  pizza: { en: 'Pizza', ru: 'Пицца', icon: 'pizza', color: '#ff5a5f' },
  taco: { en: 'Taco', ru: 'Тако', icon: 'taco', color: '#ffb84d' },
  dumplings: { en: 'Dumplings', ru: 'Пельмени', icon: 'dumpling', color: '#f3ead9' },
  burrito: { en: 'Burrito', ru: 'Буррито', icon: 'burrito', color: '#c58af9' },
};

export const DISH_KINDS = Object.keys(DISHES);

/** Families in the order new ones are introduced (the first levels use the most distinct colours). */
export const FAMILY_ORDER = ['red', 'orange', 'green', 'lilac', 'yellow', 'brown', 'blue', 'white', 'pink', 'purple', 'tan'];

/** One ingredient per family, the first `count` families (for the starter set) or a random mix. */
export function ingredientsByFamily(): Map<string, Ingredient[]> {
  const m = new Map<string, Ingredient[]>();
  for (const ing of INGREDIENTS) m.set(ing.family, [...(m.get(ing.family) ?? []), ing]);
  return m;
}
