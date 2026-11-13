// Procedural pixel art: every sprite is drawn pixel-by-pixel on canvas at runtime.
type C = CanvasRenderingContext2D;
export const P = {
  out: '#1d1716', skin: '#e3b38a', skinD: '#b9845e', boot: '#3b2a20',
  stoneL: '#b4b0a8', stone: '#8f8b84', stoneD: '#66625e', stoneDD: '#4a4744',
  woodL: '#b07a42', wood: '#8a5a2e', woodD: '#5e3b1c', thatch: '#d2a94e', thatchD: '#a67f2f',
  roof: '#a8342e', roofD: '#76221e', blue: '#3557a8', blueD: '#223a77', gold: '#ecc94b', goldD: '#b08a22',
  dirt: '#b99260', dirtD: '#9c774a', dirtL: '#cfaa77', grass: '#5d9a3b', grassD: '#467c2b', grassL: '#7fb84f',
  leaf: '#3f7d2c', leafD: '#2b5a1f', leafL: '#5fa040', glass: '#2a2d44', fire: '#f2a33a', fireL: '#fde58a',
};

export function canvas(w: number, h: number): [HTMLCanvasElement, C] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; return [c, x];
}
export const r = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const px = (c: C, x: number, y: number, col: string) => r(c, x, y, 1, 1, col);
export function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Adds a 1px dark outline around opaque pixels within [x,y,w,h]. */
export function outline(cv: HTMLCanvasElement, col = P.out, x0 = 0, y0 = 0, w = cv.width, h = cv.height) {
  const c = cv.getContext('2d')!, img = c.getImageData(x0, y0, w, h), d = img.data;
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  const pts: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (!a(x, y) && (a(x - 1, y) > 200 || a(x + 1, y) > 200 || a(x, y - 1) > 200 || a(x, y + 1) > 200)) pts.push(x, y);
  c.fillStyle = col; for (let i = 0; i < pts.length; i += 2) c.fillRect(x0 + pts[i], y0 + pts[i + 1], 1, 1);
}

