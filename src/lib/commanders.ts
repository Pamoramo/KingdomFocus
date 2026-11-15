// Commanders: each has two traits that change how they fight and lead, a record of battles, and honours
// a grateful realm can bestow on its most successful captains. Pure: no game-state imports.
import { hash } from './names.ts';

export type TraitId = 'bold' | 'cautious' | 'siegemaster' | 'horseman' | 'hawkeye' | 'stalwart' | 'beloved' | 'drillmaster' | 'raider' | 'lucky' | 'diplomat' | 'veteran';
export type BattleKind = 'field' | 'assault' | 'defend' | 'raid';
export interface Trait { name: string; desc: string; quirk: string; cry: string; epithet: string }
export const TRAITS: Record<TraitId, Trait> = {
  bold: { name: 'Bold', desc: '+1 rating in field battles and raids, but up to 10% more losses.', quirk: 'Rides at the head of the charge.', cry: 'leads from the front!', epithet: 'the Bold' },
  cautious: { name: 'Cautious', desc: '-0.5 rating, but a third fewer of their soldiers fall.', quirk: 'Never commits a man he cannot spare.', cry: 'holds the reserve back, patient as stone.', epithet: 'the Wary' },
  siegemaster: { name: 'Siegemaster', desc: '+1.5 rating when storming walls.', quirk: 'Measures every wall by eye.', cry: 'points the ladders at the weakest stretch of wall!', epithet: 'the Wallbreaker' },
  horseman: { name: 'Horseman', desc: '+1 rating when at least 15% of the host is cavalry.', quirk: 'Sleeps in the stables.', cry: 'wheels the horse for a thundering charge!', epithet: 'the Rider' },
  hawkeye: { name: 'Hawkeye', desc: '+1 rating when at least a quarter of the host are bowmen.', quirk: 'Calls the wind before every volley.', cry: 'calls the range: "Loose!"', epithet: 'Hawkeye' },
  stalwart: { name: 'Stalwart', desc: '+1.5 rating defending your castle.', quirk: 'Walks the walls every night.', cry: 'plants the banner on the gate: "Not one step back!"', epithet: 'the Steadfast' },
  beloved: { name: 'Beloved', desc: 'The host fights on: +15 morale when they march to war.', quirk: 'Knows every soldier\'s name.', cry: 'rides down the line, and the men cheer.', epithet: 'the Beloved' },
  drillmaster: { name: 'Drillmaster', desc: '+25% experience for their battalion.', quirk: 'Drills the men at dawn, rain or shine.', cry: 'roars "Dress the line!" and the ranks snap straight.', epithet: 'the Hard' },
  raider: { name: 'Raider', desc: '+1.5 rating against bandits, and +50% spoils from outposts.', quirk: 'Knows every outlaw trail.', cry: 'slips around the camp to strike from behind!', epithet: 'the Hunter' },
  lucky: { name: 'Lucky', desc: '+0.5 rating, and arrows seem to miss them: 15% fewer losses.', quirk: 'Carries a battered horseshoe.', cry: 'grins as an arrow whistles past.', epithet: 'the Lucky' },
  diplomat: { name: 'Diplomat', desc: 'Lent to allies, wins +50% more trust.', quirk: 'Speaks four tongues.', cry: 'parleys with the enemy herald first.', epithet: 'the Silver-tongued' },
  veteran: { name: 'Old Campaigner', desc: '+0.5 rating in every battle.', quirk: 'Has outlived three kings.', cry: 'has seen worse days than this.', epithet: 'the Grey' },
};
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];
/** Two different traits, fixed by the commander's seed (so older saves get theirs without a migration). */
export function traitsFor(seed: string): TraitId[] {
  const h = hash(`traits:${seed}`), a = TRAIT_IDS[h % TRAIT_IDS.length];
  let b = TRAIT_IDS[(h >>> 8) % TRAIT_IDS.length]; if (b === a) b = TRAIT_IDS[(TRAIT_IDS.indexOf(a) + 5) % TRAIT_IDS.length];
  if ((a === 'bold' && b === 'cautious') || (a === 'cautious' && b === 'bold')) b = 'veteran';
  return [a, b];
}
export interface CmdRecord { name: string; rank: number; seed: string; traits?: TraitId[]; wins?: number; battles?: number; honors?: number }
export const traitsOf = (c: CmdRecord) => c.traits ?? traitsFor(c.seed);
export const has = (c: CmdRecord, t: TraitId) => traitsOf(c).includes(t);

