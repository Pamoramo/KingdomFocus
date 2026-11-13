'use client';
import { useCallback, useState } from 'react';
import { useGame, useUI } from './hooks.ts';
import { TROOPS, TCLASSES, ARMOR, armorCost, armorKeepReq, rankFor, EMBLEMS, BANNER_COLORS, SQUADS_PER_COMPANY, BUILDINGS, type TClass } from '../lib/economy.ts';
import { recruit, upgradeArmor, troopUnlocked, armyCap, armySize, newBattalion, editBattalion, disbandBattalion, transferSquad, keepLevel, canAfford } from '../lib/state.ts';
import { setUI } from '../game/ui.ts';
import { soldierSheet, banner, canvas } from '../game/art.ts';
import { Sprite } from './Icon.tsx';
import { Cost } from './Cost.tsx';

let sheet: HTMLCanvasElement | null = null;
function Soldier({ cls, tier }: { cls: TClass; tier: number }) {
  const fn = useCallback(() => { sheet ??= soldierSheet(); const [c, x] = canvas(16, 16); x.drawImage(sheet, 0, (TCLASSES.indexOf(cls) * 4 + tier) * 16, 16, 16, 0, 0, 16, 16); return c; }, [cls, tier]);
  return <Sprite canvas={fn} scale={3} />;
}
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function Banner({ color, emblem }: { color: number; emblem: string }) {
  const fn = useCallback(() => banner(hex(color), emblem, 0), [color, emblem]);
  return <Sprite canvas={fn} scale={2} />;
}

