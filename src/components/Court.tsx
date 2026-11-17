'use client';
import { useGame, useUI, mobile } from './hooks.ts';
import { Cost, Section, Bar } from './Cost.tsx';
import { canAfford } from '../lib/rewards.ts';
import { setUI } from '../game/ui.ts';
import { FACTIONS, FACTION_IDS, DECREES, courtOf, courtFx, mood, type DecreeId } from '../lib/politics.ts';
import { SETTLE, settleCap, foundCost, upgradeCost, upgradeStage, settlementFx } from '../lib/expansion.ts';
import { setDecree, answerPetition, foundSettlement, upgradeSettlement, sitesOf, knownSites, landCap } from '../lib/realmActions.ts';
import { leagues, isKnown } from '../lib/war.ts';
import type { Site } from '../lib/expansion.ts';

const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
const barCol = (v: number) => (v >= 70 ? 'bg-moss' : v >= 40 ? 'bg-gold' : 'bg-blood');

/** The four estates, your decrees and the petitions before you. */
export function CourtPanel() {
  const s = useGame(), c = courtOf(s.world), fx = courtFx(c);
  return <div className="space-y-3">
    <p className="text-sm">Rule well and the estates of the realm serve you; anger them and they make trouble. Your decrees, your answers to their petitions, your studies and your victories all sway them.</p>
    <Section title="The estates">
      {FACTION_IDS.map((f) => { const v = c.approval[f];
        return <div key={f} className="text-sm space-y-0.5">
          <div className="flex justify-between"><b>{FACTIONS[f].name}</b><span className="text-xs capitalize">{mood(v)} · {Math.round(v)}</span></div>
          <Bar value={v} max={100} color={barCol(v)} />
          <div className="text-xs opacity-75">{FACTIONS[f].desc} {v >= 70 ? <b className="text-moss">{FACTIONS[f].high}</b> : v < 30 ? <b className="text-blood">{FACTIONS[f].low}</b> : <span>At 70: {FACTIONS[f].high.toLowerCase()}</span>}</div>
        </div>; })}
    </Section>
    <Section title="Decrees">
      {(Object.keys(DECREES) as DecreeId[]).map((id) => <div key={id} className="space-y-0.5">
        <div className="text-sm font-bold">{DECREES[id].name}</div>
        <div className="flex gap-1">{Object.entries(DECREES[id].options).map(([k, o]) => <button key={k} title={o.desc} className={`btn flex-1 text-xs !px-1 ${c.decrees[id] === k ? 'btn-gold' : ''}`} onClick={() => setDecree(id, k)}>{o.name}</button>)}</div>
        <div className="text-xs opacity-75">{DECREES[id].options[c.decrees[id]]?.desc}</div>
      </div>)}
      <p className="text-xs opacity-70">Now: gold {pct(fx.gold)}, renown {pct(fx.renown)}{fx.recruit ? `, recruits ${pct(-fx.recruit)} cost` : ''}{fx.cap ? `, army capacity ${pct(fx.cap)}` : ''}{fx.trade ? `, trade ${pct(fx.trade)}` : ''}{fx.command ? `, commanders +${fx.command}` : ''}{fx.crime !== 1 ? `, crime ×${fx.crime}` : ''}. Each decree can change once a day.</p>
    </Section>
    <Section title={`Petitions (${c.petitions.length})`}>
      {!c.petitions.length && <p className="text-sm italic">No one waits on you today. Petitions arrive from time to time; answer within three days.</p>}
      {c.petitions.map((p) => <div key={p.id} className="border-l-4 border-gold pl-2 space-y-1 text-sm">
        <div><b>{p.title}</b> <span className="text-xs opacity-70">from the {FACTIONS[p.faction].name}</span></div>
        <div className="text-xs">{p.text}</div>
        <div className="flex items-center gap-2 text-xs">Cost: <Cost cost={p.cost} have={s.res} /></div>
        <div className="flex gap-1"><button className="btn btn-gold !py-0 text-xs flex-1" disabled={!canAfford(s.res, p.cost)} onClick={() => answerPetition(p.id, true)}>Grant</button><button className="btn !py-0 text-xs flex-1" onClick={() => answerPetition(p.id, false)}>Refuse</button></div>
      </div>)}
    </Section>
  </div>;
}

