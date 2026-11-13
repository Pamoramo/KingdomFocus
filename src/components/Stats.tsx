'use client';
import { useGame, fmt } from './hooks.ts';
import { ACHIEVEMENTS, armySize, keepLevel } from '../lib/state.ts';
import { BUILDINGS } from '../lib/economy.ts';
import { dayKey } from '../lib/habits.ts';
import { Icon } from './Icon.tsx';

export function StatsPanel() {
  const s = useGame(), H = s.history;
  const all = s.session ? [s.session, ...H] : H;
  const mins = (ms: number) => Math.floor(ms / 60000);
  const total = mins(all.reduce((a, h) => a + h.verifiedMs, 0));
  const ci = all.flatMap((h) => h.checkIns), ok = ci.filter((c) => !c.missed).length;
  const longest = mins(Math.max(0, ...all.flatMap((h) => [...h.chains, h.chainMs])));
  const bySubj = new Map<string, number>(); all.forEach((h) => bySubj.set(h.subject, (bySubj.get(h.subject) ?? 0) + mins(h.verifiedMs)));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d; });
  const perDay = days.map((d) => mins(all.filter((h) => dayKey(new Date(h.startedAt)) === dayKey(d)).reduce((a, h) => a + h.verifiedMs, 0)));
  const max = Math.max(30, ...perDay);
  const studyDays = new Set(all.map((h) => dayKey(new Date(h.startedAt))));
  let streak = 0; for (const d = new Date(); studyDays.has(dayKey(d)) || (streak === 0 && dayKey(d) === dayKey(new Date())); d.setDate(d.getDate() - 1)) { if (studyDays.has(dayKey(d))) streak++; else if (streak === 0 && dayKey(d) === dayKey(new Date())) continue; }
  const Stat = ({ k, v }: { k: string; v: string }) => <div className="panel p-2"><div className="text-xs opacity-70">{k}</div><div className="font-bold text-lg">{v}</div></div>;
  return <div className="space-y-3">
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Stat k="Verified study" v={`${Math.floor(total / 60)}h ${total % 60}m`} /><Stat k="Sessions" v={String(H.length)} />
      <Stat k="Longest focus" v={`${longest} min`} /><Stat k="Check-ins" v={ci.length ? `${ok}/${ci.length} (${Math.round((ok / ci.length) * 100)}%)` : '—'} />
      <Stat k="Study day streak" v={`${streak} days`} /><Stat k="Realm" v={`${BUILDINGS.keep.levels[keepLevel(s) - 1].name}`} />
      <Stat k="Army" v={`${armySize(s)} soldiers`} /><Stat k="Buildings" v={String(s.buildings.length)} />
      <div className="panel p-2"><div className="text-xs opacity-70">Lifetime earned</div><div className="text-sm"><Icon name="gold" size={12} /> {fmt(s.lifetime.gold)} <Icon name="renown" size={12} /> {fmt(s.lifetime.renown)}</div></div>
    </div>
    <div className="panel p-2"><div className="text-sm font-bold mb-1">Last 7 days (minutes)</div>
      <div className="flex items-end gap-1 h-24">{perDay.map((m, i) => <div key={i} className="flex-1 flex flex-col items-center justify-end h-full"><span className="text-[10px]">{m || ''}</span><div className="w-full bg-gold border border-wood rounded-t-sm" style={{ height: `${(m / max) * 100}%` }} /><span className="text-[10px]">{days[i].toLocaleDateString(undefined, { weekday: 'narrow' })}</span></div>)}</div></div>
    {bySubj.size > 0 && <div className="panel p-2 text-sm"><b>By subject</b>{[...bySubj].sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span>{v} min</span></div>)}</div>}
    <div className="panel p-2 text-sm"><b>Recent sessions</b>{H.slice(0, 12).map((h) => <div key={h.id} className="flex justify-between gap-2 border-b border-parch-d py-0.5"><span>{new Date(h.startedAt).toLocaleDateString()} {h.subject}</span><span>{mins(h.verifiedMs)}m · {fmt(h.awarded.gold)}g · {h.checkIns.filter((c) => c.missed).length} missed</span></div>)}{!H.length && <div className="italic opacity-60">None yet</div>}</div>
    <div className="panel p-2 text-sm"><b>Achievements</b>{ACHIEVEMENTS.map((a) => <div key={a.id} className={`flex justify-between ${s.achievements.includes(a.id) ? '' : 'opacity-40'}`}><span>{s.achievements.includes(a.id) ? '★' : '☆'} {a.name}: {a.desc}</span><span>+{a.renown}</span></div>)}</div>
  </div>;
}
