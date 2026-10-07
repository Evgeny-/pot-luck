import type { CuisineId } from '../core/cuisines';

/**
 * Hand-drawn map scenery, as inline SVG: a flag for every cuisine's sign, two illustrations per
 * region (the restaurant you visit and a landmark), and a garland strung across the region. All
 * share one drawing language: a warm brown outline, flat fills, a soft shadow on the ground.
 * Moving parts carry a class (sway, spin, neon, kite) that map.css animates.
 */

const O = '#5b3a24';
const S = `stroke="${O}" stroke-width="2.5" stroke-linejoin="round"`;
const S2 = `stroke="${O}" stroke-width="1.8" stroke-linejoin="round"`;
const FONT = `font-family="'Baloo 2 Variable','Baloo 2',system-ui,sans-serif" font-weight="800"`;

export interface Art {
  svg: string;
  w: number;
  h: number;
}

const art = (w: number, h: number, body: string): Art => ({
  w,
  h,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`,
});

const shadow = (cx: number, cy: number, rx: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * 0.09}" fill="rgba(60,35,15,.18)"/>`;

/** Semicircles hanging under a straight edge (awnings, roof tiles). */
function scallops(x0: number, x1: number, y: number, n: number, fills: string[]): string {
  const w = (x1 - x0) / n;
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = x0 + i * w;
    s += `<path d="M${x} ${y} a${w / 2} ${w / 2} 0 0 0 ${w} 0 Z" fill="${fills[i % fills.length]}" ${S2}/>`;
  }
  return s;
}

/** A striped trapezoid (an awning or a canopy): top edge x0..x1 at y0, bottom edge x2..x3 at y1. */
function stripes(x0: number, x1: number, y0: number, x2: number, x3: number, y1: number, n: number, fills: string[]): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const b = (i + 1) / n;
    const tx = (t: number) => x0 + (x1 - x0) * t;
    const bx = (t: number) => x2 + (x3 - x2) * t;
    s += `<path d="M${tx(a)} ${y0} L${tx(b)} ${y0} L${bx(b)} ${y1} L${bx(a)} ${y1} Z" fill="${fills[i % fills.length]}"/>`;
  }
  return s + `<path d="M${x0} ${y0} L${x1} ${y0} L${x3} ${y1} L${x2} ${y1} Z" fill="none" ${S}/>`;
}

/** A grid of little windows. */
function windows(x: number, y: number, cols: number, rows: number, dx: number, dy: number, w: number, hh: number, lit: number): string {
  let s = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const on = (r * 7 + c * 3 + lit) % 5 < 2;
    s += `<rect x="${x + c * dx}" y="${y + r * dy}" width="${w}" height="${hh}" rx="1.5" fill="${on ? '#ffe28a' : '#e4ecf7'}"/>`;
  }
  return s;
}

/** A paper lantern hanging from (x, y); `round` is the Chinese shape, else the Japanese one. */
function lantern(x: number, y: number, round: boolean, r = 12): string {
  const cy = y + 8 + r;
  const body = round
    ? `<circle cx="${x}" cy="${cy}" r="${r}" fill="#e2483c" ${S2}/><path d="M${x - r * 0.55} ${cy - r * 0.8} Q${x - r * 0.9} ${cy} ${x - r * 0.55} ${cy + r * 0.8} M${x + r * 0.55} ${cy - r * 0.8} Q${x + r * 0.9} ${cy} ${x + r * 0.55} ${cy + r * 0.8}" fill="none" stroke="#b8302a" stroke-width="1.4"/>`
    : `<ellipse cx="${x}" cy="${cy}" rx="${r * 0.85}" ry="${r}" fill="#e2483c" ${S2}/><path d="M${x - r * 0.8} ${cy - r * 0.35} H${x + r * 0.8} M${x - r * 0.85} ${cy + r * 0.3} H${x + r * 0.85}" stroke="#b8302a" stroke-width="1.3"/>`;
  return `<g class="sway" style="transform-origin:${x}px ${y}px"><path d="M${x} ${y} V${y + 8}" stroke="${O}" stroke-width="1.5"/>` +
    `<rect x="${x - r * 0.5}" y="${y + 6}" width="${r}" height="4" rx="1" fill="${round ? '#d4a72c' : '#2b2b2b'}"/>${body}` +
    `<rect x="${x - r * 0.5}" y="${cy + r - 2}" width="${r}" height="4" rx="1" fill="${round ? '#d4a72c' : '#2b2b2b'}"/>` +
    `<path d="M${x} ${cy + r + 2} V${cy + r + 10}" stroke="${round ? '#d4a72c' : '#ffc23d'}" stroke-width="2.2" stroke-linecap="round"/></g>`;
}

// ------------------------------------------------------------------ Italy

