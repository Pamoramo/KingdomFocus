// The kingdom's ambience: sounds placed in space, birds and fireflies, seasonal drift, carts and travellers on
// the roads, and how the town reacts to war (alarm bells, an enemy camp, closed gates), victory (a festival)
// and defeat (smoking, damaged buildings). Lightweight: pooled sprites, timers, nothing simulated off-screen.
import Phaser from 'phaser';
import { getState, footprint, TILE, MAP_W, MAP_H, RIVER, type GameState } from '../lib/state.ts';
import type { BKind } from '../lib/economy.ts';
import { getUI } from './ui.ts';
import { audio } from './audio.ts';
import { canvas, r, withoutOutline } from './art/px.ts';
import { hdify } from './art/hd.ts';
import { wagon, rubble } from './art/biome.ts';
import { siegeCamp } from './art/war.ts';
import { sFrame, bannerTex, S } from './textures.ts';
import { follow, type Pt } from './paths.ts';
import type { Ambient } from './ambient.ts';
import type { World } from './world.ts';
import { nightFactor } from './KingdomScene.ts';

type Snd = Parameters<typeof audio.spatial>[0];
/** Which buildings make which sounds, and whether only by day. */
const VOICES: Partial<Record<BKind, [Snd, boolean][]>> = {
  blacksmith: [['hammer', true]], market: [['chatter', true]], barracks: [['drill', true]], trainfield: [['drill', true]],
  stable: [['neigh', false], ['hooves', true]], cavstable: [['neigh', false], ['hooves', true]], camp: [['crackle', false]], farm: [['chop', true]], storehouse: [['chop', true]],
};
const HEARD = 520; // world px at which a sound fades out
export const season = (d = new Date()) => { const m = d.getMonth(); return m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn'; };

interface Traveller { parts: Phaser.GameObjects.Image[]; x: number; y: number; path: Pt[]; back?: Pt[]; wait: number; cart: boolean; ph: number }

export class Life {
  private sources: { kind: Snd; day: boolean; x: number; y: number }[] = [];
  private travellers: Traveller[] = []; private camp: Phaser.GameObjects.GameObject[] = []; private gates: Phaser.GameObjects.Image[] = [];
  private scars: Phaser.GameObjects.Image[] = []; private scarSmoke: [number, number][] = []; private sig = ''; private warSig = '';
  private fireflies?: Phaser.GameObjects.Particles.ParticleEmitter; private drift?: Phaser.GameObjects.Particles.ParticleEmitter; private confetti?: Phaser.GameObjects.Particles.ParticleEmitter;
  private view = new Phaser.Geom.Rectangle(0, 0, 10, 10);
  constructor(private scene: Phaser.Scene, private world: World, private ambient: Ambient) {
    const T = scene.textures;
    if (!T.exists('bird')) { for (const f of [0, 1]) { const [cv, c] = canvas(7, 4); const col = '#2a2420'; if (f) { r(c, 0, 0, 1, 1, col); r(c, 1, 1, 2, 1, col); r(c, 3, 2, 1, 1, col); r(c, 4, 1, 2, 1, col); r(c, 6, 0, 1, 1, col); } else { r(c, 0, 2, 3, 1, col); r(c, 3, 2, 1, 1, col); r(c, 4, 2, 3, 1, col); } T.addCanvas(`bird${f}`, cv); } }
    for (const f of [0, 1]) if (!T.exists(`wagon${f}`)) T.addCanvas(`wagon${f}`, hdify(withoutOutline(() => wagon(f))));
    for (let i = 0; i < 3; i++) if (!T.exists(`rubble${i}`)) T.addCanvas(`rubble${i}`, hdify(withoutOutline(() => rubble(i * 7 + 1))));
    if (!T.exists('camp_icon')) T.addCanvas('camp_icon', hdify(withoutOutline(() => siegeCamp())));
    if (!T.exists('portc')) { const [cv, c] = canvas(12, 12); for (let x = 0; x < 12; x += 3) r(c, x, 0, 1, 12, '#3a3632'); for (let y = 1; y < 12; y += 3) r(c, 0, y, 12, 1, '#4a4642'); for (let x = 0; x < 12; x += 3) r(c, x, 11, 1, 1, '#9a9488'); T.addCanvas('portc', cv); }
    // fireflies on summer nights, leaves in autumn, blossom in spring; confetti and bunting colours at festivals
    this.fireflies = scene.add.particles(0, 0, 'px', { emitZone: { type: 'random', source: this.view as never }, lifespan: 3000, speed: { min: 2, max: 8 }, scale: { start: 0.8, end: 0.2 }, alpha: { start: 0, end: 1, ease: 'Sine.easeInOut' }, tint: 0xd8ff7a, blendMode: 'ADD', frequency: 260, emitting: false }).setDepth(25001);
    this.drift = scene.add.particles(0, 0, 'px', { emitZone: { type: 'random', source: this.view as never }, lifespan: 6000, speedX: { min: 8, max: 22 }, speedY: { min: 6, max: 16 }, rotate: { min: 0, max: 360 }, scale: { min: 0.8, max: 1.4 }, frequency: 500, emitting: false }).setDepth(19990);
    this.confetti = scene.add.particles(0, 0, 'px', { emitZone: { type: 'random', source: this.view as never }, lifespan: 2600, speedY: { min: 20, max: 45 }, speedX: { min: -12, max: 12 }, scale: { min: 0.9, max: 1.5 }, tint: [0xe04a40, 0xecc94b, 0x3557a8, 0xf8f0dc, 0x3f9c3a], frequency: 60, emitting: false }).setDepth(19991);
    scene.time.addEvent({ delay: 650, loop: true, callback: () => this.sound() });
    scene.time.addEvent({ delay: 4000, loop: true, callback: () => this.weatherLife() });
    scene.time.addEvent({ delay: 21000, loop: true, callback: () => { if (Math.random() < 0.8) this.flock(); } });
    scene.time.addEvent({ delay: 45000, loop: true, callback: () => { if (Math.random() < 0.6) this.traveller(); } });
    scene.time.addEvent({ delay: 5200, loop: true, callback: () => this.reactive() });
    scene.time.delayedCall(6000, () => this.traveller());
  }
  /** Smoke points of buildings damaged in a lost battle. */
  get smoke() { return this.scarSmoke; }

  sync(s: GameState) {
    const sig = s.buildings.filter((b) => VOICES[b.kind]).map((b) => b.id).join() + s.buildings.length;
    if (sig !== this.sig) { this.sig = sig; this.sources = s.buildings.flatMap((b) => (VOICES[b.kind] ?? []).map(([kind, day]) => { const [w, h] = footprint(b.kind); return { kind, day, x: (b.x + w / 2) * TILE, y: (b.y + h / 2) * TILE }; })); }
    this.warState(s);
  }

  // ---------------- sound placed in the world ----------------
  private sound() {
    const s = getState(); if (!s.settings.sound || getUI().view !== 'kingdom' || getUI().battle || getUI().parade) return;
    const cam = this.scene.cameras.main, cx = cam.midPoint.x, cy = cam.midPoint.y, zoomK = Phaser.Math.Clamp(cam.zoom / 2, 0.3, 1), night = nightFactor(s.settings.dayNight).n > 0.6;
    const near = this.sources.filter((src) => !(src.day && night)).map((src) => ({ src, d: Math.hypot(src.x - cx, src.y - cy) })).filter((x) => x.d < HEARD);
    if (near.length && Math.random() < 0.55) { const { src, d } = near[Math.floor(Math.random() * near.length)]; audio.spatial(src.kind, (1 - d / HEARD) ** 2 * zoomK * 0.9, (src.x - cx) / HEARD); }
    // the river burbles when you are close to it
    const row = RIVER[Math.max(0, Math.min(MAP_H - 1, Math.floor(cy / TILE)))], rx = (row[0] + 1.5) * TILE, rd = Math.abs(rx - cx);
    if (rd < HEARD * 0.6 && Math.random() < 0.3) audio.spatial('water', (1 - rd / (HEARD * 0.6)) * zoomK * 0.7, (rx - cx) / HEARD);
    // footsteps when zoomed in on the townsfolk
    if (cam.zoom > 2.2 && Math.random() < 0.35 && this.ambient.actors.some((a) => a.mode === 'walk' && a.path?.length && Math.hypot(a.x - cx, a.y - cy) < 70)) audio.spatial('steps', 0.4, 0);
    // a crackling hearth somewhere at night
    if (night && Math.random() < 0.2 && this.world.smokePts.length) { const [x, y] = this.world.smokePts[Math.floor(Math.random() * this.world.smokePts.length)], d = Math.hypot(x - cx, y - cy); if (d < HEARD) audio.spatial('crackle', (1 - d / HEARD) * 0.5 * zoomK, (x - cx) / HEARD); }
  }

  // ---------------- birds, bats, fireflies, leaves ----------------
  private weatherLife() {
    const s = getState(), cam = this.scene.cameras.main, v = cam.worldView, n = nightFactor(s.settings.dayNight).n, wet = ['rain', 'storm', 'snow'].includes(getUI().weather), se = season();
    this.view.setTo(v.x, v.y, v.width, v.height);
    this.fireflies!.emitting = n > 0.6 && !wet && (se === 'summer' || se === 'spring');
    this.drift!.emitting = !wet && n < 0.6 && (se === 'autumn' || se === 'spring');
    if (this.drift!.emitting) this.drift!.setParticleTint(se === 'autumn' ? [0xc8702a, 0xa84a1e, 0xd8a03a][Math.floor(Math.random() * 3)] : [0xffd0e0, 0xffffff][Math.floor(Math.random() * 2)]);
    this.confetti!.emitting = (s.world.festival ?? 0) > Date.now() && n < 0.7;
  }
  private flock() {
    const s = getState(), n = nightFactor(s.settings.dayNight).n; if (['rain', 'storm'].includes(getUI().weather) || getUI().view !== 'kingdom') return;
    const bats = n > 0.55; if (bats && Math.random() < 0.6) return;
    const v = this.scene.cameras.main.worldView, left = Math.random() < 0.5, y0 = v.y + v.height * (0.15 + Math.random() * 0.5), k = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < k; i++) {
      const b = this.scene.add.image(left ? v.x - 20 - i * 8 : v.right + 20 + i * 8, y0 + (i % 2 ? 6 : -6) * Math.ceil(i / 2), 'bird0').setDepth(26000).setFlipX(!left).setTint(bats ? 0x1a1420 : 0xffffff).setScale(bats ? 0.8 : 1);
      const dur = 9000 + Math.random() * 3000; let f = 0;
      const flap = this.scene.time.addEvent({ delay: bats ? 90 : 170, loop: true, callback: () => b.setTexture(`bird${(f++ + i) % 2}`) });
      this.scene.tweens.add({ targets: b, x: left ? v.right + 60 : v.x - 60, y: b.y - 30 + Math.random() * 40, duration: dur, ease: 'Linear', onComplete: () => { flap.remove(); b.destroy(); } });
    }
  }

  // ---------------- carts and travellers on the roads ----------------
  private traveller() {
    if (this.travellers.length >= 2 || getUI().view !== 'kingdom') return;
    const s = getState(), dest = this.ambient.placeOf(['market', 'storehouse', 'keep', 'camp', 'well']); if (!dest) return;
    const nav = this.ambient.nav, edges: Pt[] = [];
    for (let t = 0; t < 12; t++) { const side = Math.floor(Math.random() * 3), x = side === 0 ? 1 : side === 1 ? MAP_W - 2 : 4 + Math.floor(Math.random() * (MAP_W - 8)), y = side === 2 ? MAP_H - 2 : 4 + Math.floor(Math.random() * (MAP_H - 8)); if (nav.free(x, y)) edges.push({ x: (x + 0.5) * TILE, y: (y + 0.75) * TILE }); }
    const start = edges.sort((a, b) => Math.hypot(a.x - dest.x, a.y - dest.y) - Math.hypot(b.x - dest.x, b.y - dest.y))[0]; if (!start) return;
    const path = nav.path(start, dest); if (!path || path.length > 80) return;
    const cart = s.buildings.some((b) => b.kind === 'market' || b.kind === 'storehouse') && Math.random() < 0.6, parts: Phaser.GameObjects.Image[] = [];
    if (cart) parts.push(this.scene.add.image(start.x, start.y, 'wagon0').setOrigin(0.5, 1).setScale(S * 0.9));
    parts.push(this.scene.add.image(start.x, start.y, 'soldiers', sFrame(cart ? 'worker' : 'villager', 0, 0)).setOrigin(0.5, 1).setScale(S).setTint(cart ? 0xffffff : 0xd8c8a8));
    this.travellers.push({ parts, x: start.x, y: start.y, path, back: [...path].reverse().concat([start]), wait: 0, cart, ph: Math.floor(Math.random() * 4) });
  }
  update(dt: number, tick: number) {
    for (const t of [...this.travellers]) {
      if (t.wait > 0) { t.wait -= dt; continue; }
      const dir = follow(t, dt, t.cart ? 16 : 12);
      if (!t.path.length) { if (t.back) { t.path = t.back; t.back = undefined; t.wait = 5000 + Math.random() * 4000; } else { t.parts.forEach((p) => p.destroy()); this.travellers.splice(this.travellers.indexOf(t), 1); continue; } }
      t.parts.forEach((p, i) => { const off = t.cart && i === 1 ? (p.flipX ? 12 : -12) : 0; p.setPosition(Math.round(t.x + off), Math.round(t.y)).setDepth(t.y); if (dir) p.setFlipX(dir < 0); });
      const p = t.parts[t.parts.length - 1]; p.setFrame(sFrame(t.cart ? 'worker' : 'villager', 0, (tick + t.ph) % 4)); if (t.cart) t.parts[0].setTexture(`wagon${tick % 2}`);
    }
  }

  // ---------------- war, festival and damage ----------------
  private warState(s: GameState) {
    const w = s.world, sig = `${w.threat?.rival ?? ''}|${(w.scars?.until ?? 0) > Date.now() ? w.scars!.ids.join() : ''}|${s.buildings.length}`;
    if (sig === this.warSig) return; this.warSig = sig;
    this.camp.forEach((o) => o.destroy()); this.camp = []; this.gates.forEach((g) => g.destroy()); this.gates = []; this.scars.forEach((o) => o.destroy()); this.scars = []; this.scarSmoke = [];
    this.ambient.alarm = !!w.threat;
    if (w.threat) {
      // the enemy host camps outside your walls, on the side facing their realm; your gates come down
      const r = w.rivals.find((x) => x.id === w.threat!.rival), keep = s.buildings.find((b) => b.kind === 'keep') ?? s.buildings.find((b) => b.kind === 'camp');
      const cx = ((keep?.x ?? MAP_W / 2) + 2) * TILE, cy = ((keep?.y ?? MAP_H / 2) + 2) * TILE, dx = (r?.x ?? 0.6) - 0.5, dy = (r?.y ?? 0.5) - 0.5, k = 14 * TILE / Math.max(0.01, Math.hypot(dx, dy));
      const ex = Phaser.Math.Clamp(cx + dx * k, 4 * TILE, (MAP_W - 4) * TILE), ey = Phaser.Math.Clamp(cy + dy * k, 6 * TILE, (MAP_H - 2) * TILE);
      for (let i = 0; i < 3; i++) this.camp.push(this.scene.add.image(ex - 40 + i * 40, ey + 24, 'camp_icon').setOrigin(0.5, 1).setScale(0.45).setDepth(ey + 24));
      if (r) this.camp.push(this.scene.add.image(ex + 60, ey - 10, bannerTex(this.scene, r.color, r.emblem, 0)).setOrigin(0.2, 1).setScale(S * 1.3).setDepth(ey));
      for (let i = 0; i < 18; i++) { const im = this.scene.add.image(ex - 50 + (i % 6) * 18, ey - 30 + Math.floor(i / 6) * 12, 'soldiers', sFrame(i % 3 ? 'spearman' : 'archer', 1, 0)).setOrigin(0.5, 1).setScale(S).setTint(0xffd0c4).setFlipX(dx > 0).setDepth(ey - 30 + Math.floor(i / 6) * 12); this.camp.push(im); }
      for (const g of s.buildings.filter((b) => b.kind === 'gate' || b.kind === 'gatehouse')) { const [gw, gh] = footprint(g.kind); this.gates.push(this.scene.add.image((g.x + gw / 2) * TILE, (g.y + gh) * TILE - 1, 'portc').setOrigin(0.5, 1).setScale(g.kind === 'gatehouse' ? 1 : 0.9).setDepth((g.y + gh) * TILE + 1)); }
    }
    // a lost battle leaves its mark for a while: blackened walls, rubble and smoke
    if ((w.scars?.until ?? 0) > Date.now()) for (const id of w.scars!.ids) {
      const b = s.buildings.find((x) => x.id === id); if (!b) continue; const [bw, bh] = footprint(b.kind), x = b.x * TILE, y = (b.y + bh) * TILE;
      for (let i = 0; i < bw; i++) this.scars.push(this.scene.add.image(x + i * TILE, y + 2, `rubble${(i + b.x) % 3}`).setOrigin(0, 1).setScale(S).setTint(0x6a5a50).setDepth(y + 1));
      this.scarSmoke.push([x + (bw * TILE) / 2, y - bh * TILE * 0.6]);
    }
    this.world.scarred = new Set((w.scars?.until ?? 0) > Date.now() ? w.scars!.ids : []);
  }
  /** Every few seconds: the alarm bell while enemies are at the gates; cheering while the town celebrates. */
  private reactive() {
    const s = getState(); if (!s.settings.sound || getUI().view !== 'kingdom' || getUI().battle) return;
    if (s.world.threat) audio.spatial('alarm', 0.7, 0);
    else if ((s.world.festival ?? 0) > Date.now()) { if (Math.random() < 0.6) audio.spatial('cheer', 0.5, (Math.random() - 0.5) * 0.6); if (Math.random() < 0.3) audio.play('lute'); }
    else if (Math.random() < 0.06) audio.spatial('bell', 0.35, 0); // the hour bell
    this.ambient.festival = (s.world.festival ?? 0) > Date.now();
  }
}
