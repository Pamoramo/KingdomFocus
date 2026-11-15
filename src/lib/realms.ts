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
export interface Landmark { kind: 'church' | 'stall'; x: number; y: number; w: number; h: number; v: number; suburb?: boolean }
export interface Box { x0: number; y0: number; x1: number; y1: number }
export interface RealmLayout {
  biome: Biome; type: CastleType; wealth: Wealth; buildings: Placed[];
  walls: { x: number; y: number }[]; wallKind: 'palisade' | 'wall'; wallLevel: number;
  gate: { x: number; y: number }; box: Box; inner: Box | null; water: { x: number; y: number }[]; frozen: boolean; bridges: { x: number; y: number }[];
  /** the high street and lanes, and the paved market square */
  streets: { x: number; y: number }[]; plaza: { x: number; y: number }[]; landmarks: Landmark[];
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

const pers0 = (r: Rival) => r.personality;
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
    const ix0 = box.x0 + 2, ix1 = box.x1 - 3, iy0 = box.y0 + 2, iy1 = box.y1 - 3;
    if (L >= 4) scatter('greathall', 1, L >= 5 ? 2 : 1, ix0, ix1, iy0, iy1);
    if (L >= 2) scatter('barracks', 1, Math.min(3, L - 1), ix0, ix1, iy0, iy1);
    if (L >= 3) scatter('armory', 1, L >= 5 ? 2 : 1, ix0, ix1, iy0, iy1);
    scatter('well', 1, Math.min(2, L), ix0, ix1, iy0, iy1);
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
  const gx = gate.x, street0 = gate.y + 1;
  if (r.bandits) { for (let y = street0; y < RH - 1; y++) { pave(gx, y); pave(gx + 1, y); } scatter('hut', homes, 1, 2, RW - 4, Math.min(RH - 6, box.y1 + 3), RH - 4); }
  else {
    // the high street, down to the edge of the map
    for (let y = street0; y < RH - 1; y++) { pave(gx, y); pave(gx + 1, y); }
    // the market square just below the gate
    const sq = { x0: gx - 3, x1: gx + 4, y0: street0 + 2, y1: street0 + 2 + (L >= 3 ? 4 : 3) };
    for (let y = sq.y0; y <= sq.y1; y++) for (let x = sq.x0; x <= sq.x1; x++) pave(x, y, true);
    // back lanes running east and west off the high street, longer for a bigger town
    const laneLen = Math.min(26, 6 + Math.round(homes / 3)), lanes: number[] = [];
    const laneX = new Map<number, Set<number>>(); // the lane tiles actually laid (a river or a farm can cut a lane short)
    for (let y = sq.y1 + 5; y < RH - 4 && lanes.length < Math.ceil(homes / 12) + 1; y += 6) { lanes.push(y); const xs = new Set<number>(); laneX.set(y, xs); for (let i = 1; i <= laneLen; i++) { if (pave(gx - i, y)) xs.add(gx - i); else if (i > 2) break; } for (let i = 2; i <= laneLen + 1; i++) { if (pave(gx + i, y)) xs.add(gx + i); else if (i > 3) break; } }
    // house plots: facing the square, then the high street, then the lanes, nearest the castle first
    type Slot = { x: number; y: number; d: number };
    const slots: Slot[] = [], d = (x: number, y: number) => Math.hypot(x - gx, (y - street0) * 1.3);
    for (let y = sq.y0; y <= sq.y1 - 1; y += 2) { slots.push({ x: sq.x0 - 2, y, d: d(sq.x0 - 2, y) }); slots.push({ x: sq.x1 + 1, y, d: d(sq.x1 + 1, y) }); }
    for (let x = sq.x0; x <= sq.x1 - 1; x += 2) slots.push({ x, y: sq.y1 + 1, d: d(x, sq.y1 + 1) + (Math.abs(x - gx) < 2 ? 99 : 0) });
    const lastLane = lanes[lanes.length - 1] ?? sq.y1 + 6;
    for (let y = sq.y1 + 1; y <= lastLane + 1; y += 2) { slots.push({ x: gx - 2, y, d: d(gx - 2, y) }); slots.push({ x: gx + 2, y, d: d(gx + 2, y) }); }
    for (const ly of lanes) for (let i = 0; i < laneLen; i += 2) for (const x of [gx - 3 - i, gx + 3 + i]) { const xs = laneX.get(ly)!; if (!xs.has(x) && !xs.has(x + 1)) continue; slots.push({ x, y: ly - 2, d: d(x, ly - 2) }); slots.push({ x, y: ly + 1, d: d(x, ly + 1) }); }
    slots.sort((a, b) => a.d - b.d);
    // the parish church on the square
    church: for (const dy of [-1, 0, 1, 2]) for (const cx of [sq.x0 - 4, sq.x1 + 1]) if (room(cx, sq.y0 + dy, 3, 4)) { claim(cx, sq.y0 + dy, 3, 4); landmarks.push({ kind: 'church', x: cx, y: sq.y0 + dy, w: 3, h: 4, v: 0 }); break church; } // facing the square (a moat may run along its top)
    // stalls around the edge of the square, the well at its heart
    const stalls = Math.min(6, 2 + L + (wealth === 'rich' || pers0(r) === 'mercantile' ? 2 : 0));
    const spots = [[sq.x0, sq.y0], [sq.x1, sq.y0], [sq.x0, sq.y1], [sq.x1, sq.y1], [sq.x0 + 1, sq.y0], [sq.x1 - 1, sq.y1]];
    spots.slice(0, stalls).forEach(([x, y], i) => landmarks.push({ kind: 'stall', x, y, w: 1, h: 1, v: i }));
    buildings.push({ kind: 'well', x: gx + (R() < 0.5 ? -2 : 3), y: sq.y0 + 1, level: Math.min(2, L) });
    // houses: the best near the castle, humbler further out; a forge and stables near the gate, stores by the lanes
    const best = Math.min(3, L - 1 + (wealth === 'rich' ? 1 : 0) + (wealth === 'poor' ? -1 : 0));
    let built = 0, smith = L >= 2, store = L >= 2 && (wealth !== 'poor'), stable = L >= 3;
    for (const sl of slots) {
      if (built >= homes) break;
      if (!room(sl.x, sl.y, 2, 2)) continue;
      const far = sl.d > 10 + L * 2, kind: BKind = smith ? 'blacksmith' : store && built > 4 ? 'storehouse' : stable && built > 8 ? 'stable' : L <= 1 || (far && wealth === 'poor') ? 'hut' : 'house';
      const [w, h] = SIZE[kind] ?? [2, 2]; if (!room(sl.x, sl.y, w, h)) continue;
      claim(sl.x, sl.y, w, h); buildings.push({ kind, x: sl.x, y: sl.y, level: kind === 'house' ? Math.max(1, best - (far ? 1 : 0)) : kind === 'hut' ? 1 : Math.min(2, L) });
      if (kind === 'blacksmith') smith = false; else if (kind === 'storehouse') store = false; else if (kind === 'stable') stable = false; else built++;
    }
    // a lane runs only as far as its last house (and an empty lane is never laid)
    for (const ly of lanes) {
      const along = buildings.filter((b) => b.y === ly - 2 || b.y === ly + 1).map((b) => [b.x, b.x + (SIZE[b.kind] ?? [2, 2])[0] - 1]);
      const lo = along.length ? Math.min(...along.map((a) => a[0])) : gx, hi = along.length ? Math.max(...along.map((a) => a[1])) : gx + 1;
      for (const x of laneX.get(ly)!) if (x < lo || x > hi) { occ.delete(`${x},${ly}`); paved.delete(`${x},${ly}`); const k = streets.findIndex((t) => t.x === x && t.y === ly); if (k >= 0) streets.splice(k, 1); }
    }
  }
  // inside a walled town: a street from the town gate up to the citadel, a cross street, houses and a market along them
  if (type === 'walledtown' && inner) {
    const sx = gate.x, ys: number[] = [];
    for (let y = box.y1 - 1; y > inner.y1 + 1; y--) { pave(sx, y); pave(sx + 1, y); ys.push(y); }
    const midY = Math.round((inner.y1 + box.y1) / 2), xs: number[] = [];
    for (let x = box.x0 + 1; x < box.x1 - 1; x++) if (pave(x, midY)) xs.push(x);
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
  const pers = r.bandits ? 'aggressive' : r.personality, any = (k: BKind, n: number, lv: number) => zones.forEach((z) => scatter(k, Math.ceil(n / zones.length), lv, ...z));
  // (merchant realms show their trade in the market square: more stalls, see above)
  if (pers === 'aggressive') { any('trainfield', 1, Math.min(2, L)); any('range', 1, Math.min(3, L)); any('watchtower', 2, Math.min(2, L)); }
  if (pers === 'honorable') any('guardhouse', 1, Math.min(2, L));
  if (pers === 'treacherous') { any('guardhouse', 2, Math.min(2, L)); any('watchtower', 2, Math.min(2, L)); }
  // whatever stands in front of the gate, where an enemy would camp, is the suburb (burnt in a siege)
  const suburb = (x: number, y: number, w: number) => y > box.y1 && Math.abs(x + w / 2 - (gate.x + 1)) <= 15;
  for (const b of buildings) if (suburb(b.x, b.y, (SIZE[b.kind] ?? [2, 2])[0])) b.suburb = true;
  for (const m of landmarks) if (suburb(m.x, m.y, m.w)) m.suburb = true;
  return { biome, type, wealth, buildings, walls, wallKind, wallLevel, gate, box, inner, water, frozen: biome === 'tundra', bridges, streets, plaza, landmarks };
}