const trattoria = (): Art => {
  const win = (x: number) =>
    `<rect x="${x - 10}" y="98" width="10" height="30" rx="2" fill="#4f8f55" ${S2}/><rect x="${x + 30}" y="98" width="10" height="30" rx="2" fill="#4f8f55" ${S2}/>` +
    `<rect x="${x}" y="98" width="30" height="30" rx="3" fill="#9fd0ec" ${S}/><path d="M${x + 15} 98 V128 M${x} 113 H${x + 30}" stroke="${O}" stroke-width="1.8"/>` +
    `<path d="M${x + 3} 102 l8 8" stroke="#fff" stroke-width="2" opacity=".7"/>` +
    `<circle cx="${x + 2}" cy="126" r="4.5" fill="#ee5a3c" ${S2}/><circle cx="${x + 11}" cy="124" r="4.5" fill="#ff9fbf" ${S2}/><circle cx="${x + 20}" cy="126" r="4.5" fill="#ffc23d" ${S2}/><circle cx="${x + 29}" cy="124" r="4.5" fill="#ee5a3c" ${S2}/>` +
    `<rect x="${x - 5}" y="128" width="40" height="8" rx="2" fill="#b0703f" ${S2}/>`;
  return art(220, 200,
    shadow(110, 190, 104) +
    `<rect x="150" y="18" width="16" height="28" fill="#e9b88a" ${S}/><rect x="146" y="14" width="24" height="7" rx="2" fill="#c96a45" ${S2}/>` +
    `<rect x="30" y="58" width="160" height="130" rx="4" fill="#f4d9a8" ${S}/>` +
    `<path d="M40 150 h16 v9 h-16z M160 74 h18 v8 h-18z M170 160 h12 v8 h-12z" fill="#f9e7c6"/>` +
    `<path d="M14 64 L38 36 H182 L206 64 Z" fill="#df6d43" ${S}/><path d="M26 50 H194" stroke="#b9512d" stroke-width="2"/>` +
    scallops(14, 206, 64, 16, ['#cf5d36', '#e57a4f']) +
    `<rect x="64" y="72" width="92" height="20" rx="5" fill="#3e6b46" ${S}/><text x="110" y="87" text-anchor="middle" font-size="12.5" fill="#fff6e0" letter-spacing="1" ${FONT}>TRATTORIA</text>` +
    win(46) + win(144) +
    stripes(82, 138, 138, 72, 148, 156, 6, ['#e2543f', '#fff8ee']) + scallops(72, 148, 156, 6, ['#e2543f', '#fff8ee']) +
    `<path d="M92 188 V166 Q110 152 128 166 V188 Z" fill="#7a4526" ${S}/><path d="M110 156 V188" stroke="${O}" stroke-width="1.6"/><circle cx="104" cy="176" r="2" fill="#ffd36b"/><circle cx="116" cy="176" r="2" fill="#ffd36b"/>` +
    `<path d="M14 190 L24 158 M50 190 L40 158" stroke="#7a4a24" stroke-width="3.5" stroke-linecap="round"/>` +
    `<rect x="16" y="150" width="32" height="26" rx="3" fill="#3b3f3a" ${S}/><text x="32" y="162" text-anchor="middle" font-size="7.5" fill="#fff" ${FONT}>MENU</text><path d="M22 168 h20 M22 172 h14" stroke="#fff" stroke-width="1.2" opacity=".7"/>` +
    `<path d="M176 190 l3 -16 h20 l3 16 z" fill="#c9683c" ${S}/><rect x="187" y="150" width="4" height="24" fill="#7a4a24"/>` +
    `<circle cx="189" cy="142" r="16" fill="#5aa04a" ${S}/><circle cx="183" cy="138" r="3.2" fill="#ffe14a" ${S2}/><circle cx="195" cy="146" r="3.2" fill="#ffe14a" ${S2}/><circle cx="190" cy="132" r="3.2" fill="#ffe14a" ${S2}/>`,
  );
};

const pisa = (): Art => {
  let tower = `<rect x="76" y="62" width="48" height="140" rx="3" fill="#f7f1e3" ${S}/>`;
  for (let y = 70; y < 196; y += 21) {
    for (let k = 0; k < 4; k++) tower += `<path d="M${79 + k * 11.5} ${y + 15} v-8 a4 4 0 0 1 8 0 v8 Z" fill="#dacdb2" stroke="${O}" stroke-width="1.3"/>`;
    tower += `<path d="M76 ${y + 17} H124" stroke="${O}" stroke-width="1.6"/>`;
  }
  tower += `<rect x="84" y="42" width="32" height="22" rx="2" fill="#f7f1e3" ${S}/><path d="M89 60 v-7 a4 4 0 0 1 8 0 v7 M103 60 v-7 a4 4 0 0 1 8 0 v7" fill="#dacdb2" stroke="${O}" stroke-width="1.3"/>` +
    `<path d="M82 44 Q100 26 118 44 Z" fill="#e8dcc2" ${S}/><path d="M100 30 V18" stroke="${O}" stroke-width="2"/><path d="M100 18 l12 4 l-12 4 Z" fill="#e2543f" stroke="${O}" stroke-width="1.4"/>`;
  const cypress = (x: number, hh: number) =>
    `<path d="M${x} 206 v-8" stroke="#6b4a2e" stroke-width="3"/><path d="M${x} ${200 - hh} Q${x + 10} ${200 - hh * 0.5} ${x + 7} 200 H${x - 7} Q${x - 10} ${200 - hh * 0.5} ${x} ${200 - hh} Z" fill="#3f7d3d" ${S}/>`;
  return art(200, 220,
    shadow(100, 212, 96) +
    `<path d="M0 212 Q46 158 104 180 Q156 198 200 164 V220 H0 Z" fill="#b5d67c" ${S}/>` +
    `<path d="M20 196 q30 -14 60 -6 M130 188 q24 -6 50 -18" stroke="#93bb5e" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<g transform="rotate(5 100 202)">${tower}</g>` +
    cypress(26, 62) + cypress(44, 46) + cypress(170, 58) + cypress(186, 40),
  );
};

