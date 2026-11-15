// Siege engines, siege camp tents and the procedurally generated world map.
import { type C, P, r, px, canvas, outline, shade, rng, planks, stoneBlock, crenel, tent } from './px.ts';
import type { Engine } from '../../lib/war.ts';

export function engineArt(kind: Engine, f = 0): HTMLCanvasElement {
  const [cv, c] = canvas(40, 40);
  const wheel = (x: number, y: number, rad = 3) => { c.fillStyle = P.woodD; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); c.fillStyle = P.wood; c.beginPath(); c.arc(x, y, rad - 1.5, 0, 7); c.fill(); px(c, x, y, P.stoneD); };
  const beam = (x0: number, y0: number, x1: number, y1: number, col: string, w = 2) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) r(c, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, w, w, col); };
  switch (kind) {
    case 'ram': planks(c, 4, 22, 30, 8, 3); for (let i = 0; i < 6; i++) r(c, 4 + i * 5, 14 + Math.abs(3 - i), 6, 9 - Math.abs(3 - i), i % 2 ? P.thatchD : P.thatch);
      r(c, 2 + (f ? 2 : 0), 26, 34, 3, P.woodL); r(c, 34 + (f ? 2 : 0), 25, 4, 5, P.stoneD); wheel(9, 33); wheel(29, 33); break;
    case 'tower': planks(c, 10, 4, 20, 30, 5); for (let y = 6; y < 32; y += 8) r(c, 10, y, 20, 1, P.woodD); r(c, 9, 2, 22, 3, P.woodD); r(c, 14, 8, 12, 6, '#7a5a3a'); r(c, 28, 10, 8, 2, P.wood); wheel(13, 35); wheel(27, 35); break;
    case 'mangonel': planks(c, 6, 28, 28, 5, 4); r(c, 18, 20, 3, 9, P.woodD); beam(20, 24, f ? 30 : 34, f ? 6 : 12, P.woodL); r(c, f ? 28 : 32, f ? 4 : 10, 5, 4, P.stone); wheel(10, 35); wheel(30, 35); break;
    case 'ballista': r(c, 8, 28, 24, 4, P.wood); r(c, 18, 18, 3, 11, P.woodD); r(c, 10, 18, 22, 3, P.wood); beam(10, 18, 6, 10, P.woodL, 1); beam(10, 20, 6, 28, P.woodL, 1); r(c, 6, 10, 1, 18, P.cloth); r(c, 12, 18, 22, 1, P.stoneL); wheel(11, 34); wheel(29, 34); break;
    case 'trebuchet': for (const x of [10, 26]) beam(x, 36, 18, 8, P.woodD); r(c, 6, 34, 28, 3, P.wood); beam(18, 9, f ? 4 : 34, f ? 2 : 2, P.woodL); beam(18, 9, f ? 26 : 8, f ? 18 : 18, P.woodL);
      r(c, f ? 23 : 5, f ? 18 : 18, 7, 7, P.stoneD); r(c, f ? 24 : 6, f ? 19 : 19, 5, 2, P.stone); r(c, 16, 7, 5, 4, P.stoneD); break;
  }
  outline(cv); return cv;
}
export function siegeCamp(): HTMLCanvasElement {
  const [cv, c] = canvas(56, 36);
  tent(c, 2, 12, 18, 16, '#d9cfb0'); tent(c, 22, 8, 20, 20, P.red); tent(c, 38, 14, 16, 14, '#c9c2a8');
  r(c, 22, 30, 12, 2, P.woodD); r(c, 26, 27, 3, 3, P.fire); px(c, 27, 26, P.fireL);
  outline(cv); return cv;
}

