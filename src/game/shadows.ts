// Cast shadows. The sprites are painted lit from the upper left, so every building, wall, tree and rock throws a
// shadow across the ground to the lower right: its own silhouette, sheared and laid flat. The sun sets the length
// (long at dawn and dusk, short at midday) and the strength (crisp in sunshine, faint under cloud, a ghost by moonlight).
// Townsfolk and soldiers stand on soft contact shadows.
import Phaser from 'phaser';
import type { Weather } from './weather.ts';

export interface Sun { len: number; alpha: number }
/** Below every standing sprite (their depth is their y), above roads, streets and bridges. */
export const SHADOW_DEPTH = -4, FOOT_DEPTH = -3;

/** The sun for a time-of-day setting ('day', 'night' or 'auto' by the clock) and the weather. */
export function sunNow(mode: string, weather: Weather | null = 'clear', d = new Date()): Sun {
  let len = 1, alpha = 0.3;
  if (mode === 'night') { len = 0.7; alpha = 0.08; }
  else if (mode === 'auto') {
    const h = d.getHours() + d.getMinutes() / 60;
    if (h < 5.5 || h >= 20.5) { len = 0.7; alpha = 0.08; } // moonlight
    else { const e = Math.max(0, Math.sin((Math.PI * (h - 5.5)) / 15)); len = 0.65 + 1.1 * (1 - e) ** 2; alpha = 0.12 + 0.2 * Math.min(1, e * 2.2); }
  }
  const dim = weather === 'storm' ? 0.25 : weather === 'rain' || weather === 'fog' ? 0.35 : weather === 'snow' ? 0.5 : weather === 'cloudy' ? 0.6 : 1;
  return { len: Math.round(len * 10) / 10, alpha: Math.round(alpha * dim * 100) / 100 };
}

/** The silhouette of a texture laid on the ground: a point `h` pixels above the base lands h·0.55·len to the right
 *  and h·0.3·len below it. The baked soft ground shadow in the art (faint pixels) is left out. */
export function shadowTex(scene: Phaser.Scene, key: string, len: number): string | null {
  const sk = `${key}|sh${len}`; if (scene.textures.exists(sk)) return sk;
  if (!scene.textures.exists(key)) return null;
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement | HTMLImageElement, w = src.width, h = src.height;
  if (!w || !h) return null;
  const sil = document.createElement('canvas'); sil.width = w; sil.height = h; const sc = sil.getContext('2d')!; sc.drawImage(src, 0, 0);
  const id = sc.getImageData(0, 0, w, h), px = id.data;
  for (let i = 0; i < px.length; i += 4) { const solid = px[i + 3] > 150; px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = solid ? 255 : 0; }
  sc.putImageData(id, 0, 0);
  const shx = 0.55 * len, shy = 0.3 * len, out = document.createElement('canvas');
  out.width = Math.ceil(w + h * shx) + 2; out.height = Math.ceil(h * shy) + 2;
  const c = out.getContext('2d')!; c.imageSmoothingEnabled = false;
  c.setTransform(1, 0, -shx, -shy, h * shx, h * shy); c.drawImage(sil, 0, 0);
  scene.textures.addCanvas(sk, out);
  return sk;
}

/** Keeps a shadow under each registered sprite (origin anywhere), following its texture, position and visibility. */
export class ShadowLayer {
  sun: Sun = { len: 1, alpha: 0.3 };
  private casters = new Map<Phaser.GameObjects.Image, { sh: Phaser.GameObjects.Image; key: string; base?: string }>();
  constructor(private scene: Phaser.Scene, private depth = SHADOW_DEPTH) {}
  /** `base` names the texture to cast from (e.g. an animated building's first frame); defaults to the sprite's own. */
  attach(img: Phaser.GameObjects.Image, base?: string) {
    let c = this.casters.get(img);
    if (!c) { c = { sh: this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(this.depth), key: '' }; this.casters.set(img, c); }
    c.base = base; this.place(img, c);
  }
  detach(img: Phaser.GameObjects.Image) { const c = this.casters.get(img); if (c) { c.sh.destroy(); this.casters.delete(img); } }
  private place(img: Phaser.GameObjects.Image, c: { sh: Phaser.GameObjects.Image; key: string; base?: string }) {
    const key = c.base ?? img.texture.key, tex = this.sun.alpha > 0.02 ? shadowTex(this.scene, key, this.sun.len) : null;
    if (!tex) { c.sh.setVisible(false); return; }
    if (c.key !== tex) { c.sh.setTexture(tex); c.key = tex; }
    const left = img.x - img.displayWidth * img.originX, base = img.y + img.displayHeight * (1 - img.originY);
    c.sh.setPosition(left, base).setScale(Math.abs(img.scaleX)) /* not scaleY: a building rising out of its scaffold still throws its whole shadow */.setAlpha(this.sun.alpha).setVisible(img.visible && img.alpha > 0.3);
  }
  /** Follow the casters (call after they move, or now and then); drops shadows of destroyed sprites. */
  sync() { for (const [img, c] of this.casters) { if (!img.active) { c.sh.destroy(); this.casters.delete(img); continue; } this.place(img, c); } }
  setSun(sun: Sun) { if (sun.len === this.sun.len && sun.alpha === this.sun.alpha) return; this.sun = sun; this.sync(); }
  destroy() { for (const c of this.casters.values()) c.sh.destroy(); this.casters.clear(); }
}

/** Soft contact shadows under everyone drawn from the soldier sheet (townsfolk, soldiers, workers), redrawn each frame. */
export class FootShadows {
  private g: Phaser.GameObjects.Graphics;
  constructor(private scene: Phaser.Scene) { this.g = scene.add.graphics().setDepth(FOOT_DEPTH); }
  /** `more` adds feet the scene draws some other way (e.g. soldiers in a battalion's blitter). */
  draw(sun: Sun, more?: (foot: (x: number, y: number, w: number) => void) => void) {
    const g = this.g, view = this.scene.cameras.main.worldView; g.clear();
    if (sun.alpha <= 0.02) return;
    const a = Math.min(0.32, sun.alpha + 0.08), off = 1 + sun.len * 1.2;
    g.fillStyle(0x000000, a);
    for (const o of this.scene.children.list) {
      const s = o as Phaser.GameObjects.Image;
      if (s.type !== 'Image' || !s.visible || s.alpha < 0.5 || s.texture?.key !== 'soldiers' || s.angle !== 0) continue;
      if (s.x < view.x - 20 || s.x > view.right + 20 || s.y < view.y - 10 || s.y > view.bottom + 30) continue;
      const w = s.displayWidth * 0.5;
      g.fillEllipse(s.x + off, s.y - 1, w, w * 0.32);
    }
    more?.((x, y, w) => { if (x > view.x - 20 && x < view.right + 20 && y > view.y - 10 && y < view.bottom + 30) g.fillEllipse(x + off, y - 1, w, w * 0.32); });
  }
  destroy() { this.g.destroy(); }
}
