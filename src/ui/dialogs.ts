import { button, h } from './dom';

export interface DialogButton {
  label: string;
  cls: string;
  onClick: () => void;
}

/** A cream dialog with a raised title pill (Pixel Picnic style). */
export function openDialog(root: HTMLElement, opts: { title: string; head?: string; body: (HTMLElement | string)[]; buttons: DialogButton[]; row?: boolean }): () => void {
  const overlay = h('div', { class: 'overlay' });
  const close = () => {
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 180);
  };
  const dialog = h('div', { class: 'dialog' }, h('div', { class: 'dialog-head ' + (opts.head ?? ''), text: opts.title }));
  for (const b of opts.body) dialog.append(typeof b === 'string' ? h('p', { html: b }) : b);
  const actions = h('div', { class: 'actions' + (opts.row ? ' row' : '') });
  for (const b of opts.buttons) {
    actions.append(button(b.label, b.cls, () => {
      close();
      b.onClick();
    }));
  }
  dialog.append(actions);
  overlay.append(dialog);
  root.append(overlay);
  return close;
}
