import Phaser from 'phaser';
import { type GameState, type Battalion, type Squad, batSize } from '../lib/state.ts';
import { TCLASSES, FORMATIONS, SQUADS_PER_COMPANY, OFFICERS } from '../lib/economy.ts';
import { sFrame, bFrame, bannerTex, BW, BH } from './textures.ts';

export const LOD_ZOOM = 1.25;
const SX = 11, SY = 10, SQ_W = 4 * SX + 4, SQ_H = 3 * SY + 6;
interface Bob { b: Phaser.GameObjects.Bob; ox: number; oy: number; cls: string; rank: number; ph: number; squad: string; idx: number }
interface View { tick: number; detail: Phaser.GameObjects.Blitter; blocks: Phaser.GameObjects.Blitter; bobs: Bob[]; banner: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Ellipse; x: number; y: number; sig: string; w: number; h: number; moving: boolean }

/** Squad offsets inside a battalion formation; companies of 4 squads are kept together. */
export function layout(squads: Squad[], formation: Battalion['formation']) {
  const perRow = FORMATIONS[formation], sorted = [...squads].sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.rank - a.rank);
  const pos = sorted.map((q, i) => {
    const comp = Math.floor(i / SQUADS_PER_COMPANY), inC = i % SQUADS_PER_COMPANY;
    const compPerRow = Math.max(1, Math.floor(perRow / 2)), cx = (comp % compPerRow) * (SQ_W * 2 + 6) + (inC % 2) * SQ_W, cy = Math.floor(comp / compPerRow) * (SQ_H * 2 + 6) + Math.floor(inC / 2) * SQ_H;
    return { q, x: cx, y: cy };
  });
  const w = Math.max(SQ_W, ...pos.map((p) => p.x + SQ_W)), h = Math.max(SQ_H, ...pos.map((p) => p.y + SQ_H));
  return { pos: pos.map((p) => ({ ...p, x: p.x - w / 2, y: p.y - h })), w, h };
}

export class Army {
  views = new Map<string, View>();
  lod = false;
  constructor(private scene: Phaser.Scene) {}

  sync(s: GameState, frame: number) {
    const seen = new Set<string>();
    for (const bat of s.battalions) {
      seen.add(bat.id);
      const squads = s.squads.filter((q) => q.bat === bat.id && q.count > 0);
      const sig = squads.map((q) => q.id + q.cls + q.count + q.rank).join() + bat.formation;
      let v = this.views.get(bat.id);
      if (!v) {
        const sc = this.scene;
        v = { detail: sc.add.blitter(0, 0, 'soldiers'), blocks: sc.add.blitter(0, 0, 'blocks'), bobs: [], banner: sc.add.image(bat.x, bat.y, bannerTex(sc, bat.color, bat.emblem, 0)).setOrigin(0.2, 1),
          label: sc.add.text(bat.x, bat.y, '', { fontFamily: 'monospace', fontSize: '24px', color: '#fff4d6', stroke: '#1d1716', strokeThickness: 5 }).setOrigin(0.5, 0).setScale(0.25).setResolution(2),
          ring: sc.add.ellipse(bat.x, bat.y, 40, 14).setStrokeStyle(1, 0xffe27a).setVisible(false), x: bat.x, y: bat.y, sig: '', w: 0, h: 0, moving: false, tick: -1 };
        this.views.set(bat.id, v);
      }
      if (v.sig !== sig) {
        v.sig = sig; v.detail.clear(); v.blocks.clear(); v.bobs = [];
        const { pos, w, h } = layout(squads, bat.formation); v.w = w; v.h = h;
        const items: Omit<Bob, 'b'>[] = [];
        for (const { q, x, y } of pos) {
          v.blocks.create(x + 2, y - 2, bFrame(q.cls, q.rank));
          for (let k = 0; k < q.count; k++) items.push({ ox: x + (k % 4) * SX - 4, oy: y + Math.floor(k / 4) * SY - 12, cls: q.cls, rank: q.rank, ph: Math.floor(Math.random() * 4), squad: q.id, idx: k });
        }
        items.sort((a, b) => a.oy - b.oy);
        for (const it of items) v.bobs.push({ ...it, b: v.detail.create(it.ox, it.oy, sFrame(it.cls, it.rank, 0)) });
      }
      const n = batSize(s, bat.id);
      v.label.setText(`${bat.name} · ${OFFICERS[bat.commander.rank].name} ${bat.commander.name.split(' ')[0]} (${n})`);
      v.banner.setTexture(bannerTex(this.scene, bat.color, bat.emblem, frame % 2));
      v.ring.setSize(v.w + 16, Math.max(14, v.w * 0.35)).setDisplayOrigin((v.w + 16) / 2, Math.max(14, v.w * 0.35) / 2);
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.detail.destroy(); v.blocks.destroy(); v.banner.destroy(); v.label.destroy(); v.ring.destroy(); this.views.delete(id); }
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
      for (const bb of v.bobs) { const d = Math.hypot(wx - (v.x + bb.ox + 8), wy - (v.y + bb.oy + 12)); if (d < bd) { bd = d; best = bb; } }
      return best && bd < 10 ? { bat: id, squad: best.squad, idx: best.idx } : { bat: id };
    }
    return null;
  }
  bounds(id: string) { const v = this.views.get(id); return v ? { x: v.x, y: v.y - v.h / 2 } : null; }
}
export { BW, BH };
