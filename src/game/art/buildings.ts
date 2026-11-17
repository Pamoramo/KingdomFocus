import { type C, P, r, px, canvas, outline, shade, rng, stoneBlock, planks, timber, crenel, gable, hip, cone, win, door, flag, pennant, shadow, tent, fire, torch, crate, barrel, hay, fence, crops, dummy, target, awning } from './px.ts';
import { BUILDINGS, type BKind } from '../../lib/economy.ts';

export const EXTRA: Partial<Record<BKind, number>> = { tavern: 30, camp: 24, hut: 14, house: 24, farm: 18, well: 12, market: 16, blacksmith: 20, storehouse: 18, stable: 22, barracks: 32, range: 16, trainfield: 16, watchtower: 52, guardhouse: 28, armory: 30, cavstable: 30, siege: 26, gate: 20, gatehouse: 56, tower: 80, keep: 100, greathall: 38, palace: 88 };
export interface Art { cv: HTMLCanvasElement; lights: [number, number][]; smoke: [number, number][] }
type Draw = (c: C, W: number, H: number, g: number, l: number, f: number, m: Art) => void;

function tower(c: C, x: number, by: number, w: number, h: number, roof: string | null, f: number, seed: number, m: Art, flagCol?: string, base = P.stone) {
  stoneBlock(c, x, by - h, w, h, base, seed); crenel(c, x - 1, by - h - 3, w + 2, base); r(c, x - 1, by - h, w + 2, 1, P.stoneD);
  const cx = x + Math.floor(w / 2) - 1;
  win(c, cx, by - h + 5, f === 1); m.lights.push([cx + 1, by - h + 7]);
  if (h > 24) win(c, cx, by - h + 15);
  let top = by - h - 3;
  if (roof) { const rh = Math.round(w * 1.2); cone(c, x + Math.floor(w / 2), top - rh, w + 4, rh, roof); top -= rh; }
  if (flagCol) flag(c, x + Math.floor(w / 2), top - 12, flagCol, f);
}