// ---------------- primitives ----------------
function stoneBlock(c: C, x: number, y: number, w: number, h: number, base = P.stone, seed = 1) {
  const R = rng(seed); r(c, x, y, w, h, base);
  for (let j = 0; j < h; j += 4) {
    r(c, x, y + j + 3, w, 1, P.stoneD);
    r(c, x, y + j, w, 1, j === 0 ? P.stoneL : base);
    for (let i = ((j / 4) % 2) * 3; i < w; i += 6) r(c, x + i, y + j, 1, Math.min(3, h - j), P.stoneD);
    for (let i = 0; i < w; i++) if (R() < 0.08) px(c, x + i, y + j + 1 + Math.floor(R() * 2), R() < 0.5 ? P.stoneL : P.stoneD);
  }
  r(c, x, y, 1, h, P.stoneL); r(c, x + w - 1, y, 1, h, P.stoneDD);
}
function planks(c: C, x: number, y: number, w: number, h: number, seed = 2) {
  const R = rng(seed); r(c, x, y, w, h, P.wood);
  for (let i = 0; i < w; i += 3) { r(c, x + i, y, 1, h, P.woodD); r(c, x + i + 1, y, 1, h, P.woodL); }
  for (let k = 0; k < w * h * 0.04; k++) px(c, x + Math.floor(R() * w), y + Math.floor(R() * h), P.woodD);
}
function crenel(c: C, x: number, y: number, w: number, base = P.stone) {
  for (let i = 0; i < w; i += 4) { r(c, x + i, y, Math.min(3, w - i), 3, base); r(c, x + i, y, Math.min(3, w - i), 1, P.stoneL); }
}
function gable(c: C, x: number, y: number, w: number, h: number, col: string, dark: string) {
  for (let j = 0; j < h; j++) {
    const half = Math.round((w / 2) * ((j + 1) / h)), cx = x + w / 2;
    r(c, Math.floor(cx - half), y + j, half, 1, col); r(c, Math.floor(cx), y + j, half, 1, dark);
    if (j % 3 === 2) r(c, Math.floor(cx - half), y + j, half * 2, 1, dark);
  }
}
function cone(c: C, cx: number, top: number, w: number, h: number, col: string, dark: string) {
  for (let j = 0; j < h; j++) {
    const half = Math.max(1, Math.round((w / 2) * ((j + 1) / h)));
    r(c, cx - half, top + j, half, 1, col); r(c, cx, top + j, half, 1, dark);
    if (j % 4 === 3) r(c, cx - half, top + j, half * 2, 1, dark);
  }
  px(c, cx, top - 1, P.gold);
}
function win(c: C, x: number, y: number, lit = false) { r(c, x, y + 1, 2, 3, lit ? P.fire : P.glass); px(c, x, y, P.stoneD); px(c, x + 1, y, P.stoneD); }
function door(c: C, x: number, y: number, w: number, h: number) {
  r(c, x, y + 1, w, h - 1, P.woodD); r(c, x + 1, y, w - 2, 1, P.woodD);
  for (let i = 1; i < w; i += 2) r(c, x + i, y + 1, 1, h - 1, P.wood); px(c, x + w - 2, y + Math.floor(h / 2), P.gold);
}
export function flag(c: C, x: number, y: number, col: string, f: number, len = 7) {
  r(c, x, y, 1, 12, P.woodD); px(c, x, y - 1, P.gold);
  for (let i = 0; i < len; i++) { const o = Math.round(Math.sin((i + f * 2) * 0.9) * 0.8); r(c, x + 1 + i, y + 1 + o, 1, 4, col); px(c, x + 1 + i, y + 4 + o, shade(col, -40)); }
}
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16), cl = (v: number) => Math.max(0, Math.min(255, v + amt));
  return '#' + [cl(n >> 16), cl((n >> 8) & 255), cl(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
const shadow = (c: C, x: number, y: number, w: number, h: number) => { c.fillStyle = 'rgba(30,20,10,.28)'; c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); c.fill(); };
function tower(c: C, x: number, by: number, w: number, h: number, roofCol: string | null, f: number, seed: number, flagCol?: string) {
  stoneBlock(c, x, by - h, w, h, P.stone, seed); crenel(c, x - 1, by - h - 3, w + 2);
  r(c, x - 1, by - h, w + 2, 1, P.stoneD);
  win(c, x + Math.floor(w / 2) - 1, by - h + 5, f === 1);
  if (h > 22) win(c, x + Math.floor(w / 2) - 1, by - h + 14);
  if (roofCol) cone(c, x + Math.floor(w / 2), by - h - 3 - Math.round(w * 1.1), w + 4, Math.round(w * 1.1), roofCol, shade(roofCol, -45));
  if (flagCol) flag(c, x + Math.floor(w / 2), by - h - 3 - (roofCol ? Math.round(w * 1.1) : 0) - 12, flagCol, f);
}
function tent(c: C, x: number, y: number, w: number, h: number, col: string) {
  for (let j = 0; j < h; j++) {
    const half = Math.round((w / 2) * ((j + 1) / h));
    r(c, x + w / 2 - half, y + j, half, 1, col); r(c, x + w / 2, y + j, half, 1, shade(col, -35));
    for (let i = -half; i < half; i += 4) px(c, x + w / 2 + i, y + j, shade(col, 25));
  }
  r(c, x + w / 2 - 1, y + h - 5, 2, 5, P.out); px(c, x + w / 2, y - 1, P.woodD); px(c, x + w / 2, y - 2, P.woodD);
}
function fire(c: C, x: number, y: number, f: number) {
  r(c, x - 3, y + 2, 7, 2, P.woodD); r(c, x - 2, y + 1, 5, 1, P.wood);
  const hs = f ? [2, 4, 3] : [3, 2, 4];
  hs.forEach((h, i) => { r(c, x - 1 + i, y + 1 - h, 1, h, P.fire); px(c, x - 1 + i, y + 1 - Math.max(1, h - 2), P.fireL); });
  for (let i = -5; i <= 5; i += 2) px(c, x + i, y + 3, P.stoneD);
}
function crops(c: C, x: number, y: number, w: number, h: number, ripe: boolean, f: number) {
  r(c, x, y, w, h, '#7a5a34');
  for (let j = 1; j < h; j += 3) for (let i = 1; i < w - 1; i++) {
    const sw = (i + f) % 4 === 0 ? 1 : 0;
    px(c, x + i, y + j, ripe ? P.gold : P.grassL); px(c, x + i + sw, y + j - 1, ripe ? P.goldD : P.grass);
  }
}
function fence(c: C, x: number, y: number, w: number) { r(c, x, y + 1, w, 1, P.woodL); for (let i = 0; i < w; i += 3) r(c, x + i, y, 1, 4, P.woodD); }
function hay(c: C, x: number, y: number) { r(c, x, y + 1, 5, 4, P.thatch); r(c, x + 1, y, 3, 1, P.thatch); r(c, x, y + 3, 5, 1, P.thatchD); }

// ---------------- buildings ----------------
export const EXTRA_H: Record<string, number> = { keep: 64, farm: 12, barracks: 20, range: 14, stable: 18, tower: 44, wall: 10, road: 0, house: 16 };

export function drawBuilding(kind: string, lvl: number, size: number, f: number): HTMLCanvasElement {
  const W = size * 16, EH = EXTRA_H[kind] ?? 0, H = W + EH;
  const [cv, c] = canvas(W, H); const B = H; // ground bottom
  const g = EH; // y of footprint top
  switch (kind) {
    case 'keep': drawKeep(c, W, H, g, lvl, f); break;
    case 'farm': {
      crops(c, 2, g + 8, W - 4, W - 12, lvl >= 2, f); fence(c, 1, g + 4, W - 2); fence(c, 1, B - 4, W - 2);
      if (lvl >= 2) { planks(c, 4, g - 4, 16, 12); gable(c, 2, g - 12, 20, 9, P.roof, P.roofD); door(c, 10, g + 2, 4, 6); hay(c, 24, g + 2); }
      else { hay(c, 6, g + 2); hay(c, 13, g + 1); }
      if (lvl >= 3) { // windmill
        stoneBlock(c, W - 14, g - 8, 8, 18, P.stoneL, 3); cone(c, W - 10, g - 14, 10, 6, P.roof, P.roofD);
        const a = f * 0.4; for (let k = 0; k < 4; k++) { const an = a + (k * Math.PI) / 2; for (let t = 1; t < 10; t++) px(c, Math.round(W - 10 + Math.cos(an) * t), Math.round(g - 6 + Math.sin(an) * t), t > 3 ? P.thatch : P.woodD); }
      }
      break;
    }
    case 'house': {
      shadow(c, 2, B - 8, W - 4, 6);
      if (lvl === 1) { planks(c, 5, g + 6, W - 10, 14); gable(c, 3, g - 4, W - 6, 11, P.thatch, P.thatchD); door(c, 13, g + 13, 5, 7); }
      else { stoneBlock(c, 5, g + 4, W - 10, 16, P.stoneL, 7); gable(c, 3, g - 8, W - 6, 13, P.roof, P.roofD); door(c, 13, g + 13, 5, 7); win(c, 8, g + 9, f === 1); win(c, 22, g + 9); r(c, W - 10, g - 10, 3, 6, P.stoneD); }
      break;
    }
    case 'barracks': {
      shadow(c, 2, B - 10, W - 4, 8);
      if (lvl === 1) {
        r(c, 2, g + 14, W - 4, W - 18, P.dirtD); fence(c, 2, g + 12, W - 4);
        for (let i = 0; i < 3; i++) { const x = 9 + i * 13; r(c, x, g + 20, 2, 12, P.woodD); r(c, x - 3, g + 23, 8, 2, P.wood); r(c, x - 1, g + 17, 4, 4, P.thatch); }
        tent(c, 4, g - 6, 18, 16, '#c9c2a8'); tent(c, 26, g - 4, 16, 14, '#b02a28');
      } else {
        if (lvl === 3) stoneBlock(c, 3, g + 4, W - 6, 26, P.stone, 4); else planks(c, 3, g + 4, W - 6, 26, 4);
        gable(c, 1, g - 14, W - 2, 18, lvl === 3 ? P.blue : P.roof, lvl === 3 ? P.blueD : P.roofD);
        door(c, W / 2 - 4, g + 20, 8, 10); win(c, 9, g + 12, f === 1); win(c, W - 11, g + 12);
        r(c, 3, g + 34, W - 6, 12, P.dirtD);
        for (let i = 0; i < 4; i++) { const x = 8 + i * 10; r(c, x, g + 36, 1, 8, P.stoneD); px(c, x, g + 35, P.stoneL); }
        if (lvl === 3) { tower(c, 0, g + 32, 9, 34, P.blue, f, 9, '#b02a28'); tower(c, W - 9, g + 32, 9, 34, P.blue, f, 10, '#b02a28'); }
      }
      break;
    }
    case 'range': {
      r(c, 2, g + 8, W - 4, W - 12, P.dirtL);
      for (let i = 0; i < 3; i++) { const x = 9 + i * 14, y = g + 6; r(c, x - 1, y + 10, 2, 6, P.woodD); c.fillStyle = '#e8e0c8'; c.beginPath(); c.arc(x, y + 5, 5, 0, 7); c.fill(); c.fillStyle = P.roof; c.beginPath(); c.arc(x, y + 5, 3, 0, 7); c.fill(); px(c, x, y + 5, P.gold); }
      fence(c, 2, B - 6, W - 4);
      if (lvl >= 2) { stoneBlock(c, 4, g - 6, 20, 14, P.stone, 5); gable(c, 2, g - 16, 24, 11, P.leaf, P.leafD); door(c, 11, g + 1, 6, 7); }
      else { r(c, 6, g, 2, 8, P.woodD); r(c, 26, g, 2, 8, P.woodD); gable(c, 4, g - 6, 26, 7, P.thatch, P.thatchD); }
      break;
    }
    case 'stable': {
      shadow(c, 2, B - 10, W - 4, 8);
      planks(c, 3, g + 2, W - 6, 24, 6); gable(c, 1, g - 14, W - 2, 17, lvl >= 2 ? P.blue : P.thatch, lvl >= 2 ? P.blueD : P.thatchD);
      for (let i = 0; i < 4; i++) { r(c, 6 + i * 10, g + 12, 7, 14, P.woodD); r(c, 6 + i * 10, g + 16, 7, 1, P.woodL); }
      r(c, 3, g + 30, W - 6, 14, P.dirtD); fence(c, 3, g + 28, W - 6); hay(c, 6, g + 34); hay(c, 36, g + 36);
      if (lvl >= 2) { flag(c, 4, g - 22, '#b02a28', f); flag(c, W - 10, g - 22, '#b02a28', f); r(c, 3, g + 2, W - 6, 2, P.gold); }
      break;
    }
    case 'tower': {
      shadow(c, 1, B - 9, W - 2, 7);
      if (lvl === 1) {
        for (const x of [4, W - 6]) r(c, x, g - 14, 2, 46, P.woodD);
        for (let y = g + 2; y < B - 2; y += 6) r(c, 4, y, W - 8, 1, P.wood);
        planks(c, 2, g - 18, W - 4, 6); gable(c, 1, g - 30, W - 2, 12, P.thatch, P.thatchD);
        flag(c, W / 2, g - 42, '#b02a28', f);
      } else tower(c, 5, B - 2, W - 10, lvl === 2 ? 42 : 56, lvl === 3 ? P.blue : null, f, 11, lvl === 3 ? P.gold : '#b02a28');
      break;
    }
  }
  if (kind !== 'road' && kind !== 'wall') outline(cv);
  return cv;
}

function drawKeep(c: C, W: number, H: number, g: number, lvl: number, f: number) {
  const B = H;
  shadow(c, 4, B - 22, W - 8, 18);
  if (lvl === 1) {
    tent(c, 8, g + 18, 26, 22, '#d9cfb0'); tent(c, 44, g + 24, 22, 18, '#b02a28'); tent(c, 30, g + 40, 18, 14, '#c9c2a8');
    fire(c, 40, g + 60, f); flag(c, 26, g + 4, '#b02a28', f);
    r(c, 10, g + 58, 9, 6, P.woodD); r(c, 11, g + 57, 7, 2, P.wood); hay(c, 60, g + 54); hay(c, 64, g + 58);
  } else if (lvl === 2) {
    for (let x = 2; x < W - 2; x += 3) { r(c, x, g + 6, 2, 10, P.woodD); px(c, x, g + 5, P.wood); r(c, x, B - 14, 2, 10, P.woodD); }
    for (const x of [2, W - 4]) for (let y = g + 6; y < B - 6; y += 3) r(c, x, y, 2, 2, P.woodD);
    planks(c, 14, g + 22, 52, 30, 8); gable(c, 10, g - 4, 60, 28, P.thatch, P.thatchD);
    door(c, 35, g + 40, 10, 12); win(c, 20, g + 30, f === 1); win(c, 56, g + 30, true);
    r(c, 62, g - 2, 3, 10, P.stoneD); flag(c, 18, g - 10, '#b02a28', f);
    r(c, 34, B - 14, 12, 10, P.dirtL);
  } else if (lvl === 3) {
    r(c, 4, B - 26, W - 8, 22, P.dirtD); stoneBlock(c, 6, B - 18, W - 12, 12, P.stone, 12); crenel(c, 6, B - 21, W - 12);
    stoneBlock(c, 22, g + 4, 36, 54, P.stone, 13); crenel(c, 21, g + 1, 38);
    door(c, 35, g + 46, 10, 12); win(c, 28, g + 16, f === 1); win(c, 50, g + 16); win(c, 28, g + 32); win(c, 50, g + 32, true);
    flag(c, 40, g - 13, '#b02a28', f); r(c, 34, B - 18, 12, 12, P.woodD);
  } else {
    const big = lvl === 5, top = big ? 0 : 14;
    // curtain walls & corner towers
    stoneBlock(c, 8, g + 24, W - 16, 40, P.stone, 21); crenel(c, 8, g + 21, W - 16);
    stoneBlock(c, 22, top + 10, 36, g + 20 - top, P.stoneL, 22); crenel(c, 21, top + 7, 38);
    win(c, 30, top + 22, f === 1); win(c, 48, top + 22); win(c, 39, top + 34, true);
    if (big) { cone(c, 40, top - 12 + 4, 26, 18, P.blue, P.blueD); flag(c, 40, top - 22, P.gold, f, 9); r(c, 22, top + 10, 36, 2, P.gold); }
    else flag(c, 40, top - 6, '#b02a28', f);
    for (const [x, h] of [[1, 52], [W - 13, 52]] as const) tower(c, x, B - 4, 12, h, big ? P.blue : P.roof, f, x + 30, big ? P.gold : '#b02a28');
    // gatehouse
    stoneBlock(c, 30, B - 30, 20, 26, P.stone, 23); crenel(c, 29, B - 33, 22);
    r(c, 35, B - 20, 10, 16, P.out); for (let i = 36; i < 45; i += 2) r(c, i, B - 19, 1, 15, P.stoneDD);
    for (let j = B - 17; j < B - 4; j += 3) r(c, 35, j, 10, 1, P.stoneDD);
    if (big) {
      tower(c, 12, g + 30, 10, 40, P.blue, f, 31); tower(c, W - 22, g + 30, 10, 40, P.blue, f, 32);
      for (const x of [18, 58]) { r(c, x, g + 30, 4, 8, '#7a1d1a'); r(c, x, g + 30, 4, 1, P.gold); }
    }
  }
}

/** Single-tile wall/road; mask bits: 1=N 2=E 4=S 8=W neighbours of same kind. */
export function drawTile(kind: 'wall' | 'road', lvl: number, mask: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 26); const g = 10;
  if (kind === 'road') {
    const col = lvl === 1 ? '#8e6a3e' : P.stone, R = rng(mask + lvl * 20);
    const seg = (x: number, y: number, w: number, h: number) => {
      r(c, x, y, w, h, col);
      for (let i = 0; i < w * h * 0.25; i++) px(c, x + Math.floor(R() * w), y + Math.floor(R() * h), lvl === 1 ? '#7a5a32' : (R() < .5 ? P.stoneL : P.stoneD));
    };
    seg(4, g + 4, 8, 8);
    if (mask & 1) seg(4, g, 8, 4); if (mask & 4) seg(4, g + 12, 8, 4); if (mask & 8) seg(0, g + 4, 4, 8); if (mask & 2) seg(12, g + 4, 4, 8);
    return cv;
  }
  const h = 14;
  if (lvl === 1) {
    const post = (x: number, y: number) => { r(c, x, y - 10, 2, 12, P.wood); px(c, x, y - 11, P.woodL); px(c, x + 1, y - 10, P.woodD); };
    post(7, g + 9); if (mask & 8) { post(1, g + 9); post(4, g + 9); } if (mask & 2) { post(10, g + 9); post(13, g + 9); }
    if (mask & 1) { post(7, g + 3); post(7, g + 6); } if (mask & 4) { post(7, g + 12); post(7, g + 15); }
  } else {
    const x0 = mask & 8 ? 0 : 3, x1 = mask & 2 ? 16 : 13, y0 = mask & 1 ? g - 6 : g;
    stoneBlock(c, x0, y0 + 2, x1 - x0, (mask & 4 ? g + 16 : g + 12) - y0 - 2, P.stone, mask + 3);
    crenel(c, x0, y0 - 1, x1 - x0);
    void h;
  }
  outline(cv); return cv;
}

