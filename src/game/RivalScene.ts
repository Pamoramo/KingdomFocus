import Phaser from 'phaser';
import { getState, subscribe, TILE, type GameState } from '../lib/state.ts';
import { realmLayout, RW, RH, type RealmLayout, type Biome } from '../lib/realms.ts';
import { armyOf, ENGINE_IDS, consumption, type Rival } from '../lib/war.ts';
import { BUILDINGS, CONNECTS, type BKind } from '../lib/economy.ts';
import { campaignSquads } from '../lib/warActions.ts';
import { biomeTile, plant, rubble, church, stall, windmill, windmillSails, pavise, campfire, mineEntrance, barricade, wagon, BIOME_PLANTS, BIOME_DENSITY } from './art/biome.ts';
import { engineArt, siegeCamp } from './art/war.ts';
import { hdify, HD } from './art/hd.ts';
import { withoutOutline } from './art/px.ts';
import { wallWalk } from './art/buildings.ts';
import { bTex, tileTex, waterTex, sFrame, bannerTex, S } from './textures.ts';
import { Chatter } from './chatter.ts';
import { NavGrid, follow, realmNav, type Pt } from './paths.ts';
import { WeatherFx, weatherAt, biomeWeather } from './weather.ts';
import { nightFactor } from './KingdomScene.ts';
import { audio } from './audio.ts';

const WW = RW * TILE, WH = RH * TILE;
const hashXY = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const VOICE = { you: 330, foe: 280, folk: 470 };
const FOLK: Record<Biome, string[]> = {
  grassland: ['Fine weather for the fields.', 'The cows are restless today.', 'Fresh bread at the bakery!'],
  desert: ['Water... I need water.', 'Mind the scorpions!', 'The sand gets everywhere.', 'Another scorching day.'],
  tundra: ['Brr! Another cold day.', 'Pass the furs, will you?', 'The lake froze again.', 'My beard has icicles.'],
  forest: ['Watch for wolves tonight.', 'The woodcutters are busy.', 'I love the smell of pine.'],
  swamp: ['Ugh, my boots are soaked.', 'Did that log just move?', 'The mist never lifts here.'],
  highlands: ['The pass is steep today.', 'Goats everywhere!', 'You can see for miles up here.'],
};
/** Weather leans on the biome: deserts stay dry, the tundra snows, swamps fog over. */

interface Fig { img: Phaser.GameObjects.Image; x: number; y: number; cls: string; rank: number; side: 'you' | 'foe' | 'folk'; onWall?: boolean; path?: Pt[]; leave?: Pt; starving?: boolean; triumph?: boolean; tx?: number; ty?: number; wait?: number; ph: number;
  /** a soldier off doing something in the siege camp, and where he stands in the host */ job?: Job; home?: Pt; carry?: Phaser.GameObjects.Rectangle }
type JobKind = 'forage' | 'wood' | 'water' | 'dice' | 'cook' | 'sleep' | 'drill' | 'idle';
interface Job { kind: JobKind; stage: 'out' | 'work' | 'back'; until: number; dur: number; at: Pt; mate?: Fig; zz?: Phaser.GameObjects.Text }

/** A rival kingdom up close: its biome, castle and town, and your siege camp when you march on it. */
export class RivalScene extends Phaser.Scene {
  private r!: Rival; private L!: RealmLayout; private frame = 0;
  private bImgs: { img: Phaser.GameObjects.Image; kind: BKind; level: number; suburb?: boolean }[] = [];
  private marks: { img: Phaser.GameObjects.Image; suburb?: boolean }[] = [];
  private nav = new NavGrid(RW, RH);
  private wallImgs: { img: Phaser.GameObjects.Image; x: number; y: number }[] = [];
  private fires: Phaser.GameObjects.Image[] = []; private smoke: [number, number][] = []; private sheltering = false;
  private waterImgs: { img: Phaser.GameObjects.Image; land: number }[] = [];
  private figs: Fig[] = []; private siegeObjs: Phaser.GameObjects.GameObject[] = []; private siegeSig = '';
  private chatter!: Chatter; private weather!: WeatherFx; private shade!: Phaser.GameObjects.Rectangle;
  private doors: { x: number; y: number }[] = []; private unsub: (() => void)[] = []; private campAt: Pt | null = null;
  private drag: { x: number; y: number; sx: number; sy: number } | null = null; private pinch: { d: number; z: number } | null = null;
  constructor() { super('rival'); }
  init(data: { id: string }) { this.r = getState().world.rivals.find((x) => x.id === data.id)!; this.figs = []; this.waterImgs = []; this.bImgs = []; this.marks = []; this.wallImgs = []; this.siegeObjs = []; this.siegeSig = ''; }

