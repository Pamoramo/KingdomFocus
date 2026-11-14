import Phaser from 'phaser';
import { type GameState, type Building, MAP_W, MAP_H, TILE, isRiver, footprint } from '../lib/state.ts';
import { BUILDINGS, CONNECTS, type BKind } from '../lib/economy.ts';
import { bTex, tileTex, waterTex, scaffoldTex, sFrame, HD, S } from './textures.ts';
import type { Art } from './art/buildings.ts';

const WW = MAP_W * TILE, WH = MAP_H * TILE;
const TILE_KINDS = new Set<BKind>(['road', 'palisade', 'wall', 'courtyard', 'moat']);
const GROUND = new Set<BKind>(['road', 'courtyard', 'moat']);
export const hashXY = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };

interface BView { img: Phaser.GameObjects.Image; key: string; b: Building; lights: Phaser.GameObjects.Image[]; art?: Art; building?: number }

/** Terrain, river, buildings, construction effects and building lights. */
export class World {
  terrain: Phaser.GameObjects.RenderTexture;
  private water: { img: Phaser.GameObjects.Image; land: number }[] = [];
  private views = new Map<string, BView>();
  private sig = '';
  private frame = 0;
  private ready = false;
  lights: Phaser.GameObjects.Image[] = [];
  smokePts: [number, number][] = [];

  constructor(private scene: Phaser.Scene) {
    this.terrain = scene.add.renderTexture(0, 0, WW * HD, WH * HD).setOrigin(0).setDepth(-10).setScale(S);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (isRiver(x, y)) {
      const land = (isRiver(x, y - 1) || y === 0 ? 0 : 1) | (isRiver(x + 1, y) ? 0 : 2) | (isRiver(x, y + 1) || y === MAP_H - 1 ? 0 : 4) | (isRiver(x - 1, y) ? 0 : 8);
      this.water.push({ img: scene.add.image(x * TILE, y * TILE, waterTex(scene, land, 0)).setOrigin(0).setDepth(-9).setScale(S), land });
    }
  }

  tick(f: number) { // called ~every 380ms: animate water and building frames
    this.frame = f;
    for (const w of this.water) w.img.setTexture(waterTex(this.scene, w.land, f % 3));
    for (const v of this.views.values()) {
      if (TILE_KINDS.has(v.b.kind)) { if (v.b.kind === 'moat') v.img.setTexture(tileTex(this.scene, 'moat', 1, +v.key.split('|')[2], f % 2)); continue; }
      if (v.building == null) v.img.setTexture(bTex(this.scene, v.b.kind, v.b.level, f % 2).key);
    }
  }

  private green(s: GameState) {
    const src: [number, number, number][] = [];
    for (const b of s.buildings) { const g = BUILDINGS[b.kind].fx(b.level).green; if (g) { const [w, h] = footprint(b.kind); src.push([b.x + w / 2, b.y + h / 2, g * (1 + (s.stage - 1) * 0.12)]); } }
    return (x: number, y: number) => {
      let g = 0; for (const [cx, cy, rad] of src) { const v = 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad; if (v > g) g = v; }
      let d = 99; for (let dx = -4; dx <= 4 && d > 0; dx++) if (isRiver(x + dx, y)) d = Math.min(d, Math.abs(dx));
      return Math.max(g, d < 99 ? (1 - d / 4.5) * (0.35 + s.stage * 0.08) : 0);
    };
  }

