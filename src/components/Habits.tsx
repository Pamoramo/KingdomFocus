'use client';
import { useState } from 'react';
import { useGame } from './hooks.ts';
import { addHabit, removeHabit, claimHabit } from '../lib/state.ts';
import { claimedNow, streak, streakBonus, dayKey, type Freq } from '../lib/habits.ts';
import { Cost } from './Cost.tsx';

export function HabitsPanel() {
  const s = useGame(), now = new Date();
  const [name, setName] = useState(''), [freq, setFreq] = useState<Freq>('daily'), [gold, setGold] = useState(80), [renown, setRenown] = useState(2);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return dayKey(d); });
  return <div className="space-y-2">
    {!s.habits.length && <p className="text-sm italic">No habits yet. Add a daily or weekly deed below.</p>}
    {s.habits.map((h) => { const done = claimedNow(h, now), st = streak(h, now), k = streakBonus(done ? st - 1 : st);
      return <div key={h.id} className="panel p-2 space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex-1"><b>{h.name}</b> <span className="text-xs opacity-60 capitalize">{h.freq}</span>
            <div className="text-xs">Streak {st} · best {h.best} · bonus ×{k.toFixed(1)}</div><Cost cost={{ gold: Math.round(h.reward.gold * k), wood: Math.round(h.reward.wood * k), stone: Math.round(h.reward.stone * k), renown: Math.round(h.reward.renown * k) }} /></div>
          <button className={`btn ${done ? '' : 'btn-gold'}`} disabled={done} onClick={() => claimHabit(h.id)}>{done ? 'Done' : 'Complete'}</button>
        </div>
        {h.freq === 'daily' && <div className="flex gap-0.5">{days.map((d) => <div key={d} title={d} className={`h-2 flex-1 rounded-sm ${h.done.includes(d) ? 'bg-moss' : 'bg-parch-d'}`} />)}</div>}
        <button className="text-xs underline opacity-60" onClick={() => confirm(`Remove "${h.name}"?`) && removeHabit(h.id)}>remove</button>
      </div>; })}
    <div className="panel p-2 space-y-2 text-sm">
      <b>New habit</b>
      <input className="inp" placeholder="e.g. Morning run" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex gap-2 items-center">
        <select className="inp !w-auto" value={freq} onChange={(e) => setFreq(e.target.value as Freq)}><option value="daily">Daily</option><option value="weekly">Weekly</option></select>
        <label className="flex items-center gap-1">Gold<input type="number" min={0} max={2000} className="inp !w-20" value={gold} onChange={(e) => setGold(+e.target.value)} /></label>
        <label className="flex items-center gap-1">Renown<input type="number" min={0} max={50} className="inp !w-16" value={renown} onChange={(e) => setRenown(+e.target.value)} /></label>
      </div>
      <button className="btn btn-gold w-full" disabled={!name.trim()} onClick={() => { addHabit(name.trim(), freq, { gold: Math.min(2000, gold), wood: Math.round(gold / 4), stone: Math.round(gold / 8), renown: Math.min(50, renown) }); setName(''); }}>Add habit</button>
      <p className="text-xs opacity-70">Each period can be claimed once. Streaks add up to +100% reward; missing a day never removes anything you have earned.</p>
    </div>
  </div>;
}
