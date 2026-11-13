import { type C, P, r, px, canvas, outline, shade } from './px.ts';
import { HD } from './hd.ts';
import { TCLASSES, type TClass } from '../../lib/economy.ts';

type Helm = 'none' | 'straw' | 'cap' | 'hood' | 'kettle' | 'nasal' | 'bascinet' | 'sallet' | 'great' | 'crown' | 'feather';
type Weapon = 'fork' | 'club' | 'spear' | 'sword' | 'longsword' | 'greatsword' | 'mace' | 'bow' | 'longbow' | 'xbow' | 'pike' | 'halberd' | 'lance' | 'hammer' | 'none';
type Shield = 'none' | 'buckler' | 'round' | 'heater' | 'kite' | 'tower';
interface Spec { tab: string; trim?: string; body: 'cloth' | 'leather' | 'chain' | 'plate'; helm: Helm; hood?: string; weapon: Weapon; shield: Shield; shieldCol?: string; mount?: 'brown' | 'white' | 'black' | 'grey'; barding?: string; cape?: string; skirt?: boolean }

export const SPECS: Record<TClass | 'worker' | 'villager', Spec> = {
  peasant: { tab: '#8a6a44', body: 'cloth', helm: 'straw', weapon: 'fork', shield: 'none' },
  militia: { tab: '#7a6a3a', body: 'leather', helm: 'cap', weapon: 'club', shield: 'round', shieldCol: '#8a5a2e' },
  spearman: { tab: '#a8722d', body: 'leather', helm: 'kettle', weapon: 'spear', shield: 'round', shieldCol: '#b02a28' },
  squire: { tab: '#3557a8', trim: '#e8e0c8', body: 'leather', helm: 'nasal', weapon: 'sword', shield: 'buckler' },
  archer: { tab: '#3f7d2c', body: 'leather', helm: 'hood', hood: '#3f7d2c', weapon: 'bow', shield: 'none' },
  swordsman: { tab: '#b02a28', body: 'chain', helm: 'nasal', weapon: 'sword', shield: 'heater', shieldCol: '#b02a28' },
  shieldman: { tab: '#2a6a8a', body: 'chain', helm: 'kettle', weapon: 'spear', shield: 'tower', shieldCol: '#2a6a8a' },
  pikeman: { tab: '#c08a2a', trim: '#5a2a1a', body: 'chain', helm: 'kettle', weapon: 'pike', shield: 'none' },
  longbow: { tab: '#2f5a24', body: 'leather', helm: 'hood', hood: '#5a4a2a', weapon: 'longbow', shield: 'none' },
  crossbow: { tab: '#6a3a1a', trim: '#d8b048', body: 'chain', helm: 'kettle', weapon: 'xbow', shield: 'none' },
  manatarms: { tab: '#7a1d1a', trim: '#ecc94b', body: 'plate', helm: 'bascinet', weapon: 'longsword', shield: 'heater', shieldCol: '#7a1d1a' },
  lightcav: { tab: '#8a5a2e', body: 'leather', helm: 'nasal', weapon: 'spear', shield: 'round', shieldCol: '#a8722d', mount: 'brown' },
  knight: { tab: '#e8e0c8', trim: '#b02a28', body: 'plate', helm: 'great', weapon: 'longsword', shield: 'heater', shieldCol: '#e8e0c8', skirt: true },
  heavyinf: { tab: '#4a4a5a', body: 'plate', helm: 'sallet', weapon: 'mace', shield: 'tower', shieldCol: '#5a5a6a' },
  halberdier: { tab: '#b02a28', trim: '#e8e0c8', body: 'plate', helm: 'sallet', weapon: 'halberd', shield: 'none', skirt: true },
  mknight: { tab: '#e8e0c8', trim: '#b02a28', body: 'plate', helm: 'great', weapon: 'lance', shield: 'heater', shieldCol: '#e8e0c8', mount: 'white', barding: '#b02a28' },
  royalarcher: { tab: '#2a4aa8', trim: '#ecc94b', body: 'chain', helm: 'feather', weapon: 'longbow', shield: 'none' },
  vetcav: { tab: '#2a2a2a', trim: '#8a8a8a', body: 'plate', helm: 'sallet', weapon: 'mace', shield: 'heater', shieldCol: '#2a2a2a', mount: 'black', barding: '#3a3a4a' },
  royalguard: { tab: '#5a2a7a', trim: '#ecc94b', body: 'plate', helm: 'crown', weapon: 'greatsword', shield: 'none', cape: '#5a2a7a', skirt: true },
  worker: { tab: '#9a7a4a', body: 'cloth', helm: 'none', weapon: 'hammer', shield: 'none' },
  villager: { tab: '#8a4a5a', body: 'cloth', helm: 'cap', weapon: 'none', shield: 'none', skirt: true },
};
export const SHEET_CLASSES = [...TCLASSES, 'worker', 'villager'] as const;
export const FW = 16, FH = 20, FRAMES = 6, RANKS_N = 5;
const PER_ROW = 8; // entries per sheet row

