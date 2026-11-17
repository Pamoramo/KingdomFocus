// The other castles as living lordships. Each realm has a lord (who ages, dies and is succeeded), a treasury fed by
// its lands, holdings it builds up, an army it raises and pays for, and ties of friendship or enmity with every
// other realm. Once a game day every lordship takes its turn: it collects, pays its men, and then does the one
// thing that serves it best, scored from its needs, its resources, its character, its lands and its neighbours
// (a little chance only breaks ties). What happens is written to the realm's history and the world's news.
// Pure functions on WorldState; stored inside the world save (no database change). Old saves gain it lazily.
import { type Rival, type WorldState, type Personality, WORLD_SCALE, isKnown } from './war.ts';
import { biomeOf, type Biome } from './realms.ts';
import { hash, nameFor } from './names.ts';

export type LordTrait = 'ambitious' | 'cautious' | 'greedy' | 'generous' | 'warlike' | 'devout' | 'shrewd' | 'cruel' | 'just' | 'sickly' | 'builder';
export const TRAIT: Record<LordTrait, { name: string; desc: string }> = {
  ambitious: { name: 'Ambitious', desc: 'Covets more land and a greater castle.' },
  cautious: { name: 'Cautious', desc: 'Builds walls and avoids risky wars.' },
  greedy: { name: 'Greedy', desc: 'Hoards gold; drives hard bargains.' },
  generous: { name: 'Generous', desc: 'Quick to send aid and gifts.' },
  warlike: { name: 'Warlike', desc: 'Keeps a large host and seeks battle.' },
  devout: { name: 'Devout', desc: 'Builds churches; keeps the peace with the faithful.' },
  shrewd: { name: 'Shrewd', desc: 'A gifted trader and negotiator.' },
  cruel: { name: 'Cruel', desc: 'Feared by neighbours and subjects alike.' },
  just: { name: 'Just', desc: 'Honours treaties; slow to start wars.' },
  sickly: { name: 'Sickly', desc: 'Frail of health; the court whispers of succession.' },
  builder: { name: 'Builder', desc: 'Loves stone and mortar; always raising something.' },
};
const TRAITS = Object.keys(TRAIT) as LordTrait[];
/** What a lordship can build. Farms feed, lumber camps and quarries supply, markets enrich, barracks hold soldiers, walls defend, churches calm. */
export type Holding = 'farm' | 'lumber' | 'quarry' | 'market' | 'barracks' | 'walls' | 'church';
export const HOLDING: Record<Holding, { name: string; cost: { gold: number; wood: number; stone: number } }> = {
  farm: { name: 'farmland', cost: { gold: 60, wood: 30, stone: 0 } },
  lumber: { name: 'a lumber camp', cost: { gold: 50, wood: 0, stone: 10 } },
  quarry: { name: 'a quarry', cost: { gold: 70, wood: 30, stone: 0 } },
  market: { name: 'a market', cost: { gold: 120, wood: 60, stone: 40 } },
  barracks: { name: 'barracks', cost: { gold: 150, wood: 80, stone: 60 } },
  walls: { name: 'new walls', cost: { gold: 120, wood: 20, stone: 140 } },
  church: { name: 'a church', cost: { gold: 140, wood: 60, stone: 100 } },
};
const HOLDINGS = Object.keys(HOLDING) as Holding[];
export interface Lord { name: string; age: number; traits: LordTrait[]; since: string; heir: string; house: string; gen: number }
export interface Lordship {
  lord: Lord; gold: number; food: number; wood: number; stone: number;
  has: Record<Holding, number>;
  /** friendship (+) or enmity (-) with other realms, -100..100 */ ties: Record<string, number>;
  /** realms at war with this one, and since when */ wars: Record<string, string>;
  allies: string[]; plan: string; history: { day: string; text: string }[]; days: number;
  /** no war with these realms until the given day (after a peace) */ truces?: Record<string, string>;
}
export interface News { day: string; text: string; ids: string[]; kind: 'build' | 'grow' | 'trade' | 'war' | 'peace' | 'alliance' | 'aid' | 'ruler' | 'army' | 'famine' }

