import type { Res } from './rewards.ts';
type Cost = Partial<Res>;

// ================= technologies =================
export type TechId = 'agriculture' | 'masonry' | 'smithing' | 'polearms' | 'longbow' | 'mechanics' | 'horsemanship' | 'commerce' | 'drill' | 'heraldry' | 'chivalry' | 'steel' | 'engineering' | 'veterancy' | 'royal_decree';
export interface TechDef { name: string; cost: Cost; stage: number; req: TechId[]; desc: string }
export const TECHS: Record<TechId, TechDef> = {
  agriculture: { name: 'Agriculture', cost: { gold: 200, renown: 10 }, stage: 1, req: [], desc: 'Homesteads, manor farms and wells.' },
  masonry: { name: 'Masonry', cost: { gold: 800, stone: 100, renown: 30 }, stage: 2, req: [], desc: 'Stone walls, stone towers, cobbled roads, the Stone Keep.' },
  smithing: { name: 'Smithing', cost: { gold: 600, stone: 80, renown: 25 }, stage: 2, req: [], desc: 'Swordsmen, shield infantry and men-at-arms.' },
  polearms: { name: 'Polearms', cost: { gold: 500, wood: 150, renown: 20 }, stage: 2, req: [], desc: 'Pikemen.' },
  longbow: { name: 'Longbow', cost: { gold: 500, wood: 200, renown: 20 }, stage: 2, req: [], desc: 'Longbowmen.' },
  mechanics: { name: 'Mechanics', cost: { gold: 1200, wood: 300, renown: 40 }, stage: 3, req: ['longbow'], desc: 'Crossbowmen.' },
  horsemanship: { name: 'Horsemanship', cost: { gold: 1000, wood: 200, renown: 40 }, stage: 3, req: [], desc: 'Stables and light cavalry.' },
  commerce: { name: 'Commerce', cost: { gold: 1000, renown: 40 }, stage: 3, req: [], desc: 'Marketplaces (+gold from study).' },
  drill: { name: 'Drill', cost: { gold: 1500, renown: 60 }, stage: 3, req: [], desc: 'Training fields and Veteran promotions.' },
  heraldry: { name: 'Heraldry', cost: { gold: 2000, renown: 80 }, stage: 3, req: [], desc: 'New banner emblems and colours.' },
  chivalry: { name: 'Chivalry', cost: { gold: 4000, stone: 500, renown: 150 }, stage: 4, req: ['horsemanship'], desc: 'Knights, mounted knights, cavalry stables.' },
  steel: { name: 'Steel Forging', cost: { gold: 4000, stone: 800, renown: 150 }, stage: 4, req: ['smithing'], desc: 'Heavy infantry, halberdiers, Elite promotions.' },
  engineering: { name: 'Engineering', cost: { gold: 5000, wood: 1000, stone: 1000, renown: 200 }, stage: 4, req: ['masonry'], desc: 'Siege workshop, moats, great gatehouses.' },
  veterancy: { name: 'Veterancy', cost: { gold: 8000, renown: 300 }, stage: 5, req: ['drill'], desc: 'Veteran cavalry, +25% troop experience.' },
  royal_decree: { name: 'Royal Decree', cost: { gold: 20000, stone: 3000, renown: 800 }, stage: 5, req: ['chivalry', 'steel'], desc: 'Royal guard, royal archers, the Royal Palace and Royal Guard rank.' },
};
export const TECH_IDS = Object.keys(TECHS) as TechId[];

// ================= buildings =================
export type BKind = 'camp' | 'hut' | 'house' | 'farm' | 'well' | 'road' | 'market' | 'blacksmith' | 'storehouse' | 'stable'
  | 'barracks' | 'range' | 'trainfield' | 'armory' | 'cavstable' | 'watchtower' | 'guardhouse' | 'siege'
  | 'palisade' | 'wall' | 'gate' | 'gatehouse' | 'tower' | 'keep' | 'greathall' | 'courtyard' | 'moat' | 'palace' | 'tavern';
