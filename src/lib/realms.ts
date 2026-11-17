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
  // the wide world beyond your old horizon: snow in the north, sand in the south
  const full = w.rivals.find((x) => x.id === r.id);
  if (full && /^w\d/.test(full.id)) { const h = hash(r.id + w.seed) % 2; return full.y < 0.3 ? (h ? 'tundra' : 'highlands') : full.y > 0.7 ? (h ? 'desert' : 'swamp') : (['grassland', 'forest', 'highlands', 'swamp'] as Biome[])[hash(r.id + w.seed) % 4]; }
  const kingdoms = w.rivals.filter((x) => !x.bandits && !/^w\d/.test(x.id)), i = Math.max(0, kingdoms.findIndex((x) => x.id === r.id));
  const shuffled = [...ORDER].sort((a, b) => (hash(a + w.seed) % 997) - (hash(b + w.seed) % 997));
  return shuffled[i % shuffled.length];
}

export type CastleType = 'motte' | 'keep' | 'walledtown' | 'hillfort' | 'concentric';
export const CASTLE_NAME: Record<CastleType, string> = { motte: 'Motte-and-bailey', keep: 'Keep-and-bailey castle', walledtown: 'Walled town', hillfort: 'Hill castle', concentric: 'Concentric castle' };
export type Wealth = 'poor' | 'modest' | 'prosperous' | 'rich';
export const RW = 64, RH = 48; // realm map size in tiles
/** suburb: stands in front of the gate, where besiegers make camp (shown burnt during a siege). */
export interface Placed { kind: BKind; x: number; y: number; level: number; suburb?: boolean }
/** Town features that are not player buildings: the parish church and market stalls. */
export interface Landmark { kind: 'church' | 'stall' | 'windmill'; x: number; y: number; w: number; h: number; v: number; suburb?: boolean }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface RealmLayout {
  biome: Biome; type: CastleType; wealth: Wealth; plan: TownPlan; buildings: Placed[];
  walls: { x: number; y: number }[]; wallKind: 'palisade' | 'wall'; wallLevel: number;
  gate: { x: number; y: number }; box: Box; inner: Box | null; water: { x: number; y: number }[]; frozen: boolean; bridges: { x: number; y: number }[];
  /** the high street and lanes, and the paved market square */
  streets: { x: number; y: number }[]; plaza: { x: number; y: number }[]; landmarks: Landmark[];
}
const SIZE: Partial<Record<BKind, [number, number]>> = { tavern: [3, 2], keep: [4, 4], greathall: [4, 3], tower: [2, 2], gatehouse: [3, 2], gate: [2, 1], house: [2, 2], hut: [2, 2], farm: [3, 3], market: [3, 3], blacksmith: [2, 2], storehouse: [2, 2], barracks: [3, 3], range: [3, 3], trainfield: [3, 3], stable: [3, 2], armory: [3, 2], guardhouse: [2, 2], well: [1, 1], watchtower: [2, 2], camp: [4, 3] };
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

