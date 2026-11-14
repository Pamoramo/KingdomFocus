'use client';
import { useState } from 'react';
import { useGame, useUI, hex, fmt, mobile } from './hooks.ts';
import { TROOPS, TCLASSES, RANKS, OFFICERS, SQUADS_PER_COMPANY, COLORS, HERALD_COLORS, EMBLEMS, HERALD_EMBLEMS, PRESTIGE_EMBLEMS, type TClass, type Formation } from '../lib/economy.ts';
import { townOrder, DUTY_CAP, type Orders, recruit, troopLock, armyCap, armySize, batSize, newBattalion, editBattalion, disbandBattalion, transferSquad, drill, promote, promoteAll, promoteCost, canPromote, promoteCommander, canAfford, has, unlocked, type GameState, type Battalion } from '../lib/state.ts';
import { nameFor } from '../lib/names.ts';
import { hash } from '../lib/names.ts';
import { setUI, focusOn } from '../game/ui.ts';
import { soldierSheet, frameRect, FW, FH } from '../game/art/soldiers.ts';
import { banner, portrait, insignia } from '../game/art/misc.ts';
import { canvas, withoutOutline } from '../game/art/px.ts';
import { hdify, HD } from '../game/art/hd.ts';
import { Sprite } from './Icon.tsx';
import { Cost, Tabs, Bar, Section } from './Cost.tsx';

let sheet: HTMLCanvasElement | null = null;
export function Soldier({ cls, rank, scale = 3, f = 0 }: { cls: string; rank: number; scale?: number; f?: number }) {
  return <Sprite id={`s-${cls}-${rank}-${f}`} scale={scale / HD} draw={() => { sheet ??= soldierSheet(); const { x, y } = frameRect(cls, rank, f); const [c, ctx] = canvas(FW * HD, FH * HD); ctx.drawImage(sheet, x * HD, y * HD, FW * HD, FH * HD, 0, 0, FW * HD, FH * HD); return c; }} />;
}
export const Banner = ({ color, emblem, scale = 2 }: { color: number; emblem: string; scale?: number }) => <Sprite id={`ban-${color}-${emblem}`} scale={scale / HD} draw={() => hdify(withoutOutline(() => banner(hex(color), emblem, 0)), { grain: 3 })} />;
export const Portrait = ({ b, scale = 3 }: { b: Battalion; scale?: number }) => <Sprite id={`p-${b.commander.seed}-${b.commander.rank}-${b.color}`} scale={scale / HD} draw={() => hdify(withoutOutline(() => portrait(hash(b.commander.seed), b.commander.rank, hex(b.color))), { grain: 4, outline: false })} />;
export const Insignia = ({ kind, rank, scale = 2 }: { kind: 'officer' | 'soldier'; rank: number; scale?: number }) => <Sprite id={`i-${kind}-${rank}`} scale={scale} draw={() => insignia(kind, rank)} />;

const QTY = [1, 5, 12, 50, 100];
export function ArmyPanel() {
  const s = useGame(), ui = useUI(), [tab, setTab] = useState<'recruit' | 'host' | 'ranks'>('host');
  const bat = s.battalions.find((b) => b.id === ui.selBat);
  if (bat && tab === 'host') return <BattalionDetail bat={bat} />;
  return <div className="space-y-3">
    <Tabs value={tab} onChange={setTab} items={[['host', 'Host'], ['recruit', 'Recruit'], ['ranks', 'Ranks']]} />
    <div className="text-sm flex items-center justify-between"><span>Soldiers <b>{fmt(armySize(s))}/{fmt(armyCap(s))}</b></span><span>Battalions <b>{s.battalions.length}</b></span></div>
    <Bar value={armySize(s)} max={armyCap(s)} />
    {tab === 'recruit' && <Recruit />}
    {tab === 'host' && <><TownWatch /><Host /></>}
    {tab === 'ranks' && <Ranks />}
  </div>;
}

