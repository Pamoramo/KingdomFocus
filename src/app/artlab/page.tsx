'use client';
// Developer gallery of every procedural sprite (open /artlab).
import { useEffect, useRef } from 'react';
import { soldierSheet, blockSheet, frameRect, FW, FH, SHEET_CLASSES } from '../../game/art/soldiers.ts';
import { drawBuilding, drawTile } from '../../game/art/buildings.ts';
import { portrait, insignia, banner, terrainTile, decoration, waterTile } from '../../game/art/misc.ts';
import { BUILDINGS, BKINDS } from '../../lib/economy.ts';
import { hdify } from '../../game/art/hd.ts';
import { withoutOutline } from '../../game/art/px.ts';

export default function ArtLab() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current!; host.innerHTML = '';
    const add = (cv: HTMLCanvasElement, s = 3, label = '') => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:4px;vertical-align:bottom;text-align:center;color:#fff;font:10px monospace'; cv.style.cssText = `width:${cv.width * s}px;image-rendering:pixelated`; d.append(cv, document.createElement('br'), label); host.append(d); };
    const sheet = soldierSheet(), show = document.createElement('div'); show.id = 'showcase'; show.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;background:#e8e8e8;padding:6px'; host.append(show);
    for (const cls of SHEET_CLASSES) for (const rk of [0, 2, 4]) { const { x, y } = frameRect(cls, rk, 0); const cv = document.createElement('canvas'); cv.width = FW * 2; cv.height = FH * 2; cv.getContext('2d')!.drawImage(sheet, x * 2, y * 2, FW * 2, FH * 2, 0, 0, FW * 2, FH * 2); cv.style.cssText = `width:${FW * 4}px;image-rendering:pixelated`; cv.title = cls + rk; show.append(cv); }
    add(sheet, 1, 'soldiers (HD)'); add(blockSheet(), 4, 'LOD blocks');
    for (const k of BKINDS) { const d = BUILDINGS[k]; if (d.paint) continue; d.levels.forEach((_, i) => add(hdify(withoutOutline(() => drawBuilding(k, i + 1, 0).cv)), 1, `${k} ${i + 1}`)); }
    for (const k of ['road', 'palisade', 'wall', 'courtyard', 'moat'] as const) for (const l of [1, 2]) for (const m of [10, 5, 15]) add(drawTile(k, l, m), 3, `${k}${l}`);
    add(drawTile('road', 1, 5, 0, true), 3, 'bridge');
    for (let i = 0; i < 5; i++) add(portrait(i * 77 + 3, i, ['#b3242a', '#1f4e9c', '#2a7a3b', '#c9a227', '#6a2a8c'][i]), 4, `officer ${i}`);
    for (let i = 0; i < 5; i++) { add(insignia('officer', i), 4); add(insignia('soldier', i), 4); }
    for (const e of ['lion', 'cross', 'tower', 'sword', 'star', 'eagle', 'stag', 'crown', 'dragon', 'griffin']) add(banner('#b3242a', e, 0), 3, e);
    for (const t of ['dirt', 'cracked', 'mix', 'grass', 'lush'] as const) add(terrainTile(t, 1), 4, t);
    for (const d of ['rock', 'boulder', 'deadbush', 'tree', 'flowers', 'deadtree', 'pine', 'bush', 'stump', 'reeds'] as const) add(decoration(d, 1), 3, d);
    for (const m of [0, 10, 5]) add(waterTile(m, 0), 4, 'water');
  }, []);
  return <div ref={ref} style={{ background: '#5d9a3b', minHeight: '100vh', padding: 8 }} />;
}
