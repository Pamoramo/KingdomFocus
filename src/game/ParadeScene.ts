import Phaser from 'phaser';
import { getState, type GameState, type Battalion } from '../lib/state.ts';
import { TCLASSES, OFFICERS } from '../lib/economy.ts';
import { awayBats } from '../lib/warActions.ts';
import { styled } from '../lib/commanders.ts';
import { canvas, r, rng, P, shade, stoneBlock, crenel } from './art/px.ts';
import { hdify } from './art/hd.ts';
import { sFrame, bannerTex, S } from './textures.ts';
import { audio } from './audio.ts';
import { getUI, setUI } from './ui.ts';
import { nightFactor } from './KingdomScene.ts';
import { WeatherFx, weatherAt } from './weather.ts';

/** Logical parade ground, scaled to fill the screen. */
const W = 480, H = 270, ROAD0 = 150, ROAD1 = 206;
export type ParadeMode = 'review' | 'parade';

function ground(seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(W, H), R = rng(seed);
  // castle wall and keep behind the royal stand
  r(c, 0, 40, W, 40, P.stone); stoneBlock(c, 0, 44, W, 36, P.stone, 7); crenel(c, 0, 40, W);
  for (const tx of [40, 200, 360]) { stoneBlock(c, tx, 20, 34, 60, P.stoneL, tx); crenel(c, tx - 2, 16, 38); r(c, tx + 14, 34, 5, 9, P.out); }
  r(c, 0, 80, W, H - 80, '#7da24a'); for (let i = 0; i < 2600; i++) r(c, Math.floor(R() * W), 80 + Math.floor(R() * (H - 80)), 2, 1, R() < 0.5 ? '#6a8f3c' : '#8cb456');
  // the parade square: beaten earth, with a cobbled road for the march past
  r(c, 0, 96, W, 160, '#c4ac7c'); for (let i = 0; i < 2400; i++) r(c, Math.floor(R() * W), 96 + Math.floor(R() * 160), 2, 1, R() < 0.5 ? '#b49a6a' : '#d2bc8e');
  r(c, 0, ROAD0, W, ROAD1 - ROAD0, '#8a8478'); for (let y = ROAD0; y < ROAD1; y += 5) for (let x = (y / 5) % 2 ? 0 : 4; x < W; x += 8) { r(c, x, y, 7, 4, shade('#9a9488', (R() - 0.5) * 20)); }
  r(c, 0, ROAD0 - 1, W, 1, '#6a6458'); r(c, 0, ROAD1, W, 1, '#6a6458');
  // the royal stand: a raised platform under a striped canopy
  r(c, 196, 104, 88, 28, P.woodD); r(c, 198, 106, 84, 24, P.wood); for (let x = 196; x < 284; x += 8) r(c, x, 88, 8, 10, x % 16 ? '#e8d4a0' : '#b3242a'); r(c, 194, 98, 92, 3, '#c8a030');
  return hdify(cv, { rim: false, outline: false, grain: 2 });
}

