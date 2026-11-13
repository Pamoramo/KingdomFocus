import Phaser from 'phaser';
import type { BattlePlay } from '../lib/state.ts';
import { unitStats, type Unit } from '../lib/battle.ts';
import { canvas, r, rng, P, shade, stoneBlock, crenel } from './art/px.ts';
import { hdify } from './art/hd.ts';
import { sFrame, bannerTex, S } from './textures.ts';
import { audio } from './audio.ts';
import { setUI, getUI } from './ui.ts';
import { ENGINE_IDS } from '../lib/war.ts';

const W = 480, H = 270, MAX = 90; // logical battlefield size, sprites per side
const GROUND: Record<string, [string, string]> = { plains: ['#6a9a40', '#5d8a36'], forest: ['#3f6d2c', '#335a24'], hills: ['#7a8a4a', '#6a7a40'], river: ['#5d9a3b', '#4e8a30'], marsh: ['#5a6a3a', '#4a5a30'] };

function field(terrain: string, siege: boolean, seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(W, H), R = rng(seed), [g1, g2] = GROUND[terrain] ?? GROUND.plains;
  r(c, 0, 0, W, 70, '#8ab6d8'); for (let y = 0; y < 70; y += 6) r(c, 0, y, W, 3, shade('#8ab6d8', y / 2));
  for (let x = 0; x < W; x++) { const h = 50 + Math.sin(x / 40 + seed) * 10 + Math.sin(x / 13) * 3; r(c, x, h, 1, 70 - h, '#7a8aa0'); }
  r(c, 0, 70, W, H - 70, g1);
  for (let i = 0; i < 2600; i++) { const x = Math.floor(R() * W), y = 70 + Math.floor(R() * (H - 70)); r(c, x, y, 2, 1, R() < 0.5 ? g2 : shade(g1, 18)); }
  if (terrain === 'river') { for (let x = 0; x < W; x++) { const y = 150 + Math.sin(x / 30) * 8; r(c, x, y, 1, 10, '#3a78b8'); if (x % 9 === 0) r(c, x, y + 3, 3, 1, '#7fb6e6'); } }
  if (terrain === 'forest' || terrain === 'marsh') for (let i = 0; i < 40; i++) { const x = R() * W, y = 72 + R() * 30; c.fillStyle = terrain === 'forest' ? '#2b5a1f' : '#4a5a3a'; c.beginPath(); c.arc(x, y, 6 + R() * 6, 0, 7); c.fill(); }
  if (terrain === 'hills') for (let i = 0; i < 4; i++) { c.fillStyle = shade(g1, 12); c.beginPath(); c.ellipse(R() * W, 100 + R() * 40, 80, 24, 0, 0, 7); c.fill(); }
  if (siege) { stoneBlock(c, 372, 70, 40, H - 70, P.stone, 3); crenel(c, 370, 66, 44); for (const ty of [80, 190]) { stoneBlock(c, 366, ty, 52, 50, P.stoneL, ty); crenel(c, 364, ty - 4, 56); } r(c, 372, 140, 12, 30, P.out); }
  return hdify(cv, { rim: false, outline: false, grain: 3 });
}

interface Fig { im: Phaser.GameObjects.Image; cls: string; side: 0 | 1; alive: boolean; cav: boolean; ranged: boolean; hx: number; hy: number }

