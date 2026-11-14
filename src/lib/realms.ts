// Procedural layouts for rival kingdoms: each has its own biome and a town shaped by its ruler.
import type { BKind } from './economy.ts';
import type { Rival, WorldState } from './war.ts';
import { hash } from './names.ts';

export type Biome = 'grassland' | 'desert' | 'tundra' | 'forest' | 'swamp' | 'highlands';
export const BIOME_NAME: Record<Biome, string> = { grassland: 'Green grasslands', desert: 'Sun-baked desert', tundra: 'Frozen tundra', forest: 'Deep forest', swamp: 'Misty swamp', highlands: 'Rocky highlands' };
const ORDER: Biome[] = ['grassland', 'desert', 'tundra', 'forest', 'swamp', 'highlands'];

/** Each kingdom gets a different biome (stable for a given world); the bandits hide in the highlands. */
export function biomeOf(w: Pick<WorldState, 'seed' | 'rivals'>, r: Pick<Rival, 'id' | 'bandits'>): Biome {
  if (r.bandits) return 'highlands';
  const kingdoms = w.rivals.filter((x) => !x.bandits), i = Math.max(0, kingdoms.findIndex((x) => x.id === r.id));
  const shuffled = [...ORDER].sort((a, b) => (hash(a + w.seed) % 997) - (hash(b + w.seed) % 997));
  return shuffled[i % shuffled.length];
}