const clamp = (v: number, a = -100, b = 100) => Math.max(a, Math.min(b, v));
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
/** Distance between two realms in leagues. */
export const between = (a: Pick<Rival, 'x' | 'y'>, b: Pick<Rival, 'x' | 'y'>) => Math.hypot((a.x - b.x) * WORLD_SCALE, (a.y - b.y) * WORLD_SCALE);
const NEAR = 0.6; // leagues within which realms trade, quarrel and march on each other
const lords = (w: Pick<WorldState, 'rivals'>) => w.rivals.filter((r) => !r.bandits);
/** What each kind of land yields, per holding and per day. */
export const YIELD: Record<Biome, { food: number; wood: number; stone: number; gold: number }> = {
  grassland: { food: 1.4, wood: 0.9, stone: 0.7, gold: 1 }, forest: { food: 0.9, wood: 1.6, stone: 0.7, gold: 0.9 }, highlands: { food: 0.7, wood: 0.8, stone: 1.6, gold: 1 },
  desert: { food: 0.5, wood: 0.5, stone: 1, gold: 1.5 }, swamp: { food: 0.9, wood: 1.1, stone: 0.5, gold: 0.8 }, tundra: { food: 0.6, wood: 1.2, stone: 1.1, gold: 0.9 },
};
/** How much the realm's character likes each kind of building. */
const TASTE: Record<Personality, Partial<Record<Holding, number>>> = {
  aggressive: { barracks: 1.8, walls: 1.1, market: 0.7 }, mercantile: { market: 2, lumber: 1.1, barracks: 0.6 }, honorable: { walls: 1.5, church: 1.2, barracks: 1.1 },
  treacherous: { barracks: 1.4, market: 1.2, church: 0.6 }, pious: { church: 2, farm: 1.2, barracks: 0.7 },
};

// ---------------- founding a lordship ----------------
/** A realm's lordship, created the same way every time from the world seed (so old saves gain one without storing anything first). */
export function lordshipOf(w: Pick<WorldState, 'seed' | 'rivals'>, r: Rival): Lordship {
  if (r.lordship) return r.lordship;
  const R = rng(hash(`lord:${w.seed}:${r.id}`)), L = r.level, pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
  const lean: Record<Personality, LordTrait[]> = { aggressive: ['warlike', 'ambitious', 'cruel'], mercantile: ['shrewd', 'greedy', 'builder'], honorable: ['just', 'cautious', 'generous'], treacherous: ['cruel', 'shrewd', 'ambitious'], pious: ['devout', 'generous', 'just'] };
  const traits = [pick(lean[r.personality]), pick(TRAITS)].filter((t, i, a) => a.indexOf(t) === i);
  const house = r.ruler.split(' ').slice(-1)[0], ties: Record<string, number> = {};
  for (const o of lords(w)) if (o.id !== r.id) ties[o.id] = r.friends.includes(o.id) ? 55 : r.foes.includes(o.id) ? -55 : clamp(Math.round((compat(r.personality, o.personality) - between(r, o) * 10) + (R() - 0.5) * 20));
  const has: Record<Holding, number> = { farm: 2 + L, lumber: 1 + Math.floor(L / 2), quarry: Math.floor(L / 2), market: Math.max(0, L - 2), barracks: Math.max(1, L - 1), walls: L, church: L >= 3 ? 1 : 0 };
  const founded = 300 + (hash(r.id + w.seed) % 500);
  return { lord: { name: r.ruler, age: 25 + Math.floor(R() * 30), traits, since: '', heir: nameFor(`${r.id}:heir:0:${w.seed}`).split(' ')[0] + ' ' + house, house, gen: 1 + Math.floor(R() * 6) },
    gold: 150 * L, food: 120 + 40 * L, wood: 60 * L, stone: 40 * L, has, ties, wars: {}, allies: [...r.friends], plan: 'Tending the realm',
    history: [{ day: '', text: `The House of ${house} has ruled ${r.name} since the year ${founded}.` }, { day: '', text: `${r.ruler} holds the ${L >= 4 ? 'great castle' : L >= 2 ? 'castle' : 'keep'}, the ${['third', 'fourth', 'fifth', 'sixth', 'seventh'][Math.floor(R() * 5)]} of the line.` }], days: 0 };
}
/** How readily two characters get along (before distance and events). */
function compat(a: Personality, b: Personality): number {
  if (a === b) return a === 'aggressive' || a === 'treacherous' ? -10 : 20;
  const pair = [a, b].sort().join('|');
  return ({ 'aggressive|pious': -15, 'aggressive|mercantile': -10, 'honorable|treacherous': -25, 'aggressive|honorable': -5, 'mercantile|pious': 10, 'honorable|pious': 15, 'honorable|mercantile': 10, 'mercantile|treacherous': 0, 'pious|treacherous': -15, 'aggressive|treacherous': 5 } as Record<string, number>)[pair] ?? 0;
}
const has = (l: Lordship, t: LordTrait) => l.lord.traits.includes(t);
/** The most soldiers a realm can feed and house: grows with its castle, farms and barracks. */
export const armyCapOf = (r: Pick<Rival, 'level'>, l: Pick<Lordship, 'has'>) => Math.round(120 * r.level ** 2.2 * (1 + 0.12 * l.has.barracks + 0.04 * l.has.farm));
/** What the realm makes in a day, and what its army costs. */
export function incomeOf(w: Pick<WorldState, 'seed' | 'rivals'>, r: Rival, l: Lordship) {
  const y = YIELD[biomeOf(w, r)], h = l.has;
  const food = Math.round((h.farm * 10 + 4) * y.food), wood = Math.round((h.lumber * 9 + 2) * y.wood), stone = Math.round((h.quarry * 8 + 1) * y.stone);
  const gold = Math.round((h.market * 22 + h.farm * 2 + r.level * 8) * y.gold * (has(l, 'greedy') ? 1.15 : 1));
  const upkeep = { food: Math.round(r.power / 50), gold: Math.round(r.power / 90) };
  return { food, wood, stone, gold, upkeep };
}