export type Cat = 'civil' | 'military' | 'castle';
export interface Effects { cap?: number; gold?: number; wood?: number; stone?: number; renown?: number; xp?: number; green?: number; discount?: number }
export interface Lvl { name: string; cost: Cost; stage?: number; tech?: TechId }
export interface BDef { name: string; cat: Cat; w: number; h: number; stage: number; tech?: TechId; unique?: boolean; paint?: boolean; desc: string; levels: Lvl[]; fx: (l: number) => Effects }

export const BUILDINGS: Record<BKind, BDef> = {
  camp: { name: 'Camp', cat: 'civil', w: 4, h: 3, stage: 1, unique: true, desc: 'Your humble beginning.', levels: [{ name: 'Camp', cost: {} }], fx: () => ({ cap: 10, green: 1.2 }) },
  hut: { name: 'Worker Hut', cat: 'civil', w: 2, h: 2, stage: 1, desc: 'Houses workers. +8 army capacity per level.', levels: [{ name: 'Worker Hut', cost: { gold: 40, wood: 30 } }, { name: 'Timber Hut', cost: { gold: 120, wood: 60, stone: 20 } }], fx: (l) => ({ cap: 8 * l, green: 1.5 + l }) },
  farm: { name: 'Farm', cat: 'civil', w: 3, h: 3, stage: 1, desc: 'Feeds the army (+25 capacity per level) and greens the land.', levels: [{ name: 'Field', cost: { gold: 150, wood: 60 } }, { name: 'Homestead', cost: { gold: 500, wood: 150, stone: 60 }, tech: 'agriculture' }, { name: 'Manor Farm', cost: { gold: 1500, wood: 300, stone: 250 }, stage: 3, tech: 'agriculture' }], fx: (l) => ({ cap: 25 * l, green: 4 + 2.5 * l }) },
  road: { name: 'Road', cat: 'civil', w: 1, h: 1, stage: 1, paint: true, desc: 'Paths connect your realm. Builds bridges over water.', levels: [{ name: 'Dirt Path', cost: { gold: 5 } }, { name: 'Cobbled Road', cost: { gold: 15, stone: 5 }, tech: 'masonry' }], fx: () => ({}) },
  house: { name: 'House', cat: 'civil', w: 2, h: 2, stage: 2, desc: 'Townsfolk. +15 army capacity per level.', levels: [{ name: 'Cottage', cost: { gold: 200, wood: 80, stone: 40 } }, { name: 'Townhouse', cost: { gold: 600, wood: 150, stone: 150 }, stage: 3 }, { name: 'Manor House', cost: { gold: 1500, wood: 300, stone: 400, renown: 20 }, stage: 4 }], fx: (l) => ({ cap: 15 * l, green: 2 + l }) },
  well: { name: 'Well', cat: 'civil', w: 1, h: 1, stage: 2, tech: 'agriculture', desc: 'Fresh water greens the surrounding land.', levels: [{ name: 'Well', cost: { gold: 60, wood: 10, stone: 30 } }, { name: 'Stone Well', cost: { gold: 200, stone: 80 } }], fx: (l) => ({ green: 3 + 2 * l }) },
  storehouse: { name: 'Storehouse', cat: 'civil', w: 2, h: 2, stage: 2, desc: '+10% wood and stone from study per level.', levels: [{ name: 'Storehouse', cost: { gold: 300, wood: 150 } }, { name: 'Granary', cost: { gold: 1200, wood: 300, stone: 300 }, stage: 3 }], fx: (l) => ({ wood: 0.1 * l, stone: 0.1 * l }) },
  blacksmith: { name: 'Blacksmith', cat: 'civil', w: 2, h: 2, stage: 2, desc: 'Forges arms. Required for armoured troops.', levels: [{ name: 'Forge', cost: { gold: 400, wood: 100, stone: 120 } }, { name: 'Smithy', cost: { gold: 1500, wood: 200, stone: 400, renown: 15 }, tech: 'smithing' }, { name: 'Master Smithy', cost: { gold: 4000, wood: 400, stone: 1000, renown: 50 }, tech: 'steel' }], fx: () => ({}) },
  market: { name: 'Marketplace', cat: 'civil', w: 3, h: 3, stage: 3, tech: 'commerce', desc: '+10% gold from study per level.', levels: [{ name: 'Market Stalls', cost: { gold: 800, wood: 250, stone: 100 } }, { name: 'Market Square', cost: { gold: 3000, wood: 500, stone: 600, renown: 40 }, stage: 4 }], fx: (l) => ({ gold: 0.1 * l, green: 2 }) },
  tavern: { name: 'Tavern', cat: 'civil', w: 3, h: 2, stage: 2, desc: 'Ale, song and gossip. +4% gold from study per level; townsfolk gather of an evening and soldiers on leave come to drink.', levels: [{ name: 'Alehouse', cost: { gold: 350, wood: 150 } }, { name: 'Tavern', cost: { gold: 1200, wood: 300, stone: 250 }, stage: 3 }, { name: 'Coaching Inn', cost: { gold: 3500, wood: 500, stone: 700, renown: 30 }, stage: 4 }], fx: (l) => ({ gold: 0.04 * l, green: 1 }) },
  stable: { name: 'Stable', cat: 'civil', w: 3, h: 2, stage: 3, tech: 'horsemanship', desc: 'Horses for light cavalry.', levels: [{ name: 'Stable', cost: { gold: 900, wood: 250, stone: 150 } }, { name: 'Horse Ranch', cost: { gold: 2500, wood: 400, stone: 400, renown: 20 } }], fx: (l) => ({ cap: 10 * l }) },
  barracks: { name: 'Barracks', cat: 'military', w: 3, h: 3, stage: 2, desc: 'Trains infantry. +30 army capacity per level.', levels: [{ name: 'Training Camp', cost: { gold: 300, wood: 120 } }, { name: 'Barracks', cost: { gold: 1200, wood: 300, stone: 300 }, stage: 3 }, { name: 'War College', cost: { gold: 4000, wood: 500, stone: 1200, renown: 60 }, stage: 4 }], fx: (l) => ({ cap: 30 * l }) },
  range: { name: 'Archery Range', cat: 'military', w: 3, h: 3, stage: 2, desc: 'Trains archers.', levels: [{ name: 'Archery Butts', cost: { gold: 400, wood: 150 } }, { name: 'Archery Range', cost: { gold: 1500, wood: 300, stone: 300 }, stage: 3 }, { name: 'Royal Range', cost: { gold: 5000, wood: 400, stone: 1000, renown: 60 }, stage: 5 }], fx: () => ({}) },
  watchtower: { name: 'Watchtower', cat: 'military', w: 2, h: 2, stage: 2, desc: 'Lookouts guard the land; sentries patrol.', levels: [{ name: 'Watchtower', cost: { gold: 150, wood: 120 } }, { name: 'Stone Watchtower', cost: { gold: 600, wood: 50, stone: 300 }, tech: 'masonry' }], fx: () => ({}) },
  trainfield: { name: 'Training Field', cat: 'military', w: 3, h: 3, stage: 3, tech: 'drill', desc: '+25% troop experience per level.', levels: [{ name: 'Training Field', cost: { gold: 600, wood: 200, stone: 50 } }, { name: 'Tiltyard', cost: { gold: 3000, wood: 400, stone: 500, renown: 30 }, stage: 4 }], fx: (l) => ({ xp: 0.25 * l }) },
  guardhouse: { name: 'Guardhouse', cat: 'military', w: 2, h: 2, stage: 3, desc: 'Garrison quarters. +10 capacity per level.', levels: [{ name: 'Guardhouse', cost: { gold: 500, wood: 150, stone: 200 } }, { name: 'Garrison', cost: { gold: 1800, wood: 200, stone: 700, renown: 20 }, stage: 4 }], fx: (l) => ({ cap: 10 * l }) },
  armory: { name: 'Armory', cat: 'military', w: 3, h: 2, stage: 4, desc: 'Heavy arms. Required for Elite promotions.', levels: [{ name: 'Armory', cost: { gold: 2000, wood: 300, stone: 800, renown: 20 } }, { name: 'Royal Armory', cost: { gold: 6000, wood: 500, stone: 2000, renown: 80 }, stage: 5 }], fx: () => ({}) },
  cavstable: { name: 'Cavalry Stables', cat: 'military', w: 4, h: 3, stage: 4, tech: 'chivalry', desc: 'Warhorses for knights.', levels: [{ name: 'Cavalry Stables', cost: { gold: 3000, wood: 500, stone: 800, renown: 30 } }, { name: 'Royal Stables', cost: { gold: 9000, wood: 800, stone: 2500, renown: 120 }, stage: 5 }], fx: (l) => ({ cap: 20 * l }) },
  siege: { name: 'Siege Workshop', cat: 'military', w: 3, h: 3, stage: 4, tech: 'engineering', desc: '-10% cost of castle works per level.', levels: [{ name: 'Siege Workshop', cost: { gold: 2500, wood: 800, stone: 600, renown: 20 } }, { name: "Engineers' Yard", cost: { gold: 7000, wood: 1200, stone: 2000, renown: 80 }, stage: 5 }], fx: (l) => ({ discount: 0.1 * l }) },
  palisade: { name: 'Palisade', cat: 'castle', w: 1, h: 1, stage: 2, paint: true, desc: 'Sharpened timber wall. Drag to build lines.', levels: [{ name: 'Palisade', cost: { gold: 20, wood: 15 } }], fx: () => ({}) },
  wall: { name: 'Stone Wall', cat: 'castle', w: 1, h: 1, stage: 3, tech: 'masonry', paint: true, desc: 'Curtain wall. Connects to towers and gates.', levels: [{ name: 'Stone Wall', cost: { gold: 60, stone: 40 } }, { name: 'High Wall', cost: { gold: 150, stone: 100 }, stage: 4 }], fx: () => ({}) },
  gate: { name: 'Castle Gate', cat: 'castle', w: 2, h: 1, stage: 3, desc: 'A gate set into your walls.', levels: [{ name: 'Wooden Gate', cost: { gold: 300, wood: 200 } }, { name: 'Iron Gate', cost: { gold: 1200, stone: 600, renown: 20 }, stage: 4 }], fx: () => ({}) },
  courtyard: { name: 'Courtyard', cat: 'castle', w: 1, h: 1, stage: 4, paint: true, desc: 'Paved courts and gardens.', levels: [{ name: 'Flagstones', cost: { gold: 30, stone: 20 } }, { name: 'Garden Court', cost: { gold: 80, wood: 10, stone: 40 } }], fx: () => ({}) },
  tower: { name: 'Castle Tower', cat: 'castle', w: 2, h: 2, stage: 4, tech: 'masonry', desc: 'Mighty towers anchor the walls.', levels: [{ name: 'Stone Tower', cost: { gold: 1500, wood: 100, stone: 900, renown: 10 } }, { name: 'Great Tower', cost: { gold: 5000, stone: 2500, renown: 60 } }, { name: 'Royal Tower', cost: { gold: 12000, stone: 5000, renown: 200 }, stage: 5 }], fx: () => ({}) },
  gatehouse: { name: 'Gatehouse', cat: 'castle', w: 3, h: 2, stage: 4, desc: 'Fortified entrance with portcullis.', levels: [{ name: 'Gatehouse', cost: { gold: 3000, wood: 300, stone: 1500, renown: 40 } }, { name: 'Great Gatehouse', cost: { gold: 9000, wood: 500, stone: 4000, renown: 150 }, tech: 'engineering' }], fx: () => ({}) },
  keep: { name: 'Keep', cat: 'castle', w: 4, h: 4, stage: 3, unique: true, desc: 'The heart of your castle. Each level transforms it.', levels: [
    { name: 'Wooden Keep', cost: { gold: 1500, wood: 800, stone: 50, renown: 20 } },
    { name: 'Stone Keep', cost: { gold: 5000, wood: 500, stone: 2500, renown: 80 }, tech: 'masonry' },
    { name: 'Great Keep', cost: { gold: 15000, wood: 1000, stone: 6000, renown: 250 }, stage: 4 },
    { name: 'Castle Keep', cost: { gold: 35000, wood: 2000, stone: 12000, renown: 600 }, stage: 4 },
    { name: 'Royal Keep', cost: { gold: 80000, wood: 3000, stone: 25000, renown: 1500 }, stage: 5 },
  ], fx: (l) => ({ cap: 20 * l, green: 3 + l, renown: 0.02 * l }) },
  greathall: { name: 'Great Hall', cat: 'castle', w: 4, h: 3, stage: 4, desc: '+10% renown from study per level.', levels: [{ name: 'Great Hall', cost: { gold: 12000, wood: 2000, stone: 5000, renown: 200 } }, { name: 'Royal Hall', cost: { gold: 30000, wood: 3000, stone: 12000, renown: 600 }, stage: 5 }], fx: (l) => ({ renown: 0.1 * l, green: 3 }) },
  moat: { name: 'Moat', cat: 'castle', w: 1, h: 1, stage: 5, tech: 'engineering', paint: true, desc: 'Water defences. Drag to dig.', levels: [{ name: 'Moat', cost: { gold: 150, stone: 60 } }], fx: () => ({}) },
  palace: { name: 'Royal Palace', cat: 'castle', w: 6, h: 5, stage: 5, tech: 'royal_decree', unique: true, desc: 'The crown of your citadel. Houses the Royal Guard.', levels: [{ name: 'Royal Palace', cost: { gold: 80000, wood: 5000, stone: 25000, renown: 1500 } }, { name: 'Imperial Palace', cost: { gold: 200000, wood: 10000, stone: 60000, renown: 5000 }, stage: 6 }], fx: (l) => ({ cap: 100 * l, renown: 0.1 * l, green: 6 }) },
};
export const BKINDS = Object.keys(BUILDINGS) as BKind[];
export const CONNECTS: BKind[] = ['palisade', 'wall', 'gate', 'tower', 'gatehouse', 'watchtower'];

