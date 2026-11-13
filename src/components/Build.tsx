'use client';
import { useState } from 'react';
import { useGame, useUI, mobile } from './hooks.ts';
import { BUILDINGS, BKINDS, type BKind, type Cat, type Effects } from '../lib/economy.ts';
import { upgrade, upgradeAll, demolish, canAfford, costOf, lockReason, count } from '../lib/state.ts';
import { setUI } from '../game/ui.ts';
import { drawBuilding, drawTile } from '../game/art/buildings.ts';
import { Sprite } from './Icon.tsx';
import { hdify, HD } from '../game/art/hd.ts';
import { withoutOutline } from '../game/art/px.ts';
import { Cost, Tabs } from './Cost.tsx';

const TILES = new Set<BKind>(['road', 'palisade', 'wall', 'courtyard', 'moat']);
export function Preview({ kind, lvl, max = 64 }: { kind: BKind; lvl: number; max?: number }) {
  const draw = () => hdify(withoutOutline(() => (TILES.has(kind) ? drawTile(kind as 'road', lvl, 10) : drawBuilding(kind, lvl, 0).cv)));
  const d = BUILDINGS[kind], h = TILES.has(kind) ? 30 : d.h * 16 + 60, w = d.w * 16, scale = Math.max(1, Math.min(3, Math.floor(max / Math.max(w, h * 0.7))));
  return <Sprite id={`bh-${kind}-${lvl}`} draw={draw} scale={scale / HD} />;
}
const fxText = (e: Effects) => [e.cap && `+${e.cap} army capacity`, e.gold && `+${Math.round(e.gold * 100)}% gold`, e.wood && `+${Math.round(e.wood * 100)}% wood`, e.stone && `+${Math.round(e.stone * 100)}% stone`, e.renown && `+${Math.round(e.renown * 100)}% renown`, e.xp && `+${Math.round(e.xp * 100)}% troop XP`, e.discount && `-${Math.round(e.discount * 100)}% castle costs`].filter(Boolean).join(' · ');

export function BuildPanel() {
  const s = useGame(), ui = useUI(), [cat, setCat] = useState<Cat>('civil');
  const sel = s.buildings.find((b) => b.id === ui.selBuilding);
  if (sel) {
    const d = BUILDINGS[sel.kind], next = d.levels[sel.level], lock = next ? lockReason(s, sel.kind, sel.level) : null, cost = next ? costOf(s, sel.kind, sel.level) : null;
    const same = s.buildings.filter((b) => b.kind === sel.kind && b.level < d.levels.length).length;
    return <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="card p-2 grid place-items-center min-w-24 min-h-24"><Preview kind={sel.kind} lvl={sel.level} max={96} /></div>
        <div><h3 className="font-title text-3xl leading-none">{d.levels[sel.level - 1].name}</h3><div className="text-sm">{d.name} · level {sel.level}/{d.levels.length}</div><p className="text-sm opacity-80">{d.desc}</p>
          {fxText(d.fx(sel.level)) && <p className="text-sm text-moss font-bold">{fxText(d.fx(sel.level))}</p>}</div>
      </div>
      {next && cost ? <div className="card p-2 space-y-2">
        <div className="flex items-center gap-3"><div className="grid place-items-center min-w-20"><Preview kind={sel.kind} lvl={sel.level + 1} max={80} /></div>
          <div className="text-sm"><b>Upgrade to {next.name}</b><div><Cost cost={cost} have={s.res} zero="free" /></div>{fxText(d.fx(sel.level + 1)) && <div className="text-xs">{fxText(d.fx(sel.level + 1))}</div>}
            {lock && <div className="text-blood text-sm">{lock}</div>}</div></div>
        <button className="btn btn-gold w-full" disabled={!!lock || !canAfford(s.res, cost)} onClick={() => upgrade(sel.id)}>Upgrade</button>
        {d.paint && same > 1 && <button className="btn w-full" disabled={!!lock} onClick={() => upgradeAll(sel.kind)}>Upgrade all {same} {d.name} tiles (as resources allow)</button>}
      </div> : <div className="text-sm italic">Fully upgraded.</div>}
      <div className="flex gap-2">
        {sel.kind !== 'camp' && <button className="btn flex-1" onClick={() => setUI({ moving: sel.id, selBuilding: null, panel: mobile() ? null : 'build' })}>Move</button>}
        {sel.kind !== 'camp' && <button className="btn btn-red flex-1" onClick={() => { if (confirm(`Demolish this ${d.name}? Half its cost is refunded.`)) { demolish(sel.id); setUI({ selBuilding: null }); } }}>Demolish</button>}
        <button className="btn flex-1" onClick={() => setUI({ selBuilding: null })}>Back</button>
      </div>
    </div>;
  }
  return <div className="space-y-2">
    <Tabs value={cat} onChange={setCat} items={[['civil', 'Civil'], ['military', 'Military'], ['castle', 'Castle']]} />
    <p className="text-xs opacity-75">Tap a building on the map to upgrade it. Walls, roads, courtyards and moats can be dragged to paint lines.</p>
    {BKINDS.filter((k) => BUILDINGS[k].cat === cat && k !== 'camp').map((k) => {
      const d = BUILDINGS[k], lock = lockReason(s, k, 0), uniqueDone = d.unique && count(s, k) > 0, cost = costOf(s, k, 0);
      return <div key={k} className={`card p-2 flex items-center gap-3 ${ui.placing === k ? 'ring-4 ring-gold' : ''} ${lock ? 'opacity-60' : ''}`}>
        <div className="w-16 h-16 grid place-items-center overflow-hidden shrink-0"><Preview kind={k} lvl={1} /></div>
        <div className="flex-1 min-w-0"><div className="font-bold">{d.name} <span className="text-xs opacity-60">{d.w}×{d.h} · {d.levels.length} lvl{count(s, k) ? ` · built ${count(s, k)}` : ''}</span></div>
          <p className="text-xs opacity-80">{d.desc}</p><Cost cost={cost} have={s.res} zero="free" />
          {lock && <div className="text-blood text-xs">{lock}</div>}</div>
        <button className="btn shrink-0" disabled={!!lock || !!uniqueDone} onClick={() => setUI({ placing: ui.placing === k ? null : k, selBat: null, selArmy: null, panel: mobile() ? null : 'build' })}>{uniqueDone ? 'Built' : ui.placing === k ? 'Stop' : 'Place'}</button>
      </div>;
    })}
  </div>;
}
