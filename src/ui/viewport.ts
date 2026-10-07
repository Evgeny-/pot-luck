/**
 * The screen frame: how much room the HUD takes on each side of the kitchen. Tall screens (a phone
 * held upright) keep the spice shelf under the board and the bowl below it; wide screens (tablets
 * on their side, laptops) move the shelf to the right and the bowl beside the board, so the board
 * can use the full height. The HUD grows a little on big screens.
 */
export interface Frame {
  wide: boolean;
  /** HUD scale: 1 on phones, up to 1.3 on big screens. */
  ui: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function frameFor(W: number, H: number): Frame {
  const wide = W >= 700 && W >= H * 1.1;
  const ui = Math.max(1, Math.min(1.3, Math.min(W / 1.3, H) / 760));
  if (wide) return { wide, ui, top: 76 * ui, bottom: 14, left: 14, right: 104 * ui };
  return { wide, ui, top: 76 * ui, bottom: 106 * ui, left: 0, right: 0 };
}

/** Keeps `data-frame` (tall | wide) and `--ui` on the app element up to date for the CSS. */
export function watchFrame(app: HTMLElement): void {
  const apply = () => {
    const f = frameFor(app.clientWidth, app.clientHeight);
    app.dataset.frame = f.wide ? 'wide' : 'tall';
    app.style.setProperty('--ui', String(Math.round(f.ui * 100) / 100));
  };
  apply();
  new ResizeObserver(apply).observe(app);
}
