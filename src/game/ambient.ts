import Phaser from 'phaser';
import { type GameState, type Building, footprint, TILE, count, getState } from '../lib/state.ts';
import { sFrame, S } from './textures.ts';
import { wallWalk } from './art/buildings.ts';
import { UNIT_K, dutySoldiers } from './army.ts';
import { awayBats } from '../lib/warActions.ts';
import { caught as catchThief, theft } from '../lib/town.ts';
import type { Chatter } from './chatter.ts';
import { NavGrid, follow, type Pt } from './paths.ts';
import type { BKind } from '../lib/economy.ts';

type Mode = 'walk' | 'patrol' | 'archer' | 'spar' | 'tilt';
const RANGED = new Set(['archer', 'longbow', 'crossbow', 'royalarcher']);
const YARDS = new Set<BKind>(['farm', 'trainfield', 'range', 'cavstable', 'stable']);
interface Duty { img: Phaser.GameObjects.Image; cls: string; rank: number; kind: 'patrol' | 'post'; x: number; y: number; tx: number; ty: number; wait: number; ph: number; leader?: Duty; chasing?: boolean; onWall?: boolean; hx: number; hy: number; path?: Pt[]; repath?: number }
interface Thief { img: Phaser.GameObjects.Image; x: number; y: number; tx: number; ty: number; path?: Pt[]; state: 'run' | 'caught' | 'gone'; t: number; warned: boolean }
interface Actor { img: Phaser.GameObjects.Image; cls: string; rank: number; mode: Mode; x: number; y: number; tx: number; ty: number; wait: number; a: number; b: number; ph: number; target?: [number, number]; path?: Pt[]; dest?: Place; act?: Act; carry?: Phaser.GameObjects.Image }
/** A place townsfolk go: its doorstep (or a spot in the field) and what they do there. */
interface Place { kind: BKind; b: Building; at: Pt; cx: number; home?: boolean }
type Act = 'inside' | 'browse' | 'draw' | 'hammer' | 'hoe' | 'chat' | 'rest' | 'cheer';
/** What people say while busy at each kind of place. */
const PLACE_LINES: Partial<Record<Act, string[]>> = {
  browse: ['How much for the apples?', 'Two loaves, please.', 'That price is robbery!', 'Fresh fish today?', 'A fine bolt of cloth.', 'I\'ll take a dozen eggs.', 'Any honey left?'],
  draw: ['Fresh water!', 'Heavy bucket...', 'The well runs deep.', 'Cold and clear!'],
  hammer: ['Mind the sparks!', 'Hot iron, coming through!', 'A new horseshoe, then.', 'Strike while it\'s hot!'],
  hoe: ['The wheat grows tall.', 'Back to the furrows.', 'Rain would help.', 'Good soil, this.'],
  rest: ['Home at last.', 'Supper time!', 'My feet ache.'],
};

/** Hour of the day (respecting the always-day / always-night setting). */
const clockHour = () => { const m = getState().settings.dayNight; return m === 'day' ? 12 : m === 'night' ? 23 : new Date().getHours(); };
/** Villagers going about their day, sentries on patrol, archers at practice, knights training. */
export class Ambient {
  actors: Actor[] = [];
  private sig = '';
  private doors: { x: number; y: number }[] = [];
  duty: Duty[] = [];
  private dutySig = '';
  private posts: { x: number; y: number }[] = [];
  private waypoints: { x: number; y: number }[] = [];
  private places: Place[] = [];
  private yards: Building[] = [];
  /** enemies at the gates: townsfolk shelter indoors */ alarm = false;
  /** a victory festival: crowds gather at the market */ festival = false;
  /** Walkable ground: everyone walks around buildings, walls and water. */
  readonly nav = new NavGrid();
  thief: Thief | null = null;
  constructor(private scene: Phaser.Scene, private chatter: Chatter) {
    const T = scene.textures; // a crate and a grain sack for workers to carry
    if (!T.exists('carry0')) { const c = document.createElement('canvas'); c.width = 6; c.height = 5; const x = c.getContext('2d')!; x.fillStyle = '#5e3b1c'; x.fillRect(0, 0, 6, 5); x.fillStyle = '#b07a42'; x.fillRect(1, 1, 4, 3); x.fillStyle = '#5e3b1c'; x.fillRect(1, 2, 4, 1); T.addCanvas('carry0', c); }
    if (!T.exists('carry1')) { const c = document.createElement('canvas'); c.width = 6; c.height = 6; const x = c.getContext('2d')!; x.fillStyle = '#8a6a3a'; x.fillRect(1, 1, 4, 5); x.fillRect(0, 2, 6, 3); x.fillStyle = '#d8c090'; x.fillRect(1, 2, 3, 3); x.fillStyle = '#5a3a1e'; x.fillRect(2, 0, 2, 1); T.addCanvas('carry1', c); }
  }

