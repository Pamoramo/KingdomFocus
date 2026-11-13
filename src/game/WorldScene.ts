import Phaser from 'phaser';
import { getState, subscribe, maxLevel, type GameState } from '../lib/state.ts';
import { getUI, setUI, subUI } from './ui.ts';
import { worldMap, castleIcon, siegeCamp, engineArt, MAP_PW, MAP_PH } from './art/war.ts';
import { hdify } from './art/hd.ts';
import { withoutOutline, hex } from './art/px.ts';
import { bannerTex, sFrame, S } from './textures.ts';
import { ENGINE_IDS } from '../lib/war.ts';

const K = 4; // world units per map pixel
const WW = MAP_PW * K, WH = MAP_PH * K;
const HOME = { x: 0.5, y: 0.5 };

/** The realm map: your kingdom, rival castles, territories, armies on the march and siege camps. */
export class WorldScene extends Phaser.Scene {
  private sites = new Map<string, { icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Ellipse; ban: Phaser.GameObjects.Image; terr: Phaser.GameObjects.Ellipse }>();
  private units: Phaser.GameObjects.GameObject[] = [];
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  private pinch: { d: number; z: number } | null = null;
  private sig = ''; private unsub: (() => void)[] = []; private frame = 0;
  constructor() { super('world'); }