// ---------------- terrain ----------------
export type TileKind = 'dirt' | 'mix' | 'grass';
export function terrainTile(kind: TileKind, seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 16), R = rng(seed * 7919 + 13);
  const base = kind === 'grass' ? P.grass : P.dirt;
  r(c, 0, 0, 16, 16, base);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(R() * 16), y = Math.floor(R() * 16);
    if (kind === 'grass') { px(c, x, y, R() < .5 ? P.grassD : P.grassL); if (R() < .3) px(c, x, y - 1, P.grassL); }
    else px(c, x, y, R() < .55 ? P.dirtD : P.dirtL);
  }
  if (kind === 'dirt' && R() < .5) { let x = Math.floor(R() * 12) + 2, y = Math.floor(R() * 12) + 2; for (let k = 0; k < 6; k++) { px(c, x, y, '#8a6840'); x += R() < .5 ? 1 : -1; y += R() < .6 ? 1 : 0; } }
  if (kind === 'mix') for (let i = 0; i < 70; i++) { const x = Math.floor(R() * 16), y = Math.floor(R() * 16); r(c, x, y, 2, 1, R() < .6 ? P.grass : P.grassD); }
  return cv;
}
export function decoration(kind: 'rock' | 'deadbush' | 'tree' | 'flowers' | 'deadtree' | 'pine', seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 24), R = rng(seed + 99);
  if (kind === 'rock') { r(c, 4, 16, 8, 5, P.stone); r(c, 5, 15, 5, 2, P.stoneL); r(c, 4, 20, 8, 1, P.stoneD); px(c, 7, 17, P.stoneD); }
  if (kind === 'deadbush') for (let i = 0; i < 9; i++) { const a = -Math.PI * (0.15 + R() * 0.7); for (let t = 0; t < 5; t++) px(c, Math.round(8 + Math.cos(a) * t), Math.round(21 + Math.sin(a) * t), '#7b5a36'); }
  if (kind === 'deadtree') { r(c, 7, 8, 2, 14, '#6b4a2c'); for (const [x, y, d] of [[8, 12, 1], [8, 9, -1], [8, 15, -1]]) for (let t = 0; t < 4; t++) px(c, x + d * t, y - t, '#6b4a2c'); }
  if (kind === 'flowers') for (let i = 0; i < 6; i++) { const x = 3 + Math.floor(R() * 10), y = 14 + Math.floor(R() * 7); px(c, x, y + 1, P.grassD); px(c, x, y, ['#f0e060', '#e8e8f0', '#d05a8a'][i % 3]); }
  if (kind === 'tree') {
    r(c, 7, 15, 2, 7, P.woodD); c.fillStyle = P.leafD; c.beginPath(); c.arc(8, 10, 6.5, 0, 7); c.fill();
    c.fillStyle = P.leaf; c.beginPath(); c.arc(7, 9, 5.5, 0, 7); c.fill(); c.fillStyle = P.leafL; c.beginPath(); c.arc(6, 7, 2.5, 0, 7); c.fill();
    for (let i = 0; i < 8; i++) px(c, 3 + Math.floor(R() * 10), 4 + Math.floor(R() * 10), R() < .5 ? P.leafD : P.leafL);
  }
  if (kind === 'pine') { r(c, 7, 18, 2, 4, P.woodD); for (let j = 0; j < 15; j++) { const hw = Math.floor(j / 2.5) + 1; r(c, 8 - hw, 4 + j, hw, 1, P.leaf); r(c, 8, 4 + j, hw, 1, P.leafD); } }
  if (kind !== 'flowers') { c.globalCompositeOperation = 'destination-over'; c.fillStyle = 'rgba(30,20,10,.25)'; c.fillRect(4, 21, 9, 2); c.globalCompositeOperation = 'source-over'; outline(cv); }
  return cv;
}