// ---------------- world map ----------------
/** The world map in pixels: 2.6 times the old 320x208 home region (see WORLD_SCALE). */
export const MAP_PW = 832, MAP_PH = 540;
function valueNoise(seed: number, G = 16) {
  const R = rng(seed), grid = Array.from({ length: (G + 1) * (G + 1) }, () => R());
  const at = (x: number, y: number) => grid[Math.min(G, y) * (G + 1) + Math.min(G, x)];
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => { const x = u * G, y = v * G, x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx, b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx; return a + (b - a) * fy; };
}
/** A painted pixel continent with sea, beaches, plains, forests, hills, snowy peaks, rivers and roads. */
export function worldMap(seed: number, sites: { x: number; y: number }[]): HTMLCanvasElement {
  const [cv, c] = canvas(MAP_PW, MAP_PH), n1 = valueNoise(seed, 30), n2 = valueNoise(seed + 9, 40), n3 = valueNoise(seed + 77, 40), R = rng(seed + 5); // finer grids: features stay the same size on a bigger map
  const img = c.createImageData(MAP_PW, MAP_PH), d = img.data;
  const hexc = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  // elevation: mostly lowland, hills and a few snowy peaks; sea at the rim
  const elev = (x: number, y: number) => { const u = x / MAP_PW, v = y / MAP_PH, edge = Math.hypot((u - 0.5) * 1.15, (v - 0.5) * 1.35); return (n1(u, v) * 0.6 + n2(u * 2 % 1, v * 2 % 1) * 0.25) * 0.7 + 0.31 - edge * 0.55; };
  for (let y = 0; y < MAP_PH; y++) for (let x = 0; x < MAP_PW; x++) {
    let e = elev(x, y); for (const s of sites) { const dd = Math.hypot(x - s.x * MAP_PW, y - s.y * MAP_PH); if (dd < 26) e = Math.max(e, 0.5 - dd * 0.003); }
    const f = n3(x / MAP_PW, y / MAP_PH), dith = ((x + y) % 2) * 0.012;
    let col: string;
    if (e < 0.32) col = e < 0.22 ? '#1f4a7a' : e < 0.28 ? '#2a5e94' : '#3a78b0';
    else if (e < 0.35 + dith) col = '#d9c08a';
    else if (e > 0.8) col = e > 0.93 ? '#f0f0f4' : '#8a8680';
    else if (e > 0.68) col = '#7a8a5a';
    else if (f > 0.6) col = (x * 7 + y * 3) % 5 === 0 ? '#2b5a1f' : '#3f7d2c';
    else col = e > 0.55 ? '#6a9a40' : '#5d9a3b';
    const [rr, gg, bb] = hexc(col), i = (y * MAP_PW + x) * 4, jit = (R() - 0.5) * 10;
    d[i] = rr + jit; d[i + 1] = gg + jit; d[i + 2] = bb + jit; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  // trees and peaks as tiny glyphs
  for (let k = 0; k < 6000; k++) {
    const x = Math.floor(R() * MAP_PW), y = Math.floor(R() * MAP_PH), e = elev(x, y), f = n3(x / MAP_PW, y / MAP_PH);
    if (e > 0.4 && e < 0.68 && f > 0.6) { r(c, x, y - 2, 2, 2, '#2b5a1f'); px(c, x, y - 3, '#4a8a34'); px(c, x, y, '#4a2e16'); }
    else if (e > 0.72 && e < 0.93 && k % 3 === 0) { for (let j = 0; j < 4; j++) r(c, x - j, y + j, j * 2 + 1, 1, j < 1 ? '#ffffff' : '#6e6a64'); }
  }
  // rivers flow from hills to the sea
  for (let k = 0; k < 11; k++) {
    let x = MAP_PW * (0.15 + R() * 0.7), y = MAP_PH * (0.15 + R() * 0.7);
    for (let s = 0; s < 520 && elev(Math.round(x), Math.round(y)) > 0.32; s++) { r(c, x, y, 2, 1, '#4a8ac8'); const a = Math.atan2(y - MAP_PH / 2, x - MAP_PW / 2) + (R() - 0.5) * 1.2; x += Math.cos(a); y += Math.sin(a); }
  }
  // roads from the heart of the realm to every site
  // each realm's road joins the nearest realm closer to the heart of the map, so roads branch outward like a real network
  const home = sites[0], dc = (p: { x: number; y: number }) => Math.hypot(p.x - home.x, p.y - home.y);
  for (const s of sites.slice(1)) { const prev = sites.filter((q) => q !== s && dc(q) < dc(s)).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0] ?? home;
    const x0 = prev.x * MAP_PW, y0 = prev.y * MAP_PH, x1 = s.x * MAP_PW, y1 = s.y * MAP_PH, n = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 0; i < n; i += 1) { if (i % 6 > 3) continue; const t = i / n, wob = Math.sin(t * 9 + s.x * 20) * 3; px(c, x0 + (x1 - x0) * t + wob * 0.3, y0 + (y1 - y0) * t + wob, '#a8824a'); } }
  return cv;
}
export function castleIcon(level: number, color: string): HTMLCanvasElement {
  const [cv, c] = canvas(28, 30);
  const w = 10 + level * 3, x = 14 - Math.floor(w / 2), h = 8 + level * 2;
  stoneBlock(c, x, 28 - h, w, h, P.stone, level); crenel(c, x, 25 - h, w);
  for (const tx of [x - 2, x + w - 3]) { stoneBlock(c, tx, 26 - h - 4, 5, h + 6, P.stoneL, tx); crenel(c, tx, 23 - h - 4, 5); }
  r(c, 12, 22, 4, 6, P.out); r(c, 13, 28 - h - 10, 1, 9, P.woodD); r(c, 14, 28 - h - 10, 5, 3, color); r(c, 14, 28 - h - 8, 5, 1, shade(color, -40));
  outline(cv); return cv;
}
export { type C };
