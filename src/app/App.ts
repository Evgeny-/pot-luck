import { audio, type MusicTheme } from '../audio/audio';
import levelsData from '../data/levels.json';
import { cuisineById, type CuisineId } from '../core/cuisines';
import { MECHANIC_LEVEL, type MechanicId } from '../core/progression';
import type { LevelDef } from '../core/types';
import { Game } from '../game/Game';
import { CLOCHE_SVG } from '../ui/cloche';
import { openDialog } from '../ui/dialogs';
import { button, emoji, h, toast } from '../ui/dom';
import { heatHtml, Hud } from '../ui/Hud';
import { setArtSet } from '../ui/iconStyle';
import { KNIFE_SVG } from '../ui/knife';
import { MECH_ICON, showMap } from '../ui/MapScreen';
import { countTo, openMarket } from '../ui/Market';
import { applyTheme } from '../ui/themes';
import { storageInfo } from '../ui/storageInfo';
import { watchFrame } from '../ui/viewport';
import { buy, equip, tipsForWin } from './economy';
import { loadSave, resetSave, writeSave, type SaveData } from './save';

const LEVELS = levelsData as unknown as LevelDef[];
/** Real level tiers, so old saves get tips for the stars they already have. */
const tierOf = (n: number) => LEVELS[n - 1]?.tier;

