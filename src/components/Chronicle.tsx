'use client';
import { useState } from 'react';
import { useGame, fmt, hm } from './hooks.ts';
import { ACHIEVEMENTS, armySize, maxLevel, type GameState, type StudyRecord } from '../lib/state.ts';
import { BUILDINGS, STAGES } from '../lib/economy.ts';
import { dayKey, consistency, streak } from '../lib/habits.ts';
import { Cost, Section, Tabs } from './Cost.tsx';

const DAY = 864e5;
const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const mins = (list: StudyRecord[]) => list.reduce((a, r) => a + r.verifiedSec, 0) / 60;
const since = (s: GameState, t: number) => s.sessions.filter((r) => r.startedAt >= t);

/** Plain-language summary of today, computed from saved records. */
export function todaySummary(s: GameState) {
  const t0 = startOfDay(), today = since(s, t0), m = Math.round(mins(today)), gold = today.reduce((a, r) => a + r.reward.gold, 0);
  const ev = s.events.filter((e) => e.t >= t0), recruits = ev.filter((e) => e.type === 'recruit').reduce((a, e) => a + (e.n ?? 0), 0);
  const built = ev.filter((e) => e.type === 'build' || e.type === 'upgrade').map((e) => e.text.replace(/^(Built an? |Upgraded to )/, '').replace(/\.$/, ''));
  const habits = s.completions.filter((c) => c.done && c.at >= t0).length;
  const parts: string[] = [];
  parts.push(m ? `You studied for ${hm(m)} today. Your kingdom earned ${fmt(gold)} gold from it.` : 'No study logged yet today. Your kingdom awaits.');
  const acts = [recruits && `recruited ${recruits} soldier${recruits > 1 ? 's' : ''}`, built.length && `completed ${built.length > 2 ? `${built.length} works` : built.map((b) => `a new ${b}`).join(' and ')}`, habits && `kept ${habits} habit${habits > 1 ? 's' : ''}`].filter(Boolean);
  if (acts.length) parts.push(`You ${acts.join(', ')}.`);
  return parts.join(' ');
}

