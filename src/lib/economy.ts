import type { Res } from './rewards.ts';

type Cost = Partial<Res>;
export type BKind = 'keep' | 'farm' | 'barracks' | 'range' | 'stable' | 'tower' | 'wall' | 'road' | 'house';
export interface BDef { name: string; size: number; unique?: boolean; levels: { name: string; cost: Cost; keep: number }[]; desc: string }

export const BUILDINGS: Record<BKind, BDef> = {
  keep: { name: 'Keep', size: 5, unique: true, desc: 'Seat of your realm. Each level unlocks new works.', levels: [
    { name: 'Camp', cost: {}, keep: 0 },
    { name: 'Wooden Hall', cost: { gold: 1500, wood: 400, renown: 10 }, keep: 1 },
    { name: 'Stone Keep', cost: { gold: 5000, wood: 600, stone: 800, renown: 40 }, keep: 2 },
    { name: 'Castle', cost: { gold: 15000, wood: 1500, stone: 3000, renown: 120 }, keep: 3 },
    { name: 'Royal Citadel', cost: { gold: 40000, wood: 3000, stone: 8000, renown: 400 }, keep: 4 },
  ] },
  farm: { name: 'Farm', size: 3, desc: 'Feeds troops (+40 army cap / level) and greens the land.', levels: [
    { name: 'Field', cost: { gold: 300, wood: 80 }, keep: 1 },
    { name: 'Homestead', cost: { gold: 800, wood: 150, stone: 50 }, keep: 1 },
    { name: 'Manor Farm', cost: { gold: 2000, wood: 300, stone: 200 }, keep: 3 },
  ] },
  house: { name: 'Cottage', size: 2, desc: 'Villagers (+15 army cap / level).', levels: [
    { name: 'Hut', cost: { gold: 150, wood: 60 }, keep: 1 },
    { name: 'Cottage', cost: { gold: 500, wood: 120, stone: 60 }, keep: 2 },
  ] },
  barracks: { name: 'Barracks', size: 3, desc: 'Trains infantry. Level 2: squires. Level 3: royal guard.', levels: [
    { name: 'Training Yard', cost: { gold: 600, wood: 150 }, keep: 1 },
    { name: 'Barracks', cost: { gold: 2000, wood: 300, stone: 300 }, keep: 2 },
    { name: 'War College', cost: { gold: 5000, wood: 500, stone: 800, renown: 30 }, keep: 3 },
  ] },
  range: { name: 'Archery Range', size: 3, desc: 'Trains archers.', levels: [
    { name: 'Butts', cost: { gold: 1200, wood: 250 }, keep: 2 },
    { name: 'Archery Hall', cost: { gold: 4000, wood: 400, stone: 500 }, keep: 3 },
  ] },
  stable: { name: 'Stable', size: 3, desc: 'Trains cavalry. Level 2: knights.', levels: [
    { name: 'Stable', cost: { gold: 2500, wood: 400, stone: 300 }, keep: 3 },
    { name: 'Royal Stables', cost: { gold: 8000, wood: 600, stone: 1200, renown: 60 }, keep: 4 },
  ] },
  tower: { name: 'Tower', size: 2, desc: 'Defensive tower.', levels: [
    { name: 'Watchtower', cost: { gold: 300, wood: 120 }, keep: 1 },
    { name: 'Stone Tower', cost: { gold: 1200, stone: 400 }, keep: 2 },
    { name: 'Great Tower', cost: { gold: 4000, stone: 1200, renown: 20 }, keep: 4 },
  ] },
  wall: { name: 'Wall', size: 1, desc: 'Palisade, then stone curtain wall.', levels: [
    { name: 'Palisade', cost: { gold: 40, wood: 15 }, keep: 1 },
    { name: 'Stone Wall', cost: { gold: 120, stone: 40 }, keep: 2 },
  ] },
  road: { name: 'Road', size: 1, desc: 'Dirt track, then cobblestone.', levels: [
    { name: 'Dirt Road', cost: { gold: 10 }, keep: 1 },
    { name: 'Cobbled Road', cost: { gold: 30, stone: 10 }, keep: 2 },
  ] },
};

export type TClass = 'militia' | 'infantry' | 'squire' | 'archer' | 'cavalry' | 'knight' | 'guard';
export interface TDef { name: string; cost: Cost; req: Partial<Record<BKind, number>>; power: number }
export const TROOPS: Record<TClass, TDef> = {
  militia: { name: 'Militia', cost: { gold: 20 }, req: {}, power: 1 },
  infantry: { name: 'Men-at-Arms', cost: { gold: 40, wood: 5 }, req: { barracks: 1 }, power: 3 },
  squire: { name: 'Squire', cost: { gold: 60, stone: 5 }, req: { barracks: 2 }, power: 4 },
  archer: { name: 'Archer', cost: { gold: 50, wood: 10 }, req: { range: 1 }, power: 4 },
  cavalry: { name: 'Cavalry', cost: { gold: 150, stone: 20, renown: 2 }, req: { stable: 1 }, power: 10 },
  knight: { name: 'Knight', cost: { gold: 400, stone: 40, renown: 10 }, req: { stable: 2, keep: 4 }, power: 25 },
  guard: { name: 'Royal Guard', cost: { gold: 800, stone: 80, renown: 25 }, req: { barracks: 3, keep: 5 }, power: 40 },
};
export const TCLASSES = Object.keys(TROOPS) as TClass[];
export const ARMOR = ['Leather', 'Chainmail', 'Plate', 'Gilded Plate'];
/** Cost to upgrade a class's armor to tier t (1..3), scaled per soldier owned. */
export const armorCost = (c: TClass, t: number): Cost => {
  const g = (TROOPS[c].cost.gold ?? 20) * 15 * t;
  return { gold: g, stone: Math.round(g / 8), renown: 5 * t * t };
};
export const armorKeepReq = (t: number) => t + 2; // tier1->keep3, tier2->keep4, tier3->keep5

export const RANKS: [number, string][] = [[0, 'Sergeant'], [24, 'Lieutenant'], [60, 'Captain'], [150, 'Major'], [400, 'Colonel'], [1000, 'Marshal']];
export const rankFor = (n: number) => RANKS.filter(([m]) => n >= m).at(-1)![1];
export const SQUAD_SIZE = 12;
export const SQUADS_PER_COMPANY = 4;
export const BANNER_COLORS = [0xb3242a, 0x1f4e9c, 0x2a7a3b, 0x6a2a8c, 0xc9a227, 0x222222, 0xd4d4d4, 0xc05a1a];
export const EMBLEMS = ['lion', 'cross', 'tower', 'star', 'sword'] as const;
