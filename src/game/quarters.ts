// Soldiers off duty in their quarters: they come out of the barracks and keep busy, then go back in.
// Drill on the training field, shooting at the butts, sparring in the yard, dice and supper round the campfire,
// sharpening blades at the smithy, grooming horses, a stroll to the market on leave, and sleep at night.
// Purely visual; how many are in quarters (and the extra drill experience) is decided by quarterPlan().
import Phaser from 'phaser';
import { type GameState, type Building, footprint, TILE, quarterPlan, getState } from '../lib/state.ts';
import { sFrame, S } from './textures.ts';
import { UNIT_K } from './army.ts';
import { follow, type Pt } from './paths.ts';
import type { Ambient } from './ambient.ts';
import type { Chatter } from './chatter.ts';
import { campfire } from './art/biome.ts';
import { hdify } from './art/hd.ts';
import { withoutOutline } from './art/px.ts';

type Act = 'drill' | 'shoot' | 'spar' | 'fire' | 'dice' | 'smith' | 'groom' | 'leave' | 'inside';
interface Q { img: Phaser.GameObjects.Image; cls: string; rank: number; x: number; y: number; home: Pt; act: Act | null; spot?: Pt; path?: Pt[]; wait: number; ph: number; going: 'out' | 'back' | null; target?: Pt; face?: number }
const RANGED = new Set(['archer', 'longbow', 'crossbow', 'royalarcher']);
const MOUNTED = new Set(['lightcav', 'mknight', 'vetcav', 'knight', 'squire']);
const LINES: Partial<Record<Act, string[]>> = {
  drill: ['Left, right, left!', 'Thrust! Recover!', 'Again, from the top!', 'Keep in step!'],
  spar: ['Is that all you\'ve got?', 'Watch your footwork!', 'Yield?', 'Nearly had you!'],
  fire: ['Pass the bread.', 'Stew again?', 'Sing us one, Wat!', 'My feet are killing me.', 'Who\'s on watch tonight?', 'Good ale, this.'],
  dice: ['Sixes! Pay up!', 'Loaded dice, I swear.', 'Double or nothing.', 'One more throw...'],
  smith: ['Edge like a razor now.', 'Mind the grindstone.', 'Dented my helm again.'],
  groom: ['Easy, girl, easy.', 'Who\'s a good horse?', 'He bit me again!'],
  leave: ['An hour\'s leave!', 'To the tavern!', 'Fresh pies at the market.'],
  shoot: ['Bullseye!', 'Wind\'s picking up.', 'Nock, draw, loose!'],
};

