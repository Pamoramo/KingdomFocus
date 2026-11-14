// Little town happenings: a faint "?" appears; tap it to watch a short scene play out.
import Phaser from 'phaser';
import { getState, footprint, TILE, townOrder } from '../lib/state.ts';
import { townEvent } from '../lib/town.ts';
import { sFrame, S } from './textures.ts';
import { animal, questionMark } from './art/misc.ts';
import { hdify } from './art/hd.ts';
import { withoutOutline } from './art/px.ts';
import { audio } from './audio.ts';
import type { Chatter } from './chatter.ts';

type Animal = 'pig' | 'chicken' | 'cat';
interface Actor { img: Phaser.GameObjects.Image; x: number; y: number; cls: string; kind: 'person' | Animal; rank: number }
interface Marker { img: Phaser.GameObjects.Image; x: number; y: number; id: EventId; expires: number }
type EventId = 'pig' | 'bard' | 'treasure' | 'proposal' | 'squabble' | 'child' | 'hens' | 'tipsy' | 'scholar' | 'spy';
const EVENTS: [EventId, number][] = [['pig', 3], ['bard', 3], ['treasure', 2], ['proposal', 2], ['squabble', 3], ['child', 2], ['hens', 3], ['tipsy', 3], ['scholar', 2], ['spy', 2]];
const pickEvent = (): EventId => { const tot = EVENTS.reduce((a, [, w]) => a + w, 0); let r = Math.random() * tot; for (const [id, w] of EVENTS) if ((r -= w) < 0) return id; return 'pig'; };