// ------------------------------------------------------------------ Japan

const izakaya = (): Art => {
  const lattice = (x: number) => {
    let s = `<rect x="${x}" y="100" width="34" height="36" fill="#f7ecd2" ${S2}/>`;
    for (let i = 1; i < 3; i++) s += `<path d="M${x + (34 * i) / 3} 100 V136" stroke="#8a6a44" stroke-width="1.3"/>`;
    for (let i = 1; i < 4; i++) s += `<path d="M${x} ${100 + (36 * i) / 4} H${x + 34}" stroke="#8a6a44" stroke-width="1.3"/>`;
    return s;
  };
  return art(220, 200,
    shadow(110, 190, 104) +
    `<rect x="34" y="88" width="152" height="100" fill="#efdcb5" ${S}/>` +
    `<path d="M34 88 h8 v100 h-8z M178 88 h8 v100 h-8z M80 88 h6 v100 h-6z M134 88 h6 v100 h-6z" fill="#6b4a2e"/><rect x="34" y="88" width="152" height="8" fill="#6b4a2e"/>` +
    lattice(44) + lattice(144) +
    `<rect x="88" y="124" width="44" height="64" fill="#c99a5e" ${S}/><path d="M110 124 V188 M88 146 H132 M88 166 H132" stroke="#8a6a44" stroke-width="1.5"/>` +
    `<path d="M88 98 h13 v30 h-13z M103.5 98 h13 v30 h-13z M119 98 h13 v30 h-13z" fill="#2f4f8f" ${S2}/><circle cx="110" cy="110" r="5" fill="none" stroke="#fff" stroke-width="2"/>` +
    `<path d="M8 94 Q40 86 56 60 H164 Q180 86 212 94 Q188 100 160 93 H60 Q32 100 8 94 Z" fill="#46526b" ${S}/>` +
    `<path d="M70 66 v24 M88 66 v24 M106 66 v24 M124 66 v24 M142 66 v24" stroke="#36405a" stroke-width="2"/>` +
    `<rect x="50" y="50" width="120" height="12" rx="6" fill="#323b4e" ${S}/><circle cx="52" cy="56" r="5" fill="#323b4e" ${S2}/><circle cx="168" cy="56" r="5" fill="#323b4e" ${S2}/>` +
    lantern(22, 92, false) + lantern(198, 92, false) +
    `<rect x="190" y="150" width="7" height="40" rx="3" fill="#7cbf5a" ${S2}/><rect x="200" y="140" width="7" height="50" rx="3" fill="#8fd06a" ${S2}/><path d="M190 164 h7 M200 156 h7 M200 172 h7" stroke="${O}" stroke-width="1.3"/>`,
  );
};

const fuji = (): Art =>
  art(200, 220,
    shadow(100, 212, 96) +
    `<path d="M0 204 L84 80 Q100 64 116 80 L200 204 Z" fill="#8ea3d1" ${S}/>` +
    `<path d="M66 106 L84 80 Q100 64 116 80 L134 106 Q126 100 118 108 Q110 98 100 108 Q90 98 82 108 Q74 100 66 106 Z" fill="#fff" stroke="${O}" stroke-width="2"/>` +
    `<path d="M0 200 Q100 186 200 200 V220 H0 Z" fill="#bcdb90" ${S}/>` +
    `<rect x="56" y="122" width="10" height="86" fill="#e2483c" ${S}/><rect x="124" y="122" width="10" height="86" fill="#e2483c" ${S}/>` +
    `<rect x="46" y="136" width="98" height="9" fill="#e2483c" ${S}/><rect x="90" y="124" width="10" height="12" fill="#e2483c" ${S2}/>` +
    `<path d="M32 112 Q95 104 158 112 L160 121 Q95 114 30 121 Z" fill="#2b2b2b" ${S}/><path d="M38 121 Q95 116 152 121 V128 H38 Z" fill="#e2483c" ${S}/>` +
    `<path d="M174 210 Q168 176 178 146 M174 176 Q162 164 150 158" stroke="#6b4a2e" stroke-width="6" fill="none" stroke-linecap="round"/>` +
    `<circle cx="178" cy="132" r="17" fill="#ffc6d8" ${S2}/><circle cx="154" cy="146" r="14" fill="#ffb7cf" ${S2}/><circle cx="194" cy="150" r="12" fill="#ffc6d8" ${S2}/><circle cx="164" cy="122" r="12" fill="#ffd3e2" ${S2}/>` +
    `<circle cx="172" cy="128" r="2.5" fill="#ff8fb4"/><circle cx="184" cy="138" r="2.5" fill="#ff8fb4"/><circle cx="156" cy="144" r="2.5" fill="#ff8fb4"/><circle cx="192" cy="152" r="2.5" fill="#ff8fb4"/>`,
  );

// ------------------------------------------------------------------ Mexico