export class QuartersLife {
  private men: Q[] = []; private sig = ''; private fires: Phaser.GameObjects.Image[] = [];
  private spots: Partial<Record<Act, Pt[]>> = {}; private doors: Pt[] = [];
  constructor(private scene: Phaser.Scene, private amb: Ambient, private chatter: Chatter) {
    const T = scene.textures; for (const f of [0, 1]) if (!T.exists(`fire${f}`)) T.addCanvas(`fire${f}`, hdify(withoutOutline(() => campfire(f)), { grain: 3 }));
  }
  /** How many soldiers to show (most are indoors at any time), from what quarters hold. */
  sync(s: GameState) {
    const plan = quarterPlan(s), n = [...plan.per.values()].reduce((a, b) => a + b, 0);
    const B = s.buildings, sig = `${n}|` + B.filter((b) => ['barracks', 'guardhouse', 'trainfield', 'range', 'stable', 'cavstable', 'blacksmith', 'armory', 'camp', 'greathall', 'keep', 'market', 'well'].includes(b.kind)).map((b) => b.id + b.level).join();
    if (sig === this.sig) return; this.sig = sig;
    this.men.forEach((m) => m.img.destroy()); this.men = []; this.fires.forEach((f) => f.destroy()); this.fires = [];
    if (!n) return;
    // where they live: barracks first, then guardhouses, the great hall, the keep, the camp
    const pri = ['barracks', 'guardhouse', 'greathall', 'keep', 'palace', 'camp'], homes = B.filter((b) => pri.includes(b.kind)).sort((a, b) => pri.indexOf(a.kind) - pri.indexOf(b.kind));
    if (!homes.length) return;
    const nav = this.amb.nav, door = (b: Building): Pt => { const [w, h] = footprint(b.kind), d = { x: (b.x + w / 2) * TILE, y: (b.y + h) * TILE + 3 }, t = nav.nearestFree(nav.tileOf(d), 3); return t && !nav.free(nav.tileOf(d).x, nav.tileOf(d).y) ? { x: (t.x + 0.5) * TILE, y: (t.y + 0.75) * TILE } : d; };
    this.doors = homes.slice(0, 4).map(door);
    const inside = (b: Building, i: number, n: number): Pt => { const [w, h] = footprint(b.kind); return { x: (b.x + 0.7 + ((i % n) / Math.max(1, n - 1)) * (w - 1.4)) * TILE, y: (b.y + 0.9 + Math.floor(i / n) * 0.9) * TILE }; };
    const first = (k: string) => B.filter((b) => b.kind === k);
    const yard = (p: Pt, i: number): Pt => { const t = nav.nearestFree(nav.tileOf({ x: p.x + (i % 3 - 1) * 14, y: p.y + 10 + Math.floor(i / 3) * 9 }), 3); return t ? { x: (t.x + 0.5) * TILE, y: (t.y + 0.75) * TILE } : p; };
    this.spots = {
      drill: first('trainfield').flatMap((b) => Array.from({ length: 8 }, (_, i) => inside(b, i, 4))),
      shoot: first('range').flatMap((b) => Array.from({ length: 3 }, (_, i) => ({ ...inside(b, i, 3), y: (b.y + footprint(b.kind)[1]) * TILE - 4 }))),
      spar: this.doors.slice(0, 2).flatMap((d) => [yard(d, 0), yard(d, 2)]),
      smith: [...first('blacksmith'), ...first('armory')].map(door),
      groom: [...first('stable'), ...first('cavstable')].map(door),
      leave: [...first('market'), ...first('well')].map(door),
    };
    // the campfire before the main quarters, with seats round it
    const fp = yard(this.doors[0], 4), fire = this.scene.add.image(fp.x, fp.y + 2, 'fire0').setOrigin(0.5, 1).setScale(S * 0.8).setDepth(fp.y); this.fires.push(fire);
    this.spots.fire = [0, 1, 2, 3, 4].map((i) => ({ x: fp.x + Math.cos((i / 5) * Math.PI * 2) * 13, y: fp.y + Math.sin((i / 5) * Math.PI * 2) * 6 }));
    this.spots.dice = [{ x: fp.x + 30, y: fp.y + 4 }, { x: fp.x + 40, y: fp.y + 4 }, { x: fp.x + 35, y: fp.y + 9 }];
    // who they are: a fair sample of the men in quarters
    const pool: { cls: string; rank: number }[] = [];
    for (const [bat] of plan.per) for (const q of s.squads.filter((x) => x.bat === bat)) for (let i = 0; i < Math.min(q.count, 6); i++) pool.push({ cls: q.cls, rank: q.rank });
    const shown = Math.min(36, Math.max(4, Math.round(n * 0.35)), pool.length);
    for (let i = 0; i < shown; i++) {
      const p = pool[Math.floor((i * pool.length) / shown)], home = this.doors[i % this.doors.length];
      const img = this.scene.add.image(home.x, home.y, 'soldiers', sFrame(p.cls, p.rank, 0)).setOrigin(0.5, 1).setScale(S * UNIT_K).setVisible(false);
      this.men.push({ img, cls: p.cls, rank: p.rank, x: home.x, y: home.y, home, act: 'inside', wait: Math.random() * 8000, ph: i % 8, going: null });
    }
  }
  private taken(spot: Pt) { return this.men.some((m) => m.spot === spot); }
  /** Picks what a soldier does next, by who he is, the hour and what the town has. */
  private choose(m: Q) {
    const h = getState().settings.dayNight === 'night' ? 23 : getState().settings.dayNight === 'day' ? 12 : new Date().getHours(), night = h >= 21 || h < 6;
    const free = (a: Act) => (this.spots[a] ?? []).filter((p) => !this.taken(p));
    const w: [Act, number][] = night ? [['inside', 8], ['fire', 3], ['dice', 1]]
      : [['drill', MOUNTED.has(m.cls) ? 0.5 : 3], ['shoot', RANGED.has(m.cls) ? 5 : 0], ['spar', RANGED.has(m.cls) ? 0.5 : 2], ['fire', 2], ['dice', 1.2], ['smith', 1], ['groom', MOUNTED.has(m.cls) ? 4 : 0.3], ['leave', 1], ['inside', 2]];
    const opts = w.filter(([a, v]) => v > 0 && (a === 'inside' || free(a).length));
    let roll = Math.random() * opts.reduce((a, [, v]) => a + v, 0), act: Act = 'inside';
    for (const [a, v] of opts) if ((roll -= v) <= 0) { act = a; break; }
    if (act === 'inside') { m.act = null; m.going = 'back'; m.spot = undefined; m.path = this.amb.nav.path(m, m.home) ?? [m.home]; return; }
    const list = free(act), spot = list[Math.floor(Math.random() * list.length)];
    m.act = act; m.spot = spot; m.going = 'out'; m.path = [...(this.amb.nav.path(m, spot) ?? []), spot];
  }
  update(time: number, dt: number) {
    const tick = Math.floor(time / 150);
    for (const f of this.fires) f.setTexture(`fire${Math.floor(time / 380) % 2}`);
    for (const m of this.men) {
      let f = 0;
      if (m.act === 'inside' && !m.going) { // indoors: resting, eating, sleeping; out again later
        if ((m.wait -= dt) <= 0) { m.img.setVisible(true).setAlpha(0); this.scene.tweens.add({ targets: m.img, alpha: 1, duration: 300 }); m.x = m.home.x; m.y = m.home.y; this.choose(m); }
        continue;
      }
      if (m.going) {
        if (m.path?.length) { const dir = follow(m, dt, 16); if (dir) m.img.setFlipX(dir < 0); f = (tick + m.ph) % 4; }
        else if (m.going === 'back') { m.going = null; m.act = 'inside'; m.wait = 10000 + Math.random() * 20000; this.scene.tweens.add({ targets: m.img, alpha: 0, duration: 300, onComplete: () => m.img.setVisible(false) }); continue; }
        else {
          m.going = null; m.wait = (m.act === 'fire' || m.act === 'dice' ? 18000 : 12000) + Math.random() * 14000;
          if (m.act === 'fire' && this.fires[0]) m.img.setFlipX(this.fires[0].x < m.x);
          if (m.act === 'spar') { const foe = this.men.find((o) => o !== m && o.act === 'spar' && !o.going && o.spot && Math.hypot(o.spot.x - m.x, o.spot.y - m.y) < 40); if (foe) { m.img.setFlipX(foe.x < m.x); foe.img.setFlipX(m.x < foe.x); } }
          const lines = LINES[m.act!]; if (lines && Math.random() < 0.35 && this.chatter.count < 3) this.chatter.say({ get x() { return m.x; }, get y() { return m.y; }, h: 16, alive: () => m.img.active && m.img.visible }, lines[Math.floor(Math.random() * lines.length)], 400, 300);
        }
      } else { // at work
        const cyc = (tick + m.ph) % 12;
        switch (m.act) {
          case 'drill': f = Math.floor(time / 600) % 2 ? 4 : 5; break; // the whole squad thrusts in time
          case 'spar': f = cyc % 6 < 2 ? 0 : cyc % 6 < 4 ? 4 : 5; if (cyc === 4 && Math.random() < 0.05) this.amb.spark(m.x + (m.img.flipX ? -6 : 6), m.y - 12); break;
          case 'shoot': { const c = (Math.floor(time / 250) + m.ph) % 12; f = c < 5 ? 0 : c < 10 ? 4 : 5; if (c === 10 && (m.face ?? 0) <= 0) { m.face = 1000; this.amb.shoot(m.x + 4, m.y - 12, m.x + 2, m.y - 60); } m.face = (m.face ?? 0) - dt; break; }
          case 'smith': f = cyc % 4 < 2 ? 4 : 5; if (cyc % 4 === 2 && Math.random() < 0.12) this.amb.spark(m.x + (m.img.flipX ? -6 : 6), m.y - 8); break;
          case 'groom': f = cyc < 6 ? 4 : 0; break;
          case 'dice': f = cyc === 0 ? 4 : 2; break;
          case 'fire': f = 2; break;
          default: f = 0;
        }
        if ((m.wait -= dt) <= 0) this.choose(m);
      }
      m.img.setFrame(sFrame(m.cls, m.rank, f)).setPosition(Math.round(m.x), Math.round(m.y)).setDepth(this.amb.depthAt(m.x, m.y));
    }
  }
  /** Speech targets for the town's chatter. */
  talkers() { return this.men.filter((m) => m.img.visible && !m.going).map((m) => ({ role: 'soldier', walking: false, t: { get x() { return m.x; }, get y() { return m.y; }, h: 16, alive: () => m.img.active && m.img.visible } })); }
}
