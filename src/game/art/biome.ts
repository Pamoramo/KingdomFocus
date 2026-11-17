// Ground tiles and plants for each biome, plus rubble for broken walls.
import { P, r, px, canvas, outline, rng, shade, stoneBlock, crenel, gable, cone, door, awning } from './px.ts';
import type { Biome } from '../../lib/realms.ts';

export const GROUND: Record<Biome, { base: string; dots: string[]; alt: string }> = {
  grassland: { base: P.grass, dots: [P.grassD, P.grassL], alt: P.grassL },
  desert: { base: '#e2c88e', dots: ['#c9ac6e', '#f2dcaa', '#d8b878'], alt: '#d4b47a' },
  tundra: { base: '#e8eef4', dots: ['#d0dae6', '#ffffff', '#c4d2e2'], alt: '#b8d4ec' },
  forest: { base: '#3f7a2c', dots: ['#2f6220', '#4e8a36', '#6a5a2e'], alt: '#356c26' },
  swamp: { base: '#5c6a3a', dots: ['#4a5630', '#6e7c46', '#4a4a2a'], alt: '#3a5a4a' },
  highlands: { base: '#7c8a5a', dots: ['#6a7650', '#8a8680', '#929a6a'], alt: '#8a8680' },
};
/** A 16x16 ground tile; variant 3 carries the biome's feature (dune ripple, ice, puddle, scree...). */
export function biomeTile(b: Biome, v: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 16), g = GROUND[b], R = rng(v * 131 + b.length * 7);
  r(c, 0, 0, 16, 16, g.base);
  for (let i = 0; i < 46; i++) px(c, Math.floor(R() * 16), Math.floor(R() * 16), g.dots[Math.floor(R() * g.dots.length)]);
  if (v === 3) {
    if (b === 'desert') for (let x = 0; x < 16; x++) { px(c, x, 6 + Math.round(Math.sin(x / 2.5) * 1.5), '#c9ac6e'); px(c, x, 12 + Math.round(Math.sin(x / 2.5 + 1) * 1.5), '#f2dcaa'); }
    if (b === 'tundra') { r(c, 3, 4, 8, 5, g.alt); r(c, 4, 4, 5, 1, '#e4f0fa'); }
    if (b === 'swamp') { r(c, 4, 5, 8, 5, g.alt); r(c, 5, 6, 3, 1, '#5a8070'); }
    if (b === 'highlands') for (let i = 0; i < 6; i++) { const x = Math.floor(R() * 14), y = Math.floor(R() * 14); r(c, x, y, 2, 2, g.alt); px(c, x, y, '#a8a49e'); }
    if (b === 'forest') for (let i = 0; i < 10; i++) px(c, Math.floor(R() * 16), Math.floor(R() * 16), '#8a5a2e');
    if (b === 'grassland') for (let i = 0; i < 4; i++) px(c, Math.floor(R() * 16), Math.floor(R() * 16), ['#f0e060', '#e8e8f0', '#d05a8a'][i % 3]);
  }
  return cv;
}
type Plant = 'cactus' | 'palm' | 'snowpine' | 'icerock' | 'tree' | 'pine' | 'bush' | 'deadtree' | 'reeds' | 'boulder' | 'rock' | 'flowers';
export const BIOME_PLANTS: Record<Biome, Plant[]> = {
  grassland: ['tree', 'bush', 'flowers', 'rock'], desert: ['cactus', 'palm', 'rock', 'cactus'], tundra: ['snowpine', 'icerock', 'snowpine', 'rock'],
  forest: ['tree', 'pine', 'tree', 'bush'], swamp: ['deadtree', 'reeds', 'bush', 'reeds'], highlands: ['boulder', 'pine', 'rock', 'boulder'],
};
export const BIOME_DENSITY: Record<Biome, number> = { grassland: 0.05, desert: 0.03, tundra: 0.05, forest: 0.16, swamp: 0.09, highlands: 0.07 };
/** A 16x24 plant or rock sprite for a biome. */
export function plant(k: Plant, seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 24), R = rng(seed + 17);
  const blob = (x: number, y: number, rad: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); };
  switch (k) {
    case 'cactus': r(c, 7, 8, 3, 14, '#3e8a3a'); r(c, 7, 8, 1, 14, '#5aa850'); r(c, 3, 12, 2, 5, '#3e8a3a'); r(c, 3, 16, 4, 2, '#3e8a3a'); r(c, 12, 10, 2, 4, '#3e8a3a'); r(c, 10, 13, 4, 2, '#3e8a3a'); px(c, 8, 7, '#f0d060'); break;
    case 'palm': for (let j = 0; j < 14; j++) r(c, 7 + Math.round(Math.sin(j / 5)), 8 + j, 2, 1, j % 3 ? '#9a6a3a' : '#7a4e28'); for (const [dx, dy] of [[-6, 2], [6, 2], [-4, -2], [4, -2], [0, -3]]) for (let t = 0; t < 6; t++) r(c, 8 + (dx * t) / 6, 8 + (dy * t) / 6 + t * t * 0.08, 2, 1, t % 2 ? '#3e8a3a' : '#5aa850'); break;
    case 'snowpine': r(c, 7, 18, 2, 4, P.woodD); for (let j = 0; j < 15; j++) { const hw = Math.floor(j / 2.5) + 1; r(c, 8 - hw, 4 + j, hw, 1, j % 4 === 0 ? '#ffffff' : '#2e6a3a'); r(c, 8, 4 + j, hw, 1, j % 4 === 0 ? '#e0eaf2' : '#1e4a2a'); } break;
    case 'icerock': r(c, 3, 15, 10, 6, '#b8d4ec'); r(c, 5, 12, 6, 4, '#d8eaf8'); px(c, 6, 13, '#ffffff'); r(c, 3, 20, 10, 1, '#8aaac8'); break;
    case 'tree': r(c, 7, 15, 2, 7, P.woodD); blob(8, 10, 6.5, P.leafD); blob(7, 9, 5.5, P.leaf); blob(6, 7, 2.5, P.leafL); break;
    case 'pine': r(c, 7, 18, 2, 4, P.woodD); for (let j = 0; j < 15; j++) { const hw = Math.floor(j / 2.5) + 1; r(c, 8 - hw, 4 + j, hw, 1, P.leaf); r(c, 8, 4 + j, hw, 1, P.leafD); } break;
    case 'bush': blob(8, 18, 5, P.leafD); blob(7, 17, 4, P.leaf); px(c, 9, 16, P.red); break;
    case 'deadtree': r(c, 7, 8, 2, 14, '#5a4a3a'); for (const [x, y, d] of [[8, 12, 1], [8, 9, -1], [8, 15, -1]]) for (let t = 0; t < 4; t++) px(c, x + d * t, y - t, '#5a4a3a'); r(c, 6, 9, 1, 3, '#6a7a4a'); break;
    case 'reeds': for (let i = 0; i < 6; i++) { const x = 3 + i * 2; r(c, x, 14 + (i % 3), 1, 8 - (i % 3), '#5a7a3a'); px(c, x, 13 + (i % 3), '#7a5a32'); } break;
    case 'boulder': r(c, 2, 13, 12, 8, P.stone); r(c, 3, 11, 8, 3, P.stoneL); r(c, 2, 19, 12, 2, P.stoneD); r(c, 12, 16, 3, 4, P.stone); break;
    case 'rock': r(c, 4, 17, 8, 4, P.stone); r(c, 5, 16, 5, 2, P.stoneL); r(c, 4, 20, 8, 1, P.stoneD); break;
    case 'flowers': for (let i = 0; i < 6; i++) { const x = 3 + Math.floor(R() * 10), y = 14 + Math.floor(R() * 7); px(c, x, y + 1, P.grassD); px(c, x, y, ['#f0e060', '#e8e8f0', '#d05a8a'][i % 3]); } break;
  }
  if (k !== 'flowers' && k !== 'reeds') { c.globalCompositeOperation = 'destination-over'; c.fillStyle = 'rgba(30,20,10,.25)'; c.fillRect(4, 21, 9, 2); c.globalCompositeOperation = 'source-over'; outline(cv); }
  return cv;
}
/** A pile of broken masonry where a wall has been breached. */
export function rubble(seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 30), R = rng(seed);
  for (let i = 0; i < 9; i++) { const x = 1 + Math.floor(R() * 11), y = 18 + Math.floor(R() * 9), w = 3 + Math.floor(R() * 3); r(c, x, y, w, 3, R() < 0.5 ? P.stone : P.stoneL); r(c, x, y + 2, w, 1, P.stoneD); }
  for (let i = 0; i < 6; i++) px(c, Math.floor(R() * 16), 26 + Math.floor(R() * 4), shade(P.stoneD, -10));
  outline(cv); return cv;
}
/** A merchant wagon for the world map. */
export function wagon(f: number): HTMLCanvasElement {
  const [cv, c] = canvas(24, 16);
  r(c, 1, 5, 13, 6, P.wood); r(c, 1, 5, 13, 1, P.woodL); r(c, 2, 1, 11, 5, '#e8e0c8'); r(c, 2, 1, 11, 1, '#ffffff'); r(c, 4, 6, 3, 2, P.goldD);
  for (const x of [3, 11]) { c.fillStyle = P.woodD; c.beginPath(); c.arc(x, 12, 2.5, 0, 7); c.fill(); px(c, x, 12, P.wood); }
  r(c, 14, 8, 2, 1, P.woodD); r(c, 16, 5, 6, 4, '#6b4423'); r(c, 20, 3, 3, 3, '#6b4423'); px(c, 22, 4, P.out);
  for (const [x, d] of [[16, 0], [18, 1], [20, 0]]) r(c, x + ((f + d) % 2), 9, 1, 3, '#4a2e16');
  outline(cv); return cv;
}