// ---------------- soldiers ----------------
export const SOLDIER_CLASSES = ['militia', 'infantry', 'squire', 'archer', 'cavalry', 'knight', 'guard'] as const;
const TABARD: Record<string, string> = { militia: '#8a6a44', infantry: '#a8322d', squire: '#3557a8', archer: '#3f7d2c', cavalry: '#7a3a8c', knight: '#d8d8d8', guard: '#5a2a7a' };
const ARMOR_COL = [['#7a5232', '#5e3e24'], ['#9aa1aa', '#6d737c'], ['#d4dae2', '#8e96a2'], ['#e3e7ec', '#ecc94b']];
export const SOLDIER = 16, FRAMES = 4;

function drawSoldier(c: C, ox: number, oy: number, cls: string, tier: number, f: number) {
  const [arm, armD] = ARMOR_COL[tier], tab = TABARD[cls], mounted = cls === 'cavalry' || cls === 'knight';
  const bob = f % 2 === 1 ? 1 : 0, P_ = (x: number, y: number, w: number, h: number, col: string) => r(c, ox + x, oy + y, w, h, col);
  let by = 0; // body offset
  if (mounted) {
    const hc = cls === 'knight' ? '#e8e2d4' : '#6b4423', hd = cls === 'knight' ? '#b8b0a0' : '#4a2e16';
    const lg = [[0, 0], [1, -1], [0, 0], [-1, 1]][f];
    P_(2, 9 + bob, 11, 4, hc); P_(2, 12 + bob, 11, 1, hd); P_(12, 6 + bob, 2, 5, hc); P_(13, 5 + bob, 3, 3, hc); px(c, ox + 15, oy + 6 + bob, P.out); P_(11, 5 + bob, 1, 4, hd);
    P_(1, 9 + bob, 1, 4, hd); // tail
    for (const [x, d] of [[3, lg[0]], [5, lg[1]], [10, lg[1]], [12, lg[0]]]) P_(x + d, 13, 1, 3, hd);
    if (cls === 'knight') { P_(3, 9 + bob, 9, 4, '#a8322d'); for (let i = 3; i < 12; i += 2) px(c, ox + i, oy + 12 + bob, P.gold); P_(12, 5 + bob, 3, 2, arm); }
    by = -6 + bob;
  } else by = bob;
  const lx = mounted ? [0, 0] : [[0, 0], [-1, 1], [0, 0], [1, -1]][f];
  if (!mounted) { P_(5 + lx[0], 12, 2, 3, tier >= 2 ? armD : '#5a4030'); P_(8 + lx[1], 12, 2, 3, tier >= 2 ? armD : '#5a4030'); P_(5 + lx[0], 15, 2, 1, P.boot); P_(8 + lx[1], 15, 2, 1, P.boot); }
  else P_(6, 10 + by, 2, 3, armD);
  const y = by;
  if (cls === 'guard') P_(3, 6 + y, 9, 7, '#7a1d1a'); // cape
  P_(4, 7 + y, 7, 5, arm); P_(5, 7 + y, 5, 5, tab); if (cls === 'knight') { P_(7, 8 + y, 1, 3, '#a8322d'); P_(6, 9 + y, 3, 1, '#a8322d'); }
  if (tier === 3) { P_(5, 11 + y, 5, 1, P.gold); px(c, ox + 7, oy + 8 + y, P.gold); }
  P_(4, 11 + y, 7, 1, P.woodD);
  // head + helmet
  P_(5, 2 + y, 5, 5, P.skin); px(c, ox + 8, oy + 4 + y, P.out); px(c, ox + 6, oy + 6 + y, P.skinD);
  if (cls === 'archer' && tier < 2) { P_(4, 1 + y, 6, 3, P.leaf); P_(4, 3 + y, 1, 4, P.leaf); }
  else if (cls === 'militia' && tier === 0) P_(5, 1 + y, 5, 2, '#7a5232');
  else {
    P_(5, 1 + y, 5, 3, arm); P_(4, 2 + y, 1, 2, armD); px(c, ox + 9, oy + 3 + y, armD);
    if (tier >= 2 || cls === 'knight' || cls === 'guard') { P_(5, 3 + y, 5, 2, arm); P_(6, 4 + y, 4, 1, P.out); }
    if (tier === 3 || cls === 'knight' || cls === 'guard') { P_(6, y - 1, 2, 2, cls === 'guard' ? P.gold : '#c0302a'); px(c, ox + 5, oy + y, cls === 'guard' ? P.gold : '#c0302a'); }
  }
  // weapons
  const sw = f === 1 || f === 3 ? 1 : 0;
  switch (cls) {
    case 'militia': P_(11, y, 1, 13, P.woodL); P_(10, y - 1, 3, 1, P.stoneD); px(c, ox + 10, oy + y - 2, P.stoneD); px(c, ox + 12, oy + y - 2, P.stoneD); P_(11, 8 + y, 1, 1, P.skin); break;
    case 'infantry': case 'squire':
      P_(11, 2 + y + sw, 1, 7, P.stoneL); P_(10, 8 + y + sw, 3, 1, P.goldD);
      P_(2, 7 + y, 3, 5, cls === 'infantry' ? '#a8322d' : P.blue); P_(2, 7 + y, 3, 1, arm); px(c, ox + 3, oy + 9 + y, P.gold); break;
    case 'archer': for (let j = 0; j < 9; j++) px(c, ox + 11 + (j > 1 && j < 7 ? 1 : 0), oy + 3 + y + j, P.woodL); P_(11, 4 + y, 1, 7, '#e8e0c8'); P_(3, 6 + y, 2, 5, P.woodD); px(c, ox + 3, oy + 5 + y, '#e8e0c8'); break;
    case 'cavalry': P_(10, 1 + y, 1, 9, P.woodL); px(c, ox + 10, oy + y, P.stoneL); P_(3, 7 + y, 2, 4, '#7a3a8c'); break;
    case 'knight': for (let j = 0; j < 9; j++) px(c, ox + 9 + j, oy + 9 + y - j, j > 6 ? P.stoneL : '#c8c0b0'); P_(14, 1 + y, 2, 2, '#a8322d'); P_(2, 7 + y, 3, 5, '#d8d8d8'); P_(3, 8 + y, 1, 3, '#a8322d'); break;
    case 'guard': P_(11, y - 3, 1, 15, P.woodD); P_(11, y - 4, 1, 2, P.stoneL); P_(12, y - 2, 2, 3, P.stoneL); px(c, ox + 10, oy + y - 1, P.stoneL); break;
  }
}

