import Phaser from 'phaser';
import { getState, type BattlePlay } from '../lib/state.ts';
import { unitStats, type Unit } from '../lib/battle.ts';
import type { TClass } from '../lib/economy.ts';
import type { Biome } from '../lib/realms.ts';
import { canvas, r, px, rng, P, shade, stoneBlock, crenel, withoutOutline } from './art/px.ts';
import { hdify } from './art/hd.ts';
import { GROUND as BIOME_GROUND, BIOME_PLANTS, plant } from './art/biome.ts';
import { engineArt } from './art/war.ts';
import { sFrame, bannerTex, S } from './textures.ts';
import { audio } from './audio.ts';
import { setUI, getUI } from './ui.ts';
import { ENGINE_IDS, type Engine } from '../lib/war.ts';
import { WeatherFx, weatherAt, biomeWeather, type Weather } from './weather.ts';
import { nightFactor } from './KingdomScene.ts';

/** Logical battlefield (scaled to fill the screen): sky above HORIZON, the field below. */
const W = 480, H = 270, HORIZON = 72, MAX = 90; // MAX sprites per side; each stands for several soldiers in big battles

// ---------------- the painted backdrop: sky for the hour, far land and field for the biome ----------------
const FAR: Record<Biome, string> = { grassland: '#7c95a8', desert: '#d8b47e', tundra: '#c8d6e6', forest: '#2f5a3a', swamp: '#4c5a48', highlands: '#7a7f8c' };
const DUST: Record<Biome, number> = { grassland: 0xb8a77a, desert: 0xe6cf98, tundra: 0xf4f8ff, forest: 0x8a7a52, swamp: 0x6a6a44, highlands: 0xa49c8c };

function sky(n: number, warm: number, weather: Weather): HTMLCanvasElement {
  const [cv, c] = canvas(W, HORIZON + 2), g = c.createLinearGradient(0, 0, 0, HORIZON);
  const grey = weather === 'rain' || weather === 'storm' || weather === 'snow' || weather === 'fog' || weather === 'cloudy';
  const day: [string, string] = grey ? ['#8a96a4', '#c2cad2'] : ['#5f9cd4', '#bcdcf0'], dusk: [string, string] = ['#3e3a6a', '#f0a070'], night: [string, string] = ['#0c1430', '#2a3a64'];
  const top = n > 0.6 ? night[0] : warm > 0.3 ? dusk[0] : day[0], bot = n > 0.6 ? night[1] : warm > 0.3 ? dusk[1] : day[1];
  g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(0, 0, W, HORIZON + 2);
  const R = rng(7);
  if (n > 0.6) { for (let i = 0; i < 90; i++) px(c, Math.floor(R() * W), Math.floor(R() * (HORIZON - 14)), R() < 0.2 ? '#ffffff' : '#9fb0d8'); c.fillStyle = '#f4f0dc'; c.beginPath(); c.arc(400, 18, 7, 0, 7); c.fill(); c.fillStyle = top; c.beginPath(); c.arc(403, 16, 6, 0, 7); c.fill(); }
  else if (!grey) { c.fillStyle = warm > 0.3 ? '#ffd27a' : '#fff6c8'; c.beginPath(); c.arc(warm > 0.3 ? 70 : 90, warm > 0.3 ? 58 : 20, 9, 0, 7); c.fill(); }
  return cv;
}