export function ArmyPanel() {
  const s = useGame(), ui = useUI();
  const [tab, setTab] = useState<'recruit' | 'host' | 'armory'>('recruit');
  const [qty, setQty] = useState(5);
  const bat = s.battalions.find((b) => b.id === ui.selBat) ?? s.battalions[0];
  return <div className="space-y-3">
    <div className="flex gap-1">{(['recruit', 'host', 'armory'] as const).map((t) => <button key={t} className={`btn flex-1 capitalize ${tab === t ? 'btn-gold' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div className="text-sm">Soldiers: <b>{armySize(s)}/{armyCap(s)}</b> · Battalion: <select className="inp !w-auto" value={bat.id} onChange={(e) => setUI({ selBat: e.target.value })}>{s.battalions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
    {ui.selBat && <div className="text-xs bg-gold/40 p-1 rounded">Tap the map to march <b>{bat.name}</b>. <button className="underline" onClick={() => setUI({ selBat: null })}>Deselect</button></div>}
    {tab === 'recruit' && <>
      <div className="flex items-center gap-2 text-sm">Quantity {[1, 5, 12, 50].map((n) => <button key={n} className={`btn !px-2 ${qty === n ? 'btn-gold' : ''}`} onClick={() => setQty(n)}>{n}</button>)}</div>
      {TCLASSES.map((c) => { const d = TROOPS[c], ok = troopUnlocked(s, c);
        return <div key={c} className="panel p-2 flex items-center gap-2">
          <Soldier cls={c} tier={s.armor[c] ?? 0} />
          <div className="flex-1"><div className="font-bold">{d.name} <span className="text-xs opacity-60">power {d.power}</span></div><Cost cost={d.cost} have={s.res} n={qty} />
            {!ok && <div className="text-xs text-blood">Needs {Object.entries(d.req).map(([k, l]) => `${BUILDINGS[k as keyof typeof BUILDINGS].levels[l! - 1].name}`).join(', ')}</div>}</div>
          <button className="btn" disabled={!ok || !canAfford(s.res, d.cost, qty)} onClick={() => recruit(c, qty, bat.id)}>Recruit</button>
        </div>; })}
    </>}
    {tab === 'armory' && TCLASSES.map((c) => { const t = s.armor[c] ?? 0, cost = t < 3 ? armorCost(c, t + 1) : null, need = armorKeepReq(t + 1);
      return <div key={c} className="panel p-2 flex items-center gap-2">
        <Soldier cls={c} tier={t} />{t < 3 && <><span>→</span><Soldier cls={c} tier={t + 1} /></>}
        <div className="flex-1 text-sm"><b>{TROOPS[c].name}</b><div>{ARMOR[t]}{cost && <> → {ARMOR[t + 1]}</>}</div>{cost && <Cost cost={cost} have={s.res} />}
          {cost && keepLevel(s) < need && <div className="text-xs text-blood">Requires {BUILDINGS.keep.levels[need - 1].name}</div>}</div>
        {cost && <button className="btn" disabled={keepLevel(s) < need || !canAfford(s.res, cost)} onClick={() => upgradeArmor(c)}>Forge</button>}
      </div>; })}
    {tab === 'host' && <Host batId={bat.id} />}
  </div>;
}

function Host({ batId }: { batId: string }) {
  const s = useGame(), [name, setName] = useState('');
  const b = s.battalions.find((q) => q.id === batId)!, squads = s.squads.filter((q) => q.bat === b.id);
  const n = squads.reduce((a, q) => a + q.count, 0);
  const companies = Array.from({ length: Math.ceil(squads.length / SQUADS_PER_COMPANY) }, (_, i) => squads.slice(i * SQUADS_PER_COMPANY, (i + 1) * SQUADS_PER_COMPANY));
  const roman = (i: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] ?? String(i + 1);
  return <div className="space-y-2">
    <div className="panel p-2 flex gap-3">
      <Banner color={b.color} emblem={b.emblem} />
      <div className="flex-1 space-y-1 text-sm">
        <input className="inp font-bold" value={b.name} onChange={(e) => editBattalion(b.id, { name: e.target.value })} />
        <div className="flex gap-1 items-center"><span className="whitespace-nowrap">{rankFor(n)}</span><input className="inp" value={b.commander} onChange={(e) => editBattalion(b.id, { commander: e.target.value })} /></div>
        <div className="flex gap-1 flex-wrap">{BANNER_COLORS.map((c) => <button key={c} aria-label="color" onClick={() => editBattalion(b.id, { color: c })} className={`w-5 h-5 border-2 ${b.color === c ? 'border-ink' : 'border-parch-d'}`} style={{ background: hex(c) }} />)}</div>
        <div className="flex gap-1 flex-wrap">{EMBLEMS.map((e) => <button key={e} onClick={() => editBattalion(b.id, { emblem: e })} className={`btn !px-1.5 !py-0 text-xs capitalize ${b.emblem === e ? 'btn-gold' : ''}`}>{e}</button>)}</div>
      </div>
    </div>
    <div className="flex gap-2"><button className="btn flex-1" onClick={() => setUI({ selBat: b.id, panel: window.innerWidth < 768 ? null : 'army' })}>March on map</button>
      {s.battalions.length > 1 && <button className="btn btn-red" onClick={() => disbandBattalion(b.id)}>Disband</button>}</div>
    {companies.map((cs, i) => <div key={i} className="panel p-2 text-sm"><b>{roman(i)} Company</b> <span className="opacity-60">({cs.reduce((a, q) => a + q.count, 0)})</span>
      {cs.map((q, j) => <div key={q.id} className="flex items-center gap-2 mt-1"><span className="flex-1">Squad {j + 1}: {q.count} {TROOPS[q.cls].name}</span>
        {s.battalions.length > 1 && <select className="inp !w-auto !py-0 text-xs" value={q.bat} onChange={(e) => transferSquad(q.id, e.target.value)}>{s.battalions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</div>)}
    </div>)}
    <div className="flex gap-2"><input className="inp" placeholder="New battalion name" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={() => { newBattalion(name.trim() || `Battalion ${s.battalions.length + 1}`); setName(''); }}>Raise</button></div>
  </div>;
}