// ================= kingdom stages =================
export interface Req { kind?: BKind; level?: number; count?: number; troops?: number; label: string }
export const STAGES: { name: string; desc: string; reqs: Req[] }[] = [
  { name: 'Barren Land', desc: 'Dry earth and a lonely camp.', reqs: [] },
  { name: 'Small Settlement', desc: 'Huts, fields and dirt paths.', reqs: [{ kind: 'hut', count: 2, label: '2 worker huts' }, { kind: 'farm', count: 1, label: '1 farm' }, { kind: 'road', count: 6, label: '6 road tiles' }] },
  { name: 'Fortified Village', desc: 'Barracks, watchtowers and palisades.', reqs: [{ kind: 'barracks', count: 1, label: 'Barracks' }, { kind: 'watchtower', count: 1, label: 'Watchtower' }, { kind: 'palisade', count: 12, label: '12 palisade sections' }, { kind: 'house', count: 2, label: '2 houses' }, { troops: 25, label: '25 soldiers' }] },
  { name: 'Medieval Fortress', desc: 'Stone walls, a keep, a gate.', reqs: [{ kind: 'keep', level: 2, label: 'Stone Keep' }, { kind: 'wall', count: 20, label: '20 stone wall sections' }, { kind: 'gate', count: 1, label: 'Castle gate' }, { kind: 'blacksmith', level: 2, label: 'Smithy' }, { troops: 100, label: '100 soldiers' }] },
  { name: 'Great Castle', desc: 'Towers, courtyards and a great hall.', reqs: [{ kind: 'keep', level: 4, label: 'Castle Keep' }, { kind: 'tower', count: 4, label: '4 castle towers' }, { kind: 'gatehouse', count: 1, label: 'Gatehouse' }, { kind: 'greathall', count: 1, label: 'Great Hall' }, { kind: 'courtyard', count: 10, label: '10 courtyard tiles' }, { kind: 'armory', count: 1, label: 'Armory' }, { troops: 300, label: '300 soldiers' }] },
  { name: 'Royal Citadel', desc: 'A legendary seat of power.', reqs: [{ kind: 'palace', count: 1, label: 'Royal Palace' }, { kind: 'keep', level: 5, label: 'Royal Keep' }, { kind: 'moat', count: 20, label: '20 moat tiles' }, { kind: 'tower', level: 3, label: 'A Royal Tower' }, { troops: 1000, label: '1,000 soldiers' }] },
];

