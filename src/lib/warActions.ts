// Player actions for diplomacy and war. Every resource change goes through the ledger.
import { neglect, type GameState, type Squad, _internal, studyHooks, emit, getState, setState, count, maxLevel, has, armySize, canAfford, TILE, CAMP_X, CAMP_Y, type BattleSite } from './state.ts';
import { biomeOf, realmLayout } from './realms.ts';
import { courtOf, courtFx, adjust } from './politics.ts';
import { rating, lossFactor, has as hasTrait, praiseReady, styled, battleCry, type BattleKind } from './commanders.ts';
import { type Res, ZERO, scale } from './rewards.ts';
import { simulate, capLosses, sidePower, tacticLock, type Unit, type Tactic, type BattleResult, TACTICS } from './battle.ts';
import { type Journey, type JourneyKind, travelMs, type WorldState, type Rival, type Engine, type Engines, type Stance, type Report, ENGINES, ENGINE_IDS, NO_ENGINES, SUPPLY_COST, advanceDays, tradeQuote, canTrade, giftRelation, shiftRelations, setStatus, newCampaign, siegeProgress, surrenderChance, wallFort, castleFort, armyOf, dayStr, refreshOutposts, type Outpost, fieldSpoils, conquestSpoils, defenceSpoils } from './war.ts';
import { uid } from './study.ts';
import { RANKS, OFFICERS } from './economy.ts';

const { update, ledger, spend, mark, kill, event } = _internal;
const W = (s: GameState, w: WorldState): GameState => ({ ...s, world: w });
const rival = (s: GameState, id: string) => s.world.rivals.find((r) => r.id === id);

// ---------------- army helpers ----------------
export const awayBats = (s: GameState) => new Set([...(s.world.campaign?.battalions ?? []), ...s.world.loans.map((l) => l.bat), ...(s.world.journeys ?? []).flatMap((j) => j.bats ?? [])]);
export const homeSquads = (s: GameState) => { const away = awayBats(s); return s.squads.filter((q) => !away.has(q.bat)); };
export const unitsOf = (squads: Squad[]): Unit[] => squads.map((q) => ({ cls: q.cls, count: q.count, rank: q.rank, ref: q.id }));
export const campaignSquads = (s: GameState) => s.squads.filter((q) => s.world.campaign?.battalions.includes(q.bat));
export const fortOf = (s: GameState) => castleFort({ wall: count(s, 'wall'), palisade: count(s, 'palisade'), tower: count(s, 'tower'), gatehouse: count(s, 'gatehouse'), gate: count(s, 'gate'), moat: count(s, 'moat'), keep: maxLevel(s, 'keep'), watchtower: count(s, 'watchtower') });
export const myPower = (s: GameState) => sidePower(unitsOf(s.squads));
/** The battalion whose commander leads: highest rank, then most honours, then most victories. */
export const leadOf = (s: GameState, bats: string[]) => s.battalions.filter((b) => bats.includes(b.id)).sort((a, b) => b.commander.rank - a.commander.rank || (b.commander.honors ?? 0) - (a.commander.honors ?? 0) || (b.commander.wins ?? 0) - (a.commander.wins ?? 0))[0];
const mixOf = (units: Unit[]) => { const n = Math.max(1, units.reduce((a, u) => a + u.count, 0)); return { cav: units.reduce((a, u) => a + (TROOPS_CAV.has(u.cls) ? u.count : 0), 0) / n, ranged: units.reduce((a, u) => a + (TROOPS_RANGED.has(u.cls) ? u.count : 0), 0) / n }; };
const TROOPS_CAV = new Set(['lightcav', 'knight', 'mknight', 'vetcav']), TROOPS_RANGED = new Set(['archer', 'longbow', 'crossbow', 'royalarcher']);
/** The leading commander's battle rating for this fight: rank, honours and the traits that apply. */
const commanderOf = (s: GameState, bats: string[], kind: BattleKind = 'field', units: Unit[] = [], vsBandits = false) => { const b = leadOf(s, bats); return b ? rating(b.commander, kind, mixOf(units), vsBandits) + courtFx(courtOf(s.world)).command : 0; }; // loyal nobles fight harder
/** How much of their host the leading commander may lose (cautious and lucky captains lose fewer men). */
const lossCap = (s: GameState, bats: string[], frac: number) => { const b = leadOf(s, bats); return Math.min(0.9, frac * (b ? lossFactor(b.commander) : 1)); };
/** The leading commander's opening line for the battle film. */
const cryOf = (s: GameState, bats: string[], kind: BattleKind) => { const b = leadOf(s, bats); return b ? battleCry(b.commander, OFFICERS[b.commander.rank]?.name ?? '', kind) : undefined; };
/** Records a battle for every commander present; announces when one has earned praise. */
function record(s: GameState, bats: string[], won: boolean): GameState {
  let o = s;
  for (const b of s.battalions.filter((x) => bats.includes(x.id))) {
    const before = praiseReady(b.commander).ok, c = { ...b.commander, battles: (b.commander.battles ?? 0) + 1, wins: (b.commander.wins ?? 0) + (won ? 1 : 0) };
    o = mark({ ...o, battalions: o.battalions.map((x) => (x.id === b.id ? { ...x, commander: c } : x)) }, 'battalions', b.id);
    if (!before && praiseReady(c).ok) emit({ kind: 'achieve', text: `${styled(c)} has earned the realm's praise! Honour them in the Army panel.` });
  }
  return o;
}
const allyUnits = (s: GameState, ids: string[], share: number) => ids.flatMap((id) => { const r = rival(s, id); return r ? armyOf(r, r.power * share).map((u) => ({ ...u, ref: undefined })) : []; });

