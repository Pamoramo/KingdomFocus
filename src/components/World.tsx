'use client';
import { useState } from 'react';
import { useGame, useUI, useNow, clock, fmt, hex, mobile } from './hooks.ts';
import { BIOME_NAME, CASTLE_NAME, biomeOf, realmLayout } from '../lib/realms.ts';
import { setUI, toggleWorldView } from '../game/ui.ts';
import { type GameState } from '../lib/state.ts';
import { type Res, canAfford } from '../lib/rewards.ts';
import { TACTICS, TERRAINS, tacticLock, sidePower, type Tactic, type Terrain } from '../lib/battle.ts';
import { ENGINES, ENGINE_IDS, NO_ENGINES, SUPPLY_COST, SIEGE_DAY_MIN, PERSONALITY_TEXT, relationLabel, tradeQuote, canTrade, giftRelation, consumption, surrenderChance, bombardPerDay, likelihood, LOAN_MIN, isKnown, tierOf, leagues, reachOf, TIER, type Tier, fieldSpoils, conquestSpoils, vassalGold, vassalRenown, VASSAL_GOLD_MAX, type Rival, type Engines, type Stance } from '../lib/war.ts';
import * as WA from '../lib/warActions.ts';
import { courtOf, courtFx } from '../lib/politics.ts';
import { engineArt } from '../game/art/war.ts';
import { hdify, HD } from '../game/art/hd.ts';
import { withoutOutline } from '../game/art/px.ts';
import { Sprite, Icon } from './Icon.tsx';
import { Cost, Section, Tabs, Bar } from './Cost.tsx';
import { Banner } from './Army.tsx';

const EngineImg = ({ e, scale = 1 }: { e: keyof Engines; scale?: number }) => <Sprite id={`eng-${e}`} scale={scale / HD} draw={() => hdify(withoutOutline(() => engineArt(e)))} />;
const strengthText = (mine: number, theirs: number) => { const k = theirs / Math.max(1, mine); return k > 3 ? 'Far stronger than you' : k > 1.4 ? 'Stronger than you' : k > 0.7 ? 'About your strength' : k > 0.35 ? 'Weaker than you' : 'Much weaker than you'; };
const relColor = (r: number) => (r >= 25 ? 'bg-moss' : r > -25 ? 'bg-gold' : 'bg-blood');
const STATUS: Record<string, string> = { neutral: 'Neutral', ally: 'Allied', war: 'At war', vassal: 'Your vassal' };

export function WorldPanel() {
  const s = useGame(), ui = useUI(), w = s.world;
  const [tab, setTab] = useState<'realms' | 'campaign' | 'works' | 'reports'>(w.campaign || w.threat ? 'campaign' : 'realms');
  const sel = w.rivals.find((r) => r.id === ui.selRival);
  return <div className="space-y-3">
    <div className="flex gap-2"><button className="btn flex-1" onClick={() => setUI({ view: ui.view === 'world' ? 'kingdom' : 'world' })}>{ui.view === 'world' ? 'Return to your kingdom' : 'Open the world map'}</button>
      {w.campaign && <button className="btn btn-gold flex-1" onClick={() => setUI({ view: 'rival', visit: w.campaign!.target, panel: mobile() ? null : 'world' })}>Watch the siege</button>}</div>
    {w.threat && <Defense />}
    <Intelligence />
    {w.inbox.length > 0 && <Inbox />}
    <OnTheRoad />
    <LentOut />
    <Tabs value={tab} onChange={setTab} items={[['realms', 'Realms'], ['campaign', w.campaign ? `Siege · day ${w.campaign.day}` : 'War'], ['works', 'Siege works'], ['reports', 'Reports']]} />
    {tab === 'realms' && (sel ? <RivalDetail r={sel} /> : <Realms />)}
    {tab === 'campaign' && <CampaignTab />}
    {tab === 'works' && <Works />}
    {tab === 'reports' && <Reports />}
  </div>;
}

