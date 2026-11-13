// Pixel primitives shared by all procedural art. Everything is drawn pixel-by-pixel on canvas.
export type C = CanvasRenderingContext2D;
export const P = {
  out: '#1d1716', skin: '#e3b38a', skinD: '#b9845e', boot: '#3b2a20', hair: '#5a3a1e',
  stoneL: '#b8b3aa', stone: '#918c85', stoneD: '#67635e', stoneDD: '#4a4744',
  woodL: '#b07a42', wood: '#8a5a2e', woodD: '#5e3b1c', thatch: '#d2a94e', thatchD: '#a67f2f',
  roof: '#a8342e', roofD: '#76221e', blue: '#3557a8', blueD: '#223a77', slate: '#56617a', slateD: '#3b4356',
  gold: '#ecc94b', goldD: '#b08a22', plaster: '#e9dfc6', plasterD: '#c9bc9c',
  dirt: '#b99260', dirtD: '#9c774a', dirtL: '#cfaa77', crack: '#86643c',
  grass: '#5d9a3b', grassD: '#467c2b', grassL: '#7fb84f', leaf: '#3f7d2c', leafD: '#2b5a1f', leafL: '#5fa040',
  water: '#3a78b8', waterD: '#2a5a94', waterL: '#7fb6e6', sand: '#d9c08a',
  glass: '#2a2d44', fire: '#f2a33a', fireL: '#fde58a', cloth: '#e8e0c8', red: '#b02a28',
};
export function canvas(w: number, h: number): [HTMLCanvasElement, C] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!; x.imageSmoothingEnabled = false; return [c, x];
}
export const r = (c: C, x: number, y: number, w: number, h: number, col: string) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
export const px = (c: C, x: number, y: number, col: string) => r(c, x, y, 1, 1, col);
export function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16), cl = (v: number) => Math.max(0, Math.min(255, v + amt));
  return '#' + [cl(n >> 16), cl((n >> 8) & 255), cl(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** 1px dark outline around opaque pixels in a region (gives sprites crisp silhouettes). */
export function outline(cv: HTMLCanvasElement, col = P.out, x0 = 0, y0 = 0, w = cv.width, h = cv.height) {
  const c = cv.getContext('2d')!, d = c.getImageData(x0, y0, w, h).data;
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
  c.fillStyle = col;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (!a(x, y) && (a(x - 1, y) > 200 || a(x + 1, y) > 200 || a(x, y - 1) > 200 || a(x, y + 1) > 200)) c.fillRect(x0 + x, y0 + y, 1, 1);
}

// ---------- architectural parts ----------
export function stoneBlock(c: C, x: number, y: number, w: number, h: number, base = P.stone, seed = 1) {
  const R = rng(seed); r(c, x, y, w, h, base);
  for (let j = 0; j < h; j += 4) {
    r(c, x, y + j + 3, w, 1, shade(base, -38));
    for (let i = ((j / 4) % 2) * 3; i < w; i += 6) r(c, x + i, y + j, 1, Math.min(3, h - j), shade(base, -38));
    for (let i = 0; i < w; i++) if (R() < 0.07) px(c, x + i, y + j + 1 + Math.floor(R() * 2), R() < 0.5 ? shade(base, 25) : shade(base, -25));
  }
  r(c, x, y, 1, h, shade(base, 25)); r(c, x + w - 1, y, 1, h, shade(base, -55));
}
export function planks(c: C, x: number, y: number, w: number, h: number, seed = 2, base = P.wood) {
  const R = rng(seed); r(c, x, y, w, h, base);
  for (let i = 0; i < w; i += 3) { r(c, x + i, y, 1, h, shade(base, -45)); r(c, x + i + 1, y, 1, h, shade(base, 30)); }
  for (let k = 0; k < w * h * 0.04; k++) px(c, x + Math.floor(R() * w), y + Math.floor(R() * h), shade(base, -45));
}
export function timber(c: C, x: number, y: number, w: number, h: number) { // plaster + beams
  r(c, x, y, w, h, P.plaster); r(c, x, y, w, 1, P.woodD); r(c, x, y + h - 1, w, 1, P.woodD); r(c, x, y + Math.floor(h / 2), w, 1, P.woodD);
  for (let i = 0; i < w; i += 6) r(c, x + i, y, 1, h, P.woodD);
  for (let i = 0; i + 6 <= w; i += 12) for (let t = 0; t < 6 && t < h / 2; t++) px(c, x + i + t, y + t, P.woodD);
  r(c, x + w - 1, y, 1, h, P.woodD);
}
export function crenel(c: C, x: number, y: number, w: number, base = P.stone) {
  for (let i = 0; i < w; i += 4) { r(c, x + i, y, Math.min(3, w - i), 3, base); r(c, x + i, y, Math.min(3, w - i), 1, shade(base, 25)); }
}
export function gable(c: C, x: number, y: number, w: number, h: number, col: string, dark = shade(col, -45)) {
  for (let j = 0; j < h; j++) {
    const half = Math.round((w / 2) * ((j + 1) / h)), cx = x + w / 2;
    r(c, Math.floor(cx - half), y + j, half, 1, col); r(c, Math.floor(cx), y + j, half, 1, dark);
    if (j % 3 === 2) r(c, Math.floor(cx - half), y + j, half * 2, 1, shade(dark, -15));
  }
}
export function hip(c: C, x: number, y: number, w: number, h: number, col: string) { // hipped roof seen from front
  for (let j = 0; j < h; j++) { const ins = Math.round((h - j - 1) * 0.6); r(c, x + ins, y + j, w - ins * 2, 1, j % 3 === 2 ? shade(col, -40) : col); }
  r(c, x + Math.round(h * 0.6), y, w - Math.round(h * 0.6) * 2, 1, shade(col, 30));
}
export function cone(c: C, cx: number, top: number, w: number, h: number, col: string, dark = shade(col, -45), tip = P.gold) {
  for (let j = 0; j < h; j++) {
    const half = Math.max(1, Math.round((w / 2) * ((j + 1) / h)));
    r(c, cx - half, top + j, half, 1, col); r(c, cx, top + j, half, 1, dark);
    if (j % 4 === 3) r(c, cx - half, top + j, half * 2, 1, shade(dark, -15));
  }
  px(c, cx, top - 1, tip); px(c, cx, top - 2, tip);
}
export function win(c: C, x: number, y: number, lit = false, h = 3) { r(c, x, y + 1, 2, h, lit ? P.fire : P.glass); px(c, x, y, P.stoneD); px(c, x + 1, y, P.stoneD); if (lit) px(c, x, y + 1, P.fireL); }
export function door(c: C, x: number, y: number, w: number, h: number, col = P.woodD) {
  r(c, x, y + 1, w, h - 1, col); r(c, x + 1, y, w - 2, 1, col);
  for (let i = 1; i < w; i += 2) r(c, x + i, y + 1, 1, h - 1, shade(col, 25)); px(c, x + w - 2, y + Math.floor(h / 2), P.gold);
}
export function flag(c: C, x: number, y: number, col: string, f: number, len = 7) {
  r(c, x, y, 1, 12, P.woodD); px(c, x, y - 1, P.gold);
  for (let i = 0; i < len; i++) { const o = Math.round(Math.sin((i + f * 2) * 0.9) * 0.8); r(c, x + 1 + i, y + 1 + o, 1, 4, col); px(c, x + 1 + i, y + 4 + o, shade(col, -40)); }
}
export function pennant(c: C, x: number, y: number, col: string, f: number) { r(c, x, y, 1, 8, P.woodD); for (let i = 0; i < 6; i++) r(c, x + 1 + i, y + Math.round(i / 3) + (f && i > 2 ? 1 : 0), 1, Math.max(1, 3 - Math.floor(i / 2)), col); }
export const shadow = (c: C, x: number, y: number, w: number, h: number) => { c.fillStyle = 'rgba(30,20,10,.28)'; c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); c.fill(); };
export function tent(c: C, x: number, y: number, w: number, h: number, col: string) {
  for (let j = 0; j < h; j++) {
    const half = Math.round((w / 2) * ((j + 1) / h));
    r(c, x + w / 2 - half, y + j, half, 1, col); r(c, x + w / 2, y + j, half, 1, shade(col, -35));
    for (let i = -half; i < half; i += 4) px(c, x + w / 2 + i, y + j, shade(col, 22));
  }
  r(c, x + w / 2 - 1, y + h - 5, 2, 5, P.out); px(c, x + w / 2, y - 1, P.woodD); px(c, x + w / 2, y - 2, P.woodD);
}
export function fire(c: C, x: number, y: number, f: number) {
  r(c, x - 3, y + 2, 7, 2, P.woodD); r(c, x - 2, y + 1, 5, 1, P.wood);
  (f ? [2, 4, 3] : [3, 2, 4]).forEach((h, i) => { r(c, x - 1 + i, y + 1 - h, 1, h, P.fire); px(c, x - 1 + i, y + 1 - Math.max(1, h - 2), P.fireL); });
  for (let i = -5; i <= 5; i += 2) px(c, x + i, y + 3, P.stoneD);
}
export function torch(c: C, x: number, y: number, f: number) { r(c, x, y + 2, 1, 3, P.woodD); px(c, x, y + 1, P.fire); px(c, x, y + (f ? 0 : 1), P.fireL); }
export function crate(c: C, x: number, y: number) { r(c, x, y, 5, 5, P.wood); r(c, x, y, 5, 1, P.woodL); px(c, x + 1, y + 2, P.woodD); px(c, x + 3, y + 2, P.woodD); r(c, x, y + 4, 5, 1, P.woodD); }
export function barrel(c: C, x: number, y: number) { r(c, x, y, 4, 5, P.wood); r(c, x, y + 1, 4, 1, P.stoneD); r(c, x, y + 3, 4, 1, P.stoneD); r(c, x + 1, y, 2, 1, P.woodL); }
export function hay(c: C, x: number, y: number) { r(c, x, y + 1, 5, 4, P.thatch); r(c, x + 1, y, 3, 1, P.thatch); r(c, x, y + 3, 5, 1, P.thatchD); }
export function fence(c: C, x: number, y: number, w: number) { r(c, x, y + 1, w, 1, P.woodL); r(c, x, y + 3, w, 1, P.wood); for (let i = 0; i < w; i += 3) r(c, x + i, y, 1, 5, P.woodD); }
export function crops(c: C, x: number, y: number, w: number, h: number, ripe: boolean, f: number) {
  r(c, x, y, w, h, '#7a5a34');
  for (let j = 1; j < h; j += 3) for (let i = 1; i < w - 1; i++) {
    const sw = (i + f) % 4 === 0 ? 1 : 0;
    px(c, x + i, y + j, ripe ? P.gold : P.grassL); px(c, x + i + sw, y + j - 1, ripe ? P.goldD : P.grass);
  }
}
export function dummy(c: C, x: number, y: number) { r(c, x, y, 1, 10, P.woodD); r(c, x - 3, y + 3, 7, 1, P.wood); r(c, x - 1, y - 2, 3, 3, P.thatch); r(c, x - 1, y + 1, 3, 5, P.thatchD); }
export function target(c: C, x: number, y: number) {
  r(c, x - 1, y + 9, 1, 5, P.woodD); r(c, x + 1, y + 9, 1, 5, P.woodD);
  c.fillStyle = P.cloth; c.beginPath(); c.arc(x + 0.5, y + 5, 5, 0, 7); c.fill(); c.fillStyle = P.red; c.beginPath(); c.arc(x + 0.5, y + 5, 3, 0, 7); c.fill(); px(c, x, y + 5, P.gold);
}
export function awning(c: C, x: number, y: number, w: number, a: string, b: string) { for (let i = 0; i < w; i++) r(c, x + i, y, 1, 4, Math.floor(i / 2) % 2 ? a : b); for (let i = 0; i < w; i += 2) px(c, x + i, y + 4, Math.floor(i / 2) % 2 ? a : b); }
