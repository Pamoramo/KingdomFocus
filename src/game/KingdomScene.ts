import Phaser from 'phaser';
import * as A from './art.ts';
import { getState, subscribe, fxBus, type Fx, type GameState, type Battalion, MAP_W, MAP_H, TILE, canPlace, build, marchTo, move as moveBuilding, keepLevel } from '../lib/state.ts';
import { BUILDINGS, TCLASSES, SQUAD_SIZE, SQUADS_PER_COMPANY, type BKind } from '../lib/economy.ts';
import { getUI, setUI, subUI } from './ui.ts';

const WW = MAP_W * TILE, WH = MAP_H * TILE;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const MAX_BOBS = 4000;

interface BatView { blit: Phaser.GameObjects.Blitter; bobs: { b: Phaser.GameObjects.Bob; ox: number; oy: number; row: number; ph: number }[]; banner: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; x: number; y: number; sig: string; ring: Phaser.GameObjects.Ellipse }

export class KingdomScene extends Phaser.Scene {
  private terrain!: Phaser.GameObjects.RenderTexture;
  private terrainSig = '';
  private bImgs = new Map<string, { img: Phaser.GameObjects.Image; key: string }>();
  private bats = new Map<string, BatView>();
  private ghost!: Phaser.GameObjects.Rectangle;
  private selRect!: Phaser.GameObjects.Rectangle;
  private frame = 0;
  private unsub: (() => void)[] = [];
  private pinch: { d: number; z: number } | null = null;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean; paint: boolean } | null = null;
  private lastPaint = '';

  constructor() { super('kingdom'); }

  create() {
    this.makeTextures();
    this.terrain = this.add.renderTexture(0, 0, WW, WH).setOrigin(0).setDepth(-10);
    this.ghost = this.add.rectangle(0, 0, 16, 16, 0x44ff66, 0.3).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.9).setDepth(9000).setVisible(false);
    this.selRect = this.add.rectangle(0, 0, 16, 16).setOrigin(0).setStrokeStyle(1, 0xffe27a, 1).setDepth(9001).setVisible(false);
    const cam = this.cameras.main;
    cam.setBounds(-WW * 0.25, -WH * 0.25, WW * 1.5, WH * 1.5).setRoundPixels(true).setBackgroundColor('#2b2118');
    const k = getState().buildings.find((b) => b.kind === 'keep');
    cam.setZoom(Math.max(this.minZoom(), Math.min(3, this.scale.width / 360)));
    cam.centerOn(((k?.x ?? 30) + 2.5) * TILE, ((k?.y ?? 21) + 4) * TILE);

    this.input.addPointer(1);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => this.zoomAt(cam.zoom * (dy > 0 ? 0.88 : 1.14), p.x, p.y));
    this.scale.on('resize', () => cam.setZoom(Math.max(cam.zoom, this.minZoom())));

    this.unsub.push(subscribe(() => this.sync()), subUI(() => this.syncUI()));
    const onFx = (e: Event) => this.fx((e as CustomEvent<Fx>).detail);
    fxBus.addEventListener('fx', onFx); this.unsub.push(() => fxBus.removeEventListener('fx', onFx));
    this.events.once('shutdown', () => this.unsub.forEach((u) => u()));
    this.time.addEvent({ delay: 380, loop: true, callback: () => { this.frame ^= 1; this.animateBuildings(); } });
    this.time.addEvent({ delay: 900, loop: true, callback: () => this.smoke() });
    this.sync();
  }

  private minZoom() { return Math.max(this.scale.width / (WW * 1.5), this.scale.height / (WH * 1.5), 0.5); }
  zoomAt(z: number, sx: number, sy: number) {
    const cam = this.cameras.main, before = cam.getWorldPoint(sx, sy);
    cam.setZoom(Phaser.Math.Clamp(z, this.minZoom(), 8));
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y;
  }

  // ---------- textures ----------
  private makeTextures() {
    const T = this.textures;
    const add = (k: string, c: HTMLCanvasElement) => { if (!T.exists(k)) T.addCanvas(k, c); };
    for (let i = 0; i < 4; i++) for (const t of ['dirt', 'mix', 'grass'] as const) add(`t_${t}${i}`, A.terrainTile(t, i * 3 + t.length));
    for (const d of ['rock', 'deadbush', 'tree', 'flowers', 'deadtree', 'pine'] as const) for (let i = 0; i < 2; i++) add(`d_${d}${i}`, A.decoration(d, i));
    if (!T.exists('soldiers')) {
      const tex = T.addCanvas('soldiers', A.soldierSheet())!;
      for (let row = 0; row < TCLASSES.length * 4; row++) for (let f = 0; f < A.FRAMES; f++) tex.add(`${row}_${f}`, 0, f * 16, row * 16, 16, 16);
    }
    const [pc, px] = A.canvas(2, 2); A.r(px, 0, 0, 2, 2, '#ffffff'); add('px', pc);
  }
  private bTex(kind: BKind, lvl: number, f: number, mask = 0) {
    const k = `b_${kind}${lvl}_${f}_${mask}`;
    if (!this.textures.exists(k)) this.textures.addCanvas(k, kind === 'wall' || kind === 'road' ? A.drawTile(kind, lvl, mask) : A.drawBuilding(kind, lvl, BUILDINGS[kind].size, f));
    return k;
  }
  private bannerTex(color: number, emblem: string, f: number) {
    const k = `ban_${color}_${emblem}_${f}`;
    if (!this.textures.exists(k)) this.textures.addCanvas(k, A.banner(hex(color), emblem, f));
    return k;
  }

  // ---------- state sync ----------
  private sync() {
    const s = getState();
    this.drawTerrain(s); this.syncBuildings(s); this.syncArmy(s); this.syncUI();
  }

  private greenAt(s: GameState) {
    const src: [number, number, number][] = [];
    for (const b of s.buildings) {
      const n = BUILDINGS[b.kind].size, cx = b.x + n / 2, cy = b.y + n / 2;
      if (b.kind === 'farm') src.push([cx, cy, 4 + b.level * 2.5]);
      if (b.kind === 'keep') src.push([cx, cy, b.level * 3]);
      if (b.kind === 'house') src.push([cx, cy, 2 + b.level * 1.5]);
    }
    return (x: number, y: number) => src.reduce((g, [cx, cy, rad]) => Math.max(g, 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad), 0);
  }

  private drawTerrain(s: GameState) {
    const occ = new Set<string>();
    for (const b of s.buildings) { const n = BUILDINGS[b.kind].size; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) occ.add(`${b.x + i},${b.y + j}`); }
    const sig = s.buildings.filter((b) => b.kind !== 'wall' && b.kind !== 'road').map((b) => `${b.kind}${b.x},${b.y},${b.level}`).join('|') + s.buildings.length;
    if (sig === this.terrainSig) return; this.terrainSig = sig;
    const g = this.greenAt(s), rt = this.terrain, H = (x: number, y: number) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
    rt.clear(); rt.beginDraw();
    const deco: [string, number, number][] = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const v = g(x, y) + ((H(x, y) % 100) / 100 - 0.5) * 0.12, h = H(x, y);
      const kind = v > 0.32 ? 'grass' : v > 0.12 ? 'mix' : 'dirt';
      rt.batchDraw(`t_${kind}${h % 4}`, x * TILE, y * TILE);
      if (occ.has(`${x},${y}`)) continue;
      const p = (h >>> 8) % 1000, edge = x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2;
      if (edge && p < 600) deco.push([kind === 'dirt' ? `d_deadtree${h % 2}` : `d_pine${h % 2}`, x, y]);
      else if (kind === 'grass') { if (p < 35) deco.push([`d_tree${h % 2}`, x, y]); else if (p < 110) deco.push([`d_flowers${h % 2}`, x, y]); }
      else if (kind === 'dirt') { if (p < 30) deco.push([`d_rock${h % 2}`, x, y]); else if (p < 60) deco.push([`d_deadbush${h % 2}`, x, y]); else if (p < 68) deco.push([`d_deadtree${h % 2}`, x, y]); }
    }
    for (const [k, x, y] of deco) rt.batchDraw(k, x * TILE, y * TILE - 8);
    rt.endDraw();
  }

  private syncBuildings(s: GameState) {
    const seen = new Set<string>();
    const at = new Map<string, { kind: BKind; level: number }>();
    for (const b of s.buildings) if (b.kind === 'wall' || b.kind === 'road') at.set(`${b.x},${b.y}`, b);
    for (const b of s.buildings) {
      seen.add(b.id);
      let mask = 0;
      if (b.kind === 'wall' || b.kind === 'road') [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].forEach(([dx, dy, bit]) => { if (at.get(`${b.x + dx},${b.y + dy}`)?.kind === b.kind) mask |= bit; });
      const key = `${b.kind}|${b.level}|${mask}`;
      let v = this.bImgs.get(b.id);
      const n = BUILDINGS[b.kind].size;
      if (!v) { v = { img: this.add.image(0, 0, this.bTex(b.kind, b.level, 0, mask)).setOrigin(0, 1), key: '' }; this.bImgs.set(b.id, v); }
      if (v.key !== key) {
        if (v.key) this.tweens.add({ targets: v.img, scaleY: { from: 0.6, to: 1 }, duration: 380, ease: 'Back.Out' });
        v.key = key; v.img.setTexture(this.bTex(b.kind, b.level, this.frame, mask));
      }
      v.img.setPosition(b.x * TILE, (b.y + n) * TILE).setDepth(b.kind === 'road' ? -5 : (b.y + n) * TILE);
      v.img.setData('b', b);
    }
    for (const [id, v] of this.bImgs) if (!seen.has(id)) { v.img.destroy(); this.bImgs.delete(id); }
  }
  private animateBuildings() {
    for (const v of this.bImgs.values()) {
      const b = v.img.getData('b'); if (!b || b.kind === 'wall' || b.kind === 'road') continue;
      v.img.setTexture(this.bTex(b.kind, b.level, this.frame));
    }
    for (const [id, bv] of this.bats) { const b = getState().battalions.find((q) => q.id === id); if (b) bv.banner.setTexture(this.bannerTex(b.color, b.emblem, this.frame)); }
  }

  // ---------- army ----------
  private layout(s: GameState, bat: Battalion, scale: number) {
    const squads = s.squads.filter((q) => q.bat === bat.id && q.count > 0).sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls));
    const out: { ox: number; oy: number; row: number }[] = [];
    const cols = 4, sx = 9, sy = 8, sqW = cols * sx + 6, sqH = 3 * sy + 6, compCols = 2;
    squads.forEach((q, i) => {
      const comp = Math.floor(i / SQUADS_PER_COMPANY), inC = i % SQUADS_PER_COMPANY;
      const cx = (comp % compCols) * (sqW * 2 + 8) + (inC % 2) * sqW, cy = Math.floor(comp / compCols) * (sqH * 2 + 8) + Math.floor(inC / 2) * sqH;
      const row = TCLASSES.indexOf(q.cls) * 4 + (s.armor[q.cls] ?? 0);
      const shown = Math.ceil(Math.min(q.count, SQUAD_SIZE) / scale);
      for (let k = 0; k < shown; k++) out.push({ ox: cx + (k % cols) * sx, oy: cy + Math.floor(k / cols) * sy, row });
    });
    const w = Math.max(...out.map((o) => o.ox), 0), h = Math.max(...out.map((o) => o.oy), 0);
    return out.map((o) => ({ ...o, ox: o.ox - w / 2 - 8, oy: o.oy - h / 2 - 16 }));
  }
  private syncArmy(s: GameState) {
    const total = s.squads.reduce((a, q) => a + q.count, 0), scale = Math.max(1, Math.ceil(total / MAX_BOBS));
    const seen = new Set<string>();
    for (const bat of s.battalions) {
      seen.add(bat.id);
      const sig = s.squads.filter((q) => q.bat === bat.id).map((q) => q.cls + q.count).join() + JSON.stringify(s.armor) + scale;
      let v = this.bats.get(bat.id);
      if (!v) {
        const blit = this.add.blitter(0, 0, 'soldiers');
        const banner = this.add.image(bat.x, bat.y, this.bannerTex(bat.color, bat.emblem, 0)).setOrigin(0.2, 1);
        const label = this.add.text(bat.x, bat.y, '', { fontFamily: 'monospace', fontSize: '24px', color: '#fff4d6', stroke: '#1d1716', strokeThickness: 5 }).setOrigin(0.5, 0).setScale(0.25).setResolution(2);
        const ring = this.add.ellipse(bat.x, bat.y, 40, 14).setStrokeStyle(1, 0xffe27a).setVisible(false);
        v = { blit, bobs: [], banner, label, x: bat.x, y: bat.y, sig: '', ring }; this.bats.set(bat.id, v);
      }
      if (v.sig !== sig) {
        v.sig = sig; v.blit.clear(); v.bobs = [];
        for (const o of this.layout(s, bat, scale)) v.bobs.push({ b: v.blit.create(0, 0, `${o.row}_0`), ox: o.ox, oy: o.oy, row: o.row, ph: Math.floor(Math.random() * 4) });
        v.bobs.sort((a, b) => a.oy - b.oy);
        v.blit.clear(); for (const bb of v.bobs) bb.b = v.blit.create(0, 0, `${bb.row}_0`);
      }
      const n = s.squads.filter((q) => q.bat === bat.id).reduce((a, q) => a + q.count, 0);
      v.label.setText(`${bat.name} (${n})`);
      v.banner.setTexture(this.bannerTex(bat.color, bat.emblem, this.frame));
      const w = Math.max(30, ...v.bobs.map((b) => Math.abs(b.ox) * 2 + 16));
      v.ring.setSize(w, w * 0.4);
      v.ring.setDisplayOrigin(w / 2, w * 0.2);
    }
    for (const [id, v] of this.bats) if (!seen.has(id)) { v.blit.destroy(); v.banner.destroy(); v.label.destroy(); v.ring.destroy(); this.bats.delete(id); }
  }

  update(time: number, dt: number) {
    const s = getState();
    for (const bat of s.battalions) {
      const v = this.bats.get(bat.id); if (!v) continue;
      const dx = bat.x - v.x, dy = bat.y - v.y, d = Math.hypot(dx, dy), step = (dt / 1000) * 34;
      const moving = d > 0.5;
      if (moving) { const k = Math.min(1, step / d); v.x += dx * k; v.y += dy * k; }
      const f = Math.floor(time / 140);
      for (const bb of v.bobs) {
        const fr = moving ? (f + bb.ph) % 4 : ((Math.floor(time / 700) + bb.ph) % 6 === 0 ? 2 : 0);
        bb.b.setFrame(`${bb.row}_${fr}`); bb.b.x = Math.round(v.x + bb.ox); bb.b.y = Math.round(v.y + bb.oy);
        if (moving && Math.abs(dx) > 1) bb.b.flipX = dx < 0;
      }
      v.blit.setDepth(v.y);
      const top = Math.min(0, ...v.bobs.map((b) => b.oy));
      v.banner.setPosition(Math.round(v.x - 4), Math.round(v.y + top - 2)).setDepth(v.y + 1);
      v.label.setPosition(Math.round(v.x), Math.round(v.y + 4)).setDepth(9500);
      v.ring.setPosition(v.x, v.y - 2).setDepth(v.y - 1);
    }
  }

  // ---------- input ----------
  private tileAt(p: Phaser.Input.Pointer) { const w = this.cameras.main.getWorldPoint(p.x, p.y); return { tx: Math.floor(w.x / TILE), ty: Math.floor(w.y / TILE), wx: w.x, wy: w.y }; }
  private onDown(p: Phaser.Input.Pointer) {
    const ps = [this.input.pointer1, this.input.pointer2].filter((q) => q.isDown);
    if (ps.length === 2) { this.pinch = { d: Phaser.Math.Distance.Between(ps[0].x, ps[0].y, ps[1].x, ps[1].y), z: this.cameras.main.zoom }; this.drag = null; return; }
    const ui = getUI(), paint = !!ui.placing && BUILDINGS[ui.placing].size === 1;
    this.drag = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY, moved: false, paint };
    this.lastPaint = '';
    if (paint) this.tryPlace(p);
  }
  private onMove(p: Phaser.Input.Pointer) {
    this.updateGhost(p);
    if (this.pinch) {
      const a = this.input.pointer1, b = this.input.pointer2;
      if (a.isDown && b.isDown) this.zoomAt(this.pinch.z * (Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / this.pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!this.drag || !p.isDown) return;
    if (Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 6) this.drag.moved = true;
    if (this.drag.paint) { this.tryPlace(p); return; }
    if (this.drag.moved) { const z = this.cameras.main.zoom; this.cameras.main.setScroll(this.drag.sx - (p.x - this.drag.x) / z, this.drag.sy - (p.y - this.drag.y) / z); }
  }
  private onUp(p: Phaser.Input.Pointer) {
    if (this.pinch) { if (!this.input.pointer1.isDown && !this.input.pointer2.isDown) this.pinch = null; this.drag = null; return; }
    const d = this.drag; this.drag = null;
    if (!d || d.moved || d.paint) return;
    this.tap(p);
  }
  private tryPlace(p: Phaser.Input.Pointer) {
    const ui = getUI(); if (!ui.placing) return;
    const { tx, ty } = this.tileAt(p), n = BUILDINGS[ui.placing].size, x = tx - Math.floor(n / 2), y = ty - Math.floor(n / 2), k = `${x},${y}`;
    if (k === this.lastPaint) return; this.lastPaint = k;
    if (canPlace(getState(), ui.placing, x, y)) build(ui.placing, x, y);
  }
  private tap(p: Phaser.Input.Pointer) {
    const ui = getUI(), { tx, ty, wx, wy } = this.tileAt(p), s = getState();
    if (ui.placing) { this.tryPlace(p); if (BUILDINGS[ui.placing].unique) setUI({ placing: null }); return; }
    if (ui.moving) {
      const b = s.buildings.find((q) => q.id === ui.moving);
      if (b) { const n = BUILDINGS[b.kind].size; moveBuilding(b.id, tx - Math.floor(n / 2), ty - Math.floor(n / 2)); }
      setUI({ moving: null }); return;
    }
    // battalion hit test
    for (const [id, v] of this.bats) {
      const w = Math.max(30, ...v.bobs.map((b) => Math.abs(b.ox) * 2 + 16)), h = Math.max(24, ...v.bobs.map((b) => Math.abs(b.oy) * 2 + 16));
      if (Math.abs(wx - v.x) < w / 2 && wy < v.y + 8 && wy > v.y - h) { setUI({ selBat: ui.selBat === id ? null : id, selBuilding: null, panel: ui.panel === 'army' || ui.selBat === id ? ui.panel : 'army' }); return; }
    }
    if (ui.selBat) { marchTo(ui.selBat, wx, wy + 8); this.marker(wx, wy); return; }
    const b = [...s.buildings].reverse().find((q) => { const n = BUILDINGS[q.kind].size; return tx >= q.x && tx < q.x + n && ty >= q.y && ty < q.y + n; });
    setUI({ selBuilding: b?.id ?? null, panel: b ? 'build' : ui.panel });
  }
  private updateGhost(p: Phaser.Input.Pointer) {
    const ui = getUI(), kind = ui.placing ?? (ui.moving ? getState().buildings.find((b) => b.id === ui.moving)?.kind : null);
    if (!kind) { this.ghost.setVisible(false); return; }
    const { tx, ty } = this.tileAt(p), n = BUILDINGS[kind].size, x = tx - Math.floor(n / 2), y = ty - Math.floor(n / 2);
    const ok = canPlace(getState(), kind, x, y, ui.moving ?? undefined);
    this.ghost.setVisible(true).setPosition(x * TILE, y * TILE).setSize(n * TILE, n * TILE).setFillStyle(ok ? 0x44ff66 : 0xff4444, 0.3);
  }
  private syncUI() {
    const ui = getUI(), s = getState();
    if (!ui.placing && !ui.moving) this.ghost.setVisible(false);
    const b = s.buildings.find((q) => q.id === ui.selBuilding);
    if (b) { const n = BUILDINGS[b.kind].size; this.selRect.setVisible(true).setPosition(b.x * TILE, b.y * TILE).setSize(n * TILE, n * TILE); } else this.selRect.setVisible(false);
    for (const [id, v] of this.bats) v.ring.setVisible(id === ui.selBat);
  }
  focus(x: number, y: number) { this.cameras.main.pan(x, y, 500, 'Sine.easeInOut'); }

  // ---------- effects ----------
  private marker(x: number, y: number) {
    const m = this.add.ellipse(x, y, 14, 6).setStrokeStyle(1, 0xffe27a).setDepth(9400);
    this.tweens.add({ targets: m, scale: 0.2, alpha: 0, duration: 600, onComplete: () => m.destroy() });
  }
  private smoke() {
    const s = getState(), k = s.buildings.find((b) => b.kind === 'keep'), lvl = keepLevel(s);
    const pts: [number, number][] = [];
    if (k) pts.push(lvl === 1 ? [(k.x) * TILE + 40, (k.y) * TILE + 58] : lvl === 2 ? [k.x * TILE + 63, k.y * TILE - 4] : [k.x * TILE + 40, k.y * TILE + 10]);
    for (const b of s.buildings) if (b.kind === 'house' && b.level === 2) pts.push([b.x * TILE + 23, b.y * TILE - 12]);
    for (const [x, y] of pts.slice(0, 20)) {
      const p = this.add.image(x, y, 'px').setTint(0xcfc6b8).setAlpha(0.7).setDepth(9300).setScale(1.5);
      this.tweens.add({ targets: p, y: y - 22, x: x + 6, alpha: 0, scale: 3, duration: 2400, onComplete: () => p.destroy() });
    }
  }
  private fx(fx: Fx) {
    if (fx.kind === 'build' && fx.x != null && fx.y != null) {
      const e = this.add.particles(fx.x, fx.y, 'px', { speed: { min: 20, max: 70 }, lifespan: 700, quantity: 30, scale: { start: 2, end: 0 }, tint: [0xcdb48a, 0xa08a6a, 0xffe27a], emitting: false }).setDepth(9600);
      e.explode(36); this.time.delayedCall(900, () => e.destroy());
      this.floatText(fx.x, fx.y - 20, fx.text, '#ffe27a');
      this.cameras.main.shake(120, 0.002);
    }
    if (fx.kind === 'reward') {
      const k = getState().buildings.find((b) => b.kind === 'keep');
      const x = ((k?.x ?? 30) + 2.5) * TILE, y = (k?.y ?? 21) * TILE;
      const e = this.add.particles(x, y, 'px', { speed: { min: 30, max: 90 }, angle: { min: 200, max: 340 }, gravityY: 120, lifespan: 1100, scale: { start: 1.5, end: 0 }, tint: [0xffe27a, 0xecc94b, 0xfff1a8], emitting: false }).setDepth(9600);
      e.explode(40); this.time.delayedCall(1200, () => e.destroy());
      if (fx.res?.gold) this.floatText(x, y - 10, `+${fx.res.gold} gold`, '#ffe27a');
    }
  }
  private floatText(x: number, y: number, t: string, color: string) {
    const tx = this.add.text(x, y, t, { fontFamily: 'monospace', fontSize: '28px', color, stroke: '#1d1716', strokeThickness: 6 }).setOrigin(0.5).setScale(0.3).setDepth(9700);
    this.tweens.add({ targets: tx, y: y - 26, alpha: { from: 1, to: 0 }, duration: 1600, ease: 'Cubic.Out', onComplete: () => tx.destroy() });
  }
}
