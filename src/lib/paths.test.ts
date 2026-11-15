import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid, follow, type Pt } from '../game/paths.ts';
import { TILE, RIVER, type Building } from './state.ts';
import type { BKind } from './economy.ts';

const B = (kind: BKind, x: number, y: number): Building => ({ id: `${kind}${x},${y}`, kind, x, y, level: 1, at: 0 });
const px = (x: number, y: number): Pt => ({ x: (x + 0.5) * TILE, y: (y + 0.75) * TILE });
/** Walks the path in small steps and reports every tile the walker's feet touch. */
function tiles(nav: NavGrid, from: Pt, path: Pt[]) {
  const m = { ...from, path: [...path] }, seen = new Set<string>();
  for (let i = 0; i < 5000 && m.path.length; i++) { follow(m, 50, 20); const t = nav.tileOf(m); seen.add(`${t.x},${t.y}`); }
  return seen;
}

test('townsfolk walk around buildings, not through them', () => {
  const nav = new NavGrid(), market = B('market', 20, 20), house = B('house', 24, 20);
  nav.update([market, house]);
  const from = px(18, 21), to = px(29, 21); // straight through the market and the house
  const path = nav.path(from, to)!;
  assert.ok(path, 'a way round exists');
  const touched = tiles(nav, from, path);
  for (let x = 20; x < 23; x++) for (let y = 20; y < 23; y++) assert.ok(!touched.has(`${x},${y}`), `never steps into the market (${x},${y})`);
  for (let x = 24; x < 26; x++) for (let y = 20; y < 22; y++) assert.ok(!touched.has(`${x},${y}`), 'nor the house');
  assert.deepEqual(path[path.length - 1], to, 'ends where asked');
});

test('walls are crossed only at gates; rivers only on bridges; roads are preferred', () => {
  const wall = Array.from({ length: 96 }, (_, i) => B('wall', i, 30)).filter((b) => b.x !== 24 && b.x !== 25);
  const nav = new NavGrid(); nav.update([...wall, B('gate', 24, 30)]);
  const touched = tiles(nav, px(14, 26), nav.path(px(14, 26), px(14, 34))!);
  assert.ok(touched.has('24,30') || touched.has('25,30'), 'goes through the gate');
  for (const w of wall) assert.ok(!touched.has(`${w.x},${w.y}`), 'never over the wall');
  // the river is impassable without a bridge
  const y = 10, [r0, r1] = RIVER[y], west = px(r0 - 3, y), east = px(r1 + 3, y);
  const bare = new NavGrid(); bare.update([]);
  assert.equal(bare.path(west, east), null, 'no way across without a bridge');
  const bridged = new NavGrid(); bridged.update(Array.from({ length: r1 - r0 + 1 }, (_, i) => B('road', r0 + i, y)));
  assert.ok(bridged.path(west, east), 'a road across the river is a bridge');
  // a road a little out of the way is still taken
  const road = Array.from({ length: 40 }, (_, i) => B('road', 10 + i, 52));
  const rn = new NavGrid(); rn.update(road);
  const used = tiles(rn, px(10, 51), rn.path(px(10, 51), px(49, 51))!);
  assert.ok([...used].filter((t) => t.endsWith(',52')).length > 20, 'keeps to the road');
});

test('a hemmed-in doorstep still gets a path to the nearest open ground', () => {
  const nav = new NavGrid(); nav.update([B('house', 30, 30), B('house', 30, 32)]); // the second house blocks the first one's door
  const p = nav.path(px(20, 20), { x: 31 * TILE, y: 32 * TILE + 3 });
  assert.ok(p && p.length, 'reaches next to it');
  const end = nav.tileOf(p![p!.length - 1]); assert.ok(nav.free(end.x, end.y));
});

test('in rival realms, townsfolk reach the castle only through its gates, never over a wall', async () => {
  const { realmNav } = await import('../game/paths.ts'), { realmLayout } = await import('./realms.ts'), { initWorld } = await import('./war.ts');
  const w = initWorld(31);
  for (const r0 of w.rivals) for (const level of [1, 3, 5]) {
    const r = { ...r0, level, power: 120 * level ** 2.2 }, L = realmLayout(w, r), nav = realmNav(L), walls = new Set(L.walls.map((t) => `${t.x},${t.y}`));
    const from = { x: (L.gate.x + 0.5) * TILE, y: (L.box.y1 + 8.75) * TILE }, inner = L.inner ?? L.box, to = { x: ((inner.x0 + inner.x1) / 2) * TILE, y: (inner.y1 - 1.25) * TILE };
    const p = nav.path(from, to); assert.ok(p, `${r.name} L${level} ${L.type}: a way in`);
    const touched = tiles(nav, from, p!);
    for (const t of touched) assert.ok(!walls.has(t), `${r.name} L${level} ${L.type}: walked over the wall at ${t}`);
    assert.ok([...touched].some((t) => t === `${L.gate.x},${L.gate.y}` || t === `${L.gate.x + 1},${L.gate.y}`), `${r.name} L${level}: in through the gate`);
  }
});

test('random walks in palisaded camps and walled towns never cut through a wall or a building', async () => {
  const { realmNav } = await import('../game/paths.ts'), { realmLayout, RW, RH } = await import('./realms.ts'), { initWorld } = await import('./war.ts');
  let walks = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const w = initWorld(seed * 31);
    for (const r of w.rivals.filter((x) => x.bandits || x.id === 'k0' || x.id === 'k3')) {
      const L = realmLayout(w, r), nav = realmNav(L); let h = seed; const R = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let k = 0; k < 25; k++) {
        const a = nav.nearestFree({ x: Math.floor(R() * RW), y: Math.floor(R() * RH) }, 6), b = nav.nearestFree({ x: Math.floor(R() * RW), y: Math.floor(R() * RH) }, 6); if (!a || !b) continue;
        const from = { x: (a.x + 0.3 + R() * 0.4) * TILE, y: (a.y + 0.4 + R() * 0.5) * TILE }, p = nav.path(from, { x: (b.x + 0.5) * TILE, y: (b.y + 0.75) * TILE }); if (!p) continue;
        walks++; for (const t of tiles(nav, from, p)) { const [x, y] = t.split(',').map(Number); assert.ok(nav.free(x, y), `${r.name}: walked through ${t}`); }
      }
    }
  }
  assert.ok(walks > 500);
});