const HORSE = { brown: ['#6b4423', '#4a2e16'], white: ['#e8e2d4', '#b8b0a0'], black: ['#2e2a2a', '#1a1616'], grey: ['#8a8680', '#5e5a56'] } as const;
function metal(body: Spec['body'], rank: number): [string, string, string] {
  const polish = rank >= 3 ? 18 : 0;
  if (body === 'plate') return [shade('#c9cfd8', polish), shade('#8e96a2', polish), '#f2f5f8'];
  if (body === 'chain') return [shade('#949aa3', polish), shade('#6d737c', polish), '#b8bec6'];
  if (body === 'leather') return ['#8a5a32', '#5e3e24', '#a8744a'];
  return ['#8a6a44', '#6a4e30', '#a8865a'];
}

/** Draws one 16x20 frame. f: 0-3 walk cycle, 4 wind-up, 5 strike/release. */
function drawUnit(c: C, ox: number, oy: number, s: Spec, rank: number, f: number) {
  const Q = (x: number, y: number, w: number, h: number, col: string) => r(c, ox + x, oy + y, w, h, col);
  const [arm, armD, armL] = metal(s.body, rank), gold = rank >= 4, mounted = !!s.mount;
  const tab = s.tab, tabD = shade(tab, -35), trim = gold ? P.gold : s.trim;
  const walk = f < 4, bob = walk && f % 2 === 1 ? 1 : 0, atk = f === 4 ? -1 : f === 5 ? 1 : 0;
  let y0 = 4 + bob; // top of head
  if (mounted) {
    const [hc, hd] = HORSE[s.mount!], lg = [[0, 0], [1, -1], [0, 0], [-1, 1], [0, 0], [1, -1]][f];
    const hy = 11 + bob;
    Q(2, hy, 11, 5, hc); Q(2, hy + 4, 11, 1, hd); Q(11, hy - 4, 3, 6, hc); Q(13, hy - 5, 3, 3, hc); px(c, ox + 15, oy + hy - 4, P.out); Q(11, hy - 5, 1, 5, hd);
    Q(0, hy, 2, 4, hd); px(c, ox + 1, hy + oy - 1, hd);
    for (const [x, d] of [[3, lg[0]], [5, lg[1]], [10, lg[1]], [12, lg[0]]]) { Q(x + d, hy + 5, 1, 3, hd); px(c, ox + x + d, oy + 19, P.out); }
    if (s.barding) { Q(3, hy, 9, 5, s.barding); for (let i = 3; i < 12; i += 2) px(c, ox + i, oy + hy + 4, gold ? P.gold : shade(s.barding, 40)); Q(12, hy - 5, 3, 2, arm); }
    else { Q(5, hy, 4, 2, '#5a3a1e'); }
    y0 = 0 + bob;
  }
  // cape behind body (rank 3+ get one if the class has none)
  const cape = s.cape ?? (rank >= 4 ? '#5a2a7a' : rank >= 3 ? '#7a1d1a' : null);
  if (cape) { Q(3, y0 + 6, 2, mounted ? 6 : 8, cape); Q(4, y0 + 5, 6, 1, cape); }
  // legs
  if (!mounted) {
    const l = [[0, 0], [-1, 1], [0, 0], [1, -1], [0, 0], [-1, 1]][f], legC = s.body === 'plate' ? armD : s.body === 'chain' ? '#5a5a62' : '#5a4030';
    Q(5 + l[0], 16, 2, 3, legC); Q(8 + l[1], 16, 2, 3, legC); Q(5 + l[0], 19, 2, 1, P.boot); Q(8 + l[1], 19, 2, 1, P.boot);
    if (s.body === 'plate') { px(c, ox + 5 + l[0], oy + 17, armL); px(c, ox + 8 + l[1], oy + 17, armL); }
  } else Q(6, y0 + 10, 2, 3, armD);
  // torso
  const ty = y0 + 7;
  Q(4, ty, 7, 5, s.body === 'cloth' ? tabD : arm);
  if (s.body === 'chain') for (let i = 0; i < 7; i += 2) for (let j = 0; j < 5; j += 2) px(c, ox + 4 + i + (j % 4 ? 1 : 0), oy + ty + j, armD);
  Q(5, ty, 5, 5, tab); if (s.skirt) Q(5, ty + 5, 5, 2, tab);
  if (s.body === 'plate') { Q(4, ty, 1, 2, armL); Q(10, ty, 1, 2, arm); }
  if (trim) { Q(5, ty, 5, 1, trim); if (s.skirt) Q(5, ty + 6, 5, 1, trim); }
  if (s === SPECS.knight || s === SPECS.mknight) { Q(7, ty + 1, 1, 4, P.red); Q(6, ty + 2, 3, 1, P.red); }
  Q(4, ty + 4, 7, 1, rank >= 1 ? '#a8803a' : P.woodD); if (rank >= 1) px(c, ox + 7, oy + ty + 4, P.gold);
  if (rank >= 2 && rank < 4) { px(c, ox + 6, oy + ty + 2, '#f0f0f0'); px(c, ox + 7, oy + ty + 1, '#f0f0f0'); px(c, ox + 8, oy + ty + 2, '#f0f0f0'); } // chevron
  if (gold) { px(c, ox + 6, oy + ty + 2, P.gold); px(c, ox + 8, oy + ty + 2, P.gold); px(c, ox + 7, oy + ty + 3, P.gold); }
  // head
  const hy = y0 + 2;
  Q(5, hy, 5, 5, P.skin); px(c, ox + 8, oy + hy + 2, P.out); px(c, ox + 6, oy + hy + 4, P.skinD);
  const helmC = s.body === 'cloth' || s.body === 'leather' ? (rank >= 3 ? '#9aa1aa' : armL) : arm;
  switch (s.helm) {
    case 'none': Q(5, hy, 5, 1, P.hair); Q(4, hy + 1, 1, 2, P.hair); break;
    case 'straw': Q(3, hy, 9, 1, P.thatch); Q(5, hy - 1, 5, 1, P.thatchD); break;
    case 'cap': Q(5, hy - 1, 5, 2, s.tab === SPECS.villager.tab ? P.cloth : '#7a5232'); Q(4, hy, 1, 2, '#5e3e24'); break;
    case 'hood': Q(4, hy - 1, 6, 3, s.hood!); Q(4, hy + 1, 1, 5, s.hood!); px(c, ox + 9, oy + hy, s.hood!); break;
    case 'feather': Q(4, hy - 1, 7, 2, s.tab); px(c, ox + 4, oy + hy + 1, s.tab); Q(9, hy - 3, 1, 2, P.red); px(c, ox + 10, oy + hy - 4, P.red); break;
    case 'kettle': Q(3, hy, 9, 1, helmC); Q(5, hy - 2, 5, 2, helmC); px(c, ox + 6, oy + hy - 2, '#f0f0f0'); break;
    case 'nasal': Q(5, hy - 2, 5, 3, helmC); px(c, ox + 7, oy + hy - 3, helmC); Q(8, hy + 1, 1, 2, helmC); Q(4, hy, 1, 2, armD); break;
    case 'bascinet': Q(5, hy - 2, 5, 4, helmC); px(c, ox + 7, oy + hy - 3, helmC); Q(9, hy + 1, 2, 2, helmC); Q(7, hy + 2, 3, 1, P.out); Q(4, hy + 1, 1, 3, armD); break;
    case 'sallet': Q(4, hy - 1, 6, 4, helmC); Q(3, hy + 2, 2, 1, helmC); Q(6, hy + 1, 4, 1, P.out); break;
    case 'great': case 'crown': Q(5, hy - 1, 5, 6, helmC); Q(5, hy - 1, 5, 1, armL); Q(6, hy + 1, 4, 1, P.out); px(c, ox + 8, oy + hy + 3, P.out); if (s.helm === 'crown' || gold) { Q(5, hy - 1, 5, 1, P.gold); px(c, ox + 5, oy + hy - 2, P.gold); px(c, ox + 7, oy + hy - 2, P.gold); px(c, ox + 9, oy + hy - 2, P.gold); } break;
  }
  if (rank >= 2 && !['straw', 'cap', 'hood', 'none', 'feather'].includes(s.helm)) { const pc = gold ? P.gold : P.red; px(c, ox + 6, oy + hy - 3, pc); px(c, ox + 5, oy + hy - 3, pc); px(c, ox + 4, oy + hy - 2, pc); }
  // shield (front, left side)
  const sc = s.shieldCol ?? tab, sx = 1, sy = ty - 1;
  if (s.shield === 'buckler') { Q(sx + 1, sy + 2, 3, 3, armD); px(c, ox + sx + 2, oy + sy + 3, P.gold); }
  if (s.shield === 'round') { Q(sx, sy + 1, 4, 5, sc); Q(sx + 1, sy, 2, 7, sc); px(c, ox + sx + 1, oy + sy + 3, armL); px(c, ox + sx + 2, oy + sy + 3, P.stoneD); }
  if (s.shield === 'heater' || s.shield === 'kite') {
    const h = s.shield === 'kite' ? 7 : 5; Q(sx, sy, 4, h - 1, sc); Q(sx + 1, sy + h - 1, 2, 1, sc); px(c, ox + sx + 1, oy + sy + h, sc);
    Q(sx, sy, 4, 1, gold ? P.gold : shade(sc, 40)); if (s === SPECS.knight || s === SPECS.mknight) { Q(sx + 1, sy + 1, 1, 3, P.red); Q(sx, sy + 2, 3, 1, P.red); } else px(c, ox + sx + 1, oy + sy + 2, P.gold);
  }
  if (s.shield === 'tower') { Q(sx - 1, sy - 1, 5, 9, sc); Q(sx - 1, sy - 1, 5, 1, shade(sc, 40)); Q(sx, sy + 3, 3, 1, gold ? P.gold : armL); Q(sx + 1, sy + 1, 1, 5, gold ? P.gold : armL); }
  // weapon (front hand at x~11)
  const wx = 11 + atk, wy = ty + 2;
  const steel = rank >= 3 ? '#eef2f6' : P.stoneL;
  switch (s.weapon) {
    case 'fork': Q(wx, wy - 12, 1, 15, P.woodL); Q(wx - 1, wy - 13, 3, 1, P.stoneD); px(c, ox + wx - 1, oy + wy - 14, P.stoneD); px(c, ox + wx + 1, oy + wy - 14, P.stoneD); break;
    case 'club': Q(wx, wy - 5 - atk, 1, 6, P.wood); Q(wx - 1, wy - 7 - atk, 3, 3, P.woodD); break;
    case 'spear': Q(wx, wy - 12 + Math.max(0, atk) * -1, 1, 16, P.woodL); Q(wx, wy - 14 - Math.max(0, atk), 1, 2, steel); px(c, ox + wx, oy + wy - 15 - Math.max(0, atk), steel); break;
    case 'sword': case 'longsword': {
      const len = s.weapon === 'sword' ? 6 : 8;
      if (atk > 0) { Q(wx, wy, len, 1, steel); Q(wx, wy - 1, 1, 3, P.goldD); }
      else { Q(wx, wy - len + (atk < 0 ? -1 : 0), 1, len, steel); Q(wx - 1, wy, 3, 1, P.goldD); px(c, ox + wx, oy + wy + 1, P.woodD); }
      break;
    }
    case 'greatsword': if (atk > 0) { Q(wx - 1, wy - 2, 9, 1, steel); Q(wx - 1, wy - 3, 1, 3, P.gold); } else { Q(wx - 1, wy - 11, 2, 11, steel); Q(wx - 3, wy, 6, 1, P.gold); Q(wx - 1, wy + 1, 2, 2, P.woodD); } break;
    case 'mace': Q(wx, wy - 5 - atk, 1, 7, P.woodD); Q(wx - 1, wy - 8 - atk, 3, 3, steel); px(c, ox + wx, oy + wy - 9 - atk, steel); break;
    case 'hammer': Q(wx, wy - 4 - atk, 1, 6, P.wood); Q(wx - 1, wy - 6 - atk, 3, 2, P.stoneD); break;
    case 'bow': case 'longbow': {
      const h = s.weapon === 'bow' ? 9 : 13, top = wy - Math.floor(h / 2) - 1, bw = rank >= 4 ? P.gold : s.weapon === 'longbow' ? '#7a4a1e' : P.woodL;
      for (let j = 0; j < h; j++) px(c, ox + wx + (j > 1 && j < h - 2 ? 1 : 0), oy + top + j, bw);
      const pull = f === 4 ? -3 : 0; for (let j = 1; j < h - 1; j++) px(c, ox + wx + Math.round(pull * (1 - Math.abs(j - h / 2) / (h / 2))), oy + top + j, P.cloth);
      if (f === 4) Q(wx - 3, wy - 1, 6, 1, P.woodL);
      Q(3, ty, 2, 5, P.woodD); px(c, ox + 3, oy + ty - 1, P.cloth); px(c, ox + 4, oy + ty - 1, P.red); break;
    }
    case 'xbow': Q(wx - 3, wy, 7, 1, P.wood); Q(wx + 2, wy - 3, 1, 7, P.stoneD); if (f !== 5) Q(wx - 1, wy - 1, 3, 1, P.woodL); Q(3, ty + 1, 2, 4, P.woodD); break;
    case 'pike': Q(wx, wy - 18 - Math.max(0, atk), 1, 21, P.woodL); Q(wx, wy - 20 - Math.max(0, atk), 1, 2, steel); break;
    case 'halberd': Q(wx, wy - 15 - Math.max(0, atk), 1, 18, P.woodD); Q(wx, wy - 17 - Math.max(0, atk), 1, 2, steel); Q(wx + 1, wy - 15 - Math.max(0, atk), 2, 3, steel); px(c, ox + wx - 1, oy + wy - 14 - Math.max(0, atk), steel); break;
    case 'lance': for (let j = 0; j < 11; j++) px(c, ox + 9 + j + atk, oy + wy + 2 - Math.round(j * 0.6), j > 8 ? steel : '#c8c0b0'); if (s.trim) { px(c, ox + 15 + atk, oy + wy - 3, s.trim); px(c, ox + 15 + atk, oy + wy - 2, s.trim); } break;
  }
  if (s.weapon !== 'none' && s.weapon !== 'bow' && s.weapon !== 'longbow' && s.weapon !== 'lance') px(c, ox + wx, oy + wy + 1, P.skin);
}

