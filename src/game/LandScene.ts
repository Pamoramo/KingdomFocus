// A land up close: one of the settlement sites round your castle or along the roads. Unclaimed, it is open country
// with a signpost by the road; settled, it shows what was built there, growing with its level (a farming village,
// a lumber camp in the woods, a quarry, a trading post, an abbey), with its people at work.
import Phaser from 'phaser';
import { getState, subscribe, TILE, footprint, type GameState } from '../lib/state.ts';
import { biomeOf, type Biome } from '../lib/realms.ts';
import { sitesFor, SETTLE, type Site } from '../lib/expansion.ts';
import type { BKind } from '../lib/economy.ts';
import { biomeTile, plant, rubble, church, stall, mineEntrance, wagon, BIOME_PLANTS, BIOME_DENSITY } from './art/biome.ts';
import { hdify, HD } from './art/hd.ts';
import { withoutOutline } from './art/px.ts';
import { bTex, tileTex, sFrame, bannerTex, S } from './textures.ts';
import { Chatter } from './chatter.ts';
import { setUI } from './ui.ts';
import { NavGrid, follow, type Pt } from './paths.ts';
import { WeatherFx, weatherAt, biomeWeather } from './weather.ts';
import { nightFactor } from './KingdomScene.ts';
import { ShadowLayer, FootShadows, shadowTex, sunNow } from './shadows.ts';

const LW = 44, LH = 30, WW = LW * TILE, WH = LH * TILE;
const hashXY = (x: number, y: number, k: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + k) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
interface Walker { img: Phaser.GameObjects.Image; x: number; y: number; cls: string; path?: Pt[]; wait: number; work?: Pt; ph: number; road?: boolean }
const LINES: Record<Site['kind'], string[]> = {
  village: ['The harvest looks good.', 'Long live the crown!', 'Our own well, at last.', 'The lord\'s men keep us safe.'],
  lumber: ['Timber!', 'Mind the saw.', 'Another cart for the castle.', 'These oaks are older than the king.'],
  mine: ['Good stone in this seam.', 'Watch the rockfall!', 'My back aches.', 'Another load for the masons.'],
  market: ['Silks from the south!', 'Fair prices, honest weights!', 'Caravans every week now.', 'Spices! Fresh spices!'],
  abbey: ['Peace be with you.', 'The bells ring for vespers.', 'We pray for the realm.', 'Brother, the bees are swarming.'],
};

export class LandScene extends Phaser.Scene {
  private site!: Site; private biome: Biome = 'grassland'; private level = 0;
  private occ = new Set<string>(); private walkers: Walker[] = []; private nav = new NavGrid(LW, LH); private doors: Pt[] = []; private works: Pt[] = [];
  private chatter!: Chatter; private weather!: WeatherFx; private shade!: Phaser.GameObjects.Rectangle; private shadows!: ShadowLayer; private feet!: FootShadows;
  private drag: { x: number; y: number; sx: number; sy: number } | null = null; private unsub: (() => void)[] = []; private sig = '';
  constructor() { super('land'); }
  init(data: { id: string }) { const s = getState(); this.site = sitesFor(s.world.seed, s.world.rivals).find((x) => x.id === data.id)!; this.walkers = []; this.occ = new Set(); this.doors = []; this.works = []; }