/** Applies casualties to the player's squads (only units with a squad ref). */
function applyLosses(s: GameState, units: Unit[], losses: number[]): GameState {
  let o = s;
  units.forEach((u, i) => {
    if (!u.ref || !losses[i]) return;
    const q = o.squads.find((x) => x.id === u.ref); if (!q) return;
    const left = q.count - losses[i];
    if (left <= 0) o = kill({ ...o, squads: o.squads.filter((x) => x.id !== q.id) }, 'squads', q.id);
    else o = mark({ ...o, squads: o.squads.map((x) => (x.id === q.id ? { ...x, count: left, xp: x.xp + 15 } : x)) }, 'squads', q.id);
  });
  return o;
}
function enemyTactic(r: Rival, seed: number): Tactic {
  const prefs: Record<string, Tactic[]> = { aggressive: ['assault', 'flank', 'assault'], honorable: ['shieldwall', 'assault'], mercantile: ['volley', 'shieldwall'], treacherous: ['feint', 'ambush', 'volley'], pious: ['shieldwall', 'volley'] };
  const list = prefs[r.personality].filter((t) => t !== 'ambush' || r.terrain === 'forest' || r.terrain === 'hills');
  return list[seed % list.length];
}
function report(s: GameState, title: string, win: boolean, res: BattleResult, you: Unit[], foe: Unit[], loot?: Partial<Res>): GameState {
  const rep: Report = { id: uid(), t: Date.now(), title, win, lines: res.rounds.map((r) => r.text), you: res.startA, foe: res.startB, lostYou: res.lossA.reduce((a, b) => a + b, 0), lostFoe: res.lossB.reduce((a, b) => a + b, 0), loot };
  void you; void foe;
  return { ...s, world: { ...s.world, reports: [rep, ...s.world.reports].slice(0, 25) } };
}
function play(title: string, a: Unit[], b: Unit[], result: BattleResult, aName: string, bName: string, aColor: number, bColor: number, engines?: Engines, site?: BattleSite) {
  emit({ kind: 'battle', text: title, battle: { title, a, b, result, aName, bName, aColor, bColor, engines, site } });
}

// ---------------- daily world turn & study hooks ----------------
export const worldTick = () => {
  const s0 = getState(), today = dayStr();
  if (s0.world.outpostDay !== today) setState(W(s0, refreshOutposts(s0.world, s0.stage, today))); // bandits pitch a new camp each day
  const s = getState();
  if (s.world.lastDay === today) return;
  const w = advanceDays(s.world, { stage: s.stage, myPower: myPower(s), fort: fortOf(s), active: true, neglect: neglect(s) }, today);
  const fresh = w.inbox.filter((m) => !s.world.inbox.some((x) => x.id === m.id));
  for (const m of fresh) emit({ kind: m.kind === 'news' ? 'war' : 'info', text: m.text });
  setState(W(s, w));
};
studyHooks.push((s, minutes) => {
  if (minutes <= 0 || !s.world) return s;
  let w = s.world, o = s;
  // farms feed the army: supplies grow while you study
  const farmLv = s.buildings.reduce((a, b) => a + (b.kind === 'farm' ? b.level : b.kind === 'storehouse' ? b.level * 0.5 : 0), 0);
  w = { ...w, supplies: Math.round((w.supplies + minutes * (1 + farmLv * 0.5)) * 10) / 10 };
  if (w.campaign) {
    const soldiers = campaignSquads(s).reduce((a, q) => a + q.count, 0);
    const r = siegeProgress(w.campaign, minutes, soldiers, has(s, 'engineering'));
    w = { ...w, campaign: r.c };
    if (r.days) emit({ kind: 'war', text: `Siege day ${r.c.day}: ${r.c.log[r.c.log.length - 1]}` });
    const lead = leadOf(s, w.campaign!.battalions);
    if (lead && hasTrait(lead.commander, 'beloved') && r.desert) w = { ...w, campaign: { ...w.campaign!, log: [...w.campaign!.log, `${styled(lead.commander)} talks the hungry men out of deserting.`] } };
    else if (r.desert) { o = W(o, w); const sq = campaignSquads(o); o = applyLosses(o, unitsOf(sq), sq.map((q) => Math.min(q.count, Math.ceil(q.count * 0.03)))); w = o.world; }
  }
  // loaned battalions come home after enough study
  const back = w.loans.filter((l) => l.leftMin - minutes <= 0);
  w = { ...w, loans: w.loans.map((l) => ({ ...l, leftMin: l.leftMin - minutes })).filter((l) => l.leftMin > 0) };
  o = W(o, w);
  for (const l of back) { const r = rival(o, l.rival); if (!r) continue; const nm = o.battalions.find((b) => b.id === l.bat)?.name ?? 'Your troops'; o = goHome(o, r, [l.bat], `${nm} returning from ${r.name}`); emit({ kind: 'info', text: `${nm} set out for home from ${r.name}.` }); }
  return o;
});

