function knifeDrawing(length: number): string {
  const end = length + 32;
  const shoulder = Math.max(42, end - Math.min(54, length * 0.24));
  return `<path d="M31 4 H${shoulder} Q${end - 16} 4 ${end - 1} 13 Q${end - 13} 22 ${shoulder - 16} 23 H31 Z" fill="#d8e0e5" stroke="#687a82" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M33 6 H${shoulder} Q${end - 21} 6 ${end - 5} 13" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>` +
    `<path d="M33 19 H${shoulder - 15} Q${end - 20} 18 ${end - 1} 13 Q${end - 13} 22 ${shoulder - 16} 23 H33 Z" fill="#9fafb7"/>` +
    '<rect x="2" y="7" width="32" height="14" rx="5" fill="#74503b" stroke="#4c3528" stroke-width="1.4"/>' +
    '<path d="M7 9 H28" stroke="#a67c56" stroke-width="2" stroke-linecap="round"/>' +
    '<circle cx="11" cy="14" r="2" fill="#e5d2a8" stroke="#4c3528" stroke-width=".7"/>' +
    '<circle cx="25" cy="14" r="2" fill="#e5d2a8" stroke="#4c3528" stroke-width=".7"/>';
}

/** A chef's knife laid along the chopping boundary, with its handle outside the board. */
export function knifeBarSvg(length: number, axis: 'h' | 'v' = 'h'): string {
  const end = length + 32;
  const body = knifeDrawing(length);
  return axis === 'h'
    ? `<svg viewBox="0 0 ${end} 26" preserveAspectRatio="none" aria-hidden="true">${body}</svg>`
    : `<svg viewBox="0 0 26 ${end}" preserveAspectRatio="none" aria-hidden="true"><g transform="translate(26 0) rotate(90)">${body}</g></svg>`;
}

/** The same knife at a normal proportion for the mechanic tutorial and map badge. */
export const KNIFE_SVG = '<svg viewBox="0 0 100 80" aria-hidden="true"><g transform="translate(3 56) rotate(-32)">' +
  knifeDrawing(64) + '</g></svg>';
