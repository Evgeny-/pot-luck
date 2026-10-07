import type { Tier } from '../core/types';
import { emoji, h } from './dom';
import { audio } from '../audio/audio';

export interface HudHandlers {
  home(): void;
  undo(): void;
  hint(): void;
  restart(): void;
  debug?(): void;
}

/** Hard levels are one chili, super hard two; a new mechanic gets a NEW tag. */
export function heatHtml(tier: Tier | undefined, size = 20): string {
  if (tier === 'hard') return `<span class="heat">${emoji('hot-pepper', size)}</span>`;
  if (tier === 'superhard') return `<span class="heat">${emoji('hot-pepper', size)}${emoji('hot-pepper', size)}</span>`;
  return '';
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
    const jar = (cls: string, icon: string, name: string, fn: () => void) => {
      const b = h('button', { class: `jar-btn ${cls}`, html: `<span class="lid"></span><span class="glass">${emoji(icon, 30)}</span><span class="tag">${name}</span>`, attrs: { 'aria-label': name } });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.unlock();
        fn();
      });
      return b;
    };
    this.undoBtn = jar('b-undo', 'right-arrow-curving-left', 'Undo', on.undo);
    const shelf = h('div', { class: 'shelf' },
      this.undoBtn,
      jar('b-hint', 'light-bulb', 'Hint', on.hint),
      jar('b-restart', 'counterclockwise-arrows-button', 'Restart', on.restart),
    );
    this.el = h('div', { class: 'hud' }, top, shelf);
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