export const entryIndex = (cls: string, rank: number) => SHEET_CLASSES.indexOf(cls as TClass) * RANKS_N + rank;
export const frameRect = (cls: string, rank: number, f: number) => {
  const e = entryIndex(cls, rank), col = e % PER_ROW, row = Math.floor(e / PER_ROW);
  return { x: (col * FRAMES + f) * FW, y: row * FH };
};
/** One sheet with every class, rank and frame. */
export function soldierSheet(): HTMLCanvasElement {
  const n = SHEET_CLASSES.length * RANKS_N, rows = Math.ceil(n / PER_ROW);
  const [cv, c] = canvas(PER_ROW * FRAMES * FW, rows * FH);
  for (const cls of SHEET_CLASSES) for (let rk = 0; rk < RANKS_N; rk++) for (let f = 0; f < FRAMES; f++) {
    const { x, y } = frameRect(cls, rk, f);
    c.save(); c.beginPath(); c.rect(x, y + 1, FW, FH - 1); c.clip(); // keep tall weapons inside the cell (row 0 left for outline)
    drawUnit(c, x, y, SPECS[cls], rk, f); c.restore();
    outline(cv, P.out, x, y, FW, FH);
  }
  // the game uses 2x textures everywhere; scale the original sprites up with crisp nearest-neighbour pixels
  const [hd, c2] = canvas(cv.width * HD, cv.height * HD); c2.imageSmoothingEnabled = false; c2.drawImage(cv, 0, 0, hd.width, hd.height);
  return hd;
}
/** Distant-zoom LOD: one 46x32 block of 12 tiny figures per class/rank, matching a squad's footprint. */
export const BW = 46, BH = 32;
export function blockSheet(): HTMLCanvasElement {
  const [cv, c] = canvas(BW * RANKS_N, BH * TCLASSES.length);
  TCLASSES.forEach((cls, ci) => { for (let rk = 0; rk < RANKS_N; rk++) {
    const s = SPECS[cls], ox = rk * BW, oy = ci * BH, [arm] = metal(s.body, rk);
    const head = ['great', 'crown', 'sallet', 'bascinet', 'kettle', 'nasal'].includes(s.helm) ? arm : s.helm === 'hood' ? s.hood! : s.helm === 'straw' ? P.thatch : P.skin;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = ox + i * 11 + 2, y = oy + j * 10 + 2;
      if (s.mount) { r(c, x, y + 3, 6, 2, HORSE[s.mount][0]); px(c, x + 5, y + 2, HORSE[s.mount][0]); px(c, x, y + 5, HORSE[s.mount][1]); px(c, x + 4, y + 5, HORSE[s.mount][1]); r(c, x + 2, y + 1, 2, 2, s.tab); px(c, x + 2, y, head); }
      else { r(c, x + 1, y, 2, 1, head); r(c, x, y + 1, 4, 3, s.tab); if (s.body !== 'cloth') { px(c, x, y + 1, arm); px(c, x + 3, y + 1, arm); } r(c, x + 1, y + 4, 1, 2, P.boot); r(c, x + 2, y + 4, 1, 2, P.boot); if (rk >= 4) px(c, x + 1, y + 2, P.gold); }
      if (['pike', 'spear', 'halberd', 'fork', 'lance'].includes(s.weapon)) r(c, x + 4, y - 1, 1, 4, P.stoneL);
      if (s.shield !== 'none' && !s.mount) px(c, x - 1 < ox ? x : x - 1, y + 2, s.shieldCol ?? s.tab);
    }
    outline(cv, P.out, ox, oy, BW, BH);
  } });
  return cv;
}
