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

const TIER_LABEL: Partial<Record<Tier, string>> = { hard: 'Hard', superhard: 'Super hard', relax: 'Relax', intro: 'New' };

export class Hud {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private debugEl: HTMLElement;
  private undoBtn: HTMLButtonElement;

  constructor(root: HTMLElement, n: number, tier: Tier, on: HudHandlers) {
    const home = h('button', { class: 'btn round white', html: emoji('house', 26) });
    home.addEventListener('click', () => {
      audio.play('button');
      on.home();
    });
    const right = h('div', { class: 'hud-right' });
    if (on.debug) {
      const dbg = h('button', { class: 'btn round', html: emoji('bug', 24) });
      dbg.addEventListener('click', () => on.debug!());
      right.append(dbg);
    }
    this.fill = h('div', { class: 'progress-fill' });
    this.debugEl = h('div', { class: 'debug-line' });
    const badge = TIER_LABEL[tier] ? `<span class="tier-badge ${tier}">${TIER_LABEL[tier]}</span>` : '';
    const top = h('div', { class: 'hud-top' },
      h('div', { class: 'hud-left' }, home),
      h('div', { class: 'hud-title' }, h('div', { class: 'level-name', html: `Level ${n} ${badge}` }), h('div', { class: 'progress' }, this.fill), this.debugEl),
      right,
    );
    const booster = (cls: string, icon: string, name: string, fn: () => void) => {
      const b = h('button', { class: `booster ${cls}`, html: `<span class="bicon">${emoji(icon, 32)}</span><span class="bname">${name}</span>` });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.unlock();
        fn();
      });
      return b;
    };
    this.undoBtn = booster('b-undo', 'right-arrow-curving-left', 'Undo', on.undo);
    const dock = h('div', { class: 'boosters' },
      this.undoBtn,
      booster('b-hint', 'light-bulb', 'Hint', on.hint),
      booster('b-restart', 'counterclockwise-arrows-button', 'Restart', on.restart),
    );
    this.el = h('div', { class: 'hud' }, top, dock);
    root.append(this.el);
  }

  setProgress(p: number): void {
    this.fill.style.width = `calc(${Math.round(p * 100)}% - 4px)`;
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