  sync(s: GameState) {
    if (this.nav.update(s.buildings)) { for (const a of this.actors) a.path = undefined; for (const d of this.duty) d.path = undefined; if (this.thief) this.thief.path = undefined; } // the town changed: plan new routes
    this.syncBase(s); this.syncDuty(s);
  }
  /** A path for a walker, or a direct line if there is no way round (e.g. a newly walled-in spot). */
  private route(from: Pt, to: Pt): Pt[] { return this.nav.path(from, to) ?? [to]; }
  private syncBase(s: GameState) {
    const sig = s.buildings.filter((b) => !['road', 'wall', 'palisade', 'courtyard', 'moat'].includes(b.kind)).map((b) => b.id + b.level + b.x + b.y).join();
    if (sig === this.sig) return; this.sig = sig;
    this.actors.forEach((a) => { a.img.destroy(); a.carry?.destroy(); }); this.actors = [];
    const B = s.buildings.filter((b) => !['road', 'wall', 'palisade', 'courtyard', 'moat'].includes(b.kind));
    const door = (b: Building) => { const [w, h] = footprint(b.kind); return { x: (b.x + w / 2) * TILE, y: (b.y + h) * TILE + 3 }; };
    this.doors = B.map(door);
    // each building's doorstep, nudged onto open ground if something stands in front of it
    this.yards = B.filter((b) => YARDS.has(b.kind));
    this.places = B.flatMap((b): Place[] => {
      const [w, h] = footprint(b.kind), cx = (b.x + w / 2) * TILE;
      if (b.kind === 'farm') return [{ kind: b.kind, b, at: { x: (b.x + 0.5 + Math.random() * (w - 1)) * TILE, y: (b.y + 0.8 + Math.random() * (h - 1)) * TILE }, cx }];
      const d = door(b), t = this.nav.nearestFree(this.nav.tileOf(d), 3); if (!t) return [];
      const at = this.nav.free(this.nav.tileOf(d).x, this.nav.tileOf(d).y) ? d : { x: (t.x + 0.5) * TILE, y: (t.y + 0.75) * TILE };
      return [{ kind: b.kind, b, at, cx }];
    });
    this.doors = this.places.filter((p) => p.kind !== 'farm').map((p) => p.at);
    const nWorkers = Math.min(70, 2 + count(s, 'hut') * 2 + count(s, 'house') * 2 + count(s, 'farm') + count(s, 'market') * 4 + count(s, 'blacksmith'));
    for (let i = 0; i < nWorkers; i++) { const d = this.doors[i % this.doors.length]; this.add(i % 3 === 2 ? 'villager' : 'worker', 0, 'walk', d.x + (i % 5) * 3, d.y); }
    let guards = 0;
    for (const b of B) {
      const [w, h] = footprint(b.kind), x0 = b.x * TILE, y1 = (b.y + h) * TILE;
      if (['watchtower', 'guardhouse', 'tower', 'gatehouse', 'gate'].includes(b.kind) && guards++ < 40) {
        const a = this.add(b.level >= 2 ? 'halberdier' : 'spearman', Math.min(2, b.level - 1), 'patrol', x0 + w * 8, y1 + 4); [a.a, a.b] = this.beat(x0 + w * 8, y1 + 4, 20); // paces only over open ground, never through a wall
      }
      if (b.kind === 'range') for (let i = 0; i < 1 + b.level; i++) { const a = this.add(b.level >= 3 ? 'royalarcher' : b.level === 2 ? 'longbow' : 'archer', 0, 'archer', x0 + 6 + i * 12, y1 - 6); a.target = [x0 + 9 + i * 14, b.y * TILE + 11]; a.ph = i * 7; }
      if (b.kind === 'trainfield') {
        const p1 = this.add('swordsman', 1, 'spar', x0 + 14, y1 - 14), p2 = this.add('manatarms', 1, 'spar', x0 + 26, y1 - 14); p2.img.setFlipX(true); p2.ph = 3; void p1;
        if (b.level >= 2) { const k = this.add('mknight', 2, 'tilt', x0 + 6, y1 - 22); k.a = x0 + 6; k.b = x0 + w * TILE - 6; }
      }
      if (b.kind === 'barracks') { for (let i = 0; i < b.level; i++) { const a = this.add(['militia', 'spearman', 'swordsman'][i], i, 'spar', x0 + 10 + i * 13, y1 + 7); a.ph = i * 2; /* sparring in the yard before the barracks */ } }
      if (b.kind === 'cavstable' || b.kind === 'stable') { const k = this.add(b.kind === 'stable' ? 'lightcav' : 'mknight', 1, 'tilt', x0 + 8, y1 + 6); k.a = x0; k.b = x0 + w * TILE; }
    }
  }
  private add(cls: string, rank: number, mode: Mode, x: number, y: number): Actor {
    const img = this.scene.add.image(x, y, 'soldiers', sFrame(cls, rank, 0)).setOrigin(0.5, 1).setScale(S * UNIT_K);
    const a: Actor = { img, cls, rank, mode, x, y, tx: x, ty: y, wait: Math.random() * 3000, a: x, b: x, ph: Math.floor(Math.random() * 8) };
    this.actors.push(a); return a;
  }

