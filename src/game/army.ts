import Phaser from 'phaser';
import { type GameState, type Battalion, type Squad, batSize, DUTY_CAP, quarterPlan } from '../lib/state.ts';
import { TCLASSES, OFFICERS } from '../lib/economy.ts';
import { awayBats } from '../lib/warActions.ts';
import { sFrame, bFrame, bannerTex, BW, BH, S } from './textures.ts';

export const LOD_ZOOM = 1.25;
/** Character display scale relative to their 16x20 design size. */
export const UNIT_K = 1;
const SW = 16, SH = 20, SX = 11, SY = 9;
interface Bob { b: Phaser.GameObjects.Bob; ox: number; oy: number; cls: string; rank: number; ph: number; squad: string; idx: number }
interface View { tick: number; detail: Phaser.GameObjects.Blitter; blocks: Phaser.GameObjects.Blitter; bobs: Bob[]; banner: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Ellipse; x: number; y: number; sig: string; w: number; h: number; moving: boolean }
/** Soldiers per row inside a squad, and squads per row, for each formation. */
const SHAPES = { line: { cols: 6, perRow: (n: number) => Math.min(n, 6) }, block: { cols: 4, perRow: (n: number) => Math.max(1, Math.ceil(Math.sqrt(n))) }, column: { cols: 2, perRow: (n: number) => (n > 8 ? 2 : 1) } } as const;

/** Soldier offsets inside a battalion. Squads stay together, ordered by class; the formation sets their shape. */
export function layout(squads: Squad[], formation: Battalion['formation']) {
  const shape = SHAPES[formation] ?? SHAPES.block, sorted = [...squads].sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.rank - a.rank);
  const cols = shape.cols, rows = Math.ceil(12 / cols), qw = cols * SX + 5, qh = rows * SY + 4, per = shape.perRow(sorted.length);
  const pos = sorted.map((q, i) => ({ q, x: (i % per) * qw, y: Math.floor(i / per) * qh, cols }));
  const w = Math.max(qw, ...pos.map((p) => p.x + qw)), h = Math.max(qh, ...pos.map((p) => p.y + qh));
  return { pos: pos.map((p) => ({ ...p, x: p.x - w / 2, y: p.y - h })), w, h, qw, qh };
}

/** Soldiers a battalion sends on town duty (patrol or garrison), taken from its best-ordered squads. */
export function dutySoldiers(s: GameState, bat: Battalion): { cls: string; rank: number }[] {
  if (!bat.orders || bat.orders === 'formation') return [];
  const squads = s.squads.filter((q) => q.bat === bat.id).sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.rank - a.rank);
  const out: { cls: string; rank: number }[] = [];
  for (const q of squads) for (let i = 0; i < q.count && out.length < DUTY_CAP; i++) out.push({ cls: q.cls, rank: q.rank });
  return out;
}

export class Army {
  views = new Map<string, View>();
  lod = false;
  constructor(private scene: Phaser.Scene) {}

