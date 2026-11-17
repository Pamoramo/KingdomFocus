import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initWorld, type WorldState, type Rival } from './war.ts';
import { simulateLordships, lordshipOf, incomeOf, between, armyCapOf, YIELD, type Lordship } from './lordships.ts';
import { biomeOf } from './realms.ts';

const day = (n: number) => { const d = new Date(Date.UTC(2026, 0, 1) + n * 864e5); return d.toISOString().slice(0, 10); };
/** Runs the world forward n days, one turn a day. */
const run = (w: WorldState, n: number, from = 0) => { for (let i = 0; i < n; i++) w = simulateLordships(w, 1, day(from + i)); return w; };
const L = (w: WorldState, id: string) => w.rivals.find((r) => r.id === id)!.lordship!;
const R = (w: WorldState, id: string) => w.rivals.find((r) => r.id === id)!;
const set = (w: WorldState, id: string, f: (r: Rival) => Rival): WorldState => ({ ...w, rivals: w.rivals.map((r) => (r.id === id ? f(r) : r)) });

test('old saves: every realm gains a lordship, the same each time, and nothing else is lost', () => {
  const w = initWorld(77), r = w.rivals.find((x) => !x.bandits)!;
  assert.equal(r.lordship, undefined, 'a save from before');
  assert.deepEqual(lordshipOf(w, r), lordshipOf(w, r), 'founded the same way every time');
  const l = lordshipOf(w, r); assert.equal(l.lord.name, r.ruler); assert.ok(l.lord.traits.length >= 1 && l.history.length >= 2);
  const out = run(w, 1);
  for (const x of out.rivals) { if (x.bandits) { assert.equal(x.lordship, undefined); continue; } assert.ok(x.lordship); }
  assert.equal(out.rivals.length, w.rivals.length); assert.equal(out.seed, w.seed); assert.deepEqual(out.engines, w.engines);
  assert.deepEqual(JSON.parse(JSON.stringify(run(w, 5))), JSON.parse(JSON.stringify(run(w, 5))), 'the same days give the same history');
});

test('lords build only what they can afford; an empty treasury builds nothing', () => {
  let w = initWorld(5); const id = w.rivals.find((x) => !x.bandits)!.id;
  w = run(w, 1); w = set(w, id, (r) => ({ ...r, lordship: { ...r.lordship!, gold: 0, wood: 0, stone: 0, food: 500, has: { ...r.lordship!.has, farm: 0, market: 0, lumber: 0, quarry: 0 } } }));
  const before = { ...L(w, id).has }, after = L(run(w, 1, 1), id).has;
  assert.deepEqual(after, before, 'no gold, no building');
});

test('the land shapes the economy: forests yield timber, highlands stone, grassland grain', () => {
  const w = run(initWorld(11), 1), r = w.rivals.find((x) => !x.bandits)!, l = L(w, r.id);
  const inBiome = (b: keyof typeof YIELD) => { const y = YIELD[b], h = l.has; return { wood: (h.lumber * 9 + 2) * y.wood, stone: (h.quarry * 8 + 1) * y.stone, food: (h.farm * 10 + 4) * y.food }; };
  assert.ok(inBiome('forest').wood > inBiome('desert').wood && inBiome('highlands').stone > inBiome('swamp').stone && inBiome('grassland').food > inBiome('tundra').food);
  const inc = incomeOf(w, r, l), y = YIELD[biomeOf(w, r)];
  assert.equal(inc.wood, Math.round((l.has.lumber * 9 + 2) * y.wood), 'income follows the realm\'s own land');
});

test('character drives choices: merchant houses build markets, warlike ones barracks and armies', () => {
  let mk = 0, wk = 0, mb = 0, wb = 0;
  for (const seed of [3, 9, 21, 33, 47]) {
    let w = run(initWorld(seed), 1);
    const [a, b] = w.rivals.filter((x) => !x.bandits);
    // twin realms, alike in all but character, far from everyone (no wars or trade to muddy it)
    const twin = (r: Rival, personality: Rival['personality'], x: number): Rival => ({ ...r, personality, x, y: 0.05, level: 3, power: 400, lordship: { ...r.lordship!, lord: { ...r.lordship!.lord, traits: [] }, gold: 3000, wood: 2000, stone: 2000, food: 2000, has: { farm: 4, lumber: 2, quarry: 2, market: 1, barracks: 1, walls: 2, church: 1 }, ties: {}, wars: {}, allies: [] } });
    w = set(set(w, a.id, (r) => twin(r, 'mercantile', 0.05)), b.id, (r) => twin(r, 'aggressive', 0.95));
    w = run(w, 30, 1);
    mk += L(w, a.id).has.market; wk += L(w, b.id).has.market; mb += L(w, a.id).has.barracks; wb += L(w, b.id).has.barracks;
  }
  assert.ok(mk > wk, `merchants build more markets (${mk} vs ${wk})`); assert.ok(wb > mb, `warlords build more barracks (${wb} vs ${mb})`);
});