/** Small bandit camps along the roads: easy fights with a small purse, and practice for green troops. */
function Outposts() {
  const s = useGame(), ui = useUI(), list = s.world.outposts ?? [], away = WA.awayBats(s), home = s.battalions.filter((b) => !away.has(b.id) && s.squads.some((q) => q.bat === b.id));
  const [bat, setBat] = useState(''), pick = home.some((b) => b.id === bat) ? bat : home[0]?.id ?? '';
  const raiding = new Set((s.world.journeys ?? []).filter((j) => j.kind === 'raid').map((j) => (j.data as { outpost?: string })?.outpost));
  if (!list.length) return null;
  return <Section title="Bandit outposts">
    <p className="text-xs opacity-75">Outlaw camps along the roads. Clear them for a small purse; new ones spring up over time.</p>
    {list.map((o) => { const p = sidePower(WA.unitsOf(s.squads.filter((q) => q.bat === pick)));
      return <div key={o.id} className={`border-b border-black/10 pb-1.5 space-y-1 text-sm ${ui.selRival === o.id ? 'bg-gold/20 -mx-1 px-1' : ''}`}>
        <div className="flex items-center gap-2"><b className="flex-1">{o.name}</b><span className="text-xs">{pick ? `${strengthText(Math.max(1, p), o.power)} (≈${o.power})` : `strength ≈${o.power}`}</span></div>
        <div className="flex items-center gap-2 text-xs">Spoils: <Cost cost={o.loot} plus /></div>
        {raiding.has(o.id) ? <div className="text-xs italic">Your soldiers are on their way.</div> : <div className="flex gap-1">
          <select className="inp !py-0 text-xs" value={pick} onChange={(e) => setBat(e.target.value)}>{home.length ? home.map((b) => <option key={b.id} value={b.id}>{b.name} (strength {fmt(sidePower(WA.unitsOf(s.squads.filter((q) => q.bat === b.id))))})</option>) : <option value="">No battalion at home</option>}</select>
          <button className="btn btn-red !py-0 text-xs" disabled={!pick} onClick={() => WA.raidOutpost(o.id, pick)}>Raid</button></div>}
      </div>; })}
  </Section>;
}

function Realms() {
  const s = useGame(), mine = WA.myPower(s);
  return <div className="space-y-2">
    <Outposts />
    <Dominion />
    <p className="text-sm">Your army's strength: <b>{fmt(mine)}</b>. Trade, gifts and sending troops build trust. At 60 relations a kingdom will ally with you. The farther a kingdom, the less it has to do with you.</p>
    {(['neighbour', 'distant', 'far'] as Tier[]).map((t) => { const list = s.world.rivals.filter((r) => isKnown(r) && tierOf(r) === t).sort((a, b) => leagues(a) - leagues(b)); return list.length ? <div key={t} className="space-y-1.5">
      <div className="text-sm font-bold pt-1">{TIER[t].name}s <span className="text-xs font-normal opacity-70">{TIER[t].desc}</span></div>
    {list.map((r) => <button key={r.id} className="card p-2 w-full text-left flex gap-2 items-center" onClick={() => setUI({ selRival: r.id })}>
      <Banner color={r.color} emblem={r.emblem} scale={1.5} />
      <span className="flex-1 min-w-0"><b>{r.name}</b> <span className="text-xs opacity-70">{STATUS[r.status]}{r.bandits ? ' · outlaws' : ` · ${r.personality}`}</span>
        <span className="block text-xs">{strengthText(mine, r.power)} · castle level {r.level}</span>
        {!r.bandits && <span className="flex items-center gap-2 text-xs"><span className="w-24 h-2 bg-black/15 rounded-sm overflow-hidden"><span className={`block h-full ${relColor(r.relation)}`} style={{ width: `${(r.relation + 100) / 2}%` }} /></span>{relationLabel(r.relation)} ({r.relation})</span>}</span>
      <span className="text-xs opacity-70 whitespace-nowrap">{leagues(r).toFixed(1)} lg</span>
    </button>)}</div> : null; })}
  </div>;
}
/** How much of the world you know and hold, and the expedition that pushes your maps outward. */
function Dominion() {
  const s = useGame(), all = s.world.rivals.filter((r) => !r.bandits), known = all.filter(isKnown), vassals = all.filter((r) => r.status === 'vassal').length, allies = all.filter((r) => r.status === 'ally').length;
  const next = WA.nextUncharted(s), cost = WA.expeditionCost(s), out = (s.world.journeys ?? []).find((j) => j.kind === 'explore');
  return <Section title="The known world" right={<button className="btn !py-0 text-xs" onClick={() => { setUI({ view: 'world' }); setTimeout(toggleWorldView, 300); }}>Whole map</button>}>
    <div className="grid grid-cols-3 gap-1 text-center text-xs">
      <div><b className="text-lg block leading-none">{known.length}/{all.length}</b>realms charted</div><div><b className="text-lg block leading-none">{allies}</b>allies</div><div><b className="text-lg block leading-none">{vassals}/{all.length}</b>vassals</div></div>
    <Bar value={known.length} max={all.length} color="bg-moss" />
    <p className="text-xs opacity-75">Your maps reach {reachOf(s.stage, (s.world.settlements ?? []).length).toFixed(2)} leagues. They grow as your castle grows and you found settlements; allies and vassals share their maps.</p>
    {next ? out ? <p className="text-sm italic">Your explorers are on their way into uncharted lands.</p> : <div className="flex items-center gap-2 text-sm"><span className="flex-1">Send an expedition beyond your maps: <Cost cost={cost} have={s.res} /></span><button className="btn btn-gold !py-0" disabled={!canAfford(s.res, cost)} onClick={() => WA.sendExpedition()}>Explore</button></div>
      : <p className="text-sm">Your maps show the whole world.</p>}
  </Section>;
}

