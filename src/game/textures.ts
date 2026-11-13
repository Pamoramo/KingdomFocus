import type Phaser from 'phaser';
import { soldierSheet, blockSheet, SHEET_CLASSES, RANKS_N, FRAMES, FW, FH, frameRect, BW, BH } from './art/soldiers.ts';
import { drawBuilding, drawTile, scaffold, type Art } from './art/buildings.ts';
import { terrainTile, decoration, waterTile, glow, banner, type Deco } from './art/misc.ts';
import { canvas, r, hex } from './art/px.ts';
import { TCLASSES, type BKind } from '../lib/economy.ts';

export const DECOS: Deco[] = ['rock', 'boulder', 'deadbush', 'tree', 'flowers', 'deadtree', 'pine', 'bush', 'stump', 'reeds'];
export const sFrame = (cls: string, rank: number, f: number) => `${cls}|${rank}|${f}`;
export const bFrame = (cls: string, rank: number) => `${cls}|${rank}`;

export function makeTextures(scene: Phaser.Scene) {
  const T = scene.textures, add = (k: string, c: HTMLCanvasElement) => { if (!T.exists(k)) T.addCanvas(k, c); };
  for (let i = 0; i < 4; i++) for (const t of ['dirt', 'cracked', 'mix', 'grass', 'lush'] as const) add(`t_${t}${i}`, terrainTile(t, i * 5 + t.length));
  for (const d of DECOS) for (let i = 0; i < 2; i++) add(`d_${d}${i}`, decoration(d, i));
  if (!T.exists('soldiers')) {
    const tex = T.addCanvas('soldiers', soldierSheet())!;
    for (const cls of SHEET_CLASSES) for (let rk = 0; rk < RANKS_N; rk++) for (let f = 0; f < FRAMES; f++) { const { x, y } = frameRect(cls, rk, f); tex.add(sFrame(cls, rk, f), 0, x, y, FW, FH); }
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
  if (!meta.has(key)) { const art = drawBuilding(kind, lvl, f); meta.set(key, art); if (!scene.textures.exists(key)) scene.textures.addCanvas(key, art.cv); }
  return { key, art: meta.get(key)! };
}
export function tileTex(scene: Phaser.Scene, kind: 'road' | 'palisade' | 'wall' | 'courtyard' | 'moat', lvl: number, mask: number, f = 0, bridge = false) {
  const key = `tl_${kind}${lvl}_${mask}_${f}_${bridge ? 1 : 0}`;
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, drawTile(kind, lvl, mask, f, bridge));
  return key;
}
export function waterTex(scene: Phaser.Scene, land: number, f: number) {
  const key = `w_${land}_${f}`; if (!scene.textures.exists(key)) scene.textures.addCanvas(key, waterTile(land, f)); return key;
}
export function scaffoldTex(scene: Phaser.Scene, kind: BKind) {
  const key = `sc_${kind}`; if (!scene.textures.exists(key)) scene.textures.addCanvas(key, scaffold(kind)); return key;
}
export function bannerTex(scene: Phaser.Scene, color: number, emblem: string, f: number) {
  const key = `ban_${color}_${emblem}_${f}`; if (!scene.textures.exists(key)) scene.textures.addCanvas(key, banner(hex(color), emblem, f)); return key;
}
export { FW, FH, BW, BH };
