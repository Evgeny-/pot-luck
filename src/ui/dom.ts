import { audio } from '../audio/audio';
import { EMOJI } from './emoji.generated';

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; html?: string; text?: string; style?: string; on?: Record<string, (e: Event) => void>; attrs?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.style) el.setAttribute('style', props.style);
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.on) for (const [k, fn] of Object.entries(props.on)) el.addEventListener(k, fn);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Inline Fluent emoji as an element of the given size (px), or filling its parent when size is 0. */
export function emoji(name: string, size = 0, cls = ''): string {
  const svg = EMOJI[name] ?? EMOJI['red-question-mark'] ?? '';
  const style = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<span class="emo ${cls}"${style}>${svg}</span>`;
}

/** A chunky button with a click sound. */
export function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'btn ' + cls, html: label });
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.unlock();
    audio.play('button');
    onClick();
  });
  return b;
}

export const ARROW_SVG = '<svg viewBox="0 0 24 24"><path d="M12 3 L21 14 H15 V21 H9 V14 H3 Z" fill="currentColor"/></svg>';

let toastTimer = 0;
export function toast(root: HTMLElement, text: string, ms = 1800): void {
  let el = root.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = h('div', { class: 'toast' });
    root.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), ms);
}