const cantina = (): Art => {
  let tiles = '';
  for (let x = 36; x < 180; x += 12) {
    const blue = ((x - 36) / 12) % 2 === 0;
    tiles += `<rect x="${x}" y="76" width="11" height="11" fill="${blue ? '#2f6fc4' : '#fff8ee'}" stroke="#1d4a8a" stroke-width="1"/><circle cx="${x + 5.5}" cy="81.5" r="2" fill="${blue ? '#ffc23d' : '#2f6fc4'}"/>`;
  }
  const win = (x: number) =>
    `<path d="M${x} 140 V116 Q${x + 14} 98 ${x + 28} 116 V140 Z" fill="#9fd0ec" ${S}/><path d="M${x + 14} 104 V140 M${x} 124 H${x + 28}" stroke="#2f6fc4" stroke-width="2"/>` +
    `<rect x="${x - 3}" y="140" width="34" height="8" rx="2" fill="#2f6fc4" ${S2}/><circle cx="${x + 5}" cy="138" r="4" fill="#ee3a5a" ${S2}/><circle cx="${x + 14}" cy="136" r="4" fill="#ffc23d" ${S2}/><circle cx="${x + 23}" cy="138" r="4" fill="#ee3a5a" ${S2}/>`;
  return art(220, 200,
    shadow(110, 190, 104) +
    `<path d="M26 188 V72 Q26 66 32 66 H68 Q72 40 110 36 Q148 40 152 66 H188 Q194 66 194 72 V188 Z" fill="#f4a785" ${S}/>` +
    `<path d="M40 100 h14 v8 h-14z M170 96 h12 v8 h-12z M150 164 h16 v8 h-16z" fill="#f7bba0"/>` +
    tiles + `<path d="M34 76 H186 V87 H34 Z" fill="none" stroke="${O}" stroke-width="1.8"/>` +
    `<text x="110" y="62" text-anchor="middle" font-size="14" fill="#2f6fc4" letter-spacing="1" ${FONT}>CANTINA</text>` +
    win(40) + win(152) +
    `<path d="M86 188 V136 Q110 108 134 136 V188 Z" fill="#5a3320" ${S}/>` +
    `<rect x="90" y="146" width="19" height="28" rx="2" fill="#d08a45" ${S2}/><rect x="111" y="146" width="19" height="28" rx="2" fill="#d08a45" ${S2}/><path d="M90 153 h19 M90 160 h19 M90 167 h19 M111 153 h19 M111 160 h19 M111 167 h19" stroke="#9a5a26" stroke-width="1.2"/>` +
    `<path d="M4 190 l3 -14 h20 l3 14 z" fill="#e07a4a" ${S}/><path d="M17 176 V140 Q17 132 23 132 Q29 132 29 140 V176" fill="#5a9e4e" ${S}/><path d="M17 160 H11 Q6 160 6 154 V146 Q6 141 10 141 Q14 141 14 146 V152 H17" fill="#5a9e4e" ${S2}/>` +
    `<path d="M196 190 l3 -12 h16 l3 12 z" fill="#e07a4a" ${S}/><path d="M207 178 q-10 -12 -6 -22 q8 6 6 22 q4 -14 12 -18 q2 12 -12 18" fill="#7fb07a" ${S2}/>`,
  );
};

const desert = (): Art => {
  let rays = '';
  for (let k = 0; k < 10; k++) rays += `<path d="M150 22 l5 12 h-10 Z" fill="#ffb02e" transform="rotate(${k * 36} 150 58)"/>`;
  return art(200, 220,
    shadow(100, 212, 96) +
    `<g class="spin" style="transform-origin:150px 58px">${rays}</g><circle cx="150" cy="58" r="21" fill="#ffc23d" ${S}/>` +
    `<path d="M-4 204 L18 132 Q21 126 28 126 H72 Q79 126 81 132 L98 204 Z" fill="#e08a50" ${S}/><path d="M12 152 H86 M8 170 H90" stroke="#c96d3c" stroke-width="2.5"/>` +
    `<path d="M82 204 L100 160 Q102 154 108 154 H148 Q154 154 156 160 L176 204 Z" fill="#cf7240" ${S}/><path d="M96 178 H162" stroke="#b25a2e" stroke-width="2.5"/>` +
    `<path d="M0 200 Q100 190 200 202 V220 H0 Z" fill="#f2cf92" ${S}/>` +
    `<path d="M148 208 V132 Q148 122 158 122 Q168 122 168 132 V208" fill="#5a9e4e" ${S}/><path d="M154 132 V204 M162 132 V204" stroke="#47803d" stroke-width="1.6"/>` +
    `<path d="M148 172 H140 Q133 172 133 165 V150 Q133 144 139 144 Q145 144 145 150 V162 H148" fill="#5a9e4e" ${S}/>` +
    `<path d="M168 160 H175 Q182 160 182 153 V140 Q182 134 176 134 Q170 134 170 140 V150 H168" fill="#5a9e4e" ${S}/>` +
    `<path d="M28 208 L18 184 L32 198 L34 174 L42 198 L54 180 L48 208 Z" fill="#7fb07a" ${S2}/>`,
  );
};

// ------------------------------------------------------------------ USA