export const RW = 64, RH = 48; // realm map size in tiles
export interface Placed { kind: BKind; x: number; y: number; level: number }
export interface RealmLayout { biome: Biome; buildings: Placed[]; walls: { x: number; y: number }[]; wallKind: 'palisade' | 'wall'; wallLevel: number; gate: { x: number; y: number }; box: { x0: number; y0: number; x1: number; y1: number } }
const SIZE: Partial<Record<BKind, [number, number]>> = { keep: [4, 4], greathall: [4, 3], tower: [2, 2], gatehouse: [3, 2], gate: [2, 1], house: [2, 2], hut: [2, 2], farm: [3, 3], market: [3, 3], blacksmith: [2, 2], storehouse: [2, 2], barracks: [3, 3], range: [3, 3], trainfield: [3, 3], stable: [3, 2], armory: [3, 2], guardhouse: [2, 2], well: [1, 1], watchtower: [2, 2], camp: [4, 3] };

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** The castle sits at the top centre with its gate to the south; town quarters flank it; the southern approach stays open. */
export function realmLayout(w: Pick<WorldState, 'seed' | 'rivals'>, r: Rival): RealmLayout {
  const R = rng(hash(r.id) + w.seed), biome = biomeOf(w, r), L = r.bandits ? 1 : Math.max(1, Math.min(5, r.level));
  const occ = new Set<string>(), buildings: Placed[] = [];
  let approach = (_x: number, _y: number) => false; // the open ground south of the gate, kept clear for armies
  const free = (k: BKind, x: number, y: number) => { const [bw, bh] = SIZE[k] ?? [2, 2]; for (let i = -1; i <= bw; i++) for (let j = -1; j <= bh; j++) if (occ.has(`${x + i},${y + j}`) || approach(x + i, y + j) || x < 1 || y < 1 || x + bw > RW - 1 || y + bh > RH - 1) return false; return true; };
  const put = (k: BKind, x: number, y: number, level = 1, force = false) => { if (!force && !free(k, x, y)) return false; const [bw, bh] = SIZE[k] ?? [2, 2]; for (let i = 0; i < bw; i++) for (let j = 0; j < bh; j++) occ.add(`${x + i},${y + j}`); buildings.push({ kind: k, x, y, level }); return true; };
  const scatter = (k: BKind, n: number, level: number, x0: number, x1: number, y0: number, y1: number) => { for (let t = 0, done = 0; done < n && t < 200; t++) if (put(k, x0 + Math.floor(R() * (x1 - x0)), y0 + Math.floor(R() * (y1 - y0)), level)) done++; };

  // castle walls: a box around the keep, wider for grander castles
  const half = 6 + L, top = 4, bottom = 13 + L * 1.5 | 0, cx = 32;
  const box = { x0: cx - half, y0: top, x1: cx + half - 1, y1: bottom };
  const wallKind = L === 1 ? 'palisade' as const : 'wall' as const, wallLevel = L >= 4 ? 2 : 1;
  const gate = { x: cx - 1, y: box.y1 };
  approach = (x, y) => y > box.y1 && Math.abs(x - (cx - 0.5)) < 13;
  const walls: { x: number; y: number }[] = [];
  for (let x = box.x0; x <= box.x1; x++) { walls.push({ x, y: box.y0 }); if (x < gate.x - 1 || x > gate.x + 2) walls.push({ x, y: box.y1 }); }
  for (let y = box.y0 + 1; y < box.y1; y++) { walls.push({ x: box.x0, y }); walls.push({ x: box.x1, y }); }
  for (const t of walls) occ.add(`${t.x},${t.y}`);
  if (r.bandits) { put('camp', cx - 2, top + 3, 1, true); put('watchtower', cx + 3, top + 2, 1, true); }
  else {
    put('keep', cx - 2, top + 2, L, true);
    if (L >= 4) put('greathall', cx - 8, top + 3, L >= 5 ? 2 : 1, true);
    if (L >= 2) put('barracks', cx + 4, top + 3, Math.min(3, L - 1), true);
    if (L >= 3) put('armory', cx + 4, top + 8, L >= 5 ? 2 : 1);
    if (L >= 2) for (const [tx, ty] of [[box.x0 - 1, box.y0 - 1], [box.x1, box.y0 - 1], [box.x0 - 1, box.y1 - 1], [box.x1, box.y1 - 1]]) put('tower', tx, ty, Math.min(3, L - 1), true);
    if (L >= 3) put('gatehouse', gate.x - 1, gate.y - 1, L >= 5 ? 2 : 1, true); else put('gate', gate.x, gate.y, 1, true);
  }
  if (r.bandits) put('gate', gate.x, gate.y, 1, true);

  // town quarters to the west and east, farms beyond, a clear approach to the south
  const homes = r.bandits ? 2 : 4 + L * 3, lvl = Math.min(3, Math.max(1, L - 1));
  for (const [x0, x1] of [[2, box.x0 - 3], [box.x1 + 3, RW - 3]]) {
    scatter(L >= 3 ? 'house' : 'hut', Math.ceil(homes / 2), L >= 3 ? lvl : Math.min(2, L), x0, x1, 6, 30);
    scatter('farm', 1 + Math.floor(L / 2), Math.min(3, L), x0, x1, 28, 42);
    scatter('well', 1, Math.min(2, L), x0, x1, 10, 28);
  }
  const pers = r.bandits ? 'aggressive' : r.personality;
  if (pers === 'mercantile') { scatter('market', 2, Math.min(2, L), 2, RW - 4, 18, 30); scatter('storehouse', 2, 2, 2, RW - 4, 10, 32); }
  if (pers === 'aggressive') { scatter('trainfield', 1, Math.min(2, L), 2, RW - 4, 14, 32); scatter('range', 1, Math.min(3, L), 2, RW - 4, 14, 32); scatter('watchtower', 2, Math.min(2, L), 2, RW - 4, 8, 34); }
  if (pers === 'honorable') { scatter('stable', 1, Math.min(2, L), 2, RW - 4, 16, 32); scatter('guardhouse', 2, Math.min(2, L), 2, RW - 4, 10, 30); }
  if (pers === 'pious') { scatter('market', 1, 1, 2, RW - 4, 18, 30); if (!buildings.some((b) => b.kind === 'greathall')) scatter('greathall', 1, 1, 2, RW - 4, 10, 26); }
  if (pers === 'treacherous') { scatter('guardhouse', 2, Math.min(2, L), 2, RW - 4, 10, 30); scatter('watchtower', 2, Math.min(2, L), 2, RW - 4, 8, 34); }
  scatter('blacksmith', L >= 2 ? 1 : 0, Math.min(3, L), 2, RW - 4, 12, 30);
  return { biome, buildings, walls, wallKind, wallLevel, gate, box };
}
