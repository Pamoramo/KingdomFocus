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
export const FW = 20, FH = 24, FRAMES = 6, RANKS_N = 5;
const PER_ROW = 8; // entries per sheet row

const HORSE = { brown: ['#6b4423', '#4a2e16'], white: ['#e8e2d4', '#b8b0a0'], black: ['#2e2a2a', '#1a1616'], grey: ['#8a8680', '#5e5a56'] } as const;
function metal(body: Spec['body'], rank: number): [string, string, string] {
  const polish = rank >= 3 ? 18 : 0;
  if (body === 'plate') return [shade('#c9cfd8', polish), shade('#8e96a2', polish), '#f2f5f8'];
  if (body === 'chain') return [shade('#949aa3', polish), shade('#6d737c', polish), '#b8bec6'];
  if (body === 'leather') return ['#8a5a32', '#5e3e24', '#a8744a'];
  return ['#8a6a44', '#6a4e30', '#a8865a'];
}

// ---------- chunky 16-bit style figures (big helmets, 4-tone ramps, crisp outlines) ----------
type Ramp = [string, string, string, string]; // light, mid, dark, deep
const ramp = (c: string): Ramp => [shade(c, 40), c, shade(c, -38), shade(c, -75)];
const STEEL: Ramp = ['#eef2f6', '#b6bec8', '#7e8894', '#4c5562'];
const STEEL_POL: Ramp = ['#ffffff', '#d6dde5', '#9ea8b4', '#646e7c'];
const GOLD: Ramp = ['#fff1a8', '#ecc94b', '#b08a22', '#6e5410'];
const LEATHER: Ramp = ['#ba8654', '#8a5a32', '#5e3e24', '#3c2616'];
const SKIN: Ramp = ['#f7d6b4', '#e6b88e', '#bb8660', '#8a5a3e'];
const WOOD: Ramp = ['#c69256', '#8f5e30', '#5e3b1c', '#3c2410'];
const HORSES: Record<string, Ramp> = { brown: ['#9a6a3e', '#6e4626', '#4c2e16', '#2e1a0c'], white: ['#ffffff', '#e4ded2', '#b6ae9e', '#7e766a'], black: ['#5a5454', '#363232', '#221e1e', '#120f0f'], grey: ['#b0aca6', '#8a8680', '#5e5a56', '#3a3734'] };
const INK = '#151019';