  sync(s: GameState, frame: number) {
    const seen = new Set<string>(), away = awayBats(s), plan = quarterPlan(s);
    for (const bat of s.battalions) {
      if (away.has(bat.id)) continue; // on campaign or lent to an ally: shown on the world map instead
      seen.add(bat.id);
      let duty = (bat.orders && bat.orders !== 'formation' ? DUTY_CAP : 0) + (plan.per.get(bat.id) ?? 0); // soldiers on town duty or resting in quarters leave the formation
      const squads = s.squads.filter((q) => q.bat === bat.id && q.count > 0).sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.rank - a.rank)
        .map((q) => { const t = Math.min(duty, q.count); duty -= t; return { ...q, count: q.count - t }; }).filter((q) => q.count > 0);
      const sig = squads.map((q) => q.id + q.cls + q.count + q.rank).join() + bat.formation + bat.orders;
      let v = this.views.get(bat.id);
      if (!v) {
        const sc = this.scene;
        v = { detail: sc.add.blitter(0, 0, 'soldiers1x'), blocks: sc.add.blitter(0, 0, 'blocks'), bobs: [], banner: sc.add.image(bat.x, bat.y, bannerTex(sc, bat.color, bat.emblem, 0)).setOrigin(0.2, 1).setScale(S),
          label: sc.add.text(bat.x, bat.y, '', { fontFamily: 'monospace', fontSize: '24px', color: '#fff4d6', stroke: '#1d1716', strokeThickness: 5 }).setOrigin(0.5, 0).setScale(0.25).setResolution(2),
          ring: sc.add.ellipse(bat.x, bat.y, 40, 14).setStrokeStyle(1, 0xffe27a).setVisible(false), x: bat.x, y: bat.y, sig: '', w: 0, h: 0, moving: false, tick: -1 };
        v.detail.setVisible(!this.lod); v.blocks.setVisible(this.lod);
        this.views.set(bat.id, v);
      }
      if (v.sig !== sig) {
        v.sig = sig; v.detail.clear(); v.blocks.clear(); v.bobs = [];
        const { pos, w, h, qw, qh } = layout(squads, bat.formation); v.w = w; v.h = h;
        const bx = 1, by = 1; void qw; void qh; // blitters cannot scale; LOD blocks keep their 46x32 footprint
        const items: Omit<Bob, 'b'>[] = [];
        for (const { q, x, y, cols } of pos) {
          v.blocks.create(x / bx, y / by, bFrame(q.cls, q.rank));
          for (let k = 0; k < q.count; k++) items.push({ ox: x + (k % cols) * SX + SX / 2 - SW / 2, oy: y + Math.floor(k / cols) * SY + SY - SH, cls: q.cls, rank: q.rank, ph: Math.floor(Math.random() * 4), squad: q.id, idx: k });
        }
        items.sort((a, b) => a.oy - b.oy);
        for (const it of items) v.bobs.push({ ...it, b: v.detail.create(it.ox, it.oy, sFrame(it.cls, it.rank, 0)) });
      }
      const n = batSize(s, bat.id);
      const empty = !squads.length; v.banner.setVisible(!empty); v.label.setVisible(!empty); // everyone is on duty or in quarters
      v.label.setText(`${bat.name} · ${OFFICERS[bat.commander.rank].name} ${bat.commander.name.split(' ')[0]} (${n})`);
      v.banner.setTexture(bannerTex(this.scene, bat.color, bat.emblem, frame % 2));
      v.ring.setSize(v.w + 16, Math.max(14, v.w * 0.35)).setDisplayOrigin((v.w + 16) / 2, Math.max(14, v.w * 0.35) / 2);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.detail.destroy(); v.blocks.destroy(); v.banner.destroy(); v.label.destroy(); v.ring.destroy(); this.views.delete(id); }
  }

  /** Where each soldier of a battalion in formation stands (for their shadows). */
  feet(foot: (x: number, y: number, w: number) => void) {
    if (this.lod) return;
    for (const v of this.views.values()) if (v.detail.visible) { const x = Math.round(v.x), y = Math.round(v.y); for (const bb of v.bobs) if (bb.b.visible) foot(x + bb.ox + SW / 2, y + bb.oy + SH, SW * 0.5); }
  }
  setLod(zoom: number) {
    const lod = zoom < LOD_ZOOM;
    if (lod === this.lod) return; this.lod = lod;
    for (const v of this.views.values()) { v.detail.setVisible(!lod); v.blocks.setVisible(lod); }
  }

  update(s: GameState, time: number, dt: number, sel: string | null) {
    const animTick = Math.floor(time / 140);
    for (const bat of s.battalions) {
      const v = this.views.get(bat.id); if (!v) continue;
      const dx = bat.x - v.x, dy = bat.y - v.y, d = Math.hypot(dx, dy), moving = d > 0.5;
      if (moving) { const k = Math.min(1, ((dt / 1000) * 30) / d); v.x += dx * k; v.y += dy * k; }
      const x = Math.round(v.x), y = Math.round(v.y);
      v.detail.setPosition(x, y).setDepth(y); v.blocks.setPosition(x, y).setDepth(y);
      const slow = Math.floor(time / 900);
      if (!this.lod && v.detail.visible && (moving ? animTick !== v.tick : slow !== v.tick)) {
        v.tick = moving ? animTick : slow;
        for (const bb of v.bobs) {
          const f = moving ? (animTick + bb.ph) % 4 : ((slow + bb.ph) % 7 === 0 ? 2 : 0);
          bb.b.setFrame(sFrame(bb.cls, bb.rank, f)); if (moving && Math.abs(dx) > 1) bb.b.flipX = dx < 0;
        }
      }
      v.moving = moving;
      v.banner.setPosition(x - v.w / 2 - 6, y - v.h + 2).setDepth(y + 1);
      v.label.setPosition(x, y + 4).setDepth(30001);
      v.ring.setPosition(x, y - 2).setDepth(y - 1).setVisible(bat.id === sel);
    }
  }

  /** Returns the battalion (and, when zoomed in, the exact soldier) under a world point. */
  hit(wx: number, wy: number): { bat: string; squad?: string; idx?: number } | null {
    for (const [id, v] of this.views) {
      if (Math.abs(wx - v.x) > v.w / 2 + 8 || wy > v.y + 8 || wy < v.y - v.h - 24) continue;
      if (this.lod) return { bat: id };
      let best: Bob | null = null, bd = 99;
      for (const bb of v.bobs) { const d = Math.hypot(wx - (v.x + bb.ox + SW / 2), wy - (v.y + bb.oy + SH * 0.6)); if (d < bd) { bd = d; best = bb; } }
      return best && bd < 10 ? { bat: id, squad: best.squad, idx: best.idx } : { bat: id };
    }
    return null;
  }
  /** A random visible soldier as a speech target (none when zoomed out). */
  randomSoldier() {
    if (this.lod) return null;
    const vs = [...this.views.values()].filter((v) => v.bobs.length); if (!vs.length) return null;
    const v = vs[Math.floor(Math.random() * vs.length)], bb = v.bobs[Math.floor(Math.random() * v.bobs.length)];
    return { get x() { return v.x + bb.ox + SW / 2; }, get y() { return v.y + bb.oy + SH; }, h: SH, alive: () => v.detail.active };
  }
  bounds(id: string) { const v = this.views.get(id); return v ? { x: v.x, y: v.y - v.h / 2 } : null; }
}
export { BW, BH };