const D: Partial<Record<BKind, Draw>> = {
  camp: (c, W, H, g, l, f, m) => {
    shadow(c, 4, H - 16, W - 8, 12);
    tent(c, 4, g + 4, 22, 20, '#d9cfb0'); tent(c, 36, g + 10, 20, 16, P.red);
    fire(c, 30, g + 34, f); m.lights.push([30, g + 32]); m.smoke.push([30, g + 28]);
    flag(c, 22, g - 10, P.red, f); crate(c, 6, g + 32); crate(c, 11, g + 34); barrel(c, 50, g + 32); hay(c, 54, g + 38);
    r(c, 18, g + 40, 7, 2, P.woodD); r(c, 36, g + 42, 7, 2, P.woodD);
  },
  hut: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 8, W - 4, 6);
    if (l === 1) { planks(c, 6, g + 10, 20, 12, 3); gable(c, 3, g - 2, 26, 13, P.thatch); door(c, 13, g + 15, 5, 7); }
    else { timber(c, 5, g + 6, 22, 16); gable(c, 2, g - 8, 28, 15, P.thatch); door(c, 14, g + 14, 5, 8); win(c, 8, g + 10, f === 1); win(c, 22, g + 10); r(c, 22, g - 8, 3, 7, P.stoneD); m.smoke.push([23, g - 9]); m.lights.push([9, g + 12]); }
    crate(c, 27, g + 22);
  },
  house: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 8, W - 4, 6);
    if (l === 1) { stoneBlock(c, 4, g + 14, 24, 8, P.stone, 5); planks(c, 4, g + 6, 24, 9, 4); gable(c, 2, g - 6, 28, 13, P.thatch); door(c, 13, g + 14, 5, 8); win(c, 7, g + 9, f === 1); m.lights.push([8, g + 11]); }
    else if (l === 2) { stoneBlock(c, 4, g + 14, 24, 8, P.stoneL, 6); timber(c, 3, g + 2, 26, 13); gable(c, 1, g - 12, 30, 15, P.roof); door(c, 13, g + 14, 5, 8); win(c, 6, g + 6, f === 1); win(c, 24, g + 6); win(c, 6, g + 15); r(c, 23, g - 12, 3, 8, P.stoneD); m.smoke.push([24, g - 13]); m.lights.push([7, g + 8]); }
    else { stoneBlock(c, 2, g + 0, 28, 22, P.stoneL, 7); hip(c, 0, g - 12, 32, 13, P.slate); door(c, 13, g + 14, 6, 8); for (const x of [5, 10, 21, 26]) { win(c, x, g + 4, f === 1 && x === 5); win(c, x, g + 13); } r(c, 4, g - 14, 3, 6, P.stoneD); r(c, 25, g - 14, 3, 6, P.stoneD); m.smoke.push([5, g - 15], [26, g - 15]); r(c, 4, g + 9, 4, 1, P.leaf); px(c, 5, g + 8, P.red); m.lights.push([6, g + 6]); }
  },
  farm: (c, W, H, g, l, f, m) => {
    crops(c, 2, g + 8, W - 4, W - 12, l >= 2, f); fence(c, 1, g + 4, W - 2); fence(c, 1, H - 5, W - 2);
    if (l >= 2) { planks(c, 3, g - 4, 18, 12, 9, '#8a3a2a'); gable(c, 1, g - 13, 22, 10, P.roofD); door(c, 9, g + 2, 5, 6); hay(c, 24, g + 2); }
    else { hay(c, 5, g + 1); hay(c, 12, g); r(c, 22, g - 2, 1, 7, P.woodD); r(c, 20, g, 5, 1, P.wood); r(c, 21, g - 3, 3, 2, P.thatch); }
    if (l >= 3) { stoneBlock(c, W - 14, g - 10, 9, 20, P.stoneL, 3); cone(c, W - 10, g - 17, 11, 7, P.roof);
      for (let k = 0; k < 4; k++) { const an = f * 0.4 + (k * Math.PI) / 2; for (let t = 1; t < 11; t++) px(c, Math.round(W - 10 + Math.cos(an) * t), Math.round(g - 7 + Math.sin(an) * t), t > 3 ? P.cloth : P.woodD); } }
  },
  well: (c, W, H, g, l, f) => {
    shadow(c, 1, H - 6, 14, 5);
    stoneBlock(c, 2, g + 6, 12, 8, l === 2 ? P.stoneL : P.stone, 4); r(c, 3, g + 6, 10, 2, f ? P.waterL : P.water);
    r(c, 2, g - 4, 1, 10, P.woodD); r(c, 13, g - 4, 1, 10, P.woodD); r(c, 3, g - 1, 10, 1, P.wood); r(c, 8, g, 1, 4, P.stoneD); r(c, 7, g + 3, 3, 2, P.wood);
    if (l === 2) gable(c, 0, g - 10, 16, 7, P.roof); else gable(c, 1, g - 8, 14, 5, P.thatch);
  },
  market: (c, W, H, g, l, f, m) => {
    r(c, 2, g + 2, W - 4, W - 4, l === 2 ? P.stoneL : P.dirtL);
    if (l === 2) { for (let i = 4; i < W - 4; i += 4) for (let j = g + 4; j < H - 4; j += 4) px(c, i, j, P.stoneD); stoneBlock(c, 20, g + 14, 8, 8, P.stone, 2); r(c, 21, g + 14, 6, 2, f ? P.waterL : P.water); r(c, 23, g + 6, 2, 8, P.stoneL); px(c, 24, g + 5, P.waterL); }
    const stall = (x: number, y: number, a: string) => { r(c, x, y + 4, 1, 9, P.woodD); r(c, x + 13, y + 4, 1, 9, P.woodD); planks(c, x, y + 9, 14, 4, x); awning(c, x - 1, y, 16, a, P.cloth); for (let i = 0; i < 4; i++) px(c, x + 2 + i * 3, y + 8, [P.red, P.gold, P.leafL, '#a05acc'][(i + x) % 4]); };
    stall(3, g - 6, P.red); stall(25, g - 6, P.blue); stall(3, g + 20, '#3f7d2c'); if (l === 2) stall(25, g + 20, '#a8722d');
    barrel(c, 20, g + 32); crate(c, 40, g + 36); m.lights.push([10, g + 6], [32, g + 6]);
  },
  blacksmith: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 8, W - 4, 6);
    stoneBlock(c, 2, g + 4, 18, 18, P.stone, 8); planks(c, 18, g + 8, 12, 14, 8);
    gable(c, 0, g - 8, 22, 13, l >= 2 ? P.slate : P.thatch); r(c, 16, g + 4, 16, 4, P.woodD);
    r(c, 6, g + 12, 8, 10, '#2a1a12'); r(c, 7, g + 17, 6, 4, f ? P.fire : '#d0601a'); px(c, 9, g + 16, P.fireL); m.lights.push([10, g + 18]);
    r(c, 20, g + 17, 6, 2, P.stoneDD); r(c, 21, g + 19, 4, 3, P.stoneD); if (f) { px(c, 23, g + 15, P.fireL); px(c, 25, g + 14, P.fire); }
    r(c, 3, g - 14, 5, 10, P.stoneD); m.smoke.push([5, g - 15]);
    if (l >= 3) { for (let i = 0; i < 3; i++) { r(c, 27 - i * 2, g + 9, 1, 8, P.stoneL); } r(c, 22, g + 9, 8, 1, P.woodD); flag(c, 28, g - 12, P.red, f); }
  },
  tavern: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 8, W - 4, 6);
    const base = H - 9, top = l === 1 ? g + 6 : g - 2;
    // the house: timber over a stone ground floor (an alehouse is all timber and thatch)
    if (l === 1) { planks(c, 4, top, W - 8, base - top, 6); gable(c, 2, top - 14, W - 4, 15, P.thatch); }
    else { stoneBlock(c, 4, base - 11, W - 8, 11, l === 3 ? P.stoneL : P.stone, 4); timber(c, 3, top, W - 6, base - 11 - top); r(c, 3, base - 12, W - 6, 1, P.woodD); // the upper storey juts out over the street
      if (l === 2) gable(c, 1, top - 16, W - 2, 17, P.roof); else hip(c, 0, top - 15, W, 16, P.slate); }
    // chimneys, windows glowing with firelight, a broad door
    const ch = (x: number, y: number) => { r(c, x, y, 4, top - y - 1, P.stoneD); r(c, x - 1, y, 6, 2, P.stone); m.smoke.push([x + 2, y - 1]); }; // a stack rising from the roof
    ch(W - 12, top - (l === 1 ? 16 : 20)); if (l >= 3) ch(8, top - 19);
    door(c, 20, base - 10, 8, 10);
    for (const x of [8, 34]) { win(c, x, base - 8, true); m.lights.push([x + 1, base - 6]); }
    if (l >= 2) for (const x of [8, 19, 27, 36]) { win(c, x, top + 3, f === 1 || x === 19); if (x === 19) m.lights.push([x + 1, top + 5]); }
    // the sign: a tankard on a bracket, swinging
    r(c, 30, base - 14, 9, 1, P.woodD); r(c, 37 + (f ? 1 : 0), base - 13, 1, 2, P.woodD);
    r(c, 34 + (f ? 1 : 0), base - 11, 7, 6, P.woodL); r(c, 35 + (f ? 1 : 0), base - 10, 5, 4, P.wood); r(c, 36 + (f ? 1 : 0), base - 10, 2, 3, P.gold); px(c, 38 + (f ? 1 : 0), base - 9, P.gold); px(c, 36 + (f ? 1 : 0), base - 11, P.cloth);
    // barrels, a bench, and for the inn a lantern and a hay cart
    barrel(c, 2, base - 3); barrel(c, 6, base - 2); r(c, 29, base + 1, 10, 1, P.woodD); r(c, 30, base + 2, 1, 2, P.woodD); r(c, 37, base + 2, 1, 2, P.woodD);
    if (l >= 2) { torch(c, 17, base - 9, f); m.lights.push([17, base - 8]); }
    if (l >= 3) { hay(c, W - 9, base - 1); crate(c, W - 6, base + 1); flag(c, 4, top - 24, P.red, f); }
  },
  storehouse: (c, W, H, g, l, f) => {
    shadow(c, 2, H - 8, W - 4, 6);
    if (l === 1) { planks(c, 3, g + 4, 26, 18, 10); gable(c, 1, g - 8, 30, 13, P.woodD); door(c, 11, g + 10, 10, 12); }
    else { stoneBlock(c, 3, g + 2, 26, 20, P.stoneL, 10); gable(c, 1, g - 14, 30, 17, P.roof); door(c, 11, g + 10, 10, 12); win(c, 15, g - 4); }
    barrel(c, 1, g + 18); crate(c, 26, g + 17); hay(c, 24, g + 22);
  },
  stable: (c, W, H, g, l, f) => {
    shadow(c, 2, H - 8, W - 4, 6);
    planks(c, 2, g + 2, W - 4, 20, 11); gable(c, 0, g - 12, W, 15, l === 2 ? P.roof : P.thatch);
    for (let i = 0; i < 4; i++) { const x = 5 + i * 10; r(c, x, g + 9, 7, 13, P.woodD); r(c, x, g + 13, 7, 1, P.woodL); if (i % 2 === f) { r(c, x + 2, g + 9, 4, 3, i % 3 ? '#6b4423' : '#e8e2d4'); px(c, x + 5, g + 10, P.out); } }
    hay(c, 1, g + 24); if (l === 2) { fence(c, 2, g + 26, W - 4); flag(c, W - 4, g - 22, P.red, f); }
  },
  barracks: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 10, W - 4, 8);
    if (l === 1) {
      r(c, 2, g + 18, W - 4, W - 22, P.dirtD); fence(c, 2, g + 16, W - 4);
      for (let i = 0; i < 3; i++) dummy(c, 10 + i * 13, g + 26);
      tent(c, 3, g - 4, 20, 18, '#c9c2a8'); tent(c, 26, g - 2, 18, 16, P.red); fire(c, 24, g + 16, f); m.lights.push([24, g + 14]); m.smoke.push([24, g + 10]);
    } else {
      if (l === 3) stoneBlock(c, 3, g + 4, W - 6, 26, P.stone, 4); else { stoneBlock(c, 3, g + 22, W - 6, 8, P.stone, 4); timber(c, 3, g + 4, W - 6, 18); }
      gable(c, 1, g - 16, W - 2, 21, l === 3 ? P.blue : P.roof);
      door(c, W / 2 - 4, g + 20, 8, 10); win(c, 9, g + 12, f === 1); win(c, W - 11, g + 12); m.lights.push([10, g + 14], [W / 2, g + 24]);
      r(c, 3, g + 34, W - 6, 12, P.dirtD); for (let i = 0; i < 4; i++) { r(c, 8 + i * 10, g + 36, 1, 8, P.stoneD); px(c, 8 + i * 10, g + 35, P.stoneL); }
      torch(c, W / 2 - 7, g + 20, f); torch(c, W / 2 + 6, g + 20, f);
      if (l === 3) { tower(c, 0, g + 32, 9, 34, P.blue, f, 9, m, P.red); tower(c, W - 9, g + 32, 9, 34, P.blue, f, 10, m, P.red); }
    }
  },
  range: (c, W, H, g, l, f, m) => {
    r(c, 2, g + 8, W - 4, W - 12, P.dirtL); for (let i = 0; i < 3; i++) target(c, 9 + i * 14, g + 6);
    fence(c, 2, H - 6, W - 4);
    if (l === 1) { r(c, 6, g - 2, 1, 10, P.woodD); r(c, 40, g - 2, 1, 10, P.woodD); gable(c, 4, g - 8, 39, 7, P.thatch); }
    else { stoneBlock(c, 3, g - 6, 22, 14, l === 3 ? P.stoneL : P.stone, 5); gable(c, 1, g - 18, 26, 13, l === 3 ? P.blue : P.leaf); door(c, 11, g + 1, 6, 7); m.lights.push([14, g + 4]); if (l === 3) { flag(c, 30, g - 14, P.blue, f); flag(c, 42, g - 14, P.gold, f); } }
  },
  trainfield: (c, W, H, g, l, f) => {
    r(c, 2, g + 2, W - 4, W - 4, P.dirtD); for (let i = 0; i < 40; i++) px(c, 3 + ((i * 37) % (W - 6)), g + 3 + ((i * 53) % (W - 6)), P.dirtL);
    fence(c, 1, g, W - 2); fence(c, 1, H - 5, W - 2);
    if (l === 1) { dummy(c, 8, g + 10); dummy(c, 40, g + 10); r(c, 18, g + 4, 12, 2, P.woodD); for (let i = 0; i < 4; i++) r(c, 19 + i * 3, g - 4, 1, 8, i % 2 ? P.stoneL : P.woodL); }
    else { r(c, 4, g + 22, W - 8, 2, P.woodL); for (let i = 4; i < W - 4; i += 4) r(c, i, g + 20, 1, 6, P.woodD); planks(c, 4, g - 6, 22, 8, 3); for (let i = 0; i < 5; i++) pennant(c, 6 + i * 4, g - 14, i % 2 ? P.red : P.blue, f); dummy(c, 40, g + 8); }
  },
  watchtower: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 8, W - 4, 6);
    if (l === 1) {
      for (const x of [5, W - 7]) r(c, x, g - 16, 2, 46, P.woodD);
      for (let y = g; y < H - 2; y += 6) { r(c, 5, y, W - 10, 1, P.wood); for (let t = 0; t < 6; t++) px(c, 7 + t * 3, y + Math.floor(t / 2), P.woodL); }
      planks(c, 2, g - 20, W - 4, 7, 5); gable(c, 1, g - 32, W - 2, 13, P.thatch); torch(c, 4, g - 26, f); m.lights.push([4, g - 25]); flag(c, W / 2, g - 44, P.red, f);
    } else { tower(c, 6, H - 2, W - 12, 46, null, f, 12, m, P.red); r(c, W / 2 - 2, H - 54, 4, 2, f ? P.fire : P.fireL); m.lights.push([W / 2, H - 54]); }
  },
  guardhouse: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 8, W - 4, 6);
    stoneBlock(c, 3, g + 2, 26, 20, P.stone, 13); door(c, 12, g + 12, 8, 10); torch(c, 9, g + 11, f); torch(c, 22, g + 11, f); m.lights.push([9, g + 12], [22, g + 12]);
    if (l === 1) gable(c, 1, g - 10, 30, 13, P.slate); else { crenel(c, 2, g - 1, 28); stoneBlock(c, 8, g - 12, 16, 12, P.stone, 14); crenel(c, 7, g - 15, 18); flag(c, 16, g - 28, P.red, f); }
    win(c, 6, g + 6, f === 1); win(c, 24, g + 6);
  },
  armory: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 8, W - 4, 6);
    stoneBlock(c, 2, g + 2, W - 4, 22, l === 2 ? P.stoneL : P.stone, 15); gable(c, 0, g - 18, W, 21, l === 2 ? P.blue : P.slate);
    door(c, 20, g + 12, 8, 12); m.lights.push([24, g + 16]);
    for (let i = 0; i < 3; i++) { const x = 6 + i * 4; r(c, x, g + 8, 3, 4, [P.red, P.blue, P.gold][i]); px(c, x + 1, g + 9, P.stoneL); }
    for (let i = 0; i < 4; i++) { r(c, 33 + i * 3, g + 10, 1, 12, P.stoneL); px(c, 33 + i * 3, g + 9, '#eef2f6'); } r(c, 32, g + 18, 12, 1, P.woodD);
    if (l === 2) { flag(c, 4, g - 26, P.red, f); flag(c, W - 6, g - 26, P.red, f); r(c, 2, g + 2, W - 4, 1, P.gold); }
  },
  cavstable: (c, W, H, g, l, f) => {
    shadow(c, 2, H - 10, W - 4, 8);
    stoneBlock(c, 2, g + 10, W - 4, 16, P.stone, 16); planks(c, 2, g + 2, W - 4, 9, 6); gable(c, 0, g - 18, W, 21, l === 2 ? P.blue : P.roof);
    for (let i = 0; i < 5; i++) { const x = 6 + i * 11; r(c, x, g + 12, 8, 14, P.woodD); r(c, x, g + 16, 8, 1, P.woodL); if ((i + f) % 2) { r(c, x + 2, g + 12, 4, 3, ['#6b4423', '#e8e2d4', '#2e2a2a'][i % 3]); px(c, x + 5, g + 13, P.out); } }
    r(c, 2, g + 30, W - 4, 16, P.dirtD); fence(c, 2, g + 28, W - 4); hay(c, 6, g + 36); hay(c, 54, g + 38);
    flag(c, 6, g - 30, l === 2 ? P.gold : P.red, f); flag(c, W - 8, g - 30, l === 2 ? P.gold : P.red, f); if (l === 2) r(c, 2, g + 10, W - 4, 1, P.gold);
  },
  siege: (c, W, H, g, l, f) => {
    r(c, 2, g + 6, W - 4, W - 10, P.dirtD);
    planks(c, 2, g - 2, 18, 14, 17); gable(c, 0, g - 12, 22, 11, P.thatch); door(c, 6, g + 4, 8, 8);
    const tb = (x: number, y: number, s: number) => { r(c, x, y, 2, 14 * s, P.woodD); r(c, x + 10 * s, y, 2, 14 * s, P.woodD); r(c, x - 2, y + 14 * s - 2, 16 * s, 2, P.wood); r(c, x, y + 2, 12 * s, 1, P.wood);
      const a = f ? -0.9 : -0.5; for (let t = -6 * s; t < 14 * s; t++) px(c, Math.round(x + 6 * s + Math.cos(a) * t), Math.round(y + 2 + Math.sin(a) * t), P.woodL); r(c, x + 4 * s, y + 6 * s, 4, 4, P.stoneD); };
    tb(26, g - 8, 1); if (l === 2) { tb(6, g + 20, 1); r(c, 30, g + 30, 10, 4, P.wood); r(c, 30, g + 34, 2, 2, P.woodD); r(c, 38, g + 34, 2, 2, P.woodD); r(c, 34, g + 26, 2, 5, P.woodD); }
    for (let i = 0; i < 3; i++) { r(c, 4 + i * 3, g + 30, 2, 2, P.stone); }
  },
  gate: (c, W, H, g, l, f, m) => {
    if (l === 1) { for (const x of [0, W - 4]) { r(c, x, g - 6, 4, 26, P.woodD); r(c, x, g - 7, 4, 1, P.woodL); } r(c, 0, g - 8, W, 3, P.wood); planks(c, 4, g + 2, W - 8, 14, 3); r(c, 15, g + 2, 1, 14, P.out); m.lights.push([2, g - 2]); torch(c, 1, g - 2, f); }
    else { stoneBlock(c, 0, g - 12, W, 28, P.stone, 18); crenel(c, 0, g - 15, W); r(c, 8, g - 2, 16, 18, P.out); for (let i = 9; i < 24; i += 2) r(c, i, g - 1, 1, 17, P.stoneDD); for (let j = g; j < g + 16; j += 3) r(c, 8, j, 16, 1, P.stoneDD); torch(c, 4, g, f); torch(c, W - 5, g, f); m.lights.push([4, g + 1], [W - 5, g + 1]); }
  },
  gatehouse: (c, W, H, g, l, f, m) => {
    const big = l === 2;
    stoneBlock(c, 10, g - 16, W - 20, 48, P.stone, 19); crenel(c, 9, g - 19, W - 18);
    r(c, 16, g + 8, 16, 24, P.out); for (let i = 17; i < 32; i += 2) r(c, i, g + 10, 1, 22, P.stoneDD); for (let j = g + 10; j < g + 32; j += 3) r(c, 16, j, 16, 1, P.stoneDD);
    r(c, 16, g + 6, 16, 2, P.stoneL); win(c, 23, g - 8, f === 1); m.lights.push([24, g - 6]);
    tower(c, 0, H, 12, big ? 62 : 52, big ? P.blue : null, f, 20, m, P.red); tower(c, W - 12, H, 12, big ? 62 : 52, big ? P.blue : null, f, 21, m, P.red);
    torch(c, 13, g + 12, f); torch(c, W - 14, g + 12, f); m.lights.push([13, g + 13], [W - 14, g + 13]);
    if (big) { flag(c, W / 2, g - 34, P.gold, f, 9); r(c, 10, g - 16, W - 20, 2, P.gold); }
  },
  tower: (c, W, H, g, l, f, m) => {
    shadow(c, 1, H - 9, W - 2, 8);
    if (l === 1) tower(c, 4, H - 2, W - 8, 40, null, f, 22, m, P.red);
    else if (l === 2) tower(c, 3, H - 2, W - 6, 50, P.roof, f, 23, m, P.red);
    else { tower(c, 2, H - 2, W - 4, 58, P.blue, f, 24, m, P.gold, P.stoneL); r(c, 2, H - 60, W - 4, 1, P.gold); }
  },
  greathall: (c, W, H, g, l, f, m) => {
    const royal = l === 2;
    shadow(c, 2, H - 10, W - 4, 8);
    stoneBlock(c, 4, g + 4, W - 8, 40, royal ? P.stoneL : P.stone, 25); gable(c, 0, g - 30, W, 36, royal ? P.blue : P.slate);
    r(c, W / 2 - 5, g - 12, 10, 14, P.stoneD); for (let i = 0; i < 3; i++) r(c, W / 2 - 4 + i * 3, g - 10, 2, 10, ['#b02a28', '#3557a8', '#ecc94b'][i]); m.lights.push([W / 2, g - 6]);
    door(c, W / 2 - 6, g + 30, 12, 14); r(c, W / 2 - 8, g + 44, 16, 2, P.stoneL);
    for (const x of [10, 20, W - 22, W - 12]) { win(c, x, g + 16, f === 1); m.lights.push([x + 1, g + 18]); }
    flag(c, 6, g - 24, P.red, f); flag(c, W - 8, g - 24, P.red, f); torch(c, W / 2 - 10, g + 30, f); torch(c, W / 2 + 9, g + 30, f);
    if (royal) { r(c, 4, g + 4, W - 8, 2, P.gold); tower(c, 0, H - 2, 9, 44, P.blue, f, 26, m); tower(c, W - 9, H - 2, 9, 44, P.blue, f, 27, m); }
  },
  keep: (c, W, H, g, l, f, m) => {
    shadow(c, 2, H - 18, W - 4, 16);
    if (l === 1) { // wooden keep on a motte
      c.fillStyle = '#7a6a3a'; c.beginPath(); c.ellipse(W / 2, H - 14, W / 2 - 2, 14, 0, Math.PI, 0); c.fill(); r(c, 2, H - 14, W - 4, 10, '#6a5a32');
      for (let x = 2; x < W - 2; x += 3) { r(c, x, H - 22, 2, 12, P.woodD); px(c, x, H - 23, P.wood); }
      planks(c, 18, g + 4, 28, 40, 30); planks(c, 14, g - 2, 36, 8, 31); gable(c, 12, g - 18, 40, 17, P.thatch);
      door(c, 28, g + 34, 8, 10); win(c, 22, g + 14, f === 1); win(c, 40, g + 14); m.lights.push([23, g + 16]); flag(c, 32, g - 32, P.red, f);
    } else if (l === 2) { // stone keep
      stoneBlock(c, 14, g - 4, 36, 60, P.stone, 32); crenel(c, 13, g - 7, 38); for (const x of [13, 48]) { r(c, x, g - 4, 3, 60, P.stoneD); }
      door(c, 27, g + 44, 10, 12); for (const [x, y] of [[20, 6], [40, 6], [20, 24], [40, 24], [30, 14]]) { win(c, x, g + y, f === 1 && x === 20); m.lights.push([x + 1, g + y + 2]); }
      flag(c, 32, g - 21, P.red, f); torch(c, 24, g + 44, f); torch(c, 39, g + 44, f);
    } else if (l === 3) { // great keep: corner turrets
      stoneBlock(c, 10, g - 14, 44, 70, P.stone, 33); crenel(c, 9, g - 17, 46);
      for (const x of [4, 50]) { stoneBlock(c, x, g - 22, 10, 78, P.stoneL, x); crenel(c, x - 1, g - 25, 12); cone(c, x + 5, g - 36, 12, 11, P.roof); }
      door(c, 26, g + 42, 12, 14); for (const [x, y] of [[18, -4], [44, -4], [18, 14], [44, 14], [31, 4], [31, 24]]) { win(c, x, g + y, f === 1 && y === 14); m.lights.push([x + 1, g + y + 2]); }
      flag(c, 32, g - 31, P.red, f); torch(c, 22, g + 42, f); torch(c, 41, g + 42, f);
    } else { // castle keep / royal keep
      const royal = l === 5, roof = royal ? P.blue : P.roof, top = royal ? 34 : 30;
      stoneBlock(c, 4, g + 20, W - 8, 44, P.stone, 34); crenel(c, 4, g + 17, W - 8);
      stoneBlock(c, 16, top + 6, 32, g + 18 - top, royal ? P.stoneL : P.stone, 35); crenel(c, 15, top + 3, 34);
      for (const [x, y] of [[22, top + 16], [40, top + 16], [31, top + 26]]) { win(c, x, y, f === 1); m.lights.push([x + 1, y + 2]); }
      if (royal) { cone(c, 32, top - 20, 30, 24, roof); flag(c, 32, top - 34, P.gold, f, 9); r(c, 16, top + 6, 32, 2, P.gold); } else flag(c, 32, top - 10, P.red, f);
      tower(c, 0, H - 4, 12, royal ? 66 : 56, roof, f, 36, m, royal ? P.gold : P.red); tower(c, W - 12, H - 4, 12, royal ? 66 : 56, roof, f, 37, m, royal ? P.gold : P.red);
      stoneBlock(c, 24, H - 30, 16, 26, P.stone, 38); crenel(c, 23, H - 33, 18); r(c, 28, H - 22, 8, 18, P.out); for (let i = 29; i < 36; i += 2) r(c, i, H - 21, 1, 17, P.stoneDD);
      torch(c, 22, H - 22, f); torch(c, 41, H - 22, f); m.lights.push([22, H - 21], [41, H - 21]);
      if (royal) { for (const x of [14, 46]) { r(c, x, g + 26, 4, 10, '#7a1d1a'); r(c, x, g + 26, 4, 1, P.gold); px(c, x + 1, g + 30, P.gold); } }
    }
  },
  palace: (c, W, H, g, l, f, m) => {
    const imp = l === 2;
    shadow(c, 2, H - 20, W - 4, 18);
    r(c, 6, H - 18, W - 12, 14, P.stoneL); for (let i = 0; i < 4; i++) r(c, W / 2 - 16 + i * 2, H - 18 + i * 3, 32 - i * 4, 3, shade(P.stoneL, -i * 10));
    stoneBlock(c, 8, g - 10, W - 16, H - 18 - (g - 10), P.stoneL, 40); r(c, 8, g - 10, W - 16, 2, P.gold); crenel(c, 8, g - 13, W - 16, P.stoneL);
    for (let i = 0; i < 7; i++) { const x = 14 + i * 10; for (const y of [g + 2, g + 20, g + 38]) { win(c, x, y, f === 1 && (i + y) % 3 === 0, 4); if (i % 2 === 0) m.lights.push([x + 1, y + 3]); } }
    door(c, W / 2 - 6, g + 50, 12, 16, '#7a1d1a'); r(c, W / 2 - 7, g + 49, 14, 1, P.gold);
    stoneBlock(c, W / 2 - 14, g - 40, 28, 32, P.stoneL, 41); r(c, W / 2 - 14, g - 40, 28, 2, P.gold);
    c.fillStyle = imp ? P.gold : P.blue; c.beginPath(); c.ellipse(W / 2, g - 40, 14, 14, 0, Math.PI, 0); c.fill(); r(c, W / 2, g - 54, 7, 14, imp ? P.goldD : P.blueD);
    flag(c, W / 2, g - 68, P.gold, f, 10); win(c, W / 2 - 2, g - 30, true, 6); m.lights.push([W / 2, g - 27]);
    for (const x of [0, W - 14]) tower(c, x, H - 6, 14, imp ? 84 : 72, imp ? P.gold : P.blue, f, 42 + x, m, P.gold, P.stoneL);
    for (const x of [22, W - 32]) tower(c, x, g - 4, 10, 26, P.blue, f, 50 + x, m);
    for (const x of [18, 40, W - 44, W - 22]) { r(c, x, g + 6, 4, 12, '#5a2a7a'); r(c, x, g + 6, 4, 1, P.gold); px(c, x + 1, g + 10, P.gold); px(c, x + 2, g + 11, P.gold); }
    torch(c, W / 2 - 10, g + 50, f); torch(c, W / 2 + 9, g + 50, f);
    if (imp) for (const x of [12, W - 16]) { cone(c, x + 2, g - 24, 8, 12, P.gold); }
  },
};

