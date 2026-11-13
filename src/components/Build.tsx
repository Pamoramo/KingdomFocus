'use client';
import { useCallback } from 'react';
import { useGame, useUI } from './hooks.ts';
import { BUILDINGS, type BKind } from '../lib/economy.ts';
import { keepLevel, upgrade, demolish, canAfford, armyCap, armySize } from '../lib/state.ts';
import { setUI } from '../game/ui.ts';
import { drawBuilding, drawTile } from '../game/art.ts';
import { Sprite } from './Icon.tsx';
import { Cost } from './Cost.tsx';

function Preview({ kind, lvl, scale = 1 }: { kind: BKind; lvl: number; scale?: number }) {
  const fn = useCallback(() => (kind === 'wall' || kind === 'road' ? drawTile(kind, lvl, 10) : drawBuilding(kind, lvl, BUILDINGS[kind].size, 0)), [kind, lvl]);
  return <Sprite canvas={fn} scale={scale} />;
}

export function BuildPanel() {
  const s = useGame(), ui = useUI(), kl = keepLevel(s);
  const sel = s.buildings.find((b) => b.id === ui.selBuilding);
  if (sel) {
    const d = BUILDINGS[sel.kind], next = d.levels[sel.level];
    return <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="panel p-2 grid place-items-center min-w-24"><Preview kind={sel.kind} lvl={sel.level} /></div>
        <div><h3 className="font-title text-3xl">{d.levels[sel.level - 1].name}</h3><div className="text-sm">{d.name} · Level {sel.level}/{d.levels.length}</div><p className="text-xs opacity-80">{d.desc}</p></div>
      </div>
      {next ? <div className="panel p-2 space-y-2">
        <div className="flex items-center gap-3"><div className="grid place-items-center min-w-20"><Preview kind={sel.kind} lvl={sel.level + 1} /></div>
          <div className="text-sm"><b>Upgrade to {next.name}</b><div><Cost cost={next.cost} have={s.res} /></div>
            {kl < next.keep && <div className="text-blood text-xs">Requires {BUILDINGS.keep.levels[next.keep - 1].name}</div>}</div></div>
        <button className="btn btn-gold w-full" disabled={kl < next.keep || !canAfford(s.res, next.cost)} onClick={() => upgrade(sel.id)}>Upgrade</button>
      </div> : <div className="text-sm italic">Fully upgraded.</div>}
      <div className="flex gap-2">
        {sel.kind !== 'keep' && <button className="btn flex-1" onClick={() => setUI({ moving: sel.id, selBuilding: null, panel: null })}>Move</button>}
        {sel.kind !== 'keep' && <button className="btn btn-red flex-1" onClick={() => { demolish(sel.id); setUI({ selBuilding: null }); }}>Demolish</button>}
        <button className="btn flex-1" onClick={() => setUI({ selBuilding: null })}>Back</button>
      </div>
    </div>;
  }
  return <div className="space-y-2">
    <div className="text-sm">Army cap: <b>{armySize(s)}/{armyCap(s)}</b>. Tap a building on the map to upgrade it.</div>
    {(Object.keys(BUILDINGS) as BKind[]).filter((k) => !BUILDINGS[k].unique).map((k) => {
      const d = BUILDINGS[k], l = d.levels[0], locked = kl < l.keep;
      return <div key={k} className={`panel p-2 flex items-center gap-3 ${ui.placing === k ? 'ring-4 ring-gold' : ''}`}>
        <div className="w-16 h-16 grid place-items-center overflow-hidden"><Preview kind={k} lvl={1} scale={d.size > 2 ? 1 : 2} /></div>
        <div className="flex-1 min-w-0"><div className="font-bold">{d.name} <span className="text-xs opacity-60">{d.size}×{d.size}</span></div>
          <p className="text-xs opacity-80">{d.desc}</p><Cost cost={l.cost} have={s.res} />
          {locked && <div className="text-blood text-xs">Requires {BUILDINGS.keep.levels[l.keep - 1].name}</div>}</div>
        <button className="btn" disabled={locked} onClick={() => setUI({ placing: ui.placing === k ? null : k, selBat: null, panel: window.innerWidth < 768 ? null : 'build' })}>{ui.placing === k ? 'Stop' : 'Place'}</button>
      </div>;
    })}
  </div>;
}