// ---------------- diplomacy ----------------
/** Puts a traveller on the road; effects apply on arrival (see journeysTick). */
function send(s: GameState, kind: JourneyKind, r: Rival, label: string, extra: Partial<Journey> = {}, ms?: number): GameState {
  const now = Date.now(), j: Journey = { id: uid(), kind, rival: r.id, depart: now, arrive: now + (ms ?? travelMs(kind, r)), label, ...extra };
  return W(s, { ...s.world, journeys: [...(s.world.journeys ?? []), j] });
}
const mins = (ms: number) => (ms < 90000 ? `${Math.round(ms / 1000)}s` : `${Math.round(ms / 60000)} min`);
export const trade = (id: string, give: keyof Res, amount: number, want: keyof Res) => update((s) => {
  const r = rival(s, id); if (!r) return; const why = canTrade(r); if (why) return why;
  amount = Math.floor(amount); if (amount <= 0 || give === want) return 'Choose an amount and two different goods';
  if (!canAfford(s.res, { [give]: amount })) return 'Not enough to trade';
  const q = tradeQuote(r, give, amount, want, courtFx(courtOf(s.world)).trade), today = dayStr();
  let o = spend(s, { [give]: amount });
  o = W(o, { ...o.world, rivals: o.world.rivals.map((x) => (x.id === id ? { ...x, trades: x.lastTradeDay === today ? x.trades + 1 : 1, lastTradeDay: today } : x)) });
  o = send(o, 'caravan', r, `Caravan to ${r.name}`, { data: { give, amount, want, got: q.got, rel: q.rel } });
  emit({ kind: 'info', text: `A caravan sets out for ${r.name} with ${amount} ${give}. Arrives in ${mins(travelMs('caravan', r))}.` });
  return event(o, 'diplomacy', `Sent a caravan with ${amount} ${give} to ${r.name}.`);
});
export const gift = (id: string, gold: number) => update((s) => {
  const r = rival(s, id); if (!r || r.bandits) return 'They will not accept';
  if (!canAfford(s.res, { gold })) return 'Not enough gold';
  const rel = giftRelation(r, gold); if (rel < 1) return `Too small a gift for a level ${r.level} kingdom`;
  emit({ kind: 'info', text: `Your gift is on its way to ${r.name}. Arrives in ${mins(travelMs('gift', r))}.` });
  return event(send(spend(s, { gold }), 'gift', r, `Gift for ${r.name}`, { data: { gold, rel } }), 'diplomacy', `Sent a gift of ${gold} gold to ${r.name}.`);
});
export const sendAid = (id: string, batId: string) => update((s) => {
  const r = rival(s, id); if (!r || r.bandits) return 'Not possible';
  if (r.status === 'war') return 'You are at war with them';
  if (r.relation < -10) return 'They do not trust you enough to accept troops';
  if (awayBats(s).has(batId)) return 'That battalion is already away';
  const sq = s.squads.filter((q) => q.bat === batId), p = sidePower(unitsOf(sq)); if (!sq.length) return 'That battalion has no soldiers';
  const lent = s.battalions.find((b) => b.id === batId), rel = Math.round(Math.min(25, 4 + Math.round((p / Math.max(50, r.power)) * 80)) * (lent && hasTrait(lent.commander, 'diplomat') ? 1.5 : 1));
  let o = send(s, 'aid', r, `${s.battalions.find((b) => b.id === batId)?.name ?? 'Troops'} marching to ${r.name}`, { bats: [batId], data: { rel } });
  o = { ...o, world: { ...o.world, inbox: o.world.inbox.filter((m) => !(m.rival === id && m.kind === 'aid_request')) } };
  emit({ kind: 'info', text: `Your troops march to aid ${r.name}. They arrive in ${mins(travelMs('aid', r))}.` });
  return event(o, 'diplomacy', `Sent troops to aid ${r.name}.`);
});
const pendingEnvoy = (s: GameState, id: string) => (s.world.journeys ?? []).some((j) => j.kind === 'envoy' && j.rival === id && !j.home);
export const proposeAlliance = (id: string) => update((s) => {
  const r = rival(s, id); if (!r || r.bandits) return 'Not possible';
  if (r.status === 'war') return 'Make peace first';
  if (r.relation < 60) return `${r.ruler} does not trust you enough yet (relations ${r.relation}/60)`;
  if (pendingEnvoy(s, id)) return 'An envoy is already on the way';
  emit({ kind: 'info', text: `An envoy rides to ${r.name} with your offer of alliance.` });
  return send(s, 'envoy', r, `Envoy to ${r.name}: alliance`, { data: { act: 'alliance' } });
});
export const breakAlliance = (id: string) => update((s) => { const r = rival(s, id); if (!r) return; return send(s, 'envoy', r, `Envoy to ${r.name}: end alliance`, { data: { act: 'break' } }); });
export const declareWar = (id: string) => update((s) => {
  const r = rival(s, id); if (!r) return; if (r.status === 'war') return 'Already at war'; if (r.status === 'vassal') return 'They are your vassal';
  if (pendingEnvoy(s, id)) return 'A herald is already on the way';
  emit({ kind: 'war', text: `A herald rides to ${r.name} with your declaration of war.` });
  return send(s, 'envoy', r, `Herald to ${r.name}: war`, { data: { act: 'war' } });
});
export const offerPeace = (id: string, gold: number) => update((s) => {
  const r = rival(s, id); if (!r || r.status !== 'war') return 'Not at war';
  if (s.world.campaign?.target === id) return 'Lift your siege first';
  const need = r.beaten ? 0 : 100 * r.level;
  if (gold < need) return `${r.name} wants ${need} gold to make peace`;
  if (!canAfford(s.res, { gold })) return 'Not enough gold';
  if (pendingEnvoy(s, id)) return 'An envoy is already on the way';
  emit({ kind: 'info', text: `An envoy rides to ${r.name} to offer peace.` });
  return send(gold ? spend(s, { gold }) : s, 'envoy', r, `Envoy to ${r.name}: peace`, { data: { act: 'peace' } });
});

