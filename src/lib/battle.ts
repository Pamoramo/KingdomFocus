// Battle simulation: ranged volleys, cavalry charges, melee rounds, morale and rout.
// Deterministic for a given seed so battles can be replayed and tested.
import { TROOPS, type TClass } from './economy.ts';

export type Tactic = 'assault' | 'shieldwall' | 'flank' | 'volley' | 'feint' | 'ambush';
export type Terrain = 'plains' | 'forest' | 'hills' | 'river' | 'marsh';
export interface Unit { cls: TClass; count: number; rank: number; ref?: string }
export interface Side { name: string; units: Unit[]; commander: number; tactic: Tactic; fort?: number; engines?: { ram?: number; tower?: number; ballista?: number } }
export interface Round { phase: 'volley' | 'charge' | 'melee' | 'rout' | 'assault'; a: number; b: number; text: string }
export interface BattleResult { winner: 'a' | 'b'; rounds: Round[]; lossA: number[]; lossB: number[]; moraleA: number; moraleB: number; startA: number; startB: number; seed: number; terrain: Terrain; siege: boolean }

export const TACTICS: Record<Tactic, { name: string; desc: string }> = {
  assault: { name: 'Frontal Assault', desc: 'Straightforward attack. +15% melee. Beaten by a defensive line or a feigned retreat.' },
  shieldwall: { name: 'Defensive Line', desc: 'Shields and spears hold firm. Strong against charges and assaults, weak to archery.' },
  flank: { name: 'Flanking Maneuver', desc: 'Cavalry sweeps around the line. Needs cavalry (15%+). Crushes archers.' },
  volley: { name: 'Skirmish & Volley', desc: 'Extra arrow volleys before contact. Breaks defensive lines.' },
  feint: { name: 'Feigned Retreat', desc: 'Lure the enemy out of formation. Needs cavalry and veteran troops. Punishes assaults and flanks.' },
  ambush: { name: 'Ambush', desc: 'Hidden first strike. Only in forest or hills. Devastating against assaults and volleys.' },
};
export const TERRAINS: Record<Terrain, string> = { plains: 'Open plains favour cavalry.', forest: 'Forests hinder horses and arrows, but hide ambushes.', hills: 'High ground favours the defender and archers.', river: 'Crossing a river weakens the attacker.', marsh: 'Marshes bog down heavy troops and horses.' };
/** How much tactic A's effectiveness is multiplied when facing tactic B. */
const COUNTER: Partial<Record<Tactic, Partial<Record<Tactic, number>>>> = {
  shieldwall: { assault: 1.25, flank: 1.3, volley: 0.75 },
  volley: { shieldwall: 1.3, assault: 1.1, flank: 0.75, ambush: 0.8 },
  flank: { volley: 1.35, shieldwall: 0.75, feint: 0.7 },
  feint: { assault: 1.35, flank: 1.25, shieldwall: 0.8 },
  ambush: { assault: 1.35, volley: 1.3, shieldwall: 0.9 },
  assault: { volley: 1.1, ambush: 0.75 },
};

interface Stats { ranged: number; cav: boolean; antiCav: boolean; armor: number; shield: boolean }
const S: Record<TClass, Stats> = {
  peasant: { ranged: 0, cav: false, antiCav: false, armor: 0, shield: false }, militia: { ranged: 0, cav: false, antiCav: false, armor: 0.2, shield: true },
  spearman: { ranged: 0, cav: false, antiCav: true, armor: 0.2, shield: true }, squire: { ranged: 0, cav: false, antiCav: false, armor: 0.25, shield: true },
  archer: { ranged: 1, cav: false, antiCav: false, armor: 0.1, shield: false }, swordsman: { ranged: 0, cav: false, antiCav: false, armor: 0.4, shield: true },
  shieldman: { ranged: 0, cav: false, antiCav: true, armor: 0.45, shield: true }, pikeman: { ranged: 0, cav: false, antiCav: true, armor: 0.35, shield: false },
  longbow: { ranged: 1.3, cav: false, antiCav: false, armor: 0.15, shield: false }, crossbow: { ranged: 1.2, cav: false, antiCav: false, armor: 0.35, shield: false },
  manatarms: { ranged: 0, cav: false, antiCav: false, armor: 0.6, shield: true }, lightcav: { ranged: 0, cav: true, antiCav: false, armor: 0.25, shield: true },
  knight: { ranged: 0, cav: false, antiCav: false, armor: 0.7, shield: true }, heavyinf: { ranged: 0, cav: false, antiCav: false, armor: 0.75, shield: true },
  halberdier: { ranged: 0, cav: false, antiCav: true, armor: 0.65, shield: false }, mknight: { ranged: 0, cav: true, antiCav: false, armor: 0.75, shield: true },
  royalarcher: { ranged: 1.6, cav: false, antiCav: false, armor: 0.4, shield: false }, vetcav: { ranged: 0, cav: true, antiCav: false, armor: 0.7, shield: true },
  royalguard: { ranged: 0, cav: false, antiCav: true, armor: 0.85, shield: false },
};
export const unitStats = (c: TClass) => S[c];
export const rankMult = (r: number) => 1 + r * 0.25;
export const unitPower = (u: Unit) => u.count * TROOPS[u.cls].power * rankMult(u.rank);
export const sidePower = (units: Unit[]) => units.reduce((a, u) => a + unitPower(u), 0);

