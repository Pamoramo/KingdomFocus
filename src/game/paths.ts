// Walkable-ground map of the kingdom and A* paths across it, so townsfolk, patrols and thieves walk around
// buildings, walls and water instead of through them. Pure (no Phaser), so it can be unit-tested.
import { MAP_W, MAP_H, TILE, isRiver, footprint, type Building } from '../lib/state.ts';
import { BUILDINGS, type BKind } from '../lib/economy.ts';
import { RW, RH, type RealmLayout } from '../lib/realms.ts';

export type Pt = { x: number; y: number };
/** Ground you can walk on, or through: roads and courtyards, gates, and farm fields (workers tend them). */
const OPEN = new Set<BKind>(['road', 'courtyard', 'gate', 'farm']);
const ROAD = new Set<BKind>(['road', 'courtyard', 'gate']);

export class NavGrid {
  private block: Uint8Array; private road: Uint8Array;
  sig: string | null = null; // null until first built
  /** Defaults to the kingdom map; rival realms pass their own size. */
  readonly w: number; readonly h: number;
  constructor(w = MAP_W, h = MAP_H) { this.w = w; this.h = h; this.block = new Uint8Array(w * h); this.road = new Uint8Array(w * h); }
  /** Builds the grid from explicit lists of blocked and road tiles (used for rival realms). */
  setTiles(blocked: Iterable<Pt>, roads: Iterable<Pt> = []) {
    this.block.fill(0); this.road.fill(0);
    for (const t of blocked) if (this.inside(t.x, t.y)) this.block[t.y * this.w + t.x] = 1;
    for (const t of roads) if (this.inside(t.x, t.y)) { this.block[t.y * this.w + t.x] = 0; this.road[t.y * this.w + t.x] = 1; }
    this.sig = 'tiles';
  }

  /** Rebuilds the map when the buildings change. Returns true if it changed. */
  update(buildings: Building[]) {
    const sig = buildings.map((b) => `${b.kind}${b.x},${b.y}`).join('|');
    if (sig === this.sig) return false;
    this.sig = sig; this.block.fill(0); this.road.fill(0);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (isRiver(x, y)) this.block[y * MAP_W + x] = 1;
    for (const b of buildings) {
      const [w, h] = footprint(b.kind);
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
        const x = b.x + i, y = b.y + j; if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        const k = y * MAP_W + x;
        if (ROAD.has(b.kind)) { this.block[k] = 0; this.road[k] = 1; } // a road over the river is a bridge
        else if (b.kind === 'gatehouse') this.block[k] = i === 1 ? 0 : 1; // through the arch only
        else if (!OPEN.has(b.kind)) this.block[k] = 1;
      }
    }
    // bridges and gates win over water and walls laid on the same tile
    for (const b of buildings) if (ROAD.has(b.kind)) { const [w, h] = footprint(b.kind); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { const x = b.x + i, y = b.y + j; if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) this.block[y * MAP_W + x] = 0; } }
    return true;
  }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  free(x: number, y: number) { return this.inside(x, y) && !this.block[y * this.w + x]; }
  tileOf(p: Pt) { return { x: Math.floor(p.x / TILE), y: Math.floor((p.y - 1) / TILE) }; }
  /** The nearest walkable tile to a point (searching outward), e.g. the doorstep of a building hemmed in by others. */
  nearestFree(t: Pt, max = 8): Pt | null {
    if (this.free(t.x, t.y)) return t;
    for (let r = 1; r <= max; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (this.free(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
    }
    return null;
  }
  /** True if a straight walk between two tiles crosses nothing blocked (used to smooth paths). */
  private clear(a: Pt, b: Pt) {
    // the line people actually walk: through each tile's footing point (x + 0.5, y + 0.75), checked finely with the walker's width
    const ax = a.x + 0.5, ay = a.y + 0.75, bx = b.x + 0.5, by = b.y + 0.75, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 8));
    for (let i = 0; i <= n; i++) {
      const fx = ax + ((bx - ax) * i) / n, fy = ay + ((by - ay) * i) / n;
      for (const [ox, oy] of [[0, 0], [-0.3, 0], [0.3, 0], [0, -0.35], [0, 0.2]]) if (!this.free(Math.floor(fx + ox), Math.floor(fy + oy - 1 / 16))) return false;
    }
    return true;
  }

  /** A* from one pixel point to another; returns pixel waypoints (ending at the goal), or null if unreachable.
   *  Roads cost a little less, so people keep to the streets. Diagonals never cut a blocked corner. */
  path(from: Pt, to: Pt, maxNodes = 4000): Pt[] | null {
    const s0 = this.nearestFree(this.tileOf(from), 3), g0 = this.nearestFree(this.tileOf(to), 6);
    if (!s0 || !g0) return null;
    const W = this.w, start = s0.y * W + s0.x, goal = g0.y * W + g0.x;
    if (start === goal) return [to];
    const gScore = new Float32Array(W * this.h).fill(Infinity), came = new Int32Array(W * this.h).fill(-1), closed = new Uint8Array(W * this.h);
    const open: number[] = [start], f = new Float32Array(W * this.h).fill(Infinity);
    const hz = (k: number) => { const dx = Math.abs((k % W) - g0.x), dy = Math.abs(Math.floor(k / W) - g0.y); return 0.7 * (dx + dy) + (1.414 * 0.7 - 2 * 0.7) * Math.min(dx, dy); };
    gScore[start] = 0; f[start] = hz(start);
    let seen = 0;
    while (open.length && seen++ < maxNodes) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue; closed[cur] = 1;
      const cx = cur % W, cy = Math.floor(cur / W);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy; if (!this.free(nx, ny)) continue;
        if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue; // no corner cutting
        const nk = ny * W + nx; if (closed[nk]) continue;
        const cost = (dx && dy ? 1.414 : 1) * (this.road[nk] ? 0.7 : 1), gs = gScore[cur] + cost;
        if (gs < gScore[nk]) { gScore[nk] = gs; came[nk] = cur; f[nk] = gs + hz(nk); open.push(nk); }
      }
    }
    if (came[goal] === -1) return null;
    const tiles: Pt[] = []; for (let k = goal; k !== -1; k = came[k]) tiles.push({ x: k % W, y: Math.floor(k / W) }); tiles.reverse();
    // string-pull: skip waypoints while the straight line stays on open ground (and on, or off, the road)
    const keep: Pt[] = [tiles[0]];
    const onRoad = (t: Pt) => this.road[t.y * W + t.x] === 1;
    for (let i = 1; i < tiles.length; i++) { const last = keep[keep.length - 1]; if (!this.clear(last, tiles[i]) || onRoad(tiles[i]) !== onRoad(last)) keep.push(tiles[i - 1]); } // never smooth a route off the road it chose
    keep.push(tiles[tiles.length - 1]);
    const pts = keep.slice(1).map((t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.75) * TILE }));
    // someone standing off their tile's footing point steps onto it first, so the straightened legs hold
    const home = { x: (s0.x + 0.5) * TILE, y: (s0.y + 0.75) * TILE }; if (Math.hypot(home.x - from.x, home.y - from.y) > 3) pts.unshift(home);
    const goalFree = this.free(this.tileOf(to).x, this.tileOf(to).y);
    if (goalFree) pts[pts.length - 1] = { x: to.x, y: to.y }; // finish exactly where asked when that spot is walkable
    return pts;
  }
}

