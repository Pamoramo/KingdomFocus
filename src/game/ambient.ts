import Phaser from 'phaser';
import { type GameState, type Building, footprint, TILE, count } from '../lib/state.ts';
import { sFrame, S } from './textures.ts';
import { UNIT_K, dutySoldiers } from './army.ts';
import { awayBats } from '../lib/warActions.ts';
import { caught as catchThief, theft } from '../lib/town.ts';
import type { Chatter } from './chatter.ts';

type Mode = 'walk' | 'patrol' | 'archer' | 'spar' | 'tilt';
interface Duty { img: Phaser.GameObjects.Image; cls: string; rank: number; kind: 'patrol' | 'post'; x: number; y: number; tx: number; ty: number; wait: number; ph: number; leader?: Duty; chasing?: boolean; hx: number; hy: number }
interface Thief { img: Phaser.GameObjects.Image; x: number; y: number; tx: number; ty: number; state: 'run' | 'caught' | 'gone'; t: number; warned: boolean }
interface Actor { img: Phaser.GameObjects.Image; cls: string; rank: number; mode: Mode; x: number; y: number; tx: number; ty: number; wait: number; a: number; b: number; ph: number; target?: [number, number] }

/** Villagers going about their day, sentries on patrol, archers at practice, knights training. */
export class Ambient {
  actors: Actor[] = [];
  private sig = '';
  private doors: { x: number; y: number }[] = [];
  duty: Duty[] = [];
  private dutySig = '';
  private posts: { x: number; y: number }[] = [];
  private waypoints: { x: number; y: number }[] = [];
  thief: Thief | null = null;
  constructor(private scene: Phaser.Scene, private chatter: Chatter) {}