/** Applies the effects of everyone who has reached their destination. */
/** Travel time to a point on the map (bandit outposts), at an army's pace. */
const travelTo = (p: { x: number; y: number }) => travelMs('army', p);
function sendTo(s: GameState, kind: JourneyKind, p: { x: number; y: number }, label: string, extra: Partial<Journey> = {}): GameState {
  const now = Date.now(), j: Journey = { id: uid(), kind, rival: '', depart: now, arrive: now + travelTo(p), label, to: { x: p.x, y: p.y }, ...extra };
  return W(s, { ...s.world, journeys: [...(s.world.journeys ?? []), j] });
}
/** Spoils of an outpost, paid if the raid succeeds. */
export const outpostLoot = (o: Outpost) => o.loot;
/** Sends a battalion from home to clear a bandit outpost; the fight happens when it arrives. */
export const raidOutpost = (id: string, batId: string) => update((s) => {
  const op = s.world.outposts?.find((o) => o.id === id); if (!op) return 'That camp is gone';
  if ((s.world.journeys ?? []).some((j) => j.kind === 'raid' && (j.data as { outpost?: string })?.outpost === id)) return 'Soldiers are already on their way there';
  if (awayBats(s).has(batId)) return 'That battalion is away';
  const b = s.battalions.find((x) => x.id === batId); if (!b || !s.squads.some((q) => q.bat === batId)) return 'That battalion has no soldiers';
  emit({ kind: 'info', text: `${b.name} marches on ${op.name} (${Math.round(travelTo(op) / 60000) || 1} min).` });
  return event(sendTo(s, 'raid', op, `${b.name} raiding ${op.name}`, { bats: [batId], data: { outpost: id } }), 'war', `${b.name} set out to clear the bandits of ${op.name}.`);
});
/** Sends a battalion from home to join the siege; it arrives after the march. */
export const reinforce = (batId: string) => update((s) => {
  const c = s.world.campaign; if (!c) return 'No campaign under way';
  if (awayBats(s).has(batId)) return 'That battalion is away';
  const r = rival(s, c.target)!, b = s.battalions.find((x) => x.id === batId); if (!b || !s.squads.some((q) => q.bat === batId)) return 'That battalion has no soldiers';
  emit({ kind: 'info', text: `${b.name} marches to join the siege of ${r.name}.` });
  return send(s, 'reinforce', r, `${b.name} marching to ${r.name}`, { bats: [batId], data: {} }, travelMs('army', r));
});
/** Reinforcements reach the siege: fresh recruits fold into the battalion they were raised for, whole battalions join the host. */
function reinforcementsArrive(o: GameState, j: Journey, r: Rival | undefined): GameState {
  const c = o.world.campaign, bat = j.bats![0], join = (j.data as { join?: string })?.join;
  if (!r || !c || c.target !== r.id) return r ? send(o, 'return', r, `${o.battalions.find((b) => b.id === bat)?.name ?? 'Reinforcements'} returning from ${r.name}`, { home: true, bats: [bat] }, travelMs('army', r)) : o;
  const n = o.squads.filter((q) => q.bat === bat).reduce((a, q) => a + q.count, 0);
  if (join && c.battalions.includes(join) && o.battalions.some((b) => b.id === join)) {
    let out: GameState = { ...o, squads: o.squads.map((q) => (q.bat === bat ? { ...q, bat: join } : q)), battalions: o.battalions.filter((b) => b.id !== bat) };
    for (const q of o.squads) if (q.bat === bat) out = mark(out, 'squads', q.id);
    o = kill(out, 'battalions', bat);
  } else o = W(o, { ...o.world, campaign: { ...c, battalions: [...c.battalions, bat] } });
  const c2 = o.world.campaign!;
  emit({ kind: 'war', text: `${n} reinforcements reach the siege of ${r.name}.` });
  return W(o, { ...o.world, campaign: { ...c2, morale: Math.min(100, c2.morale + 5), log: [...c2.log, `${n} fresh soldiers join the host.`] } });
}
/** The raiders reach the outpost and fight; win or lose, the survivors march home. */
function raidArrives(o: GameState, j: Journey): GameState {
  const id = (j.data as { outpost?: string })?.outpost, op = o.world.outposts?.find((x) => x.id === id), bat = j.bats![0], to = j.to ?? { x: 0.5, y: 0.5 };
  const home = (g: GameState, label: string) => sendTo(g, 'return', to, label, { home: true, bats: [bat] });
  const b = o.battalions.find((x) => x.id === bat);
  if (!op || !b) { emit({ kind: 'info', text: 'The bandits had already fled their camp.' }); return home(o, `${b?.name ?? 'Your soldiers'} returning`); }
  const mine = unitsOf(o.squads.filter((q) => q.bat === bat)), foe = armyOf({ id: op.id, level: 1, power: op.power }), seed = Date.now() % 100000;
  if (!mine.length) return W(o, { ...o.world });
  let res = simulate({ name: b.name, units: mine, commander: rating(b.commander, 'raid', mixOf(mine), true), tactic: 'assault' }, { name: op.name, units: foe, commander: 0, tactic: 'assault' }, op.biome === 'forest' ? 'forest' : op.biome === 'highlands' ? 'hills' : op.biome === 'swamp' ? 'marsh' : 'plains', seed);
  res = capLosses(res, 'a', Math.min(0.9, 0.4 * lossFactor(b.commander)));
  const won = res.winner === 'a';
  o = record(applyLosses(o, mine, res.lossA), [bat], won);
  const spoils = hasTrait(b.commander, 'raider') ? scale(op.loot, 1.5) : op.loot;
  o = report(o, `Raid on ${op.name}`, won, res, mine, foe, won ? spoils : undefined);
  play(`Raid on ${op.name}`, mine, foe, res, b.name, op.name, b.color, 0x2a2a2a, undefined, { biome: op.biome, cry: battleCry(b.commander, '', 'raid').trim() });
  if (won) {
    o = ledger(W(o, { ...o.world, outposts: (o.world.outposts ?? []).filter((x) => x.id !== op.id) }), 'loot', uid(), { ...ZERO, ...spoils });
    emit({ kind: 'reward', text: `${op.name} is cleared!`, res: spoils });
    o = event(o, 'war', `${b.name} cleared the bandit camp at ${op.name}.`);
  } else { emit({ kind: 'error', text: `The bandits of ${op.name} drove off your soldiers.` }); o = event(o, 'war', `${b.name} was beaten back from ${op.name}.`); }
  return o.squads.some((q) => q.bat === bat) ? home(o, `${b.name} returning from ${op.name}`) : o;
}
export const journeysTick = (now = Date.now()) => {
  const s0 = getState(), due = (s0.world.journeys ?? []).filter((j) => j.arrive <= now), march = s0.world.campaign?.phase === 'march' && (s0.world.campaign.arrive ?? 0) <= now;
  if (!due.length && !march) return;
  update((s) => {
    let o: GameState = W(s, { ...s.world, journeys: (s.world.journeys ?? []).filter((j) => j.arrive > now) });
    if (march && o.world.campaign) { const c = o.world.campaign, r = rival(o, c.target)!; o = W(o, { ...o.world, campaign: { ...c, phase: c.next ?? 'field', log: [...c.log, `Your host arrives before ${r.name}.`] } }); emit({ kind: 'war', text: `Your host has arrived before ${r.name}!` }); }
    for (const j of due) {
      const r = rival(o, j.rival)!, d = (j.data ?? {}) as Record<string, never>;
      if (j.kind === 'raid') { o = raidArrives(o, j); continue; }
      if (j.kind === 'reinforce') { o = reinforcementsArrive(o, j, r); continue; }
      if (j.kind === 'caravan') {
        o = W(o, shiftRelations(o.world, r.id, d.rel, false));
        o = send(o, 'return', r, `Caravan returning from ${r.name}`, { home: true, data: { res: { [d.want]: d.got } } }, travelMs('caravan', r));
        emit({ kind: 'info', text: `Your caravan reached ${r.name} (+${d.rel} relations) and heads home with ${d.got} ${d.want}.` });
      } else if (j.kind === 'gift') { o = W(o, shiftRelations(o.world, r.id, d.rel)); emit({ kind: 'info', text: `${r.name} welcomes your gift (+${d.rel} relations).` }); }
      else if (j.kind === 'aid') {
        const bat = j.bats![0];
        o = W(o, { ...shiftRelations(o.world, r.id, d.rel), loans: [...o.world.loans, { bat, rival: r.id, leftMin: 60 }] });
        o = { ...o, squads: o.squads.map((q) => (q.bat === bat ? { ...q, xp: q.xp + 30 } : q)) }; for (const q of o.squads) if (q.bat === bat) o = mark(o, 'squads', q.id);
        emit({ kind: 'info', text: `Your troops reached ${r.name} (+${d.rel} relations). They return after 60 minutes of study.` });
      } else if (j.kind === 'envoy') {
        if (d.act === 'alliance') { if (r.relation >= 60 && r.status === 'neutral') { o = W(o, shiftRelations(setStatus(o.world, r.id, 'ally'), r.id, 10)); emit({ kind: 'achieve', text: `${r.ruler} accepts! Alliance sealed with ${r.name}.` }); o = event(o, 'diplomacy', `Formed an alliance with ${r.name}.`); } else emit({ kind: 'info', text: `${r.ruler} declined your alliance.` }); }
        if (d.act === 'break') { o = W(o, shiftRelations(setStatus(o.world, r.id, 'neutral'), r.id, -30)); o = event(o, 'diplomacy', `Ended the alliance with ${r.name}.`); }
        if (d.act === 'war' && r.status !== 'war') {
          let w = shiftRelations(setStatus(o.world, r.id, 'war'), r.id, -Math.max(40, r.relation + 60));
          if (r.status === 'ally') w = { ...w, rivals: w.rivals.map((x) => (x.id === r.id ? x : { ...x, relation: Math.max(-100, x.relation - 15) })) };
          o = event(W(o, w), 'war', `Declared war on ${r.name}.`); emit({ kind: 'war', text: `Your herald has delivered the declaration. You are at war with ${r.name}!` });
        }
        if (d.act === 'peace' && r.status === 'war') { const w = setStatus(o.world, r.id, 'neutral'); o = W(o, { ...w, rivals: w.rivals.map((x) => (x.id === r.id ? { ...x, relation: Math.max(x.relation, -25), beaten: 0 } : x)), threat: o.world.threat?.rival === r.id ? null : o.world.threat }); o = event(o, 'diplomacy', `Made peace with ${r.name}.`); emit({ kind: 'info', text: `${r.name} accepts peace.` }); }
      } else if (j.kind === 'return') {
        if (d.res) { o = ledger(o, 'trade', uid(), { ...ZERO, ...(d.res as Partial<Res>) }); emit({ kind: 'reward', text: `Your caravan is home from ${r.name}`, res: d.res as Partial<Res> }); }
        else emit({ kind: 'info', text: `${j.label.replace(' returning', '')} are home.` });
      }
    }
    return o;
  });
};
/** Sends battalions home along the road (used after a campaign or a loan ends). */
const goHome = (s: GameState, r: Rival, bats: string[], label: string) => (bats.length ? send(s, 'return', r, label, { home: true, bats }, travelMs('army', r)) : s);
export const answerMissive = (mid: string, accept: boolean) => update((s) => {
  const m = s.world.inbox.find((x) => x.id === mid); if (!m) return;
  const r = rival(s, m.rival)!; let o: GameState = { ...s, world: { ...s.world, inbox: s.world.inbox.filter((x) => x.id !== mid) } };
  if (m.kind === 'tribute_demand') {
    if (accept) { if (!canAfford(s.res, { gold: m.amount! })) return 'Not enough gold'; o = W(spend(o, { gold: m.amount! }), shiftRelations(o.world, r.id, 15)); }
    else o = W(o, shiftRelations(o.world, r.id, -15));
  } else if (m.kind === 'trade_offer' && accept) {
    if (!canAfford(s.res, { gold: m.amount! })) return 'Not enough gold';
    o = ledger(spend(o, { gold: m.amount! }), 'trade', uid(), { ...ZERO, wood: Math.round(m.amount! * 0.5), stone: Math.round(m.amount! * 0.35) });
    o = W(o, shiftRelations(o.world, r.id, 5));
  } else if (m.kind === 'alliance_offer' && accept) o = W(o, setStatus(o.world, r.id, 'ally'));
  else if (m.kind === 'aid_request' && !accept) o = W(o, shiftRelations(o.world, r.id, -5, false));
  return event(o, 'diplomacy', `${accept ? 'Accepted' : 'Refused'}: ${m.text}`);
});