/** Renders a building; returns canvas plus light & chimney points for night/smoke effects. */
export function drawBuilding(kind: BKind, lvl: number, f: number): Art {
  const d = BUILDINGS[kind], W = d.w * 16, EH = EXTRA[kind] ?? 0, H = d.h * 16 + EH;
  const [cv, c] = canvas(W, H), m: Art = { cv, lights: [], smoke: [] };
  D[kind]?.(c, W, H, EH, lvl, f, m);
  outline(cv);
  return m;
}

/** Scaffolding overlay for construction animations. */
export function scaffold(kind: BKind): HTMLCanvasElement {
  const d = BUILDINGS[kind], W = d.w * 16, EH = Math.min(EXTRA[kind] ?? 0, 40), H = d.h * 16 + EH, [cv, c] = canvas(W, H);
  for (let x = 1; x < W; x += 8) r(c, x, 4, 1, H - 6, P.woodL);
  for (let y = 8; y < H; y += 9) { r(c, 0, y, W, 1, P.wood); for (let x = 0; x < W; x += 5) px(c, x, y + 1, P.woodD); }
  for (let k = 0; k < W / 8; k++) for (let t = 0; t < 8; t++) px(c, k * 8 + t, 8 + t, P.woodD);
  return cv;
}

// ---------------- tile-based works: road, palisade, wall, courtyard, moat ----------------
export const TILE_H = 30; // tile canvases are 16 wide, 30 tall, ground at bottom 16px
/** Height (px above a wall tile's base) of the wall-walk, where defenders' feet go. Drawn just behind
 *  the tile, the parapet then hides their legs and they show from the waist up between the merlons.
 *  Matches drawTile: an east-west stone wall's top is at canvas y 16 (level 1) or 11 (level 2), and they stand ~5px below it; palisade posts top out at 12. */
