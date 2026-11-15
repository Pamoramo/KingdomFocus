import Phaser from 'phaser';
import { getState, subscribe, maxLevel, type GameState } from '../lib/state.ts';
import { getUI, setUI, subUI, camBus } from './ui.ts';
import { worldMap, castleIcon, siegeCamp, engineArt, roadNet, roadRoute, MAP_PW, MAP_PH } from './art/war.ts';
import { wagon } from './art/biome.ts';
import { isKnown, reachOf, WORLD_SCALE, type Journey } from '../lib/war.ts';
import { hdify } from './art/hd.ts';
import { withoutOutline, hex } from './art/px.ts';
import { bannerTex, sFrame, bTex, S } from './textures.ts';
import { sitesFor, SETTLE, type SettleKind } from '../lib/expansion.ts';
import type { BKind } from '../lib/economy.ts';
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
  private camps = new Map<string, Phaser.GameObjects.GameObject[]>();
  private lands = new Map<string, { sig: string; parts: Phaser.GameObjects.GameObject[] }>();
  private travellers = new Map<string, { parts: Phaser.GameObjects.Image[]; label: Phaser.GameObjects.Text; j: Journey; route: { x: number; y: number }[]; len: number; gap: number }>();
  /** Soldiers in these battalions (for sizing a marching column). */
  private men(bats?: string[]) { const s = getState(); return s.squads.filter((q) => bats?.includes(q.bat)).reduce((a, q) => a + q.count, 0); }
  /** Figures in a marching column: grows with the host, but never floods the map. */
  private columnSize(men: number) { return Math.max(3, Math.min(16, Math.round(2 + Math.sqrt(men) * 0.9))); }
  /** The way along the roads from your castle to a realm, or to a point off the roads (via the nearest realm), in world units. */
  private route(j: Journey) {
    const w = getState().world, sites = [HOME, ...w.rivals.map((r) => ({ x: r.x, y: r.y }))], net = roadNet(sites);
    let pts: { x: number; y: number }[];
    if (j.to) { const near = sites.map((p, i) => ({ i, d: Math.hypot(p.x - j.to!.x, p.y - j.to!.y) })).sort((a, b) => a.d - b.d)[0]; pts = [...roadRoute(sites, net, near.d < Math.hypot(HOME.x - j.to.x, HOME.y - j.to.y) ? near.i : 0), j.to]; }
    else { const i = w.rivals.findIndex((r) => r.id === j.rival) + 1; pts = i > 0 ? roadRoute(sites, net, i) : [HOME]; }
    pts = pts.map((p) => ({ x: p.x * WW, y: p.y * WH }));
    if (j.home) pts.reverse();
    return pts;
  }
  constructor() { super('world'); }

  create() {
    const s = getState(), w = s.world, T = this.textures;
    const key = `worldmap2_${w.seed}`; // v2: the wide world
    if (!T.exists(key)) T.addCanvas(key, hdify(worldMap(w.seed, [HOME, ...w.rivals.map((r) => ({ x: r.x, y: r.y }))]), { rim: false, outline: false, grain: 3 }));
    this.add.image(0, 0, key).setOrigin(0).setScale(K / 2);
    for (const f of [0, 1]) if (!T.exists(`wagon${f}`)) T.addCanvas(`wagon${f}`, hdify(withoutOutline(() => wagon(f))));
    if (!T.exists('camp_icon')) T.addCanvas('camp_icon', hdify(withoutOutline(() => siegeCamp())));
    for (const e of ENGINE_IDS) if (!T.exists(`eng_${e}`)) T.addCanvas(`eng_${e}`, hdify(withoutOutline(() => engineArt(e))));
    // drifting clouds
    for (let i = 0; i < 24; i++) { const cl = this.add.ellipse(Math.random() * WW, Math.random() * WH, 160 + Math.random() * 120, 50 + Math.random() * 30, 0xffffff, 0.16).setDepth(5000); this.tweens.add({ targets: cl, x: cl.x + 400, duration: 60000 + Math.random() * 40000, repeat: -1, yoyo: true }); }
    const cam = this.cameras.main; cam.setBounds(-200, -200, WW + 400, WH + 400).setBackgroundColor('#1f4a7a').setZoom(this.homeZoom()); cam.centerOn(WW / 2, WH / 2); // open on your region; zoom out to see the whole world
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown); if (ps.length === 2) { this.pinch = { d: Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y), z: cam.zoom }; this.drag = null; return; } this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.pinch) { const a = this.input.pointer1, b = this.input.pointer2; if (a.isDown && b.isDown) cam.setZoom(Phaser.Math.Clamp(this.pinch.z * Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / this.pinch.d, this.minZoom(), 4)); return; }
      if (!this.drag || !p.isDown) return; if (Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 6) this.drag.moved = true;
      if (this.drag.moved) cam.setScroll(this.drag.sx - (p.x - this.drag.x) / cam.zoom, this.drag.sy - (p.y - this.drag.y) / cam.zoom);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => { if (this.pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null; return; } const d = this.drag; this.drag = null; if (d && !d.moved) this.tap(p); });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.88 : 1.14), this.minZoom(), 4)));
    const zoomWorld = () => this.toggleWorld(); camBus.addEventListener('world-zoom', zoomWorld);
    this.unsub.push(subscribe(() => this.sync()), subUI(() => this.highlight()), () => camBus.removeEventListener('world-zoom', zoomWorld));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
    this.time.addEvent({ delay: 400, loop: true, callback: () => { this.frame++; for (const [id, v] of this.sites) { const r = getState().world.rivals.find((x) => x.id === id); v.ban.setTexture(bannerTex(this, r ? r.color : 0xb3242a, r ? r.emblem : 'lion', this.frame % 2)); } } });
    this.sync();
  }
  /** Zoomed out just far enough to see the whole world. */
  minZoom() { return Math.max(this.scale.width / (WW + 400), this.scale.height / (WH + 400)); }
  /** The home view: your castle and its neighbours (about a league either way). */
  homeZoom() { return Math.max(this.minZoom(), Math.min(this.scale.width / (WW * 0.46), this.scale.height / (WH * 0.46))); }
  /** Zoom out to the whole world, or back in to your realm. */
  toggleWorld() { const cam = this.cameras.main, out = cam.zoom > this.minZoom() * 1.3; cam.zoomTo(out ? this.minZoom() : this.homeZoom(), 600); cam.pan(WW / 2, WH / 2, 600); }
  /** Uncharted lands lie under fog; it lifts within your reach and around every realm you know. */
  private fogSig = ''; private fog?: Phaser.GameObjects.RenderTexture; private brush?: Phaser.GameObjects.Image;
  private drawFog(s: GameState) {
    const known = s.world.rivals.filter(isKnown), reach = reachOf(s.stage, (s.world.settlements ?? []).length), sig = `${known.map((r) => r.id).join()}|${reach}`;
    if (sig === this.fogSig) return; this.fogSig = sig;
    const F = 8, T = this.textures;
    if (!T.exists('fogbrush')) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.6, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); T.addCanvas('fogbrush', c); }
    this.fog ??= this.add.renderTexture(-200, -200, (WW + 400) / F, (WH + 400) / F).setOrigin(0).setScale(F).setDepth(5500);
    this.brush ??= this.make.image({ key: 'fogbrush', add: false });
    this.fog.clear().fill(0x1a1612, 0.82);
    // an ellipse in map units is a circle in leagues
    const clear = (x: number, y: number, lg: number) => { this.brush!.setScale((lg / WORLD_SCALE) * WW * 2.3 / 64 / F, (lg / WORLD_SCALE) * WH * 2.3 / 64 / F); this.fog!.erase(this.brush!, (x * WW + 200) / F, (y * WH + 200) / F); };
    clear(HOME.x, HOME.y, reach);
    for (const r of known) clear(r.x, r.y, r.bandits ? 0.2 : 0.3);
  }
  private tap(p: Phaser.Input.Pointer) {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    for (const st of sitesFor(getState().world.seed)) if (Math.hypot(wp.x - st.x * WW, wp.y - (st.y * WH - 10)) < 26) { setUI({ selRival: st.id, panel: 'realm' }); return; }
    for (const o of getState().world.outposts ?? []) if (Math.hypot(wp.x - o.x * WW, wp.y - (o.y * WH - 12)) < 30) { setUI({ selRival: o.id, panel: 'world' }); return; }
    for (const [id, v] of this.sites) if (Math.hypot(wp.x - v.icon.x, wp.y - (v.icon.y - 20)) < 40) { if (id === 'home') setUI({ view: 'kingdom' }); else setUI({ selRival: id, panel: 'world' }); return; }
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
    this.drawFog(s);
    for (const r of w.rivals) {
      if (!isKnown(r)) continue; // beyond your maps
      const tag = r.status === 'vassal' ? ' (vassal)' : r.status === 'ally' ? ' (ally)' : r.status === 'war' ? ' (war)' : '';
      this.place(r.id, r.x * WW, r.y * WH, r.bandits ? 1 : r.level, r.status === 'vassal' ? 0xb3242a : r.color, r.emblem, r.name + tag);
      this.sites.get(r.id)!.label.setColor(r.status === 'war' ? '#ff9a8a' : r.status === 'ally' ? '#a8f0a0' : r.status === 'vassal' ? '#ffe27a' : '#fff4d6');
    }
    this.outposts(s); this.settlements(s);
    const sig = JSON.stringify([w.campaign?.target, w.campaign?.phase, w.campaign?.engines, w.threat?.rival, w.loans.map((l) => l.rival)]);
    if (sig !== this.sig) { this.sig = sig; this.armies(s); }
    this.highlight(); this.syncJourneys();
  }
  /** Your lands: a signpost on each unclaimed site, and houses that grow with each settlement's level. */
  private settlements(s: GameState) {
    const held = s.world.settlements ?? [], KIND: Record<SettleKind, BKind> = { village: 'house', lumber: 'hut', mine: 'storehouse', market: 'market', abbey: 'greathall' };
    for (const site of sitesFor(s.world.seed)) {
      const st = held.find((x) => x.site === site.id), sig = st ? `L${st.level}` : 'free', cur = this.lands.get(site.id);
      if (cur?.sig === sig) continue;
      cur?.parts.forEach((p) => p.destroy());
      const x = site.x * WW, y = site.y * WH, parts: Phaser.GameObjects.GameObject[] = [];
      if (!st) {
        parts.push(this.add.ellipse(x, y - 6, 54, 22).setStrokeStyle(2, 0xfff4d6, 0.55).setDepth(y - 20));
        parts.push(this.add.rectangle(x, y - 6, 2, 14, 0x5a3a1e).setOrigin(0.5, 1).setDepth(y), this.add.rectangle(x, y - 18, 14, 7, 0xb08a52).setStrokeStyle(1, 0x3a2410).setDepth(y + 1));
        parts.push(this.add.text(x, y + 2, `${site.name} (unclaimed)`, { fontFamily: 'monospace', fontSize: '18px', color: '#e8dcc0', stroke: '#1d1716', strokeThickness: 4 }).setOrigin(0.5, 0).setScale(0.5).setAlpha(0.85).setDepth(6000));
      } else {
        const tex = bTex(this, KIND[site.kind], Math.min(st.level, 2), 0).key, n = st.level + 1;
        for (let i = 0; i < n; i++) parts.push(this.add.image(x - (n - 1) * 9 + i * 18, y + (i % 2) * 6, i === 0 ? tex : bTex(this, 'house', 1, 0).key).setOrigin(0.5, 1).setScale(0.5).setDepth(y + i));
        parts.push(this.add.image(x + n * 9 + 6, y - 4, bannerTex(this, 0xb3242a, s.battalions[0]?.emblem ?? 'lion', 0)).setOrigin(0.2, 1).setScale(S).setDepth(y + 5));
        parts.push(this.add.text(x, y + 8, `${site.name} · ${SETTLE[site.kind].levels[st.level - 1]}`, { fontFamily: 'monospace', fontSize: '20px', color: '#ffe27a', stroke: '#1d1716', strokeThickness: 5 }).setOrigin(0.5, 0).setScale(0.5).setDepth(6000));
      }
      this.lands.set(site.id, { sig, parts });
    }
  }
  /** Bandit camps: a couple of ragged tents, a campfire and a black flag. */
  private outposts(s: GameState) {
    const list = s.world.outposts ?? [], ids = new Set(list.map((o) => o.id));
    for (const [id, parts] of this.camps) if (!ids.has(id)) { parts.forEach((p) => p.destroy()); this.camps.delete(id); }
    for (const o of list) if (!this.camps.has(o.id)) {
      const x = o.x * WW, y = o.y * WH, parts: Phaser.GameObjects.GameObject[] = [];
      parts.push(this.add.image(x, y, 'camp_icon').setOrigin(0.5, 1).setScale(0.32).setTint(0x9a8a7a).setDepth(y));
      const fire = this.add.image(x + 10, y - 2, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(0.12).setTint(0xffa040).setDepth(y + 1); parts.push(fire);
      this.tweens.add({ targets: fire, alpha: 0.5, duration: 200, yoyo: true, repeat: -1 });
      parts.push(this.add.image(x - 14, y - 6, bannerTex(this, 0x2a2622, 'sword', 0)).setOrigin(0.2, 1).setScale(S * 1.1).setDepth(y + 2));
      for (let i = 0; i < 2; i++) parts.push(this.add.image(x - 4 + i * 12, y + 6, 'soldiers', sFrame(i ? 'archer' : 'militia', 0, 0)).setOrigin(0.5, 1).setScale(S * 1.1).setTint(0xb8a898).setFlipX(i === 1).setDepth(y + 6));
      parts.push(this.add.text(x, y + 8, o.name, { fontFamily: 'monospace', fontSize: '20px', color: '#e8c8a8', stroke: '#1d1716', strokeThickness: 5 }).setOrigin(0.5, 0).setScale(0.5).setDepth(6000));
      this.camps.set(o.id, parts);
    }
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
      if (w.campaign.phase === 'march') return;
      if (w.campaign.phase === 'siege') { this.units.push(this.add.image(cx, cy + 10, 'camp_icon').setScale(0.6).setDepth(cy)); ENGINE_IDS.filter((e) => w.campaign!.engines[e] > 0).forEach((e, i) => this.units.push(this.add.image(cx - 30 + i * 22, cy + 34, `eng_${e}`).setScale(0.5).setDepth(cy + 40))); }
      const g = this.add.container(home.x, home.y + 20); this.units.push(g);
      this.soldiers(cx, cy - 20, 'swordsman', Math.min(20, this.columnSize(this.men(w.campaign.battalions)) + 2), dx > 0); // the camp holds as many as you sent
      const path = this.add.graphics().setDepth(50); path.lineStyle(3, 0xffe27a, 0.8); path.beginPath(); path.moveTo(home.x, home.y + 10); path.lineTo(cx, cy); path.strokePath(); this.units.push(path);
    }
    if (w.threat) { const r = w.rivals.find((x) => x.id === w.threat!.rival)!; this.soldiers(home.x + 60, home.y + 10, 'spearman', 12, true, 0xffb0a0); const b = this.add.image(home.x + 80, home.y - 20, bannerTex(this, r.color, r.emblem, 0)).setScale(S * 1.4); this.units.push(b); }
    for (const l of w.loans) { const r = w.rivals.find((x) => x.id === l.rival); if (r) this.soldiers(r.x * WW - 40, r.y * WH + 26, 'spearman', 4); }
  }
  /** Travellers on the roads: riders, wagons and marching columns, positioned by elapsed time. */
  private syncJourneys() {
    const w0 = getState().world, c = w0.campaign, march: Journey[] = c && c.phase === 'march' ? [{ id: 'campaign-march', kind: 'army', rival: c.target, depart: c.started, arrive: c.arrive ?? c.started, label: 'Your host on the march' }] : [];
    const js = [...(w0.journeys ?? []), ...march], ids = new Set(js.map((j) => j.id));
    for (const [id, v] of this.travellers) if (!ids.has(id)) { v.parts.forEach((p) => p.destroy()); v.label.destroy(); this.travellers.delete(id); }
    for (const j of js) if (!this.travellers.has(j.id)) {
      const parts: Phaser.GameObjects.Image[] = [];
      if (j.kind === 'caravan' || j.kind === 'gift' || (j.kind === 'return' && !j.bats)) { parts.push(this.add.image(0, 0, 'wagon0').setOrigin(0.5, 1).setScale(0.9)); parts.push(this.add.image(0, 0, 'soldiers', sFrame('worker', 0, 0)).setOrigin(0.5, 1).setScale(S * 1.6)); }
      else if (j.kind === 'envoy') parts.push(this.add.image(0, 0, 'soldiers', sFrame('lightcav', 2, 0)).setOrigin(0.5, 1).setScale(S * 1.8));
      else { // a marching column sized to the host: a banner bearer, the commander, then the ranks
        const n = j.kind === 'explore' ? 3 : this.columnSize(j.id === 'campaign-march' ? this.men(getState().world.campaign?.battalions) : this.men(j.bats)), b = getState().battalions.find((x) => j.bats?.includes(x.id) || getState().world.campaign?.battalions.includes(x.id));
        for (let i = 0; i < n; i++) parts.push(this.add.image(0, 0, 'soldiers', sFrame(j.kind === 'explore' ? 'villager' : i === 0 ? 'knight' : i % 4 === 3 ? 'archer' : 'spearman', 1, 0)).setOrigin(0.5, 1).setScale(S * 1.5));
        if (b && j.kind !== 'explore') parts.push(this.add.image(0, 0, bannerTex(this, b.color, b.emblem, 0)).setOrigin(0.2, 1).setScale(S * 1.1).setData('banner', true));
      }
      const label = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '22px', color: '#fff4d6', stroke: '#1d1716', strokeThickness: 5 }).setOrigin(0.5, 1).setScale(0.5).setDepth(7000);
      const route = this.route(j), len = route.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - route[i].x, p.y - route[i].y), 0);
      this.travellers.set(j.id, { parts, label, j, route, len, gap: j.kind === 'caravan' || j.kind === 'gift' || (j.kind === 'return' && !j.bats) ? 22 : 9 });
    }
  }
  update(time: number) {
    const now = Date.now(), w = getState().world, home = { x: HOME.x * WW, y: HOME.y * WH };
    let k = 0;
    for (const { parts, label, j, route, len, gap } of this.travellers.values()) {
      const lift = (k++ % 3) * 13;
      if (!route.length) continue;
      // where along the road someone d world units from the start stands, and which way the road runs there
      const at = (d: number) => { d = Math.max(0, Math.min(len, d)); for (let i = 1; i < route.length; i++) { const a = route[i - 1], b = route[i], seg = Math.hypot(b.x - a.x, b.y - a.y); if (d <= seg || i === route.length - 1) { const u = seg ? Math.min(1, d / seg) : 0; return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, dx: b.x - a.x }; } d -= seg; } return { ...route[0], dx: 1 }; };
      const t = Math.min(1, Math.max(0, (now - j.depart) / Math.max(1, j.arrive - j.depart))), head = t * len, f = Math.floor(time / 160) % 4, lead = at(head);
      parts.forEach((p, i) => {
        if (p.getData('banner')) { const q = at(head - gap); p.setPosition(q.x + 4, q.y - 14).setDepth(q.y + 11); return; } // the colours ride near the front
        const row = Math.floor(i / 2), q = at(head - row * gap), side = parts.length > 3 && i > 0 ? (i % 2 ? -4 : 4) : 0; // two abreast
        p.setPosition(q.x + side * 0.4, q.y + side).setFlipX(q.dx < 0).setDepth(q.y + 10);
        if (p.texture.key === 'soldiers') { const cls = (p.frame.name as string).split('|')[0], rk = +(p.frame.name as string).split('|')[1]; p.setFrame(sFrame(cls, rk, (f + i) % 4)); } else p.setTexture(`wagon${f % 2}`);
      });
      const left = Math.max(0, j.arrive - now);
      label.setText(`${j.label} · ${left > 60000 ? Math.ceil(left / 60000) + 'm' : Math.ceil(left / 1000) + 's'}`).setPosition(lead.x, lead.y - 46 - lift);
    }
  }
  private highlight() { const sel = getUI().selRival; for (const [id, v] of this.sites) v.ring.setVisible(id === sel); }
  focusHome() { this.cameras.main.pan(HOME.x * WW, HOME.y * WH, 500); }
}