// ---------------- siege works ----------------
export const engineLock = (s: GameState, e: Engine) => (!has(s, 'engineering') ? 'Requires Engineering' : maxLevel(s, 'siege') < ENGINES[e].siege ? `Requires ${ENGINES[e].siege === 2 ? "Engineers' Yard" : 'Siege Workshop'}` : null);
export const buildEngine = (e: Engine) => update((s) => {
  const why = engineLock(s, e); if (why) return why;
  if (!canAfford(s.res, ENGINES[e].cost)) return 'Not enough resources';
  emit({ kind: 'build', text: ENGINES[e].name });
  return event(W(spend(s, ENGINES[e].cost), { ...s.world, engines: { ...s.world.engines, [e]: s.world.engines[e] + 1 } }), 'build', `Built a ${ENGINES[e].name}.`);
});
export const buySupplies = (n10: number) => update((s) => {
  if (!canAfford(s.res, SUPPLY_COST, n10)) return 'Not enough resources';
  return W(spend(s, SUPPLY_COST, n10), { ...s.world, supplies: s.world.supplies + n10 * 10 });
});

// ---------------- campaigns ----------------
export const startCampaign = (id: string, bats: string[], engines: Engines, supplies: number) => update((s) => {
  const r = rival(s, id); if (!r) return; if (r.status !== 'war') return 'Declare war first';
  if (s.world.campaign) return 'You already have a campaign under way';
  if (s.world.threat) return 'Deal with the army at your gates first';
  const away = awayBats(s); if (!bats.length || bats.some((b) => away.has(b))) return 'Choose battalions that are at home';
  if (!s.squads.some((q) => bats.includes(q.bat))) return 'Those battalions have no soldiers';
  if (ENGINE_IDS.some((e) => engines[e] > s.world.engines[e])) return 'Not enough siege engines';
  supplies = Math.floor(supplies); if (supplies > s.world.supplies) return 'Not enough supplies';
  const allies = s.world.rivals.filter((x) => x.status === 'ally' && x.relation >= 60 && !r.friends.includes(x.id)).map((x) => x.id);
  const home = { ...s.world.engines }; for (const e of ENGINE_IDS) home[e] -= engines[e];
  emit({ kind: 'war', text: `Your host marches on ${r.name}${allies.length ? ` with ${allies.length} allied banner${allies.length > 1 ? 's' : ''}` : ''}!` });
  return event(W(s, { ...s.world, engines: home, supplies: s.world.supplies - supplies, campaign: newCampaign(r, bats, engines, supplies, allies) }), 'war', `Marched on ${r.name}.`);
});
/** Field battle against the enemy's army before the siege can begin. */
export const fieldBattle = (tactic: Tactic) => update((s) => {
  const c = s.world.campaign; if (!c || c.phase !== 'field') return 'No field battle to fight';
  const r = rival(s, c.target)!, mine = unitsOf(campaignSquads(s)), allies = allyUnits(s, c.allies, 0.25), a = [...mine, ...allies];
  const cmd = commanderOf(s, c.battalions, 'field', a, !!r.bandits);
  const lock = tacticLock(a, tactic, r.terrain, cmd); if (lock) return lock;
  const foe = armyOf(r, r.power * 0.6), seed = Date.now() % 100000;
  let res = simulate({ name: 'Your host', units: a, commander: cmd, tactic, engines: { ballista: c.engines.ballista } }, { name: r.name, units: foe, commander: Math.min(4, r.level - 1), tactic: enemyTactic(r, seed) }, r.terrain, seed);
  res = capLosses(res, 'a', lossCap(s, c.battalions, 0.6));
  let o = record(applyLosses(s, a, res.lossA), c.battalions, res.winner === 'a');
  const killed = sidePower(foe.map((u, i) => ({ ...u, count: res.lossB[i] })));
  const w = { ...o.world, rivals: o.world.rivals.map((x) => (x.id === r.id ? { ...x, power: Math.max(10, Math.round(x.power - killed * 1.4)), beaten: res.winner === 'a' ? 1 : x.beaten } : x)) };
  if (res.winner === 'a') o = W(o, { ...w, campaign: { ...c, phase: 'siege', log: [...c.log, `Victory in the field! The siege of ${r.name} begins.`] } });
  else o = goHome(W(o, { ...w, campaign: null, engines: addEngines(w.engines, c.engines), supplies: w.supplies + c.supplies }), r, c.battalions, `Your host retreating from ${r.name}`);
  o = ledger(o, 'loot', uid(), res.winner === 'a' ? fieldSpoils(r) : ZERO);
  o = report(o, `Battle before ${r.name}`, res.winner === 'a', res, a, foe, res.winner === 'a' ? fieldSpoils(r) : undefined);
  play(`Battle before ${r.name}`, a, foe, res, 'Your host', r.name, s.battalions.find((b) => b.id === c.battalions[0])?.color ?? 0xb3242a, r.color, undefined, { biome: biomeOf(s.world, r), cry: cryOf(s, c.battalions, 'field') });
  return event(o, 'war', res.winner === 'a' ? `Defeated ${r.name}'s army in the field.` : `Defeated in the field by ${r.name}; the host retreats.`);
});
const addEngines = (a: Engines, b: Engines): Engines => { const o = { ...a }; for (const e of ENGINE_IDS) o[e] += b[e]; return o; };
export const setStance = (stance: Stance) => update((s) => (s.world.campaign ? W(s, { ...s.world, campaign: { ...s.world.campaign, stance } }) : undefined));
export const sendSupplies = (n: number) => update((s) => {
  const c = s.world.campaign; if (!c) return; n = Math.min(Math.floor(n), Math.floor(s.world.supplies)); if (n <= 0) return 'No supplies at home';
  return W(s, { ...s.world, supplies: s.world.supplies - n, campaign: { ...c, supplies: c.supplies + n, log: [...c.log, `A supply train brings ${n} supplies.`] } });
});
export const liftSiege = () => update((s) => {
  const c = s.world.campaign; if (!c) return; const r = rival(s, c.target)!;
  return event(goHome(W(s, { ...s.world, campaign: null, engines: addEngines(s.world.engines, c.engines), supplies: s.world.supplies + c.supplies }), r, c.battalions, `Your host returning from ${r.name}`), 'war', `Lifted the siege of ${r.name}.`);
});
function conquer(s: GameState, r: Rival): GameState {
  const loot = conquestSpoils(r);
  const c = s.world.campaign!;
  let o = ledger(s, 'loot', uid(), loot);
  // the spoils go on the latest report of this siege (the assault), or a new surrender report
  const last = o.world.reports?.[0];
  if (last && Date.now() - last.t < 5000 && last.title.includes(r.name)) o = W(o, { ...o.world, reports: [{ ...last, loot }, ...o.world.reports.slice(1)] });
  else o = W(o, { ...o.world, reports: [{ id: uid(), t: Date.now(), title: `${r.name} surrenders`, win: true, lines: [`${r.ruler} opens the gates and swears fealty.`], you: 0, foe: 0, lostYou: 0, lostFoe: 0, loot }, ...(o.world.reports ?? [])].slice(0, 25) });
  const w = { ...o.world, campaign: null, engines: addEngines(o.world.engines, c.engines), supplies: o.world.supplies + c.supplies, conquests: o.world.conquests + 1,
    rivals: o.world.rivals.map((x) => (x.id === r.id ? { ...x, status: 'vassal' as const, power: Math.round(x.power * 0.3), garrison: 0, relation: 20 } : r.friends.includes(x.id) ? { ...x, relation: Math.max(-100, x.relation - 20) } : x)) };
  o = goHome(W(o, w), r, c.battalions, `Your victorious host returning from ${r.name}`);
  emit({ kind: 'stage', text: `${r.name} has fallen! It is now your vassal.`, res: loot, big: true });
  return event(o, 'war', `Conquered ${r.name}. Its lord swears fealty to you.`);
}
/** Storm the walls. Walls, rams and siege towers decide how costly it is. */
export const assault = (tactic: Tactic) => update((s) => {
  const c = s.world.campaign; if (!c || c.phase !== 'siege') return 'No siege under way';
  const r = rival(s, c.target)!, mine = unitsOf(campaignSquads(s)), a = [...mine, ...allyUnits(s, c.allies, 0.2)];
  if (!mine.length) return 'No soldiers left in the siege camp';
  const cmd = commanderOf(s, c.battalions, 'assault', a, !!r.bandits);
  const lock = tacticLock(a, tactic, r.terrain, cmd); if (lock) return lock;
  const garrisonPower = Math.max(5, c.garrison) * (0.6 + c.garrisonMorale / 250), foe = armyOf(r, garrisonPower), seed = Date.now() % 100000;
  let res = simulate({ name: 'Your host', units: a, commander: cmd, tactic, engines: { ram: c.engines.ram, tower: c.engines.tower, ballista: c.engines.ballista } },
    { name: `${r.name} garrison`, units: foe, commander: Math.min(4, r.level - 1), tactic: 'shieldwall', fort: wallFort(c) }, r.terrain, seed, true);
  res = capLosses(res, 'a', lossCap(s, c.battalions, 0.5));
  let o = record(applyLosses(s, a, res.lossA), c.battalions, res.winner === 'a');
  play(`Assault on ${r.name}`, a, foe, res, 'Your host', r.name, s.battalions.find((b) => b.id === c.battalions[0])?.color ?? 0xb3242a, r.color, c.engines, { biome: biomeOf(s.world, r), walls: { side: 1, kind: realmLayout(s.world, r).wallKind }, cry: cryOf(s, c.battalions, 'assault') });
  o = report(o, `Assault on ${r.name}`, res.winner === 'a', res, a, foe);
  if (res.winner === 'a') return conquer(o, r);
  const killed = sidePower(foe.map((u, i) => ({ ...u, count: res.lossB[i] })));
  const left = campaignSquads(o).length;
  o = W(o, { ...o.world, campaign: left ? { ...c, garrison: Math.max(0, Math.round(c.garrison - killed)), morale: Math.max(0, c.morale - (leadOf(s, c.battalions) && hasTrait(leadOf(s, c.battalions)!.commander, 'beloved') ? 10 : 20)), log: [...c.log, 'The assault was thrown back from the walls.'] } : null });
  if (!left) o = goHome(W(o, { ...o.world, engines: addEngines(o.world.engines, c.engines) }), r, c.battalions, `Survivors returning from ${r.name}`);
  return event(o, 'war', `The assault on ${r.name} failed.`);
});
export const demandSurrender = () => update((s) => {
  const c = s.world.campaign; if (!c || c.phase !== 'siege') return; const r = rival(s, c.target)!;
  if (Math.random() < surrenderChance(c)) return conquer(s, r);
  emit({ kind: 'info', text: `${r.ruler} refuses to yield.` });
  return W(s, { ...s.world, campaign: { ...c, garrisonMorale: Math.min(100, c.garrisonMorale + 8), log: [...c.log, `${r.ruler} defiantly refuses to surrender.`] } });
});

