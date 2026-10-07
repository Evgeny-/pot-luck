export interface SaveData {
  /** Highest level unlocked. */
  unlocked: number;
  stars: Record<number, number>;
  /** Mechanic intros already shown. */
  seen: string[];
  settings: { debug: boolean; sound: boolean };
}

const KEY = 'pot-luck-save-v1';

export function loadSave(): SaveData {
  const fresh: SaveData = { unlocked: 1, stars: {}, seen: [], settings: { debug: false, sound: true } };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh;
    const d = JSON.parse(raw) as Partial<SaveData>;
    return { ...fresh, ...d, settings: { ...fresh.settings, ...(d.settings ?? {}) } };
  } catch {
    return fresh;
  }
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function resetSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