function Recruit() {
  const s = useGame(), ui = useUI(), [qty, setQty] = useState(5);
  const target = ui.selBat ?? s.battalions[0]?.id;
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-sm">Into
      <select className="inp !w-auto" value={target ?? ''} onChange={(e) => setUI({ selBat: e.target.value })} disabled={!s.battalions.length}>{s.battalions.length ? s.battalions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option>1st Royal Battalion (new)</option>}</select>
      <span className="flex gap-1">{QTY.map((n) => <button key={n} className={`btn !px-2 !py-0 ${qty === n ? 'btn-gold' : ''}`} onClick={() => setQty(n)}>{n}</button>)}</span>
    </div>
    {(['Early', 'Mid', 'Late'] as const).map((era) => <Section key={era} title={`${era} game`}>
      {TCLASSES.filter((c) => TROOPS[c].era === era).map((c) => { const d = TROOPS[c], lock = troopLock(s, c);
        return <div key={c} className={`flex items-center gap-2 border-b border-black/10 pb-1 ${lock ? 'opacity-60' : ''}`}>
          <Soldier cls={c} rank={0} />
          <div className="flex-1 min-w-0"><div className="font-bold leading-tight">{d.name} <span className="text-xs opacity-60">power {d.power}</span></div><div className="text-xs opacity-75">{d.desc}</div><Cost cost={d.cost} have={s.res} n={qty} />
            {lock && <div className="text-xs text-blood">{lock}</div>}</div>
          <button className="btn shrink-0" disabled={!!lock || !canAfford(s.res, d.cost, qty)} onClick={() => recruit(c, qty, target)}>Recruit</button>
        </div>; })}
    </Section>)}
  </div>;
}

/** Town order: guards on duty versus what the population needs. */
function TownWatch() {
  const s = useGame(), o = townOrder(s);
  if (o.pop < 6) return null;
  const label = o.ratio >= 1 ? 'Safe streets: +3% study gold' : o.ratio >= 0.5 ? 'Uneasy, but thieves keep away' : 'Lawless: thieves may strike';
  return <div className="card p-2 text-sm space-y-1"><div className="flex justify-between"><b>Town watch</b><span>{o.guards}/{o.needed} guards on duty</span></div>
    <Bar value={o.guards} max={o.needed} color={o.ratio >= 1 ? 'bg-moss' : o.ratio >= 0.5 ? 'bg-gold' : 'bg-blood'} />
    <div className="text-xs">{label}. Set battalions to <i>Patrol town</i> or <i>Garrison</i> in their orders.</div></div>;
}

function Host() {
  const s = useGame(), [name, setName] = useState('');
  const armies = [...new Set(s.battalions.map((b) => b.army))];
  if (!s.battalions.length) return <p className="text-sm italic">No soldiers yet. Recruit peasants from your camp to raise your first battalion.</p>;
  return <div className="space-y-2">
    {armies.map((a) => <Section key={a} title={a} right={<button className="btn !py-0 text-sm" onClick={() => setUI({ selArmy: a, selBat: null, panel: mobile() ? null : 'army' })}>March army</button>}>
      {s.battalions.filter((b) => b.army === a).map((b) => { const n = batSize(s, b.id);
        return <button key={b.id} className="w-full flex items-center gap-2 text-left border-b border-black/10 pb-1" onClick={() => { setUI({ selBat: b.id, selArmy: null }); focusOn(b.x, b.y - 20); }}>
          <Banner color={b.color} emblem={b.emblem} scale={1.5} /><Portrait b={b} scale={1.5} />
          <span className="flex-1 min-w-0"><b>{b.name}</b><br /><span className="text-sm">{OFFICERS[b.commander.rank].name} {b.commander.name}</span></span>
          <span className="text-sm whitespace-nowrap">{fmt(n)} soldiers</span>
        </button>; })}
    </Section>)}
    <div className="flex gap-2"><input className="inp" placeholder="New battalion name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /><button className="btn" onClick={() => { newBattalion(name.trim()); setName(''); }}>Raise</button></div>
    <button className="btn w-full" onClick={() => promoteAll()}>Promote every eligible squad</button>
  </div>;
}