const diner = (): Art => {
  let checker = '';
  for (let x = 24, i = 0; x < 196; x += 8, i++) checker += `<rect x="${x}" y="166" width="8" height="8" fill="${i % 2 ? '#2b2f3a' : '#fff'}"/>`;
  let wins = '';
  for (const x of [30, 60, 132, 162]) {
    wins += `<rect x="${x}" y="96" width="26" height="30" rx="5" fill="#9fdcef" ${S2}/><path d="M${x} 96 h26 v7 q-6.5 5 -13 0 q-6.5 5 -13 0 Z" fill="#ff8a7a" stroke="${O}" stroke-width="1.2"/>`;
  }
  let bulbs = '';
  for (let x = 56; x <= 164; x += 12) bulbs += `<circle cx="${x}" cy="28" r="2.4" fill="#ffe9a8"/><circle cx="${x}" cy="66" r="2.4" fill="#ffe9a8"/>`;
  return art(220, 200,
    shadow(110, 190, 104) +
    `<rect x="70" y="62" width="6" height="26" fill="#8a96a6" ${S2}/><rect x="144" y="62" width="6" height="26" fill="#8a96a6" ${S2}/>` +
    `<rect x="46" y="22" width="128" height="50" rx="14" fill="#2b2f3a" ${S}/>${bulbs}` +
    `<text class="neon" x="110" y="58" text-anchor="middle" font-size="27" fill="#ff6a5f" stroke="#ffd2cc" stroke-width="0.9" ${FONT}>DINER</text>` +
    `<rect x="14" y="84" width="192" height="98" rx="28" fill="#f4f6f9" ${S}/>` +
    `<rect x="14" y="132" width="192" height="13" fill="#e0453b"/><path d="M14 132 H206 M14 145 H206" stroke="${O}" stroke-width="1.8"/>` +
    `<path d="M22 152 H198 M22 158 H198" stroke="#b9c3cf" stroke-width="2.2"/>` + checker +
    wins +
    `<rect x="96" y="92" width="28" height="86" rx="5" fill="#dfe8ee" ${S}/><circle cx="110" cy="112" r="8" fill="#9fdcef" stroke="${O}" stroke-width="2"/><rect x="117" y="134" width="3" height="12" rx="1.5" fill="#8a96a6"/>` +
    `<rect x="64" y="104" width="22" height="12" rx="3" fill="#e0453b" stroke="${O}" stroke-width="1.2"/><text x="75" y="113" text-anchor="middle" font-size="7" fill="#fff" ${FONT}>OPEN</text>` +
    `<rect x="18" y="178" width="184" height="9" rx="3" fill="#b9c3cf" ${S}/>`,
  );
};

const skyline = (): Art =>
  art(200, 220,
    shadow(100, 212, 96) +
    `<rect x="8" y="124" width="40" height="84" fill="#a6b8dc" ${S}/>${windows(14, 132, 4, 8, 8, 9, 5, 5, 1)}` +
    `<path d="M56 74 V60 H70 V74" fill="#7f95c2" ${S}/><path d="M63 60 V36" stroke="${O}" stroke-width="2.2"/><circle cx="63" cy="35" r="2" fill="#e0453b"/>` +
    `<rect x="46" y="74" width="34" height="134" fill="#7f95c2" ${S}/>${windows(51, 82, 3, 13, 9, 9.5, 5, 5, 3)}` +
    `<path d="M92 104 L96 82 M108 104 L104 82" stroke="${O}" stroke-width="2"/><rect x="88" y="66" width="24" height="20" rx="3" fill="#b07a4a" ${S}/><path d="M86 68 L100 52 L114 68 Z" fill="#8a5a33" ${S}/><path d="M88 74 H112 M88 80 H112" stroke="#8a5a33" stroke-width="1.4"/>` +
    `<rect x="78" y="104" width="44" height="104" fill="#bccbe6" ${S}/>${windows(84, 112, 4, 10, 9.5, 9.5, 5.5, 5, 2)}` +
    `<rect x="120" y="88" width="30" height="120" fill="#8ea4cf" ${S}/>${windows(125, 96, 3, 12, 8, 9.5, 4.5, 5, 4)}` +
    `<rect x="148" y="130" width="44" height="78" fill="#adbfe0" ${S}/>${windows(154, 138, 4, 7, 9, 9.5, 5, 5, 0)}` +
    `<rect x="0" y="204" width="200" height="12" rx="4" fill="#c7cfd9" ${S}/>`,
  );

// ------------------------------------------------------------------ India

const spiceStall = (): Art => {
  const mounds = ['#d9343a', '#f2c12e', '#6aa84f', '#e8822a', '#8e5a2e'];
  let baskets = '';
  mounds.forEach((c, i) => {
    const x = 46 + i * 32;
    baskets += `<path d="M${x - 14} 136 Q${x} 106 ${x + 14} 136 Z" fill="${c}" ${S2}/><circle cx="${x - 3}" cy="124" r="1.6" fill="rgba(255,255,255,.55)"/><circle cx="${x + 4}" cy="129" r="1.4" fill="rgba(0,0,0,.18)"/>` +
      `<path d="M${x - 16} 134 H${x + 16} L${x + 13} 144 H${x - 13} Z" fill="#b8834a" ${S2}/><path d="M${x - 14} 139 H${x + 14}" stroke="#8a5a2b" stroke-width="1.2"/>`;
  });
  let garland = '';
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const x = 30 + 160 * t;
    const y = 100 + Math.sin(t * Math.PI) * 10;
    garland += `<circle cx="${x}" cy="${y}" r="4.4" fill="${i % 2 ? '#ffd23f' : '#ff9f1c'}" stroke="${O}" stroke-width="1.1"/>`;
  }
  return art(220, 200,
    shadow(110, 190, 104) +
    `<rect x="26" y="62" width="8" height="126" fill="#8a5a2b" ${S2}/><rect x="186" y="62" width="8" height="126" fill="#8a5a2b" ${S2}/>` +
    stripes(20, 200, 58, 12, 208, 90, 9, ['#f5a623', '#e05a8a']) + scallops(12, 208, 90, 9, ['#f5a623', '#e05a8a']) +
    `<rect x="16" y="50" width="188" height="10" rx="5" fill="#b5651d" ${S}/>` + garland +
    `<rect x="20" y="144" width="180" height="44" rx="4" fill="#c98d5a" ${S}/>` +
    `<circle cx="52" cy="166" r="7" fill="none" stroke="#9a6a36" stroke-width="2"/><circle cx="110" cy="166" r="7" fill="none" stroke="#9a6a36" stroke-width="2"/><circle cx="168" cy="166" r="7" fill="none" stroke="#9a6a36" stroke-width="2"/>` +
    baskets +
    `<path d="M204 190 q-10 0 -10 -10 q0 -10 10 -12 v-5 h6 v5 q10 2 10 12 q0 10 -10 10 z" fill="#d4a72c" ${S2}/>`,
  );
};