  create() {
    if (!this.site) { setUI({ view: 'world', visit: null }); return; } // a land that no longer exists
    const s = getState(), road = this.site.road ? s.world.rivals.find((r) => r.id === this.site.road) : null;
    this.biome = road ? biomeOf(s.world, road) : 'grassland';
    this.level = (s.world.settlements ?? []).find((x) => x.site === this.site.id)?.level ?? 0; this.sig = `${this.level}`;
    this.shadows = new ShadowLayer(this); this.shadows.sun = sunNow(s.settings.dayNight, biomeWeather(this.biome, weatherAt())); this.feet = new FootShadows(this);
    this.textures_(); this.lay(); this.people();
    this.chatter = new Chatter(this); this.weather = new WeatherFx(this, WW, WH);
    this.shade = this.add.rectangle(-WW, -WH, WW * 3, WH * 3, 0xffffff).setOrigin(0).setDepth(20000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const cam = this.cameras.main;
    cam.setBounds(-WW * 0.1, -WH * 0.1, WW * 1.2, WH * 1.2).setRoundPixels(true).setBackgroundColor('#2b2118');
    cam.setZoom(Phaser.Math.Clamp(this.scale.width / 520, 0.8, 3)); cam.centerOn(WW / 2, WH / 2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (this.drag && p.isDown) cam.setScroll(this.drag.sx - (p.x - this.drag.x) / cam.zoom, this.drag.sy - (p.y - this.drag.y) / cam.zoom); });
    this.input.on('pointerup', () => { this.drag = null; });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), 0.6, 5)));
    const wx = () => this.weather.set(biomeWeather(this.biome, weatherAt())); wx(); this.time.addEvent({ delay: 30000, loop: true, callback: wx });
    this.night(); this.time.addEvent({ delay: 20000, loop: true, callback: () => this.night() });
    this.time.addEvent({ delay: 7000, loop: true, callback: () => this.chat() });
    // founded or grown while you watch: build it again
    this.unsub.push(subscribe(() => { const lv = (getState().world.settlements ?? []).find((x) => x.site === this.site.id)?.level ?? 0; if (`${lv}` !== this.sig) this.scene.restart({ id: this.site.id }); }));
    this.events.once('shutdown', () => { this.unsub.forEach((u) => u()); this.unsub = []; });
  }

  private textures_() {
    const T = this.textures, b = this.biome, once = (k: string, draw: () => HTMLCanvasElement, opt = { grain: 3 }) => { if (!T.exists(k)) T.addCanvas(k, hdify(withoutOutline(draw), opt)); };
    for (let v = 0; v < 4; v++) { const k = `bt_${b}${v}`; if (!T.exists(k)) T.addCanvas(k, hdify(biomeTile(b, v), { rim: false, outline: false, grain: 6, seed: v })); }
    BIOME_PLANTS[b].forEach((p, i) => { for (const sd of [0, 1]) { const k = `bp_${p}${sd}`; if (!T.exists(k)) T.addCanvas(k, hdify(withoutOutline(() => plant(p, sd + i * 3)), { seed: sd })); } });
    once('church', church); for (let i = 0; i < 4; i++) once(`stall${i}`, () => stall(i)); for (let i = 0; i < 3; i++) once(`rubble${i}`, () => rubble(i * 7 + 1));
    once('mine', mineEntrance); for (const f of [0, 1]) once(`wagon${f}`, () => wagon(f));
  }

  /** Lays out the land: the road through it, then what stands there (by kind and level), then the countryside. */
  private lay() {
    const site = this.site, L = this.level, kind = site.kind, R = (() => { let h = hashXY(site.x * 1e4, site.y * 1e4, 7); return () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const ph = R() * 6, roadY = (x: number) => 16 + Math.round(Math.sin(x / 7 + ph) * 1.5), road = new Set<string>();
    for (let x = 0; x < LW; x++) { const y = roadY(x); for (const dy of [0, 1]) road.add(`${x},${y + dy}`); if (x && roadY(x - 1) !== y) { road.add(`${x},${roadY(x - 1)}`); road.add(`${x},${roadY(x - 1) + 1}`); } }
    for (const k of road) this.occ.add(k);
    const blocked: Pt[] = [];
    const put = (k: BKind, x: number, y: number, lv: number) => {
      const [w, h] = footprint(k); for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) if (this.occ.has(`${x + i},${y + j}`) || x < 1 || y < 1 || x + w > LW - 1 || y + h > LH - 1) return false;
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { this.occ.add(`${x + i},${y + j}`); blocked.push({ x: x + i, y: y + j }); }
      const by = (y + h) * TILE, img = this.add.image(x * TILE, by, bTex(this, k, lv, 0).key).setOrigin(0, 1).setScale(S).setDepth(by); this.tint(img);
      if (k !== 'farm') this.shadows.attach(img); this.doors.push({ x: (x + w / 2) * TILE, y: by + 4 }); return true;
    };
    const near = (k: BKind, lv: number, n: number, cx: number, cy: number, spread = 9) => { let done = 0; for (let t = 0; t < 400 && done < n; t++) { const a = R() * Math.PI * 2, d = 2 + R() * spread * (0.4 + t / 400); if (put(k, Math.round(cx + Math.cos(a) * d * 1.4), Math.round(cy + Math.sin(a) * d), lv)) done++; } };
    const mark = (key: string, x: number, y: number, w = 1, h = 1) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { this.occ.add(`${x + i},${y + j}`); blocked.push({ x: x + i, y: y + j }); } const img = this.add.image(x * TILE, (y + h) * TILE, key).setOrigin(0, 1).setScale(S).setDepth((y + h) * TILE); this.tint(img); this.shadows.attach(img); return img; };
    const cx = 22, cy = 10, lv = (n: number) => Math.min(3, n);
    if (L) {
      if (kind === 'village') { near('house', lv(L), 2 + L * 2, cx, cy); near('farm', lv(L), L + 1, cx, 23, 10); if (L >= 2) near('well', 1, 1, cx, cy, 3); if (L >= 2) near('tavern', 1, 1, cx, cy, 5); if (L >= 3) near('market', 1, 1, cx, cy, 4); }
      if (kind === 'lumber') { near('hut', lv(L), L + 1, cx, cy, 6); if (L >= 2) near('storehouse', 1, 1, cx, cy, 5); for (let i = 0; i < 2 + L; i++) { const x = cx - 6 + i * 4, y = 12 + (i % 2); if (!this.occ.has(`${x},${y}`)) { mark(`wagon${i % 2}`, x, y); this.works.push({ x: (x + 0.5) * TILE, y: (y + 1.6) * TILE }); } } }
      if (kind === 'mine') { const qx = 8, qy = 4; this.add.rectangle(qx * TILE, qy * TILE, 12 * TILE, 8 * TILE, 0x8a8278, 0.55).setOrigin(0).setDepth(-5); mark('mine', qx + 4, qy + 1, 2, 2);
        for (let i = 0; i < 3 + L * 2; i++) { const x = qx + 1 + ((i * 5) % 10), y = qy + 3 + ((i * 3) % 4); if (!this.occ.has(`${x},${y}`)) { mark(`rubble${i % 3}`, x, y); this.works.push({ x: (x + 0.5) * TILE, y: (y + 1.7) * TILE }); } }
        near('hut', 1, L, cx + 6, cy, 6); if (L >= 2) near('storehouse', 1, 1, cx + 6, cy, 5); if (L >= 3) near('blacksmith', 2, 1, cx + 6, cy, 6); }
      if (kind === 'market') { near('market', lv(L), 1, cx, cy, 2); near('house', lv(L), 2 + L * 2, cx, cy); if (L >= 2) near('tavern', lv(L), 1, cx, cy, 6); near('well', 1, 1, cx, cy, 5); for (let i = 0; i < 2 + L; i++) { const x = cx - 4 + i * 3, y = 13; if (!this.occ.has(`${x},${y}`)) mark(`stall${i % 4}`, x, y); } }
      if (kind === 'abbey') { mark('church', cx - 1, cy - 2, 3, 4); if (L >= 2) near('greathall', 1, 1, cx, cy, 6); near('house', 1, L, cx, cy, 8); near('farm', 1, L, cx, 23, 10); near('well', 1, 1, cx, cy, 4); }
      // your banner over the land
      this.add.image(cx * TILE - 30, 13 * TILE, bannerTex(this, getState().battalions[0]?.color ?? 0xb3242a, getState().battalions[0]?.emblem ?? 'lion', 0)).setOrigin(0.2, 1).setScale(S * 1.3).setDepth(13 * TILE);
    } else {
      // open country: a signpost by the road, waiting for settlers
      const px = cx * TILE, py = 15 * TILE; this.add.rectangle(px, py, 2, 18, 0x5a3a1e).setOrigin(0.5, 1).setDepth(py); this.add.rectangle(px, py - 15, 22, 8, 0xb08a52).setStrokeStyle(1, 0x3a2410).setDepth(py + 1);
      this.add.text(px, py - 46, `${site.name}\nunclaimed · ${SETTLE[kind].name.toLowerCase()} site`, { fontFamily: 'monospace', fontSize: '22px', color: '#fff4d6', stroke: '#1d1716', strokeThickness: 5, align: 'center' }).setOrigin(0.5, 1).setScale(0.45).setDepth(30000);
    }
    // ground, plants (thick woods round a lumber camp) and the road; plants throw their shadows first
    const rt = this.add.renderTexture(0, 0, WW * HD, WH * HD).setOrigin(0).setDepth(-10).setScale(S), deco: [string, number, number][] = [], plants = BIOME_PLANTS[this.biome];
    const dens = BIOME_DENSITY[this.biome] * (kind === 'lumber' ? 4 : 1.6) * (L ? 1 : 1.5);
    rt.beginDraw();
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const h = hashXY(x, y, Math.round(site.x * 1e4)); rt.batchDraw(`bt_${this.biome}${h % 7 === 0 ? 3 : h % 3}`, x * TILE * HD, y * TILE * HD);
      const clearing = L && Math.hypot((x - cx) / 1.4, y - cy) < 7 + L * 2;
      if (!this.occ.has(`${x},${y}`) && !this.occ.has(`${x},${y + 1}`) && !clearing && ((h >>> 9) % 1000) / 1000 < dens) { deco.push([`bp_${plants[(h >>> 4) % plants.length]}${h % 2}`, x, y]); if (kind === 'lumber' && L && Math.abs(y - 9) < 6 && x % 3 === 0) this.works.push({ x: (x + 1.2) * TILE, y: (y + 1.2) * TILE }); }
    }
    const sun = this.shadows.sun;
    if (sun.alpha > 0.02) for (const [k, x, y] of deco) { const sk = shadowTex(this, k, sun.len); if (sk) rt.batchDraw(sk, x * TILE * HD, (y * TILE - 8) * HD + this.textures.get(k).getSourceImage().height, sun.alpha); }
    for (const [k, x, y] of deco.sort((a, c) => a[2] - c[2])) rt.batchDraw(k, x * TILE * HD, (y * TILE - 8) * HD);
    rt.endDraw();
    const paved = (x: number, y: number) => road.has(`${x},${y}`);
    for (const k of road) { const [x, y] = k.split(',').map(Number), m = (paved(x, y - 1) ? 1 : 0) | (paved(x + 1, y) || x === LW - 1 ? 2 : 0) | (paved(x, y + 1) ? 4 : 0) | (paved(x - 1, y) || x === 0 ? 8 : 0);
      this.add.image(x * TILE, (y + 1) * TILE, tileTex(this, 'road', L >= 2 ? 2 : 1, m)).setOrigin(0, 1).setScale(S).setDepth(-6); }
    this.nav.setTiles(blocked, [...road].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y }; }));
  }
  private tint(img: Phaser.GameObjects.Image) { if (this.biome === 'tundra') img.setTint(0xeef4ff); if (this.biome === 'desert') img.setTint(0xfff2dc); }

  /** Its people: workers at the woodpiles, the quarry face and the fields, villagers going door to door; travellers on the road. */
  private people() {
    const L = this.level, n = L ? 3 + L * 3 : 0;
    const add = (cls: string, x: number, y: number, road = false): Walker => { const img = this.add.image(x, y, 'soldiers', sFrame(cls, 0, 0)).setOrigin(0.5, 1).setScale(S); const w: Walker = { img, x, y, cls, wait: Math.random() * 3000, ph: Math.floor(Math.random() * 8), road }; this.walkers.push(w); return w; };
    for (let i = 0; i < n && this.doors.length; i++) { const d = this.doors[i % this.doors.length]; add(this.site.kind === 'abbey' && i % 2 ? 'villager' : i % 3 ? 'worker' : 'villager', d.x, d.y); }
    for (let i = 0; i < 2; i++) { const w = add(i ? 'villager' : 'worker', i ? WW - 20 : 20, 17 * TILE, true); w.wait = i * 6000; }
  }
  private chat() {
    const live = this.walkers.filter((w) => !w.road && w.img.visible && !w.path?.length); if (!live.length || this.cameras.main.zoom < 0.9) return;
    const w = live[Math.floor(Math.random() * live.length)], lines = LINES[this.site.kind];
    this.chatter.say({ get x() { return w.x; }, get y() { return w.y; }, h: 16, alive: () => w.img.active }, lines[Math.floor(Math.random() * lines.length)], 0, 470);
  }
  private night() {
    const { n } = nightFactor(getState().settings.dayNight), c = (a: number, b: number, t: number) => { const ch = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };
    this.shade.setFillStyle(c(0xffffff, 0x3a4a8a, n * 0.85)).setVisible(n > 0.01);
    this.shadows.setSun(sunNow(getState().settings.dayNight, this.weather?.current ?? 'clear'));
  }
  update(time: number, dt: number) {
    if (!this.site) return;
    this.chatter.update(); this.weather.update(this.cameras.main); this.feet.draw(this.shadows.sun);
    const tick = Math.floor(time / 150);
    for (const w of this.walkers) {
      let f = 0;
      if (w.path?.length) { const dir = follow(w, dt, w.road ? 18 : 14); if (dir) w.img.setFlipX(dir < 0); f = (tick + w.ph) % 4; }
      else if ((w.wait -= dt) > 0) { if (w.work) f = (tick + w.ph) % 4 < 2 ? 4 : 5; } // chopping, hewing, hoeing
      else if (w.road) { const to = { x: w.x < WW / 2 ? WW - 12 : 12, y: 17 * TILE + (Math.random() - 0.5) * 6 }; w.path = this.nav.path(w, to) ?? [to]; w.wait = 4000 + Math.random() * 8000; }
      else {
        const work = w.cls === 'worker' && this.works.length && Math.random() < 0.6, to = work ? this.works[Math.floor(Math.random() * this.works.length)] : this.doors[Math.floor(Math.random() * this.doors.length)];
        if (to) { w.work = work ? to : undefined; w.path = this.nav.path(w, to) ?? []; } w.wait = work ? 6000 + Math.random() * 6000 : 2500 + Math.random() * 4000;
      }
      w.img.setFrame(sFrame(w.cls, 0, f)).setPosition(Math.round(w.x), Math.round(w.y)).setDepth(w.y);
    }
  }
}