  /** Soldiers on town duty: patrols walk in pairs between buildings and roads; garrisons guard doors. */
  private syncDuty(s: GameState) {
    const away = awayBats(s), bats = s.battalions.filter((b) => b.orders && b.orders !== 'formation' && !away.has(b.id));
    const sig = bats.map((b) => b.id + b.orders + dutySoldiers(s, b).map((d) => d.cls + d.rank).join()).join('|') + this.sig;
    if (sig === this.dutySig) return; this.dutySig = sig;
    this.duty.forEach((d) => d.img.destroy()); this.duty = [];
    const B = s.buildings.filter((b) => !['road', 'wall', 'palisade', 'courtyard', 'moat'].includes(b.kind));
    const roads = s.buildings.filter((b) => b.kind === 'road');
    this.waypoints = [...this.doors, ...roads.filter((_, i) => i % 3 === 0).slice(0, 60).map((r) => ({ x: (r.x + 0.5) * TILE, y: (r.y + 0.8) * TILE }))];
    // guard posts: beside doors, gates and towers first, then homes and shops
    const pri = (k: string) => (['gatehouse', 'gate', 'keep', 'tower', 'watchtower', 'guardhouse', 'market', 'camp'].includes(k) ? 0 : 1);
    this.posts = [...B].sort((a, b) => pri(a.kind) - pri(b.kind)).flatMap((b) => { const [w, h] = footprint(b.kind), x = (b.x + w / 2) * TILE, y = (b.y + h) * TILE + 5; return [{ x: x - 9, y }, { x: x + 9, y }]; });
    // wall-walk posts for bowmen: east-west runs of wall or palisade (they face out over the parapet), evenly spread
    const wallAt = new Set(s.buildings.filter((b) => b.kind === 'wall' || b.kind === 'palisade').map((b) => `${b.x},${b.y}`));
    const runs = s.buildings.filter((b) => (b.kind === 'wall' || b.kind === 'palisade') && !wallAt.has(`${b.x},${b.y - 1}`) && !wallAt.has(`${b.x},${b.y + 1}`)).sort((a, b) => a.y - b.y || a.x - b.x);
    const wallPosts = runs.filter((_, i) => i % 2 === 0).map((b) => ({ x: (b.x + 0.5) * TILE, y: (b.y + 1) * TILE - wallWalk(b.kind as 'wall' | 'palisade', b.level) }));
    const order = [...wallPosts.keys()].sort((a, b) => ((a * 0.618034) % 1) - ((b * 0.618034) % 1)), spread = (k: number, _n: number) => wallPosts[order[k]];
    let post = 0, onWall = 0;
    for (const b of bats) {
      const men = dutySoldiers(s, b);
      if (b.orders === 'garrison') for (const m of men) {
        if (RANGED.has(m.cls) && onWall < wallPosts.length) { const p = spread(onWall++, wallPosts.length); const d = this.addDuty(m.cls, m.rank, 'post', p.x, p.y); d.onWall = true; d.img.setFlipX(onWall % 2 === 0); continue; } const p = this.posts[post++ % Math.max(1, this.posts.length)] ?? { x: b.x, y: b.y }; this.addDuty(m.cls, m.rank, 'post', p.x + (post > this.posts.length ? 4 : 0), p.y).img.setFlipX(post % 2 === 0); }
      else for (let i = 0; i < men.length; i += 2) {
        const start = this.waypoints[Math.floor(Math.random() * Math.max(1, this.waypoints.length))] ?? { x: b.x, y: b.y };
        const lead = this.addDuty(men[i].cls, men[i].rank, 'patrol', start.x, start.y);
        if (men[i + 1]) { const f = this.addDuty(men[i + 1].cls, men[i + 1].rank, 'patrol', start.x - 9, start.y + 3); f.leader = lead; }
      }
    }
  }
  private addDuty(cls: string, rank: number, kind: Duty['kind'], x: number, y: number): Duty {
    const img = this.scene.add.image(x, y, 'soldiers', sFrame(cls, rank, 0)).setOrigin(0.5, 1).setScale(S * UNIT_K);
    const d: Duty = { img, cls, rank, kind, x, y, tx: x, ty: y, wait: Math.random() * 4000, ph: Math.floor(Math.random() * 8), hx: x, hy: y };
    this.duty.push(d); return d;
  }
  /** A thief slips out of a building and runs for the edge of the map. */
  spawnThief() {
    if (this.thief || !this.doors.length) return false;
    const d = this.doors[Math.floor(Math.random() * this.doors.length)], W = this.scene.cameras.main.getBounds();
    const edges = [{ x: Math.max(0, W.x + 40), y: d.y }, { x: W.right - 40, y: d.y }, { x: d.x, y: W.bottom - 40 }];
    const e = edges.sort((a, b) => Math.hypot(a.x - d.x, a.y - d.y) - Math.hypot(b.x - d.x, b.y - d.y))[0];
    const img = this.scene.add.image(d.x, d.y, 'soldiers', sFrame('villager', 0, 0)).setOrigin(0.5, 1).setScale(S * UNIT_K).setTint(0x6a5a8a);
    this.thief = { img, x: d.x, y: d.y, tx: e.x, ty: e.y, state: 'run', t: 0, warned: false };
    this.chatter.say(this.thiefTarget(), 'Heh heh, easy pickings!', 0, 640);
    return true;
  }
  private thiefTarget() { const t = this.thief!; return { get x() { return t.x; }, get y() { return t.y; }, h: 16, alive: () => t.img.active }; }
  private dutyTarget(d: Duty) { return { get x() { return d.x; }, get y() { return d.y; }, h: 16, alive: () => d.img.active }; }
  private updateThief(dt: number, tick: number) {
    const t = this.thief; if (!t) return;
    t.t += dt;
    if (t.state === 'run') {
      if (!t.path) t.path = this.route(t, { x: t.tx, y: t.ty }); // slips away down the alleys
      const dir = follow(t, dt, 24); if (dir) t.img.setFlipX(dir < 0);
      const d = t.path.length ? Math.hypot(t.tx - t.x, t.ty - t.y) : 0;
      t.img.setFrame(sFrame('villager', 0, tick % 4));
      for (const g of this.duty) if (!g.chasing && !g.onWall && Math.hypot(g.x - t.x, g.y - t.y) < 110) { g.chasing = true; if (!t.warned) { t.warned = true; this.chatter.say(this.dutyTarget(g), 'Stop, thief!', 0, 300); } }
      const catcher = this.duty.find((g) => g.chasing && Math.hypot(g.x - t.x, g.y - t.y) < 8);
      if (catcher) { t.state = 'caught'; t.t = 0; this.chatter.say(this.thiefTarget(), 'I yield! I yield!', 0, 640); catchThief(); }
      else if (d < 3 || t.t > 16000) { t.state = 'gone'; t.t = 0; theft(); }
    } else if (t.t > 2500) {
      this.scene.tweens.add({ targets: t.img, alpha: 0, duration: 400, onComplete: () => t.img.destroy() });
      this.duty.forEach((g) => { g.chasing = false; }); this.thief = null; return;
    }
    t.img.setPosition(Math.round(t.x), Math.round(t.y)).setDepth(this.depthAt(t.x, t.y));
  }
  private updateDuty(dt: number, tick: number) {
    for (const g of this.duty) {
      let f = 0, sp = 11, tx = g.tx, ty = g.ty;
      if (g.chasing && this.thief) { // run the thief down by the streets, re-planning as he dodges
        if ((g.repath = (g.repath ?? 0) - dt) <= 0 || !g.path?.length) { g.path = this.route(g, this.thief); g.repath = 600; }
        const dir = follow(g, dt, 30); if (dir) g.img.setFlipX(dir < 0);
        g.img.setFrame(sFrame(g.cls, g.rank, (tick + g.ph) % 4)).setPosition(Math.round(g.x), Math.round(g.y)).setDepth(this.depthAt(g.x, g.y)); continue;
      }
      if (g.kind === 'patrol' && !g.leader) { // walk the beat from doorstep to street corner, around the buildings
        g.repath = undefined;
        if (g.path?.length) { const dir = follow(g, dt, this.alarm ? 28 : 11); if (dir) g.img.setFlipX(dir < 0); f = (tick + g.ph) % 4; }
        else if ((g.wait -= dt) < 0) { const w = this.alarm && this.posts.length ? this.posts[Math.floor(Math.random() * Math.min(6, this.posts.length))] : this.waypoints[Math.floor(Math.random() * this.waypoints.length)]; /* to the gates and towers when the enemy comes */ if (w) g.path = this.nav.path(g, { x: w.x + (Math.random() - 0.5) * 10, y: w.y }) ?? undefined; g.wait = 1200 + Math.random() * 2500; }
        g.img.setFrame(sFrame(g.cls, g.rank, f)).setPosition(Math.round(g.x), Math.round(g.y)).setDepth(this.depthAt(g.x, g.y)); continue;
      }
      if (g.leader) { const L = g.leader, dir = L.img.flipX ? 1 : -1; tx = L.x + dir * 9; ty = L.y + 3; sp = 13; }
      else if (g.kind === 'post') { tx = g.hx; ty = g.hy; if ((g.wait -= dt) < 0) { g.wait = 4000 + Math.random() * 5000; g.img.setFlipX(!g.img.flipX); } }
      const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
      if (d > 1.5) { const k = Math.min(1, ((dt / 1000) * sp) / d); g.x += dx * k; g.y += dy * k; if (Math.abs(dx) > 0.5) g.img.setFlipX(dx < 0); f = (tick + g.ph) % 4; }
      else if (g.kind === 'post' && (tick + g.ph) % 40 === 0) f = 2;
      g.img.setFrame(sFrame(g.cls, g.rank, f)).setPosition(Math.round(g.x), Math.round(g.y)).setDepth(this.depthAt(g.x, g.y));
    }
  }