interface Fig { im: Phaser.GameObjects.Image; cls: string; rank: number; x: number; y: number; ph: number; flag?: Phaser.GameObjects.Image; label?: Phaser.GameObjects.Text }
/** The army drawn up on the parade square to be looked over, or marching past the royal stand while the town cheers. */
export class ParadeScene extends Phaser.Scene {
  private mode: ParadeMode = 'review'; private k = 1; private ox = 0; private oy = 0; private figs: Fig[] = []; private crowd: Fig[] = []; private marchers: Fig[] = [];
  private speed = 34; private weather?: WeatherFx; private done = false; private endAt = Infinity;
  constructor() { super('parade'); }
  init(data: { mode: ParadeMode }) { this.mode = data.mode; this.figs = []; this.crowd = []; this.marchers = []; this.done = false; this.endAt = Infinity; }
  private X(x: number) { return this.ox + x * this.k; }
  private Y(y: number) { return this.oy + y * this.k; }
  create() {
    const s = getState(), sw = this.scale.width, sh = this.scale.height;
    this.k = Math.max(sw / W, sh / H); this.ox = (sw - W * this.k) / 2; this.oy = (sh - H * this.k) / 2;
    if (!this.textures.exists('paradeground')) this.textures.addCanvas('paradeground', ground(11));
    this.add.rectangle(0, 0, sw, sh, 0x8ab6d8).setOrigin(0).setDepth(-30);
    this.add.image(this.ox, this.oy, 'paradeground').setOrigin(0).setScale(this.k / 2).setDepth(-20);
    const { n, warm } = nightFactor(s.settings.dayNight);
    if (n > 0.05) this.add.rectangle(0, 0, sw, sh, 0x2a3a6e).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(n * 0.55).setDepth(9000);
    if (warm > 0.05) this.add.rectangle(0, 0, sw, sh, 0xff9a50).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(warm * 0.12).setDepth(9001);
    this.weather = new WeatherFx(this, sw, sh); this.weather.set(weatherAt());
    // banners along the wall, the king and his guard on the stand
    for (const x of [30, 110, 170, 310, 370, 450]) this.add.image(this.X(x), this.Y(62), bannerTex(this, 0xb3242a, s.battalions[0]?.emblem ?? 'lion', 0)).setOrigin(0.2, 1).setScale(this.k * S * 1.1).setDepth(this.Y(62));
    this.person('royalguard', 3, 214, 128, true); this.person('royalguard', 3, 266, 128, false);
    const king = this.person('knight', 4, 240, 126, false); king.im.setTint(0xffe9a0);
    const bats = s.battalions.filter((b) => !awayBats(s).has(b.id) && s.squads.some((q) => q.bat === b.id));
    if (this.mode === 'review') this.review(s, bats); else this.parade(s, bats);
    this.cameras.main.fadeIn(400);
  }
  private person(cls: string, rank: number, x: number, y: number, flip: boolean): Fig {
    const im = this.add.image(this.X(x), this.Y(y), 'soldiers', sFrame(cls, rank, 0)).setOrigin(0.5, 1).setScale(this.k * S * 0.9).setFlipX(flip).setDepth(this.Y(y));
    const f: Fig = { im, cls, rank, x, y, ph: Math.floor(Math.random() * 8) }; this.figs.push(f); return f;
  }
  /** Soldiers of a battalion, best troops first, at most `max` figures (each may stand for several men). */
  private ranks(s: GameState, b: Battalion, max: number) {
    const sq = s.squads.filter((q) => q.bat === b.id).sort((a, c) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(c.cls) || c.rank - a.rank);
    const total = sq.reduce((a, q) => a + q.count, 0), per = Math.max(1, Math.ceil(total / max));
    return { total, men: sq.flatMap((q) => Array.from({ length: Math.ceil(q.count / per) }, () => ({ cls: q.cls as string, rank: q.rank }))) };
  }
  private label(x: number, y: number, text: string, size = 4.2) {
    return this.add.text(this.X(x), this.Y(y), text, { fontFamily: 'monospace', fontSize: `${Math.max(10, Math.round(this.k * size))}px`, color: '#fff4d6', stroke: '#1d1716', strokeThickness: 4, align: 'center' }).setOrigin(0.5, 0).setDepth(20000);
  }
  private caption(text: string) {
    const t = this.add.text(this.scale.width / 2, 70, text, { fontFamily: 'serif', fontStyle: 'bold', fontSize: `${Math.max(18, Math.round(this.k * 8))}px`, color: '#ffe08a', stroke: '#1d1716', strokeThickness: 6, align: 'center', wordWrap: { width: this.scale.width * 0.8 } }).setOrigin(0.5, 0).setDepth(30000).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 2600, onComplete: () => t.destroy() });
  }

  // ---------------- review: every battalion drawn up in its block ----------------
  private review(s: GameState, bats: Battalion[]) {
    if (!bats.length) { this.caption('No soldiers at home to review.'); return; }
    const per = bats.length <= 4 ? 60 : bats.length <= 8 ? 36 : 20, blocks = bats.map((b) => ({ b, ...this.ranks(s, b, per) }));
    const cols = (n: number) => Math.min(10, Math.max(4, Math.ceil(Math.sqrt(n * 1.6))));
    const widths = blocks.map((x) => cols(x.men.length) * 8 + 10), rows: number[][] = [[]]; let used = 0;
    widths.forEach((w, i) => { if (used + w > W - 20 && rows[rows.length - 1].length) { rows.push([]); used = 0; } rows[rows.length - 1].push(i); used += w; });
    const rowH = Math.min(62, 124 / rows.length), sc = Math.min(1, rowH / 50); // drawn up on the square, below the royal stand
    rows.forEach((row, ri) => {
      const total = row.reduce((a, i) => a + widths[i], 0); let x = (W - total) / 2;
      for (const i of row) {
        const { b, men, total: count } = blocks[i], c = cols(men.length), y0 = 136 + ri * rowH;
        men.forEach((m, j) => { const fx = x + 6 + (j % c) * 8, fy = y0 + 14 + Math.floor(j / c) * 7 * sc; this.person(m.cls, m.rank, fx, fy, false); });
        // the commander and the colours stand before the block
        const cx = x + widths[i] / 2 - 4;
        const cmd = this.person(b.commander.rank >= 3 ? 'knight' : b.commander.rank >= 1 ? 'manatarms' : 'swordsman', Math.min(4, b.commander.rank + 1), cx - 6, y0 + 8, false); cmd.im.setTint(0xfff0c8);
        const fl = this.person('spearman', 1, cx + 6, y0 + 8, false); fl.flag = this.add.image(this.X(cx + 8), this.Y(y0 - 6), bannerTex(this, b.color, b.emblem, 0)).setOrigin(0.2, 1).setScale(this.k * S).setDepth(this.Y(y0 + 9));
        this.label(x + widths[i] / 2, y0 + 16 + Math.ceil(men.length / c) * 7 * sc, `${b.name}\n${OFFICERS[b.commander.rank]?.name ?? ''} ${styled(b.commander)} · ${count}`, 3.4);
        x += widths[i];
      }
    });
    const n = bats.reduce((a, b) => a + s.squads.filter((q) => q.bat === b.id).reduce((x, q) => x + q.count, 0), 0);
    this.caption(`Your army stands ready: ${n} soldiers in ${bats.length} battalion${bats.length > 1 ? 's' : ''}`);
    audio.play('horn');
  }

  // ---------------- parade: battalions march past the stand while the town cheers ----------------
  private parade(s: GameState, bats: Battalion[]) {
    let x = -20, total = 0;
    for (const b of bats) {
      const { men, total: count } = this.ranks(s, b, 48); total += count;
      const flagger = this.person('spearman', 1, x, ROAD0 + 6, false); flagger.flag = this.add.image(0, 0, bannerTex(this, b.color, b.emblem, 0)).setOrigin(0.2, 1).setScale(this.k * S * 1.1); this.marchers.push(flagger);
      const cmd = this.person(b.commander.rank >= 3 ? 'mknight' : 'knight', Math.min(4, b.commander.rank + 1), x - 2, ROAD0 + 22, false); this.marchers.push(cmd);
      cmd.label = this.label(0, 0, `${b.name} · ${count}`, 3.4);
      x -= 16;
      men.forEach((m, j) => { const f = this.person(m.cls, m.rank, x - Math.floor(j / 6) * 9, ROAD0 + 10 + (j % 6) * 8 + (Math.floor(j / 6) % 2) * 2, false); this.marchers.push(f); });
      x -= Math.ceil(men.length / 6) * 9 + 24;
    }
    // the townsfolk line the square
    const R = rng(5);
    for (let i = 0; i < 46; i++) { const top = i < 18, cx = top ? 12 + (i % 9) * 20 + (i >= 9 ? 288 : 0) : 8 + (i - 18) * 17, cy = top ? 142 : 228 + (i % 2) * 8;
      const p = this.person(R() < 0.5 ? 'villager' : 'worker', 0, cx, cy, false); this.crowd.push(p); }
    const len = -x + W + 40; this.speed = Math.max(34, len / 22); // the whole march takes no more than ~22 seconds
    this.endAt = this.time.now + (len / this.speed) * 1000;
    this.caption(`A grand parade! ${total} soldiers march before the court`);
    audio.play('horn'); this.time.addEvent({ delay: 2200, loop: true, callback: () => { if (!this.done) audio.play('march'); } });
    // flower petals from the walls
    if (!this.textures.exists('petal')) { const [cv, c] = canvas(2, 2); r(c, 0, 0, 2, 2, '#ffffff'); this.textures.addCanvas('petal', cv); }
    this.add.particles(0, 0, 'petal', { x: { min: 0, max: this.scale.width }, y: -10, lifespan: 6000, speedY: { min: 30, max: 60 }, speedX: { min: -20, max: 20 }, scale: { min: this.k * 0.6, max: this.k }, tint: [0xffc0d0, 0xffffff, 0xffe08a, 0xff8090], frequency: 140, rotate: { min: 0, max: 360 } }).setDepth(25000);
  }

  update(time: number, dt: number) {
    this.weather?.update(this.cameras.main);
    const tick = Math.floor(time / 140);
    if (this.mode === 'parade' && !this.done) {
      for (const f of this.marchers) {
        f.x += (this.speed * dt) / 1000;
        f.im.setFrame(sFrame(f.cls, f.rank, (tick + f.ph) % 4)).setPosition(this.X(f.x), this.Y(f.y)).setDepth(this.Y(f.y));
        f.flag?.setPosition(this.X(f.x + 2), this.Y(f.y - 12)).setDepth(this.Y(f.y) + 1); f.label?.setPosition(this.X(f.x), this.Y(f.y + 4));
      }
      // the crowd cheers as soldiers pass in front of them
      for (const c of this.crowd) { const near = this.marchers.some((m) => Math.abs(m.x - c.x) < 24); c.im.setFrame(sFrame(c.cls, 0, near && (tick + c.ph) % 4 < 2 ? 4 : 0)).setY(this.Y(c.y) - (near && (tick + c.ph) % 6 < 3 ? 2 * this.k : 0)); }
      if (time > this.endAt) { this.done = true; audio.play('victory'); this.caption('Long live the realm!'); this.time.delayedCall(3400, () => this.finish()); }
    } else for (const f of this.figs) if ((tick + f.ph) % 50 === 0) f.im.setFrame(sFrame(f.cls, f.rank, 2)); else if ((tick + f.ph) % 50 === 2) f.im.setFrame(sFrame(f.cls, f.rank, 0));
  }
  finish() { if (getUI().parade) setUI({ parade: null }); this.scene.stop(); }
}
