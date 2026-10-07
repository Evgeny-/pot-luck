import type { CuisineId } from '../core/cuisines';

/**
 * Look of each cuisine: a soft wall pattern behind the board, the wood of the cutting board and
 * an accent colour for banners. Patterns are tiny inline SVGs or CSS gradients (no image files).
 */
export interface CuisineTheme {
  /** Wall colour and pattern. */
  bg: string;
  pattern: string;
  size: string;
  /** Cutting board: light grain, darker grain, edge. */
  wood: [string, string, string];
  /** Banner / title accent and its darker edge. */
  accent: string;
  accentEdge: string;
}

const svg = (body: string, w: number, h: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

export const THEMES: Record<CuisineId, CuisineTheme> = {
  // Red gingham tablecloth.
  italy: {
    bg: '#fbf1e1',
    pattern: 'linear-gradient(90deg, rgba(226, 84, 66, 0.30) 50%, transparent 50%), linear-gradient(rgba(226, 84, 66, 0.30) 50%, transparent 50%)',
    size: '38px 38px',
    wood: ['#ecc893', '#d9a868', '#a8743c'],
    accent: '#e2543f',
    accentEdge: '#a8331f',
  },
  // Indigo waves on washi paper.
  japan: {
    bg: '#eef0ea',
    pattern: svg(`<path d='M0 15 Q 10 5 20 15 T 40 15' fill='none' stroke='#9db2cf' stroke-width='2'/><path d='M0 25 Q 10 15 20 25 T 40 25' fill='none' stroke='#c7d3e3' stroke-width='1.5'/><circle cx='30' cy='5' r='1.6' fill='#c9a0a8'/>`, 40, 30),
    size: '40px 30px',
    wood: ['#f2dfb8', '#e2c592', '#b8925a'],
    accent: '#3d5a9e',
    accentEdge: '#263b6e',
  },
  // Talavera tiles.
  mexico: {
    bg: '#f7f1e3',
    pattern: svg(`<rect width='48' height='48' fill='none' stroke='#e3d5b8' stroke-width='2'/><g fill='#3a69bf' opacity='0.26'><circle cx='0' cy='0' r='9'/><circle cx='48' cy='0' r='9'/><circle cx='0' cy='48' r='9'/><circle cx='48' cy='48' r='9'/><ellipse cx='24' cy='14' rx='4.5' ry='8'/><ellipse cx='24' cy='34' rx='4.5' ry='8'/><ellipse cx='14' cy='24' rx='8' ry='4.5'/><ellipse cx='34' cy='24' rx='8' ry='4.5'/></g><circle cx='24' cy='24' r='4' fill='#f0b02c' opacity='0.55'/>`, 48, 48),
    size: '48px 48px',
    wood: ['#d9a06a', '#c2814b', '#8f5628'],
    accent: '#2f6fc4',
    accentEdge: '#1d4a8a',
  },
  // Diner checkerboard.
  usa: {
    bg: '#f4efe3',
    pattern: 'conic-gradient(rgba(64, 186, 176, 0.32) 90deg, transparent 90deg 180deg, rgba(64, 186, 176, 0.32) 180deg 270deg, transparent 270deg)',
    size: '46px 46px',
    wood: ['#efcf9d', '#ddb276', '#ad7f45'],
    accent: '#e0453b',
    accentEdge: '#a32a22',
  },
  // Block print rosettes.
  india: {
    bg: '#fbe9c8',
    pattern: svg(`<g opacity='0.5'><circle cx='28' cy='28' r='7' fill='#d6457a'/><g fill='#e98a2a'><ellipse cx='28' cy='16' rx='3.5' ry='6'/><ellipse cx='28' cy='40' rx='3.5' ry='6'/><ellipse cx='16' cy='28' rx='6' ry='3.5'/><ellipse cx='40' cy='28' rx='6' ry='3.5'/></g><circle cx='28' cy='28' r='3' fill='#fbe9c8'/><g fill='#1f9e94'><circle cx='0' cy='0' r='3'/><circle cx='56' cy='0' r='3'/><circle cx='0' cy='56' r='3'/><circle cx='56' cy='56' r='3'/></g></g>`, 56, 56),
    size: '56px 56px',
    wood: ['#c98d5a', '#b2733f', '#7d4a22'],
    accent: '#d6457a',
    accentEdge: '#9b2552',
  },
  // Lattice window on lacquer red.
  china: {
    bg: '#f6e3d3',
    pattern: svg(`<g fill='none' stroke='#d9483b' stroke-width='2' opacity='0.35'><rect x='4' y='4' width='32' height='32'/><path d='M4 20 H14 V14 H26 V26 H14 V20 M36 20 H26'/></g>`, 40, 40),
    size: '40px 40px',
    wood: ['#ead19b', '#d8b878', '#a8864a'],
    accent: '#c8372c',
    accentEdge: '#8e1f17',
  },
};

/** Puts a cuisine's look on an element (CSS custom properties). */
export function applyTheme(el: HTMLElement, id: CuisineId): void {
  const t = THEMES[id] ?? THEMES.italy;
  const s = el.style;
  s.setProperty('--wall', t.bg);
  s.setProperty('--wall-pattern', t.pattern);
  s.setProperty('--wall-size', t.size);
  s.setProperty('--wood-1', t.wood[0]);
  s.setProperty('--wood-2', t.wood[1]);
  s.setProperty('--wood-edge', t.wood[2]);
  s.setProperty('--accent', t.accent);
  s.setProperty('--accent-edge', t.accentEdge);
}