export const wallWalk = (kind: 'wall' | 'palisade', lvl: number) => (kind === 'palisade' ? 10 : lvl >= 2 ? 14 : 11);
/** mask bits: 1=N 2=E 4=S 8=W (same-kind or connectable neighbours). */
export function drawTile(kind: 'road' | 'palisade' | 'wall' | 'courtyard' | 'moat', lvl: number, mask: number, f = 0, bridge = false): HTMLCanvasElement {
  const [cv, c] = canvas(16, TILE_H), g = TILE_H - 16, R = rng(mask * 7 + lvl * 31 + f);
  if (kind === 'road') {
    if (bridge) { planks(c, 0, g, 16, 16, 3, lvl === 2 ? P.stone : P.wood); r(c, 0, g, 16, 1, P.woodD); r(c, 0, g + 15, 16, 1, P.woodD); if (!(mask & 1)) r(c, 0, g, 16, 2, P.woodD); if (!(mask & 4)) r(c, 0, g + 14, 16, 2, P.woodD); return cv; }
    const col = lvl === 1 ? '#8e6a3e' : P.stone;
    const seg = (x: number, y: number, w: number, h: number) => { r(c, x, y, w, h, col); for (let i = 0; i < w * h * 0.3; i++) px(c, x + Math.floor(R() * w), y + Math.floor(R() * h), lvl === 1 ? '#7a5a32' : R() < .5 ? P.stoneL : P.stoneD); };
    seg(3, g + 3, 10, 10);
    if (mask & 1) seg(3, g, 10, 3); if (mask & 4) seg(3, g + 13, 10, 3); if (mask & 8) seg(0, g + 3, 3, 10); if (mask & 2) seg(13, g + 3, 3, 10);
    if (lvl === 2) for (let y = g; y < g + 16; y += 3) for (let x = (y % 2) * 2; x < 16; x += 4) { const d = c.getImageData(x, y, 1, 1).data; if (d[3]) px(c, x, y, P.stoneD); }
    return cv;
  }
  if (kind === 'courtyard') {
    if (lvl === 1) { r(c, 0, g, 16, 16, P.stoneL); for (let y = 0; y < 16; y += 4) { r(c, 0, g + y, 16, 1, P.stoneD); for (let x = ((y / 4) % 2) * 4; x < 16; x += 8) r(c, x, g + y, 1, 4, P.stoneD); } }
    else { r(c, 0, g, 16, 16, P.grass); for (let i = 0; i < 20; i++) px(c, Math.floor(R() * 16), g + Math.floor(R() * 16), P.grassL); r(c, 0, g, 16, 2, P.stoneL); r(c, 0, g + 14, 16, 2, P.stoneL); for (let i = 0; i < 4; i++) { px(c, 3 + i * 3, g + 7, [P.red, P.gold, '#e8e8f0', '#d05a8a'][i]); px(c, 3 + i * 3, g + 8, P.leafD); } }
    return cv;
  }
  if (kind === 'moat') {
    r(c, 0, g, 16, 16, P.water); for (let i = 0; i < 6; i++) { const x = Math.floor(R() * 13), y = g + 2 + Math.floor(R() * 12); r(c, x, y, 3, 1, (i + f) % 2 ? P.waterL : P.waterD); }
    if (!(mask & 1)) r(c, 0, g, 16, 2, P.stone); if (!(mask & 4)) r(c, 0, g + 14, 16, 2, P.stoneD); if (!(mask & 8)) r(c, 0, g, 2, 16, P.stone); if (!(mask & 2)) r(c, 14, g, 2, 16, P.stoneD);
    return cv;
  }
  if (kind === 'palisade') {
    const post = (x: number, y: number) => { r(c, x, y - 11, 2, 13, P.wood); px(c, x, y - 12, P.woodL); px(c, x + 1, y - 11, P.woodD); r(c, x, y - 4, 2, 1, P.woodD); };
    const by = g + 10;
    if (mask & 1) { post(7, by - 6); post(7, by - 3); }
    if (mask & 8) { post(0, by); post(3, by); } post(7, by); if (mask & 2) { post(10, by); post(13, by); }
    if (mask & 4) { post(7, by + 3); post(7, by + 6); }
  } else {
    const hgt = lvl === 2 ? 16 : 11, x0 = mask & 8 ? 0 : 3, x1 = mask & 2 ? 16 : 13, top = (mask & 1 ? g - 6 : g + 2) - (hgt - 11), bot = mask & 4 ? g + 16 : g + 12;
    stoneBlock(c, x0, top + 2, x1 - x0, bot - top - 2, lvl === 2 ? P.stoneL : P.stone, mask + 3);
    crenel(c, x0, top - 1, x1 - x0, lvl === 2 ? P.stoneL : P.stone);
    if (lvl === 2 && !(mask & 5)) win(c, 7, top + 5);
  }
  outline(cv); return cv;
}
