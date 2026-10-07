import { audio } from '../audio/audio';
import levelsData from '../data/levels.json';
import { MECHANIC_LEVEL, type MechanicId } from '../core/progression';
import type { LevelDef } from '../core/types';
import { Game } from '../game/Game';
import { openDialog } from '../ui/dialogs';
import { emoji, h, toast } from '../ui/dom';
import { Hud } from '../ui/Hud';
import { MECH_ICON, showMap } from '../ui/MapScreen';
import { loadSave, resetSave, writeSave, type SaveData } from './save';

const LEVELS = levelsData as unknown as LevelDef[];

const INTRO: Record<string, { title: string; text: string; icon: string }> = {
  start: { title: 'Let\'s cook!', icon: 'pot-of-food', text: 'Tap a tile: it slides off the board the way its arrow points — if nothing is in its lane. The pot on that side wants its ingredients <b>in recipe order</b>. Press and hold to see where a tile will go.' },
  two: { title: 'Two pots', icon: 'curry-rice', text: 'Every side of the board feeds its own pot. Up goes to the top pot, down to the bottom one.' },
  bowl: { title: 'The side bowl', icon: 'bowl-with-spoon', text: 'Tap an ingredient the pot doesn\'t want yet and it waits in the <b>bowl</b>; a pot takes it from there the moment it\'s needed. The bowl has only a few spots — park only what you must! Fewer bowl uses = more stars.' },
  salad: { title: 'Salad bowl', icon: 'green-salad', text: 'The salad isn\'t fussy: it takes its ingredients <b>in any order</b>.' },
  stacks: { title: 'Stacked tiles', icon: 'pancakes', text: 'Some tiles hide another one <b>underneath</b> — the little badge shows it and its arrow. The spot stays taken until both have left.' },
  lids: { title: 'Lids', icon: 'locked', text: 'A pot with a <b>lid</b> opens only after the pot pictured on the lid is served. Until then, anything sent its way goes to the bowl.' },
  queue: { title: 'Two dishes', icon: 'fork-and-knife-with-plate', text: 'Some pots cook <b>two dishes</b> in a row. When the first one is served, the next recipe starts.' },
  skewer: { title: 'The skewer', icon: 'oden', text: 'This kitchen has a <b>skewer</b> instead of a bowl: only the <b>last</b> ingredient you put on can come off. Mind the order!' },
  pads: { title: 'Turn pads', icon: 'clockwise-vertical-arrows', text: 'A tile that slides over a yellow <b>pad</b> turns to face the pad\'s arrow. Press and hold a tile to see its whole path.' },
  knife: { title: 'Knife bar', icon: 'kitchen-knife', text: 'Anything that slides across the <b>knife</b> arrives chopped. Recipes mark chopped ingredients with a little knife.' },
  frozen: { title: 'Frozen tiles', icon: 'snowflake', text: 'A <b>frozen</b> tile can\'t move until a tile next to it has left.' },
};

export class App {
  private save: SaveData;
  private stage: HTMLElement;
  private ui: HTMLElement;
  private game: Game | null = null;
  private hud: Hud | null = null;
  private map: HTMLElement | null = null;
  private debug: boolean;

  constructor(stage: HTMLElement, ui: HTMLElement) {
    this.stage = stage;
    this.ui = ui;
    const q = new URLSearchParams(location.search);
    if (q.has('reset')) resetSave();
    this.save = loadSave();
    if (q.get('debug') === '1') this.save.settings.debug = true;
    if (q.get('debug') === '0') this.save.settings.debug = false;
    this.debug = this.save.settings.debug;
    if (q.has('progress')) this.save.unlocked = Math.max(1, Number(q.get('progress')));
    writeSave(this.save);
    const lv = Number(q.get('level'));
    if (lv >= 1 && lv <= LEVELS.length) this.start(lv);
    else this.showMap();
    // Debug helper for tests and tinkering in the console.
    (window as unknown as { potluck: unknown }).potluck = { app: this, levels: LEVELS };
  }

  private showMap(): void {
    this.closeGame();
    this.map?.remove();
    this.map = showMap(this.ui, LEVELS, this.save.stars, this.save.unlocked, this.debug, {
      play: (n) => this.start(n),
      reset: () => {
        resetSave();
        this.save = loadSave();
        this.showMap();
      },
      toggleDebug: () => {
        this.debug = !this.debug;
        this.save.settings.debug = this.debug;
        writeSave(this.save);
        this.showMap();
      },
    });
  }

  private closeGame(): void {
    this.game?.dispose();
    this.game = null;
    this.hud?.destroy();
    this.hud = null;
  }

