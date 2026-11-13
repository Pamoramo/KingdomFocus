'use client';
import { useState } from 'react';
import { useGame } from './hooks.ts';
import { addHabit, removeHabit, editHabit, habitProgress } from '../lib/state.ts';
import { doneNow, streak, periodKey, habitReward, consistency, dayKey, weekKey, WEIGHTS, type Freq, type Habit } from '../lib/habits.ts';
import { Cost, Section, Bar } from './Cost.tsx';

function History({ h }: { h: Habit }) {
  const daily = h.freq === 'daily', n = daily ? 28 : 12;
  const keys = Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i) * (daily ? 1 : 7)); return daily ? dayKey(d) : weekKey(d); });
  return <div className="flex gap-0.5">{keys.map((k) => <div key={k} title={k} className={`h-2.5 flex-1 rounded-sm ${h.done.includes(k) ? 'bg-moss' : h.log[k] ? 'bg-gold' : 'bg-black/15'}`} />)}</div>;
}

function HabitCard({ h }: { h: Habit }) {
  const now = new Date(), done = doneNow(h, now), st = streak(h, now), k = periodKey(h, now), prog = h.log[k] ?? 0;
  const [note, setNote] = useState(''), [edit, setEdit] = useState(false);
  const next = habitReward(h, done ? st : st + 1);
  return <div className="card p-2 space-y-1.5">
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0"><b>{h.name}</b> <span className="text-xs opacity-70">{h.freq} · {WEIGHTS[h.weight - 1]}</span>
        <div className="text-xs">Streak <b>{st}</b> · best {h.best} · {Math.round(consistency(h, now) * 100)}% consistent</div>
        {!done && <Cost cost={next} plus />}</div>
      {done ? <span className="btn btn-gold !cursor-default">Done</span>
        : h.target > 1 ? <div className="flex gap-1"><button className="btn" onClick={() => habitProgress(h.id, 1, note)}>+1</button><button className="btn btn-gold" onClick={() => habitProgress(h.id, h.target, note)}>All</button></div>
          : <button className="btn btn-gold" onClick={() => { if (!habitProgress(h.id, 1, note)) setNote(''); }}>Complete</button>}
    </div>
    {h.target > 1 && <div className="flex items-center gap-2 text-xs"><span className="w-28">{prog}/{h.target} {h.unit}</span><div className="flex-1"><Bar value={prog} max={h.target} color="bg-moss" /></div></div>}
    {h.requireNote && !done && <input className="inp text-sm" placeholder="Short note (required)" value={note} onChange={(e) => setNote(e.target.value)} />}
    <History h={h} />
    <div className="flex gap-3 text-xs opacity-70"><button className="underline" onClick={() => setEdit(!edit)}>edit</button><button className="underline" onClick={() => confirm(`Remove "${h.name}"? Rewards already earned stay in your treasury.`) && removeHabit(h.id)}>remove</button></div>
    {edit && <div className="grid grid-cols-2 gap-1 text-sm">
      <input className="inp col-span-2" value={h.name} maxLength={80} onChange={(e) => editHabit(h.id, { name: e.target.value || h.name })} />
      <label>Target <input type="number" className="inp" min={1} max={1000} value={h.target} onChange={(e) => editHabit(h.id, { target: Math.max(1, Math.min(1000, +e.target.value || 1)) })} /></label>
      <label>Weight <select className="inp" value={h.weight} onChange={(e) => editHabit(h.id, { weight: +e.target.value })}>{WEIGHTS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</select></label>
    </div>}
  </div>;
}

export function HabitsPanel() {
  const s = useGame();
  const [f, setF] = useState({ name: '', freq: 'daily' as Freq, target: 1, unit: '', weight: 2, requireNote: false });
  const ranked = [...s.habits].sort((a, b) => (b.earned.gold + b.earned.renown * 10) - (a.earned.gold + a.earned.renown * 10));
  return <div className="space-y-2">
    {!s.habits.length && <p className="text-sm italic">No habits yet. Good deeds earn resources and renown, and streaks grow the reward. Missing a day never removes anything.</p>}
    {s.habits.map((h) => <HabitCard key={h.id} h={h} />)}
    <Section title="New habit">
      <input className="inp" placeholder="e.g. Read, Exercise, Drink water" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2 text-sm">
        <select className="inp" value={f.freq} onChange={(e) => setF({ ...f, freq: e.target.value as Freq })}><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
        <select className="inp" value={f.weight} onChange={(e) => setF({ ...f, weight: +e.target.value })}>{WEIGHTS.map((w, i) => <option key={w} value={i + 1}>{w} (×{i + 1})</option>)}</select>
        <label className="flex items-center gap-1">Goal <input type="number" className="inp" min={1} max={1000} value={f.target} onChange={(e) => setF({ ...f, target: +e.target.value })} /></label>
        <input className="inp" placeholder="unit (pages, glasses…)" maxLength={30} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        <label className="col-span-2 flex items-center gap-1"><input type="checkbox" checked={f.requireNote} onChange={(e) => setF({ ...f, requireNote: e.target.checked })} /> Require a short note to complete</label>
      </div>
      <button className="btn btn-gold w-full" disabled={!f.name.trim()} onClick={() => { if (!addHabit(f)) setF({ ...f, name: '', unit: '', target: 1 }); }}>Add habit</button>
    </Section>
    {ranked.some((h) => h.earned.gold > 0) && <Section title="Contribution to your kingdom">
      {ranked.filter((h) => h.earned.gold > 0).map((h) => <div key={h.id} className="flex justify-between gap-2 text-sm"><span>{h.name}</span><Cost cost={h.earned} /></div>)}
    </Section>}
  </div>;
}