function composition(s: GameState, id: string) {
  const m = new Map<TClass, number[]>();
  for (const q of s.squads) if (q.bat === id) { const a = m.get(q.cls) ?? [0, 0, 0, 0, 0]; a[q.rank] += q.count; m.set(q.cls, a); }
  return [...m].sort((a, b) => TCLASSES.indexOf(a[0]) - TCLASSES.indexOf(b[0]));
}

function BattalionDetail({ bat }: { bat: Battalion }) {
  const s = useGame(), n = batSize(s, bat.id), officer = OFFICERS[bat.commander.rank], next = OFFICERS[bat.commander.rank + 1];
  const squads = s.squads.filter((q) => q.bat === bat.id).sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.rank - a.rank);
  const colors = [...COLORS, ...(has(s, 'heraldry') ? HERALD_COLORS : []), ...(unlocked(s, 'color:gold') ? [0xecc94b] : [])];
  const emblems = [...EMBLEMS, ...(has(s, 'heraldry') ? HERALD_EMBLEMS : []), ...Object.entries(PRESTIGE_EMBLEMS).filter(([, a]) => s.achievements.includes(a)).map(([e]) => e)];
  const armies = [...new Set([...s.battalions.map((b) => b.army), 'Royal Army'])];
  return <div className="space-y-3">
    <div className="flex items-center gap-2"><button className="btn !py-0" onClick={() => setUI({ selBat: null, inspect: null })}>← Host</button><span className="text-sm opacity-75 flex-1">{fmt(n)} soldiers · {squads.length} squads · {Math.ceil(squads.length / SQUADS_PER_COMPANY)} companies</span></div>
    <div className="card p-2 flex gap-3">
      <Banner color={bat.color} emblem={bat.emblem} scale={3} />
      <div className="flex-1 space-y-1 text-sm min-w-0">
        <input className="inp font-bold" value={bat.name} maxLength={60} onChange={(e) => editBattalion(bat.id, { name: e.target.value || 'Battalion' })} />
        <label className="flex items-center gap-1">Army <input className="inp" list="armies" value={bat.army} maxLength={60} onChange={(e) => editBattalion(bat.id, { army: e.target.value || 'Royal Army' })} /></label>
        <datalist id="armies">{armies.map((a) => <option key={a} value={a} />)}</datalist>
        <div className="flex gap-1 flex-wrap">{colors.map((c) => <button key={c} aria-label="banner colour" onClick={() => editBattalion(bat.id, { color: c })} className={`w-6 h-6 border-2 ${bat.color === c ? 'border-ink' : 'border-transparent'}`} style={{ background: hex(c) }} />)}</div>
        <div className="flex gap-1 flex-wrap">{emblems.map((e) => <button key={e} onClick={() => editBattalion(bat.id, { emblem: e })} className={`btn !px-1.5 !py-0 text-xs capitalize ${bat.emblem === e ? 'btn-gold' : ''}`}>{e}</button>)}</div>
      </div>
    </div>
    <Section title="Commander">
      <div className="flex gap-3 items-center">
        <Portrait b={bat} scale={3} />
        <div className="flex-1 text-sm space-y-1">
          <div className="flex items-center gap-1"><Insignia kind="officer" rank={bat.commander.rank} /><b>{officer.name}</b></div>
          <input className="inp" value={bat.commander.name} maxLength={40} onChange={(e) => editBattalion(bat.id, { commander: { ...bat.commander, name: e.target.value } })} />
          <div className="text-xs">Bonus: +{Math.round(officer.bonus * 100)}% experience for this battalion</div>
          {next && <button className="btn w-full text-sm" disabled={n < next.size || !canAfford(s.res, { renown: next.renown })} onClick={() => promoteCommander(bat.id)}>Promote to {next.name} ({next.size}+ soldiers, {next.renown} renown)</button>}
        </div>
      </div>
    </Section>
    <Section title="Orders">
      <div className="grid grid-cols-3 gap-1">{([['formation', 'Hold formation', 'Stand in formation where you send them.'], ['patrol', 'Patrol town', `Up to ${DUTY_CAP} soldiers walk the streets in pairs.`], ['garrison', 'Garrison', `Up to ${DUTY_CAP} soldiers guard doors, gates and towers.`]] as [Orders, string, string][]).map(([k, n, d]) =>
        <button key={k} title={d} className={`btn text-sm !px-1 ${(bat.orders ?? 'formation') === k ? 'btn-gold' : ''}`} onClick={() => editBattalion(bat.id, { orders: k })}>{n}</button>)}</div>
      <p className="text-xs opacity-80">{bat.orders === 'patrol' ? `Patrolling: ${Math.min(DUTY_CAP, n)} soldiers roam the town in pairs and chase down thieves.` : bat.orders === 'garrison' ? `On guard: ${Math.min(DUTY_CAP, n)} soldiers stand watch at doors, gates and towers.` : 'Soldiers on patrol or garrison duty keep thieves away.'}{bat.orders && bat.orders !== 'formation' && n > DUTY_CAP ? ` The other ${n - DUTY_CAP} stay in formation.` : ''}</p>
    </Section>
    <Section title="Formation">
      <div className="flex gap-1">{(['line', 'block', 'column'] as Formation[]).map((f) => <button key={f} className={`btn flex-1 capitalize ${bat.formation === f ? 'btn-gold' : ''}`} onClick={() => editBattalion(bat.id, { formation: f })}>{f}</button>)}</div>
      <div className="flex gap-2">
        <button className="btn btn-gold flex-1" onClick={() => { setUI({ selBat: bat.id, panel: mobile() ? null : 'army' }); focusOn(bat.x, bat.y - 20); }}>March (tap the map)</button>
        <button className="btn flex-1" onClick={() => promoteAll(bat.id)}>Promote eligible</button>
      </div>
    </Section>
    <Section title="Composition">
      {composition(s, bat.id).map(([c, ranks]) => <div key={c} className="flex items-center gap-2 text-sm"><Soldier cls={c} rank={ranks.findLastIndex((x) => x > 0)} scale={2} /><b className="flex-1">{TROOPS[c].name}</b>
        <span className="flex gap-1 flex-wrap justify-end">{ranks.map((x, r) => x ? <span key={r} className="inline-flex items-center gap-0.5" title={RANKS[r].name}><Insignia kind="soldier" rank={r} scale={1.5} />{x}</span> : null)}</span></div>)}
      {!squads.length && <p className="text-sm italic">Empty. Recruit soldiers into this battalion.</p>}
    </Section>
    {Array.from({ length: Math.ceil(squads.length / SQUADS_PER_COMPANY) }, (_, ci) => <Section key={ci} title={`${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][ci] ?? ci + 1} Company`}>
      {squads.slice(ci * SQUADS_PER_COMPANY, (ci + 1) * SQUADS_PER_COMPANY).map((q, j) => { const nr = RANKS[q.rank + 1], why = canPromote(s, q);
        return <div key={q.id} className="text-sm border-b border-black/10 pb-1 space-y-0.5">
          <div className="flex items-center gap-2"><Soldier cls={q.cls} rank={q.rank} scale={2} /><span className="flex-1"><b>Squad {ci * SQUADS_PER_COMPANY + j + 1}</b>: {q.count} {TROOPS[q.cls].name} · <Insignia kind="soldier" rank={q.rank} scale={1.5} /> {RANKS[q.rank].name}</span></div>
          {nr && <div className="flex items-center gap-2"><span className="text-xs w-24">XP {Math.floor(q.xp)}/{nr.xp}</span><div className="flex-1"><Bar value={q.xp} max={nr.xp} color="bg-moss" /></div></div>}
          <div className="flex gap-1 flex-wrap">
            <button className="btn !py-0 text-xs" disabled={!canAfford(s.res, { gold: q.count * 2 })} onClick={() => drill(q.id)}>Drill ({q.count * 2}g)</button>
            {nr && <button className="btn !py-0 text-xs btn-gold" disabled={!!why} title={why ?? ''} onClick={() => promote(q.id)}>Promote → {nr.name} ({promoteCost(q).renown}r){why ? `: ${why}` : ''}</button>}
            {s.battalions.length > 1 && <select className="inp !w-auto !py-0 text-xs" value={q.bat} onChange={(e) => transferSquad(q.id, e.target.value)}>{s.battalions.map((x) => <option key={x.id} value={x.id}>{x.id === q.bat ? 'Transfer to…' : x.name}</option>)}</select>}
          </div>
        </div>; })}
    </Section>)}
    {s.battalions.length > 1 && <button className="btn btn-red w-full" onClick={() => { if (confirm('Disband this battalion? Its squads join another battalion.')) { disbandBattalion(bat.id); setUI({ selBat: null }); } }}>Disband battalion</button>}
  </div>;
}