type Walls = NonNullable<BattlePlay['site']>['walls'];
function land(biome: Biome, terrain: string, walls: Walls, seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(W, H), R = rng(seed), g = BIOME_GROUND[biome], far = FAR[biome];
  // far land: mountains, dunes, a tree line...
  for (let x = 0; x < W; x++) {
    const peak = biome === 'highlands' || biome === 'tundra' ? Math.abs(Math.sin(x / 37 + seed)) * 22 + Math.sin(x / 11) * 3 : biome === 'desert' ? Math.sin(x / 55 + seed) * 7 + 9 : Math.sin(x / 40 + seed) * 8 + Math.sin(x / 13) * 3 + 8;
    const top = HORIZON - 4 - peak; r(c, x, top, 1, HORIZON - top, far);
    if ((biome === 'tundra' || biome === 'highlands') && peak > 16) r(c, x, top, 1, 3, '#f4f8ff');
  }
  if (biome === 'forest' || biome === 'swamp' || biome === 'grassland') for (let x = -4; x < W; x += 5 + Math.floor(R() * 4)) { c.fillStyle = shade(far, -14); c.beginPath(); c.arc(x, HORIZON - 2, 4 + R() * 5, 0, 7); c.fill(); }
  // the field
  r(c, 0, HORIZON, W, H - HORIZON, g.base);
  for (let i = 0; i < 3400; i++) { const y = HORIZON + Math.floor(R() * (H - HORIZON)); r(c, Math.floor(R() * W), y, y > 150 ? 2 : 1, 1, g.dots[Math.floor(R() * g.dots.length)]); }
  for (let y = HORIZON; y < HORIZON + 14; y++) { c.globalAlpha = 0.35 * (1 - (y - HORIZON) / 14); r(c, 0, y, W, 1, far); } c.globalAlpha = 1; // haze where the land meets the sky
  if (terrain === 'river') { for (let x = 0; x < W; x++) { const y = 150 + Math.sin(x / 30) * 8; r(c, x, y, 1, 10, biome === 'tundra' ? '#b8d4ec' : '#3a78b8'); if (x % 9 === 0) r(c, x, y + 3, 3, 1, '#9cc8ee'); } }
  if (terrain === 'marsh' || biome === 'swamp') for (let i = 0; i < 14; i++) { c.fillStyle = '#3a5a4a'; c.beginPath(); c.ellipse(R() * W, 110 + R() * 150, 14 + R() * 14, 4 + R() * 3, 0, 0, 7); c.fill(); }
  if (terrain === 'hills') for (let i = 0; i < 4; i++) { c.fillStyle = shade(g.base, 10); c.beginPath(); c.ellipse(R() * W, 100 + R() * 40, 80, 20, 0, 0, 7); c.fill(); }
  // plants of the biome along the back and the edges (never in the middle, where the armies meet)
  const kinds = BIOME_PLANTS[biome];
  for (let i = 0; i < (terrain === 'forest' || biome === 'forest' ? 46 : 22); i++) {
    const back = R() < 0.65, x = back ? R() * W : (R() < 0.5 ? R() * 40 : W - R() * 40), y = back ? HORIZON + 2 + R() * 20 : HORIZON + 30 + R() * 180;
    const pl = plant(kinds[Math.floor(R() * kinds.length)], Math.floor(R() * 999)), k = back ? 0.7 : 1; c.drawImage(pl, Math.round(x - 8 * k), Math.round(y - 24 * k), 16 * k, 24 * k);
  }
  // the defenders' fortification on their side of the field
  if (walls) {
    const x0 = walls.side === 1 ? 372 : 68;
    if (walls.kind === 'wall') {
      stoneBlock(c, x0, HORIZON, 40, H - HORIZON, P.stone, 3); crenel(c, walls.side === 1 ? x0 - 2 : x0 - 2, HORIZON - 4, 44);
      for (const ty of [84, 196]) { stoneBlock(c, x0 - 6, ty, 52, 46, P.stoneL, ty); crenel(c, x0 - 8, ty - 4, 56); r(c, x0 + 18, ty + 14, 3, 6, P.out); }
      r(c, x0 + (walls.side === 1 ? 0 : 28), 140, 12, 32, P.out); for (let y = 142; y < 172; y += 4) r(c, x0 + (walls.side === 1 ? 0 : 28), y, 12, 1, '#5a4a3a'); // the gate and its portcullis
    } else for (let y = HORIZON; y < H; y += 3) { r(c, x0 + 14, y, 4, 3, P.wood); px(c, x0 + 14, y, P.woodL); px(c, x0 + 17, y + 1, P.woodD); }
  }
  return hdify(cv, { rim: false, outline: false, grain: 3 });
}

type State = 'idle' | 'move' | 'fight' | 'dead' | 'flee' | 'cheer';
interface Fig {
  im: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; flag?: Phaser.GameObjects.Image; cls: string; rank: number; side: 0 | 1;
  cav: boolean; ranged: boolean; onWall: boolean; pose?: { fr: number; until: number }; x: number; y: number; tx: number; ty: number; hx: number; hy: number; speed: number; state: State; ph: number;
}

/** Plays a simulated battle as a short film: armies march in, volleys arc overhead, cavalry charge, lines clash man to man,
 *  engines batter the walls and ladders go up, and the loser routs. Ground, sky, light and weather match where and when it is fought. */
export class BattleScene extends Phaser.Scene {
  private figs: Fig[] = []; private play!: BattlePlay; private k = 1; private ox = 0; private oy = 0;
  private biome: Biome = 'grassland'; private night = 0; private dust!: Phaser.GameObjects.Particles.ParticleEmitter; private spark!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter; private weather?: WeatherFx; private hud!: { bars: Phaser.GameObjects.Graphics; nums: Phaser.GameObjects.Text[]; left: [number, number]; shown: [number, number] };
  private lastClang = 0; private fighting = false; private stuck: Phaser.GameObjects.GameObject[] = [];
  constructor() { super('battle'); }
  init(data: BattlePlay) { this.play = data; this.figs = []; this.stuck = []; this.fighting = false; }