  drawTerrain(s: GameState) {
    const sig = s.buildings.filter((b) => !TILE_KINDS.has(b.kind) || b.kind === 'courtyard').map((b) => `${b.kind}${b.x},${b.y},${b.level}`).join('|') + s.stage;
    if (sig === this.sig) return; this.sig = sig;
    const occ = new Set<string>();
    for (const b of s.buildings) { const [w, h] = footprint(b.kind); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) occ.add(`${b.x + i},${b.y + j}`); }
    const g = this.green(s), rt = this.terrain, deco: [string, number, number][] = [];
    rt.clear(); rt.beginDraw();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const h = hashXY(x, y), v = g(x, y) + ((h % 100) / 100 - 0.5) * 0.12;
      const kind = v > 0.7 ? 'lush' : v > 0.32 ? 'grass' : v > 0.12 ? 'mix' : (h >>> 4) % 3 === 0 ? 'cracked' : 'dirt';
      rt.batchDraw(`t_${kind}${h % 4}`, x * TILE * HD, y * TILE * HD);
      if (occ.has(`${x},${y}`) || isRiver(x, y)) continue;
      const p = (h >>> 8) % 1000, edge = x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2, green = kind === 'grass' || kind === 'lush';
      const nearRiver = isRiver(x - 1, y) || isRiver(x + 1, y);
      let d: string | null = null;
      if (edge && p < 650) d = green || nearRiver ? 'pine' : 'deadtree';
      else if (nearRiver && p < 300) d = 'reeds';
      else if (green) d = p < 40 ? 'tree' : p < 55 ? 'bush' : p < 120 ? 'flowers' : null;
      else d = p < 22 ? 'rock' : p < 30 ? 'boulder' : p < 58 ? 'deadbush' : p < 66 ? 'deadtree' : p < 70 ? 'stump' : null;
      if (d) deco.push([`d_${d}${h % 2}`, x, y]);
    }
    for (const [k, x, y] of deco) rt.batchDraw(k, x * TILE * HD, (y * TILE - 8) * HD);
    rt.endDraw();
  }

  /** Occupancy for wall/palisade auto-connection. */
  private occupancy(s: GameState) {
    const m = new Map<string, BKind>();
    for (const b of s.buildings) { const [w, h] = footprint(b.kind); for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) m.set(`${b.x + i},${b.y + j}`, b.kind); }
    return m;
  }

  syncBuildings(s: GameState) {
    const occ = this.occupancy(s), seen = new Set<string>(), now = Date.now();
    const maskFor = (b: Building, ok: (k?: BKind) => boolean) => [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].reduce((m, [dx, dy, bit]) => (ok(occ.get(`${b.x + dx},${b.y + dy}`)) ? m | bit : m), 0);
    this.smokePts = [];
    for (const b of s.buildings) {
      seen.add(b.id);
      const [w, h] = footprint(b.kind), tile = TILE_KINDS.has(b.kind);
      let key: string, tex: string, art: Art | undefined;
      if (tile) {
        const bridge = b.kind === 'road' && isRiver(b.x, b.y);
        const mask = b.kind === 'wall' || b.kind === 'palisade' ? maskFor(b, (k) => !!k && CONNECTS.includes(k)) : maskFor(b, (k) => k === b.kind);
        key = `${b.kind}|${b.level}|${mask}|${bridge}`; tex = tileTex(this.scene, b.kind as 'road', b.level, mask, 0, bridge);
      } else { const t = bTex(this.scene, b.kind, b.level, this.frame % 2); key = `${b.kind}|${b.level}`; tex = t.key; art = t.art; }
      let v = this.views.get(b.id);
      const fresh = !v;
      if (!v) { v = { img: this.scene.add.image(0, 0, tex).setOrigin(0, 1).setScale(S), key: '', b, lights: [] }; this.views.set(b.id, v); }
      const changed = v.key !== key;
      v.b = b; v.art = art;
      const by = (b.y + h) * TILE;
      v.img.setPosition(b.x * TILE, by).setDepth(GROUND.has(b.kind) ? (b.kind === 'road' && isRiver(b.x, b.y) ? -8 : -6) : by).setData('id', b.id);
      if (changed) {
        const prevLevel = v.key ? +v.key.split('|')[1] : 0;
        v.key = key; v.img.setTexture(tex);
        const recent = now - b.at < 4000 && this.ready;
        if (recent && !tile) this.construct(v, w, h, fresh || b.level > prevLevel);
        else if (recent) this.scene.tweens.add({ targets: v.img, scaleY: { from: 0.3, to: 1 }, duration: 260, ease: 'Back.Out' });
        // lights
        v.lights.forEach((l) => l.destroy()); v.lights = [];
        for (const [lx, ly] of art?.lights ?? []) v.lights.push(this.scene.add.image(b.x * TILE + lx, by - v.img.displayHeight + ly, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(25000).setScale(0.35).setAlpha(0));
      }
      for (const [sx, sy] of art?.smoke ?? []) this.smokePts.push([b.x * TILE + sx, by - v.img.displayHeight + sy]);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.img.destroy(); v.lights.forEach((l) => l.destroy()); this.views.delete(id); }
    this.lights = [...this.views.values()].flatMap((v) => v.lights);
    this.ready = true;
  }

  /** Scaffolding, rising building, hammering workers and dust. Purely visual (no waiting timers). */
  private construct(v: BView, w: number, h: number, rise: boolean) {
    const sc = this.scene, img = v.img, H = img.height, W = img.displayWidth, x = img.x, y = img.y;
    const scaff = sc.add.image(x, y, scaffoldTex(sc, v.b.kind)).setOrigin(0, 1).setDepth(img.depth + 1).setScale(S);
    const workers = [0, 1].map((i) => sc.add.image(x + (i ? W - 4 : 4), y + 2, 'soldiers', sFrame('worker', 0, 4)).setOrigin(0.5, 1).setDepth(img.depth + 2).setFlipX(!!i).setScale(S * 0.75));
    v.building = 1;
    const prog = { p: rise ? 0 : 0.6 };
    sc.tweens.add({ targets: prog, p: 1, duration: 2400, ease: 'Sine.InOut',
      onUpdate: () => { const ph = Math.floor(H * prog.p); img.setCrop(0, H - ph, img.width, ph); workers.forEach((wk, i) => wk.setFrame(sFrame('worker', 0, (Math.floor(sc.time.now / 160) + i) % 2 ? 4 : 5))); },
      onComplete: () => { img.setCrop(); scaff.destroy(); workers.forEach((wk) => wk.destroy()); v.building = undefined; this.dust(x + W / 2, y - 6, 30); } });
    const t = sc.time.addEvent({ delay: 300, repeat: 7, callback: () => this.dust(x + Math.random() * W, y - Math.random() * 10, 6) });
    void t; void h; void w;
  }
  dust(x: number, y: number, n: number) {
    const e = this.scene.add.particles(x, y, 'px', { speed: { min: 10, max: 50 }, lifespan: 700, quantity: n, scale: { start: 2, end: 0 }, tint: [0xcdb48a, 0xa08a6a, 0xe0d0b0], emitting: false }).setDepth(9600);
    e.explode(n); this.scene.time.delayedCall(900, () => e.destroy());
  }
  buildingAt(tx: number, ty: number, s: GameState) {
    return [...s.buildings].reverse().find((q) => { const [w, h] = footprint(q.kind); return tx >= q.x && tx < q.x + w && ty >= q.y && ty < q.y + h; });
  }
  doorOf(b: Building) { const [w, h] = footprint(b.kind); return { x: (b.x + w / 2) * TILE, y: (b.y + h) * TILE + 2 }; }
}
