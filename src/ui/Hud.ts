import type { Tier } from '../core/types';
import { emoji, h } from './dom';
import { audio } from '../audio/audio';
import { INGREDIENTS } from '../core/ingredients';
import { ingredientHtml } from './iconStyle';

export interface HudHandlers {
  home(): void;
  undo(): void;
  hint(): void;
  restart(): void;
  debug?(): void;
}

/** Hard levels are one chili, super hard two; a new mechanic gets a NEW tag. */
export function heatHtml(tier: Tier | undefined, size = 20): string {
  const count = tier === 'superhard' ? 2 : tier === 'hard' ? 1 : 0;
  if (!count) return '';
  const chili = ingredientHtml(INGREDIENTS.find((i) => i.key === 'chili')!.id);
  return `<span class="heat" aria-label="${count === 2 ? 'Extra spicy' : 'Spicy'}">${Array.from({ length: count }, () => `<span class="heat-icon" style="width:${size}px;height:${size}px">${chili}</span>`).join('')}</span>`;
}

export class Hud {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private debugEl: HTMLElement;
  private undoBtn: HTMLButtonElement;

  constructor(root: HTMLElement, n: number, tier: Tier, where: string, on: HudHandlers) {
    const home = h('button', { class: 'btn round paper', html: emoji('house', 26), attrs: { 'aria-label': 'Map' } });
    home.addEventListener('click', () => {
      audio.play('button');
      on.home();
    });
    const right = h('div', { class: 'hud-right' });
    if (on.debug) {
      const dbg = h('button', { class: 'btn round paper', html: emoji('bug', 24), attrs: { 'aria-label': 'Auto-solve' } });
      dbg.addEventListener('click', () => on.debug!());
      right.append(dbg);
    }
    this.fill = h('div', { class: 'progress-fill' });
    this.debugEl = h('div', { class: 'debug-line' });
    const tag = tier === 'intro' && n > 3 ? '<span class="new-tag">NEW</span>' : heatHtml(tier);
    const sign = h('div', { class: 'level-sign', html: `<span class="lv">Level ${n} ${tag}</span><span class="where">${where}</span>` });
    const top = h('div', { class: 'hud-top' },
      h('div', { class: 'hud-left' }, home),
      h('div', { class: 'hud-title' }, sign, h('div', { class: 'progress' }, this.fill), this.debugEl),
      right,
    );
    const action = (cls: string, icon: string, name: string, fn: () => void) => {
      const b = h('button', { class: `action-btn ${cls}`, html: `${emoji(icon, 26)}<span>${name}</span>`, attrs: { 'aria-label': name } });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.unlock();
        fn();
      });
      return b;
    };
    this.undoBtn = action('b-undo', 'right-arrow-curving-left', 'Undo', on.undo);
    const actions = h('div', { class: 'hud-actions', attrs: { 'aria-label': 'Kitchen actions' } },
      this.undoBtn,
      action('b-hint', 'light-bulb', 'Hint', on.hint),
      action('b-restart', 'counterclockwise-arrows-button', 'Restart', on.restart),
    );
    this.el = h('div', { class: 'hud' }, top, actions);
    root.append(this.el);
  }

  setProgress(p: number): void {
    this.fill.style.width = `${Math.round(p * 100)}%`;
  }

  setUndo(enabled: boolean): void {
    this.undoBtn.disabled = !enabled;
  }

  setDebug(text: string): void {
    this.debugEl.textContent = text;
  }

  destroy(): void {
    this.el.remove();
  }
}
