// Procedural layouts for rival kingdoms. Each realm gets its own biome, a castle type that fits
// its wealth and ruler, a town sized to its riches, and landscape features (rivers, ponds, lakes).
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

export type CastleType = 'motte' | 'keep' | 'walledtown' | 'hillfort' | 'concentric';
export const CASTLE_NAME: Record<CastleType, string> = { motte: 'Motte-and-bailey', keep: 'Keep-and-bailey castle', walledtown: 'Walled town', hillfort: 'Hill castle', concentric: 'Concentric castle' };
export type Wealth = 'poor' | 'modest' | 'prosperous' | 'rich';
export const RW = 64, RH = 48; // realm map size in tiles
export interface Placed { kind: BKind; x: number; y: number; level: number }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface RealmLayout {
  biome: Biome; type: CastleType; wealth: Wealth; buildings: Placed[];
  walls: { x: number; y: number }[]; wallKind: 'palisade' | 'wall'; wallLevel: number;
  gate: { x: number; y: number }; box: Box; inner: Box | null; water: { x: number; y: number }[]; frozen: boolean; bridges: { x: number; y: number }[];
}
const SIZE: Partial<Record<BKind, [number, number]>> = { keep: [4, 4], greathall: [4, 3], tower: [2, 2], gatehouse: [3, 2], gate: [2, 1], house: [2, 2], hut: [2, 2], farm: [3, 3], market: [3, 3], blacksmith: [2, 2], storehouse: [2, 2], barracks: [3, 3], range: [3, 3], trainfield: [3, 3], stable: [3, 2], armory: [3, 2], guardhouse: [2, 2], well: [1, 1], watchtower: [2, 2], camp: [4, 3] };
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Wealth from army strength relative to castle level: a rich realm builds bigger. */
export function wealthOf(r: Pick<Rival, 'power' | 'level' | 'bandits'>): Wealth {
  if (r.bandits) return 'poor';
  const k = r.power / (120 * r.level ** 2.2);
  return k < 0.8 ? 'poor' : k < 1.1 ? 'modest' : k < 1.4 ? 'prosperous' : 'rich';
}
function castleType(r: Rival, biome: Biome, wealth: Wealth): CastleType {
  if (r.bandits || r.level <= 1) return 'motte';
  // Merchant realms wall the whole town; others ring their castle
  if (r.personality === 'mercantile' && r.level >= 2) return 'walledtown';
  if (r.level >= 4 && (wealth === 'rich' || wealth === 'prosperous' || r.level === 5)) return 'concentric';
  if (biome === 'highlands' || biome === 'tundra') return 'hillfort';
  return r.level === 2 && wealth === 'poor' ? 'motte' : 'keep';
}

/** A closed ring of wall tiles (4-connected, so palisades and walls join up), corners cut by `cut`. */
function ring(b: Box, cut = 0, step = 0): { x: number; y: number }[] {
  const t = new Set<string>(), add = (x: number, y: number) => t.add(`${x},${y}`);
  for (let x = b.x0 + cut; x <= b.x1 - cut; x++) { add(x, b.y0); add(x, b.y1); }
  for (let y = b.y0 + cut; y <= b.y1 - cut; y++) { add(b.x0, y); add(b.x1, y); }
  for (let i = 0; i < cut; i++) for (const [sx, sy, dx, dy] of [[b.x0, b.y0, 1, 1], [b.x1, b.y0, -1, 1], [b.x0, b.y1, 1, -1], [b.x1, b.y1, -1, -1]]) {
    add(sx + dx * (cut - i), sy + dy * i); add(sx + dx * (cut - i - 1), sy + dy * i);
  }
  if (step) for (let y = b.y0; y <= b.y0 + step; y++) add(b.x0 + step, y); // stepped hill wall
  return [...t].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
}