function drawUnit(c: C, ox: number, oy: number, s: Spec, rank: number, f: number) {
  const P1 = (x: number, y: number, col: string) => r(c, ox + x, oy + y, 1, 1, col);
  const R = (x: number, y: number, w: number, h: number, col: string) => r(c, ox + x, oy + y, w, h, col);
  /** Shaded block: light top/left, dark right, deep bottom, rounded corners. */
  const blob = (x: number, y: number, w: number, h: number, rp: Ramp, round = true) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (round && w > 2 && h > 2 && (i === 0 || i === w - 1) && (j === 0 || j === h - 1)) continue;
      P1(x + i, y + j, j === h - 1 ? rp[3] : i === w - 1 || j === h - 2 && i > w / 2 ? rp[2] : i === 0 || j === 0 ? rp[0] : rp[1]);
    }
  };
  const steel = rank >= 3 ? STEEL_POL : STEEL, gold = rank >= 4, trim = gold ? GOLD : null;
  const body: Ramp = s.body === 'plate' ? steel : s.body === 'chain' ? ['#c8ccd2', '#9aa0a8', '#6e747c', '#474c54'] : s.body === 'leather' ? LEATHER : ramp(shade(s.tab, -10));
  const tab = ramp(s.tab), mounted = !!s.mount;
  const walk = f < 4, bob = walk && f % 2 === 1 ? 1 : 0, atk = f === 4 ? -1 : f === 5 ? 1 : 0;
  const cape = s.cape ?? (rank >= 4 ? '#5a2a7a' : rank >= 3 ? '#8a1d1a' : null);

  // ---- horse (mounted units) ----
  let hx = 4, hy = 2 + bob, ty = 12 + bob, hs = 10; // head x/y, torso y, head size
  if (mounted) {
    const hr = HORSES[s.mount!], lg = [[0, 1], [1, 0], [0, 1], [1, 0], [0, 0], [1, 1]][f], b = bob;
    R(0, 12 + b, 2, 6, hr[2]); P1(1, 11 + b, hr[1]); P1(0, 18 + b, hr[3]); // tail
    for (const [x, ph] of [[2, 0], [5, 1], [11, 0], [13, 1]]) { const up = lg[ph]; R(x, 17 + b, 2, 5 - b - up, x < 8 ? hr[2] : hr[1]); R(x, 22 - up, 2, 1, hr[3]); }
    blob(1, 11 + b, 14, 7, hr); blob(12, 6 + b, 4, 7, hr, false); blob(14, 3 + b, 5, 5, hr); blob(16, 6 + b, 4, 3, hr, false);
    P1(15, 2 + b, hr[2]); P1(16, 4 + b, INK); P1(19, 7 + b, hr[3]); P1(19, 8 + b, hr[3]); R(12, 5 + b, 1, 7, hr[3]); R(13, 4 + b, 1, 2, hr[3]);
    if (s.barding) { const br = ramp(s.barding); blob(2, 12 + b, 12, 5, br, false); for (let i = 2; i < 14; i += 2) P1(i, 16 + b, gold ? GOLD[1] : br[0]); R(14, 3 + b, 4, 2, steel[1]); R(14, 3 + b, 4, 1, steel[0]); }
    else { R(5, 10 + b, 6, 2, LEATHER[1]); R(5, 10 + b, 6, 1, LEATHER[0]); P1(8, 12 + b, GOLD[1]); R(16, 6 + b, 1, 3, LEATHER[3]); }
    hx = 5; hy = -1 + b; ty = 6 + b; hs = 7;
  }
  const hcx = hx + Math.floor(hs / 2);
  // ---- cape ----
  if (cape) { const cr = ramp(cape); R(hx - 1, ty + 1, 3, mounted ? 6 : 9, cr[2]); R(hx, ty, hs - 2, 2, cr[1]); P1(hx - 1, ty + (mounted ? 6 : 9), cr[3]); }
  // ---- legs ----
  if (!mounted) {
    const l = [[0, 0], [-1, 1], [0, 0], [1, -1], [0, 0], [-1, 2]][f], legR = s.body === 'plate' ? steel : ['#7a6450', '#5a4636', '#3e3026', '#2a2018'] as Ramp;
    blob(5 + l[0], 18, 3, 4, legR, false); blob(9 + l[1], 18, 3, 4, legR, false);
    R(5 + l[0], 22, 4, 2, '#3a2a20'); R(9 + l[1], 22, 4, 2, '#3a2a20'); P1(5 + l[0], 22, '#5a4434'); P1(9 + l[1], 22, '#5a4434');
  } else { blob(8, ty + 4, 2, 5, s.body === 'plate' ? steel : LEATHER, false); R(8, ty + 9, 3, 1, '#3a2a20'); }
  // ---- torso ----
  const tw = mounted ? 6 : 10, tx = mounted ? 6 : 4, th = mounted ? 5 : 7;
  blob(tx, ty, tw, th, body);
  if (s.body === 'chain') for (let j = 1; j < th - 1; j++) for (let i = 1; i < tw - 1; i++) if ((i + j) % 2) P1(tx + i, ty + j, '#7e848c');
  blob(tx + 2, ty + 1, tw - 4, th - (s.skirt ? -1 : 1), tab, false);
  if (s.trim || trim) { R(tx + 2, ty + 1, tw - 4, 1, trim?.[1] ?? s.trim!); }
  if (s === SPECS.knight || s === SPECS.mknight) { R(tx + Math.floor(tw / 2), ty + 2, 1, th - 3, '#c02a2a'); R(tx + 3, ty + 3, tw - 6, 1, '#c02a2a'); }
  R(tx + 1, ty + th - 2, tw - 2, 1, rank >= 1 ? '#6a4420' : LEATHER[3]); if (rank >= 1) P1(tx + Math.floor(tw / 2), ty + th - 2, GOLD[0]);
  if (rank === 2 || rank === 3) { P1(tx + 3, ty + 4, '#f4f0e8'); P1(tx + 4, ty + 3, '#f4f0e8'); P1(tx + 5, ty + 4, '#f4f0e8'); }
  if (s.body === 'plate' || rank >= 1) { blob(tx + tw - 2, ty - 1, 4, 3, trim ?? steel); blob(tx - 1, ty, 3, 3, steel); }
  // ---- head / helmet ----
  const H = (x: number, y: number) => [hx + x, hy + y] as const;
  const face = () => { blob(hx + 1, hy + 2, hs - 1, hs - 2, SKIN); const [ex, ey] = H(Math.round(hs * 0.55), Math.round(hs * 0.55)); P1(ex, ey, INK); P1(ex + 2, ey, INK); P1(ex + 1, ey + 2, SKIN[2]); };
  const helmC = s.body === 'cloth' || s.body === 'leather' ? (rank >= 2 ? steel : ['#a0a6ae', '#7e848c', '#5a6068', '#3a3e44'] as Ramp) : steel;
  switch (s.helm) {
    case 'none': face(); R(hx + 1, hy + 1, hs - 2, 2, '#5a3a1e'); R(hx + 1, hy + 3, 2, 3, '#5a3a1e'); P1(hx + 2, hy + 1, '#7a5a3a'); break;
    case 'straw': face(); R(hx - 2, hy + 3, hs + 4, 1, '#e8c060'); blob(hx + 1, hy, hs - 2, 4, ['#f4dc80', '#d8b048', '#a8822a', '#7a5a18'], false); R(hx + 1, hy + 3, hs - 2, 1, '#8a2a20'); break;
    case 'cap': face(); blob(hx + 1, hy, hs - 1, 4, s.tab === SPECS.villager.tab ? ['#ffffff', '#e8e0c8', '#b8b098', '#888070'] : LEATHER); R(hx + 1, hy + 3, 2, 3, LEATHER[2]); break;
    case 'hood': case 'feather': { const hr2 = ramp(s.helm === 'hood' ? s.hood! : s.tab); blob(hx, hy, hs + 1, hs + 1, hr2); blob(hx + 3, hy + 3, hs - 3, hs - 4, SKIN, false); const [ex, ey] = H(Math.round(hs * 0.6), Math.round(hs * 0.55)); P1(ex, ey, INK); P1(ex + 2, ey, INK);
      if (s.helm === 'feather') { R(hx + 2, hy - 2, 1, 3, '#d03a2a'); P1(hx + 1, hy - 3, '#f05a3a'); R(hx, hy + 2, hs + 1, 1, GOLD[1]); } break; }
    case 'kettle': face(); blob(hx + 1, hy - 1, hs - 1, 4, helmC); R(hx - 1, hy + 3, hs + 3, 1, helmC[2]); R(hx - 1, hy + 2, hs + 3, 1, helmC[0]); break;
    case 'nasal': face(); blob(hx + 1, hy - 1, hs - 1, 5, helmC); P1(hcx, hy - 2, helmC[1]); R(hx + Math.round(hs * 0.7), hy + 4, 1, 3, helmC[1]); R(hx + 1, hy + 4, 2, 4, helmC[2]); break;
    case 'sallet': face(); blob(hx, hy - 1, hs + 1, 6, helmC); R(hx - 2, hy + 4, 4, 2, helmC[2]); R(hx + 4, hy + 4, hs - 3, 1, INK); P1(hx + 3, hy, helmC[0]); break;
    case 'bascinet': case 'great': case 'crown': {
      blob(hx, hy, hs + 1, hs + 1, helmC);
      const sy = hy + Math.round(hs * 0.45); R(hx + 3, sy, hs - 2, 1, INK); R(hx + Math.round(hs * 0.7), sy, 1, 4, INK);
      for (let i = 0; i < 2; i++) P1(hx + hs - 2 + i, sy + 3, helmC[3]);
      R(hx + 1, hy + 1, 1, hs - 2, helmC[0]); P1(hx + 2, hy + 1, '#ffffff');
      if (s.helm === 'bascinet') { R(hx + hs + 1, sy - 1, 1, 3, helmC[2]); P1(hx + hs + 2, sy, helmC[3]); }
      if (s.helm === 'crown' || gold) { R(hx + 1, hy, hs - 1, 1, GOLD[1]); for (const x of [1, Math.floor(hs / 2), hs - 1]) P1(hx + x, hy - 1, GOLD[0]); }
      else R(hx + 2, hy, hs - 3, 1, helmC[0]);
      break;
    }
  }
  // plume
  if ((rank >= 2 || s === SPECS.knight || s === SPECS.mknight || s === SPECS.royalguard) && !['straw', 'cap', 'hood', 'none', 'feather'].includes(s.helm)) {
    const pr = gold ? GOLD : s === SPECS.knight || s === SPECS.mknight ? ramp('#3a7a8a') : ramp('#c0302a');
    R(hx + 2, hy - 2, 3, 2, pr[1]); R(hx, hy - 1, 2, 3, pr[2]); P1(hx + 3, hy - 3, pr[0]); P1(hx - 1, hy + 1, pr[3]); P1(hx + 2, hy - 2, pr[0]);
  }
  // ---- weapon (front hand) ----
  const wx = mounted ? 12 : 16 + atk, wy = mounted ? ty + 3 : ty + 4;
  const blade = (x: number, top: number, len: number, wide = 2) => { R(x, top, 1, len, '#ffffff'); R(x + 1, top, wide - 1, len, rank >= 3 ? '#d6dde5' : '#b6bec8'); R(x + wide - 1, top + 1, 1, len - 1, '#7e8894'); P1(x + Math.floor(wide / 2), top - 1, '#d6dde5'); };
  switch (s.weapon) {
    case 'sword': case 'longsword': case 'greatsword': {
      const len = s.weapon === 'sword' ? 7 : s.weapon === 'longsword' ? 9 : 11, wide = s.weapon === 'sword' ? 2 : 3;
      if (f === 5) { R(wx + 1, wy - 1, 5, 2, '#d6dde5'); R(wx + 1, wy - 1, 5, 1, '#ffffff'); R(wx, wy - 3, 1, 5, GOLD[2]); }
      else { const top = wy - len - (f === 4 ? 2 : 0); blade(wx, top, len, wide); R(wx - 1, wy - (f === 4 ? 2 : 0), wide + 2, 1, trim ? GOLD[1] : GOLD[2]); R(wx + Math.floor(wide / 2), wy + 1 - (f === 4 ? 2 : 0), 1, 2, WOOD[2]); }
      break;
    }
    case 'spear': case 'pike': case 'halberd': case 'fork': {
      const top = s.weapon === 'pike' ? 0 : 2, x = wx + 1 + Math.max(0, atk);
      R(x, top + 2, 1, 22 - top - 3, WOOD[1]); P1(x, top + 3, WOOD[0]);
      if (s.weapon === 'fork') { R(x - 1, top + 1, 3, 1, '#7e8894'); for (const dx of [-1, 0, 1]) R(x + dx, top - 1, 1, 2, '#b6bec8'); }
      else { R(x, top, 1, 3, '#ffffff'); P1(x - 1, top + 2, '#b6bec8'); P1(x + 1, top + 2, '#7e8894'); }
      if (s.weapon === 'halberd') { blob(x + 1, top + 3, 3, 4, steel, false); P1(x - 1, top + 4, '#b6bec8'); }
      break;
    }
    case 'mace': case 'club': case 'hammer': {
      const up = f === 4 ? 2 : 0; R(wx + 1, wy - 6 - up, 1, 8, WOOD[1]);
      if (s.weapon === 'mace') { blob(wx, wy - 9 - up, 3, 3, steel, false); P1(wx + 1, wy - 10 - up, '#eef2f6'); P1(wx + 3, wy - 8 - up, '#7e8894'); P1(wx - 1, wy - 8 - up, '#b6bec8'); }
      else if (s.weapon === 'club') blob(wx, wy - 9 - up, 3, 5, WOOD);
      else { R(wx - 1, wy - 8 - up, 4, 2, '#7e8894'); R(wx - 1, wy - 8 - up, 4, 1, '#b6bec8'); }
      break;
    }
    case 'bow': case 'longbow': {
      const h = s.weapon === 'bow' ? 11 : 15, top = wy - Math.floor(h / 2) - 1, bw = gold ? GOLD : s.weapon === 'longbow' ? WOOD : ['#d6a060', '#a87438', '#7a4e20', '#4e3010'] as Ramp;
      for (let j = 0; j < h; j++) { const bend = j < 2 || j > h - 3 ? 0 : j < 4 || j > h - 5 ? 1 : 2; P1(wx + bend, top + j, bw[1]); P1(wx + bend + 1, top + j, bw[2]); }
      const pull = f === 4 ? -3 : 0; for (let j = 1; j < h - 1; j++) P1(wx + Math.round(pull * (1 - Math.abs(j - h / 2) / (h / 2))), top + j, '#f0e8d8');
      if (f === 4) { R(wx - 3, wy - 1, 7, 1, WOOD[0]); P1(wx + 4, wy - 1, '#d6dde5'); }
      R(tx - 1, ty + 1, 2, 6, LEATHER[2]); P1(tx - 1, ty, '#f0e8d8'); P1(tx, ty, '#c02a2a'); break;
    }
    case 'xbow': R(wx - 4, wy, 8, 2, WOOD[1]); R(wx - 4, wy, 8, 1, WOOD[0]); R(wx + 3, wy - 3, 1, 8, '#7e8894'); if (f !== 5) R(wx - 2, wy - 1, 4, 1, '#d6dde5'); R(tx - 1, ty + 1, 2, 5, LEATHER[2]); break;
    case 'lance': for (let j = 0; j < 10; j++) { const x = 10 + j + atk, y = wy - Math.round(j * 0.55); P1(x, y, j > 9 ? '#ffffff' : WOOD[0]); P1(x, y + 1, j > 9 ? '#7e8894' : WOOD[2]); } if (s.trim) { R(16 + atk, wy - 5, 2, 2, s.trim); } break;
  }
  if (s.weapon !== 'none' && s.weapon !== 'lance') blob(wx, wy, 3, 3, s.body === 'plate' ? steel : SKIN, false);
  // ---- shield (front, near side) ----
  const sc = ramp(s.shieldCol ?? s.tab), sx = mounted ? 3 : 0, sy = mounted ? ty + 1 : ty;
  const rim = trim ?? steel, cross = s === SPECS.knight || s === SPECS.mknight;
  if (s.shield === 'buckler') { blob(sx + 1, sy + 3, 4, 4, steel); P1(sx + 2, sy + 4, '#ffffff'); P1(sx + 3, sy + 5, GOLD[1]); }
  if (s.shield === 'round') { blob(sx, sy + 1, 7, 7, sc); R(sx + 1, sy + 1, 5, 1, rim[0]); blob(sx + 2, sy + 3, 3, 3, steel); }
  if (s.shield === 'heater' || s.shield === 'kite') {
    const h = mounted ? 6 : s.shield === 'kite' ? 11 : 9, w = mounted ? 4 : 7;
    for (let j = 0; j < h; j++) { const ins = j < h - 4 ? 0 : j - (h - 4) + 0; const x0 = sx + ins, x1 = sx + w - 1 - ins; if (x1 < x0) break; for (let x = x0; x <= x1; x++) P1(x, sy + j, x === x0 ? sc[0] : x === x1 ? sc[2] : j === 0 ? rim[0] : sc[1]); }
    R(sx, sy, w, 1, rim[1]);
    if (cross) { R(sx + Math.floor(w / 2), sy + 1, 1, h - 3, '#d02a2a'); R(sx + 1, sy + 3, w - 2, 1, '#d02a2a'); P1(sx + Math.floor(w / 2) + 1, sy + 1, '#8a1a1a'); }
    else P1(sx + Math.floor(w / 2), sy + 3, GOLD[0]);
  }
  if (s.shield === 'tower') { blob(sx - 1, sy - 2, 7, 12, sc, false); R(sx - 1, sy - 2, 7, 1, rim[0]); R(sx - 1, sy - 2, 1, 12, rim[1]); R(sx + 2, sy, 1, 8, rim[1]); R(sx, sy + 3, 5, 1, rim[1]); }
}