function DayBars({ s }: { s: GameState }) {
  const days = Array.from({ length: 14 }, (_, i) => startOfDay(new Date(Date.now() - (13 - i) * DAY)));
  const data = days.map((d) => { const l = s.sessions.filter((r) => r.startedAt >= d && r.startedAt < d + DAY); return { d, timed: mins(l.filter((r) => r.source !== 'manual')), manual: mins(l.filter((r) => r.source === 'manual')) }; });
  const max = Math.max(60, ...data.map((x) => x.timed + x.manual));
  return <div className="flex items-end gap-1 h-28" role="img" aria-label="Minutes studied per day for the last 14 days">{data.map((x) => <div key={x.d} className="flex-1 flex flex-col items-center justify-end h-full" title={`${new Date(x.d).toLocaleDateString()}: ${Math.round(x.timed)} timed, ${Math.round(x.manual)} manual`}>
    <span className="text-[10px]">{Math.round(x.timed + x.manual) || ''}</span>
    <div className="w-full bg-black/20 rounded-t-sm" style={{ height: `${(x.manual / max) * 100}%` }} />
    <div className="w-full bg-gold border border-wood" style={{ height: `${(x.timed / max) * 100}%` }} />
    <span className="text-[10px]">{new Date(x.d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span></div>)}</div>;
}

export function ChroniclePanel() {
  const s = useGame(), [tab, setTab] = useState<'dashboard' | 'history' | 'honours'>('dashboard'), [range, setRange] = useState<'week' | 'month' | 'all'>('week');
  const now = Date.now(), week = since(s, now - 7 * DAY), month = since(s, now - 30 * DAY), today = since(s, startOfDay());
  const ci = s.sessions.reduce((a, r) => [a[0] + r.checkIns, a[1] + r.missed], [0, 0]);
  const pool = range === 'week' ? week : range === 'month' ? month : s.sessions, bySubj = new Map<string, number>();
  pool.forEach((r) => bySubj.set(r.subject, (bySubj.get(r.subject) ?? 0) + r.verifiedSec / 60));
  const total = [...bySubj.values()].reduce((a, b) => a + b, 0), keep = maxLevel(s, 'keep');
  const Stat = ({ k, v }: { k: string; v: string }) => <div className="card p-2"><div className="text-xs opacity-70">{k}</div><div className="font-bold text-lg leading-tight">{v}</div></div>;
  return <div className="space-y-3">
    <Tabs value={tab} onChange={setTab} items={[['dashboard', 'Dashboard'], ['history', 'History'], ['honours', 'Honours']]} />
    {tab === 'dashboard' && <>
      <div className="card p-2.5 text-sm italic">{todaySummary(s)}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat k="Today" v={hm(mins(today))} /><Stat k="Last 7 days" v={hm(mins(week))} /><Stat k="Last 30 days" v={hm(mins(month))} />
        <Stat k="Lifetime study" v={`${(mins(s.sessions) / 60).toFixed(1)} h`} /><Stat k="Sessions" v={String(s.sessions.filter((r) => r.endedAt).length)} /><Stat k="Check-ins kept" v={ci[0] + ci[1] ? `${Math.round((ci[0] / (ci[0] + ci[1])) * 100)}%` : '—'} />
        <Stat k="Troops" v={fmt(armySize(s))} /><Stat k="Battalions" v={String(s.battalions.length)} /><Stat k="Castle" v={keep ? BUILDINGS.keep.levels[keep - 1].name : 'No keep'} />
      </div>
      <Section title="Treasury"><Cost cost={s.res} /><div className="text-xs opacity-70">Lifetime earned: <Cost cost={s.lifetime} /></div></Section>
      <Section title="Study, last 14 days" right={<span className="text-xs">gold = timed · grey = manual</span>}><DayBars s={s} /></Section>
      <Section title="Subjects" right={<select className="inp !w-auto !py-0 text-sm" value={range} onChange={(e) => setRange(e.target.value as 'week')}><option value="week">7 days</option><option value="month">30 days</option><option value="all">All time</option></select>}>
        {[...bySubj].sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="text-sm"><div className="flex justify-between"><span>{k}</span><span>{hm(v)} · {Math.round((v / total) * 100)}%</span></div><div className="h-2 bg-black/15 rounded-sm"><div className="h-full bg-gold rounded-sm" style={{ width: `${(v / total) * 100}%` }} /></div></div>)}
        {!total && <p className="text-sm italic">No study in this period yet.</p>}
      </Section>
      {s.habits.length > 0 && <Section title="Habit consistency (30 periods)">
        {s.habits.map((h) => <div key={h.id} className="text-sm"><div className="flex justify-between"><span>{h.name}</span><span>streak {streak(h, new Date())} · {Math.round(consistency(h, new Date()) * 100)}%</span></div><div className="h-2 bg-black/15 rounded-sm"><div className="h-full bg-moss rounded-sm" style={{ width: `${consistency(h, new Date()) * 100}%` }} /></div></div>)}
        <div className="text-xs opacity-70">Completions in the last 7 days: {s.completions.filter((c) => c.done && c.at > now - 7 * DAY).length}</div>
      </Section>}
      <Section title="Milestones">{s.events.filter((e) => e.type === 'stage' || e.type === 'achieve').slice(0, 8).map((e) => <div key={e.id} className="text-sm flex justify-between gap-2"><span>{e.text}</span><span className="opacity-60 whitespace-nowrap">{new Date(e.t).toLocaleDateString()}</span></div>)}</Section>
    </>}
    {tab === 'history' && <Section title="Kingdom history">
      {s.events.slice(0, 200).map((e, i, a) => { const d = dayKey(new Date(e.t)), head = i === 0 || dayKey(new Date(a[i - 1].t)) !== d;
        return <div key={e.id}>{head && <div className="font-bold text-sm mt-2 border-b border-black/20">{new Date(e.t).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>}
          <div className="text-sm flex gap-2"><span className="opacity-60 tabular-nums">{new Date(e.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>{e.text}</span></div></div>; })}
    </Section>}
    {tab === 'honours' && <>
      <Section title={`Achievements ${s.achievements.length}/${ACHIEVEMENTS.length}`}>{ACHIEVEMENTS.map((a) => { const got = s.achievements.includes(a.id);
        return <div key={a.id} className={`flex justify-between gap-2 text-sm ${got ? '' : 'opacity-45'}`}><span>{got ? '★' : '☆'} <b>{a.name}</b>: {a.desc}{a.unlock && <span className="text-moss"> · unlocks {a.unlock.replace(':', ' ')}</span>}</span><span>+{a.renown}</span></div>; })}</Section>
      <Section title="Stages">{STAGES.map((st, i) => <div key={st.name} className={`text-sm ${i < s.stage ? '' : 'opacity-45'}`}>{i < s.stage ? '★' : '☆'} {i + 1}. {st.name}: {st.desc}</div>)}</Section>
    </>}
  </div>;
}
