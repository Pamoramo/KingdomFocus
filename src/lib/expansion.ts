// Expansion: claim the lands around your castle. Each settlement you found or grow adds to what study earns
// and how large an army you can feed, but the realm can only hold as many as its stage allows. Pure.
import type { Res } from './rewards.ts';
import { hash } from './names.ts';

export type SettleKind = 'village' | 'lumber' | 'mine' | 'market' | 'abbey';
export const SETTLE: Record<SettleKind, { name: string; levels: [string, string, string]; desc: string; fx: Partial<Record<keyof Res | 'cap', number>>; cost: Res }> = {
  village: { name: 'Farming village', levels: ['Hamlet', 'Village', 'Market town'], desc: '+20 army capacity and +2% gold per level.', fx: { cap: 20, gold: 0.02 }, cost: { gold: 300, wood: 150, stone: 0, renown: 0 } },
  lumber: { name: 'Lumber camp', levels: ['Woodcutters\' camp', 'Sawmill', 'Timber yard'], desc: '+10% wood from study per level.', fx: { wood: 0.1 }, cost: { gold: 250, wood: 60, stone: 40, renown: 0 } },
  mine: { name: 'Quarry', levels: ['Stone pit', 'Quarry', 'Deep mine'], desc: '+10% stone from study per level.', fx: { stone: 0.1 }, cost: { gold: 350, wood: 150, stone: 0, renown: 0 } },
  market: { name: 'Trading post', levels: ['Trading post', 'Fair town', 'Merchant city'], desc: '+6% gold from study per level.', fx: { gold: 0.06 }, cost: { gold: 500, wood: 120, stone: 80, renown: 5 } },
  abbey: { name: 'Abbey', levels: ['Hermitage', 'Priory', 'Great abbey'], desc: '+5% renown from study per level; the clergy are pleased.', fx: { renown: 0.05 }, cost: { gold: 400, wood: 80, stone: 150, renown: 10 } },
};
export interface Site { id: string; x: number; y: number; kind: SettleKind; name: string }
export interface Settlement { site: string; level: number; founded: number }
const NAMES = ['Oakvale', 'Millbrook', 'Ashford', 'Stonebridge', 'Larkhill', 'Fernwick', 'Eastmere', 'Thornby', 'Kingsley', 'Redwater'];
const KIND_ORDER: SettleKind[] = ['village', 'lumber', 'mine', 'market', 'abbey', 'village', 'lumber', 'mine'];
/** Eight sites in a ring around your castle (fixed for the world), nearer than any rival. */
export function sitesFor(seed: number): Site[] {
  let h = hash(`sites:${seed}`); const R = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const turn = R() * Math.PI * 2, kinds = [...KIND_ORDER].sort(() => R() - 0.5), names = [...NAMES].sort(() => R() - 0.5);
  return kinds.map((kind, i) => { const a = turn + (i / kinds.length) * Math.PI * 2 + (R() - 0.5) * 0.4, d = 0.1 + R() * 0.08;
    return { id: `site${i}`, x: 0.5 + Math.cos(a) * d * 1.1, y: 0.5 + Math.sin(a) * d, kind, name: names[i] }; });
}
/** How many settlements a kingdom of this stage can hold. */
export const settleCap = (stage: number) => [0, 1, 2, 3, 5, 8][Math.max(0, Math.min(5, stage))];
/** Founding gets dearer with each settlement you already hold. */
export const foundCost = (kind: SettleKind, held: number): Res => scaleRes(SETTLE[kind].cost, 1 + held * 0.6);
/** Growing a settlement to the next level; level 2 needs stage 3, level 3 needs stage 4. */
export const upgradeCost = (kind: SettleKind, level: number): Res => scaleRes(SETTLE[kind].cost, 2 * 2 ** (level - 1));
export const upgradeStage = (level: number) => (level === 1 ? 3 : 4);
/** Combined bonuses of all settlements. */
export function settlementFx(list: Settlement[] | undefined, sites: Site[]): Record<keyof Res | 'cap', number> {
  const out = { gold: 0, wood: 0, stone: 0, renown: 0, cap: 0 };
  for (const st of list ?? []) { const site = sites.find((x) => x.id === st.site); if (!site) continue; for (const [k, v] of Object.entries(SETTLE[site.kind].fx)) out[k as keyof typeof out] += (v ?? 0) * st.level; }
  return out;
}
const scaleRes = (r: Res, k: number): Res => ({ gold: Math.round(r.gold * k), wood: Math.round(r.wood * k), stone: Math.round(r.stone * k), renown: Math.round(r.renown * k) });