  private start(n: number): void {
    this.map?.remove();
    this.map = null;
    this.closeGame();
    const level = LEVELS[n - 1];
    const url = new URL(location.href);
    url.searchParams.set('level', String(n));
    history.replaceState(null, '', url);
    this.game = new Game(this.stage, level, {
      won: (stars, parks) => this.won(level, stars, parks),
      stuck: () => this.stuck(),
      changed: () => this.refresh(),
      say: (t) => toast(this.ui, t),
    });
    this.hud = new Hud(this.ui, n, level.tier ?? 'normal', {
      home: () => {
        url.searchParams.delete('level');
        history.replaceState(null, '', url);
        this.showMap();
      },
      undo: () => this.game?.undo(),
      hint: () => this.game?.hint(),
      restart: () => this.game?.restart(),
      debug: this.debug ? () => this.game?.autoSolve() : undefined,
    });
    if (this.debug && level.stats) {
      const s = level.stats;
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      this.hud.setDebug(`d ${s.d.toFixed(2)} · rnd ${pct(s.random)} · cas ${pct(s.casual)} · greedy ${pct(s.greedy)} · plan ${pct(s.planner)} · crit ${s.critical}/${s.decisions} · par ${s.par} · ${(level.mechanics ?? []).join('+') || (level.tags ?? [])[0] || ''}`);
    }
    this.refresh();
    this.intros(level);
  }

  private intros(level: LevelDef): void {
    const keys: string[] = [];
    if (level.n === 1) keys.push('start');
    if (level.n === 2) keys.push('two');
    for (const m of Object.keys(MECHANIC_LEVEL) as MechanicId[]) if (MECHANIC_LEVEL[m] === level.n) keys.push(m);
    const show = (i: number) => {
      if (i >= keys.length) {
        this.tierBanner(level);
        return;
      }
      const k = keys[i];
      const info = INTRO[k];
      if (!info || this.save.seen.includes(k)) return show(i + 1);
      openDialog(this.ui, {
        title: info.title,
        head: 'green',
        body: [h('div', { class: 'mech-art', html: emoji(MECH_ICON[k] ?? info.icon, 84) }), info.text],
        buttons: [{ label: 'Got it', cls: 'green', onClick: () => {
          this.save.seen.push(k);
          writeSave(this.save);
          show(i + 1);
        } }],
      });
      audio.play('unlock');
    };
    show(0);
  }

  private tierBanner(level: LevelDef): void {
    if (level.tier !== 'hard' && level.tier !== 'superhard') return;
    const b = h('div', { class: `banner ${level.tier}`, text: level.tier === 'hard' ? 'Hard level' : 'Super hard!' });
    this.ui.append(b);
    setTimeout(() => b.remove(), 2200);
  }

  private refresh(): void {
    if (!this.game || !this.hud) return;
    this.hud.setProgress(this.game.sim.progress());
    this.hud.setUndo(this.game.canUndo);
  }

  private won(level: LevelDef, stars: number, parks: number): void {
    const n = level.n;
    this.save.stars[n] = Math.max(this.save.stars[n] ?? 0, stars);
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, n + 1));
    writeSave(this.save);
    const par = level.stats?.par ?? 0;
    const starsEl = h('div', { class: 'stars', html: [1, 2, 3].map(() => emoji('star', 0, 'star')).join('') });
    const note = parks <= par
      ? (par === 0 ? 'Perfect — you never needed the bowl!' : `Perfect cook: ${parks} bowl use${parks === 1 ? '' : 's'}, the fewest possible.`)
      : `You used the bowl ${parks} time${parks === 1 ? '' : 's'}. A perfect cook needs only ${par}.`;
    openDialog(this.ui, {
      title: stars === 3 ? 'Delicious!' : stars === 2 ? 'Tasty!' : 'Served!',
      head: 'green',
      body: [starsEl, `<span class="subtle">${note}</span>`],
      buttons: [
        ...(n < LEVELS.length ? [{ label: 'Next level', cls: 'green', onClick: () => this.start(n + 1) }] : []),
        { label: 'Replay', cls: 'white', onClick: () => this.start(n) },
        { label: 'Map', cls: 'white', onClick: () => this.showMap() },
      ],
    });
    starsEl.querySelectorAll('.star').forEach((s, i) => {
      if (i < stars) setTimeout(() => {
        s.classList.add('on');
        audio.play('star', { pitch: 1 + i * 0.12 });
      }, 350 + i * 330);
    });
  }

  private stuck(): void {
    audio.play('lose');
    openDialog(this.ui, {
      title: 'Kitchen jam!',
      head: 'red',
      body: ['No tile can move. Undo a few steps or start over — there\'s always a way.'],
      buttons: [
        { label: 'Undo', cls: 'green', onClick: () => this.game?.undo() },
        { label: 'Restart', cls: 'white', onClick: () => this.game?.restart() },
      ],
    });
  }
}
