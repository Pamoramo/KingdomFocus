'use client';
import { useState } from 'react';
import { useGame, useUI, fmt } from './hooks.ts';
import { CourtPanel, LandsPanel } from './Court.tsx';
import { STAGES, TECHS, TECH_IDS, BUILDINGS } from '../lib/economy.ts';
import { reqMet, research, has, canAfford, count, maxLevel, armySize, kingdomLevel, kingdomScore } from '../lib/state.ts';
import { Cost, Section, Bar, Tabs } from './Cost.tsx';
import { Preview } from './Build.tsx';

const ICON_KIND = ['camp', 'hut', 'barracks', 'keep', 'tower', 'palace'] as const;

export function RealmPanel() {
  const ui = useUI(), [tab, setTab] = useState<'kingdom' | 'court' | 'lands'>(ui.selRival?.startsWith('site') ? 'lands' : 'kingdom');
  return <div className="space-y-3">
    <Tabs value={tab} onChange={setTab} items={[['kingdom', 'Kingdom'], ['court', 'Court'], ['lands', 'Lands']]} />
    {tab === 'kingdom' && <Progress />}{tab === 'court' && <CourtPanel />}{tab === 'lands' && <LandsPanel />}
  </div>;
}
function Progress() {
  const s = useGame(), next = STAGES[s.stage];
  return <div className="space-y-3">
    <div className="card p-2.5 flex items-center gap-3">
      <div className="w-20 grid place-items-center"><Preview kind={ICON_KIND[s.stage - 1]} lvl={s.stage === 4 ? 2 : s.stage === 5 ? 4 : 1} max={72} /></div>
      <div className="flex-1"><div className="text-sm opacity-70">Stage {s.stage} of 6</div><h3 className="font-title text-3xl leading-none">{STAGES[s.stage - 1].name}</h3><div className="text-sm">{STAGES[s.stage - 1].desc}</div>
        <div className="text-sm mt-1">Kingdom level <b>{kingdomLevel(s)}</b> · might {fmt(kingdomScore(s))}</div></div>
    </div>
    {next ? <Section title={`Next: ${next.name}`}>
      <p className="text-xs opacity-75">{next.desc} New buildings, levels and technologies unlock at each stage.</p>
      {next.reqs.map((r) => {
        const ok = reqMet(s, r), have = r.troops ? armySize(s) : r.level ? maxLevel(s, r.kind!) : count(s, r.kind!), need = r.troops ?? r.level ?? r.count ?? 1;
        return <div key={r.label} className="text-sm space-y-0.5"><div className="flex justify-between"><span>{ok ? '✔' : '○'} {r.label}{r.kind ? ` (${BUILDINGS[r.kind].name})` : ''}</span><span>{Math.min(have, need)}/{need}</span></div><Bar value={have} max={need} color={ok ? 'bg-moss' : 'bg-gold'} /></div>;
      })}
    </Section> : <Section title="The Royal Citadel stands"><p className="text-sm">Your realm has reached its final stage. Keep growing your host, upgrade to the Imperial Palace, and fill your lands.</p></Section>}
    <Section title="Technologies">
      <div className="grid gap-1.5">{TECH_IDS.map((t) => {
        const d = TECHS[t], done = has(s, t), missing = d.req.filter((r) => !has(s, r)), locked = s.stage < d.stage || missing.length > 0;
        return <div key={t} className={`border rounded p-1.5 text-sm ${done ? 'border-moss bg-moss/10' : 'border-black/20'} ${locked && !done ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-2"><b className="flex-1">{done ? '✔ ' : ''}{d.name}</b>{!done && <button className="btn !py-0 text-sm" disabled={locked || !canAfford(s.res, d.cost)} onClick={() => research(t)}>Research</button>}</div>
          <div className="text-xs opacity-80">{d.desc}</div>
          {!done && <div className="flex flex-wrap gap-2 items-center"><Cost cost={d.cost} have={s.res} />{s.stage < d.stage && <span className="text-xs text-blood">stage {d.stage}</span>}{missing.length > 0 && <span className="text-xs text-blood">needs {missing.map((m) => TECHS[m].name).join(', ')}</span>}</div>}
        </div>;
      })}</div>
    </Section>
  </div>;
}
