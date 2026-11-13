// 16-bit style post-processing: everything is generated at 1x logic, then rendered at 2x with
// smoothed diagonals (EPX), surface grain, rim lighting and soft coloured outlines.
import { canvas } from './px.ts';

export const HD = 2;

type Img = { d: Uint8ClampedArray; w: number; h: number };
const read = (cv: HTMLCanvasElement, x = 0, y = 0, w = cv.width, h = cv.height): Img => ({ d: cv.getContext('2d')!.getImageData(x, y, w, h).data, w, h });
const write = (cv: HTMLCanvasElement, im: Img, x = 0, y = 0) => { const c = cv.getContext('2d')!; const id = c.createImageData(im.w, im.h); id.data.set(im.d); c.putImageData(id, x, y); };

/** EPX / Scale2x: doubles resolution while rounding off stair-step diagonals. */
export function scale2x(src: HTMLCanvasElement): HTMLCanvasElement {
  const { d, w, h } = read(src), u = new Uint32Array(d.buffer.slice(0));
  const [out] = canvas(w * 2, h * 2), o = new Uint32Array(w * 2 * h * 2);
  const at = (x: number, y: number) => u[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    const i = y * 2 * w * 2 + x * 2, W = w * 2;
    o[i] = C === A && C !== D && A !== B ? A : P;
    o[i + 1] = A === B && A !== C && B !== D ? B : P;
    o[i + W] = D === C && D !== B && C !== A ? C : P;
    o[i + W + 1] = B === D && B !== A && D !== C ? D : P;
  }
  write(out, { d: new Uint8ClampedArray(o.buffer), w: w * 2, h: h * 2 });
  return out;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
/** Fine per-pixel grain on opaque pixels; makes flat areas read as textured material. */
export function grain(cv: HTMLCanvasElement, amount = 6, seed = 7, x0 = 0, y0 = 0, w = cv.width, h = cv.height) {
  const im = read(cv, x0, y0, w, h), d = im.d; let s = seed >>> 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    s = (s * 1664525 + 1013904223) >>> 0; const n = ((s >>> 24) / 255 - 0.5) * 2 * amount;
    d[i] = clamp(d[i] + n); d[i + 1] = clamp(d[i + 1] + n); d[i + 2] = clamp(d[i + 2] + n * 0.9);
  }
  write(cv, im, x0, y0);
}
/** Light from the top-left: lit rim on upper/left edges, shadowed rim on lower/right edges. */
export function rimLight(cv: HTMLCanvasElement, x0 = 0, y0 = 0, w = cv.width, h = cv.height, lit = 26, dark = 30) {
  const im = read(cv, x0, y0, w, h), d = im.d, src = new Uint8ClampedArray(d);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (src[i + 3] < 200) continue;
    const L = a(x - 1, y) < 100 || a(x, y - 1) < 100, R = a(x + 1, y) < 100 || a(x, y + 1) < 100;
    const k = L && !R ? lit : R && !L ? -dark : 0;
    if (k) { d[i] = clamp(src[i] + k); d[i + 1] = clamp(src[i + 1] + k); d[i + 2] = clamp(src[i + 2] + k * 0.9); }
  }
  write(cv, im, x0, y0);
}
/** Soft coloured outline: each edge pixel takes a darkened tint of the sprite colour it borders. */
export function softOutline(cv: HTMLCanvasElement, x0 = 0, y0 = 0, w = cv.width, h = cv.height) {
  const im = read(cv, x0, y0, w, h), d = im.d, src = new Uint8ClampedArray(d);
  const a = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (src[i + 3] > 40) continue;
    let n = -1;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (a(x + dx, y + dy) > 200) { n = ((y + dy) * w + x + dx) * 4; break; }
    if (n < 0) continue;
    const k = 0.32; d[i] = 22 + src[n] * k * 0.5; d[i + 1] = 16 + src[n + 1] * k * 0.5; d[i + 2] = 14 + src[n + 2] * k * 0.5; d[i + 3] = 255;
  }
  write(cv, im, x0, y0);
}
/** Full pipeline for a 1x canvas drawn without outlines. */
export function hdify(cv: HTMLCanvasElement, opt: { grain?: number; rim?: boolean; outline?: boolean; seed?: number } = {}): HTMLCanvasElement {
  const out = scale2x(cv);
  if (opt.grain ?? 5) grain(out, opt.grain ?? 5, opt.seed ?? 7);
  if (opt.rim ?? true) rimLight(out);
  if (opt.outline ?? true) softOutline(out);
  return out;
}
