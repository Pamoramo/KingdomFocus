'use client';
import { useState } from 'react';
import { useGame, useNow } from './hooks.ts';
import { Cost, Section } from './Cost.tsx';
import { SIZE, EARLY_MS, LATE_MS, rewardFor, addAssignment, completeAssignment, removeAssignment, type Assignment, type Size } from '../lib/assignments.ts';

const DAY = 864e5;
const SIZE_COL: Record<Size, string> = { small: 'bg-gold/70', medium: 'bg-orange-400/80', large: 'bg-blood/80 text-parch' };
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
/** "in 2d 4h", "in 35 min", "3h ago" */
function until(ms: number) {
  const a = Math.abs(ms), d = Math.floor(a / DAY), h = Math.floor((a % DAY) / 3600_000), m = Math.floor((a % 3600_000) / 60_000);
  const t = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m} min`;
  return ms >= 0 ? `in ${t}` : `${t} ago`;
}
function defaultDue() { const d = new Date(Date.now() + DAY); d.setHours(23, 59, 0, 0); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }

/** Coursework with deadlines: rewards for work done on time, penalties for the realm when it is missed. */
export function AssignmentsPanel() {
  const s = useGame(), now = useNow(30_000), list = s.world.assignments ?? [];
  const open = list.filter((a) => !a.done && !a.missed), late = list.filter((a) => a.missed && !a.done && now <= a.due + LATE_MS), past = list.filter((a) => a.done || (a.missed && !late.includes(a))).sort((a, b) => (b.done ?? b.missed ?? 0) - (a.done ?? a.missed ?? 0));
  return <div className="space-y-3">
    <p className="text-sm">Add your real assignments. Hand them in on time to earn rewards for the realm; a day early earns a bonus. Miss a deadline and the realm suffers.</p>
    <AddForm />
    <Chart list={list} now={now} />
    <Section title={`Due (${open.length})`}>
      {!open.length && <p className="text-sm italic">Nothing due. Add your next assignment above.</p>}
      {open.map((a) => <Row key={a.id} a={a} now={now} stage={s.stage} />)}
    </Section>
    {late.length > 0 && <Section title="Overdue: hand in late for a little">{late.map((a) => <Row key={a.id} a={a} now={now} stage={s.stage} />)}</Section>}
    {past.length > 0 && <Section title="Record">
      {past.slice(0, 12).map((a) => <div key={a.id} className="text-sm border-b border-black/10 pb-1">
        <div className="flex gap-2"><span className={a.done ? 'text-moss font-bold' : 'text-blood font-bold'}>{a.done ? '✓' : '✗'}</span><span className="flex-1"><b>{a.title}</b> <span className="text-xs opacity-70">{a.subject} · {SIZE[a.size].name}</span></span></div>
        <div className="text-xs pl-5">{a.done ? <>{a.done <= a.due ? 'On time' : 'Late'}: <Cost cost={a.paid ?? {}} plus /></> : a.penalty}</div>
      </div>)}
    </Section>}
  </div>;
}

function AddForm() {
  const s = useGame(), [title, setTitle] = useState(''), [subject, setSubject] = useState(s.subjects[0] ?? ''), [due, setDue] = useState(defaultDue()), [size, setSize] = useState<Size>('medium'), [msg, setMsg] = useState<string | null>(null);
  const dueMs = new Date(due).getTime(), r = rewardFor({ size, due: dueMs }, s.stage, Date.now());
  return <Section title="New assignment">
    <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); const m = addAssignment(title, subject, dueMs, size); setMsg(m ?? null); if (!m) setTitle(''); }}>
      <input className="inp" placeholder="e.g. Chapter 4 problem set" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-1"><input className="inp" list="subjects" placeholder="Subject" maxLength={40} value={subject} onChange={(e) => setSubject(e.target.value)} /><datalist id="subjects">{s.subjects.map((x) => <option key={x} value={x} />)}</datalist>
        <input className="inp" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      <div className="grid grid-cols-3 gap-1">{(Object.keys(SIZE) as Size[]).map((k) => <button type="button" key={k} title={SIZE[k].example} className={`btn text-sm ${size === k ? 'btn-gold' : ''}`} onClick={() => setSize(k)}>{SIZE[k].name}</button>)}</div>
      <div className="text-xs">e.g. {SIZE[size].example}. On time: <Cost cost={r} plus /> {dueMs - Date.now() > EARLY_MS && <span className="opacity-75">(+25% if done a day early)</span>}</div>
      <div className="text-xs text-blood">If missed: {SIZE[size].penalty}</div>
      <button className="btn btn-gold w-full">Add to the chart</button>
      {msg && <div className="text-sm text-blood">{msg}</div>}
    </form>
  </Section>;
}

/** Two weeks at a glance: each day's assignments, coloured by size; done ones ticked, missed ones crossed. */
function Chart({ list, now }: { list: Assignment[]; now: number }) {
  const d0 = startOfDay(now) - 2 * DAY, days = Array.from({ length: 14 }, (_, i) => d0 + i * DAY);
  return <Section title="Assignment chart">
    <div className="grid grid-cols-7 gap-1">{days.map((d) => { const items = list.filter((a) => a.due >= d && a.due < d + DAY), today = d === startOfDay(now);
      return <div key={d} className={`min-h-16 rounded-sm p-0.5 border ${today ? 'border-gold bg-gold/15' : 'border-black/15'} ${d < startOfDay(now) ? 'opacity-60' : ''}`}>
        <div className="text-[10px] leading-tight opacity-75">{new Date(d).toLocaleDateString([], { weekday: 'short' })} {new Date(d).getDate()}</div>
        {items.map((a) => <div key={a.id} title={`${a.title} (${SIZE[a.size].name}) due ${new Date(a.due).toLocaleString()}`} className={`text-[10px] leading-tight rounded-sm px-0.5 mt-0.5 truncate ${a.done ? 'bg-moss/70 text-parch' : a.missed ? 'bg-black/60 text-parch line-through' : SIZE_COL[a.size]}`}>{a.done ? '✓ ' : a.missed ? '✗ ' : ''}{a.title}</div>)}
      </div>; })}</div>
    <div className="flex gap-2 text-[10px] flex-wrap">{(Object.keys(SIZE) as Size[]).map((k) => <span key={k} className={`px-1 rounded-sm ${SIZE_COL[k]}`}>{SIZE[k].name}</span>)}<span className="px-1 rounded-sm bg-moss/70 text-parch">Done</span><span className="px-1 rounded-sm bg-black/60 text-parch">Missed</span></div>
  </Section>;
}

function Row({ a, now, stage }: { a: Assignment; now: number; stage: number }) {
  const left = a.due - now, r = rewardFor(a, stage, now), urgent = left < DAY && left > 0;
  return <div className={`text-sm border-b border-black/10 pb-1.5 space-y-0.5 ${urgent ? 'bg-blood/10 -mx-1 px-1' : ''}`}>
    <div className="flex items-center gap-2"><span className={`w-2 h-6 rounded-sm ${SIZE_COL[a.size]}`} /><span className="flex-1 min-w-0"><b>{a.title}</b> <span className="text-xs opacity-70">{a.subject} · {SIZE[a.size].name}</span></span>
      <span className={`text-xs whitespace-nowrap ${left < 0 ? 'text-blood font-bold' : urgent ? 'font-bold' : ''}`}>{left >= 0 ? 'due ' : 'was due '}{until(left)}</span></div>
    <div className="flex items-center gap-2 text-xs"><span className="flex-1">{left > EARLY_MS ? 'Early bonus now: ' : left > 0 ? 'Reward: ' : 'Late: '}<Cost cost={r} plus /></span>
      <button className="btn btn-gold !py-0" onClick={() => completeAssignment(a.id)}>Done</button>
      {!a.missed && <button className="btn !py-0" title="Withdraw" onClick={() => confirm(`Withdraw "${a.title}"?`) && removeAssignment(a.id)}>✕</button>}</div>
    {!a.missed && <div className="text-xs text-blood/80">If missed: {SIZE[a.size].penalty}</div>}
  </div>;
}

/** Assignments due within a day, for the tab badge. */
export const assignmentBadge = (s: { world: { assignments?: Assignment[] } }, now = Date.now()) => (s.world.assignments ?? []).filter((a) => !a.done && !a.missed && a.due - now < DAY).length;