function Ranks() {
  const [cls, setCls] = useState<TClass>('swordsman');
  return <div className="space-y-2 text-sm">
    <p>Soldiers gain experience every minute you study (+ training fields, drills and commander bonuses). Promote them with renown once they have enough experience.</p>
    <select className="inp" value={cls} onChange={(e) => setCls(e.target.value as TClass)}>{TCLASSES.map((c) => <option key={c} value={c}>{TROOPS[c].name}</option>)}</select>
    <div className="flex justify-between card p-2">{RANKS.map((r, i) => <div key={r.name} className="text-center text-xs"><Soldier cls={cls} rank={i} scale={3} /><div><Insignia kind="soldier" rank={i} /></div>{r.name}</div>)}</div>
    {RANKS.map((r, i) => <div key={r.name} className="flex justify-between border-b border-black/10"><span><Insignia kind="soldier" rank={i} scale={1.5} /> {r.name}</span><span>{i ? `${r.xp} XP · ${r.renown} renown/soldier${r.req ? ` · ${r.req.label}` : ''}` : 'on recruitment'}</span></div>)}
    <h3 className="font-bold pt-2">Officers</h3>
    {OFFICERS.map((o, i) => <div key={o.name} className="flex justify-between border-b border-black/10"><span><Insignia kind="officer" rank={i} scale={1.5} /> {o.name}</span><span>{o.size}+ soldiers · {o.renown} renown · +{Math.round(o.bonus * 100)}% XP</span></div>)}
  </div>;
}

