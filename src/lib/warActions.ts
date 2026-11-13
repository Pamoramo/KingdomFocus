// Player actions for diplomacy and war. Every resource change goes through the ledger.
import { type GameState, type Squad, _internal, studyHooks, emit, getState, setState, count, maxLevel, has, armySize, canAfford, TILE, CAMP_X, CAMP_Y } from './state.ts';
import { type Res, ZERO, scale } from './rewards.ts';
import { simulate, capLosses, sidePower, tacticLock, type Unit, type Tactic, type BattleResult, TACTICS } from './battle.ts';
import { type WorldState, type Rival, type Engine, type Engines, type Stance, type Report, ENGINES, ENGINE_IDS, NO_ENGINES, SUPPLY_COST, advanceDays, tradeQuote, canTrade, giftRelation, shiftRelations, setStatus, newCampaign, siegeProgress, surrenderChance, wallFort, castleFort, armyOf, dayStr } from './war.ts';
import { uid } from './study.ts';
import { RANKS } from './economy.ts';

const { update, ledger, spend, mark, kill, event } = _internal;
const W = (s: GameState, w: WorldState): GameState => ({ ...s, world: w });
const rival = (s: GameState, id: string) => s.world.rivals.find((r) => r.id === id);

// ---------------- army helpers ----------------
export const awayBats = (s: GameState) => new Set([...(s.world.campaign?.battalions ?? []), ...s.world.loans.map((l) => l.bat)]);
export const homeSquads = (s: GameState) => { const away = awayBats(s); return s.squads.filter((q) => !away.has(q.bat)); };
export const unitsOf = (squads: Squad[]): Unit[] => squads.map((q) => ({ cls: q.cls, count: q.count, rank: q.rank, ref: q.id }));
export const campaignSquads = (s: GameState) => s.squads.filter((q) => s.world.campaign?.battalions.includes(q.bat));
export const fortOf = (s: GameState) => castleFort({ wall: count(s, 'wall'), palisade: count(s, 'palisade'), tower: count(s, 'tower'), gatehouse: count(s, 'gatehouse'), gate: count(s, 'gate'), moat: count(s, 'moat'), keep: maxLevel(s, 'keep'), watchtower: count(s, 'watchtower') });
export const myPower = (s: GameState) => sidePower(unitsOf(s.squads));
const commanderOf = (s: GameState, bats: string[]) => Math.max(0, ...s.battalions.filter((b) => bats.includes(b.id)).map((b) => b.commander.rank));
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
function play(title: string, a: Unit[], b: Unit[], result: BattleResult, aName: string, bName: string, aColor: number, bColor: number, engines?: Engines) {
  emit({ kind: 'battle', text: title, battle: { title, a, b, result, aName, bName, aColor, bColor, engines } });
}

// ---------------- daily world turn & study hooks ----------------
export const worldTick = () => {
  const s = getState(), today = dayStr();
  if (s.world.lastDay === today) return;
  const w = advanceDays(s.world, { stage: s.stage, myPower: myPower(s), fort: fortOf(s), active: true }, today);
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
    if (r.desert) { o = W(o, w); const sq = campaignSquads(o); o = applyLosses(o, unitsOf(sq), sq.map((q) => Math.min(q.count, Math.ceil(q.count * 0.03)))); w = o.world; }
  }
  // loaned battalions come home after enough study
  const back = w.loans.filter((l) => l.leftMin - minutes <= 0);
  w = { ...w, loans: w.loans.map((l) => ({ ...l, leftMin: l.leftMin - minutes })).filter((l) => l.leftMin > 0) };
  for (const l of back) { emit({ kind: 'info', text: `${s.battalions.find((b) => b.id === l.bat)?.name ?? 'A battalion'} returns from aiding ${rival(s, l.rival)?.name}.` }); }
  return W(o, w);
});

