import { P, r, px, canvas, outline, shade, rng } from './px.ts';

// ---------------- terrain ----------------
export type TileKind = 'dirt' | 'cracked' | 'mix' | 'grass' | 'lush';
export function terrainTile(kind: TileKind, seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 16), R = rng(seed * 7919 + 13);
  const green = kind === 'grass' || kind === 'lush';
  r(c, 0, 0, 16, 16, kind === 'lush' ? shade(P.grass, 8) : green ? P.grass : P.dirt);
  for (let i = 0; i < 44; i++) {
    const x = Math.floor(R() * 16), y = Math.floor(R() * 16);
    if (green) { px(c, x, y, R() < .5 ? P.grassD : P.grassL); if (R() < .35) px(c, x, y - 1, P.grassL); }
    else px(c, x, y, R() < .55 ? P.dirtD : P.dirtL);
  }
  if (kind === 'cracked') for (let k = 0; k < 2; k++) { let x = Math.floor(R() * 12) + 2, y = Math.floor(R() * 12) + 2; for (let s = 0; s < 8; s++) { px(c, x, y, P.crack); if (R() < .3) px(c, x + 1, y, P.crack); x += R() < .5 ? 1 : -1; y += R() < .6 ? 1 : 0; } }
  if (kind === 'mix') for (let i = 0; i < 70; i++) { const x = Math.floor(R() * 16), y = Math.floor(R() * 16); r(c, x, y, 2, 1, R() < .6 ? P.grass : P.grassD); }
  if (kind === 'lush') for (let i = 0; i < 3; i++) { const x = Math.floor(R() * 14), y = Math.floor(R() * 14); px(c, x, y, ['#f0e060', '#e8e8f0', '#d05a8a', '#8ab0f0'][Math.floor(R() * 4)]); }
  return cv;
}
export type Deco = 'rock' | 'boulder' | 'deadbush' | 'tree' | 'flowers' | 'deadtree' | 'pine' | 'bush' | 'stump' | 'reeds';
export function decoration(kind: Deco, seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 24), R = rng(seed + 99);
  if (kind === 'rock') { r(c, 4, 17, 8, 4, P.stone); r(c, 5, 16, 5, 2, P.stoneL); r(c, 4, 20, 8, 1, P.stoneD); px(c, 7, 18, P.stoneD); }
  if (kind === 'boulder') { r(c, 2, 13, 12, 8, P.stone); r(c, 3, 11, 8, 3, P.stoneL); r(c, 2, 19, 12, 2, P.stoneD); px(c, 6, 15, P.stoneD); px(c, 10, 14, P.stoneL); r(c, 12, 17, 3, 3, P.stone); }
  if (kind === 'deadbush') for (let i = 0; i < 9; i++) { const a = -Math.PI * (0.15 + R() * 0.7); for (let t = 0; t < 5; t++) px(c, Math.round(8 + Math.cos(a) * t), Math.round(21 + Math.sin(a) * t), '#7b5a36'); }
  if (kind === 'deadtree') { r(c, 7, 8, 2, 14, '#6b4a2c'); for (const [x, y, d] of [[8, 12, 1], [8, 9, -1], [8, 15, -1], [8, 6, 1]]) for (let t = 0; t < 4; t++) px(c, x + d * t, y - t, '#6b4a2c'); }
  if (kind === 'stump') { r(c, 5, 17, 6, 4, P.woodD); r(c, 5, 16, 6, 1, P.woodL); px(c, 7, 16, P.wood); }
  if (kind === 'flowers') for (let i = 0; i < 6; i++) { const x = 3 + Math.floor(R() * 10), y = 14 + Math.floor(R() * 7); px(c, x, y + 1, P.grassD); px(c, x, y, ['#f0e060', '#e8e8f0', '#d05a8a'][i % 3]); }
  if (kind === 'bush') { c.fillStyle = P.leafD; c.beginPath(); c.arc(8, 18, 5, 0, 7); c.fill(); c.fillStyle = P.leaf; c.beginPath(); c.arc(7, 17, 4, 0, 7); c.fill(); px(c, 5, 15, P.leafL); px(c, 9, 16, P.red); }
  if (kind === 'reeds') for (let i = 0; i < 6; i++) { const x = 3 + i * 2; r(c, x, 14 + (i % 3), 1, 8 - (i % 3), P.leaf); px(c, x, 13 + (i % 3), '#7a5a32'); }
  if (kind === 'tree') {
    r(c, 7, 15, 2, 7, P.woodD); c.fillStyle = P.leafD; c.beginPath(); c.arc(8, 10, 6.5, 0, 7); c.fill();
    c.fillStyle = P.leaf; c.beginPath(); c.arc(7, 9, 5.5, 0, 7); c.fill(); c.fillStyle = P.leafL; c.beginPath(); c.arc(6, 7, 2.5, 0, 7); c.fill();
    for (let i = 0; i < 8; i++) px(c, 3 + Math.floor(R() * 10), 4 + Math.floor(R() * 10), R() < .5 ? P.leafD : P.leafL);
  }
  if (kind === 'pine') { r(c, 7, 18, 2, 4, P.woodD); for (let j = 0; j < 15; j++) { const hw = Math.floor(j / 2.5) + 1; r(c, 8 - hw, 4 + j, hw, 1, P.leaf); r(c, 8, 4 + j, hw, 1, P.leafD); } }
  if (kind !== 'flowers' && kind !== 'reeds') { c.globalCompositeOperation = 'destination-over'; c.fillStyle = 'rgba(30,20,10,.25)'; c.fillRect(4, 21, 9, 2); c.globalCompositeOperation = 'source-over'; outline(cv); }
  return cv;
}
/** River/water tile, animated by frame; mask bits mark land neighbours (1=N 2=E 4=S 8=W) for shorelines. */
export function waterTile(land: number, f: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 16), R = rng(land * 13 + 7);
  r(c, 0, 0, 16, 16, P.water);
  for (let i = 0; i < 7; i++) { const x = Math.floor(R() * 13), y = Math.floor(R() * 15); const o = (f + i) % 3; r(c, (x + o) % 14, y, 3, 1, o === 0 ? P.waterL : P.waterD); }
  const shore = (x: number, y: number, w: number, h: number) => { r(c, x, y, w, h, P.sand); };
  if (land & 1) { shore(0, 0, 16, 2); r(c, 0, 2, 16, 1, P.waterL); }
  if (land & 4) { shore(0, 14, 16, 2); r(c, 0, 13, 16, 1, P.waterL); }
  if (land & 8) { shore(0, 0, 2, 16); r(c, 2, 0, 1, 16, (f % 2) ? P.waterL : P.water); }
  if (land & 2) { shore(14, 0, 2, 16); r(c, 13, 0, 1, 16, (f % 2) ? P.waterL : P.water); }
  return cv;
}
export function glow(): HTMLCanvasElement {
  const [cv, c] = canvas(64, 64), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,210,120,0.95)'); g.addColorStop(0.35, 'rgba(255,170,70,0.45)'); g.addColorStop(1, 'rgba(255,140,40,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64); return cv;
}