export class TownEvents {
  marker: Marker | null = null;
  playing = false;
  private actors: Actor[] = [];
  constructor(private scene: Phaser.Scene, private chatter: Chatter) {
    const T = scene.textures;
    if (!T.exists('qmark')) T.addCanvas('qmark', hdify(questionMark(), { outline: false, rim: false, grain: 0 }));
    for (const a of ['pig', 'chicken', 'cat'] as const) for (const f of [0, 1]) if (!T.exists(`an_${a}${f}`)) T.addCanvas(`an_${a}${f}`, hdify(withoutOutline(() => animal(a, f)), { grain: 3 }));
  }
  /** Maybe place a new "?" beside a random building. */
  maybeSpawn(chance = 0.3) {
    if (this.marker || this.playing || Math.random() > chance) return;
    const s = getState(), bs = s.buildings.filter((b) => !['road', 'wall', 'palisade', 'courtyard', 'moat'].includes(b.kind));
    if (!bs.length) return;
    const b = bs[Math.floor(Math.random() * bs.length)], [w, h] = footprint(b.kind), x = (b.x + w / 2) * TILE + (Math.random() - 0.5) * 20, y = (b.y + h) * TILE + 14;
    const img = this.scene.add.image(x, y, 'qmark').setOrigin(0.5, 1).setScale(S * 0.9).setDepth(30001).setAlpha(0);
    this.scene.tweens.add({ targets: img, alpha: 0.6, duration: 600 });
    this.scene.tweens.add({ targets: img, y: y - 3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.marker = { img, x, y, id: pickEvent(), expires: Date.now() + 150_000 };
  }
  update() {
    if (this.marker && Date.now() > this.marker.expires) { const m = this.marker; this.marker = null; this.scene.tweens.add({ targets: m.img, alpha: 0, duration: 800, onComplete: () => m.img.destroy() }); }
    for (const a of this.actors) a.img.setPosition(Math.round(a.x), Math.round(a.y)).setDepth(a.y);
  }
  /** Returns true if the tap opened an event. */
  tap(wx: number, wy: number) {
    const m = this.marker; if (!m || Math.hypot(wx - m.x, wy - (m.y - 8)) > 14) return false;
    this.marker = null; this.scene.tweens.killTweensOf(m.img);
    this.scene.tweens.add({ targets: m.img, scale: S * 1.6, alpha: 0, duration: 250, onComplete: () => m.img.destroy() });
    if (getState().settings.sound) audio.play('coin');
    this.play(m.id, m.x, m.y - 4);
    return true;
  }

  // ---------- tiny script engine ----------
  private wait(ms: number) { return new Promise<void>((res) => this.scene.time.delayedCall(ms, res)); }
  private spawn(who: string, x: number, y: number, flip = false, rank = 0, tint?: number): Actor {
    const animalKind = ['pig', 'chicken', 'cat'].includes(who) ? (who as Animal) : null;
    const img = animalKind ? this.scene.add.image(x, y, `an_${animalKind}0`).setOrigin(0.5, 1).setScale(S) : this.scene.add.image(x, y, 'soldiers', sFrame(who, rank, 0)).setOrigin(0.5, 1).setScale(S);
    img.setFlipX(flip).setAlpha(0); if (tint) img.setTint(tint);
    this.scene.tweens.add({ targets: img, alpha: 1, duration: 300 });
    const a: Actor = { img, x, y, cls: who, kind: animalKind ?? 'person', rank }; this.actors.push(a); return a;
  }
  private walk(a: Actor, tx: number, ty: number, speed = 20) {
    const d = Math.hypot(tx - a.x, ty - a.y), ms = Math.max(1, (d / speed) * 1000);
    if (Math.abs(tx - a.x) > 1) a.img.setFlipX(tx < a.x);
    const anim = this.scene.time.addEvent({ delay: 130, loop: true, callback: () => { const f = Math.floor(this.scene.time.now / 130) % 4; if (a.kind === 'person') a.img.setFrame(sFrame(a.cls, a.rank, f)); else a.img.setTexture(`an_${a.kind}${f % 2}`); } });
    return new Promise<void>((res) => this.scene.tweens.add({ targets: a, x: tx, y: ty, duration: ms, onComplete: () => { anim.remove(); if (a.kind === 'person') a.img.setFrame(sFrame(a.cls, a.rank, 0)); res(); } }));
  }
  /** A line of dialogue; it fades just before the next line so bubbles never overlap. */
  private say(a: Actor, text: string, voice = 440, hold = 1900) { this.chatter.say({ get x() { return a.x; }, get y() { return a.y; }, h: a.kind === 'person' ? 16 : 9, alive: () => a.img.active }, text, 0, voice, hold > 0 ? Math.max(500, hold - 350) : undefined); return this.wait(hold); }
  private burst(x: number, y: number, tint: number[], n = 24) { const e = this.scene.add.particles(x, y, 'px', { speed: { min: 20, max: 60 }, angle: { min: 220, max: 320 }, gravityY: 60, lifespan: 900, scale: { start: 1.4, end: 0 }, tint, emitting: false }).setDepth(30000); e.explode(n); this.scene.time.delayedCall(1100, () => e.destroy()); }
  private async leave(...as: Actor[]) {
    await Promise.all(as.map((a) => this.walk(a, a.x + (a.img.flipX ? -40 : 40), a.y + 6, 24)));
    for (const a of as) this.scene.tweens.add({ targets: a.img, alpha: 0, duration: 400, onComplete: () => a.img.destroy() });
    this.actors = this.actors.filter((x) => !as.includes(x));
  }

  private async play(id: EventId, x: number, y: number) {
    this.playing = true;
    try {
      switch (id) {
        case 'pig': {
          const pig = this.spawn('pig', x - 20, y), farmer = this.spawn('worker', x - 40, y + 2);
          await this.say(pig, 'Oink!', 700, 700);
          const loop = [[x + 25, y - 6], [x + 10, y + 10], [x - 20, y + 4], [x + 5, y - 8]];
          for (let i = 0; i < loop.length; i++) { const [tx, ty] = loop[i]; const p = this.walk(pig, tx, ty, 34); this.walk(farmer, tx - 10, ty + 2, 28); if (i === 0) this.say(farmer, 'Come back here, Sir Bacon!', 360, 0); await p; }
          await this.walk(farmer, pig.x - 8, pig.y + 1, 28);
          await this.say(farmer, 'Got you! Thank you, my lord.', 360);
          await this.leave(pig, farmer); townEvent('The runaway pig was caught. The farmer pays his thanks.', { gold: 10 }); break;
        }
        case 'bard': {
          const bard = this.spawn('villager', x, y, false, 2), crowd = [this.spawn('worker', x - 22, y + 6), this.spawn('villager', x + 22, y + 6, true), this.spawn('worker', x + 4, y + 14, true)];
          if (getState().settings.sound) audio.play('lute');
          await this.say(bard, '~ Hear the tale of a lord most wise... ~', 520, 2400);
          await this.say(bard, '~ ...who studied hard, and watched walls rise! ~', 520, 2200);
          this.burst(x, y - 16, [0xffe27a, 0xffffff], 14);
          await this.say(crowd[0], 'Bravo!', 360, 900); await this.say(crowd[1], 'Encore!', 480, 1100);
          await this.leave(bard, ...crowd); townEvent('A wandering bard sang of your deeds.', { renown: 3 }); break;
        }
        case 'treasure': {
          const w = this.spawn('worker', x, y);
          for (let i = 0; i < 3; i++) { w.img.setFrame(sFrame('worker', 0, 4)); await this.wait(250); w.img.setFrame(sFrame('worker', 0, 5)); this.burst(x + 6, y, [0x8a6a44, 0xb99260], 6); await this.wait(250); }
          await this.say(w, 'What\'s this, then?', 360, 1300);
          const gold = 20 + Math.floor(Math.random() * 41);
          this.burst(x + 6, y - 4, [0xffe27a, 0xecc94b, 0xfff1a8], 30); if (getState().settings.sound) audio.play('reward');
          await this.say(w, 'A pouch of old coins! For the treasury!', 360);
          await this.leave(w); townEvent(`A worker dug up a forgotten pouch of ${gold} gold.`, { gold }); break;
        }
        case 'proposal': {
          const a = this.spawn('worker', x - 9, y), b = this.spawn('villager', x + 9, y, true), c = this.spawn('villager', x + 2, y + 16, true);
          await this.wait(400); a.img.setFrame(sFrame('worker', 0, 2));
          await this.say(a, 'Will you marry me?', 380, 1800);
          await this.say(b, 'Yes! A thousand times yes!', 500, 1500);
          this.burst(x, y - 18, [0xff6a8a, 0xff9ab0, 0xffffff], 26); if (getState().settings.sound) audio.play('achieve');
          await this.say(c, 'Hooray! A wedding!', 470, 1300);
          await this.leave(a, b, c); townEvent('Two villagers are to be wed. The town celebrates.', { renown: 3 }); break;
        }
        case 'squabble': {
          const a = this.spawn('swordsman', x - 10, y, false, 1), b = this.spawn('spearman', x + 10, y, true, 1);
          await this.say(a, 'You polish your helm like a farmer!', 320, 1800);
          await this.say(b, 'At least mine has no dents!', 300, 1600);
          for (let i = 0; i < 4; i++) { a.img.setFrame(sFrame('swordsman', 1, i % 2 ? 4 : 5)); b.img.setFrame(sFrame('spearman', 1, i % 2 ? 5 : 4)); if (i === 1 && getState().settings.sound) audio.play('clash'); await this.wait(260); }
          await this.say(a, 'Ha! Good bout. Drink later?', 320, 1500);
          await this.leave(a, b); townEvent('Two soldiers settled a squabble with a friendly bout. Good training!', {}, 20); break;
        }
        case 'child': {
          const kid = this.spawn('villager', x, y); kid.img.setScale(S * 0.7);
          await this.say(kid, 'I can\'t find my mum!', 660, 1500);
          const g = this.spawn('spearman', x + 40, y + 4, true, 1);
          await this.walk(g, x + 10, y + 1, 26); await this.say(g, 'Don\'t worry, little one.', 300, 1400);
          const mum = this.spawn('villager', x - 40, y + 2); await this.walk(mum, x - 9, y, 30);
          await this.say(mum, 'There you are! Thank you, guard!', 470, 1500);
          await this.leave(kid, mum, g); townEvent('A guard reunited a lost child with their mother.', { renown: 2 }); break;
        }
        case 'hens': {
          const hens = [0, 1, 2, 3, 4].map((i) => this.spawn('chicken', x - 30 + i * 4, y + (i % 3) * 5));
          const farmer = this.spawn('villager', x - 44, y + 2);
          if (getState().settings.sound) audio.babble(8, 900);
          const runs = hens.map((h, i) => this.walk(h, x + 30 + i * 6, y - 10 + i * 6, 40 + i * 4));
          this.say(farmer, 'My hens! Come back!', 480, 0); this.walk(farmer, x + 20, y + 4, 26);
          await Promise.all(runs); await this.wait(600);
          await this.say(farmer, 'At least they left eggs...', 480, 1500);
          await this.leave(farmer, ...hens); townEvent('A hen stampede! The farmer sells the eggs they left behind.', { gold: 8 }); break;
        }
        case 'tipsy': {
          const d = this.spawn('worker', x, y);
          for (let i = 0; i < 4; i++) { await this.walk(d, x + (i % 2 ? 10 : -6), y + (i % 2 ? 3 : -2), 12); d.img.setAngle(i % 2 ? 8 : -8); }
          d.img.setAngle(0);
          await this.say(d, 'Hic! Who moved the tavern?', 340, 1800);
          await this.say(d, 'I shall... hic... study tomorrow.', 340, 1600);
          await this.leave(d); townEvent('A tipsy villager wandered the streets looking for the tavern.'); break;
        }
        case 'scholar': {
          const sch = this.spawn('villager', x, y, false, 3, 0x9a8ac8);
          await this.say(sch, 'Listen well...', 420, 1100);
          const lines = ['A page a day builds walls that last.', 'The longest road is walked one hour at a time.', 'Discipline is a castle no army can breach.', 'Who studies today, commands tomorrow.'];
          await this.say(sch, lines[Math.floor(Math.random() * lines.length)], 420, 2600);
          this.burst(x, y - 14, [0xb0a0ff, 0xffffff], 18);
          await this.leave(sch); townEvent('A wandering scholar shared their wisdom.', { renown: 5 }); break;
        }
        case 'spy': {
          const spy = this.spawn('villager', x, y, false, 0, 0x4a4a5a);
          await this.say(spy, '*scribbles notes about your walls*', 600, 1600);
          if (townOrder(getState()).guards > 0) {
            const g = this.spawn('halberdier', x + 40, y + 2, true, 1);
            await this.say(g, 'Oi! What are you writing?', 300, 1000);
            await this.walk(g, x + 9, y, 34); await this.say(spy, 'Just... admiring the view!', 600, 1300);
            await this.say(g, 'Spy! To the dungeon with you.', 300, 1400);
            await this.leave(spy, g); townEvent('Your guards caught a foreign spy sketching the walls.', { renown: 4 });
          } else {
            await this.walk(spy, x - 60, y + 10, 30); await this.leave(spy);
            townEvent('A hooded stranger sketched your walls and slipped away. Guards on duty would have caught them.');
          }
          break;
        }
      }
    } finally { this.playing = false; }
  }
}