// ================= troops =================
export type TClass = 'peasant' | 'militia' | 'squire' | 'spearman' | 'archer'
  | 'swordsman' | 'shieldman' | 'longbow' | 'crossbow' | 'pikeman' | 'manatarms' | 'lightcav'
  | 'knight' | 'heavyinf' | 'mknight' | 'royalarcher' | 'halberdier' | 'royalguard' | 'vetcav';
export interface TDef { name: string; era: 'Early' | 'Mid' | 'Late'; cost: Cost; req: Partial<Record<BKind, number>>; tech?: TechId[]; power: number; mounted?: boolean; desc: string }
export const TROOPS: Record<TClass, TDef> = {
  peasant: { name: 'Peasant Recruit', era: 'Early', cost: { gold: 10 }, req: {}, power: 1, desc: 'Pitchforks and courage.' },
  militia: { name: 'Militia', era: 'Early', cost: { gold: 20, wood: 5 }, req: { barracks: 1 }, power: 2, desc: 'Townsmen with club and shield.' },
  spearman: { name: 'Spearman', era: 'Early', cost: { gold: 30, wood: 10 }, req: { barracks: 1 }, power: 3, desc: 'The backbone of any host.' },
  squire: { name: 'Squire', era: 'Early', cost: { gold: 40, wood: 5, stone: 3 }, req: { barracks: 1 }, power: 3, desc: 'Young knights-in-training.' },
  archer: { name: 'Archer', era: 'Early', cost: { gold: 35, wood: 15 }, req: { range: 1 }, power: 3, desc: 'Hunting bows, keen eyes.' },
  swordsman: { name: 'Swordsman', era: 'Mid', cost: { gold: 70, wood: 10, stone: 15 }, req: { barracks: 2, blacksmith: 1 }, tech: ['smithing'], power: 6, desc: 'Mail, sword and heater shield.' },
  shieldman: { name: 'Shield Infantry', era: 'Mid', cost: { gold: 80, wood: 20, stone: 15 }, req: { barracks: 2, blacksmith: 1 }, tech: ['smithing'], power: 6, desc: 'Tower shields form a wall.' },
  pikeman: { name: 'Pikeman', era: 'Mid', cost: { gold: 60, wood: 25, stone: 5 }, req: { barracks: 2 }, tech: ['polearms'], power: 5, desc: 'Long pikes against horse.' },
  longbow: { name: 'Longbowman', era: 'Mid', cost: { gold: 70, wood: 25, renown: 2 }, req: { range: 2 }, tech: ['longbow'], power: 6, desc: 'Yew longbows with great reach.' },
  crossbow: { name: 'Crossbowman', era: 'Mid', cost: { gold: 90, wood: 20, stone: 20 }, req: { range: 2 }, tech: ['mechanics'], power: 7, desc: 'Steel bolts pierce armour.' },
  manatarms: { name: 'Man-at-Arms', era: 'Mid', cost: { gold: 110, wood: 10, stone: 30, renown: 2 }, req: { barracks: 2, blacksmith: 2 }, tech: ['smithing'], power: 9, desc: 'Professional soldiers in plate.' },
  lightcav: { name: 'Light Cavalry', era: 'Mid', cost: { gold: 180, wood: 40, stone: 30, renown: 4 }, req: { stable: 1 }, tech: ['horsemanship'], power: 12, mounted: true, desc: 'Swift riders with spears.' },
  knight: { name: 'Knight', era: 'Late', cost: { gold: 300, stone: 60, renown: 10 }, req: { barracks: 3 }, tech: ['chivalry'], power: 20, desc: 'Sworn knights in full plate.' },
  heavyinf: { name: 'Heavy Infantry', era: 'Late', cost: { gold: 220, stone: 70, renown: 6 }, req: { armory: 1 }, tech: ['steel'], power: 16, desc: 'Plate, mace and tower shield.' },
  halberdier: { name: 'Elite Halberdier', era: 'Late', cost: { gold: 200, wood: 30, stone: 60, renown: 8 }, req: { armory: 1 }, tech: ['steel', 'polearms'], power: 17, desc: 'Halberds and polished plate.' },
  mknight: { name: 'Mounted Knight', era: 'Late', cost: { gold: 450, wood: 60, stone: 100, renown: 20 }, req: { cavstable: 1 }, tech: ['chivalry'], power: 35, mounted: true, desc: 'Barded warhorse and lance.' },
  royalarcher: { name: 'Royal Archer', era: 'Late', cost: { gold: 250, wood: 50, stone: 50, renown: 12 }, req: { range: 3 }, tech: ['royal_decree'], power: 22, desc: 'The crown\'s finest bowmen.' },
  vetcav: { name: 'Veteran Cavalry', era: 'Late', cost: { gold: 400, wood: 60, stone: 90, renown: 18 }, req: { cavstable: 2 }, tech: ['veterancy'], power: 32, mounted: true, desc: 'Battle-hardened black riders.' },
  royalguard: { name: 'Royal Guard', era: 'Late', cost: { gold: 600, stone: 150, renown: 35 }, req: { palace: 1 }, tech: ['royal_decree'], power: 45, desc: 'Gilded protectors of the crown.' },
};
export const TCLASSES = Object.keys(TROOPS) as TClass[];