const palace = (): Art =>
  art(200, 220,
    shadow(100, 212, 96) +
    `<g class="kite" style="--kx:6px"><path d="M152 26 L163 42 L152 58 L141 42 Z" fill="#e05a8a" ${S2}/><path d="M141 42 H163 M152 26 V58" stroke="#b83a68" stroke-width="1.2"/><path d="M152 58 q-5 8 1 14 q6 6 -1 13" stroke="${O}" stroke-width="1.3" fill="none"/></g>` +
    `<g class="kite" style="--kx:-5px;animation-delay:-1.4s"><path d="M38 40 L47 53 L38 66 L29 53 Z" fill="#2aa79b" ${S2}/><path d="M29 53 H47 M38 40 V66" stroke="#17736a" stroke-width="1.2"/><path d="M38 66 q5 7 -1 13 q-5 6 1 12" stroke="${O}" stroke-width="1.3" fill="none"/></g>` +
    `<rect x="26" y="200" width="148" height="12" rx="6" fill="#9fd6ee" ${S}/>` +
    `<rect x="16" y="184" width="168" height="18" rx="3" fill="#efe6d4" ${S}/>` +
    `<rect x="24" y="100" width="12" height="86" fill="#fbf8f2" ${S}/><path d="M21 102 Q30 82 39 102 Z" fill="#fbf8f2" ${S}/><path d="M30 86 V78" stroke="${O}" stroke-width="1.8"/>` +
    `<rect x="164" y="100" width="12" height="86" fill="#fbf8f2" ${S}/><path d="M161 102 Q170 82 179 102 Z" fill="#fbf8f2" ${S}/><path d="M170 86 V78" stroke="${O}" stroke-width="1.8"/>` +
    `<rect x="52" y="116" width="96" height="70" fill="#fbf8f2" ${S}/>` +
    `<path d="M86 186 V150 Q100 128 114 150 V186 Z" fill="#cdb995" ${S}/><path d="M60 170 V156 Q67 146 74 156 V170 Z M126 170 V156 Q133 146 140 156 V170 Z" fill="#cdb995" ${S2}/>` +
    `<path d="M66 118 Q66 88 100 72 Q134 88 134 118 Z" fill="#fdfbf6" ${S}/><path d="M100 72 V58" stroke="${O}" stroke-width="2"/><circle cx="100" cy="56" r="3.2" fill="#d4a72c" ${S2}/>` +
    `<path d="M52 118 Q60 100 68 118 Z M132 118 Q140 100 148 118 Z" fill="#fdfbf6" ${S}/>` +
    `<path d="M52 128 H148" stroke="#d6457a" stroke-width="2" stroke-dasharray="3 3"/>`,
  );

// ------------------------------------------------------------------ China

const teaHouse = (): Art => {
  const lat = (x: number) => {
    let s = `<rect x="${x}" y="118" width="30" height="34" fill="#efc98d" ${S2}/>`;
    s += `<path d="M${x + 15} 118 V152 M${x} 135 H${x + 30} M${x + 5} 123 H${x + 25} V147 H${x + 5} Z" fill="none" stroke="#a8742f" stroke-width="1.3"/>`;
    return s;
  };
  return art(220, 200,
    shadow(110, 190, 104) +
    `<rect x="34" y="104" width="152" height="84" fill="#f6e8cf" ${S}/>` +
    `<path d="M34 104 h8 v84 h-8z M178 104 h8 v84 h-8z M84 104 h7 v84 h-7z M129 104 h7 v84 h-7z" fill="#c8372c"/>` +
    lat(48) + lat(142) +
    `<circle cx="110" cy="158" r="20" fill="#4a2b1a" ${S}/><rect x="88" y="176" width="44" height="12" fill="#f6e8cf"/><path d="M90 178 H130" stroke="${O}" stroke-width="2"/>` +
    `<path d="M10 110 Q28 106 38 92 H182 Q192 106 210 110 Q198 115 184 106 H36 Q22 115 10 110 Z" fill="#2f8a6e" ${S}/>` +
    `<path d="M50 96 v8 M70 96 v8 M90 96 v8 M110 96 v8 M130 96 v8 M150 96 v8 M170 96 v8" stroke="#236a55" stroke-width="2"/>` +
    `<rect x="64" y="64" width="92" height="30" fill="#f6e8cf" ${S}/><path d="M64 64 h6 v30 h-6z M150 64 h6 v30 h-6z" fill="#c8372c"/>` +
    `<rect x="88" y="70" width="44" height="17" rx="3" fill="#c8372c" stroke="#d4a72c" stroke-width="2"/><path d="M98 78.5 h24 M110 73 v11" stroke="#ffd36b" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M38 70 Q54 66 62 52 H158 Q166 66 182 70 Q172 75 160 66 H60 Q48 75 38 70 Z" fill="#2f8a6e" ${S}/>` +
    `<path d="M92 52 Q110 38 128 52" stroke="#d4a72c" stroke-width="3" fill="none"/><circle cx="110" cy="42" r="4" fill="#d4a72c" ${S2}/>` +
    lantern(24, 108, true, 10) + lantern(196, 108, true, 10),
  );
};