// ---------------- defending your castle ----------------
export const callAllies = () => update((s) => {
  const t = s.world.threat; if (!t) return;
  const ids = s.world.rivals.filter((r) => r.status === 'ally' && r.relation >= 50 && r.id !== t.rival).map((r) => r.id);
  if (!ids.length) return 'You have no allies who will come';
  emit({ kind: 'info', text: `${ids.length} all${ids.length > 1 ? 'ies answer' : 'y answers'} your call!` });
  let w: WorldState = { ...s.world, threat: { ...t, allyHelp: ids } }; for (const id of ids) w = shiftRelations(w, id, -5, false);
  return W(s, w);
});
export const defend = (tactic: Tactic) => update((s) => {
  const t = s.world.threat; if (!t) return; const r = rival(s, t.rival)!;
  const mine = unitsOf(homeSquads(s)), a = [...mine, ...allyUnits(s, t.allyHelp, 0.35)], foe = armyOf(r, t.power), seed = Date.now() % 100000;
  const homeBats = s.battalions.filter((b) => !awayBats(s).has(b.id)).map((b) => b.id);
  const cmd = commanderOf(s, homeBats, 'defend', a);
  const lock = a.length ? tacticLock(a, tactic, 'hills', cmd) : null; if (lock) return lock;
  // simulate with the enemy as attacker and you behind your walls
  let res = simulate({ name: r.name, units: foe, commander: Math.min(4, r.level - 1), tactic: enemyTactic(r, seed) }, { name: 'Your garrison', units: a.length ? a : [{ cls: 'peasant', count: 5, rank: 0 }], commander: cmd, tactic, fort: fortOf(s) }, 'hills', seed, true);
  res = capLosses(res, 'b', lossCap(s, homeBats, 0.25));
  const won = res.winner === 'b';
  let o = record(applyLosses(s, a, res.lossB), homeBats.filter((id) => s.squads.some((q) => q.bat === id)), won);
  const flipped: BattleResult = { ...res, winner: won ? 'a' : 'b', lossA: res.lossB, lossB: res.lossA, startA: res.startB, startB: res.startA, moraleA: res.moraleB, moraleB: res.moraleA };
  play(`Defence of your castle`, a, foe, flipped, 'Your garrison', r.name, 0xb3242a, r.color, undefined, { biome: 'grassland', walls: count(s, 'wall') + count(s, 'gatehouse') > 0 ? { side: 0, kind: 'wall' } : count(s, 'palisade') > 0 ? { side: 0, kind: 'palisade' } : undefined, cry: cryOf(s, homeBats, 'defend') });
  o = report(o, `Defence against ${r.name}`, won, flipped, a, foe, won ? defenceSpoils(r) : undefined);
  let w = { ...o.world, threat: null, rivals: o.world.rivals.map((x) => (x.id === r.id ? { ...x, power: Math.round(x.power * (won ? 0.6 : 0.9)), relation: Math.min(100, x.relation + 10), beaten: won ? 1 : x.beaten } : x)) };
  if (won) { o = ledger(W(o, w), 'loot', uid(), defenceSpoils(r)); emit({ kind: 'achieve', text: `${r.name}'s host is broken before your walls!` }); }
  else {
    const take = { gold: Math.min(5000, Math.floor(o.res.gold * 0.15)), wood: Math.floor(o.res.wood * 0.1), stone: Math.floor(o.res.stone * 0.1) };
    o = spend(W(o, w), take); emit({ kind: 'war', text: `${r.name} breaks in and carries off ${take.gold} gold before withdrawing. Your buildings stand.` });
  }
  void w;
  return event(o, 'war', won ? `Repelled ${r.name}'s siege.` : `${r.name} plundered your stores and withdrew.`);
});
export const payTribute = () => update((s) => {
  const t = s.world.threat; if (!t) return; const r = rival(s, t.rival)!, gold = Math.min(Math.floor(s.res.gold), 150 * r.level + 50 * s.stage);
  const o = spend(s, { gold });
  emit({ kind: 'info', text: `${r.name} accepts ${gold} gold and withdraws.` });
  return event(W(o, { ...shiftRelations(o.world, r.id, 20, false), threat: null }), 'diplomacy', `Paid ${gold} gold tribute to ${r.name}.`);
});
export { TACTICS, NO_ENGINES };