const pers0 = (r: Rival) => r.personality;
export type TownPlan = 'highstreet' | 'crossroads' | 'winding' | 'fork' | 'grid' | 'green';
export const TOWN_PLAN_NAME: Record<TownPlan, string> = { highstreet: 'high-street town', crossroads: 'crossroads town', winding: 'old winding town', fork: 'town where the road forks', grid: 'planned town', green: 'village round a green' };
/** How the town grew: chosen from the realm's character and land, so no two neighbours look alike. */
function townPlan(r: Rival, biome: Biome, L: number, R: () => number): TownPlan {
  const w: Record<TownPlan, number> = { highstreet: 2, crossroads: 1.5, winding: 1.5, fork: 1.5, grid: 0.5, green: 1 };
  if (L <= 1) { w.green += 3; w.winding += 1; w.grid = 0; }
  if (L >= 3) { w.grid += 1; w.green *= 0.4; }
  if (r.personality === 'mercantile') { w.grid += 2.5; w.crossroads += 2; }
  if (r.personality === 'pious') w.green += 2;
  if (r.personality === 'treacherous') w.winding += 2;
  if (r.personality === 'aggressive') { w.highstreet += 1.5; w.fork += 1; }
  if (r.personality === 'honorable') { w.crossroads += 1.5; w.highstreet += 1; }
  if (biome === 'highlands' || biome === 'forest' || biome === 'swamp') w.winding += 2;
  if (biome === 'grassland' || biome === 'desert') { w.grid += 0.5; w.crossroads += 0.5; }
  const ks = Object.keys(w) as TownPlan[]; let roll = R() * ks.reduce((a, k) => a + w[k], 0);
  for (const k of ks) if ((roll -= w[k]) <= 0) return k;
  return 'highstreet';
}
export function realmLayout(w: Pick<WorldState, 'seed' | 'rivals'>, r: Rival): RealmLayout {
  const R = rng(hash(r.id) + w.seed), biome = biomeOf(w, r), L = r.bandits ? 1 : Math.max(1, Math.min(5, r.level));
  const wealth = wealthOf(r), type = castleType(r, biome, wealth), bonus = { poor: -2, modest: 0, prosperous: 2, rich: 4 }[wealth];
  const occ = new Set<string>(), buildings: Placed[] = [], water: { x: number; y: number }[] = [], bridges: { x: number; y: number }[] = [];
  // castle footprint: historical proportions, scaled by level and wealth (a rich lord builds bigger)
  const asp = 0.82 + R() * 0.36; // some lords build long and shallow, others deep
  const W0 = Math.max(10, Math.round(([0, 11, 14, 17, 21, 25][L] + bonus) * asp)), H0 = Math.max(8, Math.round(([0, 8, 10, 12, 14, 16][L] + Math.round(bonus / 2)) / Math.sqrt(asp)));
  const cx = 18 + Math.floor(R() * 28), top = type === 'hillfort' ? 2 : 3 + Math.floor(R() * 3);
  let box: Box = { x0: Math.max(2, Math.min(RW - 3 - W0, cx - Math.floor(W0 / 2))), y0: top, x1: 0, y1: 0 };
  box.x1 = box.x0 + W0 - 1; box.y1 = box.y0 + H0 - 1;
  let inner: Box | null = null;
  if (type === 'walledtown') { box = { ...box, x0: Math.max(2, box.x0 - 6), x1: Math.min(RW - 3, box.x1 + 6), y1: box.y1 + 6 }; const iw = Math.max(11, Math.floor(W0 / 2) + 4), ih = Math.max(9, Math.floor(H0 / 2) + 3), ix = R() < 0.5 ? box.x0 + 2 : box.x1 - 2 - iw; inner = { x0: ix, y0: box.y0 + 2, x1: ix + iw, y1: box.y0 + 2 + ih }; }
  if (type === 'concentric') inner = { x0: box.x0 + 4, y0: box.y0 + 3, x1: box.x1 - 4, y1: box.y1 - 4 };
  // the gate is not always in the middle of the wall: it faces wherever the road came from
  const gOff = type === 'keep' || type === 'hillfort' ? Math.round((R() - 0.5) * (W0 - 9) * 0.6) : 0;
  const gate = { x: Math.max(17, Math.min(RW - 19, Math.round((box.x0 + box.x1) / 2) - 1 + gOff)), y: box.y1 };
  const approach = (x: number, y: number) => y > box.y1 && Math.abs(x - (gate.x + 0.5)) < 13;
  const free = (k: BKind, x: number, y: number) => { const [bw, bh] = SIZE[k] ?? [2, 2]; for (let i = -1; i <= bw; i++) for (let j = -1; j <= bh; j++) if (occ.has(`${x + i},${y + j}`) || approach(x + i, y + j) || x < 1 || y < 1 || x + bw > RW - 1 || y + bh > RH - 1) return false; return true; };
  const put = (k: BKind, x: number, y: number, level = 1, force = false) => { if (!force && !free(k, x, y)) return false; const [bw, bh] = SIZE[k] ?? [2, 2]; for (let i = 0; i < bw; i++) for (let j = 0; j < bh; j++) occ.add(`${x + i},${y + j}`); buildings.push({ kind: k, x, y, level }); return true; };
  const scatter = (k: BKind, n: number, level: number, x0: number, x1: number, y0: number, y1: number) => { for (let t = 0, done = 0; done < n && t < 300; t++) if (put(k, x0 + Math.floor(R() * Math.max(1, x1 - x0)), y0 + Math.floor(R() * Math.max(1, y1 - y0)), level)) done++; };

  // ---- walls ----
  const wallKind = type === 'motte' ? 'palisade' as const : 'wall' as const, wallLevel = L >= 4 || wealth === 'rich' ? 2 : 1;
  let walls = ring(box, type === 'motte' ? 3 : type === 'hillfort' ? 2 : 0, type === 'hillfort' ? 3 : 0);
  if (inner) walls = [...walls, ...ring(inner, type === 'concentric' ? 1 : 0)];
  const innerGate = inner ? { x: Math.round((inner.x0 + inner.x1) / 2) - 1, y: inner.y1 } : null;
  // cut exactly the gate's own footprint so the curtain wall runs right up to it (a 3-wide gatehouse, or a 2-wide gate)
  const house = !r.bandits && L >= 3 && type !== 'motte', g0 = house ? gate.x - 1 : gate.x, g1 = house ? gate.x + 1 : gate.x + 1;
  walls = walls.filter((t) => !(t.y === gate.y && t.x >= g0 && t.x <= g1) && !(innerGate && t.y === innerGate.y && t.x >= innerGate.x && t.x <= innerGate.x + 1));
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
    if (house) put('gatehouse', gate.x - 1, gate.y - 1, L >= 5 ? 2 : 1, true); else put('gate', gate.x, gate.y, 1, true);
    if (innerGate) put('gate', innerGate.x, innerGate.y, 2, true);
    const cb = type === 'walledtown' && inner ? inner : box, ix0 = cb.x0 + 2, ix1 = cb.x1 - 3, iy0 = cb.y0 + 2, iy1 = cb.y1 - 3; // in a walled town the lord builds within the citadel; the town keeps its streets
    if (L >= 4) scatter('greathall', 1, L >= 5 ? 2 : 1, ix0, ix1, iy0, iy1);
    if (L >= 2) scatter('barracks', 1, Math.min(3, L - 1), ix0, ix1, iy0, iy1);
    if (L >= 3) scatter('armory', 1, L >= 5 ? 2 : 1, ix0, ix1, iy0, iy1);
    scatter('well', 1, Math.min(2, L), ix0, ix1, iy0, iy1);
    // what else stands in the bailey depends on the lord: stables and a granary for the wealthy, a drill yard for warlords
    if (L >= 2 && wealth !== 'poor') scatter('stable', 1, Math.min(2, L - 1), ix0, ix1, iy0, iy1);
    if (L >= 3 && R() < 0.7) scatter('storehouse', 1, Math.min(2, L - 1), ix0, ix1, iy0, iy1);
    if (L >= 3 && r.personality === 'aggressive') scatter('trainfield', 1, Math.min(2, L - 1), ix0, ix1, iy0, iy1);
    if (L >= 2 && (r.personality === 'honorable' || r.personality === 'treacherous')) scatter('guardhouse', 1, Math.min(2, L - 1), ix0, ix1, iy0, iy1);
    if (L >= 4 && wealth === 'rich') scatter('blacksmith', 1, 2, ix0, ix1, iy0, iy1);
    // (a walled town's streets and houses are laid out with the rest of the town, below)
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

  // ---- the town: like a real medieval town it crowds the castle gate. A high street runs down from the gate,
  // widening into a paved market square with stalls, a well and the parish church; terraced houses line the
  // street and its back lanes, richer houses near the castle; strip fields lie beyond the last houses ----
  const streets: { x: number; y: number }[] = [], plaza: { x: number; y: number }[] = [], landmarks: Landmark[] = [], paved = new Set<string>();
  const inMap = (x: number, y: number) => x >= 1 && y >= 1 && x < RW - 1 && y < RH - 1;
  const pave = (x: number, y: number, sq = false) => { const k = `${x},${y}`; if (!inMap(x, y) || paved.has(k) || water.some((t) => t.x === x && t.y === y) || bridges.some((t) => t.x === x && t.y === y)) return false; if (occ.has(k)) return false; paved.add(k); occ.add(k); (sq ? plaza : streets).push({ x, y }); return true; };
  const room = (x: number, y: number, w: number, h: number) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) if (!inMap(x + i, y + j) || occ.has(`${x + i},${y + j}`)) return false; return true; };
  const claim = (x: number, y: number, w: number, h: number) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) occ.add(`${x + i},${y + j}`); };
  const homes = r.bandits ? 2 : Math.max(6, Math.min(48, Math.round(6 + L * 5 + bonus * 2 + r.power / 700)));
  const gx = gate.x, street0 = gate.y + 1, plan = r.bandits ? 'highstreet' : townPlan(r, biome, L, R);
  if (r.bandits) { for (let y = street0; y < RH - 1; y++) { pave(gx, y); pave(gx + 1, y); } scatter('hut', homes, 1, 2, RW - 4, Math.min(RH - 6, box.y1 + 3), RH - 4); }
  else {
    // every plan is a set of streets (the main road two tiles wide, side streets one) and a market place
    const main: { x: number; y: number }[] = [], sides: { x: number; y: number }[][] = [];
    const road2 = (x: number, y: number) => { const a = pave(x, y), b = pave(x + 1, y); if (a) main.push({ x, y }); if (b) main.push({ x: x + 1, y }); };
    /** a side street from (x, y) running dx/dy until it meets something, laid tile by tile so it can be trimmed back later */
    const side = (x: number, y: number, dx: number, dy: number, len: number) => { const t: { x: number; y: number }[] = []; for (let i = 0; i < len; i++) { const px = x + dx * i, py = y + dy * i; if (paved.has(`${px},${py}`)) { if (t.length) break; continue; } if (!pave(px, py)) break; t.push({ x: px, y: py }); } if (t.length) sides.push(t); return t; };
    /** a lane leaving the main road at row y, to the west (dir -1) or east (dir 1), starting right beside the road as laid */
    const branch = (y: number, dir: number, len: number, from?: number) => { const row = main.filter((t) => t.y === y && (from === undefined || (dir < 0 ? t.x <= from : t.x >= from))).map((t) => t.x); if (!row.length) return; side(dir < 0 ? Math.min(...row) - 1 : Math.max(...row) + 1, y, dir, 0, len); };
    const square = (x0: number, y0: number, w: number, h: number) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) pave(x, y, true); return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 }; };
    const sqH = L >= 3 ? 5 : 4, laneLen = Math.min(24, 6 + Math.round(homes / 3)), nLanes = Math.ceil(homes / 12) + 1;
    let sq: Box;
    if (plan === 'winding') {
      // an old lane that wanders down the hillside, widening into a long market place on its way
      const amp = 2 + Math.floor(R() * 3), ph = R() * 6, xs: number[] = [];
      for (let y = street0; y < RH - 1; y++) xs.push(gx + Math.round(Math.sin((y - street0) / 5.5 + ph) * amp) - Math.round(Math.sin(ph) * amp));
      xs.forEach((x, k) => { const y = street0 + k, prev = k ? xs[k - 1] : x; for (let xx = Math.min(x, prev); xx <= Math.max(x, prev); xx++) road2(xx, y); });
      const my = street0 + 6 + Math.floor(R() * 3); sq = square(xs[my - street0] - 3, my, 8, sqH + 1);
      for (let k = 0, y0 = street0 + 2; k < nLanes + 1; k++) { const y = (k === 0 ? y0 : sq.y1 + 4 + (k - 1) * 5); if (y >= RH - 3) break; if (y >= sq.y0 - 1 && y <= sq.y1 + 1) continue; const x = xs[y - street0]; side(x - 1, y, -1, 0, Math.max(6, laneLen - k * 3)); if (R() < 0.75) side(x + 2, y, 1, 0, Math.max(5, laneLen - k * 4)); }
    } else if (plan === 'fork') {
      // the road splits below the gate around a triangular market place, each branch heading for its own village
      const stem = 5 + Math.floor(R() * 3); for (let y = street0; y < street0 + stem; y++) road2(gx, y);
      const fy = street0 + stem; sq = square(gx - 3, fy - 2, 8, sqH);
      for (const dx of [-1, 1]) { let x = dx < 0 ? sq.x0 - 1 : sq.x1; for (let y = sq.y1 + 1; y < RH - 1; y++) { const n = main.length; road2(x, y); if (main.length - n < 2) break; if ((y - fy) % 2 === 0) x += dx; if (x < 2 || x > RW - 4) break; } } // a branch ends at a river or the map's edge
      // lanes off the stem beside the gate, between the branches, and out from each branch
      side(gx - 1, street0 + 2, -1, 0, 8); side(gx + 2, street0 + 2, 1, 0, 8);
      for (let k = 0; k < nLanes; k++) { const y = sq.y1 + 3 + k * 5; if (y >= RH - 3) break; branch(y, -1, Math.max(4, laneLen / 2 - k * 2), gx); branch(y, 1, Math.max(4, laneLen / 2 - k * 2), gx + 1); }
      for (let y = sq.y1 + 1; y < RH - 1; y++) { /* a footpath straight on, between the branches */ if (!pave(gx, y)) break; }
    } else if (plan === 'crossroads') {
      // two roads cross below the castle; the market is held at the crossing
      const cy = street0 + 5 + Math.floor(R() * 4); for (let y = street0; y < RH - 1; y++) road2(gx, y);
      sq = square(gx - 3, cy - 2, 8, sqH + 1);
      const ry = Math.floor((sq.y0 + sq.y1) / 2); for (let x = sq.x0 - 1; x >= 1; x--) { if (!pave(x, ry) || !pave(x, ry + 1)) break; main.push({ x, y: ry }); } for (let x = sq.x1 + 1; x < RW - 1; x++) { if (!pave(x, ry) || !pave(x, ry + 1)) break; main.push({ x, y: ry }); }
      for (let k = 0; k < nLanes - 1; k++) { const y = sq.y1 + 6 + k * 6; if (y >= RH - 3) break; side(gx - 1, y, -1, 0, laneLen - 4); side(gx + 2, y, 1, 0, laneLen - 4); }
      for (const x of [gx - 9, gx + 10]) side(x, ry - 1, 0, -1, 4);
    } else if (plan === 'grid') {
      // a planned town: straight parallel streets, regular blocks, the market filling one block by the gate
      for (let y = street0; y < RH - 1; y++) road2(gx, y);
      sq = square(gx - 4, street0 + 2, 10, sqH);
      const step = 5, blocks = Math.min(4, 1 + Math.ceil(homes / 16)), px0 = gx - 7, px1 = gx + 8;
      // two parallel streets; cross streets join them to the high street block by block. Each runs only as far as its houses do.
      for (let x = px0; x <= px1 + 1; x++) if (pave(x, sq.y1 + 1)) main.push({ x, y: sq.y1 + 1 });
      for (const x of [px0, px1 + 1]) { for (let y = street0 + 2; y <= sq.y1; y++) pave(x, y); side(x, sq.y1 + 2, 0, 1, step * blocks); }
      for (let k = 1; k <= blocks; k++) { const y = sq.y1 + 1 + k * step; if (y >= RH - 2) break; side(gx - 1, y, -1, 0, 6); side(gx + 2, y, 1, 0, 6); side(px0 - 1, y, -1, 0, 5); side(px1 + 2, y, 1, 0, 5); }
      side(px0 - 1, sq.y1 + 1, -1, 0, 5); side(px1 + 2, sq.y1 + 1, 1, 0, 5);
    } else if (plan === 'green') {
      // a village round a common green, the church at its head; the road skirts one side
      const gw = 9 + Math.min(4, L), gh = 6 + Math.min(3, L), g0x = gx - Math.floor(gw / 2) + 1, g0y = street0 + 3;
      for (let y = street0; y < g0y; y++) road2(gx, y);
      sq = square(gx - 3, g0y - 2, 8, 4); // the market at the head of the green
      claim(g0x, g0y + 2, gw, gh); // the green itself: grass, open to all
      for (let y = g0y + 2; y < g0y + 2 + gh; y++) { pave(g0x - 1, y); pave(g0x + gw, y); }
      for (let x = g0x - 1; x <= g0x + gw; x++) { pave(x, g0y + 2 + gh); pave(x, g0y + 1); } // paths round the green, meeting the market at its head
      const roadX = R() < 0.5 ? g0x - 1 : g0x + gw; for (let y = g0y + 3 + gh; y < RH - 1; y++) road2(roadX - (roadX < gx ? 1 : 0), y);
      for (const dx of [-1, 1]) side(dx < 0 ? g0x - 2 : g0x + gw + 1, g0y + 4, dx, 0, 6 + L); // lanes off the green
      for (let k = 0; k < nLanes - 1; k++) { const y = g0y + gh + 5 + k * 5; if (y >= RH - 3) break; branch(y, -1, laneLen - 6); branch(y, 1, laneLen - 6); }
    } else {
      // the high street: straight down from the gate, the square just below it, back lanes off it
      for (let y = street0; y < RH - 1; y++) road2(gx, y);
      sq = square(gx - 3, street0 + 2, 8, sqH);
      for (let k = 0; k < nLanes; k++) { const y = sq.y1 + 5 + k * 6; if (y >= RH - 4) break; side(gx - 1, y, -1, 0, laneLen); side(gx + 2, y, 1, 0, laneLen); }
    }
    // the parish church on the market place, stalls round its edge, the well at its heart
    church: for (const dy of [-1, 0, 1, 2, -2]) for (const cx of [sq.x0 - 4, sq.x1 + 1, sq.x0 - 3, sq.x1 + 2]) if (room(cx, sq.y0 + dy, 3, 4)) { claim(cx, sq.y0 + dy, 3, 4); landmarks.push({ kind: 'church', x: cx, y: sq.y0 + dy, w: 3, h: 4, v: 0 }); break church; }
    const stalls = Math.min(6, 2 + L + (wealth === 'rich' || pers0(r) === 'mercantile' ? 2 : 0));
    const spots = [[sq.x0, sq.y0], [sq.x1, sq.y0], [sq.x0, sq.y1], [sq.x1, sq.y1], [sq.x0 + 1, sq.y0], [sq.x1 - 1, sq.y1]];
    spots.slice(0, stalls).forEach(([x, y], i) => landmarks.push({ kind: 'stall', x, y, w: 1, h: 1, v: i + Math.floor(R() * 4) }));
    const wx = Math.round((sq.x0 + sq.x1) / 2) + (R() < 0.5 ? -1 : 1), wy = Math.round((sq.y0 + sq.y1) / 2);
    buildings.push({ kind: 'well', x: Math.max(sq.x0 + 1, Math.min(sq.x1 - 1, wx === gx || wx === gx + 1 ? sq.x1 - 1 : wx)), y: wy, level: Math.min(2, L) });
    // house plots front every street: nearest the castle first, the best houses there
    type Slot = { x: number; y: number; d: number };
    const slots: Slot[] = [], seen = new Set<string>(), d = (x: number, y: number) => Math.hypot(x - gx, (y - street0) * 1.3) + R() * 1.5;
    for (const t of [...streets, ...plaza]) for (const [x, y] of [[t.x - 2, t.y], [t.x + 1, t.y], [t.x, t.y - 2], [t.x, t.y + 1], [t.x - 2, t.y - 1], [t.x + 1, t.y - 1], [t.x - 1, t.y - 2], [t.x - 1, t.y + 1]]) {
      const k = `${x},${y}`; if (seen.has(k) || y <= box.y1) continue; seen.add(k); slots.push({ x, y, d: d(x, y) });
    }
    slots.sort((a, b) => a.d - b.d);
    const best = Math.min(3, L - 1 + (wealth === 'rich' ? 1 : 0) + (wealth === 'poor' ? -1 : 0));
    let built = 0, smith = L >= 2, store = L >= 2 && (wealth !== 'poor'), stable = L >= 3, hall = L >= 3 && plan !== 'green' && R() < 0.6; // a covered market hall
    let inn = L >= 2 && R() < 0.85; // most towns have an alehouse near the market
    for (const sl of slots) {
      if (built >= homes) break;
      if (!room(sl.x, sl.y, 2, 2)) continue;
      const far = sl.d > 10 + L * 2, kind: BKind = inn && built > 1 ? 'tavern' : smith ? 'blacksmith' : store && built > 4 ? 'storehouse' : stable && built > 8 ? 'stable' : hall && built > 2 ? 'market' : L <= 1 || (far && wealth === 'poor') ? 'hut' : 'house';
      const [w, h] = SIZE[kind] ?? [2, 2]; if (!room(sl.x, sl.y, w, h)) continue;
      claim(sl.x, sl.y, w, h); buildings.push({ kind, x: sl.x, y: sl.y, level: kind === 'house' ? Math.max(1, best - (far ? 1 : 0)) : kind === 'hut' ? 1 : Math.min(2, L) });
      if (kind === 'tavern') inn = false; else if (kind === 'blacksmith') smith = false; else if (kind === 'storehouse') store = false; else if (kind === 'stable') stable = false; else if (kind === 'market') hall = false; else built++;
    }
    // side streets run only as far as their last house (an empty one is never laid)
    const near = (t: { x: number; y: number }) => buildings.some((b) => { const [bw, bh] = SIZE[b.kind] ?? [2, 2]; return t.x >= b.x - 1 && t.x <= b.x + bw && t.y >= b.y - 1 && t.y <= b.y + bh; });
    const own = new Map<string, number>(); sides.forEach((l, i) => l.forEach((t) => own.set(`${t.x},${t.y}`, i)));
    const junction = (t: { x: number; y: number }, i: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const k = `${t.x + dx},${t.y + dy}`; return paved.has(k) && own.has(k) && own.get(k) !== i; }); // another lane branches here
    for (const [li, lane] of [...sides.entries()].reverse()) while (lane.length && !near(lane[lane.length - 1]) && !junction(lane[lane.length - 1], li)) { const t = lane.pop()!; occ.delete(`${t.x},${t.y}`); paved.delete(`${t.x},${t.y}`); const k = streets.findIndex((q) => q.x === t.x && q.y === t.y); if (k >= 0) streets.splice(k, 1); }
    void main;
  }
  // inside a walled town: a street from the town gate up to the citadel, a cross street, houses and a market along them
  if (type === 'walledtown' && inner) {
    const sx = gate.x, ys: number[] = [];
    for (let y = box.y1 - 1; y > inner.y1 + 1; y--) { pave(sx, y); pave(sx + 1, y); ys.push(y); }
    const midY = Math.round((inner.y1 + box.y1) / 2), xs: number[] = [];
    for (const dir of [-1, 1]) for (let x = dir < 0 ? sx - 1 : sx + 2; x > box.x0 && x < box.x1 - 1; x += dir) { if (!pave(x, midY)) break; xs.push(x); } // the cross street, out from the main street until something stands in its way
    if (innerGate) for (let y = innerGate.y + 1; y < midY; y++) { pave(innerGate.x, y); pave(innerGate.x + 1, y); } // a street up to the citadel's own gate
    const plots: [number, number][] = [];
    for (const y of ys.filter((y) => (box.y1 - y) % 2 === 1)) plots.push([sx - 2, y - 1], [sx + 2, y - 1]);
    for (const x of xs.filter((x) => x % 2 === 0)) plots.push([x, midY - 2], [x, midY + 1]);
    plots.sort((a, b) => Math.hypot(a[0] - sx, a[1] - midY) - Math.hypot(b[0] - sx, b[1] - midY));
    let n = 0, market = true;
    for (const [x, y] of plots) {
      if (n >= 6 + bonus * 2 + L * 2) break;
      if (market && room(x, y, 3, 3)) { claim(x, y, 3, 3); buildings.push({ kind: 'market', x, y, level: Math.min(2, L) }); market = false; continue; }
      if (room(x, y, 2, 2)) { claim(x, y, 2, 2); buildings.push({ kind: 'house', x, y, level: Math.min(3, L) }); n++; }
    }
  }
  // fields: strips of farmland beyond the town, then the realm's own buildings on the outskirts
  const townX0 = Math.min(gx - 2, ...buildings.filter((b) => b.y > box.y1).map((b) => b.x)) - 2, townX1 = Math.max(gx + 3, ...buildings.filter((b) => b.y > box.y1).map((b) => b.x + 2)) + 2;
  const zones: [number, number, number, number][] = [];
  if (townX0 - 2 > 6) zones.push([2, townX0 - 1, Math.min(RH - 8, box.y1 - 4), RH - 4]);
  if (RW - 3 - townX1 > 6) zones.push([townX1 + 1, RW - 4, Math.min(RH - 8, box.y1 - 4), RH - 4]);
  if (box.x0 > 8) zones.push([2, box.x0 - 3, 3, box.y1]);
  if (RW - box.x1 > 9) zones.push([box.x1 + 3, RW - 4, 3, box.y1]);
  if (!zones.length) zones.push([2, RW - 4, Math.min(RH - 6, box.y1 + 2), RH - 4]);
  const farms = r.bandits ? 0 : Math.max(2, Math.min(9, 2 + L + bonus / 2));
  zones.forEach((z) => scatter('farm', Math.ceil(farms / zones.length), Math.min(3, L), z[0], z[1], Math.max(z[2], box.y1 - 2), z[3]));
  // a windmill grinds the realm's grain on the open fields
  if (!r.bandits && L >= 2 && (biome === 'grassland' || biome === 'highlands' || biome === 'tundra') && R() < 0.85) {
    mill: for (let t = 0; t < 200; t++) { const z = zones[t % zones.length], x = z[0] + Math.floor(R() * Math.max(1, z[1] - z[0] - 2)), y = Math.max(z[2], box.y1 - 2) + Math.floor(R() * Math.max(1, z[3] - Math.max(z[2], box.y1 - 2) - 3));
      let ok = true; for (let i = -1; i <= 2; i++) for (let j = -1; j <= 3; j++) if (occ.has(`${x + i},${y + j}`) || approach(x + i, y + j) || !inMap(x + i, y + j)) ok = false;
      if (ok) { claim(x, y, 2, 3); landmarks.push({ kind: 'windmill', x, y, w: 2, h: 3, v: 0 }); break mill; } }
  }
  const pers = r.bandits ? 'aggressive' : r.personality, any = (k: BKind, n: number, lv: number) => zones.forEach((z) => scatter(k, Math.ceil(n / zones.length), lv, ...z));
  // (merchant realms show their trade in the market square: more stalls, see above)
  if (pers === 'aggressive') { any('trainfield', 1, Math.min(2, L)); any('range', 1, Math.min(3, L)); any('watchtower', 2, Math.min(2, L)); }
  if (pers === 'honorable') any('guardhouse', 1, Math.min(2, L));
  if (pers === 'treacherous') { any('guardhouse', 2, Math.min(2, L)); any('watchtower', 2, Math.min(2, L)); }
  // whatever stands in front of the gate, where an enemy would camp, is the suburb (burnt in a siege)
  const suburb = (x: number, y: number, w: number) => y > box.y1 && Math.abs(x + w / 2 - (gate.x + 1)) <= 15;
  for (const b of buildings) if (suburb(b.x, b.y, (SIZE[b.kind] ?? [2, 2])[0])) b.suburb = true;
  for (const m of landmarks) if (suburb(m.x, m.y, m.w)) m.suburb = true;
  return { biome, type, wealth, plan, buildings, walls, wallKind, wallLevel, gate, box, inner, water, frozen: biome === 'tundra', bridges, streets, plaza, landmarks };
}