/** Inspector for a single soldier clicked on the map. */
export function SoldierCard() {
  const s = useGame(), ui = useUI();
  if (!ui.inspect) return null;
  const q = s.squads.find((x) => x.id === ui.inspect!.squad); if (!q) return null;
  const bat = s.battalions.find((b) => b.id === q.bat)!, list = s.squads.filter((x) => x.bat === q.bat).sort((a, b) => TCLASSES.indexOf(a.cls) - TCLASSES.indexOf(b.cls) || b.rank - a.rank);
  const si = list.indexOf(q), nr = RANKS[q.rank + 1];
  return <div className="fixed z-40 left-2 bottom-20 md:bottom-4 md:left-4 panel pop p-3 w-72 text-sm space-y-1">
    <div className="flex gap-3 items-center"><Soldier cls={q.cls} rank={q.rank} scale={4} f={0} />
      <div className="flex-1"><b className="text-base">{nameFor(q.id + ui.inspect.idx)}</b><div>{TROOPS[q.cls].name}</div><div className="flex items-center gap-1"><Insignia kind="soldier" rank={q.rank} /> {RANKS[q.rank].name}</div></div>
      <button className="btn !px-2 !py-0 self-start" aria-label="close" onClick={() => setUI({ inspect: null })}>✕</button></div>
    <div>Squad {si + 1}, {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.floor(si / SQUADS_PER_COMPANY)] ?? ''} Company, {bat.name}</div>
    <div>Commander: {OFFICERS[bat.commander.rank].name} {bat.commander.name}</div>
    {nr ? <><div>Experience {Math.floor(q.xp)} / {nr.xp}</div><Bar value={q.xp} max={nr.xp} color="bg-moss" /></> : <div>Highest rank achieved.</div>}
  </div>;
}
