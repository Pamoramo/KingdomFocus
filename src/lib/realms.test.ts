import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realmLayout, wealthOf, RW, RH } from './realms.ts';
import { initWorld, type Rival } from './war.ts';
import { BUILDINGS } from './economy.ts';

const area = (b: { x0: number; y0: number; x1: number; y1: number }) => (b.x1 - b.x0) * (b.y1 - b.y0);
test('realms differ in castle type and position; sizes follow wealth', () => {
  const w = initWorld(1234), types = new Set<string>(), xs = new Set<number>();
  for (let lvl = 1; lvl <= 5; lvl++) for (const r of w.rivals.filter((x) => !x.bandits)) {
    const rr: Rival = { ...r, level: lvl, power: 120 * lvl ** 2.2 }, L = realmLayout(w, rr); types.add(L.type); xs.add(L.box.x0);
    const poor = realmLayout(w, { ...rr, power: 120 * lvl ** 2.2 * 0.5 }), rich = realmLayout(w, { ...rr, power: 120 * lvl ** 2.2 * 2 });
    assert.ok(area(rich.box) >= area(poor.box), 'richer realms build at least as large');
    assert.ok(rich.buildings.length >= poor.buildings.length - 2, 'richer realms have bigger towns');
  }
  assert.ok(types.size >= 4, `several castle types (${[...types]})`); assert.ok(xs.size >= 4, 'castles sit in different places');
  assert.equal(wealthOf({ power: 50, level: 3 }), 'poor'); assert.equal(wealthOf({ power: 99999, level: 3 }), 'rich');
});
test('layouts are sound: no overlaps, nothing on water, the approach is clear', () => {
  const w = initWorld(99);
  for (const r of w.rivals) {
    const L = realmLayout(w, r), cells = new Map<string, string>();
    for (const b of L.buildings) { const d = BUILDINGS[b.kind]; for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) { const k = `${b.x + i},${b.y + j}`; assert.ok(!cells.has(k) || ['tower', 'gatehouse', 'gate'].includes(b.kind), `${r.name}: ${b.kind} overlaps ${cells.get(k)}`); cells.set(k, b.kind); assert.ok(b.x + i < RW && b.y + j < RH); } }
    for (const t of L.water) assert.ok(!cells.has(`${t.x},${t.y}`), `${r.name}: building on water`);
    // in front of the gate stand only suburbs, which burn when an enemy makes camp there
    for (const b of L.buildings) if (b.y > L.box.y1 + 1 && Math.abs(b.x + BUILDINGS[b.kind].w / 2 - (L.gate.x + 1)) <= 10) assert.ok(b.suburb, `${r.name}: ${b.kind} blocks the approach`);
    for (const m of L.landmarks) { for (let i = 0; i < m.w; i++) for (let j = 0; j < m.h; j++) assert.ok(!cells.has(`${m.x + i},${m.y + j}`), `${r.name}: ${m.kind} overlaps a building`); }
    const street = new Set([...L.streets, ...L.plaza].map((t) => `${t.x},${t.y}`));
    const wells = new Set(L.buildings.filter((b) => b.kind === 'well').map((b) => `${b.x},${b.y}`)); // the well stands in the market square
    for (const k of street) assert.ok(!cells.has(k) || wells.has(k), `${r.name}: something built on the street at ${k}`);
  }
});

test('curtain walls run right up to both sides of every gate', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const w = initWorld(seed * 7919);
    for (const r0 of w.rivals) for (const level of [1, 2, 3, 4, 5]) {
      const r = { ...r0, level }, L = realmLayout(w, r), has = (x: number, y: number) => L.walls.some((t) => t.x === x && t.y === y);
      const outer = L.buildings.find((b) => (b.kind === 'gatehouse' && b.y === L.gate.y - 1) || (b.kind === 'gate' && b.y === L.gate.y))!;
      assert.ok(outer, 'a gate is built');
      const wdt = outer.kind === 'gatehouse' ? 3 : 2;
      assert.ok(has(outer.x - 1, L.gate.y) && has(outer.x + wdt, L.gate.y), `${r.name} L${level} ${L.type}: wall gap beside the gate`);
      assert.ok(!L.walls.some((t) => t.y === L.gate.y && t.x >= outer.x && t.x < outer.x + wdt), 'no wall through the gate');
    }
  }
});

test('rival towns are laid out like medieval towns: a high street from the gate, a market square, houses on the streets', () => {
  const w = initWorld(4242);
  for (const r0 of w.rivals.filter((x) => !x.bandits)) for (const level of [2, 4]) {
    const r = { ...r0, level, power: 120 * level ** 2.2 }, L = realmLayout(w, r), gx = L.gate.x, street = new Set([...L.streets, ...L.plaza].map((t) => `${t.x},${t.y}`));
    for (let y = L.gate.y + 1; y < 40; y++) assert.ok(street.has(`${gx},${y}`) || L.bridges.some((b) => b.x === gx && b.y === y), `${r.name}: the high street is unbroken at ${y}`);
    assert.ok(L.plaza.length >= 24, 'a market square');
    assert.ok(L.landmarks.some((m) => m.kind === 'stall') && L.buildings.some((b) => b.kind === 'well'), 'with stalls and a well');
    const houses = L.buildings.filter((b) => b.kind === 'house' || b.kind === 'hut');
    assert.ok(houses.length >= 6, `${r.name} L${level}: a town (${houses.length} houses)`);
    const onStreet = houses.filter((h) => [[-1, 0], [2, 0], [0, -1], [0, 2], [1, -1], [1, 2], [-1, 1], [2, 1]].some(([dx, dy]) => street.has(`${h.x + dx},${h.y + dy}`)));
    assert.ok(onStreet.length / houses.length >= 0.85, `${r.name}: houses front the streets (${onStreet.length}/${houses.length})`);
    const dist = houses.map((h) => Math.hypot(h.x - gx, h.y - L.gate.y)).sort((a, b) => a - b);
    assert.ok(dist[Math.floor(dist.length / 2)] < 16, 'the town crowds the castle gate');
  }
  // a bigger, richer realm builds a bigger town, with a church
  const k = w.rivals.find((x) => !x.bandits)!, small = realmLayout(w, { ...k, level: 1, power: 60 }), big = realmLayout(w, { ...k, level: 5, power: 120 * 5 ** 2.2 * 2 });
  const n = (L: ReturnType<typeof realmLayout>) => L.buildings.filter((b) => b.kind === 'house' || b.kind === 'hut').length;
  assert.ok(n(big) > n(small) * 2, `rich towns are much bigger (${n(small)} vs ${n(big)})`);
  assert.ok(big.landmarks.some((m) => m.kind === 'church'), 'with a parish church');
});