/** Sheet: rows = class*4+tier, cols = frames. */
export function soldierSheet(): HTMLCanvasElement {
  const rows = SOLDIER_CLASSES.length * 4;
  const [cv, c] = canvas(SOLDIER * FRAMES, SOLDIER * rows);
  SOLDIER_CLASSES.forEach((cls, ci) => { for (let t = 0; t < 4; t++) for (let f = 0; f < FRAMES; f++) {
    const ox = f * SOLDIER, oy = (ci * 4 + t) * SOLDIER;
    drawSoldier(c, ox, oy + 2, cls, t, f); // +2 so plumes fit
    outline(cv, P.out, ox, oy, SOLDIER, SOLDIER);
  } });
  return cv;
}

export function banner(color: string, emblem: string, f: number): HTMLCanvasElement {
  const [cv, c] = canvas(16, 28);
  r(c, 3, 2, 1, 26, P.woodD); r(c, 2, 1, 3, 1, P.gold); px(c, 3, 0, P.gold);
  for (let i = 0; i < 11; i++) { const o = Math.round(Math.sin(i * 0.7 + f * 1.6) * 0.9), len = i > 8 ? 11 - (i - 8) * 3 : 11; r(c, 4 + i, 3 + o, 1, len, color); px(c, 4 + i, 3 + o, shade(color, 40)); px(c, 4 + i, 2 + len + o, shade(color, -50)); }
  const e = (x: number, y: number, w = 1, h = 1) => r(c, 4 + x, 3 + y, w, h, P.gold);
  if (emblem === 'cross') { e(4, 2, 2, 7); e(2, 4, 6, 2); }
  else if (emblem === 'tower') { e(2, 3, 6, 6); e(2, 2, 1, 1); e(4, 2, 2, 1); e(7, 2, 1, 1); r(c, 8, 8, 2, 3, color); }
  else if (emblem === 'star') { e(4, 2, 2, 7); e(2, 4, 6, 2); e(3, 3); e(6, 3); e(3, 6); e(6, 6); }
  else if (emblem === 'sword') { e(4, 1, 2, 7); e(2, 6, 6, 1); e(4, 8, 2, 2); }
  else { e(3, 3, 4, 4); e(2, 2, 2, 2); e(6, 7, 2, 2); e(7, 3, 1, 1); e(2, 6, 1, 3); } // lion (stylised)
  outline(cv); return cv;
}

// ---------------- UI icons (also used in React) ----------------
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
  account: ['.ssssssss.', 'sSSSSSSSSd', 'sSrrrrrrSd', 'sSrryyrrSd', 'sSryyyyrSd', 'sSrryyrrSd', '.sSrrrrSd.', '..sSrrSd..', '...sSSd...', '....dd....'],
  check: ['..........', '.........g', '........gg', '.......gg.', 'g.....gg..', 'gg...gg...', '.gg.gg....', '..ggg.....', '...g......', '..........'],
};
const ICOL: Record<string, string> = { y: P.gold, Y: '#fff1a8', o: P.goldD, b: P.woodD, B: P.woodL, l: P.wood, s: P.stoneD, S: P.stoneL, d: P.stoneDD, g: '#3f9c3a', r: '#b02a28', R: '#e04a40', w: '#e8dcc0', W: '#f8f0dc', k: '#5a4a3a' };
export function iconCanvas(name: string, scale = 1): HTMLCanvasElement {
  const m = ICONS[name] ?? ICONS.gold, [cv, c] = canvas(10 * scale, 10 * scale);
  m.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') r(c, x * scale, y * scale, scale, scale, ICOL[ch]); }));
  return cv;
}