export function realmLayout(w: Pick<WorldState, 'seed' | 'rivals'>, r: Rival): RealmLayout {
  const R = rng(hash(r.id) + w.seed), biome = biomeOf(w, r), L = r.bandits ? 1 : Math.max(1, Math.min(5, r.level));
  const wealth = wealthOf(r), type = castleType(r, biome, wealth), bonus = { poor: -2, modest: 0, prosperous: 2, rich: 4 }[wealth];
  const occ = new Set<string>(), buildings: Placed[] = [], water: { x: number; y: number }[] = [], bridges: { x: number; y: number }[] = [];
  // castle footprint: historical proportions, scaled by level and wealth (a rich lord builds bigger)
  const W0 = Math.max(10, [0, 11, 14, 17, 21, 25][L] + bonus), H0 = Math.max(8, [0, 8, 10, 12, 14, 16][L] + Math.round(bonus / 2));
  const cx = 18 + Math.floor(R() * 28), top = type === 'hillfort' ? 2 : 3 + Math.floor(R() * 3);
  let box: Box = { x0: Math.max(2, Math.min(RW - 3 - W0, cx - Math.floor(W0 / 2))), y0: top, x1: 0, y1: 0 };
  box.x1 = box.x0 + W0 - 1; box.y1 = box.y0 + H0 - 1;
  let inner: Box | null = null;
  if (type === 'walledtown') { box = { ...box, x0: Math.max(2, box.x0 - 6), x1: Math.min(RW - 3, box.x1 + 6), y1: box.y1 + 6 }; const iw = Math.max(11, Math.floor(W0 / 2) + 4), ih = Math.max(9, Math.floor(H0 / 2) + 3), ix = R() < 0.5 ? box.x0 + 2 : box.x1 - 2 - iw; inner = { x0: ix, y0: box.y0 + 2, x1: ix + iw, y1: box.y0 + 2 + ih }; }
  if (type === 'concentric') inner = { x0: box.x0 + 4, y0: box.y0 + 3, x1: box.x1 - 4, y1: box.y1 - 4 };
  const gate = { x: Math.round((box.x0 + box.x1) / 2) - 1, y: box.y1 };
  const approach = (x: number, y: number) => y > box.y1 && Math.abs(x - (gate.x + 0.5)) < 13;
  const free = (k: BKind, x: number, y: number) => { const [bw, bh] = SIZE[k] ?? [2, 2]; for (let i = -1; i <= bw; i++) for (let j = -1; j <= bh; j++) if (occ.has(`${x + i},${y + j}`) || approach(x + i, y + j) || x < 1 || y < 1 || x + bw > RW - 1 || y + bh > RH - 1) return false; return true; };
  const put = (k: BKind, x: number, y: number, level = 1, force = false) => { if (!force && !free(k, x, y)) return false; const [bw, bh] = SIZE[k] ?? [2, 2]; for (let i = 0; i < bw; i++) for (let j = 0; j < bh; j++) occ.add(`${x + i},${y + j}`); buildings.push({ kind: k, x, y, level }); return true; };
  const scatter = (k: BKind, n: number, level: number, x0: number, x1: number, y0: number, y1: number) => { for (let t = 0, done = 0; done < n && t < 300; t++) if (put(k, x0 + Math.floor(R() * Math.max(1, x1 - x0)), y0 + Math.floor(R() * Math.max(1, y1 - y0)), level)) done++; };

  // ---- walls ----
  const wallKind = type === 'motte' ? 'palisade' as const : 'wall' as const, wallLevel = L >= 4 || wealth === 'rich' ? 2 : 1;
  let walls = ring(box, type === 'motte' ? 3 : type === 'hillfort' ? 2 : 0, type === 'hillfort' ? 3 : 0);
  if (inner) walls = [...walls, ...ring(inner, type === 'concentric' ? 1 : 0)];
  const innerGate = inner ? { x: Math.round((inner.x0 + inner.x1) / 2) - 1, y: inner.y1 } : null;
  walls = walls.filter((t) => !(t.y === gate.y && t.x >= gate.x - 1 && t.x <= gate.x + 2) && !(innerGate && t.y === innerGate.y && t.x >= innerGate.x - 1 && t.x <= innerGate.x + 2));
  for (const t of walls) occ.add(`${t.x},${t.y}`);
  // ---- castle core ----
  const core = inner ?? box, kx = type === 'keep' ? (R() < 0.5 ? core.x0 + 2 : core.x1 - 5) : Math.round((core.x0 + core.x1) / 2) - 2;
  if (r.bandits) { put('camp', kx, core.y0 + 2, 1, true); put('watchtower', kx + 5, core.y0 + 1, 1, true); }
  else put('keep', kx, core.y0 + (type === 'motte' ? 2 : 1), L, true);
  if (!r.bandits) {
    const towers = L >= 2 && type !== 'motte' ? [[box.x0 - 1, box.y0 - 1], [box.x1, box.y0 - 1], [box.x0 - 1, box.y1 - 1], [box.x1, box.y1 - 1]] : [];
    if (type === 'concentric' || (L >= 4 && W0 > 18)) towers.push([Math.round((box.x0 + box.x1) / 2), box.y0 - 1], [box.x0 - 1, Math.round((box.y0 + box.y1) / 2)], [box.x1, Math.round((box.y0 + box.y1) / 2)]);
    if (inner) towers.push([inner.x0 - 1, inner.y0 - 1], [inner.x1, inner.y0 - 1]);
    for (const [tx, ty] of towers) put('tower', tx, ty, Math.min(3, L - 1 + (wealth === 'rich' ? 1 : 0)), true);
    if (L >= 3 && type !== 'motte') put('gatehouse', gate.x - 1, gate.y - 1, L >= 5 ? 2 : 1, true); else put('gate', gate.x, gate.y, 1, true);
    if (innerGate) put('gate', innerGate.x, innerGate.y, 2, true);
    const ix0 = box.x0 + 2, ix1 = box.x1 - 3, iy0 = box.y0 + 2, iy1 = box.y1 - 3;
    if (L >= 4) scatter('greathall', 1, L >= 5 ? 2 : 1, ix0, ix1, iy0, iy1);
    if (L >= 2) scatter('barracks', 1, Math.min(3, L - 1), ix0, ix1, iy0, iy1);
    if (L >= 3) scatter('armory', 1, L >= 5 ? 2 : 1, ix0, ix1, iy0, iy1);
    scatter('well', 1, Math.min(2, L), ix0, ix1, iy0, iy1);
    if (type === 'walledtown') { scatter('market', 1 + (wealth === 'rich' ? 1 : 0), Math.min(2, L), ix0, ix1, iy0, iy1); scatter('house', 4 + bonus, Math.min(3, L), ix0, ix1, iy0, iy1); }
  } else put('gate', gate.x, gate.y, 1, true);

  // ---- landscape: rivers, ponds, an oasis, a frozen lake; a moat for concentric castles ----
  const wet = (x: number, y: number) => { if (x < 0 || y < 0 || x >= RW || y >= RH || occ.has(`${x},${y}`) || approach(x, y)) return; occ.add(`${x},${y}`); water.push({ x, y }); };
  if (biome === 'grassland' || biome === 'forest') { const side = box.x0 > RW / 2 ? 6 + Math.floor(R() * 6) : RW - 8 - Math.floor(R() * 6); for (let y = 0; y < RH; y++) { const c = side + Math.round(Math.sin(y / 6 + R() * 0.2) * 2.5); for (let dx = 0; dx < 2; dx++) wet(c + dx, y); } }
  const pond = (px: number, py: number, rad: number) => { for (let y = -rad; y <= rad; y++) for (let x = -rad - 1; x <= rad + 1; x++) if ((x * x) / ((rad + 1) * (rad + 1)) + (y * y) / (rad * rad) <= 1.3 - R() * 0.25) wet(px + x, py + y); };
  const away = () => { for (let t = 0; t < 40; t++) { const x = 4 + Math.floor(R() * (RW - 8)), y = 4 + Math.floor(R() * (RH - 8)); if ((x < box.x0 - 4 || x > box.x1 + 4 || y > box.y1 + 4) && !approach(x, y)) return [x, y]; } return [4, RH - 6]; };
  if (biome === 'swamp') for (let i = 0; i < 6; i++) { const [x, y] = away(); pond(x, y, 2 + Math.floor(R() * 2)); }
  if (biome === 'desert') { const [x, y] = away(); pond(x, y, 2); for (let i = 0; i < 4; i++) occ.delete(`${x + 4},${y + i}`); }
  if (biome === 'tundra') { const [x, y] = away(); pond(x, y, 3); }
  if (type === 'concentric') {
    const m = { x0: box.x0 - 2, y0: box.y0 - 2, x1: box.x1 + 2, y1: box.y1 + 2 };
    for (const t of ring(m)) { if (t.y === m.y1 && t.x >= gate.x && t.x <= gate.x + 1) { bridges.push(t); continue; } if (!occ.has(`${t.x},${t.y}`)) { occ.add(`${t.x},${t.y}`); water.push(t); } }
  }

  // ---- town and fields outside the walls, sized by wealth ----
  const homes = r.bandits ? 2 : Math.max(3, Math.min(26, Math.round(3 + L * 2.5 + bonus * 1.5 + r.power / 900)));
  const homeKind: BKind = L >= 3 ? 'house' : 'hut', hl = L >= 3 ? Math.min(3, L - 1 + (wealth === 'rich' ? 1 : 0)) : Math.min(2, L);
  const lx0 = 2, lx1 = Math.max(3, box.x0 - 2), rx0 = Math.min(RW - 4, box.x1 + 3), rx1 = RW - 3, by = Math.min(RH - 6, box.y1 + 2);
  const zones: [number, number, number, number][] = [];
  if (lx1 - lx0 > 5) zones.push([lx0, lx1, 3, RH - 6]); if (rx1 - rx0 > 5) zones.push([rx0, rx1, 3, RH - 6]); zones.push([2, RW - 4, by, RH - 4]);
  zones.forEach((z, i) => scatter(homeKind, Math.ceil(homes / zones.length) + (i === 0 ? homes % zones.length : 0), hl, ...z));
  const farms = r.bandits ? 0 : Math.max(1, Math.min(7, 1 + Math.floor(L / 2) + bonus / 2));
  zones.forEach((z) => scatter('farm', Math.ceil(farms / zones.length), Math.min(3, L), z[0], z[1], Math.max(z[2], 14), z[3]));
  const pers = r.bandits ? 'aggressive' : r.personality, any = (k: BKind, n: number, lv: number) => zones.forEach((z) => scatter(k, Math.ceil(n / zones.length), lv, ...z));
  if (pers === 'mercantile' && type !== 'walledtown') { any('market', 1 + (wealth === 'rich' ? 1 : 0), Math.min(2, L)); any('storehouse', 2, 2); }
  if (pers === 'aggressive') { any('trainfield', 1, Math.min(2, L)); any('range', 1, Math.min(3, L)); any('watchtower', 2, Math.min(2, L)); }
  if (pers === 'honorable') { any('stable', 1, Math.min(2, L)); any('guardhouse', 1, Math.min(2, L)); }
  if (pers === 'pious') any('market', 1, 1);
  if (pers === 'treacherous') { any('guardhouse', 2, Math.min(2, L)); any('watchtower', 2, Math.min(2, L)); }
  if (L >= 2) any('blacksmith', 1, Math.min(3, L));
  return { biome, type, wealth, buildings, walls, wallKind, wallLevel, gate, box, inner, water, frozen: biome === 'tundra', bridges };
}