// ---------------- the daily turn ----------------
const say = (out: News[], day: string, kind: News['kind'], ids: string[], text: string) => out.push({ day, kind, ids, text });
const note = (l: Lordship, day: string, text: string) => { l.history = [...l.history, { day, text }].slice(-12); };
const afford = (l: Lordship, c: { gold: number; wood: number; stone: number }) => l.gold >= c.gold && l.wood >= c.wood && l.stone >= c.stone;
const costOf = (r: Rival, h: Holding) => { const c = HOLDING[h].cost, k = 1 + r.level * 0.25; return { gold: Math.round(c.gold * k), wood: Math.round(c.wood * k), stone: Math.round(c.stone * k) }; };
/** Cost of raising the castle to the next level. */
export const growCost = (r: Pick<Rival, 'level'>) => ({ gold: 600 * r.level ** 1.6, wood: 250 * r.level, stone: 350 * r.level });

/** Runs `days` turns for every lordship. `player` is your realm's strength, so lords can weigh you too. */
export function simulateLordships(w: WorldState, days: number, today: string): WorldState {
  let out: WorldState = { ...w, rivals: w.rivals.map((r) => (r.bandits ? r : { ...r, lordship: clone(lordshipOf(w, r)) })) };
  const news: News[] = [];
  for (let d = 0; d < days; d++) out = turn(out, today, d, news);
  const known = new Set(out.rivals.filter(isKnown).map((r) => r.id));
  return { ...out, news: [...news.filter((n) => n.ids.some((id) => known.has(id))), ...(out.news ?? [])].slice(0, 50) };
}
const clone = (l: Lordship): Lordship => ({ ...l, truces: { ...(l.truces ?? {}) }, lord: { ...l.lord, traits: [...l.lord.traits] }, has: { ...l.has }, ties: { ...l.ties }, wars: { ...l.wars }, allies: [...l.allies], history: [...l.history] });

