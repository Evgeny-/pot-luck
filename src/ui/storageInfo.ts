import type { LevelDef } from '../core/types';
import { starBands, starsFor } from '../game/stars';
import { openDialog } from './dialogs';
import { emoji, h } from './dom';
import './storageInfo.css';

export function storageInfo(root: HTMLElement, level: LevelDef, uses: number): void {
  const name = level.rules.bowlOrder === 'lifo' ? 'Jar' : 'Bowl';
  const par = level.stats?.par ?? 0;
  const score = starsFor(uses, par);
  const bands = h('div', { class: 'storage-star-bands' });
  for (const band of starBands(par)) {
    const range = band.max === Infinity ? `${band.min}+ uses`
      : band.min === band.max ? `${band.min} ${band.min === 1 ? 'use' : 'uses'}`
      : `${band.min}–${band.max} uses`;
    bands.append(h('div', {
      class: 'storage-star-band' + (score === band.stars ? ' current' : ''),
      attrs: { 'aria-label': `${band.stars} stars: ${range}${score === band.stars ? ', your current range' : ''}` },
      html: `<span class="storage-star-icons" aria-hidden="true">${Array.from({ length: band.stars }, () => emoji('star', 23)).join('')}</span><span>${range}</span>${score === band.stars ? '<small>Now</small>' : ''}`,
    }));
  }
  const cap = level.rules.bowl;
  const body = h('div', { class: 'storage-info-body' },
    h('p', { class: 'storage-usage-summary', html: `Used <b>${uses}</b> ${uses === 1 ? 'time' : 'times'} this cook.` }),
    bands,
    h('p', { class: 'storage-usage-help', text: `Each ingredient parked in the ${name.toLowerCase()} counts as one use. It holds ${cap} ingredient${cap === 1 ? '' : 's'} at a time. Undo restores the count.` }),
  );
  openDialog(root, {
    title: `${name} & stars`,
    body: [body],
    buttons: [{ label: 'Back to cooking', cls: 'green', onClick: () => {} }],
  });
}