  create() {
    const s = getState(), w = s.world, T = this.textures;
    const key = `worldmap_${w.seed}`;
    if (!T.exists(key)) T.addCanvas(key, hdify(worldMap(w.seed, [HOME, ...w.rivals.map((r) => ({ x: r.x, y: r.y }))]), { rim: false, outline: false, grain: 3 }));
    this.add.image(0, 0, key).setOrigin(0).setScale(K / 2);
    if (!T.exists('camp_icon')) T.addCanvas('camp_icon', hdify(withoutOutline(() => siegeCamp())));
    for (const e of ENGINE_IDS) if (!T.exists(`eng_${e}`)) T.addCanvas(`eng_${e}`, hdify(withoutOutline(() => engineArt(e))));
    // drifting clouds
    for (let i = 0; i < 7; i++) { const cl = this.add.ellipse(Math.random() * WW, Math.random() * WH, 160 + Math.random() * 120, 50 + Math.random() * 30, 0xffffff, 0.16).setDepth(5000); this.tweens.add({ targets: cl, x: cl.x + 400, duration: 60000 + Math.random() * 40000, repeat: -1, yoyo: true }); }
    const cam = this.cameras.main; cam.setBounds(-200, -200, WW + 400, WH + 400).setBackgroundColor('#1f4a7a').setZoom(Math.max(this.scale.width / WW, this.scale.height / WH) * 1.05); cam.centerOn(WW / 2, WH / 2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown); if (ps.length === 2) { this.pinch = { d: Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y), z: cam.zoom }; this.drag = null; return; } this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pinch) { const a = this.input.pointer1, b = this.input.pointer2; if (a.isDown && b.isDown) cam.setZoom(Phaser.Math.Clamp(this.pinch.z * Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / this.pinch.d, 0.3, 4)); return; }
      if (!this.drag || !p.isDown) return; if (Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 6) this.drag.moved = true;
      if (this.drag.moved) cam.setScroll(this.drag.sx - (p.x - this.drag.x) / cam.zoom, this.drag.sy - (p.y - this.drag.y) / cam.zoom);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => { if (this.pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null; return; } const d = this.drag; this.drag = null; if (d && !d.moved) this.tap(p); });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), 0.3, 4)));
    this.unsub.push(subscribe(() => this.sync()), subUI(() => this.highlight()));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
    this.time.addEvent({ delay: 400, loop: true, callback: () => { this.frame++; for (const [id, v] of this.sites) { const r = getState().world.rivals.find((x) => x.id === id); v.ban.setTexture(bannerTex(this, r ? r.color : 0xb3242a, r ? r.emblem : 'lion', this.frame % 2)); } } });
    this.sync();
  }
  private tap(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    for (const [id, v] of this.sites) if (Math.hypot(wp.x - v.icon.x, wp.y - (v.icon.y - 20)) < 40) { setUI({ selRival: id === 'home' ? null : id, panel: 'world' }); return; }
  }
  private place(id: string, x: number, y: number, level: number, color: number, emblem: string, name: string) {
    let v = this.sites.get(id);
    const key = `castle_${level}_${color}`; if (!this.textures.exists(key)) this.textures.addCanvas(key, hdify(withoutOutline(() => castleIcon(level, hex(color)))));
    if (!v) {
      const terr = this.add.ellipse(x, y - 10, 150, 100, color, 0.16).setStrokeStyle(2, color, 0.35);
      const icon = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(1.2);
      const ban = this.add.image(x + 24, y - 6, bannerTex(this, color, emblem, 0)).setOrigin(0.2, 1).setScale(S * 1.4);
      const label = this.add.text(x, y + 4, name, { fontFamily: 'monospace', fontSize: '28px', color: '#fff4d6', stroke: '#1d1716', strokeThickness: 6 }).setOrigin(0.5, 0).setScale(0.5).setDepth(6000);
      const ring = this.add.ellipse(x, y - 4, 70, 26).setStrokeStyle(3, 0xffe27a).setVisible(false);
      v = { icon, label, ring, ban, terr }; this.sites.set(id, v);
    }
    v.icon.setTexture(key); v.label.setText(name); v.terr.setFillStyle(color, 0.16);
  }
  private sync() {
    const s = getState(), w = s.world;
    const kl = Math.max(1, maxLevel(s, 'keep'));
    this.place('home', HOME.x * WW, HOME.y * WH, kl, 0xb3242a, s.battalions[0]?.emblem ?? 'lion', 'Your Kingdom');
    for (const r of w.rivals) {
      const tag = r.status === 'vassal' ? ' (vassal)' : r.status === 'ally' ? ' (ally)' : r.status === 'war' ? ' (war)' : '';
      this.place(r.id, r.x * WW, r.y * WH, r.bandits ? 1 : r.level, r.status === 'vassal' ? 0xb3242a : r.color, r.emblem, r.name + tag);
      this.sites.get(r.id)!.label.setColor(r.status === 'war' ? '#ff9a8a' : r.status === 'ally' ? '#a8f0a0' : r.status === 'vassal' ? '#ffe27a' : '#fff4d6');
    }
    const sig = JSON.stringify([w.campaign?.target, w.campaign?.phase, w.campaign?.engines, w.threat?.rival, w.loans.map((l) => l.rival)]);
    if (sig !== this.sig) { this.sig = sig; this.armies(s); }
    this.highlight();
  }
  private soldiers(x: number, y: number, cls: string, n: number, flip = false, tint?: number) {
    for (let i = 0; i < n; i++) { const im = this.add.image(x + (i % 4) * 11 - 16, y + Math.floor(i / 4) * 9, 'soldiers', sFrame(cls, 1, 0)).setOrigin(0.5, 1).setScale(S).setFlipX(flip).setDepth(y + i); if (tint) im.setTint(tint); this.units.push(im);
      this.tweens.add({ targets: im, y: im.y - 1, duration: 300 + i * 20, yoyo: true, repeat: -1 }); }
  }
  /** Draws campaigns, enemy hosts at your gates and loaned troops. */
  private armies(s: GameState) {
    this.units.forEach((u) => u.destroy()); this.units = [];
    const w = s.world, home = { x: HOME.x * WW, y: HOME.y * WH };
    if (w.campaign) {
      const r = w.rivals.find((x) => x.id === w.campaign!.target)!, tx = r.x * WW, ty = r.y * WH, dx = tx > home.x ? -70 : 70;
      const cx = tx + dx, cy = ty + 30;
      if (w.campaign.phase === 'siege') { this.units.push(this.add.image(cx, cy + 10, 'camp_icon').setScale(0.6).setDepth(cy)); ENGINE_IDS.filter((e) => w.campaign!.engines[e] > 0).forEach((e, i) => this.units.push(this.add.image(cx - 30 + i * 22, cy + 34, `eng_${e}`).setScale(0.5).setDepth(cy + 40))); }
      const g = this.add.container(home.x, home.y + 20); this.units.push(g);
      this.soldiers(cx, cy - 20, 'swordsman', 8, dx > 0);
      const path = this.add.graphics().setDepth(50); path.lineStyle(3, 0xffe27a, 0.8); path.beginPath(); path.moveTo(home.x, home.y + 10); path.lineTo(cx, cy); path.strokePath(); this.units.push(path);
    }
    if (w.threat) { const r = w.rivals.find((x) => x.id === w.threat!.rival)!; this.soldiers(home.x + 60, home.y + 10, 'spearman', 12, true, 0xffb0a0); const b = this.add.image(home.x + 80, home.y - 20, bannerTex(this, r.color, r.emblem, 0)).setScale(S * 1.4); this.units.push(b); }
    for (const l of w.loans) { const r = w.rivals.find((x) => x.id === l.rival); if (r) this.soldiers(r.x * WW - 40, r.y * WH + 26, 'spearman', 4); }
  }
  private highlight() { const sel = getUI().selRival; for (const [id, v] of this.sites) v.ring.setVisible(id === sel); }
  focusHome() { this.cameras.main.pan(HOME.x * WW, HOME.y * WH, 500); }
}