function RivalDetail({ r }: { r: Rival }) {
  const s = useGame(), mine = WA.myPower(s), [give, setGive] = useState<keyof Res>('gold'), [want, setWant] = useState<keyof Res>('stone'), [amt, setAmt] = useState(200), [giftAmt, setGift] = useState(200), [bat, setBat] = useState('');
  const q = tradeQuote(r, give, amt, want, courtFx(courtOf(s.world)).trade), tradeLock = canTrade(r, s.world), away = WA.awayBats(s), homeBats = s.battalions.filter((b) => !away.has(b.id));
  return <div className="space-y-2">
    <button className="btn !py-0" onClick={() => setUI({ selRival: null })}>← All realms</button>
    <div className="card p-2 flex gap-3"><Banner color={r.color} emblem={r.emblem} scale={3} />
      <div className="text-sm flex-1"><h3 className="font-title text-3xl leading-none">{r.name}</h3><div>Ruled by {r.ruler}</div><div className="opacity-80">{r.bandits ? 'Outlaws who raid the borderlands. They will not parley.' : PERSONALITY_TEXT[r.personality]}</div>
        <div>{STATUS[r.status]} · {strengthText(mine, r.power)} (≈{fmt(r.power)}) · walls {r.wallMax}</div>
        <div>{BIOME_NAME[biomeOf(s.world, r)]} · {CASTLE_NAME[realmLayout(s.world, r).type]} · {realmLayout(s.world, r).wealth} realm</div>
        <div className="text-xs opacity-80">{TIER[tierOf(r)].name}, {leagues(r).toFixed(1)} leagues away: {TIER[tierOf(r)].desc}</div>
        <button className="btn btn-gold !py-0.5 mt-1" onClick={() => setUI({ view: 'rival', visit: r.id, panel: mobile() ? null : 'world' })}>Visit {r.name}</button>
        {!r.bandits && <div className="flex items-center gap-2"><div className="flex-1"><Bar value={r.relation + 100} max={200} color={relColor(r.relation)} /></div>{relationLabel(r.relation)} {r.relation}</div>}</div></div>
    {r.status === 'vassal' ? <p className="text-sm">{r.name} pays you tribute: +{Math.round(vassalGold(r) * 100)}% gold and +{(vassalRenown(r) * 100).toFixed(1)}% renown from every study session (a greater realm pays more) (all vassals together give at most +{Math.round(VASSAL_GOLD_MAX * 100)}% gold).</p> : <>
      {r.status === 'war' && <Spoils r={r} />}
      {!r.bandits && r.status !== 'war' && <Section title="Trade">
        <div className="flex flex-wrap gap-1 items-center text-sm">Give <input type="number" className="inp !w-20" min={10} value={amt} onChange={(e) => setAmt(+e.target.value)} />
          <select className="inp !w-auto" value={give} onChange={(e) => setGive(e.target.value as keyof Res)}>{(['gold', 'wood', 'stone'] as const).map((k) => <option key={k}>{k}</option>)}</select> for
          <select className="inp !w-auto" value={want} onChange={(e) => setWant(e.target.value as keyof Res)}>{(['gold', 'wood', 'stone'] as const).map((k) => <option key={k}>{k}</option>)}</select></div>
        <div className="flex items-center justify-between gap-2 text-sm"><span>You receive <b>{q.got} {want}</b> · relations +{q.rel}</span><button className="btn btn-gold" disabled={!!tradeLock || give === want} onClick={() => WA.trade(r.id, give, amt, want)}>Trade</button></div>
        {tradeLock && <div className="text-xs text-blood">{tradeLock}</div>}
      </Section>}
      {!r.bandits && <Section title="Gifts & aid">
        <div className="flex items-center gap-2 text-sm"><input type="number" className="inp !w-24" min={50} value={giftAmt} onChange={(e) => setGift(+e.target.value)} /> gold → relations +{giftRelation(r, giftAmt)}<button className="btn ml-auto" onClick={() => WA.gift(r.id, giftAmt)}>Send gift</button></div>
        {r.status !== 'war' && <div className="flex items-center gap-2 text-sm"><select className="inp" value={bat} onChange={(e) => setBat(e.target.value)}><option value="">Choose a battalion to lend…</option>{homeBats.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <button className="btn" disabled={!bat} onClick={() => WA.sendAid(r.id, bat)}>Send troops</button></div>}
        {s.world.loans.filter((l) => l.rival === r.id).map((l) => <div key={l.bat} className="text-xs"><b>{s.battalions.find((b) => b.id === l.bat)?.name}</b> serving here: {Math.max(0, Math.ceil(l.leftMin))} of {LOAN_MIN} min of study left <Bar value={LOAN_MIN - l.leftMin} max={LOAN_MIN} color="bg-moss" /></div>)}
        <p className="text-xs opacity-70">Loaned troops return after {LOAN_MIN} minutes of study, with experience. Lending soldiers builds trust fastest.</p>
      </Section>}
      <Section title="Statecraft">
        <div className="flex flex-wrap gap-2">
          {!r.bandits && r.status === 'neutral' && <button className="btn btn-gold" onClick={() => WA.proposeAlliance(r.id)}>Propose alliance {r.relation < 60 ? `(${r.relation}/60)` : ''}</button>}
          {r.status === 'ally' && <button className="btn" onClick={() => confirm(`End the alliance with ${r.name}?`) && WA.breakAlliance(r.id)}>End alliance</button>}
          {r.status !== 'war' && <button className="btn btn-red" onClick={() => confirm(`Declare war on ${r.name}? Their friends will think less of you${r.status === 'ally' ? ', and betraying an ally angers everyone' : ''}.`) && WA.declareWar(r.id)}>Declare war</button>}
          {r.status === 'war' && !r.bandits && <button className="btn" onClick={() => WA.offerPeace(r.id, r.beaten ? 0 : 100 * r.level)}>Offer peace{r.beaten ? '' : ` (${100 * r.level} gold)`}</button>}
          {r.status === 'war' && <button className="btn btn-gold" onClick={() => setUI({ selRival: r.id, panel: 'world' })}>Plan a campaign in the War tab</button>}
        </div>
        {r.friends.length > 0 && <p className="text-xs">Friends: {r.friends.map((f) => s.world.rivals.find((x) => x.id === f)?.name).join(', ')}</p>}
        {r.foes.length > 0 && <p className="text-xs">Rivals: {r.foes.map((f) => s.world.rivals.find((x) => x.id === f)?.name).join(', ')}</p>}
      </Section>
    </>}
  </div>;
}

/** Reports of invasions that may or may not come: how likely, when, and what might stop them. */
function Intelligence() {
  const s = useGame(), list = s.world.warnings ?? [];
  if (!list.length) return null;
  return <Section title="Intelligence">
    {list.map((wr) => { const r = s.world.rivals.find((x) => x.id === wr.rival); if (!r) return null;
      return <div key={wr.id} className="border-l-4 border-blood/70 pl-2 space-y-1">
        <div className="text-sm">{wr.text}</div>
        <div className="flex items-center gap-2 text-xs"><span className="w-28"><Bar value={wr.chance * 100} max={100} color={wr.chance >= 0.5 ? 'bg-blood' : 'bg-gold'} /></span><b>{likelihood(wr.chance)} ({Math.round(wr.chance * 100)}%)</b><span className="opacity-70">expected by {wr.due}</span></div>
        <div className="flex flex-wrap gap-1"><button className="btn !py-0 text-xs" onClick={() => setUI({ selRival: r.id })}>Appease {r.name} (gifts, trade, peace)</button><button className="btn !py-0 text-xs" onClick={() => setUI({ panel: 'army' })}>Set a garrison</button></div>
      </div>; })}
    <p className="text-xs opacity-70">Not every report is true. Better relations (above −20) or an alliance usually stop an attack; strong walls and a military parade make them think twice.</p>
  </Section>;
}

/** What a war against this realm pays, step by step, so the stakes are clear before you march. */
function Spoils({ r, phase }: { r: Rival; phase?: 'march' | 'field' | 'siege' }) {
  const s = useGame(), vassals = s.world.rivals.filter((x) => x.status === 'vassal').length;
  const tribute = s.world.rivals.filter((x) => x.status === 'vassal').reduce((t, x) => t + vassalGold(x), 0), goldNow = Math.min(VASSAL_GOLD_MAX, tribute), goldThen = Math.min(VASSAL_GOLD_MAX, tribute + vassalGold(r)), pct = (x: number) => `${Math.round(x * 100)}%`;
  const friends = r.friends.map((f) => s.world.rivals.find((x) => x.id === f)?.name).filter(Boolean);
  const step = (done: boolean, title: string, body: React.ReactNode) => <div className={`flex gap-2 text-sm ${done ? 'opacity-50 line-through' : ''}`}><span className="w-4 shrink-0">{done ? '✓' : '•'}</span><div className="flex-1"><b>{title}</b> {body}</div></div>;
  return <Section title="Spoils of war">
    {step(phase === 'siege', 'Win the field battle:', <Cost cost={fieldSpoils(r)} plus />)}
    {step(false, `Take ${r.name} (assault or surrender):`, <Cost cost={conquestSpoils(r)} plus />)}
    {step(false, 'It becomes your vassal:', <>study gold +{pct(goldThen - goldNow)} (vassal tribute {pct(goldNow)} → {pct(goldThen)}, max {pct(VASSAL_GOLD_MAX)}) and +{(vassalRenown(r) * 100).toFixed(1)}% renown on every session, for good. Spoils and tribute grow with the strength of the realm.</>)}
    <p className="text-xs opacity-75">Your engines and unused supplies come home with the army. Three conquests earn the title of Emperor.{friends.length ? ` ${friends.join(', ')} will think less of you (−20 relations).` : ''}</p>
  </Section>;
}

function TacticPicker({ units, terrain, commander, onPick, label }: { units: ReturnType<typeof WA.unitsOf>; terrain: Terrain; commander: number; onPick: (t: Tactic) => void; label: string }) {
  const [t, setT] = useState<Tactic>('assault');
  return <div className="space-y-1.5">
    <div className="text-xs">{TERRAINS[terrain]}</div>
    <div className="grid grid-cols-2 gap-1">{(Object.keys(TACTICS) as Tactic[]).map((k) => { const lock = tacticLock(units, k, terrain, commander);
      return <button key={k} disabled={!!lock} title={lock ?? TACTICS[k].desc} onClick={() => setT(k)} className={`card p-1.5 text-left text-xs ${t === k ? 'ring-2 ring-gold bg-gold/30' : ''} ${lock ? 'opacity-50' : ''}`}><b className="text-sm">{TACTICS[k].name}</b><br />{lock ?? TACTICS[k].desc}</button>; })}</div>
    <button className="btn btn-gold w-full text-lg" onClick={() => onPick(t)}>{label}</button>
  </div>;
}

/** Send another battalion from home to the siege; it marches the whole road. */
function Reinforce() {
  const s = useGame(), away = WA.awayBats(s), home = s.battalions.filter((b) => !away.has(b.id) && s.squads.some((q) => q.bat === b.id)), [bat, setBat] = useState('');
  const coming = (s.world.journeys ?? []).filter((j) => j.kind === 'reinforce');
  const pick = home.some((b) => b.id === bat) ? bat : home[0]?.id ?? '';
  return <Section title="Reinforcements">
    <p className="text-xs opacity-75">New recruits for a battalion at the siege, and any battalion you send, have to march there before they can fight.</p>
    {coming.map((j) => <div key={j.id} className="text-xs">• {j.label}</div>)}
    {home.length > 0 && <div className="flex gap-1"><select className="inp !py-0 text-sm" value={pick} onChange={(e) => setBat(e.target.value)}>{home.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <button className="btn" disabled={!pick} onClick={() => WA.reinforce(pick)}>Send to the siege</button></div>}
  </Section>;
}

function CampaignTab() {
  const s = useGame(), w = s.world, c = w.campaign;
  if (!c) return <PlanCampaign />;
  const r = w.rivals.find((x) => x.id === c.target)!, squads = WA.campaignSquads(s), units = WA.unitsOf(squads), soldiers = squads.reduce((a, q) => a + q.count, 0);
  const cmd = Math.max(0, ...s.battalions.filter((b) => c.battalions.includes(b.id)).map((b) => b.commander.rank));
  return <div className="space-y-2">
    <div className="card p-2 text-sm"><b>Campaign against {r.name}</b> · {soldiers} soldiers{c.allies.length ? ` · ${c.allies.length} allied host${c.allies.length > 1 ? 's' : ''}` : ''}</div>
    {c.phase === 'march' ? <Section title="On the march"><p className="text-sm">Your host is marching on {r.name}. When it arrives you will face their army in the field. Follow it on the world map.</p></Section> : c.phase === 'field' ? <Section title={`${r.name}'s army takes the field`}>
      <p className="text-sm">Before you can besiege the castle you must defeat their field army (≈{fmt(r.power * 0.6)} strength vs your {fmt(sidePower(units))}). Choose your battle plan.</p>
      <TacticPicker units={units} terrain={r.terrain} commander={cmd} onPick={WA.fieldBattle} label="Give battle" />
    </Section> : <>
      <Section title={`Siege of ${r.name} · day ${c.day}`}>
        <div className="text-sm">Study to advance the siege: every {SIEGE_DAY_MIN} verified minutes is one siege day.</div>
        <div className="text-xs">Next day: {Math.floor(c.progressMin)}/{SIEGE_DAY_MIN} min</div><Bar value={c.progressMin} max={SIEGE_DAY_MIN} color="bg-moss" />
        <div className="text-xs">Walls {c.wallHp}/{c.wallMax}</div><Bar value={c.wallHp} max={c.wallMax} color="bg-blood" />
        <div className="grid grid-cols-2 gap-1 text-sm">
          <span>Garrison ≈{fmt(c.garrison)}</span><span>Their morale {Math.round(c.garrisonMorale)}%</span>
          <span>Your morale {Math.round(c.morale)}%</span><span>Supplies {Math.floor(c.supplies)} ({Math.floor(c.supplies / consumption(soldiers))} days)</span>
        </div>
        <div className="text-xs">Bombardment: {bombardPerDay(c.engines)} wall damage per day.</div>
      </Section>
      <Section title="Siege orders (applied each siege day)">
        <div className="grid grid-cols-3 gap-1">{([['bombard', 'Bombard', 'Engines batter the walls'], ['blockade', 'Blockade', 'Starve the garrison'], ['sap', 'Sap walls', 'Mine under the walls (Engineering)']] as [Stance, string, string][]).map(([k, n, d]) => <button key={k} title={d} className={`btn text-sm ${c.stance === k ? 'btn-gold' : ''}`} onClick={() => WA.setStance(k)}>{n}</button>)}</div>
        <div className="flex gap-2 items-center text-sm"><span className="flex-1">Supplies at home: {Math.floor(w.supplies)}</span><button className="btn" disabled={w.supplies < 1} onClick={() => WA.sendSupplies(w.supplies)}>Send supply train</button></div>
      </Section>
      <Section title="Storm the walls">
        <p className="text-xs">The weaker the walls, the cheaper the assault. Rams and siege towers help your soldiers over the walls.</p>
        <TacticPicker units={units} terrain={r.terrain} commander={cmd} onPick={WA.assault} label="Assault!" />
        <div className="flex gap-2"><button className="btn flex-1" onClick={WA.demandSurrender}>Demand surrender ({Math.round(surrenderChance(c) * 100)}%)</button><button className="btn btn-red flex-1" onClick={() => confirm('Lift the siege and bring everyone home?') && WA.liftSiege()}>Lift siege</button></div>
      </Section>
    </>}
    <Reinforce />
    <Spoils r={r} phase={c.phase} />
    <Section title="Campaign log">{[...c.log].reverse().slice(0, 12).map((l, i) => <div key={i} className="text-xs">{l}</div>)}</Section>
  </div>;
}

function PlanCampaign() {
  const s = useGame(), ui = useUI(), w = s.world, foes = w.rivals.filter((r) => r.status === 'war');
  const [target, setTarget] = useState(ui.selRival && foes.some((f) => f.id === ui.selRival) ? ui.selRival : foes[0]?.id ?? ''), [bats, setBats] = useState<string[]>([]), [eng, setEng] = useState<Engines>({ ...NO_ENGINES }), [sup, setSup] = useState(Math.floor(Math.min(w.supplies, 60)));
  const away = WA.awayBats(s), home = s.battalions.filter((b) => !away.has(b.id)), soldiers = s.squads.filter((q) => bats.includes(q.bat)).reduce((a, q) => a + q.count, 0);
  const r = w.rivals.find((x) => x.id === target);
  if (!foes.length) return <p className="text-sm">You are at peace with everyone. Declare war from the Realms tab to plan a campaign. The Bandit Lord of the Crags is a good first target.</p>;
  return <div className="space-y-2">
    <Section title="Plan a campaign">
      <select className="inp" value={target} onChange={(e) => setTarget(e.target.value)}>{foes.map((f) => <option key={f.id} value={f.id}>{f.name} (≈{fmt(f.power)} strength, walls {f.wallMax})</option>)}</select>
      <div className="text-sm font-bold">Battalions</div>
      {home.map((b) => { const p = sidePower(WA.unitsOf(s.squads.filter((q) => q.bat === b.id))); return <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bats.includes(b.id)} onChange={(e) => setBats(e.target.checked ? [...bats, b.id] : bats.filter((x) => x !== b.id))} /><span className="flex-1">{b.name}</span><span>strength {fmt(p)}</span></label>; })}
      {!home.length && <p className="text-xs">All battalions are away.</p>}
      <div className="text-sm font-bold">Siege engines</div>
      <div className="grid grid-cols-2 gap-1">{ENGINE_IDS.map((e) => <label key={e} className="flex items-center gap-1 text-xs"><input type="number" className="inp !w-14" min={0} max={w.engines[e]} value={eng[e]} onChange={(ev) => setEng({ ...eng, [e]: Math.max(0, Math.min(w.engines[e], +ev.target.value)) })} />{ENGINES[e].name} ({w.engines[e]})</label>)}</div>
      <label className="flex items-center gap-2 text-sm">Supplies <input type="number" className="inp !w-24" min={0} max={Math.floor(w.supplies)} value={sup} onChange={(e) => setSup(Math.max(0, Math.min(Math.floor(w.supplies), +e.target.value)))} /> of {Math.floor(w.supplies)} · lasts {soldiers ? Math.floor(sup / consumption(soldiers)) : '—'} siege days</label>
      {r && <p className="text-xs">Strength {fmt(sidePower(WA.unitsOf(s.squads.filter((q) => bats.includes(q.bat)))))} vs their field army ≈{fmt(r.power * 0.6)} and garrison ≈{fmt(r.garrison)}.</p>}
      <button className="btn btn-red w-full text-lg" disabled={!bats.length || !target} onClick={() => WA.startCampaign(target, bats, eng, sup)}>March to war</button>
    </Section>
    {r && <Spoils r={r} />}
  </div>;
}

function Works() {
  const s = useGame(), w = s.world, farmLv = s.buildings.reduce((a, b) => a + (b.kind === 'farm' ? b.level : b.kind === 'storehouse' ? b.level * 0.5 : 0), 0);
  return <div className="space-y-2">
    <Section title="Supplies">
      <div className="text-sm">In storehouses: <b>{Math.floor(w.supplies)}</b>. Your farms produce <b>{(1 + farmLv * 0.5).toFixed(1)}</b> per study minute. An army eats 1 per 10 soldiers each siege day.</div>
      <div className="flex items-center justify-between gap-2"><Cost cost={SUPPLY_COST} have={s.res} /><button className="btn" onClick={() => WA.buySupplies(1)}>Buy 10</button><button className="btn" onClick={() => WA.buySupplies(10)}>Buy 100</button></div>
    </Section>
    {ENGINE_IDS.map((e) => { const d = ENGINES[e], lock = WA.engineLock(s, e);
      return <div key={e} className={`card p-2 flex items-center gap-2 ${lock ? 'opacity-60' : ''}`}><EngineImg e={e} scale={1.5} />
        <div className="flex-1 text-sm"><b>{d.name}</b> <span className="text-xs">owned {w.engines[e]}</span><div className="text-xs">{d.desc}</div><Cost cost={d.cost} have={s.res} />{lock && <div className="text-xs text-blood">{lock}</div>}</div>
        <button className="btn" disabled={!!lock} onClick={() => WA.buildEngine(e)}>Build</button></div>; })}
  </div>;
}

function Defense() {
  const s = useGame(), t = s.world.threat!, r = s.world.rivals.find((x) => x.id === t.rival)!, home = WA.unitsOf(WA.homeSquads(s));
  const allies = s.world.rivals.filter((x) => x.status === 'ally' && x.relation >= 50);
  return <div className="card p-2 border-2 !border-blood space-y-2 pulse">
    <div className="font-title text-2xl text-blood">{r.name} besieges your castle!</div>
    <p className="text-sm">Their host (≈{fmt(t.power)} strength) blockades you: study gold is reduced by 25% until it is resolved. Your defenders: ≈{fmt(sidePower(home))} strength, walls {Math.round(WA.fortOf(s) * 100)}% fortified.{t.allyHelp.length ? ` ${t.allyHelp.length} allies have come to your aid.` : ''}</p>
    {!WA.walledOf(s) && <p className="text-sm font-bold text-blood">You have no walls: they will not besiege you, they will walk straight in{t.power > sidePower(home) ? ' and, outnumbering your soldiers, sack the town' : ' and your soldiers must fight them in the streets'} unless you pay them off first.</p>}
    <p className="text-xs opacity-80">No caravan can leave while the enemy holds the roads: trade is cut off until the siege ends.</p>
    <TacticPicker units={home.length ? home : [{ cls: 'peasant', count: 1, rank: 0 }]} terrain={WA.walledOf(s) ? 'hills' : 'plains'} commander={Math.max(0, ...s.battalions.map((b) => b.commander.rank))} onPick={WA.defend} label="Meet them in battle" />
    <div className="flex gap-2">{allies.length > 0 && !t.allyHelp.length && <button className="btn flex-1" onClick={WA.callAllies}>Call {allies.length} all{allies.length > 1 ? 'ies' : 'y'}</button>}
      <button className="btn flex-1" onClick={() => confirm('Pay tribute to end the siege?') && WA.payTribute()}>Pay tribute</button></div>
    <p className="text-xs opacity-75">Losing never destroys buildings: the enemy takes part of your stores and leaves.</p>
  </div>;
}

/** Envoys, caravans and troops currently travelling, with time to arrival. */
/** Battalions serving with allies: how much of their service (counted in your study minutes) is left. */
function LentOut() {
  const s = useGame(), loans = s.world.loans; if (!loans.length) return null;
  return <Section title="Lent battalions">
    {loans.map((l) => { const b = s.battalions.find((x) => x.id === l.bat), r = s.world.rivals.find((x) => x.id === l.rival), left = Math.max(0, Math.ceil(l.leftMin));
      return <div key={l.bat + l.rival} className="text-sm space-y-0.5"><div className="flex justify-between gap-2"><span><b>{b?.name ?? 'Battalion'}</b> serving with {r?.name ?? 'an ally'}</span><span className="whitespace-nowrap tabular-nums">{left} min left</span></div>
        <Bar value={LOAN_MIN - left} max={LOAN_MIN} color="bg-moss" /></div>; })}
    <p className="text-xs opacity-70">Their service counts down while you study: {LOAN_MIN} minutes of study, then they march home with experience.</p>
  </Section>;
}
function OnTheRoad() {
  const s = useGame(), now = useNow(1000), c = s.world.campaign;
  const list = [...(s.world.journeys ?? []).map((j) => ({ id: j.id, label: j.label, arrive: j.arrive, depart: j.depart })), ...(c?.phase === 'march' ? [{ id: 'march', label: `Your host marching on ${s.world.rivals.find((r) => r.id === c.target)?.name}`, arrive: c.arrive ?? 0, depart: c.started }] : [])];
  if (!list.length) return null;
  return <Section title="On the road">{list.map((j) => { const left = Math.max(0, j.arrive - now);
    return <div key={j.id} className="text-sm"><div className="flex justify-between gap-2"><span>{j.label}</span><span className="tabular-nums whitespace-nowrap">{left ? clock(left) : 'arriving'}</span></div><Bar value={now - j.depart} max={j.arrive - j.depart} color="bg-moss" /></div>; })}
    <p className="text-xs opacity-70">Watch them travel on the world map.</p></Section>;
}

function Inbox() {
  const s = useGame();
  return <Section title={`Messengers (${s.world.inbox.length})`}>{s.world.inbox.map((m) => <div key={m.id} className="text-sm border-b border-black/10 pb-1">
    <div>{m.text}{m.amount ? ` (${m.amount} gold)` : ''}</div>
    <div className="flex gap-2 mt-0.5">{m.kind === 'news' ? <button className="btn !py-0 text-xs" onClick={() => WA.answerMissive(m.id, true)}>Dismiss</button> : m.kind === 'aid_request' ? <>
      <button className="btn !py-0 text-xs btn-gold" onClick={() => setUI({ selRival: m.rival })}>Send troops…</button><button className="btn !py-0 text-xs" onClick={() => WA.answerMissive(m.id, false)}>Decline</button></> : <>
      <button className="btn !py-0 text-xs btn-gold" onClick={() => WA.answerMissive(m.id, true)}>Accept</button><button className="btn !py-0 text-xs" onClick={() => WA.answerMissive(m.id, false)}>Refuse</button></>}</div>
  </div>)}</Section>;
}

function Reports() {
  const s = useGame();
  if (!s.world.reports.length) return <p className="text-sm italic">No battles fought yet.</p>;
  return <div className="space-y-2">{s.world.reports.map((r) => <details key={r.id} className="card p-2 text-sm"><summary className="cursor-pointer"><b className={r.win ? 'text-moss' : 'text-blood'}>{r.win ? 'Victory' : 'Defeat'}</b>: {r.title} · you lost {r.lostYou}/{r.you}, they lost {r.lostFoe}/{r.foe}</summary>
    {r.lines.map((l, i) => <div key={i} className="text-xs">{l}</div>)}{r.loot && <div className="text-xs">Spoils: <Cost cost={r.loot} /></div>}</details>)}</div>;
}

/** After a battle animation: casualties and outcome. */
export function BattleReport() {
  const ui = useUI(), b = ui.battle; if (!b || b.phase !== 'report') return null;
  const res = b.play.result, win = res.winner === 'a';
  const rows = (units: typeof b.play.a, loss: number[]) => units.map((u, i) => ({ u, l: loss[i] })).filter((x) => x.u.count > 0);
  return <div className="fixed inset-0 z-[75] grid place-items-center bg-black/60 p-4"><div className="panel pop w-full max-w-md p-4 space-y-2 max-h-[90dvh] overflow-y-auto">
    <h2 className={`font-title text-4xl text-center ${win ? '' : 'text-blood'}`}>{win ? 'Victory!' : 'Defeat'}</h2>
    <p className="text-center text-sm">{b.play.title}</p>
    <div className="grid grid-cols-2 gap-2 text-xs">{[[b.play.aName, rows(b.play.a, res.lossA)], [b.play.bName, rows(b.play.b, res.lossB)]].map(([name, list]) => <div key={name as string} className="card p-1.5"><b>{name as string}</b>
      {(list as { u: { cls: string; count: number }; l: number }[]).map((x, i) => <div key={i} className="flex justify-between"><span>{x.u.cls}</span><span>{x.u.count - x.l}/{x.u.count}</span></div>)}</div>)}</div>
    <div className="text-xs space-y-0.5">{res.rounds.map((r, i) => <div key={i}>{r.text}</div>)}</div>
    <button className="btn btn-gold w-full" onClick={() => setUI({ battle: null })}>Continue</button>
  </div></div>;
}
export const worldBadge = (s: GameState) => s.world.inbox.length + (s.world.threat ? 1 : 0);

