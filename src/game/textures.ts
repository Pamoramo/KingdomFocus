import type Phaser from 'phaser';
import { soldierSheet, blockSheet, SHEET_CLASSES, RANKS_N, FRAMES, FW, FH, frameRect, BW, BH } from './art/soldiers.ts';
import { drawBuilding, drawTile, scaffold, type Art } from './art/buildings.ts';
import { terrainTile, decoration, waterTile, glow, banner, type Deco } from './art/misc.ts';
import { canvas, r, hex, withoutOutline } from './art/px.ts';
import { hdify, HD } from './art/hd.ts';
import { TCLASSES, type BKind } from '../lib/economy.ts';

export const DECOS: Deco[] = ['rock', 'boulder', 'deadbush', 'tree', 'flowers', 'deadtree', 'pine', 'bush', 'stump', 'reeds'];
export const sFrame = (cls: string, rank: number, f: number) => `${cls}|${rank}|${f}`;
export const bFrame = (cls: string, rank: number) => `${cls}|${rank}`;

export function makeTextures(scene: Phaser.Scene) {
  const T = scene.textures, add = (k: string, c: HTMLCanvasElement) => { if (!T.exists(k)) T.addCanvas(k, c); };
  for (let i = 0; i < 4; i++) for (const t of ['dirt', 'cracked', 'mix', 'grass', 'lush'] as const) add(`t_${t}${i}`, hdify(terrainTile(t, i * 5 + t.length), { rim: false, outline: false, grain: 7, seed: i * 31 + t.length }));
  for (const d of DECOS) for (let i = 0; i < 2; i++) add(`d_${d}${i}`, hdify(withoutOutline(() => decoration(d, i)), { seed: i + 3 }));
  if (!T.exists('soldiers')) {
    const sheet = soldierSheet(), tex = T.addCanvas('soldiers', sheet)!;
    // Blitters (used for large armies) cannot scale, so they get a sheet at world resolution.
    const [c1, x1] = canvas(sheet.width / HD, sheet.height / HD); x1.imageSmoothingEnabled = false; x1.drawImage(sheet, 0, 0, c1.width, c1.height);
    const t1 = T.addCanvas('soldiers1x', c1)!;
    for (const cls of SHEET_CLASSES) for (let rk = 0; rk < RANKS_N; rk++) for (let f = 0; f < FRAMES; f++) { const { x, y } = frameRect(cls, rk, f); t1.add(sFrame(cls, rk, f), 0, x, y, FW, FH); }
    for (const cls of SHEET_CLASSES) for (let rk = 0; rk < RANKS_N; rk++) for (let f = 0; f < FRAMES; f++) { const { x, y } = frameRect(cls, rk, f); tex.add(sFrame(cls, rk, f), 0, x * HD, y * HD, FW * HD, FH * HD); }
  }
  if (!T.exists('blocks')) {
    const tex = T.addCanvas('blocks', blockSheet())!;
    TCLASSES.forEach((cls, ci) => { for (let rk = 0; rk < RANKS_N; rk++) tex.add(bFrame(cls, rk), 0, rk * BW, ci * BH, BW, BH); });
  }
  add('glow', glow());
  const [pc, p] = canvas(2, 2); r(p, 0, 0, 2, 2, '#ffffff'); add('px', pc);
  const [ac, a] = canvas(6, 1); r(a, 0, 0, 5, 1, '#c8a060'); r(a, 5, 0, 1, 1, '#e8e8f0'); add('arrow', ac);
}

const meta = new Map<string, Art>();
/** Building texture (lazily generated) plus its light/smoke points. */
export function bTex(scene: Phaser.Scene, kind: BKind, lvl: number, f: number): { key: string; art: Art } {
  const key = `b_${kind}${lvl}_${f}`;
  if (!meta.has(key)) { const art = withoutOutline(() => drawBuilding(kind, lvl, f)); art.cv = hdify(art.cv, { seed: lvl * 7 + kind.length }); meta.set(key, art); if (!scene.textures.exists(key)) scene.textures.addCanvas(key, art.cv); }
  return { key, art: meta.get(key)! };
}
export function tileTex(scene: Phaser.Scene, kind: 'road' | 'palisade' | 'wall' | 'courtyard' | 'moat', lvl: number, mask: number, f = 0, bridge = false) {
  const key = `tl_${kind}${lvl}_${mask}_${f}_${bridge ? 1 : 0}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, hdify(withoutOutline(() => drawTile(kind, lvl, mask, f, bridge)), { outline: kind === 'wall' || kind === 'palisade', rim: kind !== 'moat', seed: mask }));
  return key;
}
export function waterTex(scene: Phaser.Scene, land: number, f: number) {
  const key = `w_${land}_${f}`; if (!scene.textures.exists(key)) scene.textures.addCanvas(key, hdify(waterTile(land, f), { rim: false, outline: false, grain: 4, seed: f })); return key;
}
export function scaffoldTex(scene: Phaser.Scene, kind: BKind) {
  const key = `sc_${kind}`; if (!scene.textures.exists(key)) scene.textures.addCanvas(key, hdify(scaffold(kind), { grain: 3 })); return key;
}
export function bannerTex(scene: Phaser.Scene, color: number, emblem: string, f: number) {
  const key = `ban_${color}_${emblem}_${f}`; if (!scene.textures.exists(key)) scene.textures.addCanvas(key, hdify(withoutOutline(() => banner(hex(color), emblem, f)), { grain: 3 })); return key;
}
export { FW, FH, BW, BH, HD };
/** Display scale for HD textures so world units stay 1 tile = 16. */
export const S = 1 / HD;