function turn(w: WorldState, today: string, d: number, news: News[]): WorldState {
  const rs = lords(w), byId = new Map(rs.map((r) => [r.id, r]));
  for (const r of rs) {
    const l = r.lordship!, R = rng(hash(`${w.seed}:${today}:${d}:${r.id}`));
    l.days++;
    // 1. the harvest and the tax, then the soldiers' pay
    const inc = incomeOf(w, r, l);
    l.food += inc.food - inc.upkeep.food; l.wood += inc.wood; l.stone += inc.stone; l.gold += inc.gold - inc.upkeep.gold;
    if (l.food < 0 || l.gold < 0) { // hunger and empty coffers: soldiers desert
      const lost = Math.round(r.power * 0.04); r.power = Math.max(30, r.power - lost); l.food = Math.max(0, l.food); l.gold = Math.max(0, l.gold);
      if (lost > 10 && R() < 0.4) say(news, today, 'famine', [r.id], `Hunger in ${r.name}: ${lost} soldiers desert ${l.lord.name}.`);
    }
    const cap = armyCapOf(r, l); if (r.power > cap * 1.05 && !Object.keys(l.wars).length) r.power -= Math.round((r.power - cap) * 0.08); // more men than the land can keep: they drift home
    // 2. the lord grows older; sometimes the crown passes
    if (l.days % 7 === 0) l.lord.age++;
    const death = l.lord.age < 50 ? 0.0004 : (l.lord.age - 48) / 900 * (has(l, 'sickly') ? 2.5 : 1);
    if (R() < death) succession(w, r, l, today, news, R);
    // 3. wars: a skirmish each day; exhaustion brings peace
    for (const [fid, since] of Object.entries(l.wars)) { const f = byId.get(fid); if (!f || f.id < r.id) continue; fight(r, f, since, today, news, R); }
  }
  // ties drift: neighbours chafe or rub along by their natures, allies share their friends' grudges, and cooled alliances break
  for (const r of rs) {
    const l = r.lordship!, chafe = (r.personality === 'aggressive' || r.personality === 'treacherous' ? 1 : 0) + (['warlike', 'cruel', 'ambitious'] as LordTrait[]).filter((t) => has(l, t)).length * 0.5 - (has(l, 'just') || has(l, 'devout') ? 0.5 : 0);
    for (const o of rs) {
      if (o.id === r.id) continue; const tie = l.ties[o.id] ?? 0, near = between(r, o) < NEAR, ally = l.allies.includes(o.id);
      const nat = compat(r.personality, o.personality) + (ally ? 35 : 0) - (near ? chafe * 8 : 0);
      l.ties[o.id] = clamp(tie + Math.sign(nat - tie) * Math.min(1, Math.abs(nat - tie)) - (near && !ally && chafe > 0 && tie < 30 ? chafe * 0.3 : 0));
      if (Object.keys(o.lordship!.wars).some((e) => l.allies.includes(e))) l.ties[o.id] = clamp(l.ties[o.id] - 2); // they make war on my friend
    }
    for (const id of [...l.allies]) { const o = byId.get(id); if (!o || (l.ties[id] ?? 0) >= 15 || (r.personality !== 'treacherous' && (l.ties[id] ?? 0) > -10)) continue;
      l.allies = l.allies.filter((x) => x !== id); o.lordship!.allies = o.lordship!.allies.filter((x) => x !== r.id); o.lordship!.ties[r.id] = clamp((o.lordship!.ties[r.id] ?? 0) - 25);
      note(l, today, `Broke the alliance with ${o.name}.`); note(o.lordship!, today, `${r.name} broke our alliance.`); say(news, today, 'alliance', [r.id, id], `${r.name} breaks its alliance with ${o.name}!`); }
  }
  // 4. each lord does the one thing that serves the realm best
  for (const r of rs) decide(w, r, byId, today, news, rng(hash(`${w.seed}:${today}:${d}:${r.id}:act`)));
  // your allies who are losing a war write to you for help (once a war)
  for (const r of rs) { if (r.status !== 'ally' || !isKnown(r)) continue; const l = r.lordship!;
    for (const [eid, since] of Object.entries(l.wars)) { const e = byId.get(eid), id = `aid-${r.id}-${eid}-${since}`; if (!e || e.power <= r.power || w.inbox.some((m) => m.id === id)) continue;
      w.inbox = [...w.inbox, { id, rival: r.id, kind: 'aid_request', day: today, text: `${l.lord.name} of ${r.name} begs your help: ${e.name} (≈${Math.round(e.power)} strong) is overrunning their lands.` }]; } }
  // keep the old diplomacy lists in step: friends are allies, foes are enemies at war or sworn enemies
  for (const r of rs) { const l = r.lordship!; r.friends = [...l.allies]; r.foes = Object.keys(l.ties).filter((id) => l.wars[id] !== undefined || l.ties[id] <= -60); r.garrison = Math.max(r.garrison, Math.round(r.power * 0.4)); }
  return w;
}