/** Plays a simulated battle: deployment, volleys, charges, melee rounds and the rout. */
export class BattleScene extends Phaser.Scene {
  private figs: Fig[] = []; private play!: BattlePlay; private scaleK = 1; private ox = 0; private oy = 0;
  constructor() { super('battle'); }
  init(data: BattlePlay) { this.play = data; this.figs = []; }
  create() {
    const p = this.play, res = p.result, sw = this.scale.width, sh = this.scale.height;
    this.scaleK = Math.max(sw / W, sh / H); this.ox = (sw - W * this.scaleK) / 2; this.oy = (sh - H * this.scaleK) / 2;
    const key = `field_${res.terrain}_${res.siege}`; if (!this.textures.exists(key)) this.textures.addCanvas(key, field(res.terrain, res.siege, res.seed % 97));
    this.add.image(this.ox, this.oy, key).setOrigin(0).setScale(this.scaleK / 2);
    this.cameras.main.fadeIn(400);
    this.deploy(p.a, 0, res.startA); this.deploy(p.b, 1, res.startB);
    if (p.engines) ENGINE_IDS.filter((e) => (p.engines![e] ?? 0) > 0).forEach((e, i) => { if (this.textures.exists(`eng_${e}`)) this.add.image(this.X(40 + i * 26), this.Y(230), `eng_${e}`).setScale(this.scaleK * 0.4).setOrigin(0.5, 1).setDepth(240); });
    for (const [side, col, nm, x] of [[0, p.aColor, p.aName, 30], [1, p.bColor, p.bName, 450]] as const) {
      this.add.image(this.X(x), this.Y(110), bannerTex(this, col, side ? 'cross' : 'lion', 0)).setScale(this.scaleK * S * 1.3).setOrigin(0.2, 1).setDepth(500);
      this.add.text(this.X(x), this.Y(112), nm, { fontFamily: 'monospace', fontSize: `${Math.round(this.scaleK * 6)}px`, color: '#fff4d6', stroke: '#1d1716', strokeThickness: 4 }).setOrigin(side ? 1 : 0, 0).setDepth(600);
    }
    this.run();
  }
  private X(x: number) { return this.ox + x * this.scaleK; }
  private Y(y: number) { return this.oy + y * this.scaleK; }
  private deploy(units: Unit[], side: 0 | 1, total: number) {
    const k = Math.max(1, Math.ceil(total / MAX));
    const list = units.flatMap((u) => Array.from({ length: Math.ceil(u.count / k) }, () => u));
    const order = (u: Unit) => (unitStats(u.cls).ranged ? 0 : unitStats(u.cls).cav ? 2 : 1);
    const groups = [0, 1, 2].map((g) => list.filter((u) => order(u) === g));
    const siegeDef = side === 1 && this.play.result.siege;
    groups.forEach((g, gi) => g.forEach((u, i) => {
      const cols = 10, row = Math.floor(i / cols), col = i % cols;
      const depthX = gi === 0 ? 30 : gi === 1 ? 80 : 60, y = 130 + col * 13 + (row % 2) * 6 + (gi === 2 ? -40 : 0);
      let x = side === 0 ? depthX + row * 10 : W - depthX - row * 10;
      if (siegeDef) x = gi === 0 ? 392 + row * 6 : W - 20 - row * 8;
      const im = this.add.image(this.X(side === 0 ? -40 : W + 40), this.Y(y), 'soldiers', sFrame(u.cls, u.rank, 0)).setOrigin(0.5, 1).setScale(this.scaleK * S * 0.9).setFlipX(side === 1).setDepth(y);
      if (side === 1) im.setTint(0xffe0d8);
      this.figs.push({ im, cls: u.cls, side, alive: true, cav: unitStats(u.cls).cav, ranged: unitStats(u.cls).ranged > 0, hx: x, hy: y });
      this.tweens.add({ targets: im, x: this.X(x), duration: 900 + Math.random() * 300, ease: 'Sine.Out' });
    }));
  }
  private walk(f: Fig, x: number, y: number, ms: number) { this.tweens.add({ targets: f.im, x: this.X(x), y: this.Y(y), duration: ms, ease: 'Sine.InOut' }); }
  private kill(side: 0 | 1, n: number) {
    const alive = this.figs.filter((f) => f.side === side && f.alive), total = side === 0 ? this.play.result.startA : this.play.result.startB, k = Math.max(1, Math.ceil(total / MAX));
    const count = Math.min(alive.length, Math.round(n / k + (n > 0 ? 0.4 : 0)));
    Phaser.Utils.Array.Shuffle(alive).slice(0, count).forEach((f, i) => { f.alive = false; this.time.delayedCall(i * 30, () => this.tweens.add({ targets: f.im, angle: side ? 80 : -80, alpha: 0.35, y: f.im.y + 3, duration: 400 })); });
  }
  private arrows(from: 0 | 1, n: number) {
    const shooters = this.figs.filter((f) => f.side === from && f.alive && f.ranged); if (!shooters.length) return;
    const foes = this.figs.filter((f) => f.side !== from && f.alive);
    for (let i = 0; i < Math.min(n, 40); i++) {
      const s = shooters[i % shooters.length], t = foes[Math.floor(Math.random() * foes.length)] ?? s;
      const a = this.add.rectangle(s.im.x, s.im.y - 12 * this.scaleK, 5 * this.scaleK, 1 * this.scaleK, 0xe8e0c8).setDepth(800);
      const mx = (s.im.x + t.im.x) / 2, my = Math.min(s.im.y, t.im.y) - 60 * this.scaleK, curve = new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(a.x, a.y), new Phaser.Math.Vector2(mx, my), new Phaser.Math.Vector2(t.im.x, t.im.y - 8 * this.scaleK));
      const o = { t: 0 }; this.tweens.add({ targets: o, t: 1, duration: 700, delay: i * 25, onUpdate: () => { const pt = curve.getPoint(o.t), tg = curve.getTangent(o.t); a.setPosition(pt.x, pt.y).setRotation(Math.atan2(tg.y, tg.x)); }, onComplete: () => a.destroy() });
    }
  }
  private stones() {
    for (let i = 0; i < 3; i++) { const b = this.add.circle(this.X(50), this.Y(200), 3 * this.scaleK, 0x7e8894).setDepth(800); const o = { t: 0 }, x0 = this.X(50), x1 = this.X(380 + Math.random() * 20), y1 = this.Y(120 + Math.random() * 90);
      this.tweens.add({ targets: o, t: 1, duration: 900, delay: i * 250, onUpdate: () => b.setPosition(x0 + (x1 - x0) * o.t, this.Y(200) + (y1 - this.Y(200)) * o.t - Math.sin(o.t * Math.PI) * 120 * this.scaleK), onComplete: () => { b.destroy(); this.cameras.main.shake(120, 0.004); } }); }
  }
  private animate(on: boolean) { for (const f of this.figs) if (f.alive) f.im.setFrame(sFrame(f.cls, 1, on ? (Math.random() < 0.5 ? 4 : 5) : 0)); }
  private say(text: string) {
    const t = this.add.text(this.scale.width / 2, this.Y(20), text, { fontFamily: 'monospace', fontSize: `${Math.max(14, Math.round(this.scaleK * 6))}px`, color: '#fff4d6', stroke: '#1d1716', strokeThickness: 5, align: 'center', wordWrap: { width: this.scale.width * 0.85 } }).setOrigin(0.5, 0).setDepth(1000).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 1100, onComplete: () => t.destroy() });
  }
  private run() {
    const res = this.play.result; let t = 1100;
    audio.play('horn');
    const at = (ms: number, fn: () => void) => this.time.delayedCall(ms, () => { if (getUI().battle?.phase === 'playing') fn(); });
    at(300, () => this.say(this.play.title));
    for (const rd of res.rounds) {
      const step = t;
      if (rd.phase === 'volley') at(step, () => { this.say(rd.text); audio.play('arrows'); this.arrows(0, 30); this.arrows(1, 30); this.time.delayedCall(800, () => { this.kill(0, rd.a); this.kill(1, rd.b); }); });
      if (rd.phase === 'charge') at(step, () => { this.say(rd.text); audio.play('march'); const att = rd.b > rd.a ? 0 : 1; for (const f of this.figs.filter((x) => x.cav && x.alive && x.side === att)) { this.walk(f, W / 2 + (att ? 30 : -30), f.hy, 600); this.time.delayedCall(700, () => this.walk(f, f.hx, f.hy, 700)); } this.time.delayedCall(650, () => { audio.play('clash'); this.kill(0, rd.a); this.kill(1, rd.b); }); });
      if (rd.phase === 'assault') at(step, () => { this.say(rd.text); if (this.play.engines && (this.play.engines.trebuchet || this.play.engines.mangonel)) { audio.play('catapult'); this.stones(); } });
      if (rd.phase === 'melee') at(step, () => {
        this.say(rd.text); audio.play('clash');
        const mid = res.siege ? 360 : W / 2;
        for (const f of this.figs.filter((x) => x.alive && !x.ranged)) this.walk(f, f.side === 0 ? mid - 14 - Math.random() * 30 : mid + 14 + Math.random() * 30, f.hy, 500);
        const id = this.time.addEvent({ delay: 150, repeat: 6, callback: () => this.animate(true) });
        this.time.delayedCall(1000, () => { id.remove(); this.animate(false); this.kill(0, rd.a); this.kill(1, rd.b); });
      });
      if (rd.phase === 'rout') at(step, () => {
        this.say(rd.text); const loser = res.winner === 'a' ? 1 : 0;
        audio.play(loser === 1 ? 'victory' : 'defeat');
        for (const f of this.figs.filter((x) => x.alive && x.side === loser)) { f.im.setFlipX(loser === 0); this.walk(f, loser ? W + 60 : -60, f.hy, 1400); }
        for (const f of this.figs.filter((x) => x.alive && x.side !== loser)) this.tweens.add({ targets: f.im, y: f.im.y - 4 * this.scaleK, duration: 160, yoyo: true, repeat: 3, delay: Math.random() * 300 });
      });
      t += rd.phase === 'melee' ? 1500 : 1700;
    }
    at(t + 1200, () => this.finish());
  }
  finish() { const b = getUI().battle; if (b) setUI({ battle: { ...b, phase: 'report' } }); this.scene.stop(); }
}