/** Honours, each needing more victories: they add to the commander's rating and are proclaimed to the realm. */
export const HONORS = [
  { name: 'Mentioned in Dispatches', wins: 3, cost: { gold: 200 }, rating: 0.5 },
  { name: 'Knight of the Realm', wins: 6, cost: { gold: 600, renown: 20 }, rating: 0.5 },
  { name: 'Hero of the Realm', wins: 10, cost: { gold: 1500, renown: 60 }, rating: 1 },
] as const;
export const honorsOf = (c: CmdRecord) => c.honors ?? 0;
/** The next honour this commander has earned (enough wins, and won at least 60% of their battles), or why not. */
export function praiseReady(c: CmdRecord): { ok: true; honor: (typeof HONORS)[number] } | { ok: false; why: string } {
  const next = HONORS[honorsOf(c)]; if (!next) return { ok: false, why: 'Already a Hero of the Realm' };
  const w = c.wins ?? 0, b = c.battles ?? 0;
  if (w < next.wins) return { ok: false, why: `Needs ${next.wins} victories (has ${w})` };
  if (w / Math.max(1, b) < 0.6) return { ok: false, why: 'Needs to win at least 60% of battles' };
  return { ok: true, honor: next };
}
/** "Sir Aldric the Bold": an epithet from their best-known trait once they have won a few fights. */
export function styled(c: CmdRecord) {
  const t = traitsOf(c)[0], k = honorsOf(c) >= 2 ? 'Sir ' : '';
  return (c.wins ?? 0) >= 3 ? `${k}${c.name} ${TRAITS[t].epithet}` : `${k}${c.name}`;
}
/** Battle rating: rank, honours and whichever traits apply to this fight. */
export function rating(c: CmdRecord, kind: BattleKind, mix: { cav: number; ranged: number }, vsBandits = false) {
  let r = c.rank + HONORS.slice(0, honorsOf(c)).reduce((a, h) => a + h.rating, 0);
  for (const t of traitsOf(c)) {
    if (t === 'bold' && (kind === 'field' || kind === 'raid')) r += 1;
    if (t === 'cautious') r -= 0.5;
    if (t === 'siegemaster' && kind === 'assault') r += 1.5;
    if (t === 'horseman' && mix.cav >= 0.15) r += 1;
    if (t === 'hawkeye' && mix.ranged >= 0.25) r += 1;
    if (t === 'stalwart' && kind === 'defend') r += 1.5;
    if (t === 'raider' && (vsBandits || kind === 'raid')) r += 1.5;
    if (t === 'lucky' || t === 'veteran') r += 0.5;
  }
  return Math.max(0, r);
}
/** Multiplier on the share of soldiers this commander may lose in one battle. */
export function lossFactor(c: CmdRecord) { let k = 1; for (const t of traitsOf(c)) { if (t === 'bold') k *= 1.1; if (t === 'cautious') k *= 0.67; if (t === 'lucky') k *= 0.85; } return k; }
/** The line the battle opens with, e.g. "Captain Aldric the Bold leads from the front!" */
export function battleCry(c: CmdRecord, title: string, kind: BattleKind) {
  const ts = traitsOf(c), pick = ts.find((t) => (t === 'siegemaster' && kind === 'assault') || (t === 'stalwart' && kind === 'defend') || (t === 'raider' && kind === 'raid')) ?? ts[0];
  return `${title} ${styled(c)} ${TRAITS[pick].cry}`;
}