  sync(s: GameState) { this.syncBase(s); this.syncDuty(s); }
  private syncBase(s: GameState) {
    const sig = s.buildings.filter((b) => !['road', 'wall', 'palisade', 'courtyard', 'moat'].includes(b.kind)).map((b) => b.id + b.level + b.x + b.y).join();
    if (sig === this.sig) return; this.sig = sig;
    this.actors.forEach((a) => a.img.destroy()); this.actors = [];
    const B = s.buildings.filter((b) => !['road', 'wall', 'palisade', 'courtyard', 'moat'].includes(b.kind));
    const door = (b: Building) => { const [w, h] = footprint(b.kind); return { x: (b.x + w / 2) * TILE, y: (b.y + h) * TILE + 3 }; };
    this.doors = B.map(door);
    const nWorkers = Math.min(70, 2 + count(s, 'hut') * 2 + count(s, 'house') * 2 + count(s, 'farm') + count(s, 'market') * 4 + count(s, 'blacksmith'));
    for (let i = 0; i < nWorkers; i++) { const d = this.doors[i % this.doors.length]; this.add(i % 3 === 2 ? 'villager' : 'worker', 0, 'walk', d.x + (i % 5) * 3, d.y); }
    let guards = 0;
    for (const b of B) {
      const [w, h] = footprint(b.kind), x0 = b.x * TILE, y1 = (b.y + h) * TILE;
      if (['watchtower', 'guardhouse', 'tower', 'gatehouse', 'gate'].includes(b.kind) && guards++ < 40) {
        const a = this.add(b.level >= 2 ? 'halberdier' : 'spearman', Math.min(2, b.level - 1), 'patrol', x0 + w * 8, y1 + 4); a.a = x0 - 20; a.b = x0 + w * TILE + 20;
      }
      if (b.kind === 'range') for (let i = 0; i < 1 + b.level; i++) { const a = this.add(b.level >= 3 ? 'royalarcher' : b.level === 2 ? 'longbow' : 'archer', 0, 'archer', x0 + 6 + i * 12, y1 - 6); a.target = [x0 + 9 + i * 14, b.y * TILE + 11]; a.ph = i * 7; }
      if (b.kind === 'trainfield') {
        const p1 = this.add('swordsman', 1, 'spar', x0 + 14, y1 - 14), p2 = this.add('manatarms', 1, 'spar', x0 + 26, y1 - 14); p2.img.setFlipX(true); p2.ph = 3; void p1;
        if (b.level >= 2) { const k = this.add('mknight', 2, 'tilt', x0 + 6, y1 - 22); k.a = x0 + 6; k.b = x0 + w * TILE - 6; }
      }
      if (b.kind === 'barracks') { for (let i = 0; i < b.level; i++) { const a = this.add(['militia', 'spearman', 'swordsman'][i], i, 'spar', x0 + 10 + i * 13, y1 - 4); a.ph = i * 2; } }
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
    let post = 0;
    for (const b of bats) {
      const men = dutySoldiers(s, b);
      if (b.orders === 'garrison') for (const m of men) { const p = this.posts[post++ % Math.max(1, this.posts.length)] ?? { x: b.x, y: b.y }; this.addDuty(m.cls, m.rank, 'post', p.x + (post > this.posts.length ? 4 : 0), p.y).img.setFlipX(post % 2 === 0); }
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
    this.chatter.say(this.thiefTarget(), 'Heh heh, easy pickings!');
    return true;
  }
  private thiefTarget() { const t = this.thief!; return { get x() { return t.x; }, get y() { return t.y; }, h: 16, alive: () => t.img.active }; }
  private dutyTarget(d: Duty) { return { get x() { return d.x; }, get y() { return d.y; }, h: 16, alive: () => d.img.active }; }
  private updateThief(dt: number, tick: number) {
    const t = this.thief; if (!t) return;
    t.t += dt;
    if (t.state === 'run') {
      const dx = t.tx - t.x, dy = t.ty - t.y, d = Math.hypot(dx, dy), sp = (dt / 1000) * 24;
      if (d > 1) { t.x += (dx / d) * Math.min(sp, d); t.y += (dy / d) * Math.min(sp, d); t.img.setFlipX(dx < 0); }
      t.img.setFrame(sFrame('villager', 0, tick % 4));
      for (const g of this.duty) if (!g.chasing && Math.hypot(g.x - t.x, g.y - t.y) < 110) { g.chasing = true; if (!t.warned) { t.warned = true; this.chatter.say(this.dutyTarget(g), 'Stop, thief!'); } }
      const catcher = this.duty.find((g) => g.chasing && Math.hypot(g.x - t.x, g.y - t.y) < 8);
      if (catcher) { t.state = 'caught'; t.t = 0; this.chatter.say(this.thiefTarget(), 'I yield! I yield!'); catchThief(); }
      else if (d < 3 || t.t > 16000) { t.state = 'gone'; t.t = 0; theft(); }
    } else if (t.t > 2500) {
      this.scene.tweens.add({ targets: t.img, alpha: 0, duration: 400, onComplete: () => t.img.destroy() });
      this.duty.forEach((g) => { g.chasing = false; }); this.thief = null; return;
    }
    t.img.setPosition(Math.round(t.x), Math.round(t.y)).setDepth(t.y);
  }
  private updateDuty(dt: number, tick: number) {
    for (const g of this.duty) {
      let f = 0, sp = 11, tx = g.tx, ty = g.ty;
      if (g.chasing && this.thief) { tx = this.thief.x; ty = this.thief.y; sp = 30; }
      else if (g.leader) { const L = g.leader, dir = L.img.flipX ? 1 : -1; tx = L.x + dir * 9; ty = L.y + 3; sp = 13; }
      else if (g.kind === 'post') { tx = g.hx; ty = g.hy; if ((g.wait -= dt) < 0) { g.wait = 4000 + Math.random() * 5000; g.img.setFlipX(!g.img.flipX); } }
      else if (Math.hypot(g.tx - g.x, g.ty - g.y) < 2) { if ((g.wait -= dt) < 0) { const w = this.waypoints[Math.floor(Math.random() * this.waypoints.length)]; if (w) { g.tx = w.x + (Math.random() - 0.5) * 10; g.ty = w.y; } g.wait = 1200 + Math.random() * 2500; } tx = g.x; ty = g.y; }
      const dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy);
      if (d > 1.5) { const k = Math.min(1, ((dt / 1000) * sp) / d); g.x += dx * k; g.y += dy * k; if (Math.abs(dx) > 0.5) g.img.setFlipX(dx < 0); f = (tick + g.ph) % 4; }
      else if (g.kind === 'post' && (tick + g.ph) % 40 === 0) f = 2;
      g.img.setFrame(sFrame(g.cls, g.rank, f)).setPosition(Math.round(g.x), Math.round(g.y)).setDepth(g.y);
    }
  }

  /** Speech targets: role plus a live position for each villager, guard and trainee. */
  talkers() {
    const duty = this.duty.filter((g) => !g.leader).map((g) => ({ role: g.kind === 'post' ? 'guard' : 'patrol', walking: false, t: this.dutyTarget(g) }));
    return [...duty, ...this.actors.map((a) => ({ role: a.mode === 'walk' ? (a.cls === 'worker' ? 'worker' : 'villager') : a.mode === 'patrol' ? 'guard' : a.mode === 'archer' ? 'archer' : a.mode === 'spar' ? 'spar' : 'soldier',
      walking: a.mode === 'walk', t: { get x() { return a.x; }, get y() { return a.y; }, h: 16, alive: () => a.img.active } }))];
  }
  update(time: number, dt: number) {
    const tick = Math.floor(time / 150);
    this.updateDuty(dt, tick); this.updateThief(dt, tick);
    for (const a of this.actors) {
      let f = 0;
      if (a.mode === 'walk') {
        if (a.wait > 0) { a.wait -= dt; f = 0; if (a.wait <= 0 && this.doors.length) { const d = this.doors[Math.floor(Math.random() * this.doors.length)]; a.tx = d.x + (Math.random() - 0.5) * 16; a.ty = d.y + Math.random() * 6; } }
        else { const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy), sp = (dt / 1000) * 14; if (d < 1) a.wait = 1500 + Math.random() * 5000; else { a.x += (dx / d) * Math.min(sp, d); a.y += (dy / d) * Math.min(sp, d); a.img.setFlipX(dx < 0); } f = (tick + a.ph) % 4; }
      } else if (a.mode === 'patrol' || a.mode === 'tilt') {
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
      a.img.setFrame(sFrame(a.cls, a.rank, f)).setPosition(Math.round(a.x), Math.round(a.y)).setDepth(a.y);
    }
  }
  private shoot(x: number, y: number, tx: number, ty: number) {
    const ar = this.scene.add.image(x, y, 'arrow').setDepth(9000).setRotation(Math.atan2(ty - y, tx - x));
    this.scene.tweens.add({ targets: ar, x: tx, y: ty, duration: 380, onComplete: () => this.scene.time.delayedCall(700, () => ar.destroy()) });
  }
  private spark(x: number, y: number) {
    const p = this.scene.add.image(x, y, 'px').setTint(0xfff1a8).setDepth(9000);
    this.scene.tweens.add({ targets: p, alpha: 0, y: y - 4, duration: 250, onComplete: () => p.destroy() });
  }
}