// ---------------- banners ----------------
export function banner(color: string, emblem: string, f: number): HTMLCanvasElement {
  const [cv, c] = canvas(18, 30);
  r(c, 3, 2, 1, 28, P.woodD); r(c, 2, 1, 3, 1, P.gold); px(c, 3, 0, P.gold);
  for (let i = 0; i < 12; i++) { const o = Math.round(Math.sin(i * 0.7 + f * 1.6) * 0.9), len = i > 9 ? 12 - (i - 9) * 3 : 12; r(c, 4 + i, 3 + o, 1, len, color); px(c, 4 + i, 3 + o, shade(color, 40)); px(c, 4 + i, 2 + len + o, shade(color, -50)); }
  const em = color === '#ecc94b' || color === '#c9a227' ? '#7a1d1a' : P.gold;
  const e = (x: number, y: number, w = 1, h = 1) => r(c, 5 + x, 4 + y, w, h, em);
  switch (emblem) {
    case 'cross': e(4, 1, 2, 8); e(1, 3, 8, 2); break;
    case 'tower': e(2, 3, 6, 6); e(2, 2); e(4, 2, 2, 1); e(7, 2); r(c, 8, 9, 2, 3, color); break;
    case 'star': e(4, 1, 2, 8); e(1, 4, 8, 2); e(2, 2); e(7, 2); e(2, 7); e(7, 7); break;
    case 'sword': e(4, 0, 2, 7); e(1, 6, 8, 1); e(4, 7, 2, 2); break;
    case 'eagle': e(4, 1, 2, 7); e(0, 2, 4, 2); e(6, 2, 4, 2); e(1, 4, 2, 1); e(7, 4, 2, 1); e(3, 8, 4, 1); break;
    case 'stag': e(4, 4, 2, 5); e(3, 3, 4, 2); e(2, 0, 1, 3); e(7, 0, 1, 3); e(1, 1); e(8, 1); break;
    case 'crown': e(1, 4, 8, 4); e(1, 2, 1, 2); e(4, 1, 2, 3); e(8, 2, 1, 2); r(c, 7, 9, 2, 2, color); break;
    case 'dragon': e(2, 2, 5, 3); e(6, 1, 3, 2); e(1, 5, 6, 2); e(0, 7, 2, 2); e(7, 5, 2, 1); e(3, 0, 1, 2); break;
    case 'griffin': e(3, 2, 4, 5); e(6, 0, 2, 3); e(8, 1); e(0, 3, 3, 2); e(3, 7, 1, 2); e(6, 7, 1, 2); break;
    default: e(3, 3, 4, 4); e(2, 2, 2, 2); e(6, 7, 2, 2); e(7, 3); e(2, 6, 1, 3); // lion
  }
  outline(cv); return cv;
}