test('wars come between hostile neighbours with the strength to win; alliances between close friends', () => {
  for (const seed of [2, 8, 15, 29]) {
    const w = run(initWorld(seed), 60);
    for (const r of w.rivals.filter((x) => !x.bandits)) {
      const l = r.lordship!;
      for (const id of Object.keys(l.wars)) { assert.ok(between(r, R(w, id)) < 0.6, `${r.name} fights only neighbours`); assert.ok(!l.allies.includes(id), 'never an ally'); assert.ok(R(w, id).lordship!.wars[r.id] !== undefined, 'both sides know it'); }
      for (const id of l.allies) assert.ok(R(w, id).lordship!.allies.includes(r.id), 'alliances are mutual');
      assert.ok(r.power <= armyCapOf(r, l) * 1.3, `${r.name} keeps no more men than it can feed`);
      assert.deepEqual([...r.friends].sort(), [...l.allies].sort(), 'old friends list follows the alliances');
    }
  }
});

test('an outmatched realm asks its ally for aid, and a generous friend sends soldiers', () => {
  let w = run(initWorld(4), 1); const [a, b, c] = w.rivals.filter((x) => !x.bandits);
  const base = (r: Rival, x: number, power: number, extra: Partial<Lordship>): Rival => ({ ...r, x, y: 0.5, power, status: 'neutral', lordship: { ...r.lordship!, gold: 2000, food: 3000, wood: 1000, stone: 1000, ...extra } });
  w = set(w, a.id, (r) => base(r, 0.5, 200, { wars: { [b.id]: day(0) }, allies: [c.id], ties: { [b.id]: -80, [c.id]: 70 } }));
  w = set(w, b.id, (r) => base(r, 0.55, 600, { wars: { [a.id]: day(0) }, allies: [], ties: { [a.id]: -80, [c.id]: 0 } }));
  w = set(w, c.id, (r) => base(r, 0.45, 800, { wars: {}, allies: [a.id], ties: { [a.id]: 70, [b.id]: 0 }, lord: { ...r.lordship!.lord, traits: ['generous'] } }));
  const out = run(w, 3, 1);
  assert.ok((out.news ?? []).some((n) => n.kind === 'aid' && n.ids.includes(c.id)) || R(out, c.id).power < 800, 'the ally answered');
});

test('lords grow old and die; the heir takes the throne and the realm remembers', () => {
  let w = run(initWorld(6), 1); const id = w.rivals.find((x) => !x.bandits)!.id, old = R(w, id).ruler;
  w = set(w, id, (r) => ({ ...r, lordship: { ...r.lordship!, lord: { ...r.lordship!.lord, age: 95, traits: ['sickly'] } } }));
  const heir = L(w, id).lord.heir;
  for (let i = 0; i < 80 && R(w, id).ruler === old; i++) w = run(w, 1, 1 + i);
  assert.equal(R(w, id).ruler, heir, 'the heir rules'); assert.ok(L(w, id).lord.age < 40 && L(w, id).lord.gen >= 2);
  assert.ok(L(w, id).history.some((h) => h.text.includes(old) && h.text.includes(heir)), 'written in the history');
});

test('the news tells only of realms you know, newest first, and stays short', () => {
  let w = initWorld(12); w = { ...w, rivals: w.rivals.map((r, i) => (i % 2 ? { ...r, known: false } : r)) };
  w = run(w, 40);
  const known = new Set(w.rivals.filter((r) => r.known !== false).map((r) => r.id));
  assert.ok((w.news ?? []).length > 0 && (w.news ?? []).length <= 50);
  for (const n of w.news ?? []) assert.ok(n.ids.some((id) => known.has(id)));
  const days = (w.news ?? []).map((n) => n.day); assert.deepEqual(days, [...days].sort().reverse(), 'newest first');
});
