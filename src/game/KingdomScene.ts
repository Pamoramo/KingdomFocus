import Phaser from 'phaser';
import { sunNow, FootShadows } from './shadows.ts';
import { QuartersLife } from './quarters.ts';
import { getState, subscribe, fxBus, type Fx, MAP_W, MAP_H, TILE, CAMP_X, CAMP_Y, canPlace, build, marchTo, marchArmy, moveBuilding, footprint, demolishMany } from '../lib/state.ts';
import { BUILDINGS, type BKind } from '../lib/economy.ts';
import { getUI, setUI, subUI, camBus } from './ui.ts';
import { makeTextures } from './textures.ts';
import { World } from './world.ts';
import { Army } from './army.ts';
import { Ambient } from './ambient.ts';
import { Life, season } from './life.ts';
import { Chatter } from './chatter.ts';
import { WeatherFx, weatherAt } from './weather.ts';
import { TownEvents } from './events.ts';
import { thiefCanStrike, thiefChance, THIEF_CHECK_MS } from '../lib/town.ts';

const WW = MAP_W * TILE, WH = MAP_H * TILE;

/** Night factor 0..1 (and dusk warmth) from the local clock or the player's preference. */
export function nightFactor(mode: string, d = new Date()): { n: number; warm: number } {
  if (mode === 'day') return { n: 0, warm: 0 };
  if (mode === 'night') return { n: 1, warm: 0 };
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 21 || h < 5) return { n: 1, warm: 0 };
  if (h >= 18) return { n: (h - 18) / 3, warm: 1 - Math.abs(h - 19) / 2 };
  if (h < 7) return { n: 1 - (h - 5) / 2, warm: 1 - Math.abs(h - 6) };
  return { n: 0, warm: 0 };
}
const lerpColor = (a: number, b: number, t: number) => { const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };

