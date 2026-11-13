'use client';
// Developer gallery of every procedural sprite (open /artlab).
import { useEffect, useRef } from 'react';
import { soldierSheet, blockSheet } from '../../game/art/soldiers.ts';
import { drawBuilding, drawTile } from '../../game/art/buildings.ts';
import { portrait, insignia, banner, terrainTile, decoration, waterTile } from '../../game/art/misc.ts';
import { BUILDINGS, BKINDS } from '../../lib/economy.ts';

export default function ArtLab() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current!; host.innerHTML = '';
    const add = (cv: HTMLCanvasElement, s = 3, label = '') => { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;margin:4px;vertical-align:bottom;text-align:center;color:#fff;font:10px monospace'; cv.style.cssText = `width:${cv.width * s}px;image-rendering:pixelated`; d.append(cv, document.createElement('br'), label); host.append(d); };
    add(soldierSheet(), 2, 'soldiers'); add(blockSheet(), 4, 'LOD blocks');
    for (const k of BKINDS) { const d = BUILDINGS[k]; if (d.paint) continue; d.levels.forEach((_, i) => add(drawBuilding(k, i + 1, 0).cv, 2, `${k} ${i + 1}`)); }
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
