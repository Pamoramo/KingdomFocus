'use client';
import { useState } from 'react';
import { useGame, useNow, clock, fmt } from './hooks.ts';
import { studyStart, studyCheckIn, studyPause, studyEnd, setPref } from '../lib/state.ts';
import { pendingAt, dueAt, isAwaiting, chainMinutes, sessionRewards, GRACE_MS, CHECK_MS } from '../lib/study.ts';
import { GOLD_TIERS, currentRate, goldForMinutes, rewardsForChains } from '../lib/rewards.ts';
import { Icon } from './Icon.tsx';
import { Cost } from './Cost.tsx';

export function StudyPanel() {
  const s = useGame(), now = useNow(), sess = s.session;
  const [subj, setSubj] = useState(s.subjects[0] ?? 'General');
  const [custom, setCustom] = useState('');
  if (!sess) return (
    <div className="space-y-3">
      <p className="text-sm">Study to earn gold. Gold per minute rises the longer you stay focused without missing a check-in.</p>
      <label className="block text-sm font-bold">Subject</label>
      <div className="flex flex-wrap gap-1">{s.subjects.map((x) => <button key={x} onClick={() => setSubj(x)} className={`btn text-sm ${x === subj ? 'btn-gold' : ''}`}>{x}</button>)}</div>
      <div className="flex gap-2"><input className="inp" placeholder="New subject…" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn" onClick={() => { if (custom.trim()) { setSubj(custom.trim()); setCustom(''); studyStart(custom.trim()); } }}>Start</button></div>
      <button className="btn btn-gold w-full text-lg py-2" onClick={() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); studyStart(subj); }}>Begin studying {subj}</button>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.requireNote} onChange={(e) => setPref({ requireNote: e.target.checked })} /> Note at check-ins</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={s.sound} onChange={(e) => setPref({ sound: e.target.checked })} /> Sounds</label>
      </div>
      <TierTable min={0} />
      <p className="text-xs opacity-70">A check-in appears every 15 minutes. You have 2 minutes to respond, otherwise the timer pauses and the unverified minutes are not credited. Earned rewards are never removed.</p>
    </div>
  );
  const pend = pendingAt(sess, now), cm = chainMinutes(sess, now), due = dueAt(sess), earned = sessionRewards(sess);
  const projected = rewardsForChains([...sess.chains, sess.chainMs + pend].map((m) => Math.floor(m / 60000)));
  const total = sess.verifiedMs + pend;
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-sm opacity-70">{sess.subject} · {sess.status === 'running' ? 'studying' : sess.status === 'missed' ? 'paused: check-in missed' : 'paused'}</div>
        <div className="text-6xl font-bold tabular-nums leading-none my-1">{clock(total)}</div>
        <div className="text-sm">Focus streak: <b>{cm} min</b> · now earning <b>{currentRate(cm)} gold/min</b></div>
        {due && sess.status === 'running' && <div className="text-xs opacity-70">Next check-in in {clock(due - now)}</div>}
      </div>
      <div className="h-3 bg-parch-d rounded overflow-hidden border border-wood"><div className="h-full bg-gold transition-all" style={{ width: `${Math.min(100, (pend / CHECK_MS) * 100)}%` }} /></div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="panel p-2"><div className="text-xs opacity-70">Banked (verified)</div><Cost cost={earned} /></div>
        <div className="panel p-2"><div className="text-xs opacity-70">If verified now</div><Cost cost={projected} /></div>
      </div>
      <div className="flex gap-2">
        {sess.status === 'running' ? <button className="btn flex-1" onClick={studyPause}>Pause</button>
          : <button className="btn btn-gold flex-1" onClick={() => studyCheckIn()}>{sess.status === 'missed' ? 'Check in & resume' : 'Resume'}</button>}
        <button className="btn btn-red flex-1" onClick={studyEnd}>Finish session</button>
      </div>
      <div className="text-xs">Check-ins: {sess.checkIns.filter((c) => !c.missed).length} completed, {sess.checkIns.filter((c) => c.missed).length} missed · Unverified lost: {Math.floor(sess.forfeitedMs / 60000)} min</div>
      <TierTable min={cm} />
    </div>
  );
}

function TierTable({ min }: { min: number }) {
  let prev = 0;
  return <div className="grid grid-cols-5 gap-1 text-center text-xs">{GOLD_TIERS.map((t) => {
    const a = prev + 1, active = min >= prev && min < t.upTo; prev = t.upTo;
    return <div key={a} className={`rounded p-1 border ${active ? 'bg-gold border-wood font-bold' : 'border-parch-d'}`}>{t.upTo === Infinity ? `${a}+` : `${a}-${t.upTo}`}<br /><span className="inline-flex items-center gap-0.5"><Icon name="gold" size={10} />{t.rate}/m</span></div>;
  })}<div className="col-span-5 opacity-70">100 min = {fmt(goldForMinutes(100))} gold · 120 min = {fmt(goldForMinutes(120))} gold</div></div>;
}

export function CheckInModal() {
  const s = useGame(), now = useNow(500), sess = s.session;
  const [note, setNote] = useState('');
  if (!sess || !isAwaiting(sess, now)) return null;
  const left = dueAt(sess)! + GRACE_MS - now, ok = !s.requireNote || note.trim().length > 1;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="panel pop pulse w-full max-w-sm p-5 text-center space-y-3">
        <Icon name="check" size={48} />
        <h2 className="font-title text-4xl">Sentry&apos;s Call</h2>
        <p>Are you still at your studies, my liege?</p>
        <div className="text-6xl font-bold tabular-nums text-blood">{clock(left)}</div>
        {s.requireNote && <input autoFocus className="inp" placeholder="What did you study?" value={note} onChange={(e) => setNote(e.target.value)} />}
        <button disabled={!ok} className="btn btn-gold w-full text-xl py-3" onClick={() => { studyCheckIn(note.trim() || undefined); setNote(''); }}>I am studying</button>
        <p className="text-xs opacity-70">Respond in time to bank the last 15 minutes and keep your focus streak.</p>
      </div>
    </div>
  );
}

export function StudyMini({ onOpen }: { onOpen: () => void }) {
  const s = useGame(), now = useNow(), sess = s.session;
  if (!sess) return null;
  const t = sess.verifiedMs + pendingAt(sess, now);
  return <button onClick={onOpen} className={`wood rounded px-3 py-1 flex items-center gap-2 ${sess.status !== 'running' ? 'opacity-80' : ''}`}>
    <Icon name="study" size={18} /><span className="font-bold tabular-nums">{clock(t)}</span>
    <span className="text-xs">{sess.status === 'running' ? `${currentRate(chainMinutes(sess, now))}g/m` : sess.status === 'missed' ? 'MISSED' : 'PAUSED'}</span>
  </button>;
}