// ---------------- commander portraits & insignia ----------------
const SKINS = ['#e9c09a', '#d8a47a', '#b9845e', '#8e5e3e', '#f0d0b0'], HAIRS = ['#2a1a10', '#5a3a1e', '#8a5a2e', '#c8a060', '#a8a8a8', '#7a2a1a'];
export function portrait(seed: number, rank: number, color: string): HTMLCanvasElement {
  const [cv, c] = canvas(24, 24), R = rng(seed);
  const skin = SKINS[Math.floor(R() * SKINS.length)], hair = HAIRS[Math.floor(R() * HAIRS.length)], beard = R() < 0.6, scar = R() < 0.25;
  r(c, 0, 0, 24, 24, shade(color, -20)); for (let i = 0; i < 24; i += 2) r(c, 0, i, 24, 1, shade(color, -30));
  const armor = rank >= 3 ? '#d4dae2' : rank >= 1 ? '#9aa1aa' : '#7a5232';
  r(c, 3, 18, 18, 6, armor); r(c, 9, 18, 6, 6, color); if (rank >= 4) { r(c, 3, 18, 18, 1, P.gold); r(c, 2, 19, 3, 5, '#7a1d1a'); r(c, 19, 19, 3, 5, '#7a1d1a'); }
  r(c, 10, 15, 4, 3, shade(skin, -20));
  r(c, 7, 5, 10, 11, skin); r(c, 6, 8, 1, 4, skin); r(c, 17, 8, 1, 4, skin);
  r(c, 9, 9, 2, 1, P.out); r(c, 13, 9, 2, 1, P.out); px(c, 9, 8, hair); px(c, 14, 8, hair); r(c, 11, 10, 2, 3, shade(skin, -18)); r(c, 10, 13, 4, 1, shade(skin, -45));
  if (beard) { r(c, 7, 12, 10, 4, hair); r(c, 8, 16, 8, 1, hair); r(c, 10, 13, 4, 1, shade(skin, -45)); }
  if (scar) { px(c, 15, 7, '#a04040'); px(c, 15, 8, '#a04040'); px(c, 16, 9, '#a04040'); }
  // headgear by officer rank
  if (rank === 0) { r(c, 5, 4, 14, 2, '#8a8f98'); r(c, 7, 2, 10, 3, '#8a8f98'); }
  else if (rank === 1) { r(c, 7, 2, 10, 5, '#9aa1aa'); r(c, 11, 6, 2, 5, '#9aa1aa'); px(c, 12, 1, '#9aa1aa'); }
  else if (rank === 2) { r(c, 6, 2, 12, 5, '#c9cfd8'); r(c, 6, 6, 2, 6, '#c9cfd8'); r(c, 16, 6, 2, 6, '#c9cfd8'); r(c, 11, 0, 2, 3, P.red); r(c, 13, 0, 2, 2, P.red); }
  else if (rank === 3) { r(c, 7, 3, 10, 3, hair); r(c, 6, 2, 12, 2, P.gold); px(c, 7, 1, P.gold); px(c, 12, 1, P.gold); px(c, 16, 1, P.gold); r(c, 3, 17, 18, 2, '#e8e0c8'); }
  else { r(c, 7, 3, 10, 3, hair); r(c, 6, 1, 12, 3, P.gold); for (const x of [6, 9, 12, 15, 17]) px(c, x, 0, P.gold); px(c, 11, 2, P.red); px(c, 14, 2, '#3557a8'); }
  if (rank < 3 && rank > 0) { r(c, 6, 6, 1, 3, hair); r(c, 17, 6, 1, 3, hair); }
  outline(cv, P.out, 1, 1, 22, 22); r(c, 0, 0, 24, 1, P.gold); r(c, 0, 23, 24, 1, P.goldD); r(c, 0, 0, 1, 24, P.gold); r(c, 23, 0, 1, 24, P.goldD);
  return cv;
}
/** Officer insignia (chevrons/stars) or soldier rank (chevrons), 12x8. */
export function insignia(kind: 'officer' | 'soldier', rank: number): HTMLCanvasElement {
  const [cv, c] = canvas(12, 10), col = kind === 'officer' && rank >= 2 ? P.gold : '#f0e8d0', sh = 'rgba(0,0,0,.6)';
  const both = (x: number, y: number) => { px(c, x + 1, y + 1, sh); px(c, x, y, col); };
  const chev = (y: number) => { for (let i = 0; i < 5; i++) { both(1 + i, y + 4 - i); both(10 - i, y + 4 - i); both(1 + i, y + 5 - i); both(10 - i, y + 5 - i); } };
  const star = (x: number) => { for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [0, 3], [2, 3]]) both(x + dx, 3 + dy); };
  if (kind === 'soldier') { if (rank === 4) { for (let x = 2; x < 10; x++) for (let y = 4; y < 7; y++) both(x, y); for (const x of [2, 5, 6, 9]) both(x, 3); } else for (let i = 0; i < rank; i++) chev(i * 2); }
  else if (rank < 2) for (let i = 0; i <= rank; i++) chev(i * 3); else { const n = rank - 1; for (let i = 0; i < n; i++) star(6 - n * 2 + i * 4); }
  return cv;
}