// ---------------- diplomacy ----------------
export const trade = (id: string, give: keyof Res, amount: number, want: keyof Res) => update((s) => {
  const r = rival(s, id); if (!r) return; const why = canTrade(r); if (why) return why;
  amount = Math.floor(amount); if (amount <= 0 || give === want) return 'Choose an amount and two different goods';
  if (!canAfford(s.res, { [give]: amount })) return 'Not enough to trade';
  const q = tradeQuote(r, give, amount, want), today = dayStr();
  let o = spend(s, { [give]: amount });
  o = ledger(o, 'trade', uid(), { ...ZERO, [want]: q.got });
  let w = shiftRelations(o.world, id, q.rel, false);
  w = { ...w, rivals: w.rivals.map((x) => (x.id === id ? { ...x, trades: x.lastTradeDay === today ? x.trades + 1 : 1, lastTradeDay: today } : x)) };
  emit({ kind: 'info', text: `Traded with ${r.name}: +${q.got} ${want}, relations +${q.rel}` });
  return event(W(o, w), 'diplomacy', `Traded ${amount} ${give} with ${r.name} for ${q.got} ${want}.`);
});
export const gift = (id: string, gold: number) => update((s) => {
  const r = rival(s, id); if (!r || r.bandits) return 'They will not accept';
  if (!canAfford(s.res, { gold })) return 'Not enough gold';
  const rel = giftRelation(r, gold); if (rel < 1) return `Too small a gift for a level ${r.level} kingdom`;
  emit({ kind: 'info', text: `${r.name} welcomes your gift (+${rel} relations)` });
  return event(W(spend(s, { gold }), shiftRelations(s.world, id, rel)), 'diplomacy', `Sent a gift of ${gold} gold to ${r.name}.`);
});
export const sendAid = (id: string, batId: string) => update((s) => {
  const r = rival(s, id); if (!r || r.bandits) return 'Not possible';
  if (r.status === 'war') return 'You are at war with them';
  if (r.relation < -10) return 'They do not trust you enough to accept troops';
  if (awayBats(s).has(batId)) return 'That battalion is already away';
  const sq = s.squads.filter((q) => q.bat === batId), p = sidePower(unitsOf(sq)); if (!sq.length) return 'That battalion has no soldiers';
  const rel = Math.min(25, 4 + Math.round((p / Math.max(50, r.power)) * 80));
  let o = W(s, { ...shiftRelations(s.world, id, rel), loans: [...s.world.loans, { bat: batId, rival: id, leftMin: 60 }] });
  o = { ...o, squads: o.squads.map((q) => (q.bat === batId ? { ...q, xp: q.xp + 30 } : q)) }; for (const q of sq) o = mark(o, 'squads', q.id);
  o = { ...o, world: { ...o.world, inbox: o.world.inbox.filter((m) => !(m.rival === id && m.kind === 'aid_request')) } };
  emit({ kind: 'info', text: `Your troops march to aid ${r.name} (+${rel} relations). They return after 60 minutes of study.` });
  return event(o, 'diplomacy', `Sent troops to aid ${r.name}.`);
});
export const proposeAlliance = (id: string) => update((s) => {
  const r = rival(s, id); if (!r || r.bandits) return 'Not possible';
  if (r.status === 'war') return 'Make peace first';
  if (r.relation < 60) return `${r.ruler} does not trust you enough yet (relations ${r.relation}/60)`;
  emit({ kind: 'achieve', text: `Alliance sealed with ${r.name}!` });
  return event(W(s, shiftRelations(setStatus(s.world, id, 'ally'), id, 10)), 'diplomacy', `Formed an alliance with ${r.name}.`);
});
export const breakAlliance = (id: string) => update((s) => { const r = rival(s, id); if (!r) return; return event(W(s, shiftRelations(setStatus(s.world, id, 'neutral'), id, -30)), 'diplomacy', `Ended the alliance with ${r.name}.`); });
export const declareWar = (id: string) => update((s) => {
  const r = rival(s, id); if (!r) return; if (r.status === 'war') return 'Already at war'; if (r.status === 'vassal') return 'They are your vassal';
  let w = shiftRelations(setStatus(s.world, id, 'war'), id, -Math.max(40, r.relation + 60));
  if (r.status === 'ally') w = { ...w, rivals: w.rivals.map((x) => (x.id === id ? x : { ...x, relation: Math.max(-100, x.relation - 15) })) }; // betrayal is noticed
  emit({ kind: 'war', text: `War declared on ${r.name}!` });
  return event(W(s, w), 'war', `Declared war on ${r.name}.`);
});
export const offerPeace = (id: string, gold: number) => update((s) => {
  const r = rival(s, id); if (!r || r.status !== 'war') return 'Not at war';
  if (s.world.campaign?.target === id) return 'Lift your siege first';
  const need = r.beaten ? 0 : 100 * r.level;
  if (gold < need) return `${r.name} wants ${need} gold to make peace`;
  if (!canAfford(s.res, { gold })) return 'Not enough gold';
  let o = gold ? spend(s, { gold }) : s;
  const w = setStatus(s.world, id, 'neutral');
  o = W(o, { ...w, rivals: w.rivals.map((x) => (x.id === id ? { ...x, relation: Math.max(x.relation, -25), beaten: 0 } : x)), threat: s.world.threat?.rival === id ? null : s.world.threat });
  emit({ kind: 'info', text: `Peace with ${r.name}.` });
  return event(o, 'diplomacy', `Made peace with ${r.name}.`);
});
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
  const lock = tacticLock(a, tactic, r.terrain, commanderOf(s, c.battalions)); if (lock) return lock;
  const foe = armyOf(r, r.power * 0.6), seed = Date.now() % 100000;
  let res = simulate({ name: 'Your host', units: a, commander: commanderOf(s, c.battalions), tactic, engines: { ballista: c.engines.ballista } }, { name: r.name, units: foe, commander: Math.min(4, r.level - 1), tactic: enemyTactic(r, seed) }, r.terrain, seed);
  res = capLosses(res, 'a', 0.6);
  let o = applyLosses(s, a, res.lossA);
  const killed = sidePower(foe.map((u, i) => ({ ...u, count: res.lossB[i] })));
  const w = { ...o.world, rivals: o.world.rivals.map((x) => (x.id === r.id ? { ...x, power: Math.max(10, Math.round(x.power - killed * 1.4)), beaten: res.winner === 'a' ? 1 : x.beaten } : x)) };
  if (res.winner === 'a') o = W(o, { ...w, campaign: { ...c, phase: 'siege', log: [...c.log, `Victory in the field! The siege of ${r.name} begins.`] } });
  else o = W(o, { ...w, campaign: null, engines: addEngines(w.engines, c.engines), supplies: w.supplies + c.supplies });
  o = ledger(o, 'loot', uid(), res.winner === 'a' ? { ...ZERO, renown: 10 * r.level } : ZERO);
  o = report(o, `Battle before ${r.name}`, res.winner === 'a', res, a, foe);
  play(`Battle before ${r.name}`, a, foe, res, 'Your host', r.name, s.battalions.find((b) => b.id === c.battalions[0])?.color ?? 0xb3242a, r.color);
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
  return event(W(s, { ...s.world, campaign: null, engines: addEngines(s.world.engines, c.engines), supplies: s.world.supplies + c.supplies }), 'war', `Lifted the siege of ${r.name}.`);
});
function conquer(s: GameState, r: Rival): GameState {
  const loot: Res = { gold: 300 * r.level ** 2, wood: 0, stone: 80 * r.level ** 2, renown: 60 * r.level };
  const c = s.world.campaign!;
  let o = ledger(s, 'loot', uid(), loot);
  const w = { ...o.world, campaign: null, engines: addEngines(o.world.engines, c.engines), supplies: o.world.supplies + c.supplies, conquests: o.world.conquests + 1,
    rivals: o.world.rivals.map((x) => (x.id === r.id ? { ...x, status: 'vassal' as const, power: Math.round(x.power * 0.3), garrison: 0, relation: 20 } : r.friends.includes(x.id) ? { ...x, relation: Math.max(-100, x.relation - 20) } : x)) };
  o = W(o, w);
  emit({ kind: 'stage', text: `${r.name} has fallen! It is now your vassal.`, res: loot, big: true });
  return event(o, 'war', `Conquered ${r.name}. Its lord swears fealty to you.`);
}
/** Storm the walls. Walls, rams and siege towers decide how costly it is. */
export const assault = (tactic: Tactic) => update((s) => {
  const c = s.world.campaign; if (!c || c.phase !== 'siege') return 'No siege under way';
  const r = rival(s, c.target)!, mine = unitsOf(campaignSquads(s)), a = [...mine, ...allyUnits(s, c.allies, 0.2)];
  if (!mine.length) return 'No soldiers left in the siege camp';
  const lock = tacticLock(a, tactic, r.terrain, commanderOf(s, c.battalions)); if (lock) return lock;
  const garrisonPower = Math.max(5, c.garrison) * (0.6 + c.garrisonMorale / 250), foe = armyOf(r, garrisonPower), seed = Date.now() % 100000;
  let res = simulate({ name: 'Your host', units: a, commander: commanderOf(s, c.battalions), tactic, engines: { ram: c.engines.ram, tower: c.engines.tower, ballista: c.engines.ballista } },
    { name: `${r.name} garrison`, units: foe, commander: Math.min(4, r.level - 1), tactic: 'shieldwall', fort: wallFort(c) }, r.terrain, seed, true);
  res = capLosses(res, 'a', 0.5);
  let o = applyLosses(s, a, res.lossA);
  play(`Assault on ${r.name}`, a, foe, res, 'Your host', r.name, s.battalions.find((b) => b.id === c.battalions[0])?.color ?? 0xb3242a, r.color, c.engines);
  o = report(o, `Assault on ${r.name}`, res.winner === 'a', res, a, foe);
  if (res.winner === 'a') return conquer(o, r);
  const killed = sidePower(foe.map((u, i) => ({ ...u, count: res.lossB[i] })));
  const left = campaignSquads(o).length;
  o = W(o, { ...o.world, campaign: left ? { ...c, garrison: Math.max(0, Math.round(c.garrison - killed)), morale: Math.max(0, c.morale - 20), log: [...c.log, 'The assault was thrown back from the walls.'] } : null });
  if (!left) o = W(o, { ...o.world, engines: addEngines(o.world.engines, c.engines) });
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
  const lock = a.length ? tacticLock(a, tactic, 'hills', commanderOf(s, homeBats)) : null; if (lock) return lock;
  // simulate with the enemy as attacker and you behind your walls
  let res = simulate({ name: r.name, units: foe, commander: Math.min(4, r.level - 1), tactic: enemyTactic(r, seed) }, { name: 'Your garrison', units: a.length ? a : [{ cls: 'peasant', count: 5, rank: 0 }], commander: commanderOf(s, homeBats), tactic, fort: fortOf(s) }, 'hills', seed, true);
  res = capLosses(res, 'b', 0.25);
  let o = applyLosses(s, a, res.lossB);
  const won = res.winner === 'b';
  const flipped: BattleResult = { ...res, winner: won ? 'a' : 'b', lossA: res.lossB, lossB: res.lossA, startA: res.startB, startB: res.startA, moraleA: res.moraleB, moraleB: res.moraleA };
  play(`Defence of your castle`, a, foe, flipped, 'Your garrison', r.name, 0xb3242a, r.color);
  o = report(o, `Defence against ${r.name}`, won, flipped, a, foe, won ? { gold: 150 * r.level, renown: 30 * r.level } : undefined);
  let w = { ...o.world, threat: null, rivals: o.world.rivals.map((x) => (x.id === r.id ? { ...x, power: Math.round(x.power * (won ? 0.6 : 0.9)), relation: Math.min(100, x.relation + 10), beaten: won ? 1 : x.beaten } : x)) };
  if (won) { o = ledger(W(o, w), 'loot', uid(), { ...ZERO, gold: 150 * r.level, renown: 30 * r.level }); emit({ kind: 'achieve', text: `${r.name}'s host is broken before your walls!` }); }
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