/** Lands to settle and grow: a ring round your castle, and more along the roads to the other kingdoms. */
export function LandsPanel() {
  const s = useGame(), ui = useUI(), sites = knownSites(s), all = sitesOf(s), held = s.world.settlements ?? [], cap = landCap(s), fx = settlementFx(held, all);
  const card = (site: Site) => { const st = held.find((x) => x.site === site.id), d = SETTLE[site.kind], by = site.road ? s.world.rivals.find((r) => r.id === site.road) : null;
    const cost = st ? (st.level < 3 ? upgradeCost(site.kind, st.level) : null) : foundCost(site.kind, held.length, site);
    const why = st ? (st.level >= 3 ? 'At its greatest' : s.stage < upgradeStage(st.level) ? `Needs stage ${upgradeStage(st.level)}` : null) : held.length >= cap ? `Your realm can hold ${cap} now` : null;
    return <div key={site.id} className={`card p-2 text-sm space-y-1 ${ui.selRival === site.id ? 'ring-2 ring-gold' : ''} ${!st && held.length >= cap ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-2"><b className="flex-1">{site.name}</b><span className="text-xs">{st ? `${d.levels[st.level - 1]} (level ${st.level})` : `Unclaimed · ${d.name.toLowerCase()} site`}</span></div>
      <div className="text-xs opacity-80">{d.desc}{by ? ` On the road to ${isKnown(by) ? by.name : 'unknown lands'}, ${leagues(site).toFixed(1)} leagues out.` : ''}</div>
      <div className="flex items-center gap-2">{cost ? <span className="flex-1"><Cost cost={cost} have={s.res} /></span> : <span className="flex-1" />}
        <button className="btn !py-0 text-xs" onClick={() => setUI({ view: 'land', visit: site.id, panel: mobile() ? null : ui.panel })}>Visit</button>
        {cost && <button className="btn btn-gold !py-0 text-xs" disabled={!!why || !canAfford(s.res, cost)} title={why ?? ''} onClick={() => (st ? upgradeSettlement(site.id) : foundSettlement(site.id))}>{st ? `Grow to ${d.levels[st.level]}` : 'Found'}</button>}</div>
      {why && <div className="text-xs text-blood">{why}</div>}
    </div>; };
  const ring = sites.filter((x) => !x.road), road = sites.filter((x) => x.road).sort((a, b) => leagues(a) - leagues(b)), hidden = all.filter((x) => x.road).length - road.length;
  return <div className="space-y-3">
    <p className="text-sm">Claim lands round your castle and along the roads. Settlements make every study session pay more and feed a bigger army. You can hold <b>{held.length}/{cap}</b> (by your castle's stage, plus one for each vassal); lands farther out cost more to settle.</p>
    {held.length > 0 && <p className="text-xs">Your lands give: {fx.gold ? `gold ${pct(fx.gold)} ` : ''}{fx.wood ? `wood ${pct(fx.wood)} ` : ''}{fx.stone ? `stone ${pct(fx.stone)} ` : ''}{fx.renown ? `renown ${pct(fx.renown)} ` : ''}{fx.cap ? `army +${fx.cap}` : ''}</p>}
    <button className="btn w-full" onClick={() => setUI({ view: 'world' })}>See them on the world map</button>
    <div className="font-title text-xl">Round your castle</div>
    {ring.map(card)}
    <div className="font-title text-xl">Along the roads</div>
    {road.map(card)}
    {hidden > 0 && <p className="text-xs opacity-75">{hidden} more land{hidden > 1 ? 's lie' : ' lies'} beyond your maps. Grow your castle, found settlements or send explorers to chart them.</p>}
  </div>;
}