export class KingdomScene extends Phaser.Scene {
  private world!: World; private army!: Army; private ambient!: Ambient; private chatter!: Chatter; private weather!: WeatherFx; happenings!: TownEvents;
  private ghost!: Phaser.GameObjects.Rectangle; private selRect!: Phaser.GameObjects.Rectangle; private shade!: Phaser.GameObjects.Rectangle;
  private frame = 0; private unsub: (() => void)[] = []; private feet!: FootShadows; private quarters!: QuartersLife;
  private pinch: { d: number; z: number; wx: number; wy: number } | null = null;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean; paint: boolean } | null = null;
  private lastPaint = ''; private keys!: Record<string, Phaser.Input.Keyboard.Key>; private night = 0;

  constructor() { super('kingdom'); }

  create() {
    makeTextures(this);
    this.world = new World(this); this.feet = new FootShadows(this); this.army = new Army(this); this.chatter = new Chatter(this); this.ambient = new Ambient(this, this.chatter); this.quarters = new QuartersLife(this, this.ambient, this.chatter); this.life = new Life(this, this.world, this.ambient);
    this.ghost = this.add.rectangle(0, 0, 16, 16, 0x44ff66, 0.3).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.9).setDepth(40000).setVisible(false);
    this.selRect = this.add.rectangle(0, 0, 16, 16).setOrigin(0).setStrokeStyle(1, 0xffe27a, 1).setDepth(40001).setVisible(false);
    this.shade = this.add.rectangle(-WW, -WH, WW * 3, WH * 3, 0xffffff).setOrigin(0).setDepth(20000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const cam = this.cameras.main;
    cam.setBounds(-WW * 0.2, -WH * 0.2, WW * 1.4, WH * 1.4).setRoundPixels(true).setBackgroundColor('#2b2118');
    cam.setZoom(Phaser.Math.Clamp(this.scale.width / 560, this.minZoom(), 3.2));
    const s0 = getState(), home = s0.buildings.find((b) => b.kind === 'keep') ?? s0.buildings.find((b) => b.kind === 'camp');
    cam.centerOn(((home?.x ?? CAMP_X) + 2) * TILE, ((home?.y ?? CAMP_Y) + 4) * TILE);

    this.input.addPointer(2);
    this.input.on('pointerdown', this.onDown, this); this.input.on('pointermove', this.onMove, this); this.input.on('pointerup', this.onUp, this);
    // zoom in proportion to the scroll: a mouse notch (~100) is ~12%, a trackpad's many small events add up smoothly
    this.input.on('wheel', (p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => {
      const z = Phaser.Math.Clamp((this.zoomGoal?.z ?? cam.zoom) * Math.exp(-Phaser.Math.Clamp(dy, -300, 300) * 0.0012), this.minZoom(), 6);
      // pin the world point under the cursor once, when the scroll begins (re-reading the camera each frame let rounding accumulate into a drift)
      const same = this.zoomGoal && Math.abs(this.zoomGoal.sx - p.x) < 2 && Math.abs(this.zoomGoal.sy - p.y) < 2, w = same ? this.zoomGoal! : this.worldAt(p.x, p.y);
      this.zoomGoal = { z, sx: p.x, sy: p.y, wx: w.wx, wy: w.wy };
    });
    this.scale.on('resize', () => cam.setZoom(Math.max(cam.zoom, this.minZoom())));
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,Q,E,PLUS,MINUS,SHIFT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-ESC', () => setUI({ clearing: null, placing: null, moving: null, selBat: null, selArmy: null, selBuilding: null, inspect: null }));

    this.unsub.push(subscribe(() => this.sync()), subUI(() => this.syncUI()));
    const onFx = (e: Event) => this.fx((e as CustomEvent<Fx>).detail);
    const onFocus = (e: Event) => { const d = (e as CustomEvent<{ x: number; y: number }>).detail; cam.pan(d.x, d.y, 600, 'Sine.easeInOut'); };
    fxBus.addEventListener('fx', onFx); camBus.addEventListener('focus', onFocus);
    this.unsub.push(() => fxBus.removeEventListener('fx', onFx), () => camBus.removeEventListener('focus', onFocus));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
    this.time.addEvent({ delay: 380, loop: true, callback: () => { this.frame++; this.world.tick(this.frame); this.army.sync(getState(), this.frame); } });
    this.time.addEvent({ delay: 1100, loop: true, callback: () => this.smoke() });
    this.time.addEvent({ delay: 7000, loop: true, callback: () => this.chat() });
    this.happenings = new TownEvents(this, this.chatter);
    this.time.addEvent({ delay: 60000, loop: true, callback: () => this.happenings.maybeSpawn(0.3) });
    this.weather = new WeatherFx(this, WW, WH);
    const doWeather = () => { const w = weatherAt(); this.weather.set(w); if (getUI().weather !== w) setUI({ weather: w }); this.applyNight(); };
    doWeather(); this.time.addEvent({ delay: 30000, loop: true, callback: doWeather });
    this.time.addEvent({ delay: THIEF_CHECK_MS, loop: true, callback: () => { if (thiefCanStrike() && Math.random() < thiefChance()) this.ambient.spawnThief(); } });
    this.time.addEvent({ delay: 20000, loop: true, callback: () => this.applyNight() });
    this.sync();
  }

  private life!: Life; private zoomGoal: { z: number; sx: number; sy: number; wx: number; wy: number } | null = null;
  private minZoom() { return Math.max(this.scale.width / (WW * 1.4), this.scale.height / (WH * 1.4), 0.35); }
  /** The world point under a screen point (Phaser zooms about the camera's centre). */
  private worldAt(sx: number, sy: number) { const cam = this.cameras.main, cx = cam.width * cam.originX, cy = cam.height * cam.originY; return { wx: cam.scrollX + cx + (sx - cam.x - cx) / cam.zoom, wy: cam.scrollY + cy + (sy - cam.y - cy) / cam.zoom }; }
  /** Sets the zoom so that world point (wx, wy) sits under screen point (sx, sy). */
  private placeZoom(z: number, sx: number, sy: number, wx: number, wy: number) { const cam = this.cameras.main, cx = cam.width * cam.originX, cy = cam.height * cam.originY; cam.setZoom(z); cam.setScroll(wx - cx - (sx - cam.x - cx) / z, wy - cy - (sy - cam.y - cy) / z); }
  zoomAt(z: number, sx: number, sy: number) {
    // keep the world point under (sx, sy) still. Phaser zooms about the camera's centre, and its matrix only updates at render,
    // so getWorldPoint right after setZoom is stale (that made zooming drift sideways); do the arithmetic directly instead.
    const cam = this.cameras.main, z0 = cam.zoom, z1 = Phaser.Math.Clamp(z, this.minZoom(), 6), cx = cam.width * cam.originX, cy = cam.height * cam.originY;
    const wx = cam.scrollX + cx + (sx - cam.x - cx) / z0, wy = cam.scrollY + cy + (sy - cam.y - cy) / z0;
    cam.setZoom(z1); cam.setScroll(wx - cx - (sx - cam.x - cx) / z1, wy - cy - (sy - cam.y - cy) / z1);
  }

  private sync() {
    const s = getState();
    this.life?.sync(s); this.world.drawTerrain(s); this.world.syncBuildings(s); this.army.sync(s, this.frame); this.ambient.sync(s); this.quarters.sync(s); this.life?.sync(s); this.syncUI(); this.applyNight();
  }
  applyNight() {
    const { n, warm } = nightFactor(getState().settings.dayNight);
    this.night = n;
    const seasonTint = { winter: 0xe8eef8, spring: 0xf8fff0, summer: 0xffffff, autumn: 0xfff0dc }[season()]; // a cool winter light, a golden autumn
    const tint = lerpColor(lerpColor(seasonTint, 0xffc890, warm * 0.6), 0x3a4a8a, n * 0.85);
    this.shade.setFillStyle(tint, 1).setVisible(n > 0.01 || warm > 0.01 || season() !== 'summer');
    if (Math.abs(getUI().night - n) > 0.05) setUI({ night: n });
    this.world.setSun(sunNow(getState().settings.dayNight, this.weather?.current ?? 'clear'), getState());
  }

  update(time: number, dt: number) {
    const s = getState(), ui = getUI(), cam = this.cameras.main;
    this.army.setLod(cam.zoom); this.army.update(s, time, dt, ui.selBat); this.ambient.update(time, dt); this.quarters.update(time, dt); this.life.update(dt, Math.floor(time / 150));
    this.feet.draw(this.world.shadows.sun, (foot) => this.army.feet(foot));
    // smooth zoom toward the wheel's target
    if (this.zoomGoal) { const g = this.zoomGoal, z = Math.abs(g.z - cam.zoom) < 0.002 ? g.z : cam.zoom + (g.z - cam.zoom) * Math.min(1, dt / 90); this.placeZoom(z, g.sx, g.sy, g.wx, g.wy); if (z === g.z) this.zoomGoal = null; }
    if (this.night > 0.05) for (const l of this.world.lights) l.setAlpha(this.night * (0.55 + Math.random() * 0.15));
    else if (this.world.lights[0]?.alpha) for (const l of this.world.lights) l.setAlpha(0);
    const k = this.keys, sp = ((k.SHIFT.isDown ? 900 : 400) * dt) / 1000 / cam.zoom;
    const el = document.activeElement, typing = !!el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if (!typing) {
      if ([k.A, k.D, k.W, k.S, k.LEFT, k.RIGHT, k.UP, k.DOWN, k.E, k.Q, k.PLUS, k.MINUS].some((x) => x.isDown)) { this.zoomGoal = null; }
      if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= sp;
      if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += sp;
      if (k.W.isDown || k.UP.isDown) cam.scrollY -= sp;
      if (k.S.isDown || k.DOWN.isDown) cam.scrollY += sp;
      if (k.E.isDown || k.PLUS.isDown) this.zoomAt(cam.zoom * 1.02, this.scale.width / 2, this.scale.height / 2);
      if (k.Q.isDown || k.MINUS.isDown) this.zoomAt(cam.zoom / 1.02, this.scale.width / 2, this.scale.height / 2);
    }
  }

  // ---------- input ----------
  private tileAt(p: Phaser.Input.Pointer) { const w = this.cameras.main.getWorldPoint(p.x, p.y); return { tx: Math.floor(w.x / TILE), ty: Math.floor(w.y / TILE), wx: w.x, wy: w.y }; }
  private onDown(p: Phaser.Input.Pointer) {
    this.zoomGoal = null; // a touch takes hold of the camera: stop any easing zoom
    const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown);
    if (ps.length === 2) { const w = this.worldAt((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2); this.pinch = { d: Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y), z: this.cameras.main.zoom, ...w }; this.drag = null; return; }
    const ui = getUI(), paint = !!ui.placing && !!BUILDINGS[ui.placing].paint;
    this.drag = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY, moved: false, paint };
    this.lastPaint = '';
    if (paint) this.tryPlace(p);
    if (ui.clearing?.length) { const t = this.tileAt(p); this.clearFrom = { x: t.tx, y: t.ty }; this.showClear(p); } // the clearing tool: drag a box instead of moving the camera
  }
  /** The red box of the clearing tool, from where the drag began to the pointer, and how many tiles it would clear. */
  private clearFrom: { x: number; y: number } | null = null; private clearBox?: Phaser.GameObjects.Rectangle; private clearLabel?: Phaser.GameObjects.Text;
  private clearRect(p: Phaser.Input.Pointer) { const a = this.clearFrom!, t = this.tileAt(p); return { x0: Math.min(a.x, t.tx), y0: Math.min(a.y, t.ty), x1: Math.max(a.x, t.tx), y1: Math.max(a.y, t.ty) }; }
  private clearIds(r: { x0: number; y0: number; x1: number; y1: number }) {
    const kinds = getUI().clearing ?? [];
    return getState().buildings.filter((b) => { if (!kinds.includes(b.kind)) return false; const [w, h] = footprint(b.kind); return b.x <= r.x1 && b.x + w - 1 >= r.x0 && b.y <= r.y1 && b.y + h - 1 >= r.y0; }).map((b) => b.id);
  }
  private showClear(p: Phaser.Input.Pointer) {
    const r = this.clearRect(p), n = this.clearIds(r).length;
    this.clearBox ??= this.add.rectangle(0, 0, 16, 16, 0xff3020, 0.22).setOrigin(0).setStrokeStyle(1.5, 0xff6a50, 1).setDepth(40002);
    this.clearLabel ??= this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '22px', color: '#fff4d6', stroke: '#1d1716', strokeThickness: 5 }).setOrigin(0, 1).setScale(0.4).setDepth(40003);
    this.clearBox.setVisible(true).setPosition(r.x0 * TILE, r.y0 * TILE).setSize((r.x1 - r.x0 + 1) * TILE, (r.y1 - r.y0 + 1) * TILE);
    this.clearLabel.setVisible(true).setText(n ? `Remove ${n}` : 'Nothing to remove').setPosition(r.x0 * TILE, r.y0 * TILE - 2);
  }
  private onMove(p: Phaser.Input.Pointer) {
    this.updateGhost(p);
    if (this.pinch) {
      const a = this.input.pointer1, b = this.input.pointer2;
      if (a.isDown && b.isDown) this.placeZoom(Phaser.Math.Clamp(this.pinch.z * (Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / this.pinch.d), this.minZoom(), 6), (a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.wx, this.pinch.wy); // the spot between the fingers stays under them
      return;
    }
    if (!this.drag || !p.isDown) return;
    if (Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 6) this.drag.moved = true;
    if (this.drag.paint) { this.tryPlace(p); return; }
    if (this.clearFrom) { this.showClear(p); return; }
    if (this.drag.moved) { const z = this.cameras.main.zoom; this.cameras.main.setScroll(this.drag.sx - (p.x - this.drag.x) / z, this.drag.sy - (p.y - this.drag.y) / z); }
  }
  private onUp(p: Phaser.Input.Pointer) {
    if (this.pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null; this.drag = null; return; }
    const d = this.drag; this.drag = null;
    if (this.clearFrom) { // remove everything of the chosen kinds inside the box
      const ids = this.clearIds(this.clearRect(p)); this.clearFrom = null; this.clearBox?.setVisible(false); this.clearLabel?.setVisible(false);
      if (ids.length && (ids.length < 4 || confirm(`Remove ${ids.length} sections? Half their cost is refunded.`))) demolishMany(ids);
      return;
    }
    if (!d || d.moved || d.paint) return;
    this.tap(p);
  }
  private placeAt(p: Phaser.Input.Pointer, kind: BKind) { const { tx, ty } = this.tileAt(p), [w, h] = footprint(kind); return { x: tx - Math.floor(w / 2), y: ty - Math.floor(h / 2) }; }
  private tryPlace(p: Phaser.Input.Pointer) {
    const ui = getUI(); if (!ui.placing) return;
    const { x, y } = this.placeAt(p, ui.placing), k = `${x},${y}`;
    if (k === this.lastPaint) return; this.lastPaint = k;
    if (canPlace(getState(), ui.placing, x, y)) build(ui.placing, x, y);
  }
  private tap(p: Phaser.Input.Pointer) {
    const ui = getUI(), { tx, ty, wx, wy } = this.tileAt(p), s = getState();
    if (ui.placing) { this.tryPlace(p); if (BUILDINGS[ui.placing].unique) setUI({ placing: null }); return; }
    if (ui.moving) { const b = s.buildings.find((q) => q.id === ui.moving); if (b) { const { x, y } = this.placeAt(p, b.kind); moveBuilding(b.id, x, y); } setUI({ moving: null }); return; }
    if (this.happenings.tap(wx, wy)) return;
    const hit = this.army.hit(wx, wy);
    if (hit) { setUI({ selBat: hit.bat, selArmy: null, selBuilding: null, inspect: hit.squad ? { squad: hit.squad, idx: hit.idx! } : null, panel: 'army' }); return; }
    if (ui.selArmy) { if (!marchArmy(ui.selArmy, wx, wy + 8)) this.marker(wx, wy); return; }
    if (ui.selBat) { if (!marchTo(ui.selBat, wx, wy + 8)) this.marker(wx, wy); return; }
    const b = this.world.buildingAt(tx, ty, s);
    setUI({ selBuilding: b?.id ?? null, inspect: null, panel: b ? 'build' : ui.panel === 'build' ? null : ui.panel });
  }
  private updateGhost(p: Phaser.Input.Pointer) {
    const ui = getUI(), mv = ui.moving ? getState().buildings.find((b) => b.id === ui.moving) : null, kind = ui.placing ?? mv?.kind;
    if (!kind) { this.ghost.setVisible(false); return; }
    const { x, y } = this.placeAt(p, kind), [w, h] = footprint(kind);
    const ok = canPlace(getState(), kind, x, y, mv?.id);
    this.ghost.setVisible(true).setPosition(x * TILE, y * TILE).setSize(w * TILE, h * TILE).setFillStyle(ok ? 0x44ff66 : 0xff4444, 0.3);
  }
  private syncUI() {
    const ui = getUI(), s = getState();
    if (!ui.placing && !ui.moving) this.ghost.setVisible(false);
    const b = s.buildings.find((q) => q.id === ui.selBuilding);
    if (b) { const [w, h] = footprint(b.kind); this.selRect.setVisible(true).setPosition(b.x * TILE, b.y * TILE).setSize(w * TILE, h * TILE); } else this.selRect.setVisible(false);
  }

  /** Occasional chatter between villagers, guards and soldiers that are on screen. */
  private chat() {
    const cam = this.cameras.main; if (cam.zoom < 1.3 || this.chatter.count >= 2 || this.happenings?.playing || Math.random() < 0.4) return;
    const view = cam.worldView, onScreen = (t: { x: number; y: number }) => view.contains(t.x, t.y - 10);
    const people = [...this.ambient.talkers(), ...this.quarters.talkers()].filter((p) => onScreen(p.t));
    const walkers = people.filter((p) => p.walking);
    for (const a of walkers) { const b = walkers.find((x) => x !== a && Math.hypot(x.t.x - a.t.x, x.t.y - a.t.y) < 40); if (b && Math.random() < 0.3) { this.chatter.conversation(a.t, b.t); return; } }
    const soldier = this.army.randomSoldier();
    if (soldier && onScreen(soldier) && (Math.random() < 0.35 || !people.length)) { this.chatter.say(soldier, this.chatter.line('soldier'), 0, this.chatter.voice('soldier')); return; }
    if (people.length) { const p = people[Math.floor(Math.random() * people.length)]; this.chatter.say(p.t, this.chatter.line(p.role), 0, this.chatter.voice(p.role)); }
  }

  // ---------- effects ----------
  private marker(x: number, y: number) {
    const m = this.add.ellipse(x, y, 14, 6).setStrokeStyle(1, 0xffe27a).setDepth(40000);
    this.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 600, onComplete: () => m.destroy() });
  }
  private smoke() {
    for (const [x, y] of this.life?.smoke ?? []) for (let i = 0; i < 3; i++) { const p = this.add.image(x + (Math.random() - 0.5) * 10, y, 'px').setTint(0x4a4440).setAlpha(0.8).setDepth(19000).setScale(2.5); this.tweens.add({ targets: p, y: y - 40 - Math.random() * 20, x: p.x + 8, alpha: 0, scale: 6, duration: 3200, onComplete: () => p.destroy() }); } // damaged buildings still smoulder
    const pts = this.world.smokePts; if (!pts.length) return;
    for (let i = 0; i < Math.min(18, pts.length); i++) {
      const [x, y] = pts[Math.floor(Math.random() * pts.length)];
      const p = this.add.image(x, y, 'px').setTint(0xcfc6b8).setAlpha(0.7).setDepth(19000).setScale(1.5);
      this.tweens.add({ targets: p, y: y - 24, x: x + 5 + Math.random() * 4, alpha: 0, scale: 3.5, duration: 2600, onComplete: () => p.destroy() });
    }
  }
  private fx(fx: Fx) {
    if (fx.kind === 'build' && fx.x != null && fx.y != null) {
      this.floatText(fx.x, fx.y - 24, fx.text, '#ffe27a');
      if (fx.big) { this.cameras.main.shake(300, 0.004); this.cameras.main.flash(300, 255, 230, 160); }
    }
    if (fx.kind === 'reward' || fx.kind === 'stage' || fx.kind === 'promote') {
      const s = getState(), k = s.buildings.find((b) => b.kind === 'keep') ?? s.buildings.find((b) => b.kind === 'camp');
      const w = k ? footprint(k.kind)[0] : 4, x = ((k?.x ?? CAMP_X) + w / 2) * TILE, y = (k?.y ?? CAMP_Y) * TILE;
      const e = this.add.particles(x, y, 'px', { speed: { min: 30, max: 110 }, angle: { min: 200, max: 340 }, gravityY: 120, lifespan: 1300, scale: { start: 1.6, end: 0 }, tint: [0xffe27a, 0xecc94b, 0xfff1a8, 0xffffff], emitting: false }).setDepth(40000);
      e.explode(fx.big ? 120 : 40); this.time.delayedCall(1500, () => e.destroy());
      if (fx.res?.gold) this.floatText(x, y - 10, `+${fx.res.gold} gold`, '#ffe27a');
      if (fx.kind === 'stage') { this.cameras.main.flash(600, 255, 240, 200); this.cameras.main.pan(x, y + 30, 900, 'Sine.easeInOut'); }
    }
  }
  private floatText(x: number, y: number, t: string, color: string) {
    const tx = this.add.text(x, y, t, { fontFamily: 'monospace', fontSize: '28px', color, stroke: '#1d1716', strokeThickness: 6 }).setOrigin(0.5).setScale(0.3).setDepth(40002);
    this.tweens.add({ targets: tx, y: y - 28, alpha: { from: 1, to: 0 }, duration: 1800, ease: 'Cubic.Out', onComplete: () => tx.destroy() });
  }
}