function succession(w: WorldState, r: Rival, l: Lordship, today: string, news: News[], R: () => number) {
  const old = l.lord, heir = old.heir, pick = <T,>(a: readonly T[]) => a[Math.floor(R() * a.length)];
  const traits = [R() < 0.5 && old.traits[0] !== 'sickly' ? old.traits[0] : pick(TRAITS), pick(TRAITS)].filter((t, i, a) => a.indexOf(t) === i);
  l.lord = { name: heir, age: 18 + Math.floor(R() * 20), traits, since: today, heir: nameFor(`${r.id}:heir:${old.gen + 1}:${w.seed}`).split(' ')[0] + ' ' + old.house, house: old.house, gen: old.gen + 1 };
  r.ruler = heir;
  // a new lord means new friendships: ties drift halfway back to where their natures put them
  for (const id of Object.keys(l.ties)) l.ties[id] = Math.round(l.ties[id] * 0.6);
  note(l, today, `${old.name} died at ${old.age}. ${heir} took the throne.`);
  say(news, today, 'ruler', [r.id], `The lord of ${r.name}, ${old.name}, is dead. Long live ${heir}, ${traits.map((t) => TRAIT[t].name.toLowerCase()).join(' and ')}!`);
}

function fight(a: Rival, b: Rival, since: string, today: string, news: News[], R: () => number) {
  const la = a.lordship!, lb = b.lordship!, pa = a.power, pb = b.power;
  // the stronger side presses; walls protect the defender's losses
  const ratio = pa / Math.max(1, pa + pb), hitA = Math.round(b.power * 0.03 * (0.6 + R() * 0.8) * (1 - ratio) * 2), hitB = Math.round(a.power * 0.03 * (0.6 + R() * 0.8) * ratio * 2);
  a.power = Math.max(30, a.power - Math.round(hitA * (1 - Math.min(0.5, la.has.walls * 0.05)))); b.power = Math.max(30, b.power - Math.round(hitB * (1 - Math.min(0.5, lb.has.walls * 0.05))));
  const length = since ? (new Date(today).getTime() - new Date(since).getTime()) / 864e5 : 0, weak = a.power < b.power * 0.45 ? a : b.power < a.power * 0.45 ? b : null;
  if ((weak && length >= 2) || length >= 8) { // even an outmatched lord holds out a day or two, while allies may come
    const loser = weak ?? (a.power < b.power ? a : b), winner = loser === a ? b : a, ll = loser.lordship!, wl = winner.lordship!;
    const tribute = Math.round(Math.min(ll.gold, 100 + ll.gold * 0.4)); ll.gold -= tribute; wl.gold += tribute;
    const lost: Holding | undefined = weak ? (['farm', 'market', 'lumber', 'quarry'] as Holding[]).find((h) => ll.has[h] > 1) : undefined; if (lost) { ll.has[lost]--; wl.has[lost]++; }
    delete la.wars[b.id]; delete lb.wars[a.id]; const until = new Date(new Date(today).getTime() + 12 * 864e5).toISOString().slice(0, 10); la.truces = { ...la.truces, [b.id]: until }; lb.truces = { ...lb.truces, [a.id]: until }; la.ties[b.id] = Math.min(la.ties[b.id] ?? 0, -20); lb.ties[a.id] = Math.min(lb.ties[a.id] ?? 0, -20);
    note(ll, today, `Made peace with ${winner.name}, paying ${tribute} gold${lost ? ` and ceding ${HOLDING[lost].name}` : ''}.`); note(wl, today, `Won the war against ${loser.name}${tribute ? `: ${tribute} gold in tribute` : ''}.`);
    say(news, today, 'peace', [a.id, b.id], weak ? `${loser.name} sues for peace: ${winner.name} takes ${tribute} gold${lost ? ` and ${HOLDING[lost].name}` : ''}.` : `${a.name} and ${b.name}, exhausted, make peace.`);
  } else if (R() < 0.25) say(news, today, 'war', [a.id, b.id], `Fighting on the border between ${a.name} and ${b.name}.`);
}