// ---------------- UI icons (also used by React) ----------------
const ICONS: Record<string, string[]> = {
  gold: ['...yyyy...', '..yYYYYy..', '.yYyyyyYy.', 'yYyYYYYyYo', 'yYyYooYyYo', 'yYyYYYYyYo', 'yYyyyyyyYo', '.yYYYYYYo.', '..oooooo..', '..........'],
  wood: ['..........', '.bbbbbbbb.', 'bBBBBBBBBl', 'bBbbbbbBBl', 'bBBBBBBBBl', '.bbbbbbbb.', 'bBBBBBBBBl', 'bBbbbbbBBl', 'bBBBBBBBBl', '.bbbbbbbb.'],
  stone: ['..........', '...sSSs...', '..sSSSSs..', '.sSSssSSs.', 'sSSSSSSsSd', 'sSsSSSSSSd', 'sSSSSsSSdd', '.sSSSSSdd.', '..dddddd..', '..........'],
  renown: ['y........y', 'yg......gy', '.yg....gy.', '.gy....yg.', '..gy..yg..', '..yg..gy..', '...gyyg...', '....rr....', '...rRRr...', '....rr....'],
  study: ['..........', '.bb....bb.', 'bWWbb.bWWb', 'bWkWWbWkWb', 'bWWWWbWWWb', 'bWkkWbWkWb', 'bWWWWbWWWb', 'bWkWWbWkkb', 'bbbbbbbbbb', '....rr....'],
  build: ['..ssss....', '.sSSSSs...', '.sSdddSs..', '..ss.bSs..', '.....bb...', '....bb....', '...bb.....', '..bb......', '.bb.......', '..........'],
  army: ['........sS', '.......sS.', '......sS..', '.....sS...', '..y.sS....', '..yyS.....', '...yy.....', '..b.yy....', '.b........', 'b.........'],
  habits: ['.wwwwwwww.', 'wWWWWWWWWw', '.wkkkkkkw.', '.wWWWWWWw.', '.wkkkkWWw.', '.wWWWWWWw.', '.wkkkkkkw.', '.wWWWWWWw.', 'wWWWWWWWWw', '.wwwwwwww.'],
  stats: ['..........', '........y.', '.......yy.', '....r..yy.', '...rr..yy.', '.g.rr..yy.', 'gg.rr..yy.', 'gg.rr..yy.', 'dddddddddd', '..........'],
  tech: ['....y.....', '...yYy....', '..yYYYy...', '.wwwwwwww.', 'wWWWWWWWWw', 'wWkkkkkkWw', 'wWWWWWWWWw', 'wWkkkkWWWw', 'wWWWWWWWWw', '.wwwwwwww.'],
  realm: ['..y....y..', '..yy..yy..', '..yYyyYy..', '..yyyyyy..', '.sSSSSSSs.', '.sSdSSdSs.', '.sSSSSSSs.', '.sSSddSSs.', '.sSSddSSs.', 'dddddddddd'],
  account: ['.ssssssss.', 'sSSSSSSSSd', 'sSrrrrrrSd', 'sSrryyrrSd', 'sSryyyyrSd', 'sSrryyrrSd', '.sSrrrrSd.', '..sSrrSd..', '...sSSd...', '....dd....'],
  check: ['..........', '.........g', '........gg', '.......gg.', 'g.....gg..', 'gg...gg...', '.gg.gg....', '..ggg.....', '...g......', '..........'],
  hourglass: ['bbbbbbbbbb', '.wyyyyyyw.', '..wyyyyw..', '...wyyw...', '....ww....', '....ww....', '...w.yw...', '..w.yyyw..', '.wyyyyyyw.', 'bbbbbbbbbb'],
  sun: ['....y.....', '.y..y..y..', '..yYYYy...', '.yYYYYYy..', 'yyYYYYYyyy', '.yYYYYYy..', '..yYYYy...', '.y..y..y..', '....y.....', '..........'],
  moon: ['...wWW....', '..wWW.....', '.wWW......', '.wWW......', '.wWW......', '.wWWW.....', '..wWWW....', '...wWWWWw.', '....wwww..', '..........'],
};
const ICOL: Record<string, string> = { y: P.gold, Y: '#fff1a8', o: P.goldD, b: P.woodD, B: P.woodL, l: P.wood, s: P.stoneD, S: P.stoneL, d: P.stoneDD, g: '#3f9c3a', r: P.red, R: '#e04a40', w: '#e8dcc0', W: '#f8f0dc', k: '#5a4a3a' };
export function iconCanvas(name: string, scale = 1): HTMLCanvasElement {
  const m = ICONS[name] ?? ICONS.gold, [cv, c] = canvas(10 * scale, 10 * scale);
  m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') r(c, x * scale, y * scale, scale, scale, ICOL[ch]); }));
  return cv;
}