  create() {
    const s = getState(); this.L = realmLayout(s.world, this.r);
    this.nav = realmNav(this.L);
    this.makeTextures(); this.drawGround(); this.placeBuildings(); this.spawnFolk(); this.triumph();
    this.chatter = new Chatter(this);
    this.weather = new WeatherFx(this, WW, WH);
    this.shade = this.add.rectangle(-WW, -WH, WW * 3, WH * 3, 0xffffff).setOrigin(0).setDepth(20000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const cam = this.cameras.main;
    cam.setBounds(-WW * 0.1, -WH * 0.1, WW * 1.2, WH * 1.2).setRoundPixels(true).setBackgroundColor('#2b2118');
    cam.setZoom(Phaser.Math.Clamp(this.scale.width / 640, 0.6, 2.6)); cam.centerOn((this.L.gate.x + 1) * TILE, (this.L.box.y1 + 6) * TILE);
    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown); if (ps.length === 2) { this.pinch = { d: Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y), z: cam.zoom }; this.drag = null; } else this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pinch) { const a = this.input.pointer1, b = this.input.pointer2; if (a.isDown && b.isDown) cam.setZoom(Phaser.Math.Clamp(this.pinch.z * Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / this.pinch.d, 0.5, 5)); return; }
      if (this.drag && p.isDown) cam.setScroll(this.drag.sx - (p.x - this.drag.x) / cam.zoom, this.drag.sy - (p.y - this.drag.y) / cam.zoom);
    });
    this.input.on('pointerup', () => { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null; this.drag = null; });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), 0.5, 5)));
    this.unsub.push(subscribe(() => this.syncSiege(getState())));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
    this.time.addEvent({ delay: 3500, loop: true, callback: () => this.siegeMood() });
    this.time.addEvent({ delay: 1400, loop: true, callback: () => this.campLife() });
    this.time.addEvent({ delay: 380, loop: true, callback: () => { this.frame++; for (const b of this.bImgs) if (b.img.visible) b.img.setTexture(bTex(this, b.kind, b.level, this.frame % 2).key); for (const w of this.waterImgs) w.img.setTexture(waterTex(this, w.land, this.frame % 3)); for (const f of this.fires) f.setTexture(`fire${this.frame % 2}`); } });
    this.time.addEvent({ delay: 6500, loop: true, callback: () => this.chat() });
    this.time.addEvent({ delay: 4200, loop: true, callback: () => this.volley() });
    this.time.addEvent({ delay: 900, loop: true, callback: () => { for (const [x, y] of this.smoke) { const p = this.add.image(x, y, 'px').setTint(0xcfc6b8).setAlpha(0.7).setDepth(19000).setScale(1.5); this.tweens.add({ targets: p, y: y - 26, x: x + 6, alpha: 0, scale: 3.5, duration: 2600, onComplete: () => p.destroy() }); } } });
    const wx = () => this.weather.set(biomeWeather(this.L.biome, weatherAt())); wx(); this.time.addEvent({ delay: 30000, loop: true, callback: wx });
    this.applyNight(); this.time.addEvent({ delay: 20000, loop: true, callback: () => this.applyNight() });
    this.syncSiege(s);
  }

  private makeTextures() {
    const T = this.textures, b = this.L.biome;
    for (let v = 0; v < 4; v++) { const k = `bt_${b}${v}`; if (!T.exists(k)) T.addCanvas(k, hdify(biomeTile(b, v), { rim: false, outline: false, grain: 6, seed: v })); }
    BIOME_PLANTS[b].forEach((p, i) => { for (const sd of [0, 1]) { const k = `bp_${p}${sd}`; if (!T.exists(k)) T.addCanvas(k, hdify(withoutOutline(() => plant(p, sd + i * 3)), { seed: sd })); } });
    if (!T.exists('church')) T.addCanvas('church', hdify(withoutOutline(() => church())));
    if (!T.exists('windmill')) T.addCanvas('windmill', hdify(withoutOutline(() => windmill())));
    if (!T.exists('mill_sails')) T.addCanvas('mill_sails', hdify(withoutOutline(() => windmillSails())));
    for (let i = 0; i < 4; i++) if (!T.exists(`stall${i}`)) T.addCanvas(`stall${i}`, hdify(withoutOutline(() => stall(i))));
    for (let i = 0; i < 3; i++) if (!T.exists(`rubble${i}`)) T.addCanvas(`rubble${i}`, hdify(withoutOutline(() => rubble(i * 7 + 1))));
    if (!T.exists('camp_icon')) T.addCanvas('camp_icon', hdify(withoutOutline(() => siegeCamp())));
    const once = (k: string, draw: () => HTMLCanvasElement) => { if (!T.exists(k)) T.addCanvas(k, hdify(withoutOutline(draw), { grain: 3 })); };
    once('pavise', pavise); once('mine', mineEntrance); once('barricade', barricade); for (const f of [0, 1]) { once(`fire${f}`, () => campfire(f)); once(`wagon${f}`, () => wagon(f)); }
    for (const e of ENGINE_IDS) for (const f of [0, 1]) if (!T.exists(`eng_${e}${f}`)) T.addCanvas(`eng_${e}${f}`, hdify(withoutOutline(() => engineArt(e, f))));
  }
  /** The state of the siege made visible: when morale sinks soldiers desert the camp, when food runs out they sit hungry by cold fires;
   *  a despairing garrison slips away from the walls. Cosmetic: the campaign's real losses are handled by the siege rules. */
  private siegeMood() {
    const s = getState(), c = s.world.campaign; if (!c || c.target !== this.r.id || c.phase !== 'siege') return;
    this.figs = this.figs.filter((f) => f.img.active);
    const mine = this.figs.filter((f) => f.side === 'you' && !f.leave), soldiers = campaignSquads(s).reduce((a, q) => a + q.count, 0), daysLeft = c.supplies / consumption(Math.max(1, soldiers));
    const say = (f: Fig, lines: string[], delay = 0) => this.chatter.say({ get x() { return f.x; }, get y() { return f.y; }, h: 16, alive: () => f.img.active }, lines[Math.floor(Math.random() * lines.length)], delay, 320);
    // desertion: the lower the morale, the more often someone slips away from the back of the host
    if (mine.length > 6 && c.morale < 45 && Math.random() < (45 - c.morale) / 45) {
      const f = [...mine].sort((a, b) => b.y - a.y)[Math.floor(Math.random() * Math.min(6, mine.length))], left = f.x < (this.L.gate.x + 1) * TILE;
      f.leave = { x: left ? -20 : RW * TILE + 20, y: Math.min(RH * TILE - 10, f.y + 80 + Math.random() * 80) };
      say(f, ['I\'ve had enough of this siege!', 'I\'m going home to my farm.', 'This war isn\'t worth dying for.', 'They don\'t pay us enough...']);
      const mate = mine.find((m) => m !== f && Math.hypot(m.x - f.x, m.y - f.y) < 40); if (mate && Math.random() < 0.5) say(mate, ['Come back, coward!', 'Deserter!', 'Let him go...'], 1400);
    }
    // hunger: once food is almost gone the soldiers sit, pale and weak, and the cookfires burn low
    const hungry = daysLeft < 2;
    for (const f of mine) { const want = hungry && (f.ph % 3 === 0 || daysLeft < 0.5); if (want !== !!f.starving) { f.starving = want; f.img.setTint(want ? 0xd8cfa8 : 0xffffff).setAngle(want ? (f.img.flipX ? -12 : 12) : 0); } }
    for (const fl of this.fires) fl.setAlpha(hungry ? 0.35 : 1);
    if (hungry && Math.random() < 0.5) { const f = mine.filter((m) => m.starving)[Math.floor(Math.random() * Math.max(1, mine.filter((m) => m.starving).length))]; if (f) say(f, ['So hungry...', 'Not even a rat left to eat.', 'When do the supply wagons come?', 'I\'d trade my sword for bread.']); }
    // a despairing garrison: defenders slip down from the walls
    if (c.garrisonMorale < 35 && Math.random() < 0.3) { const d = this.figs.find((f) => f.side === 'foe' && f.onWall && !f.leave); if (d) { this.tweens.add({ targets: d.img, alpha: 0, y: d.img.y - 6, duration: 1600, onComplete: () => d.img.destroy() }); d.leave = { x: d.x, y: d.y }; } }
  }
  /** Life in the siege camp between assaults: most of a siege was waiting. Soldiers forage the countryside (more desperately
   *  when food runs short), cut firewood, fetch water, cook, play dice, spar, nap by day and sleep at night, and grumble. */
  private campLife() {
    const s = getState(), c = s.world.campaign, camp = this.campAt; if (!c || c.target !== this.r.id || c.phase !== 'siege' || !camp) return;
    const mine = this.figs.filter((f) => f.side === 'you' && f.img.active && !f.leave && !f.triumph && f.home), busy = mine.filter((f) => f.job).length;
    const idle = mine.filter((f) => !f.job && !f.starving), cap = Math.min(16, Math.ceil(mine.length * 0.3));
    if (!idle.length || busy >= cap) return;
    const soldiers = campaignSquads(s).reduce((a, q) => a + q.count, 0), daysLeft = c.supplies / consumption(Math.max(1, soldiers)), night = nightFactor(s.settings.dayNight).n > 0.55;
    const T = TILE, B = this.L.box, now = this.time.now, R = (a: number, b: number) => a + Math.random() * (b - a);
    const w: [JobKind, number][] = night ? [['sleep', 6], ['dice', 2], ['cook', 1.5], ['idle', 1]]
      : [['forage', daysLeft < 3 ? 6 : 2], ['wood', 1.5], ['water', this.L.water.length ? 1.2 : 0], ['dice', c.morale > 30 ? 2 : 0.6], ['cook', 1.4], ['sleep', 1], ['drill', c.morale > 45 ? 1.4 : 0.3], ['idle', 2]];
    let roll = Math.random() * w.reduce((a, x) => a + x[1], 0), kind: JobKind = 'idle'; for (const [k, v] of w) { if ((roll -= v) <= 0) { kind = k; break; } }
    const f = idle[Math.floor(Math.random() * idle.length)];
    const free = (p: Pt) => { const t = this.nav.nearestFree(this.nav.tileOf(p), 6); return t ? { x: (t.x + 0.5) * T, y: (t.y + 0.75) * T } : p; };
    const countryside = () => { const left = f.x < camp.x; return free({ x: (left ? R(2, Math.max(3, B.x0 - 4)) : R(Math.min(RW - 3, B.x1 + 4), RW - 2)) * T, y: R(B.y1 + 4, RH - 3) * T }); };
    const nearCamp = (r: number) => free({ x: camp.x + R(-r, r), y: camp.y - R(20, 60) });
    let at: Pt, dur = R(3500, 6000);
    if (kind === 'forage' || kind === 'wood') at = countryside();
    else if (kind === 'water') { const outside = this.L.water.filter((t) => t.y > B.y1 + 2 || t.x < B.x0 - 2 || t.x > B.x1 + 2); const t = outside.length ? outside[Math.floor(Math.random() * outside.length)] : null; at = t ? free({ x: (t.x + 0.5) * T, y: (t.y + 0.75) * T }) : countryside(); }
    else if (kind === 'dice' || kind === 'cook') { at = nearCamp(150); dur = kind === 'dice' ? R(9000, 15000) : R(6000, 9000); }
    else if (kind === 'sleep') { at = nearCamp(220); dur = night ? R(20000, 40000) : R(9000, 16000); }
    else if (kind === 'drill') { at = nearCamp(120); dur = R(6000, 9000); }
    else { at = free({ x: f.x + R(-60, 60), y: f.y + R(20, 60) }); dur = R(2500, 4000); }
    f.job = { kind, stage: 'out', until: now + dur, dur, at }; f.path = this.nav.path(f, at) ?? [at];
    // games and sparring need company
    if (kind === 'dice' || kind === 'drill') for (const m of idle.filter((m) => m !== f).slice(0, kind === 'dice' ? 2 : 1)) {
      const spot = { x: at.x + (kind === 'drill' ? 16 : R(-14, 14)), y: at.y + (kind === 'drill' ? 0 : R(-6, 6)) };
      m.job = { kind, stage: 'out', until: now + dur, dur, at: spot, mate: f }; m.path = this.nav.path(m, spot) ?? [spot];
    }
    const lines: Record<JobKind, string[]> = {
      forage: daysLeft < 2 ? ['Anything to eat out there...', 'I\'ll find food or die trying.', 'The farmers hid everything.'] : ['Off to find some turnips.', 'Let\'s see what the villages left us.', 'Fresh eggs, if we\'re lucky.'],
      wood: ['Fires won\'t feed themselves.', 'Need timber for the ladders.', 'Fetching firewood.'],
      water: ['Off to fill the buckets.', 'Hope they haven\'t fouled the stream.'],
      dice: ['Dice, anyone?', 'Double or nothing!', 'I\'ll win my pay back tonight.'],
      cook: ['Pottage again.', 'Who stole the salt?', 'Stir it, don\'t burn it!'],
      sleep: night ? ['Wake me if they sally.', 'Goodnight, lads.'] : ['Just resting my eyes...', 'Wake me when the wall falls.'],
      drill: ['Keep your guard up!', 'Again! Faster!', 'Mind the shield.'],
      idle: ['Another day staring at walls.', 'How long can they hold out?', 'I miss my wife\'s stew.', 'My boots are rotting.', 'Rain again, I bet.', 'Heard the captain snores.'],
    };
    if (Math.random() < 0.55) this.chatter.say({ get x() { return f.x; }, get y() { return f.y; }, h: 16, alive: () => f.img.active }, lines[kind][Math.floor(Math.random() * lines[kind].length)], 300, 300);
  }
  /** Moves a soldier through his camp job; returns the frame to show. */
  private doJob(f: Fig, dt: number, tick: number): number {
    const j = f.job!, now = this.time.now;
    if (j.stage === 'out' || j.stage === 'back') {
      if (f.path?.length) { const dir = follow(f, dt, j.stage === 'back' && f.carry ? 20 : 28); if (dir) f.img.setFlipX(dir < 0); if (f.carry) f.carry.setPosition(f.x + (f.img.flipX ? -3 : 3), f.y - 9).setDepth(f.y + 1); return (tick + f.ph) % 4; }
      if (j.stage === 'back') { f.carry?.destroy(); f.carry = undefined; f.job = undefined; return 0; }
      j.stage = 'work'; j.until = Math.max(j.until, now + (j.mate || j.kind === 'dice' || j.kind === 'drill' ? 2500 : j.dur)); // the work starts when he gets there
      if (j.kind === 'sleep') { f.img.setAngle(f.img.flipX ? -90 : 90); j.zz = this.add.text(f.x + 4, f.y - 14, 'z', { fontFamily: 'monospace', fontSize: '9px', color: '#e8e4ff' }).setDepth(30000).setResolution(2); }
      if (j.mate) f.img.setFlipX(j.mate.x < f.x);
    }
    if (j.stage === 'work') {
      if (j.zz) { const k = ((now / 900) % 3) | 0; j.zz.setText('z'.repeat(k + 1)).setPosition(f.x + 6, f.y - 14 - k * 2); }
      if (now >= j.until || (j.mate && !j.mate.img.active)) {
        f.img.setAngle(0); j.zz?.destroy(); j.zz = undefined;
        const load = j.kind === 'forage' ? 0x8a6a3a : j.kind === 'wood' ? 0x6a4a2a : j.kind === 'water' ? 0x5a7a9a : 0;
        if (load) f.carry = this.add.rectangle(f.x, f.y - 9, j.kind === 'wood' ? 7 : 4, j.kind === 'wood' ? 2 : 4, load).setDepth(f.y + 1);
        if (j.kind === 'forage' && Math.random() < 0.35) this.chatter.say({ get x() { return f.x; }, get y() { return f.y; }, h: 16, alive: () => f.img.active }, Math.random() < 0.5 ? 'Found a sack of oats!' : 'Only a few onions...', 0, 300);
        if (j.kind === 'dice' && !j.mate && Math.random() < 0.6) this.chatter.say({ get x() { return f.x; }, get y() { return f.y; }, h: 16, alive: () => f.img.active }, Math.random() < 0.5 ? 'Ha! Pay up!' : 'You cheat, I swear it.', 0, 300);
        j.stage = 'back'; f.path = this.nav.path(f, f.home!) ?? [f.home!]; return 0;
      }
      switch (j.kind) {
        case 'wood': return (tick + f.ph) % 4 < 2 ? 4 : 5; // swinging the axe
        case 'drill': return (tick + f.ph) % 6 < 3 ? 4 : 5;
        case 'forage': case 'water': return (tick + f.ph) % 8 < 4 ? 2 : 0; // stooping
        case 'cook': if ((tick + f.ph) % 20 === 0) f.img.setFlipX(!f.img.flipX); return 0;
        case 'dice': return (tick + f.ph) % 14 === 0 ? 4 : 0; // a throw
        default: return 0;
      }
    }
    return 0;
  }
  /** Just conquered: your soldiers march up the high street, through the gate, into the castle. */
  private triumph() {
    const r = getState().world.rivals.find((x) => x.id === this.r.id) ?? this.r; if (!r.conquered || Date.now() - r.conquered > 15 * 60_000) return;
    const T = TILE, start = { x: (this.L.gate.x + 1) * T, y: Math.min(RH - 2, this.L.box.y1 + 16) * T }, keep = this.L.buildings.find((b) => b.kind === 'keep'), inner = this.L.inner ?? this.L.box;
    const goal = keep ? { x: (keep.x + 2) * T, y: (keep.y + 4) * T + 4 } : { x: ((inner.x0 + inner.x1) / 2) * T, y: (inner.y1 - 1) * T };
    const kinds = ['knight', 'swordsman', 'spearman', 'spearman', 'archer', 'swordsman'];
    for (let i = 0; i < 18; i++) this.time.delayedCall(i * 650, () => {
      const f = this.fig(kinds[i % kinds.length], 1 + (i % 2), start.x + (i % 2 ? 6 : -6), start.y + 30, 'you');
      f.path = this.nav.path(f, goal) ?? [goal]; f.triumph = true;
      if (i === 0) this.chatter.say({ get x() { return f.x; }, get y() { return f.y; }, h: 16, alive: () => f.img.active }, 'The castle is ours!', 600, 330);
    });
  }
  private occupied() {
    const o = new Set<string>();
    for (const b of this.L.buildings) { const d = BUILDINGS[b.kind]; for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) o.add(`${b.x + i},${b.y + j}`); }
    for (const w of [...this.L.walls, ...this.L.water, ...this.L.bridges, ...this.L.streets, ...this.L.plaza]) o.add(`${w.x},${w.y}`);
    for (const m of this.L.landmarks) for (let i = 0; i < m.w; i++) for (let j = 0; j < m.h; j++) o.add(`${m.x + i},${m.y + j}`);
    return o;
  }
  private drawGround() {
    const b = this.L.biome, rt = this.add.renderTexture(0, 0, WW * HD, WH * HD).setOrigin(0).setDepth(-10).setScale(S), occ = this.occupied();
    const plants = BIOME_PLANTS[b], dens = BIOME_DENSITY[b], gx = this.L.gate.x, campTop = this.L.box.y1 + 2;
    rt.beginDraw();
    const deco: [string, number, number][] = [];
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const h = hashXY(x + this.r.x * 1000, y + this.r.y * 1000);
      rt.batchDraw(`bt_${b}${h % 7 === 0 ? 3 : h % 3}`, x * TILE * HD, y * TILE * HD);
      const inside = x > this.L.box.x0 && x < this.L.box.x1 && y > this.L.box.y0 && y < this.L.box.y1, approach = Math.abs(x - gx) < 12 && y >= campTop;
      if (!occ.has(`${x},${y}`) && !inside && !approach && ((h >>> 9) % 1000) / 1000 < dens * (x < 2 || x > RW - 3 || y > RH - 3 ? 4 : 1)) deco.push([`bp_${plants[(h >>> 4) % plants.length]}${h % 2}`, x, y]);
    }
    for (const [k, x, y] of deco.sort((a, c) => a[2] - c[2])) rt.batchDraw(k, x * TILE * HD, (y * TILE - 8) * HD);
    rt.endDraw();
    // the high street, back lanes and market square: cobbles in a prosperous town, beaten earth in a poor one
    const pavedSet = new Set([...this.L.streets, ...this.L.plaza, ...this.L.bridges].map((t) => `${t.x},${t.y}`)), cob = this.L.wealth === 'poor' ? 1 : 2;
    const isPaved = (x: number, y: number) => pavedSet.has(`${x},${y}`) || (y <= this.L.gate.y && x >= this.L.gate.x && x <= this.L.gate.x + 1);
    for (const t of this.L.streets) { const m = (isPaved(t.x, t.y - 1) ? 1 : 0) | (isPaved(t.x + 1, t.y) ? 2 : 0) | (isPaved(t.x, t.y + 1) ? 4 : 0) | (isPaved(t.x - 1, t.y) ? 8 : 0); this.add.image(t.x * TILE, (t.y + 1) * TILE, tileTex(this, 'road', cob, m)).setOrigin(0, 1).setScale(S).setDepth(-6); }
    for (const t of this.L.plaza) this.add.image(t.x * TILE, (t.y + 1) * TILE, tileTex(this, 'courtyard', 1, 15)).setOrigin(0, 1).setScale(S).setDepth(-6);
    // rivers, ponds, oases, frozen lakes and moats
    const wet = new Set(this.L.water.map((t) => `${t.x},${t.y}`)), isWet = (x: number, y: number) => wet.has(`${x},${y}`) || this.L.bridges.some((b) => b.x === x && b.y === y) || x < 0 || x >= RW || y < 0 || y >= RH;
    for (const t of this.L.water) {
      const land = (isWet(t.x, t.y - 1) ? 0 : 1) | (isWet(t.x + 1, t.y) ? 0 : 2) | (isWet(t.x, t.y + 1) ? 0 : 4) | (isWet(t.x - 1, t.y) ? 0 : 8);
      const img = this.add.image(t.x * TILE, t.y * TILE, waterTex(this, land, 0)).setOrigin(0).setScale(S).setDepth(-7);
      if (this.L.frozen) img.setTint(0xdcecff); else this.waterImgs.push({ img, land });
    }
    for (const b of this.L.bridges) this.add.image(b.x * TILE, (b.y + 1) * TILE, tileTex(this, 'road', 2, 5, 0, true)).setOrigin(0, 1).setScale(S).setDepth(-5);
  }
  private placeBuildings() {
    const L = this.L, wallSet = new Set(L.walls.map((w) => `${w.x},${w.y}`)), conn = new Map<string, BKind>();
    for (const b of L.buildings) if (CONNECTS.includes(b.kind)) { const d = BUILDINGS[b.kind]; for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) conn.set(`${b.x + i},${b.y + j}`, b.kind); }
    const ok = (x: number, y: number) => wallSet.has(`${x},${y}`) || conn.has(`${x},${y}`);
    for (const w of L.walls) {
      const mask = (ok(w.x, w.y - 1) ? 1 : 0) | (ok(w.x + 1, w.y) ? 2 : 0) | (ok(w.x, w.y + 1) ? 4 : 0) | (ok(w.x - 1, w.y) ? 8 : 0);
      const img = this.add.image(w.x * TILE, (w.y + 1) * TILE, tileTex(this, L.wallKind, L.wallLevel, mask)).setOrigin(0, 1).setScale(S).setDepth((w.y + 1) * TILE);
      this.wallImgs.push({ img, x: w.x, y: w.y });
    }
    for (const b of L.buildings) {
      const d = BUILDINGS[b.kind], by = (b.y + d.h) * TILE;
      const img = this.add.image(b.x * TILE, by, bTex(this, b.kind, b.level, 0).key).setOrigin(0, 1).setScale(S).setDepth(by);
      if (L.biome === 'tundra') img.setTint(0xeef4ff); if (L.biome === 'desert') img.setTint(0xfff2dc);
      this.bImgs.push({ img, kind: b.kind, level: b.level, suburb: b.suburb });
      this.doors.push({ x: (b.x + d.w / 2) * TILE, y: by + 4 });
    }
    // the parish church and the market stalls
    for (const m of L.landmarks) {
      const by = (m.y + m.h) * TILE, img = this.add.image(m.kind === 'windmill' ? (m.x + 1) * TILE : m.x * TILE, by, m.kind === 'church' ? 'church' : m.kind === 'windmill' ? 'windmill' : `stall${m.v % 4}`).setOrigin(m.kind === 'windmill' ? 0.5 : 0, 1).setScale(S).setDepth(by);
      if (m.kind === 'windmill') { const sails = this.add.image((m.x + 1) * TILE, by - img.displayHeight * (1 - 22 / 56), 'mill_sails').setScale(S).setDepth(by + 1); this.tweens.add({ targets: sails, angle: 360, duration: 9000, repeat: -1 }); if (L.biome === 'tundra') sails.setTint(0xeef4ff); }
      if (L.biome === 'tundra') img.setTint(0xeef4ff);
      this.marks.push({ img, suburb: m.suburb });
      this.doors.push({ x: (m.x + m.w / 2) * TILE, y: by + 4 });
    }
    // the rival's banners over the keep and gate
    for (const [x, y] of [[(L.gate.x + 1) * TILE - 18, (L.box.y1 + 1) * TILE - 4], [(L.gate.x + 1) * TILE + 18, (L.box.y1 + 1) * TILE - 4]]) this.add.image(x, y, this.r.status === 'vassal' ? bannerTex(this, getState().battalions[0]?.color ?? 0xb3242a, getState().battalions[0]?.emblem ?? 'lion', 0) : bannerTex(this, this.r.color, this.r.emblem, 0)).setOrigin(0.2, 1).setScale(S).setDepth(y + 1);
  }
  private fig(cls: string, rank: number, x: number, y: number, side: Fig['side'], flip = false) {
    const img = this.add.image(x, y, 'soldiers', sFrame(cls, rank, 0)).setOrigin(0.5, 1).setScale(S).setFlipX(flip).setDepth(y);
    if (side === 'foe') img.setTint(0xffe4dc);
    const f: Fig = { img, x, y, cls, rank, side, ph: Math.floor(Math.random() * 6) }; this.figs.push(f); return f;
  }
  private spawnFolk() {
    const n = Math.min(26, 6 + this.L.buildings.length);
    for (let i = 0; i < n; i++) { const d = this.doors[i % this.doors.length], t = this.nav.nearestFree(this.nav.tileOf(d), 4) ?? this.nav.tileOf(d); const f = this.fig(i % 3 ? 'villager' : 'worker', 0, (t.x + 0.5) * TILE, (t.y + 0.75) * TILE, 'folk'); f.wait = Math.random() * 4000; } // on open ground by their door
    // sentries on the gate wall
    const south = this.L.walls.filter((t) => t.y === this.L.box.y1 && Math.abs(t.x - this.L.gate.x) > 2).sort((a, b) => a.x - b.x);
    const n2 = Math.min(6, Math.max(2, Math.floor(south.length / 3)));
    const walk = wallWalk(this.L.wallKind, this.L.wallLevel);
    for (let i = 0; i < n2 && south.length; i++) { const t = south[Math.floor((i + 0.5) * south.length / n2)]; const f = this.fig(this.r.level >= 3 ? 'crossbow' : 'archer', Math.min(3, Math.max(0, this.r.level - 1)), t.x * TILE + 8, (t.y + 1) * TILE - walk, 'foe', i % 2 === 0); f.onWall = true; } // depth follows f.y, just behind the wall, so the parapet hides their legs
  }

  /** The siege laid out as it was historically done (front to back):
   *  - mangonels and ballistae behind pavises within bowshot, rams under their shed at the gate, towers at the wall;
   *  - a palisaded siege line against sallies, with trebuchets behind it (they outrange archers);
   *  - the host formed up behind the line;
   *  - the camp out of arrow range: rows of tents, a command tent, cooking fires, supply wagons and horse lines.
   *  Blockades post pickets around the other sides; sapping opens a timber-propped mine near the wall. */
  private syncSiege(s: GameState) {
    const c = s.world.campaign?.target === this.r.id && s.world.campaign.phase !== 'march' ? s.world.campaign : null, r = s.world.rivals.find((x) => x.id === this.r.id) ?? this.r;
    const sig = c ? `${c.phase}|${c.stance}|${Math.round((c.wallHp / c.wallMax) * 20)}|${JSON.stringify(c.engines)}|${campaignSquads(s).map((q) => q.count).join()}` : 'peace';
    if (sig === this.siegeSig) return; this.siegeSig = sig;
    this.siegeObjs.forEach((o) => o.destroy()); this.siegeObjs = []; this.fires = []; this.smoke = [];
    // before a siege, defenders burn the suburbs in front of the gate so the enemy finds no shelter there
    // a siege scars the suburbs: under the enemy's camp and siege lines houses are razed or still burning;
    // nearer the walls most stand, some damaged, a few ablaze (decided per house, so it stays the same each visit)
    const gxT = this.L.gate.x + 1, y1 = this.L.box.y1, fate = (b: { img: Phaser.GameObjects.Image }) => {
      const tx = (b.img.x + b.img.displayWidth / 2) / TILE, ty = b.img.y / TILE, h = (Math.round(tx * 7 + ty * 13) * 2654435761 >>> 0) % 100;
      if (Math.abs(tx - gxT) <= 14 && ty >= y1 + 8 && ty <= y1 + 25) return h < 55 ? 'razed' : 'ablaze';
      return h < 45 ? 'whole' : h < 80 ? 'damaged' : 'ablaze';
    };
    for (const b of [...this.bImgs, ...this.marks]) if (b.suburb) { const f = c ? fate(b) : 'whole'; b.img.setVisible(f !== 'razed').setTint(f === 'damaged' ? 0xa89888 : f === 'ablaze' ? 0x8a6a58 : 0xffffff); }
    this.figs = this.figs.filter((f) => { if ((f.side === 'you' && !f.triumph) || (f.side === 'foe' && f.y > (this.L.box.y1 + 2) * TILE)) { f.img.destroy(); f.carry?.destroy(); f.job?.zz?.destroy(); return false; } return true; });
    this.campAt = null;
    if (this.sheltering !== !!c) for (const f of this.figs) if (f.side === 'folk') { f.path = undefined; f.wait = Math.random() * 1500; }
    this.sheltering = !!c;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.siegeObjs.push(o); return o; };
    // razed houses leave charred rubble; burning ones have flames on the roof; damaged ones smoulder
    if (c) for (const b of [...this.bImgs, ...this.marks]) if (b.suburb) {
      const f = fate(b), w = b.img.displayWidth, x0 = b.img.x, y0 = b.img.y, top = y0 - b.img.displayHeight, n = Math.max(1, Math.round(w / TILE));
      if (f === 'razed') { for (let i = 0; i < n; i++) add(this.add.image(x0 + i * TILE, y0, `rubble${(i + Math.round(x0 / TILE)) % 3}`).setOrigin(0, 1).setScale(S).setTint(0x6a5a50).setDepth(y0 - 1)); if (Math.round(x0 / TILE) % 2) this.smoke.push([x0 + w / 2, y0 - 8]); }
      if (f === 'ablaze') { for (let i = 0; i < Math.min(2, n); i++) { const fl = add(this.add.image(x0 + w * (0.3 + i * 0.4), top + b.img.displayHeight * 0.45, 'fire0').setOrigin(0.5, 1).setScale(S * 0.9).setDepth(y0 + 1)); this.fires.push(fl); } this.smoke.push([x0 + w / 2, top + 6], [x0 + w * 0.7, top + 10]); }
      if (f === 'damaged' && Math.round(x0 / TILE + y0 / TILE) % 2 === 0) this.smoke.push([x0 + w / 2, top + 8]);
    }
    const img = (k: string, x: number, y: number, sc = S, frame?: string) => add(this.add.image(x, y, k, frame).setOrigin(0.5, 1).setScale(sc).setDepth(y));
    // walls crack and, near the gate, fall into rubble; defenders block the breach with barricades
    const ratio = c ? c.wallHp / c.wallMax : 1, inner = this.L.inner;
    const outer = this.wallImgs.filter((w) => !inner || w.x < inner.x0 - 1 || w.x > inner.x1 + 1 || w.y < inner.y0 - 1 || w.y > inner.y1 + 1);
    const byGate = [...outer].sort((a, b) => Math.hypot(a.x - this.L.gate.x, a.y - this.L.box.y1) - Math.hypot(b.x - this.L.gate.x, b.y - this.L.box.y1));
    const cracked = Math.round((1 - ratio) * outer.length * 0.6), breach = ratio < 0.4 ? Math.round(((0.4 - ratio) / 0.4) * 8) + 1 : 0;
    this.wallImgs.forEach((w) => w.img.setVisible(true).setTint(0xffffff));
    byGate.forEach((w, i) => { if (i < breach) { w.img.setVisible(false); add(this.add.image(w.img.x, w.img.y, `rubble${i % 3}`).setOrigin(0, 1).setScale(S).setDepth(w.img.depth)); if (i % 2 === 0) add(this.add.image(w.img.x, w.img.y - 2, 'barricade').setOrigin(0, 1).setScale(S).setDepth(w.img.depth + 1)); } else if (i < cracked + breach) w.img.setTint(0x9a8c84); });
    if (!c) return;
    const gx = (this.L.gate.x + 1) * TILE, front = (this.L.box.y1 + 1) * TILE, T = TILE;
    const line = front + 9 * T, hostY = line + 1.5 * T, campY = Math.min(RH * T - 20, line + 9 * T);
    // the camp, out of arrow range
    const myBat = s.battalions.find((b) => c.battalions.includes(b.id)), col = myBat?.color ?? 0xb3242a, emb = myBat?.emblem ?? 'lion';
    for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) img('camp_icon', gx - 210 + i * 80 + (row ? 40 : 0), campY - row * 34, S * 0.9);
    img('camp_icon', gx, campY - 64, S * 1.6); // the commander's pavilion
    for (const dx of [-26, 26]) add(this.add.image(gx + dx, campY - 70, bannerTex(this, col, emb, 0)).setOrigin(0.2, 1).setScale(S * 1.2).setDepth(campY - 69));
    for (const dx of [-130, -40, 70, 160]) { const f = img('fire0', gx + dx, campY - 46, S); this.fires.push(f); this.smoke.push([gx + dx, campY - 54]); }
    for (let i = 0; i < 3; i++) img('wagon0', gx + 230 + (i % 2) * 10, campY - 40 - i * 22, S * 1.1);
    const horses = campaignSquads(s).some((q) => ['lightcav', 'mknight', 'vetcav'].includes(q.cls));
    if (horses) for (let i = 0; i < 5; i++) img('soldiers', gx - 250, campY - 30 - i * 14, S, sFrame('lightcav', 0, 0));
    // the siege line: a palisade with a gap for sorties and the road
    for (let x = this.L.gate.x - 12; x <= this.L.gate.x + 13; x++) if (Math.abs(x - this.L.gate.x - 0.5) > 2) add(this.add.image(x * T, line, tileTex(this, 'palisade', 1, (x > this.L.gate.x - 12 ? 8 : 0) | (x < this.L.gate.x + 13 ? 2 : 0))).setOrigin(0, 1).setScale(S).setDepth(line));
    // your host behind the line, one figure per soldier (up to 140)
    const men = campaignSquads(s).flatMap((q) => Array.from({ length: q.count }, () => ({ cls: q.cls, rank: q.rank }))).slice(0, 140);
    men.forEach((m, i) => { const blk = Math.floor(i / 24), k = i % 24, bx = gx - 200 + (blk % 4) * 108 + (blk % 4 >= 2 ? 20 : 0), by = hostY + Math.floor(blk / 4) * 66; const f = this.fig(m.cls, m.rank, bx + (k % 6) * 12 + (Math.floor(k / 6) % 2) * 3, by + Math.floor(k / 6) * 10, 'you', Math.random() < 0.15); f.home = { x: f.x, y: f.y }; });
    this.campAt = { x: gx, y: campY };
    if (c.phase === 'field') {
      const foe = armyOf(r, r.power * 0.6).flatMap((u) => Array.from({ length: u.count }, () => ({ cls: u.cls, rank: u.rank }))).slice(0, 90);
      foe.forEach((m, i) => this.fig(m.cls, m.rank, gx - 150 + (i % 18) * 17, front + 30 + Math.floor(i / 18) * 11, 'foe', i % 2 === 0));
      return;
    }
    // engines: trebuchets behind the line, mangonels and ballistae forward behind pavises
    let fx = gx - 190, bx = gx - 120;
    for (const e of ENGINE_IDS) for (let i = 0; i < Math.min(3, c.engines[e]); i++) {
      if (e === 'ram') { const ram = img('eng_ram0', gx + i * 6, front + 22); this.tweens.add({ targets: ram, y: ram.y - 6, duration: 700, yoyo: true, repeat: -1, ease: 'Quad.In' }); continue; }
      if (e === 'tower') { img('eng_tower0', (this.L.box.x0 + 3 + i * 6) * T, front + 14, S * 1.2); continue; }
      if (e === 'trebuchet') { const t = img('eng_trebuchet0', bx, line - 4, S * 1.15); t.setData('engine', e); bx += 70; continue; }
      const m = img(`eng_${e}0`, fx, front + 4.5 * T); m.setData('engine', e); img('pavise', fx + 4, front + 3.2 * T); fx += 52;
    }
    for (let i = 0; i < 5; i++) img('pavise', gx + 70 + i * 26, front + 3.2 * T); // shields for your archers
    // blockade pickets on the other sides; a mine when sapping
    if (c.stance === 'blockade') for (let i = 0; i < 6; i++) { const side = i % 3, px = side === 0 ? (this.L.box.x0 - 4) * T : side === 1 ? (this.L.box.x1 + 5) * T : (this.L.box.x0 + 4 + i * 3) * T, py = side === 2 ? Math.max(14, (this.L.box.y0 - 2) * T) : (this.L.box.y0 + 3 + i * 2) * T; this.fig('spearman', 1, px, py, 'you'); this.fig('spearman', 1, px + 10, py + 2, 'you', true); }
    if (c.stance === 'sap') { const mx = (this.L.box.x0 + 5) * T, my = front + 3 * T; img('mine', mx, my, S * 1.2); for (let i = 0; i < 2; i++) { const w = this.fig('worker', 0, mx - 14 + i * 28, my + 4, 'you', i === 1); this.tweens.add({ targets: w.img, angle: { from: -6, to: 6 }, duration: 300, yoyo: true, repeat: -1 }); } }
  }
  /** Engines fire at the walls; archers on the walls shoot at your camp. */
  private volley() {
    const c = getState().world.campaign; if (!c || c.target !== this.r.id || c.phase !== 'siege') return;
    const engines = this.siegeObjs.filter((o) => (o as Phaser.GameObjects.Image).getData?.('engine') && ['trebuchet', 'mangonel'].includes((o as Phaser.GameObjects.Image).getData('engine'))) as Phaser.GameObjects.Image[];
    const walls = this.wallImgs.filter((w) => w.img.visible && w.y === this.L.box.y1);
    if (c.stance === 'bombard' && engines.length && walls.length) {
      const e = pick(engines), w = pick(walls), kind = e.getData('engine'); e.setTexture(`eng_${kind}1`); this.time.delayedCall(500, () => e.setTexture(`eng_${kind}0`));
      const stone = this.add.circle(e.x, e.y - 20, 2.5, 0x7e8894).setDepth(30000), tx = w.img.x + 8, ty = w.img.y - 14, o = { t: 0 }, x0 = e.x, y0 = e.y - 20;
      this.tweens.add({ targets: o, t: 1, duration: 1100, onUpdate: () => stone.setPosition(x0 + (tx - x0) * o.t, y0 + (ty - y0) * o.t - Math.sin(o.t * Math.PI) * 90), onComplete: () => {
        stone.destroy(); const p = this.add.particles(tx, ty, 'px', { speed: { min: 15, max: 50 }, lifespan: 600, quantity: 14, scale: { start: 1.6, end: 0 }, tint: [0x9a948c, 0xc8bca8], emitting: false }).setDepth(30000); p.explode(14); this.time.delayedCall(800, () => p.destroy());
        this.cameras.main.shake(100, 0.002); if (getState().settings.sound) audio.play('catapult');
      } });
    }
    const archers = this.figs.filter((f) => f.side === 'foe' && f.y < (this.L.box.y1 + 2) * TILE), mine = this.figs.filter((f) => f.side === 'you');
    for (const a of archers.slice(0, 3)) { if (!mine.length || Math.random() < 0.4) continue; const t = pick(mine); a.img.setFrame(sFrame(a.cls, a.rank, 5));
      const ar = this.add.rectangle(a.x, a.y - 12, 5, 1, 0xe8e0c8).setDepth(30000).setRotation(Math.atan2(t.y - a.y, t.x - a.x)); this.tweens.add({ targets: ar, x: t.x, y: t.y - 8, duration: 600, onComplete: () => { ar.destroy(); a.img.setFrame(sFrame(a.cls, a.rank, 0)); } }); }
  }
  /** Separate chatter for this realm: townsfolk, your besiegers and the defenders. */
  private chat() {
    const cam = this.cameras.main; if (cam.zoom < 1 || this.chatter.count >= 2) return;
    const s = getState(), c = s.world.campaign?.target === this.r.id ? s.world.campaign : null, view = cam.worldView;
    const vis = (side: Fig['side']) => this.figs.filter((f) => f.side === side && view.contains(f.x, f.y - 8));
    const target = (f: Fig) => ({ get x() { return f.x; }, get y() { return f.y; }, h: 16, alive: () => f.img.active });
    if (c) {
      const you = vis('you'), foe = vis('foe'), soldiers = c.battalions.length ? campaignSquads(s).reduce((a, q) => a + q.count, 0) : 0, days = Math.max(1, Math.floor(c.supplies / Math.max(1, Math.ceil(soldiers / 10))));
      const yours = c.phase === 'field' ? ['Steady, lads. Here they come.', 'Look at them, shaking in their boots!', 'For our lord and the realm!', 'Hold the line until the horn!']
        : [`Day ${c.day} of this cursed siege.`, c.supplies < soldiers / 5 ? 'My belly rumbles... where is the supply train?' : 'At least the stew is warm.', c.wallHp / c.wallMax < 0.4 ? 'The wall is crumbling! Soon now!' : 'Those walls won\'t hold forever.', c.morale < 50 ? 'I miss home...' : 'Our lord studies so we may eat!', `${days} days of rations left, they say.`, 'Load the trebuchet!', 'Keep your head down, archers on the wall!'];
      const theirs = c.phase === 'field' ? ['Turn back while you can!', 'Our lord will crush you!'] : c.wallHp / c.wallMax < 0.4 ? ['Hold! Hold the breach!', 'We need more stones for the wall!', 'Is it true the bread has run out?'] : ['You\'ll never take this keep!', 'Go home, dogs!', 'Our walls have stood a hundred years!', 'Waste your stones, we have plenty!'];
      if (you.length && (Math.random() < 0.6 || !foe.length)) this.chatter.say(target(pick(you)), pick(yours), 0, VOICE.you);
      else if (foe.length) this.chatter.say(target(pick(foe)), pick(theirs), 0, VOICE.foe);
      return;
    }
    const folk = vis('folk'); if (!folk.length) return;
    const lines = this.sheltering ? ['The enemy is at the gates!', 'Will the walls hold?', 'Pray for us...', 'I left my goats outside!', 'How long can the food last?'] : [...FOLK[this.L.biome], `Long live ${this.r.ruler}!`, ...(this.r.status === 'war' ? ['They say war is coming...', 'Lock your doors tonight.'] : this.r.status === 'ally' ? ['Our allies grow strong, I hear.'] : this.r.status === 'vassal' ? ['We pay tribute now... sigh.'] : [])];
    this.chatter.say(target(pick(folk)), pick(lines), 0, VOICE.folk);
  }
  private applyNight() {
    const { n } = nightFactor(getState().settings.dayNight);
    const ch = (s: number) => Math.round(255 + ((s >> 0) - 255) * n * 0.85); void ch;
    const mix = (a: number, b: number, t: number) => { const c = (sh: number) => Math.round(((a >> sh) & 255) + (((b >> sh) & 255) - ((a >> sh) & 255)) * t); return (c(16) << 16) | (c(8) << 8) | c(0); };
    this.shade.setFillStyle(mix(0xffffff, 0x3a4a8a, n * 0.85)).setVisible(n > 0.01);
  }
  update(time: number, dt: number) {
    this.chatter.update(); this.weather?.update(this.cameras.main);
    const tick = Math.floor(time / 150);
    for (const f of this.figs) {
      let fr = 0;
      if (f.side === 'folk') {
        // townsfolk keep to streets and gates: they walk around walls, houses and water
        if ((f.wait ?? 0) > 0) f.wait! -= dt;
        else if (f.path?.length) { const dir = follow(f, dt, this.sheltering ? 34 : 14); if (dir) f.img.setFlipX(dir < 0); fr = (tick + f.ph) % 4; }
        else if (this.sheltering) {
          const b = this.L.inner ?? this.L.box, T = TILE, B = this.L.box, inside = f.x > B.x0 * T && f.x < B.x1 * T && f.y > B.y0 * T && f.y < B.y1 * T;
          if (inside && f.path) { f.path = undefined; f.wait = 6000 + Math.random() * 8000; } // safe in the bailey: wait, then shuffle about
          else f.path = this.nav.path(f, { x: (b.x0 + 2 + Math.random() * (b.x1 - b.x0 - 3)) * T, y: (b.y1 - 1 - Math.random() * 3) * T }) ?? [];
        } else if (f.path) { f.path = undefined; f.wait = 1500 + Math.random() * 4000; }
        else { const d = pick(this.doors); f.path = this.nav.path(f, { x: d.x + (Math.random() - 0.5) * 14, y: d.y + Math.random() * 6 }) ?? []; if (!f.path.length) f.wait = 2000; }
      } else if (f.triumph) { // marching into the conquered castle
        if (f.path?.length) { const dir = follow(f, dt, 24); if (dir) f.img.setFlipX(dir < 0); fr = (tick + f.ph) % 4; }
        else { f.triumph = false; this.tweens.add({ targets: f.img, alpha: 0, duration: 500, onComplete: () => f.img.destroy() }); }
      } else if (f.leave) { // deserting: off toward the edge of the map
        const dx = f.leave.x - f.x, dy = f.leave.y - f.y, d = Math.hypot(dx, dy), k = Math.min(1, ((dt / 1000) * 20) / Math.max(1, d)); f.x += dx * k; f.y += dy * k; f.img.setFlipX(dx < 0); fr = (tick + f.ph) % 4;
        if (d < 4) { f.img.destroy(); continue; }
      } else if (f.job) fr = this.doJob(f, dt, tick);
      else if (f.starving) fr = 2;
      else if ((tick + f.ph) % 30 === 0) fr = 2;
      if (f.side !== 'foe' || f.img.frame.name.endsWith('|0') || f.img.frame.name.endsWith('|2')) f.img.setFrame(sFrame(f.cls, f.rank, fr));
      f.img.setPosition(Math.round(f.x), Math.round(f.y)).setDepth(f.y);
    }
  }
}
