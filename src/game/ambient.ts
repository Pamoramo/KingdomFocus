import Phaser from 'phaser';
import { type GameState, type Building, footprint, TILE, count } from '../lib/state.ts';
import { sFrame, S } from './textures.ts';

type Mode = 'walk' | 'patrol' | 'archer' | 'spar' | 'tilt';
interface Actor { img: Phaser.GameObjects.Image; cls: string; rank: number; mode: Mode; x: number; y: number; tx: number; ty: number; wait: number; a: number; b: number; ph: number; target?: [number, number] }

/** Villagers going about their day, sentries on patrol, archers at practice, knights training. */
export class Ambient {
  private actors: Actor[] = [];
  private sig = '';
  private doors: { x: number; y: number }[] = [];
  constructor(private scene: Phaser.Scene) {}

  sync(s: GameState) {
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
    const img = this.scene.add.image(x, y, 'soldiers', sFrame(cls, rank, 0)).setOrigin(0.5, 1).setScale(S);
    const a: Actor = { img, cls, rank, mode, x, y, tx: x, ty: y, wait: Math.random() * 3000, a: x, b: x, ph: Math.floor(Math.random() * 8) };
    this.actors.push(a); return a;
  }

  update(time: number, dt: number) {
    const tick = Math.floor(time / 150);
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
