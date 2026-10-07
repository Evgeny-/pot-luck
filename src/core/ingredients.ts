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
  { key: 'shrimp', en: 'Shrimp', ru: 'Креветка', icon: 'fried-shrimp', color: '#ff8fc6', family: 'pink', abbr: 'S' },
  { key: 'broccoli', en: 'Broccoli', ru: 'Брокколи', icon: 'broccoli', color: '#2f9e5b', family: 'green', abbr: 'R' },
  { key: 'cheese', en: 'Cheese', ru: 'Сыр', icon: 'cheese-wedge', color: '#ffc933', family: 'yellow', abbr: 'Q' },
  { key: 'corn', en: 'Corn', ru: 'Кукуруза', icon: 'ear-of-corn', color: '#ffbf1f', family: 'yellow', abbr: 'K' },
  { key: 'chili', en: 'Chili', ru: 'Чили', icon: 'hot-pepper', color: '#d9343a', family: 'red', abbr: 'H' },
  { key: 'rice', en: 'Rice', ru: 'Рис', icon: 'cooked-rice', color: '#eef3f7', family: 'white', abbr: 'I' },
  { key: 'meat', en: 'Meat', ru: 'Мясо', icon: 'cut-of-meat', color: '#8e3b3b', family: 'red', abbr: 'Z' },
  { key: 'lemon', en: 'Lemon', ru: 'Лимон', icon: 'lemon', color: '#ffe94a', family: 'yellow', abbr: 'L' },
  { key: 'cucumber', en: 'Cucumber', ru: 'Огурец', icon: 'cucumber', color: '#8fd97f', family: 'green', abbr: 'U' },
  { key: 'bread', en: 'Bread', ru: 'Хлеб', icon: 'bread', color: '#c98a4a', family: 'tan', abbr: 'D' },
  { key: 'basil', en: 'Basil', ru: 'Базилик', icon: 'herb', color: '#3fae5a', family: 'green', abbr: 'V' },
  { key: 'olive', en: 'Olive', ru: 'Оливка', icon: 'olive', color: '#6f7a2a', family: 'olive', abbr: 'W' },
  { key: 'ginger', en: 'Ginger', ru: 'Имбирь', icon: 'ginger-root', color: '#ead4a6', family: 'tan', abbr: 'J' },
  { key: 'peas', en: 'Peas', ru: 'Горошек', icon: 'pea-pod', color: '#9fd65f', family: 'green', abbr: 'N' },
  { key: 'beans', en: 'Beans', ru: 'Фасоль', icon: 'beans', color: '#7a3a2e', family: 'red', abbr: 'Y' },
  { key: 'coconut', en: 'Coconut', ru: 'Кокос', icon: 'coconut', color: '#94704f', family: 'brown', abbr: 'X' },
  { key: 'lettuce', en: 'Lettuce', ru: 'Салат', icon: 'leafy-green', color: '#7ed36d', family: 'green', abbr: 'Ł' },
  { key: 'avocado', en: 'Avocado', ru: 'Авокадо', icon: 'avocado', color: '#5f9636', family: 'green', abbr: 'Å' },
  { key: 'lime', en: 'Lime', ru: 'Лайм', icon: 'lime', color: '#c4ee5c', family: 'green', abbr: 'Ł' },
  { key: 'peanut', en: 'Peanuts', ru: 'Арахис', icon: 'peanuts', color: '#ecd3a8', family: 'tan', abbr: 'Ň' },
  { key: 'chicken', en: 'Chicken', ru: 'Курица', icon: 'poultry-leg', color: '#c8763c', family: 'tan', abbr: 'Ç' },
  { key: 'blueberry', en: 'Blueberries', ru: 'Черника', icon: 'blueberries', color: '#5b7fe8', family: 'blue', abbr: 'Ü' },
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
  sushi: { en: 'Sushi', ru: 'Суши', icon: 'sushi', color: '#ff9fb4' },
  bento: { en: 'Bento', ru: 'Бенто', icon: 'bento-box', color: '#ff5a5f' },
  onigiri: { en: 'Onigiri', ru: 'Онигири', icon: 'rice-ball', color: '#f7f7f2' },
  oden: { en: 'Oden', ru: 'Оден', icon: 'oden', color: '#ffc933' },
  tamale: { en: 'Tamale', ru: 'Тамале', icon: 'tamale', color: '#ffd43b' },
  burger: { en: 'Burger', ru: 'Бургер', icon: 'hamburger', color: '#e3a35a' },
  fries: { en: 'Fries', ru: 'Картошка фри', icon: 'french-fries', color: '#ff5a5f' },
  hotdog: { en: 'Hot dog', ru: 'Хот-дог', icon: 'hot-dog', color: '#ff9b3d' },
  pancakes: { en: 'Pancakes', ru: 'Блинчики', icon: 'pancakes', color: '#ffc933' },
  flatbread: { en: 'Flatbread', ru: 'Лепёшка', icon: 'flatbread', color: '#e9c98f' },
  takeout: { en: 'Noodles', ru: 'Лапша', icon: 'takeout-box', color: '#f3ead9' },
  hotpot: { en: 'Hot pot', ru: 'Хого', icon: 'pot-of-food', color: '#d9343a' },
  mooncake: { en: 'Mooncake', ru: 'Лунный пряник', icon: 'moon-cake', color: '#e2a058' },
  fortune: { en: 'Fortune cookie', ru: 'Печенье с предсказанием', icon: 'fortune-cookie', color: '#ffd43b' },
  kebab: { en: 'Wrap', ru: 'Ролл', icon: 'stuffed-flatbread', color: '#e3a35a' },
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