  create() {
    const p = this.play, res = p.result, sw = this.scale.width, sh = this.scale.height, site = p.site;
    this.biome = site?.biome ?? 'grassland';
    this.k = Math.max(sw / W, sh / H); this.ox = (sw - W * this.k) / 2; this.oy = (sh - H * this.k) / 2;
    const { n, warm } = nightFactor(getState().settings.dayNight); this.night = n;
    const wx = biomeWeather(this.biome, weatherAt());
    this.texturesNeeded();
    // backdrop
    const skyKey = `bsky_${Math.round(n * 4)}_${Math.round(warm * 4)}_${wx}`; if (!this.textures.exists(skyKey)) this.textures.addCanvas(skyKey, sky(n, warm, wx));
    this.add.image(this.ox, this.oy, skyKey).setOrigin(0).setScale(this.k).setDepth(-20);
    const landKey = `bland_${this.biome}_${res.terrain}_${site?.walls?.side ?? 'x'}${site?.walls?.kind ?? ''}_${res.seed % 7}`;
    if (!this.textures.exists(landKey)) this.textures.addCanvas(landKey, land(this.biome, res.terrain, site?.walls, res.seed % 7));
    this.add.image(this.ox, this.oy, landKey).setOrigin(0).setScale(this.k / 2).setDepth(-10);
    // light: night blue, dusk gold, and torches and fires that glow in the dark
    if (n > 0.05) this.add.rectangle(0, 0, sw, sh, 0x2a3a6e, 1).setOrigin(0).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(n * 0.6).setDepth(9000);
    if (warm > 0.05) this.add.rectangle(0, 0, sw, sh, 0xff9a50, 1).setOrigin(0).setBlendMode(Phaser.BlendModes.ADD).setAlpha(warm * 0.12).setDepth(9001);
    if (n > 0.4) for (const [x, y] of [[18, 120], [24, 210], [462, 118], [456, 214], ...(site?.walls ? [[site.walls.side ? 392 : 88, 82], [site.walls.side ? 392 : 88, 194]] : [])]) {
      const gl = this.add.image(this.X(x), this.Y(y), 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(this.k * 0.5).setAlpha(0.8 * n).setDepth(9002);
      this.tweens.add({ targets: gl, alpha: 0.55 * n, scale: this.k * 0.45, duration: 180 + Math.random() * 120, yoyo: true, repeat: -1 });
      this.add.rectangle(this.X(x), this.Y(y), 2 * this.k, 2 * this.k, 0xffc060).setDepth(y * this.k);
    }
    this.weather = new WeatherFx(this, sw, sh); this.weather.set(wx);
    // particles: dust kicked up by feet and hooves, sparks of steel, stone and splinters from the walls
    this.dust = this.add.particles(0, 0, 'bpuff', { emitting: false, lifespan: 700, speed: { min: 6, max: 26 }, angle: { min: 180, max: 360 }, scale: { start: this.k * 0.25, end: this.k * 0.55 }, alpha: { start: 0.55, end: 0 }, tint: DUST[this.biome] }).setDepth(8000);
    this.spark = this.add.particles(0, 0, 'bdot', { emitting: false, lifespan: 260, speed: { min: 30 * this.k, max: 70 * this.k }, scale: { start: this.k * 0.6, end: 0 }, tint: [0xffffff, 0xfff0a0, 0xffd060], blendMode: 'ADD' }).setDepth(8500);
    this.debris = this.add.particles(0, 0, 'bdot', { emitting: false, lifespan: 900, speed: { min: 20 * this.k, max: 60 * this.k }, angle: { min: 200, max: 340 }, gravityY: 160 * this.k, scale: { min: this.k * 0.6, max: this.k * 1.2 }, tint: [0x8a8a92, 0x6e6e78, 0xa8a49a] }).setDepth(8500);
    this.cameras.main.fadeIn(500);
    this.deploy(p.a, 0, res.startA); this.deploy(p.b, 1, res.startB);
    this.engines();
    this.makeHud();
    this.run();
  }

  private texturesNeeded() {
    const T = this.textures;
    if (!T.exists('bdot')) { const [cv, c] = canvas(2, 2); r(c, 0, 0, 2, 2, '#ffffff'); T.addCanvas('bdot', cv); }
    if (!T.exists('bpuff')) { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d')!, g = x.createRadialGradient(8, 8, 0, 8, 8, 8); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 16, 16); T.addCanvas('bpuff', c); }
    if (!T.exists('bshadow')) { const c = document.createElement('canvas'); c.width = 16; c.height = 6; const x = c.getContext('2d')!; x.fillStyle = 'rgba(0,0,0,0.32)'; x.beginPath(); x.ellipse(8, 3, 7, 2.5, 0, 0, 7); x.fill(); T.addCanvas('bshadow', c); }
    if (!T.exists('barrow')) { const [cv, c] = canvas(7, 1); r(c, 0, 0, 5, 1, '#d8cfb4'); r(c, 5, 0, 2, 1, '#6a6a72'); T.addCanvas('barrow', cv); }
    if (!T.exists('bladder')) { const [cv, c] = canvas(6, 26); r(c, 0, 0, 1, 26, P.woodD); r(c, 5, 0, 1, 26, P.woodD); for (let y = 2; y < 26; y += 4) r(c, 0, y, 6, 1, P.wood); T.addCanvas('bladder', cv); }
    for (const e of ENGINE_IDS) if (!T.exists(`beng_${e}`)) T.addCanvas(`beng_${e}`, hdify(withoutOutline(() => engineArt(e))));
  }
  private X(x: number) { return this.ox + x * this.k; }
  private Y(y: number) { return this.oy + y * this.k; }
  private wallX(side: 0 | 1) { return side === 1 ? 372 : 108; } // the wall face the attackers come up against

  // ---------------- the armies ----------------
  private deploy(units: Unit[], side: 0 | 1, total: number) {
    const per = Math.max(1, Math.ceil(total / MAX)), walls = this.play.site?.walls, holds = walls?.side === side;
    const list = units.flatMap((u) => Array.from({ length: Math.ceil(u.count / per) }, () => u));
    const order = (u: Unit) => (unitStats(u.cls).ranged ? 0 : unitStats(u.cls).cav ? 2 : 1);
    [0, 1, 2].map((g) => list.filter((u) => order(u) === g)).forEach((g, gi) => g.forEach((u, i) => {
      const cols = 10, row = Math.floor(i / cols), col = i % cols;
      // archers in front to loose, foot behind them, horse on the flank; the holders of a castle line its walls
      let x = (gi === 0 ? 34 : gi === 1 ? 84 : 62) + row * 10, y = 124 + col * 13 + (row % 2) * 6 + (gi === 2 ? -44 : 0);
      if (holds && gi === 0) { x = this.wallX(side) + (side === 1 ? 20 : -20) + (row % 2) * 3; y = 92 + ((i * 23) % 156); } // bowmen on the wall-walk
      else if (holds) x = side === 1 ? Math.min(470, 430 + row * 8) : Math.max(12, 52 - row * 8); // the rest wait in the bailey behind
      else if (side === 1) x = W - x;
      const f = this.fig(u.cls, u.rank, side, x, y);
      f.onWall = holds && gi === 0;
      if (!holds) { f.x = side === 0 ? -30 - Math.random() * 40 : W + 30 + Math.random() * 40; f.state = 'move'; f.speed = f.cav ? 95 : 75; } // march onto the field
    }));
    // standard bearers: each host carries its colours
    const mine = this.figs.filter((f) => f.side === side && !f.ranged && !f.onWall);
    const col = side === 0 ? this.play.aColor : this.play.bColor;
    for (const f of mine.filter((_, i) => i % 18 === 4).slice(0, 3)) f.flag = this.add.image(0, 0, bannerTex(this, col, side ? 'cross' : 'lion', 0)).setOrigin(0.2, 1).setScale(this.k * S * 0.8);
  }
  private fig(cls: string, rank: number, side: 0 | 1, x: number, y: number): Fig {
    const im = this.add.image(0, 0, 'soldiers', sFrame(cls, rank, 0)).setOrigin(0.5, 1).setScale(this.k * S * 0.9).setFlipX(side === 1);
    if (side === 1) im.setTint(0xffe6dc);
    const sh = this.add.image(0, 0, 'bshadow').setScale(this.k * 0.6).setDepth(1);
    const st = unitStats(cls as TClass), f: Fig = { im, sh, cls, rank, side, cav: st.cav, ranged: st.ranged > 0, onWall: false, x, y, tx: x, ty: y, hx: x, hy: y, speed: st.cav ? 70 : 34, state: 'idle', ph: Math.floor(Math.random() * 8) };
    this.figs.push(f); return f;
  }
  private engines() {
    const e = this.play.engines; if (!e) return;
    ENGINE_IDS.filter((id) => (e[id] ?? 0) > 0).forEach((id, i) => {
      const x = id === 'ram' ? 300 : id === 'tower' ? 320 : 22 + i * 22, y = id === 'ram' ? 162 : id === 'tower' ? 110 : 236 - (i % 2) * 18;
      const im = this.add.image(this.X(x), this.Y(y), `beng_${id}`).setOrigin(0.5, 1).setScale(this.k * 0.42).setDepth(this.Y(y)).setData('engine', id as Engine);
      if (id === 'ram' || id === 'tower') im.setData('home', x);
    });
  }
  private alive(side?: 0 | 1) { return this.figs.filter((f) => f.state !== 'dead' && f.state !== 'flee' && (side === undefined || f.side === side)); }

  // ---------------- each frame: walking, fighting and shadows ----------------
  update(_t: number, dt: number) {
    this.weather?.update(this.cameras.main);
    const tick = Math.floor(this.time.now / 110);
    for (const f of this.figs) {
      if (f.state === 'dead') continue;
      const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy), step = (f.speed * dt) / 1000;
      let fr = 0;
      if (d > 0.5) { f.x += (dx / d) * Math.min(d, step); f.y += (dy / d) * Math.min(d, step); fr = (tick + f.ph) % 4; if (dx) f.im.setFlipX(dx < 0); if ((f.cav || f.state === 'flee') && Math.random() < 0.08) this.dust.emitParticleAt(this.X(f.x), this.Y(f.y), 1); }
      else if (f.state === 'move') f.state = 'idle';
      if (f.state === 'fight' && d <= 0.5) { fr = (tick + f.ph) % 6 < 3 ? 4 : 5; if (fr === 5 && (tick + f.ph) % 6 === 3 && Math.random() < 0.25) this.clang(f); }
      if (f.state === 'cheer') fr = (tick + f.ph) % 8 < 4 ? 4 : 0;
      if (f.pose && this.time.now < f.pose.until) fr = f.pose.fr;
      const sx = this.X(f.x), sy = this.Y(f.y) - (f.state === 'cheer' && (tick + f.ph) % 8 < 4 ? 3 * this.k : 0);
      f.im.setFrame(sFrame(f.cls, f.rank, fr)).setPosition(sx, sy).setDepth(sy + (f.onWall ? 2 : 0));
      f.sh.setPosition(sx, this.Y(f.y)).setVisible(!f.onWall);
      f.flag?.setPosition(sx + 3 * this.k, sy - 14 * this.k).setDepth(sy + 1).setAngle(Math.sin(this.time.now / 300 + f.ph) * 4);
    }
    // the strength bars count down as men fall
    const h = this.hud; let moved = false;
    for (const i of [0, 1] as const) if (Math.abs(h.shown[i] - h.left[i]) > 0.5) { h.shown[i] += (h.left[i] - h.shown[i]) * Math.min(1, dt / 220); moved = true; }
    if (moved) this.drawHud();
  }
  private clang(f: Fig) {
    this.spark.emitParticleAt(this.X(f.x + (f.side ? -5 : 5)), this.Y(f.y - 9), 3 + Math.floor(Math.random() * 3));
    if (this.time.now - this.lastClang > 140) { this.lastClang = this.time.now; audio.play('clash'); }
  }

  // ---------------- what happens in each round ----------------
  private kill(side: 0 | 1, n: number) {
    const total = side === 0 ? this.play.result.startA : this.play.result.startB, per = Math.max(1, Math.ceil(total / MAX));
    this.hud.left[side] = Math.max(0, this.hud.left[side] - n);
    const pool = this.alive(side), front = pool.filter((f) => f.state === 'fight'), rest = pool.filter((f) => f.state !== 'fight');
    const victims = [...Phaser.Utils.Array.Shuffle(front), ...Phaser.Utils.Array.Shuffle(rest)].slice(0, Math.min(pool.length, Math.round(n / per + (n > 0 ? 0.4 : 0))));
    victims.forEach((f, i) => this.time.delayedCall(i * 45 + Math.random() * 200, () => this.fall(f)));
  }
  private fall(f: Fig) {
    if (f.state === 'dead') return;
    f.state = 'dead'; f.flag?.destroy(); f.flag = undefined;
    f.im.setTintFill(0xffffff); this.time.delayedCall(70, () => { f.im.clearTint(); f.im.setTint(this.night > 0.5 ? 0x8890a8 : 0xc8bcb0); });
    const dir = f.side ? 1 : -1;
    if (f.onWall) { this.tweens.add({ targets: f.im, x: f.im.x + dir * -14 * this.k, y: this.Y(f.y + 14), angle: dir * 120, duration: 500, ease: 'Quad.In' }); f.sh.setVisible(false); return; } // falls from the wall
    this.tweens.add({ targets: f.im, angle: dir * 88, x: f.im.x + dir * 4 * this.k, y: f.im.y + 2 * this.k, duration: 280, ease: 'Bounce.Out' });
    this.dust.emitParticleAt(f.im.x, f.im.y, 2);
    f.im.setDepth(f.im.y - 6); f.sh.setVisible(false);
  }
  private volley(from: 0 | 1, n: number) {
    const shooters = this.alive(from).filter((f) => f.ranged), foes = this.alive(from === 0 ? 1 : 0); if (!shooters.length || !foes.length) return;
    for (const s of shooters) { const d = Math.random() * 120, now = this.time.now; s.pose = { fr: 4, until: now + 300 + d }; this.time.delayedCall(300 + d, () => { s.pose = { fr: 5, until: this.time.now + 350 }; }); } // draw... loose
    const fire = this.night > 0.5; // fire arrows light the night
    for (let i = 0; i < Math.min(n, 44); i++) {
      const s = shooters[i % shooters.length], t = foes[Math.floor(Math.random() * foes.length)], miss = Math.random() < 0.55;
      const x0 = s.x, y0 = s.y - 12, x1 = t.x + (miss ? (Math.random() - 0.5) * 30 : 0), y1 = t.y - (miss ? 0 : 6) + (miss ? (Math.random() - 0.5) * 16 : 0);
      const a = this.add.image(0, 0, 'barrow').setScale(this.k).setDepth(8200).setFlipX(x1 < x0);
      const sh = this.add.image(0, 0, 'bdot').setTint(0x000000).setAlpha(0.25).setScale(this.k * 1.5, this.k * 0.6).setDepth(2);
      const glow = fire ? this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(this.k * 0.08).setTint(0xffa040).setDepth(8201) : null;
      const apex = Math.min(y0, y1) - 50 - Math.random() * 30, o = { t: 0 };
      this.tweens.add({ targets: o, t: 1, duration: 760 + Math.random() * 160, delay: 300 + i * 18 + Math.random() * 90, ease: 'Linear',
        onUpdate: () => { const u = o.t, x = x0 + (x1 - x0) * u, y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * apex + u * u * y1, dy = 2 * (1 - u) * (apex - y0) + 2 * u * (y1 - apex);
          a.setPosition(this.X(x), this.Y(y)).setRotation(Math.atan2(dy, (x1 - x0)) * (x1 < x0 ? -1 : 1)); sh.setPosition(this.X(x), this.Y(y0 + (y1 - y0) * u)); glow?.setPosition(a.x, a.y); },
        onComplete: () => { sh.destroy(); glow?.destroy(); if (miss) { a.setDepth(this.Y(y1) - 1).setRotation((x1 < x0 ? -1 : 1) * 1.1); this.stuck.push(a); this.tweens.add({ targets: a, alpha: 0, delay: 5000, duration: 1500 }); } else a.destroy(); } });
    }
    audio.play('arrows');
  }
  private charge(att: 0 | 1, a: number, b: number) {
    const horse = this.alive(att).filter((f) => f.cav), foes = this.alive(att === 0 ? 1 : 0).filter((f) => !f.onWall);
    if (!horse.length) return;
    audio.play('march');
    for (const f of horse) { f.state = 'move'; f.speed = 120; f.tx = (att === 0 ? 1 : -1) * 18 + (foes.length ? foes.reduce((s, x) => s + x.x, 0) / foes.length : W / 2); f.ty = f.hy + 40 * (Math.random() - 0.3); }
    this.time.delayedCall(900, () => {
      this.cameras.main.shake(220, 0.006); audio.play('clash');
      for (const f of foes) if (Math.abs(f.y - (horse[0]?.ty ?? f.y)) < 60) { f.x += att === 0 ? 4 : -4; this.dust.emitParticleAt(this.X(f.x), this.Y(f.y), 1); } // the line reels from the impact
      this.kill(0, a); this.kill(1, b);
      this.time.delayedCall(600, () => { for (const f of horse) if (f.state !== 'dead') { f.state = 'move'; f.speed = 70; f.tx = f.hx; f.ty = f.hy; } });
    });
  }
  private melee(a: number, b: number) {
    const res = this.play.result, walls = this.play.site?.walls;
    const line = walls ? this.wallX(walls.side) + (walls.side === 1 ? -10 : 10) : res.siege ? 360 : W / 2;
    const L = this.alive(0).filter((f) => !f.ranged && !f.onWall), R = this.alive(1).filter((f) => !f.ranged && !f.onWall);
    // pair men off along the line; the larger side's spare men press in behind
    const pair = (f: Fig, i: number, side: 0 | 1, n: number) => { const y = 96 + ((i * 160) / Math.max(1, n)) % 160 + Math.random() * 6, depth = Math.floor(i / 12) * 9; f.state = 'fight'; f.speed = f.cav ? 110 : 95; f.tx = side === 0 ? line - 6 - depth - Math.random() * 3 : line + 6 + depth + Math.random() * 3; f.ty = y; };
    const n = Math.max(L.length, R.length); L.forEach((f, i) => pair(f, i, 0, n)); R.forEach((f, i) => pair(f, i, 1, n));
    this.fighting = true;
    this.time.delayedCall(450, () => this.cameras.main.shake(160, 0.004)); // the lines meet
    this.time.delayedCall(1500, () => { this.kill(0, a); this.kill(1, b); });
    this.time.delayedCall(2000, () => { this.fighting = false; });
  }
  private assault(a: number, b: number) {
    const e = this.play.engines, walls = this.play.site?.walls;
    if (!walls) { this.melee(a, b); return; }
    const wx = this.wallX(walls.side), att = (walls.side === 1 ? 0 : 1) as 0 | 1;
    // engines hurl stones at the walls; the ram swings at the gate; ladders go up and men climb them
    if (e && (e.trebuchet || e.mangonel)) { audio.play('catapult'); for (let i = 0; i < 2 + (e.trebuchet ?? 0); i++) this.time.delayedCall(i * 380, () => this.stone(wx, 90 + Math.random() * 150)); }
    if (e?.ram) for (const im of this.children.list.filter((o) => (o as Phaser.GameObjects.Image).getData?.('engine') === 'ram') as Phaser.GameObjects.Image[]) {
      this.tweens.add({ targets: im, x: this.X(wx - 22), duration: 900, ease: 'Sine.In', onComplete: () => this.tweens.add({ targets: im, x: this.X(wx - 30), duration: 260, yoyo: true, repeat: 3, onYoyo: () => { this.cameras.main.shake(90, 0.004); this.debris.emitParticleAt(this.X(wx), this.Y(160), 6); } }) });
    }
    const climbers = this.alive(att).filter((f) => !f.ranged && !f.cav).slice(0, 12);
    climbers.forEach((f, i) => {
      const y = 100 + (i % 6) * 26, lx = walls.side === 1 ? wx - 4 : wx + 4;
      if (i % 2 === 0) { const ld = this.add.image(this.X(lx), this.Y(y + 2), 'bladder').setOrigin(0.5, 1).setScale(this.k * 0.9).setAngle(walls.side === 1 ? 14 : -14).setDepth(this.Y(y) - 1).setAlpha(0); this.tweens.add({ targets: ld, alpha: 1, duration: 200, delay: 400 + i * 80 }); this.stuck.push(ld); }
      f.state = 'move'; f.speed = 40; f.tx = lx + (walls.side === 1 ? -6 : 6); f.ty = y;
      this.time.delayedCall(1100 + i * 90, () => { if (f.state === 'dead') return; f.state = 'fight'; f.speed = 16; f.tx = wx + (walls.side === 1 ? 16 : -16); f.ty = y - 4; f.onWall = true; });
    });
    this.time.delayedCall(1500, () => { this.kill(0, a); this.kill(1, b); });
  }
  private stone(wx: number, y: number) {
    const x0 = 30 + Math.random() * 30, y0 = 230, o = { t: 0 }, b = this.add.image(0, 0, 'bdot').setTint(0x6e6e78).setScale(this.k * 2.4).setDepth(8300);
    const sh = this.add.image(0, 0, 'bshadow').setScale(this.k * 0.4).setDepth(2);
    this.tweens.add({ targets: o, t: 1, duration: 1100, ease: 'Linear', onUpdate: () => { const x = x0 + (wx - x0) * o.t, gy = y0 + (y - y0) * o.t; b.setPosition(this.X(x), this.Y(gy - Math.sin(o.t * Math.PI) * 110)).setAngle(o.t * 720); sh.setPosition(this.X(x), this.Y(gy)); },
      onComplete: () => { b.destroy(); sh.destroy(); this.cameras.main.shake(160, 0.006); this.debris.emitParticleAt(this.X(wx), this.Y(y - 10), 14); this.dust.emitParticleAt(this.X(wx), this.Y(y), 6);
        const crack = this.add.graphics().setDepth(this.Y(y)).lineStyle(this.k, 0x2a2420, 0.8); const cx = this.X(wx + (Math.random() - 0.5) * 8), cy = this.Y(y - 14); crack.beginPath().moveTo(cx, cy).lineTo(cx + 3 * this.k, cy + 5 * this.k).lineTo(cx - 2 * this.k, cy + 10 * this.k).strokePath(); this.stuck.push(crack); } });
  }
  private rout(loser: 0 | 1) {
    for (const f of this.alive(loser)) { f.state = 'flee'; f.onWall = false; f.speed = f.cav ? 90 : 50; f.tx = loser ? W + 60 : -60; f.ty = f.y + (Math.random() - 0.5) * 20; f.im.setFlipX(loser === 0); }
    for (const f of this.alive(loser === 0 ? 1 : 0)) { f.state = 'cheer'; f.tx = f.x; f.ty = f.y; }
  }

  // ---------------- heads-up display ----------------
  private makeHud() {
    const res = this.play.result, bars = this.add.graphics().setDepth(30000).setScrollFactor(0), style = { fontFamily: 'monospace', fontSize: `${Math.max(12, Math.round(this.k * 5.5))}px`, color: '#fff4d6', stroke: '#1d1716', strokeThickness: 4 };
    const nums = [this.add.text(0, 0, '', style).setDepth(30001), this.add.text(0, 0, '', style).setDepth(30001).setOrigin(1, 0)];
    const names = [this.add.text(0, 0, this.play.aName, style).setDepth(30001), this.add.text(0, 0, this.play.bName, style).setDepth(30001).setOrigin(1, 0)];
    this.hud = { bars, nums, left: [res.startA, res.startB], shown: [res.startA, res.startB] };
    const sw = this.scale.width, pad = 14, top = 64; names[0].setPosition(pad, top); names[1].setPosition(sw - pad, top);
    nums[0].setPosition(pad, top + names[0].height + 12); nums[1].setPosition(sw - pad, top + names[1].height + 12);
    this.drawHud();
  }
  private drawHud() {
    const h = this.hud, res = this.play.result, sw = this.scale.width, pad = 14, bw = Math.min(260, sw * 0.32), y = 64 + h.nums[0].height + 4, bh = 7;
    h.bars.clear();
    ([[0, pad, this.play.aColor, res.startA], [1, sw - pad - bw, this.play.bColor, res.startB]] as const).forEach(([i, x, col, start]) => {
      const f = Math.max(0, h.shown[i] / Math.max(1, start));
      h.bars.fillStyle(0x1d1716, 0.8).fillRect(x - 2, y - 2, bw + 4, bh + 4).fillStyle(0x3a302a, 1).fillRect(x, y, bw, bh).fillStyle(col, 1).fillRect(i === 0 ? x : x + bw * (1 - f), y, bw * f, bh);
      h.nums[i].setText(`${Math.round(h.shown[i])} men`).setY(y + bh + 4);
    });
  }
  private caption(text: string, big = false) {
    const sw = this.scale.width, size = Math.max(big ? 22 : 14, Math.round(this.k * (big ? 12 : 5.5)));
    const t = this.add.text(sw / 2, Math.max(this.Y(big ? 40 : 26), big ? 150 : 110), text, { fontFamily: big ? 'serif' : 'monospace', fontStyle: big ? 'bold' : '', fontSize: `${size}px`, color: big ? '#ffe08a' : '#fff4d6', stroke: '#1d1716', strokeThickness: big ? 7 : 5, align: 'center', wordWrap: { width: sw * 0.62 } }).setOrigin(0.5, 0).setDepth(30011).setAlpha(0);
    const bg = this.add.rectangle(sw / 2, t.y - 6, t.width + 30, t.height + 12, 0x1d1716, big ? 0 : 0.55).setOrigin(0.5, 0).setDepth(30010).setAlpha(0);
    this.tweens.add({ targets: [t, bg], alpha: 1, duration: 220, yoyo: !big, hold: 1500, onComplete: () => { if (!big) { t.destroy(); bg.destroy(); } } });
    if (big) this.tweens.add({ targets: t, scale: { from: 0.6, to: 1 }, duration: 500, ease: 'Back.Out' });
  }

  private run() {
    const res = this.play.result; let t = 2300;
    audio.play('horn');
    const at = (ms: number, fn: () => void) => this.time.delayedCall(ms, () => { if (getUI().battle?.phase === 'playing') fn(); });
    at(200, () => this.caption(this.play.site?.cry ? `${this.play.title}\n${this.play.site.cry}` : this.play.title)); // with the commander's own flourish
    // both hosts march into place (the castle's holders are already on their walls)
    for (const f of this.figs) if (f.state === 'move') { f.tx = f.hx; f.ty = f.hy; }
    for (const rd of res.rounds) {
      const step = t;
      if (rd.phase === 'volley') at(step, () => { this.caption(rd.text); this.volley(0, 30); this.volley(1, 30); this.time.delayedCall(1150, () => { this.kill(0, rd.a); this.kill(1, rd.b); }); });
      if (rd.phase === 'charge') at(step, () => { this.caption(rd.text); this.charge(rd.b > rd.a ? 0 : 1, rd.a, rd.b); });
      if (rd.phase === 'assault') at(step, () => { this.caption(rd.text); this.assault(rd.a, rd.b); });
      if (rd.phase === 'melee') at(step, () => { this.caption(rd.text); audio.play('clash'); this.melee(rd.a, rd.b); });
      if (rd.phase === 'rout') at(step, () => {
        const loser = res.winner === 'a' ? 1 : 0; this.caption(rd.text);
        audio.play(loser === 1 ? 'victory' : 'defeat'); this.rout(loser);
        this.time.delayedCall(700, () => this.caption(loser === 1 ? 'Victory!' : 'Defeat', true));
      });
      t += rd.phase === 'melee' || rd.phase === 'assault' ? 2300 : 2000;
    }
    at(t + 2000, () => this.finish());
  }
  finish() {
    const b = getUI().battle; if (b) setUI({ battle: { ...b, phase: 'report' } });
    audio.setWeather(weatherAt()); // hand the ambience back to the kingdom's own sky
    this.scene.stop();
  }
}