const pagoda = (): Art => {
  let tiers = '';
  for (let i = 0; i < 4; i++) {
    const w = 66 - i * 12;
    const y = 200 - i * 36;
    const l = 100 - w / 2;
    const r = 100 + w / 2;
    tiers += `<rect x="${l}" y="${y - 28}" width="${w}" height="28" fill="#f6e8cf" ${S}/>` +
      `<path d="M${l + 6} ${y - 28} v28 M${r - 6} ${y - 28} v28" stroke="#c8372c" stroke-width="4"/>` +
      `<rect x="${100 - 6}" y="${y - 20}" width="12" height="14" rx="6" fill="#4a2b1a"/>` +
      `<path d="M${l - 18} ${y - 26} Q${l - 6} ${y - 30} ${l} ${y - 40} H${r} Q${r + 6} ${y - 30} ${r + 18} ${y - 26} Q${r + 8} ${y - 22} ${r} ${y - 30} H${l} Q${l - 8} ${y - 22} ${l - 18} ${y - 26} Z" fill="#c8372c" ${S}/>`;
  }
  const top = 200 - 3 * 36 - 40;
  const bamboo = (x: number, y0: number) => {
    let s = `<rect x="${x}" y="${y0}" width="7" height="${208 - y0}" rx="3" fill="#7cbf5a" ${S2}/>`;
    for (let y = y0 + 18; y < 204; y += 20) s += `<path d="M${x} ${y} h7" stroke="${O}" stroke-width="1.3"/>`;
    s += `<path d="M${x + 7} ${y0 + 22} q14 -8 24 0 q-12 6 -24 0 Z M${x} ${y0 + 44} q-14 -8 -22 2 q12 4 22 -2 Z" fill="#5aa04a" stroke="${O}" stroke-width="1.2"/>`;
    return s;
  };
  return art(200, 220,
    shadow(100, 212, 96) +
    `<path d="M0 206 Q100 196 200 206 V220 H0 Z" fill="#cfe3a6" ${S}/>` +
    tiers + `<path d="M100 ${top} V${top - 22}" stroke="#d4a72c" stroke-width="3"/><circle cx="100" cy="${top - 8}" r="4" fill="#d4a72c" ${S2}/><circle cx="100" cy="${top - 18}" r="3" fill="#d4a72c" ${S2}/>` +
    bamboo(10, 100) + bamboo(22, 128) + bamboo(178, 112) + bamboo(166, 140),
  );
};

/** Two illustrations per region: the restaurant (0) and a landmark (1). */
export const SCENES: Record<CuisineId, [() => Art, () => Art]> = {
  italy: [trattoria, pisa],
  japan: [izakaya, fuji],
  mexico: [cantina, desert],
  usa: [diner, skyline],
  india: [spiceStall, palace],
  china: [teaHouse, pagoda],
};

// ------------------------------------------------------------------ flags

const flag = (body: string) =>
  `<svg viewBox="0 0 36 24"><defs><clipPath id="fc"><rect width="36" height="24" rx="4"/></clipPath></defs><g clip-path="url(#fc)">${body}` +
  `<rect width="36" height="12" fill="rgba(255,255,255,.14)"/></g><rect x="0.75" y="0.75" width="34.5" height="22.5" rx="3.5" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/></svg>`;

export const FLAGS: Record<CuisineId, string> = {
  italy: flag('<rect width="12" height="24" fill="#009246"/><rect x="12" width="12" height="24" fill="#fff"/><rect x="24" width="12" height="24" fill="#ce2b37"/>'),
  japan: flag('<rect width="36" height="24" fill="#fff"/><circle cx="18" cy="12" r="6.5" fill="#bc002d"/>'),
  mexico: flag('<rect width="12" height="24" fill="#006847"/><rect x="12" width="12" height="24" fill="#fff"/><rect x="24" width="12" height="24" fill="#ce1126"/><circle cx="18" cy="12" r="3.4" fill="#8c5a2b"/><path d="M14.5 14 q3.5 3 7 0" stroke="#3f8f3f" stroke-width="1.2" fill="none"/>'),
  usa: flag('<rect width="36" height="24" fill="#fff"/><path d="M0 0h36v3.4H0zM0 6.9h36v3.4H0zM0 13.7h36v3.4H0zM0 20.6h36V24H0z" fill="#b22234"/><rect width="16" height="13" fill="#3c3b6e"/><g fill="#fff"><circle cx="3.5" cy="3" r="1"/><circle cx="8" cy="3" r="1"/><circle cx="12.5" cy="3" r="1"/><circle cx="5.7" cy="6.5" r="1"/><circle cx="10.2" cy="6.5" r="1"/><circle cx="3.5" cy="10" r="1"/><circle cx="8" cy="10" r="1"/><circle cx="12.5" cy="10" r="1"/></g>'),
  india: flag('<rect width="36" height="8" fill="#ff9933"/><rect y="8" width="36" height="8" fill="#fff"/><rect y="16" width="36" height="8" fill="#138808"/><circle cx="18" cy="12" r="3" fill="none" stroke="#000080" stroke-width="1"/><circle cx="18" cy="12" r="0.8" fill="#000080"/>'),
  china: flag('<rect width="36" height="24" fill="#de2910"/><path d="M7 3.5l1.3 3.9h4.1l-3.3 2.4 1.3 3.9L7 11.3l-3.4 2.4 1.3-3.9-3.3-2.4h4.1z" fill="#ffde00"/><circle cx="14" cy="3" r="1" fill="#ffde00"/><circle cx="16" cy="6" r="1" fill="#ffde00"/><circle cx="16" cy="10" r="1" fill="#ffde00"/><circle cx="14" cy="13" r="1" fill="#ffde00"/>'),
};

