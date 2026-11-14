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
    for (const b of L.buildings) if (b.y > L.box.y1 + 1) assert.ok(Math.abs(b.x + BUILDINGS[b.kind].w / 2 - (L.gate.x + 1)) > 10, `${r.name}: ${b.kind} blocks the approach`);
  }
});