// ================= ranks =================
/** Soldier ranks: xp threshold, promotion renown cost per soldier, requirement. */
export const RANKS: { name: string; xp: number; renown: number; req?: { kind?: BKind; tech?: TechId; label: string } }[] = [
  { name: 'Recruit', xp: 0, renown: 0 },
  { name: 'Trained Soldier', xp: 60, renown: 0.5, req: { kind: 'barracks', label: 'Barracks' } },
  { name: 'Veteran', xp: 300, renown: 1, req: { tech: 'drill', label: 'Drill' } },
  { name: 'Elite', xp: 1200, renown: 2, req: { kind: 'armory', label: 'Armory' } },
  { name: 'Royal Guard', xp: 3600, renown: 4, req: { tech: 'royal_decree', label: 'Royal Decree' } },
];
/** Officer ranks for commanders: min battalion size, renown to promote, xp bonus. */
export const OFFICERS: { name: string; size: number; renown: number; bonus: number }[] = [
  { name: 'Sergeant', size: 0, renown: 0, bonus: 0.05 },
  { name: 'Lieutenant', size: 24, renown: 20, bonus: 0.1 },
  { name: 'Captain', size: 60, renown: 60, bonus: 0.15 },
  { name: 'Commander', size: 150, renown: 150, bonus: 0.2 },
  { name: 'General', size: 400, renown: 400, bonus: 0.3 },
];
export const SQUAD_SIZE = 12;
export const SQUADS_PER_COMPANY = 4;
export const FORMATIONS = { line: 8, block: 4, column: 2 } as const;
export type Formation = keyof typeof FORMATIONS;
export const XP_PER_MIN = 1;
export const DRILL_XP = 25; // xp per drill; costs gold = soldiers * 2

export const COLORS = [0xb3242a, 0x1f4e9c, 0x2a7a3b, 0xc9a227, 0x222222, 0xe0e0e0];
export const HERALD_COLORS = [0x6a2a8c, 0xc05a1a, 0x2a8a8a, 0x7a1d1a];
export const EMBLEMS = ['lion', 'cross', 'tower', 'sword'];
export const HERALD_EMBLEMS = ['star', 'eagle', 'stag'];
export const PRESTIGE_EMBLEMS: Record<string, string> = { crown: 'castle', dragon: 'army1000', griffin: 'scholar500' }; // emblem -> achievement