// ------------------------------------------------------------------ garlands

type Garland = 'bulbs' | 'lanterns' | 'papel' | 'bunting' | 'marigold' | 'chinese';
export const GARLAND: Record<CuisineId, Garland> = {
  italy: 'bulbs', japan: 'lanterns', mexico: 'papel', usa: 'bunting', india: 'marigold', china: 'chinese',
};

/** A string sagging across the whole width with things hanging off it; returns the SVG and its height. */
export function garland(kind: Garland, width: number, seed: number): { svg: string; h: number } {
  const y0 = 10;
  const sag = 22 + (seed % 3) * 6;
  const at = (t: number): [number, number] => {
    const x = -10 + (width + 20) * t;
    // Quadratic sag: deepest in the middle.
    const y = y0 + 4 * sag * t * (1 - t);
    return [x, y];
  };
  const step = kind === 'marigold' ? 14 : kind === 'bunting' ? 34 : kind === 'papel' ? 40 : 52;
  const n = Math.max(3, Math.round(width / step));
  let items = '';
  const papel = ['#ff4f8b', '#ff9f1c', '#ffd23f', '#3dbb6b', '#2f8fe0', '#a15de0'];
  const bunting = ['#e0453b', '#fff', '#3c5aa8'];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const [x, y] = at(t);
    const sway = `class="sway" style="transform-origin:${x.toFixed(1)}px ${y.toFixed(1)}px;animation-delay:${(-((i * 0.37 + seed) % 3)).toFixed(2)}s"`;
    if (kind === 'bulbs') {
      items += `<g ${sway}><rect x="${x - 2.5}" y="${y}" width="5" height="5" rx="1" fill="#3b3f3a"/><circle cx="${x}" cy="${y + 10}" r="9" fill="rgba(255,226,140,.35)"/><ellipse cx="${x}" cy="${y + 10}" rx="4.2" ry="5.5" fill="#fff1b8" stroke="#c9a24a" stroke-width="1"/></g>`;
    } else if (kind === 'lanterns' || kind === 'chinese') {
      if (i % 2 === 0) items += lantern(x, y, kind === 'chinese', 9);
    } else if (kind === 'papel') {
      const c = papel[(i + seed) % papel.length];
      items += `<g ${sway}><path d="M${x - 13} ${y} H${x + 13} V${y + 24} q-3.25 4 -6.5 0 q-3.25 4 -6.5 0 q-3.25 4 -6.5 0 q-3.25 4 -6.5 0 Z" fill="${c}" opacity=".95"/>` +
        `<circle cx="${x - 5}" cy="${y + 8}" r="2.2" fill="#fffaf1"/><circle cx="${x + 5}" cy="${y + 8}" r="2.2" fill="#fffaf1"/><path d="M${x} ${y + 12} l3.5 4 l-3.5 4 l-3.5 -4 Z" fill="#fffaf1"/></g>`;
    } else if (kind === 'bunting') {
      const c = bunting[i % 3];
      items += `<g ${sway}><path d="M${x - 13} ${y} H${x + 13} L${x} ${y + 24} Z" fill="${c}" stroke="${O}" stroke-width="1.3" stroke-linejoin="round"/></g>`;
    } else {
      items += `<circle cx="${x}" cy="${y + 1}" r="5.5" fill="${i % 2 ? '#ffd23f' : '#ff8c1a'}" stroke="${O}" stroke-width="1.1"/>`;
      if (i % 6 === 3) items += `<g ${sway}><path d="M${x} ${y + 6} V${y + 26}" stroke="${O}" stroke-width="1"/><circle cx="${x}" cy="${y + 13}" r="4" fill="#ff8c1a" stroke="${O}" stroke-width="1"/><circle cx="${x}" cy="${y + 21}" r="4" fill="#ffd23f" stroke="${O}" stroke-width="1"/><path d="M${x - 3} ${y + 26} l3 5 l3 -5 Z" fill="#3f9b4f"/></g>`;
    }
  }
  const [mx, my] = at(0.5);
  const cord = `<path d="M-10 ${y0} Q${mx} ${my + 2 * sag - 4 * sag * 0.25 * 0} ${width + 10} ${y0}" fill="none" stroke="#6b4a2e" stroke-width="1.8"/>`;
  // The quadratic's control point sits at twice the sag below the ends.
  const path = cord.replace(/Q[^ ]+ [^ ]+/, `Q${mx.toFixed(1)} ${(y0 + 2 * sag).toFixed(1)}`);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${y0 + sag + 50}" viewBox="0 0 ${width} ${y0 + sag + 50}">${path}${items}</svg>`, h: y0 + sag + 50 };
}