/** Scores every option for a lordship and does the best one. */
function decide(w: WorldState, r: Rival, byId: Map<string, Rival>, today: string, news: News[], R: () => number) {
  const l = r.lordship!, inc = incomeOf(w, r, l), cap = armyCapOf(r, l), biome = biomeOf(w, r), y = YIELD[biome];
  const vassal = r.status === 'vassal', enemies = Object.keys(l.wars).map((id) => byId.get(id)!).filter(Boolean);
  const threat = Math.max(0, ...enemies.map((e) => e.power / Math.max(1, r.power)), ...Object.entries(l.ties).filter(([id, t]) => t < -40 && byId.get(id) && between(r, byId.get(id)!) < NEAR).map(([id]) => byId.get(id)!.power / Math.max(1, r.power) * 0.6));
  const opts: { score: number; act: () => void; plan: string }[] = [];
  /** how badly the realm needs soldiers: at war, threatened, or by a warlike nature (options that bring men are weighed by how many) */
  const martial = (enemies.length ? 2.5 : 0) + threat * 1.5 + (r.personality === 'aggressive' ? 0.8 : 0.3) + (has(l, 'warlike') ? 0.8 : 0);
  const jitter = () => 1 + (R() - 0.5) * 0.15;
  // build: weighed by need (food short? soldiers unpaid?), what the land is good for, and the lord's taste
  for (const h of HOLDINGS) {
    const c = costOf(r, h); if (!afford(l, c)) continue;
    let need = 1;
    if (h === 'farm') need = inc.food - inc.upkeep.food < 8 ? 3 : 0.8 * y.food;
    if (h === 'lumber') need = l.wood < 80 ? 1.6 * y.wood : 0.5 * y.wood;
    if (h === 'quarry') need = l.stone < 80 ? 1.6 * y.stone : 0.5 * y.stone;
    if (h === 'market') need = (inc.gold - inc.upkeep.gold < 20 ? 1.8 : 1) * y.gold;
    if (h === 'barracks') need = (r.power > cap * 0.85 ? 1 + threat : 0.3) * (l.has.barracks >= r.level * 2 + 1 ? 0.25 : 1); // a castle has room for only so many
    if (h === 'walls') need = threat > 0.8 ? 2.2 : 0.5;
    if (h === 'church') need = l.has.church >= r.level ? 0.2 : 0.7;
    const taste = (TASTE[r.personality][h] ?? 1) * (has(l, 'builder') ? 1.3 : 1) * (h === 'walls' && has(l, 'cautious') ? 1.5 : 1) * (h === 'church' && has(l, 'devout') ? 1.8 : 1) * (h === 'barracks' && has(l, 'warlike') ? 1.5 : 1);
    opts.push({ score: need * taste * 10 * jitter() / (1 + l.has[h] * 0.15), plan: `Building ${HOLDING[h].name}`, act: () => {
      l.gold -= c.gold; l.wood -= c.wood; l.stone -= c.stone; l.has[h]++; if (h === 'walls') r.wallMax += 25;
      if (R() < 0.35 || h === 'walls' || h === 'church') say(news, today, 'build', [r.id], `${r.name} builds ${HOLDING[h].name}.`);
    } });
  }
  // raise the castle itself when the realm has outgrown it
  const gc = growCost(r), size = Object.values(l.has).reduce((a, b) => a + b, 0);
  if (r.level < 5 && size >= 6 + r.level * 5 && afford(l, gc)) opts.push({ score: (has(l, 'ambitious') ? 30 : 20) * jitter(), plan: 'Enlarging the castle', act: () => {
    l.gold -= gc.gold; l.wood -= gc.wood; l.stone -= gc.stone; r.level++; r.wallMax = Math.max(r.wallMax, Math.round(200 * r.level ** 1.5));
    note(l, today, `${l.lord.name} raised the castle to a greater seat.`); say(news, today, 'grow', [r.id], `${r.name} grows: ${l.lord.name} raises a greater castle.`);
  } });
  // recruit: when threatened, at war, or by a warlike nature, as long as gold, food and barracks allow
  if (r.power < cap && l.gold > 80 && inc.food - inc.upkeep.food > 0) {
    const n = Math.min(cap - r.power, Math.floor(l.gold / 2), Math.round(r.power * 0.08) + 10);
    if (n > 5) opts.push({ score: martial * 10 * Math.min(1.2, n / (r.power * 0.08 + 10)) * jitter(), plan: enemies.length ? 'Raising men for the war' : 'Strengthening the host', act: () => { r.power += n; l.gold -= n * 2; if (R() < 0.3 || enemies.length) say(news, today, 'army', [r.id], `${r.name} raises ${n} more soldiers.`); } });
  }
  if (!vassal) {
    const near = lords(w).filter((o) => o.id !== r.id && between(r, o) < NEAR && o.status !== 'vassal');
    // trade with a neighbour who has what you lack: both grow richer and friendlier
    for (const o of near) {
      const lo = o.lordship!, tie = l.ties[o.id] ?? 0; if (tie < -20 || l.wars[o.id] !== undefined) continue;
      const iLack = l.food < 60 ? 'food' : l.wood < 50 ? 'wood' : l.stone < 50 ? 'stone' : null, theyHave = iLack && (lo[iLack] ?? 0) > 200;
      const merchant = (r.personality === 'mercantile' ? 1.5 : 0.6) * (has(l, 'shrewd') ? 1.4 : 1);
      if (l.gold > 60 || theyHave) opts.push({ score: (theyHave ? 18 : 5) * merchant * (1 + tie / 100) * jitter(), plan: `Trading with ${o.name}`, act: () => {
        if (theyHave && iLack) { const q = 80; lo[iLack] -= q; l[iLack] += q; l.gold -= 40; lo.gold += 40; } else { l.gold += 25; lo.gold += 25; } // goods for coin, or a profitable exchange
        if (tie < 50) l.ties[o.id] = clamp(tie + 2); if ((lo.ties[r.id] ?? 0) < 50) lo.ties[r.id] = clamp((lo.ties[r.id] ?? 0) + 2); // trade makes friends, up to a point
        if (R() < 0.3) say(news, today, 'trade', [r.id, o.id], `Caravans run between ${r.name} and ${o.name}${theyHave ? `: ${iLack} for gold` : ''}.`);
      } });
    }
    // alliances: firm friends with a common enemy, or two honourable or pious houses
    for (const o of near) {
      const lo = o.lordship!, tie = l.ties[o.id] ?? 0; if (l.allies.includes(o.id) || l.allies.length >= 3 || lo.allies.length >= 3 || tie < 45 || (lo.ties[r.id] ?? 0) < 40 || l.wars[o.id] !== undefined) continue;
      const shared = Object.keys(l.wars).some((e) => (lo.ties[e] ?? 0) < -30) || Object.entries(l.ties).some(([e, t]) => t < -40 && (lo.ties[e] ?? 0) < -40);
      opts.push({ score: (shared ? 25 : 10) * (has(l, 'just') || r.personality === 'honorable' ? 1.3 : 1) * jitter(), plan: `Seeking an alliance with ${o.name}`, act: () => {
        l.allies.push(o.id); lo.allies.push(r.id); l.ties[o.id] = clamp(tie + 10); lo.ties[r.id] = clamp((lo.ties[r.id] ?? 0) + 10);
        note(l, today, `Sealed an alliance with ${o.name}.`); note(lo, today, `Sealed an alliance with ${r.name}.`); say(news, today, 'alliance', [r.id, o.id], `${r.name} and ${o.name} swear an alliance.`);
      } });
    }
    // asking allies for aid when a war goes badly; generous friends send men
    for (const e of enemies) if (e.power > r.power) for (const aid of l.allies.map((id) => byId.get(id)!).filter(Boolean)) {
      const la = aid.lordship!; if ((la.ties[r.id] ?? 0) < 25 || aid.power < 150 || la.wars[e.id] !== undefined) continue;
      const n = Math.round(aid.power * (has(la, 'generous') ? 0.2 : 0.12));
      opts.push({ score: martial * 10 * Math.min(2, n / (r.power * 0.08 + 10)) * jitter(), plan: `Begging ${aid.name} for aid`, act: () => { aid.power -= n; r.power += n; la.ties[r.id] = clamp((la.ties[r.id] ?? 0) + 5); l.ties[aid.id] = clamp((l.ties[aid.id] ?? 0) + 8);
        la.ties[e.id] = clamp((la.ties[e.id] ?? 0) - 10); note(l, today, `${aid.name} sent ${n} men against ${e.name}.`);
        say(news, today, 'aid', [r.id, aid.id, e.id], `${r.name} asks its ally for help against ${e.name}: ${aid.name} sends ${n} soldiers.`);
      } });
    }
    // war: a hated, weaker neighbour (not an ally, not the faithful's friend) tempts a warlike or ambitious lord
    for (const o of near) {
      const lo = o.lordship!, tie = l.ties[o.id] ?? 0; if (l.wars[o.id] !== undefined || l.allies.includes(o.id) || tie > -30 || enemies.length || (l.truces?.[o.id] ?? '') > today) continue; // a truce is kept
      const odds = r.power / Math.max(1, o.power + lo.allies.reduce((a, id) => a + (byId.get(id)?.power ?? 0) * 0.3, 0)); if (odds < 1.25) continue;
      const nature = (r.personality === 'aggressive' ? 1.3 : r.personality === 'treacherous' ? 1.3 : r.personality === 'honorable' || r.personality === 'pious' ? 0.4 : 0.8) * (has(l, 'warlike') || has(l, 'ambitious') ? 1.5 : 1) * (has(l, 'just') || has(l, 'cautious') ? 0.5 : 1);
      opts.push({ score: (-tie / 4) * Math.min(2, odds - 0.8) * nature * jitter(), plan: `Marching on ${o.name}`, act: () => {
        l.wars[o.id] = today; lo.wars[r.id] = today; l.ties[o.id] = clamp(tie - 20); lo.ties[r.id] = clamp((lo.ties[r.id] ?? 0) - 30);
        for (const a of lo.allies) { const ally = byId.get(a); if (ally) ally.lordship!.ties[r.id] = clamp((ally.lordship!.ties[r.id] ?? 0) - 15); }
        note(l, today, `Declared war on ${o.name}.`); note(lo, today, `${r.name} declared war on us.`);
        say(news, today, 'war', [r.id, o.id], `${r.name} declares war on ${o.name}! ${l.lord.name} marches.`);
      } });
    }
  }
  // or save up: a lord with nothing better to do fills the treasury
  opts.push({ score: 6 * (has(l, 'greedy') ? 1.6 : 1), plan: enemies.length ? `At war with ${enemies.map((e) => e.name).join(', ')}` : 'Filling the treasury', act: () => {} });
  const best = opts.sort((a, b) => b.score - a.score)[0];
  best.act(); l.plan = enemies.length ? `At war with ${enemies.map((e) => e.name).join(', ')}; ${best.plan.toLowerCase()}` : best.plan;
}