/** Siege works: a pavise (wooden mantlet), a campfire, a timber-propped mine entrance and a breach barricade. */
export function pavise(): HTMLCanvasElement {
  const [cv, c] = canvas(14, 14);
  for (let i = 0; i < 12; i += 3) { r(c, 1 + i, 2, 2, 10, P.wood); r(c, 1 + i, 2, 1, 10, P.woodL); }
  r(c, 1, 4, 12, 1, P.woodD); r(c, 1, 9, 12, 1, P.woodD); r(c, 3, 12, 1, 2, P.woodD); r(c, 10, 12, 1, 2, P.woodD); r(c, 6, 5, 2, 3, '#b02a28');
  outline(cv); return cv;
}
export function campfire(f: number): HTMLCanvasElement {
  const [cv, c] = canvas(12, 12);
  for (let i = 0; i < 8; i++) px(c, 2 + i, 10, i % 2 ? P.stoneD : P.stone);
  r(c, 3, 9, 6, 1, P.woodD); r(c, 4, 8, 4, 1, P.wood);
  (f ? [3, 5, 4] : [4, 3, 5]).forEach((h, i) => { r(c, 4 + i, 8 - h, 1, h, P.fire); px(c, 4 + i, 8 - Math.max(1, h - 2), P.fireL); });
  r(c, 9, 4, 1, 5, P.woodD); r(c, 2, 4, 1, 5, P.woodD); r(c, 2, 4, 8, 1, P.woodD); r(c, 5, 5, 2, 2, '#5a5a62');
  return cv;
}
export function mineEntrance(): HTMLCanvasElement {
  const [cv, c] = canvas(22, 16);
  r(c, 0, 9, 22, 7, '#7a5a34'); for (let i = 0; i < 12; i++) px(c, (i * 7) % 22, 10 + (i % 5), '#5e4426');
  r(c, 6, 5, 10, 9, '#1a120c'); r(c, 5, 4, 2, 10, P.woodD); r(c, 15, 4, 2, 10, P.woodD); r(c, 5, 3, 12, 2, P.wood);
  r(c, 0, 7, 5, 4, '#8a6a40'); r(c, 18, 6, 4, 5, '#8a6a40');
  outline(cv); return cv;
}
export function barricade(): HTMLCanvasElement {
  const [cv, c] = canvas(16, 30);
  r(c, 1, 20, 5, 5, P.wood); r(c, 1, 20, 5, 1, P.woodL); r(c, 7, 19, 4, 6, P.wood); r(c, 7, 20, 4, 1, P.stoneD); r(c, 7, 23, 4, 1, P.stoneD);
  r(c, 11, 21, 4, 4, P.woodD); for (let i = 0; i < 4; i++) { r(c, 2 + i * 4, 16 + (i % 2), 1, 5, P.woodL); px(c, 2 + i * 4, 15 + (i % 2), P.stoneL); }
  r(c, 0, 25, 16, 2, P.stone); outline(cv); return cv;
}