const INTRO: Record<string, { title: string; text: string; icon: string }> = {
  start: { title: 'Let\'s cook!', icon: 'pot-of-food', text: 'Tap a tile: it slides off the board the way its arrow points, if nothing is in its way, and lands in the pot on that side. Pots want their ingredients <b>in recipe order</b>. Press and hold a tile to see where it will go.' },
  two: { title: 'Two pots', icon: 'curry-rice', text: 'Every side of the board feeds its own pot: up goes to the top pot, down to the bottom one.' },
  bowl: { title: 'The side bowl', icon: 'bowl-with-spoon', text: 'Tap an ingredient a pot doesn\'t want yet and it waits in the <b>bowl</b>. The pot takes it the moment it\'s needed. The bowl has just <b>one spot</b>, so park only what you must. Tap the usage count beside it to see the star goals for this level.' },
  salad: { title: 'Salad bowl', icon: 'green-salad', text: 'The salad isn\'t fussy: it takes its ingredients <b>in any order</b>.' },
  bowl2: { title: 'A bigger bowl', icon: 'bowl-with-spoon', text: 'Your bowl now has <b>two spots</b>. Some kitchens will still give you only one.' },
  stacks: { title: 'Stacked tiles', icon: 'pancakes', text: 'Some tiles hide another one <b>underneath</b>. The little badge shows it and its arrow. The spot stays taken until both have left.' },
  links: { title: 'Tied together', icon: 'yarn', text: 'Ingredients tied with <b>twine</b> leave together: the one you tap goes first, then its partner, and only if both can go.' },
  lids: { title: 'Lids', icon: 'locked', text: 'A pot with a <b>lid</b> opens only after the pot pictured on the lid is served. Until then, anything sent its way goes to the bowl.' },
  cloche: { title: 'Under the cloche', icon: 'bellhop-bell', text: 'A silver <b>cloche</b> hides an ingredient. It lifts as soon as a tile next to it leaves the board.' },
  jar: { title: 'The jar', icon: 'jar', text: 'Early ingredients wait in this <b>jar</b>. The ingredient marked <b>Next</b> is the last one added. It leaves first when a recipe needs it. Tap the usage count to see the star goals.' },
  timer: { title: 'Kitchen timer', icon: 'timer-clock', text: 'This ingredient is still <b>marinating</b>. It unlocks after the number of ingredients shown on it has gone into the pots.' },
  queue: { title: 'Two dishes', icon: 'fork-and-knife-with-plate', text: 'Some pots cook <b>two dishes</b> in a row. When the first one is served, the next recipe starts.' },
  pads: { title: 'Turn pads', icon: 'clockwise-vertical-arrows', text: 'A tile that slides over a yellow <b>pad</b> turns to face the pad\'s arrow. Press and hold a tile to see its whole path.' },
  knife: { title: 'The knife', icon: 'kitchen-knife', text: 'Slide an ingredient across the <b>silver blade</b> to chop it. A small knife on a recipe marks an ingredient that needs chopping.' },
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
    watchFrame(document.getElementById('app')!);
    const q = new URLSearchParams(location.search);
    if (q.has('reset')) resetSave();
    this.save = loadSave(tierOf);
    if (q.get('debug') === '1') this.save.settings.debug = true;
    if (q.get('debug') === '0') this.save.settings.debug = false;
    this.debug = this.save.settings.debug;
    if (q.has('progress')) this.save.unlocked = Math.max(1, Number(q.get('progress')));
    if (q.has('tips')) this.save.tips = Math.max(0, Math.floor(Number(q.get('tips')) || 0));
    writeSave(this.save);
    setArtSet(this.save.artSet);
    audio.setMuted(!this.save.settings.sound);
    audio.setMusicVolume(this.save.settings.music ? 1 : 0);
    const lv = Number(q.get('level'));
    if (lv >= 1 && lv <= LEVELS.length) this.start(lv);
    else this.showMap();
    // Debug helper for tests and tinkering in the console.
    (window as unknown as { potluck: unknown }).potluck = { app: this, levels: LEVELS };
  }

  private music(theme: MusicTheme): void {
    if (this.save.settings.music) audio.startMusic(theme);
  }

  private showMap(): void {
    this.closeGame();
    this.map?.remove();
    this.map = showMap(this.ui, {
      levels: LEVELS, stars: this.save.stars, unlocked: Math.min(this.save.unlocked, LEVELS.length), debug: this.debug, sound: this.save.settings.sound,
      tips: this.save.tips,
    }, {
      play: (n) => this.start(n),
      settings: () => this.openSettings(),
      toggleSound: () => {
        this.save.settings.sound = !this.save.settings.sound;
        writeSave(this.save);
        audio.setMuted(!this.save.settings.sound);
        this.showMap();
      },
      market: () => this.openMarket(),
    });
    this.music('menu');
  }

  /** The market over the map; the map re-renders on close so its tips pill is current. */
  private openMarket(): void {
    openMarket(this.ui, {
      tips: () => this.save.tips,
      owned: () => this.save.owned,
      equipped: () => this.save.artSet,
      buy: (id) => {
        if (!buy(this.save, id)) return false;
        writeSave(this.save);
        setArtSet(this.save.artSet);
        return true;
      },
      equip: (id) => {
        if (!equip(this.save, id)) return;
        writeSave(this.save);
        setArtSet(this.save.artSet);
      },
      onClose: () => this.showMap(),
    });
  }

  private openSettings(): void {
    const s = this.save.settings;
    const row = (label: string, on: boolean, fn: () => void) => {
      const b = button(on ? 'On' : 'Off', on ? 'green small' : 'paper small', () => {
        fn();
        writeSave(this.save);
        close();
        this.openSettings();
      });
      return h('div', { class: 'setting-row' }, h('span', { text: label }), b);
    };
    const close = openDialog(this.ui, {
      title: 'Settings',
      head: 'teal',
      body: [
        row('Sound', s.sound, () => { s.sound = !s.sound; audio.setMuted(!s.sound); }),
        row('Music', s.music, () => { s.music = !s.music; audio.setMusicVolume(s.music ? 1 : 0); if (s.music) audio.startMusic('menu'); else audio.stopMusic(0.3); }),
        row('Debug mode', s.debug, () => { s.debug = !s.debug; this.debug = s.debug; }),
      ],
      buttons: [
        { label: 'Done', cls: 'green', onClick: () => this.showMap() },
        { label: 'Reset progress', cls: 'paper small', onClick: () => { resetSave(); this.save = loadSave(tierOf); setArtSet(this.save.artSet); this.showMap(); } },
      ],
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
    const cuisine = cuisineById(level.cuisine);
    applyTheme(document.getElementById('app')!, cuisine.id as CuisineId);
    const url = new URL(location.href);
    url.searchParams.set('level', String(n));
    history.replaceState(null, '', url);
    this.game = new Game(this.stage, level, {
      won: (stars, parks) => this.won(level, stars, parks),
      stuck: () => this.stuck(),
      changed: () => this.refresh(),
      say: (t) => toast(this.ui, t),
      bowlInfo: (uses) => storageInfo(this.ui, level, uses),
    });
    this.hud = new Hud(this.ui, n, level.tier ?? 'normal', `${cuisine.name.en} · ${cuisine.place.en}`, {
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
      this.hud.setDebug(`d ${s.d.toFixed(2)} · rnd ${pct(s.random)} · gr ${pct(s.greedy)} · think ${pct(s.planner)} · crit ${s.critical}/${s.decisions} · par ${s.par} · ${(level.mechanics ?? []).join('+') || (level.tags ?? [])[0] || ''}`);
    }
    this.refresh();
    this.music(cuisine.id as MusicTheme);
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
        head: 'teal',
        body: [h('div', { class: 'mech-art', html: k === 'cloche' ? `<span style="width:84px;height:68px;display:block">${CLOCHE_SVG}</span>` : k === 'knife' ? `<span class="knife-art">${KNIFE_SVG}</span>` : emoji(MECH_ICON[k] ?? info.icon, 78) }), info.text],
        buttons: [{ label: 'Got it', cls: 'green', onClick: () => {
          this.save.seen.push(k);
          writeSave(this.save);
          show(i + 1);
        } }],
      });
      audio.play('newMechanic');
    };
    show(0);
  }

  private tierBanner(level: LevelDef): void {
    if (level.tier !== 'hard' && level.tier !== 'superhard') return;
    const chilis = heatHtml(level.tier, 34);
    const b = h('div', { class: `banner ${level.tier}`, html: `${chilis}${level.tier === 'hard' ? 'Spicy level' : 'Extra spicy!'}` });
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
    const prevStars = this.save.stars[n] ?? 0;
    const earned = tipsForWin(level.tier, prevStars, stars);
    this.save.stars[n] = Math.max(prevStars, stars);
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, n + 1));
    this.save.tips += earned;
    writeSave(this.save);
    audio.duck(0.3, 2.5);
    const par = level.stats?.par ?? 0;
    const starsEl = h('div', { class: 'stars', html: [1, 2, 3].map(() => emoji('star', 0, 'star')).join('') });
    const tipsEl = h('div', { class: 'tips-gain', html: `<span class="tips-chip">${emoji('coin')}<b>+0</b><small>tips</small></span>` });
    const bowlWord = level.rules.bowlOrder === 'lifo' ? 'jar' : 'bowl';
    const note = parks <= par
      ? (par === 0 ? `Perfect: you never needed the ${bowlWord}!` : `Perfect cook: ${parks} ${bowlWord} use${parks === 1 ? '' : 's'}, the fewest possible.`)
      : `You used the ${bowlWord} ${parks} time${parks === 1 ? '' : 's'}. A perfect cook needs only ${par}.`;
    openDialog(this.ui, {
      title: stars === 3 ? 'Delicious!' : stars === 2 ? 'Tasty!' : 'Served!',
      head: 'green',
      body: [starsEl, ...(earned ? [tipsEl] : []), `<span class="subtle">${note}</span>`],
      buttons: [
        ...(n < LEVELS.length ? [{ label: 'Next level', cls: 'green', onClick: () => this.start(n + 1) }] : []),
        { label: 'Replay', cls: 'paper', onClick: () => this.start(n) },
        { label: 'Map', cls: 'paper', onClick: () => this.showMap() },
      ],
    });
    starsEl.querySelectorAll('.star').forEach((s, i) => {
      if (i < stars) setTimeout(() => {
        s.classList.add('on');
        audio.play('star', { pitch: 1 + i * 0.12 });
      }, 350 + i * 330);
    });
    // Tips pop in once the stars have landed, then count up.
    if (earned) setTimeout(() => {
      tipsEl.classList.add('on');
      countTo(tipsEl.querySelector('b')!, 0, earned, 600, '+');
    }, 350 + stars * 330 + 150);
  }

  private stuck(): void {
    audio.play('stuck');
    openDialog(this.ui, {
      title: 'Kitchen jam!',
      body: ['No tile can move. Undo a few steps or start over. There\'s always a way.'],
      buttons: [
        { label: 'Undo', cls: 'green', onClick: () => this.game?.undo() },
        { label: 'Restart', cls: 'paper', onClick: () => this.game?.restart() },
      ],
    });
  }
}
