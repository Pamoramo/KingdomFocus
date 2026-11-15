'use client';
import { useState } from 'react';
import { useGame, useUI, mobile } from './hooks.ts';
import { BUILDINGS, BKINDS, type BKind, type Cat, type Effects } from '../lib/economy.ts';
import { upgrade, upgradeAll, demolish, demolishMany, connectedOf, refundOf, canAfford, costOf, lockReason, count } from '../lib/state.ts';
import { add, ZERO } from '../lib/rewards.ts';
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
      {TILES.has(sel.kind) && (() => { const ids = connectedOf(s, sel.id), back = s.buildings.filter((b) => ids.includes(b.id)).reduce((a, b) => add(a, refundOf(b)), { ...ZERO });
        return ids.length > 1 ? <button className="btn btn-red w-full" onClick={() => { if (confirm(`Remove all ${ids.length} connected ${d.name.toLowerCase()} sections? Half their cost is refunded.`)) { demolishMany(ids); setUI({ selBuilding: null }); } }}>Remove all {ids.length} connected sections (<Cost cost={back} plus />)</button> : null; })()}
    </div>;
  }
  return <div className="space-y-2">
    <ClearTool />
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

const CLEARABLE: [BKind, string][] = [['wall', 'Stone walls'], ['palisade', 'Palisades'], ['road', 'Roads'], ['courtyard', 'Courtyards'], ['moat', 'Moat']];
/** Clear an area: choose what to remove, then drag a box over the map. Half the cost of everything removed is refunded. */
function ClearTool() {
  const ui = useUI(), on = !!ui.clearing?.length, [kinds, setKinds] = useState<BKind[]>(['wall', 'palisade']);
  const toggle = (k: BKind) => { const next = kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]; setKinds(next); if (on) setUI({ clearing: next.length ? next : null }); };
  return <div className={`card p-2 space-y-1.5 ${on ? 'ring-4 ring-blood' : ''}`}>
    <div className="flex items-center gap-2"><b className="flex-1 text-sm">Clear an area</b>
      <button className={`btn !py-0 text-sm ${on ? 'btn-red' : ''}`} disabled={!kinds.length} onClick={() => setUI(on ? { clearing: null } : { clearing: kinds, placing: null, moving: null, selBuilding: null, selBat: null, selArmy: null, panel: mobile() ? null : 'build' })}>{on ? 'Done' : 'Start clearing'}</button></div>
    <div className="flex flex-wrap gap-1">{CLEARABLE.map(([k, n]) => <label key={k} className="text-xs flex items-center gap-1"><input type="checkbox" checked={kinds.includes(k)} onChange={() => toggle(k)} />{n}</label>)}</div>
    <p className="text-xs opacity-75">{on ? 'Drag a box over the map to remove everything ticked inside it. Press Done (or Esc) when finished.' : 'Remove many sections at once by dragging a box over them. Half their cost is refunded.'}</p>
  </div>;
}