  /** Speech targets: role plus a live position for each villager, guard and trainee. */
  talkers() {
    const duty = this.duty.filter((g) => !g.leader).map((g) => ({ role: g.kind === 'post' ? 'guard' : 'patrol', walking: false, t: this.dutyTarget(g) }));
    return [...duty, ...this.actors.filter((a) => a.act !== 'inside').map((a) => ({ role: a.mode === 'walk' ? (a.cls === 'worker' ? 'worker' : 'villager') : a.mode === 'patrol' ? 'guard' : a.mode === 'archer' ? 'archer' : a.mode === 'spar' ? 'spar' : 'soldier',
      walking: a.mode === 'walk', t: { get x() { return a.x; }, get y() { return a.y; }, h: 16, alive: () => a.img.active && a.img.visible } }))];
  }
  update(time: number, dt: number) {
    const tick = Math.floor(time / 150);
    this.updateDuty(dt, tick); this.updateThief(dt, tick);
    for (const a of this.actors) {
      let f = 0;
      if (a.mode === 'walk') f = this.walker(a, dt, tick);
      else if (a.mode === 'patrol' || a.mode === 'tilt') {
        const sp = a.mode === 'tilt' ? 26 : 9, dir = a.tx >= a.x ? 1 : -1;
        if (a.wait > 0) { a.wait -= dt; f = 0; } else {
          if (a.tx === a.x || (dir > 0 && a.x >= a.b) || (dir < 0 && a.x <= a.a)) { a.tx = dir > 0 ? a.a : a.b; a.wait = a.mode === 'tilt' ? 600 : 2500; }
          a.x += Math.sign(a.tx - a.x) * Math.min((dt / 1000) * sp, Math.abs(a.tx - a.x)); a.img.setFlipX(a.tx < a.x); f = (tick + a.ph) % 4;
        }
      } else if (a.mode === 'archer') {
        const cyc = (Math.floor(time / 250) + a.ph) % 10; f = cyc < 4 ? 0 : cyc < 8 ? 4 : 5;
        if (cyc === 8 && a.wait <= 0 && a.target) { a.wait = 1000; this.shoot(a.x + 4, a.y - 12, a.target[0], a.target[1]); }
        a.wait -= dt;
      } else if (a.mode === 'spar') { const cyc = (Math.floor(time / 220) + a.ph) % 6; f = cyc < 2 ? 0 : cyc < 4 ? 4 : 5; if (cyc === 4 && Math.random() < 0.05) this.spark(a.x + (a.img.flipX ? -6 : 6), a.y - 12); }
      a.img.setFrame(sFrame(a.cls, a.rank, f)).setPosition(Math.round(a.x), Math.round(a.y)).setDepth(this.depthAt(a.x, a.y));
    }
  }
  // ---------------- townsfolk: walk the streets to a place, do something there, move on ----------------
  private walker(a: Actor, dt: number, tick: number): number {
    a.carry?.setPosition(Math.round(a.x + (a.img.flipX ? -3 : 3)), Math.round(a.y - 9)).setDepth(a.y + 0.1).setVisible(a.img.visible);
    if (this.alarm && a.act !== 'inside' && !a.dest?.home) { this.shelter(a); }
    if (a.act) {
      if (!(this.alarm && a.act === 'inside')) a.wait -= dt; // indoors until the danger passes
      let f = 0;
      const cyc = (tick + a.ph) % 12;
      if (a.act === 'browse') { f = cyc < 2 ? 4 : 0; if (cyc === 6 && Math.random() < 0.01) a.img.setFlipX(!a.img.flipX); } // points at the wares, looks around
      else if (a.act === 'draw') f = cyc % 6 < 3 ? 4 : 5; // winds the windlass
      else if (a.act === 'hammer') { f = cyc % 4 < 2 ? 4 : 5; if (cyc % 4 === 2 && Math.random() < 0.15) this.spark(a.x + (a.img.flipX ? -6 : 6), a.y - 8); }
      else if (a.act === 'hoe') f = cyc % 8 < 4 ? 4 : 5;
      else if (a.act === 'cheer') { f = cyc % 4 < 2 ? 4 : 0; a.img.setY(Math.round(a.y) - (cyc % 4 < 2 ? 2 : 0)); }
      if (a.wait <= 0) {
        if (a.act === 'inside') { a.img.setVisible(true); this.scene.tweens.add({ targets: a.img, alpha: 1, duration: 300 }); } // steps back out of the door
        a.act = undefined; a.dest = undefined; this.goSomewhere(a);
      }
      return f;
    }
    if (!a.path) { if ((a.wait -= dt) > 0) return 0; this.goSomewhere(a); return 0; }
    if (a.path.length) { const dir = follow(a, dt, this.alarm ? 30 : 14); if (dir) a.img.setFlipX(dir < 0); return (tick + a.ph) % 4; }
    // arrived
    a.path = undefined; this.arrive(a); return 0;
  }
  /** Draw order for someone at a point: people working a field stand among its crops, in front of the field's sprite. */
  depthAt(x: number, y: number) {
    // open yards (fields, the training ground, the archery range, paddocks): people inside stand in front of the yard's fence and ground
    for (const b of this.yards) { const [w, h] = footprint(b.kind); if (x >= b.x * TILE && x < (b.x + w) * TILE && y >= b.y * TILE && y <= (b.y + h) * TILE + 2) return (b.y + h) * TILE + 0.5 + y / 1000; }
    return y;
  }
  /** Enemies at the gates: hurry indoors to the nearest home and stay there. */
  private shelter(a: Actor) {
    if (a.act === 'inside' || a.dest?.home) return;
    const homes = this.places.filter((p) => ['house', 'hut', 'keep', 'greathall', 'palace', 'camp'].includes(p.kind)).sort((x, y) => Math.hypot(x.at.x - a.x, x.at.y - a.y) - Math.hypot(y.at.x - a.x, y.at.y - a.y));
    for (const p of homes.slice(0, 3)) { const path = this.nav.path(a, p.at); if (path) { a.act = undefined; a.path = path; a.dest = { ...p, home: true }; a.img.setVisible(true).setAlpha(1); return; } }
    if (homes[0]) { a.dest = { ...homes[0], home: true }; a.path = undefined; a.act = 'rest'; a.wait = 8000; } // nowhere to run: cower where they stand
  }
  /** The stretch of open ground a sentry may pace (left and right of a point), stopping at walls and buildings. */
  private beat(x: number, y: number, reach: number): [number, number] {
    const t = this.nav.tileOf({ x, y }); if (!this.nav.free(t.x, t.y)) return [x, x];
    let l = t.x, r = t.x; const max = Math.ceil(reach / TILE) + 1;
    while (l > t.x - max && this.nav.free(l - 1, t.y)) l--; while (r < t.x + max && this.nav.free(r + 1, t.y)) r++;
    return [Math.max(x - reach, l * TILE + 4), Math.min(x + reach, (r + 1) * TILE - 4)];
  }
  /** The doorstep of a random building of these kinds (for carts and travellers). */
  placeOf(kinds: BKind[]): Pt | null { const l = this.places.filter((p) => kinds.includes(p.kind)); return l.length ? l[Math.floor(Math.random() * l.length)].at : null; }
  /** Chooses where to go next: workers to fields, forge and stores; everyone to market, well and home. */
  private goSomewhere(a: Actor) {
    if (!this.places.length) { a.wait = 3000; return; }
    if (this.alarm) { this.shelter(a); return; }
    // daily routine: fields in the morning, market in the evening, home at night; a festival draws everyone to the square
    const hr = clockHour(), night = hr >= 21 || hr < 5, morning = hr >= 6 && hr < 11, evening = hr >= 17 && hr < 21, carrying = !!a.carry;
    const base = { market: 5, well: 3, house: 3, hut: 3, farm: a.cls === 'worker' ? 5 : 0.5, blacksmith: a.cls === 'worker' ? 3 : 1, storehouse: a.cls === 'worker' ? 3 : 0.5, camp: 1, keep: 0.5, greathall: 1, stable: 1, palace: 0.5 } as Partial<Record<BKind, number>>;
    const weight = (p: Place) => { let w = base[p.kind] ?? 0.2; const home = p.kind === 'house' || p.kind === 'hut' || p.kind === 'camp';
      if (carrying) return p.kind === 'storehouse' || p.kind === 'market' ? 10 : 0.05; // deliver the load first
      if (this.festival) return p.kind === 'market' || p.kind === 'keep' || p.kind === 'camp' ? w * 8 : w * 0.3;
      if (night) return home ? w * 6 : w * 0.12; if (morning && p.kind === 'farm') w *= 2; if (evening && (p.kind === 'market' || p.kind === 'well')) w *= 2; return w; };
    for (let tries = 0; tries < 4; tries++) {
      const total = this.places.reduce((t, p) => t + weight(p), 0); let r = Math.random() * total;
      const p = this.places.find((x) => (r -= weight(x)) <= 0) ?? this.places[0];
      let at = p.at;
      if (p.kind === 'farm') { const [w, h] = footprint('farm'); at = { x: (p.b.x + 0.5 + Math.random() * (w - 1)) * TILE, y: (p.b.y + 0.8 + Math.random() * (h - 1)) * TILE }; }
      else at = { x: at.x + (Math.random() - 0.5) * (p.kind === 'market' ? 30 : 10), y: at.y + Math.random() * 3 };
      const path = this.nav.path(a, at); if (!path) continue;
      a.path = path; a.dest = { ...p, at, home: ['house', 'hut', 'keep', 'greathall', 'palace', 'camp'].includes(p.kind) }; return;
    }
    a.wait = 2000 + Math.random() * 3000; // nowhere reachable just now
  }
  /** At the place: go inside homes, haggle at the market, draw water, work the forge or the field. */
  private arrive(a: Actor) {
    const p = a.dest; if (!p) { a.wait = 1500; return; }
    const worker = a.cls === 'worker', home = ['house', 'hut', 'keep', 'greathall', 'palace', 'camp', 'stable', 'storehouse'].includes(p.kind);
    const act: Act = p.kind === 'market' ? 'browse' : p.kind === 'well' ? 'draw' : p.kind === 'blacksmith' ? (worker ? 'hammer' : 'browse') : p.kind === 'farm' ? 'hoe' : home ? (Math.random() < 0.75 ? 'inside' : 'rest') : 'rest';
    const act1: Act = this.alarm && p.home ? 'inside' : act;
    const act2: Act = this.festival && (p.kind === 'market' || p.kind === 'keep' || p.kind === 'camp') ? 'cheer' : act1;
    if (a.carry && (p.kind === 'storehouse' || p.kind === 'market')) { a.carry.destroy(); a.carry = undefined; } // load delivered
    a.act = act2;
    a.wait = act2 === 'cheer' ? 6000 + Math.random() * 6000 : { inside: 5000 + Math.random() * 9000, browse: 4000 + Math.random() * 5000, draw: 2500 + Math.random() * 1500, hammer: 4000 + Math.random() * 3000, hoe: 5000 + Math.random() * 5000, chat: 3000, rest: 2000 + Math.random() * 2500, cheer: 6000 }[act] * (act === 'inside' && (clockHour() >= 21 || clockHour() < 5) ? 5 : 1); // a night's sleep
    if (act !== 'hoe') a.img.setFlipX(p.cx < a.x); // face the building
    if (a.cls === 'worker' && !a.carry && (act === 'hoe' || act === 'hammer') && Math.random() < 0.6 && this.places.some((x) => x.kind === 'storehouse' || x.kind === 'market')) this.scene.time.delayedCall(a.wait, () => { if (a.img.active && !a.carry) a.carry = this.scene.add.image(a.x, a.y, act === 'hoe' ? 'carry1' : 'carry0').setOrigin(0.5, 1); }); // the harvest or the forge's work goes to market
    if (act === 'inside') this.scene.tweens.add({ targets: a.img, alpha: 0, duration: 300, onComplete: () => { if (a.act === 'inside') a.img.setVisible(false); } });
    const lines = PLACE_LINES[act];
    if (lines && this.chatter.count < 3 && Math.random() < 0.3) this.chatter.say({ get x() { return a.x; }, get y() { return a.y; }, h: 16, alive: () => a.img.active && a.img.visible }, lines[Math.floor(Math.random() * lines.length)], 300, this.chatter.voice(worker ? 'worker' : 'villager'));
  }
  shoot(x: number, y: number, tx: number, ty: number) {
    const ar = this.scene.add.image(x, y, 'arrow').setDepth(9000).setRotation(Math.atan2(ty - y, tx - x));
    this.scene.tweens.add({ targets: ar, x: tx, y: ty, duration: 380, onComplete: () => this.scene.time.delayedCall(700, () => ar.destroy()) });
  }
  spark(x: number, y: number) {
    const p = this.scene.add.image(x, y, 'px').setTint(0xfff1a8).setDepth(9000);
    this.scene.tweens.add({ targets: p, alpha: 0, y: y - 4, duration: 250, onComplete: () => p.destroy() });
  }
}