/** Publicly praise a successful commander: they gain an honour (and rating), the realm hears of it. */
export const praiseCommander = (batId: string) => update((s) => {
  const b = s.battalions.find((x) => x.id === batId); if (!b) return;
  const ready = praiseReady(b.commander); if (!ready.ok) return ready.why;
  if (!canAfford(s.res, ready.honor.cost)) return 'Not enough to pay for the ceremony';
  const c = { ...b.commander, honors: (b.commander.honors ?? 0) + 1 };
  let o = mark(spend({ ...s, battalions: s.battalions.map((x) => (x.id === batId ? { ...x, commander: c } : x)) }, ready.honor.cost), 'battalions', batId);
  o = { ...o, squads: o.squads.map((q) => (q.bat === batId ? { ...q, xp: q.xp + 25 } : q)) }; for (const q of o.squads) if (q.bat === batId) o = mark(o, 'squads', q.id);
  o = W(o, praiseEffects(o.world));
  emit({ kind: 'achieve', text: `${styled(c)} is named ${ready.honor.name}!`, big: true });
  return event(o, 'command', `${styled(c)} of the ${b.name} was named ${ready.honor.name} before the court.`);
});
/** Nobles and commons approve of honoured heroes. */
const praiseEffects = (w: WorldState): WorldState => ({ ...w, court: adjust(courtOf(w), { nobles: 6, commons: 3 }) });