/** One 2x sheet with every class, rank and frame, drawn in chunky pixels with crisp outlines. */
export function soldierSheet(): HTMLCanvasElement {
  const n = SHEET_CLASSES.length * RANKS_N, rows = Math.ceil(n / PER_ROW);
  const [base, c] = canvas(PER_ROW * FRAMES * FW, rows * FH);
  for (const cls of SHEET_CLASSES) for (let rk = 0; rk < RANKS_N; rk++) for (let f = 0; f < FRAMES; f++) {
    const { x, y } = frameRect(cls, rk, f);
    c.save(); c.beginPath(); c.rect(x + 1, y + 1, FW - 2, FH - 1); c.clip();
    drawUnit(c, x, y, SPECS[cls], rk, f); c.restore();
    outline(base, INK, x, y, FW, FH);
  }
  const [cv, c2] = canvas(base.width * HD, base.height * HD); c2.imageSmoothingEnabled = false; c2.drawImage(base, 0, 0, cv.width, cv.height);
  return cv;
}

export const entryIndex = (cls: string, rank: number) => SHEET_CLASSES.indexOf(cls as TClass) * RANKS_N + rank;
export const frameRect = (cls: string, rank: number, f: number) => {
  const e = entryIndex(cls, rank), col = e % PER_ROW, row = Math.floor(e / PER_ROW);
  return { x: (col * FRAMES + f) * FW, y: row * FH };
};
/** One sheet with every class, rank and frame. */
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