/** A stone parish church, 3 tiles wide: a nave under a steep slate roof, lancet windows, an arched door,
 *  and a bell tower with a spire and cross at the west end. Drawn standing on its 3x4 footprint. */
export function church(): HTMLCanvasElement {
  const [cv, c] = canvas(48, 88), base = 87, nave = { x: 14, w: 33, top: 46 };
  stoneBlock(c, nave.x, nave.top, nave.w, base - nave.top, P.stoneL, 5);
  gable(c, nave.x - 1, nave.top - 16, nave.w + 2, 17, P.slate);
  for (const wx of [20, 28, 36]) { r(c, wx, nave.top + 8, 3, 9, P.stoneDD); px(c, wx + 1, nave.top + 7, P.stoneDD); r(c, wx + 1, nave.top + 9, 1, 7, '#7ea2c8'); }
  r(c, 41, nave.top + 6, 1, 3, P.stoneD); // buttress shadow
  // the tower, with a bell opening, a spire and a cross
  stoneBlock(c, 1, 28, 15, base - 28, P.stone, 9); crenel(c, 0, 25, 17);
  r(c, 6, 33, 5, 7, P.stoneDD); r(c, 7, 34, 3, 4, '#c8a030'); // the bell
  cone(c, 8, 4, 15, 22, P.slate);
  r(c, 8, 0, 1, 6, P.gold); r(c, 6, 2, 5, 1, P.gold);
  // the west door
  r(c, 4, base - 13, 9, 13, P.stoneDD); r(c, 5, base - 14, 7, 1, P.stoneDD); door(c, 5, base - 12, 7, 12, P.woodD);
  r(c, 7, nave.top - 2, 3, 3, '#a8c4e0'); px(c, 8, nave.top - 1, P.stoneD); // rose window
  outline(cv); return cv;
}
/** A market stall: posts, a striped awning and a counter of wares. */
export function stall(kind: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 24), cols = [['#c0392b', '#f4e8d0'], ['#2a5aa8', '#f4e8d0'], ['#2a8a5a', '#f0e0a0'], ['#c88a2a', '#fff4d6']][kind % 4];
  r(c, 1, 8, 1, 15, P.woodD); r(c, 14, 8, 1, 15, P.woodD);
  awning(c, 0, 6, 16, cols[0], cols[1]);
  r(c, 1, 16, 14, 3, P.wood); r(c, 1, 16, 14, 1, P.woodL); r(c, 2, 19, 12, 4, P.woodD);
  const wares = [['#c03a2a', '#e04a3a'], ['#d8b060', '#b88a40'], ['#7a4ab0', '#4a8ac8'], ['#5a9a3a', '#e0c040']][kind % 4];
  for (let i = 0; i < 5; i++) { px(c, 3 + i * 2, 15, wares[i % 2]); px(c, 3 + i * 2 + 1, 14, wares[(i + 1) % 2]); }
  outline(cv); return cv;
}
/** A post-and-tower windmill without its sails (drawn separately so they can turn): a tapering stone tower and a thatched cap. */
export function windmill(): HTMLCanvasElement {
  const [cv, c] = canvas(32, 56), base = 55;
  for (let y = 22; y <= base; y++) { const half = Math.round(8 + ((y - 22) / (base - 22)) * 5); r(c, 16 - half, y, half * 2, 1, (y % 6) < 1 ? P.plasterD : P.plaster); r(c, 16 + half - 3, y, 3, 1, P.plasterD); }
  cone(c, 16, 10, 20, 14, P.thatch, P.thatchD, P.woodD);
  door(c, 13, base - 9, 6, 9, P.woodD); r(c, 14, 32, 3, 4, P.glass); r(c, 17, 42, 2, 3, P.glass);
  r(c, 15, 21, 3, 3, P.woodD); // the axle hub
  outline(cv); return cv;
}
/** The four sails of a windmill, a lattice of wood and cloth, centred so they can be rotated. */
export function windmillSails(): HTMLCanvasElement {
  const [cv, c] = canvas(44, 44), m = 22;
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    for (let i = 3; i < 21; i++) { px(c, m + dx * i, m + dy * i, P.woodD); }
    for (let i = 6; i < 21; i++) for (let k = 1; k <= 3; k++) { const x = m + dx * i + (dy ? k : 0) * (dy || 1), y = m + dy * i + (dx ? -k : 0) * (dx || 1); px(c, x, y, (i + k) % 3 ? P.cloth : P.wood); }
  }
  r(c, m - 1, m - 1, 3, 3, P.woodD);
  outline(cv); return cv;
}