function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Can this side use the tactic? Returns a reason if not. */
export function tacticLock(units: Unit[], t: Tactic, terrain: Terrain, commander = 0): string | null {
  const total = units.reduce((a, u) => a + u.count, 0) || 1, cav = units.filter((u) => S[u.cls].cav).reduce((a, u) => a + u.count, 0) / total;
  const avgRank = units.reduce((a, u) => a + u.rank * u.count, 0) / total;
  if (t === 'flank' && cav < 0.15) return 'Needs at least 15% cavalry';
  if (t === 'feint' && (cav < 0.1 || avgRank < 1.5)) return 'Needs cavalry and veteran troops';
  if (t === 'feint' && commander < 1) return 'Needs a Lieutenant or better';
  if (t === 'ambush' && terrain !== 'forest' && terrain !== 'hills') return 'Only in forest or hills';
  return null;
}

function eff(side: Side, other: Side, terrain: Terrain, defender: boolean) {
  let m = (COUNTER[side.tactic]?.[other.tactic] ?? 1) * (1 + side.commander * 0.06);
  if (terrain === 'hills' && defender) m *= 1.15;
  if (terrain === 'river' && !defender) m *= 0.85;
  return m;
}

/** Simulates a battle. Side a attacks, side b defends (b may sit behind walls: fort 0..1). */
export function simulate(a: Side, b: Side, terrain: Terrain, seed = 1, siege = false): BattleResult {
  const R = rng(seed), units = [a.units.map((u) => ({ ...u })), b.units.map((u) => ({ ...u }))];
  const start = units.map((l) => l.map((u) => u.count));
  const sides = [a, b], morale = [100, 100], rounds: Round[] = [];
  const alive = (i: number) => units[i].reduce((x, u) => x + u.count, 0);
  const fortB = Math.max(0, Math.min(0.85, (b.fort ?? 0) - (a.engines?.ram ?? 0) * 0.08 - (a.engines?.tower ?? 0) * 0.12));
  const mult = [eff(a, b, terrain, false), eff(b, a, terrain, true)];
  const tacMelee = (t: Tactic) => (t === 'assault' ? 1.15 : t === 'shieldwall' ? 0.85 : t === 'volley' ? 0.9 : 1);
  const tacDef = (t: Tactic) => (t === 'shieldwall' ? 1.3 : 1);
  /** Removes `dmg` worth of soldiers from side i, spread by exposure and armour. */
  const hurt = (i: number, dmg: number, kind: 'ranged' | 'melee' | 'charge') => {
    const list = units[i], tot = alive(i); if (!tot) return 0;
    let killed = 0;
    for (const u of list) {
      if (!u.count) continue;
      const s = S[u.cls]; let res = 1 - s.armor * 0.6;
      if (kind === 'ranged' && s.shield) res *= 0.7;
      if (kind === 'ranged' && i === 1) res *= 1 - fortB * 0.75;
      if (kind === 'melee' && i === 1) res *= 1 - fortB * 0.5;
      if (kind === 'charge' && s.antiCav) res *= 0.5;
      if (kind !== 'ranged') res /= tacDef(sides[i].tactic);
      if (terrain === 'marsh' && s.armor > 0.5) res *= 1.15;
      const share = dmg * (u.count / tot) * res / (TROOPS[u.cls].power * rankMult(u.rank) * 1.6);
      const k = Math.min(u.count, Math.floor(share + R()));
      u.count -= k; killed += k;
    }
    return killed;
  };
  const rangedPow = (i: number) => units[i].reduce((x, u) => x + u.count * S[u.cls].ranged * TROOPS[u.cls].power * rankMult(u.rank), 0) * (terrain === 'forest' ? 0.8 : terrain === 'hills' ? 1.1 : 1) + (i === 0 ? (a.engines?.ballista ?? 0) * 25 : 0);
  const cavPow = (i: number) => units[i].reduce((x, u) => x + (S[u.cls].cav ? u.count * TROOPS[u.cls].power * rankMult(u.rank) : 0), 0) * (terrain === 'plains' ? 1.2 : terrain === 'forest' || terrain === 'marsh' ? 0.7 : 1);
  const meleePow = (i: number) => units[i].reduce((x, u) => x + u.count * TROOPS[u.cls].power * rankMult(u.rank) * (S[u.cls].ranged ? 0.4 : 1), 0);
  const moraleHit = (i: number, k: number, startN: number) => { morale[i] -= (k / Math.max(1, startN)) * 140 * (i === 1 ? 1 - fortB * 0.4 : 1); };
  const N0 = [alive(0), alive(1)];

  // 1. volleys
  const volleys = (t: Tactic) => (t === 'volley' ? 3 : 2);
  for (let v = 0; v < Math.max(volleys(a.tactic), volleys(b.tactic)); v++) {
    const ka = v < volleys(a.tactic) ? hurt(1, rangedPow(0) * 0.35 * mult[0] * (0.85 + R() * 0.3), 'ranged') : 0;
    const kb = v < volleys(b.tactic) ? hurt(0, rangedPow(1) * 0.35 * mult[1] * (0.85 + R() * 0.3), 'ranged') : 0;
    moraleHit(1, ka, N0[1]); moraleHit(0, kb, N0[0]);
    if (ka || kb) rounds.push({ phase: 'volley', a: kb, b: ka, text: `Arrows darken the sky: ${a.name} lose ${kb}, ${b.name} lose ${ka}.` });
  }
  // 2. cavalry charge (not into walls)
  if (!siege) for (const i of [0, 1]) {
    const cp = cavPow(i) * (sides[i].tactic === 'flank' ? 1.5 : 1) * mult[i];
    if (cp <= 0) continue;
    const k = hurt(1 - i, cp * 0.5 * (0.85 + R() * 0.3), 'charge'), anti = units[1 - i].reduce((x, u) => x + (S[u.cls].antiCav ? u.count : 0), 0);
    const back = Math.min(units[i].filter((u) => S[u.cls].cav).reduce((x, u) => x + u.count, 0), Math.floor(anti * 0.06 + R()));
    for (const u of units[i]) if (S[u.cls].cav && back) { const t = Math.min(u.count, back); u.count -= t; }
    moraleHit(1 - i, k, N0[1 - i]); moraleHit(i, back, N0[i]);
    rounds.push({ phase: 'charge', a: i === 0 ? back : k, b: i === 0 ? k : back, text: `${sides[i].name}'s cavalry charges${sides[i].tactic === 'flank' ? ' around the flank' : ''}, felling ${k}${back ? ` but losing ${back} riders to the spears` : ''}.` });
  }
  if (siege) rounds.push({ phase: 'assault', a: 0, b: 0, text: fortB > 0.4 ? 'Ladders and siege towers press against strong walls.' : fortB > 0 ? 'The attackers storm the battered walls.' : 'The walls are breached; the assault pours through.' });
  // 3. melee until one side breaks
  let winner: 'a' | 'b' | null = null;
  for (let r = 0; r < 8 && !winner; r++) {
    const first = r === 0 ? [a.tactic === 'ambush' ? 1.4 : 1, b.tactic === 'ambush' ? 1.4 : 1] : [1, 1];
    const pa = meleePow(0) * mult[0] * tacMelee(a.tactic) * first[0] * (0.25 + morale[0] / 133);
    const pb = meleePow(1) * mult[1] * tacMelee(b.tactic) * first[1] * (0.25 + morale[1] / 133) * (1 + fortB * 0.3);
    const kb = hurt(1, pa * 0.3 * (0.85 + R() * 0.3), 'melee'), ka = hurt(0, pb * 0.3 * (0.85 + R() * 0.3), 'melee');
    moraleHit(0, ka, N0[0]); moraleHit(1, kb, N0[1]);
    rounds.push({ phase: 'melee', a: ka, b: kb, text: `The lines clash${r ? ' again' : ''}: ${a.name} lose ${ka}, ${b.name} lose ${kb}.` });
    if (!alive(1) || (morale[1] < 25 && morale[1] < morale[0])) winner = 'a';
    else if (!alive(0) || (morale[0] < 25 && morale[0] <= morale[1])) winner = 'b';
  }
  winner ??= meleePow(0) * morale[0] >= meleePow(1) * morale[1] ? 'a' : 'b';
  // 4. rout: the beaten side suffers in the chase
  const loser = winner === 'a' ? 1 : 0, chase = hurt(loser, meleePow(1 - loser) * 0.12, 'melee');
  rounds.push({ phase: 'rout', a: loser === 0 ? chase : 0, b: loser === 1 ? chase : 0, text: `${sides[loser].name} breaks and flees${chase ? `, losing ${chase} more in the rout` : ''}. Victory to ${sides[1 - loser].name}!` });
  return { winner, rounds, lossA: start[0].map((n, i) => n - units[0][i].count), lossB: start[1].map((n, i) => n - units[1][i].count), moraleA: Math.max(0, morale[0]), moraleB: Math.max(0, morale[1]), startA: N0[0], startB: N0[1], seed, terrain, siege };
}

/** Caps the attacker's own losses (a retreat saves the rest) and returns the adjusted result. */
export function capLosses(res: BattleResult, side: 'a' | 'b', frac: number): BattleResult {
  const key = side === 'a' ? 'lossA' : 'lossB', total = side === 'a' ? res.startA : res.startB, lost = res[key].reduce((x, n) => x + n, 0), max = Math.floor(total * frac);
  if (lost <= max) return res;
  const k = max / lost;
  return { ...res, [key]: res[key].map((n) => Math.floor(n * k)) };
}