/** Moves a walker along its path; returns the horizontal direction moved (0 when it has arrived). */
export function follow(m: { x: number; y: number; path?: Pt[] }, dt: number, speed: number): number {
  let step = (speed * dt) / 1000, dirX = 0;
  while (m.path?.length && step > 0) {
    const p = m.path[0], dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
    if (d <= step) { m.x = p.x; m.y = p.y; step -= d; m.path.shift(); if (Math.abs(dx) > 0.3) dirX = Math.sign(dx); continue; }
    m.x += (dx / d) * step; m.y += (dy / d) * step; if (Math.abs(dx) > 0.3) dirX = Math.sign(dx); step = 0;
  }
  return dirX;
}

/** Walkable ground of a rival realm: walls, buildings, the church, stalls and water are solid; gates, streets and bridges are open. */
export function realmNav(L: RealmLayout): NavGrid {
  const nav = new NavGrid(RW, RH), blocked: Pt[] = [], open: Pt[] = [...L.streets, ...L.plaza, ...L.bridges];
  for (const b of L.buildings) { const d = BUILDINGS[b.kind];
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) (b.kind === 'gate' || (b.kind === 'gatehouse' && i === 1) ? open : b.kind === 'well' || b.kind === 'farm' ? [] : blocked).push({ x: b.x + i, y: b.y + j }); }
  blocked.push(...L.walls, ...L.water.filter((w) => !L.bridges.some((b) => b.x === w.x && b.y === w.y)));
  for (const m of L.landmarks) for (let i = 0; i < m.w; i++) for (let j = 0; j < m.h; j++) blocked.push({ x: m.x + i, y: m.y + j });
  for (const x of [L.gate.x, L.gate.x + 1]) open.push({ x, y: L.gate.y }); // the gap cut in the curtain wall
  nav.setTiles(blocked, open);
  return nav;
}

