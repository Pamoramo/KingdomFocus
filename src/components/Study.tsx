'use client';
import { useEffect, useState } from 'react';
import { useGame, useNow, clock, fmt, hm } from './hooks.ts';
import { studyStart, studyCheckIn, studyPause, studyBreak, studyEnd, studyDiscard, setSettings, logManual, studyMult, fxBus, type Fx, getState } from '../lib/state.ts';
import { pendingAt, dueAt, isAwaiting, totalMs } from '../lib/study.ts';
import { studyReward, MANUAL_FACTOR, type Res } from '../lib/rewards.ts';
import { TROOPS, BUILDINGS } from '../lib/economy.ts';
import { setUI } from '../game/ui.ts';
import { Icon } from './Icon.tsx';
import { Cost, Section, Bar } from './Cost.tsx';

const Badge = ({ src }: { src: string }) => <span className={`text-xs px-1.5 rounded border ${src === 'manual' ? 'border-blood text-blood' : src === 'pomodoro' ? 'border-moss text-moss' : 'border-ink/40'}`}>{src}</span>;

export function StudyPanel() {
  const s = useGame(), now = useNow(), sess = s.session, cfg = s.settings.cfg;
  const [subj, setSubj] = useState(s.subjects[0] ?? 'General'), [custom, setCustom] = useState(''), [manual, setManual] = useState(false);
  const mult = studyMult(s), perMin = studyReward(60000, s.settings.rates, mult);
  if (!sess) return (
    <div className="space-y-3">
      <div className="card p-2.5 text-sm">Every verified minute earns <Cost cost={perMin} plus /> {mult.gold > 1 || mult.renown > 1 ? <span className="opacity-70">(buildings bonus included)</span> : null}</div>
      <Section title="Subject">
        <div className="flex flex-wrap gap-1">{s.subjects.map((x) => <button key={x} onClick={() => setSubj(x)} className={`btn text-sm !py-0.5 ${x === subj ? 'btn-gold' : ''}`}>{x}</button>)}</div>
        <div className="flex gap-2"><input className="inp" placeholder="Add a subject…" value={custom} maxLength={80} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && custom.trim()) { setSubj(custom.trim()); setCustom(''); } }} />
          <button className="btn" disabled={!custom.trim()} onClick={() => { setSubj(custom.trim()); setCustom(''); }}>Add</button></div>
      </Section>
      <Section title="Mode">
        <div className="flex gap-1">
          <button className={`btn flex-1 ${!cfg.pomodoro ? 'btn-gold' : ''}`} onClick={() => setSettings({ cfg: { ...cfg, pomodoro: false } })}>Focus timer</button>
          <button className={`btn flex-1 ${cfg.pomodoro ? 'btn-gold' : ''}`} onClick={() => setSettings({ cfg: { ...cfg, pomodoro: true, intervalMin: 25 } })}>Pomodoro 25/5</button>
        </div>
        {!cfg.pomodoro && <label className="flex items-center gap-2 text-sm">Check in every
          <select className="inp !w-auto" value={cfg.intervalMin} onChange={(e) => setSettings({ cfg: { ...cfg, intervalMin: +e.target.value } })}>{[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>}
        <p className="text-xs opacity-75">{cfg.pomodoro ? 'Each 25-minute focus block ends with a prompt to start your break. Breaks earn nothing; focus time is never lost.' : `A prompt appears every ${cfg.intervalMin} minutes. Answer within ${cfg.graceMin} minutes or the timer pauses; only the unconfirmed minutes since your last check-in are not counted.`}</p>
      </Section>
      <button className="btn btn-gold w-full text-xl py-2" onClick={() => { if (s.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); studyStart(subj); }}>Begin studying {subj}</button>
      <button className="text-sm underline" onClick={() => setManual(!manual)}>{manual ? 'Hide' : 'Log a session manually'}</button>
      {manual && <ManualEntry subjects={s.subjects} />}
      <RecentSessions />
    </div>
  );
  const pend = pendingAt(sess, now), total = totalMs(sess, now), due = dueAt(sess);
  const projected = studyReward(sess.verifiedMs + pend, s.settings.rates, mult);
  const statusText = { running: isAwaiting(sess, now) ? 'check-in needed!' : 'studying', paused: 'paused', missed: 'paused: check-in missed', break: 'on a break', ended: 'finished' }[sess.status];
  return (
    <div className="space-y-3">
      <div className="text-center">
        <div className="text-sm opacity-75">{sess.subject} · <Badge src={sess.source} /> · {statusText}</div>
        <div className="text-6xl font-bold tabular-nums leading-none my-1">{clock(total)}</div>
        {sess.status === 'running' && due && <div className="text-sm">{sess.cfg.pomodoro ? 'Break in' : 'Next check-in in'} <b className="tabular-nums">{clock(Math.max(0, due - now))}</b></div>}
        {sess.status === 'break' && sess.breakUntil && <div className="text-sm">Break ends in <b className="tabular-nums">{clock(Math.max(0, sess.breakUntil - now))}</b></div>}
      </div>
      {sess.status === 'running' && <Bar value={pend} max={sess.cfg.intervalMin * 60000} />}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="card p-2"><div className="text-xs opacity-70">Earned (verified)</div><Cost cost={sess.awarded} /></div>
        <div className="card p-2"><div className="text-xs opacity-70">At next check-in</div><Cost cost={projected} /></div>
      </div>
      <div className="flex gap-2">
        {sess.status === 'running' ? <button className="btn flex-1" onClick={studyPause}>Pause</button>
          : <button className="btn btn-gold flex-1" onClick={() => studyCheckIn()}>{sess.status === 'missed' ? 'Check in & resume' : 'Resume'}</button>}
        <button className="btn btn-red flex-1" onClick={studyEnd}>Finish session</button>
      </div>
      <div className="flex gap-2">
        <button className="btn flex-1" onClick={() => setUI({ focus: true, panel: null })}><Icon name="hourglass" size={16} /> Focus mode</button>
        {sess.verifiedMs === 0 && <button className="btn flex-1" onClick={studyDiscard}>Discard</button>}
      </div>
      <div className="text-xs opacity-80">Check-ins answered: {sess.checkIns.filter((c) => !c.missed).length} · missed: {sess.checkIns.filter((c) => c.missed).length}{sess.forfeitedMs > 0 && ` · unconfirmed time not counted: ${hm(sess.forfeitedMs / 60000)}`}</div>
    </div>
  );
}

function ManualEntry({ subjects }: { subjects: string[] }) {
  const [subj, setSubj] = useState(subjects[0] ?? 'General'), [min, setMin] = useState(30), [when, setWhen] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)), [note, setNote] = useState('');
  const s = getState(), r = studyReward(min * 60000, s.settings.rates, studyMult(s), MANUAL_FACTOR);
  return <Section title="Manual log">
    <p className="text-xs opacity-75">For study done away from the timer. Manual minutes are marked as manual and earn {MANUAL_FACTOR * 100}% of the timed reward (max 4h per entry, 8h per day).</p>
    <div className="grid grid-cols-2 gap-2 text-sm">
      <select className="inp" value={subj} onChange={(e) => setSubj(e.target.value)}>{subjects.map((x) => <option key={x}>{x}</option>)}</select>
      <label className="flex items-center gap-1"><input type="number" className="inp" min={1} max={240} value={min} onChange={(e) => setMin(+e.target.value)} />min</label>
      <input type="datetime-local" className="inp col-span-2" value={when} onChange={(e) => setWhen(e.target.value)} />
      <input className="inp col-span-2" placeholder="What did you study? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
    </div>
    <div className="flex items-center justify-between gap-2"><Cost cost={r} plus /><button className="btn btn-gold" onClick={() => { if (!logManual(subj, min, new Date(when).getTime(), note)) setNote(''); }}>Log</button></div>
  </Section>;
}

function RecentSessions() {
  const s = useGame(), list = s.sessions.filter((r) => r.endedAt).slice(0, 8);
  if (!list.length) return null;
  return <Section title="Recent sessions">{list.map((r) => <div key={r.id} className="flex items-center justify-between gap-2 text-sm border-b border-black/10 py-0.5">
    <span className="truncate">{new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {r.subject} <Badge src={r.source} /></span>
    <span className="whitespace-nowrap">{hm(r.verifiedSec / 60)} · {fmt(r.reward.gold)}g</span></div>)}</Section>;
}

/** Check-in and pomodoro prompts. Clearly visible, with a live countdown. */
export function CheckInModal() {
  const s = useGame(), now = useNow(500), sess = s.session;
  const [note, setNote] = useState('');
  if (!sess) return null;
  if (sess.status === 'break' && sess.breakUntil && now >= sess.breakUntil) return (
    <Modal><Icon name="hourglass" size={44} /><h2 className="font-title text-4xl">Break&apos;s Over</h2><p>Ready to return to your studies?</p>
      <button className="btn btn-gold w-full text-xl py-3" onClick={() => studyCheckIn()}>Resume studying</button>
      <button className="btn w-full" onClick={studyEnd}>Finish session</button></Modal>);
  if (!isAwaiting(sess, now)) return null;
  const left = dueAt(sess)! + sess.cfg.graceMin * 60000 - now, ok = !s.settings.requireNote || note.trim().length > 1;
  const submit = (f: (n?: string) => void) => { f(note.trim() || undefined); setNote(''); };
  return (
    <Modal pulse>
      <Icon name={sess.cfg.pomodoro ? 'hourglass' : 'check'} size={44} />
      <h2 className="font-title text-4xl">{sess.cfg.pomodoro ? 'Focus Block Complete' : "Sentry's Call"}</h2>
      <p>{sess.cfg.pomodoro ? 'Well fought! Confirm your study to bank it.' : 'Are you still at your studies, my liege?'}</p>
      <div className="text-6xl font-bold tabular-nums text-blood">{clock(left)}</div>
      {(s.settings.requireNote || sess.cfg.pomodoro) && <input autoFocus className="inp" placeholder={s.settings.requireNote ? 'What did you study? (required)' : 'What did you study? (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />}
      {sess.cfg.pomodoro ? <>
        <button disabled={!ok} className="btn btn-gold w-full text-xl py-3" onClick={() => submit(studyBreak)}>Bank it & take a break</button>
        <button disabled={!ok} className="btn w-full" onClick={() => submit(studyCheckIn)}>Bank it & keep going</button>
      </> : <button disabled={!ok} className="btn btn-gold w-full text-xl py-3" onClick={() => submit(studyCheckIn)}>I am studying</button>}
      <p className="text-xs opacity-75">If the timer runs out, the session pauses. Everything already earned is kept.</p>
    </Modal>
  );
}
function Modal({ children, pulse }: { children: React.ReactNode; pulse?: boolean }) {
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"><div className={`panel pop ${pulse ? 'pulse' : ''} w-full max-w-sm p-5 text-center space-y-3`}>{children}</div></div>;
}

export function StudyMini({ onOpen }: { onOpen: () => void }) {
  const s = useGame(), now = useNow(), sess = s.session;
  if (!sess) return <button onClick={onOpen} className="wood rounded px-3 py-1 flex items-center gap-2 text-sm"><Icon name="study" size={18} />Study</button>;
  const label = sess.status === 'running' ? (isAwaiting(sess, now) ? 'CHECK IN' : 'studying') : sess.status === 'missed' ? 'MISSED' : sess.status === 'break' ? 'break' : 'paused';
  return <button onClick={onOpen} className={`wood rounded px-3 py-1 flex items-center gap-2 ${isAwaiting(sess, now) ? 'pulse' : ''}`}>
    <Icon name="study" size={18} /><span className="font-bold tabular-nums">{clock(totalMs(sess, now))}</span><span className="text-xs">{label}</span></button>;
}

/** Distraction-free fullscreen timer over the dimmed kingdom. */
export function FocusMode() {
  const s = useGame(), now = useNow(), sess = s.session;
  if (!sess) return <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center text-parch"><div className="text-center space-y-3"><p>No active session.</p><button className="btn" onClick={() => setUI({ focus: false })}>Back to the kingdom</button></div></div>;
  const due = dueAt(sess);
  return <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[1px] grid place-items-center text-parch select-none">
    <div className="text-center space-y-4 px-4">
      <div className="font-title text-4xl opacity-90">{sess.subject}</div>
      <div className="text-[min(22vw,9rem)] font-bold tabular-nums leading-none">{clock(totalMs(sess, now))}</div>
      <div className="opacity-80">{sess.status === 'running' && due ? `${sess.cfg.pomodoro ? 'Break' : 'Check-in'} in ${clock(Math.max(0, due - now))}` : sess.status}</div>
      <div className="flex gap-2 justify-center"><Cost cost={sess.awarded} /></div>
      <div className="flex gap-2 justify-center">
        {sess.status === 'running' ? <button className="btn" onClick={studyPause}>Pause</button> : <button className="btn btn-gold" onClick={() => studyCheckIn()}>Resume</button>}
        <button className="btn" onClick={() => setUI({ focus: false })}>Exit focus mode</button>
      </div>
    </div>
  </div>;
}

/** End-of-session celebration with counting rewards and what they can buy. */
export function SessionComplete() {
  const [fx, setFx] = useState<Fx | null>(null), [t, setT] = useState(0), s = useGame();
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<Fx>).detail; if (d.kind === 'reward' && d.big) { setFx(d); setT(0); } };
    fxBus.addEventListener('fx', on); return () => fxBus.removeEventListener('fx', on);
  }, []);
  useEffect(() => { if (!fx || t >= 1) return; const id = requestAnimationFrame(() => setT((x) => Math.min(1, x + 0.025))); return () => cancelAnimationFrame(id); }, [fx, t]);
  if (!fx?.res) return null;
  const r = fx.res as Res, k = 1 - (1 - t) ** 3, buy = Math.floor(r.gold / (TROOPS.militia.cost.gold ?? 20));
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4" onClick={() => t >= 1 && setFx(null)}>
    <div className="panel pop w-full max-w-sm p-5 text-center space-y-3">
      <h2 className="font-title text-4xl">Victory of Discipline</h2><p>{fx.text}</p>
      <div className="grid grid-cols-2 gap-2 text-2xl font-bold">{(['gold', 'wood', 'stone', 'renown'] as const).map((key) => <div key={key} className="card p-2 flex items-center justify-center gap-2"><Icon name={key} size={24} />+{fmt(Math.round(r[key] * k))}</div>)}</div>
      {buy > 0 && <p className="text-sm">Enough gold to recruit {buy} militia, or to raise {Math.floor(r.gold / (BUILDINGS.watchtower.levels[0].cost.gold ?? 150))} watchtowers.</p>}
      {s.squads.length > 0 && <p className="text-xs opacity-70">Your soldiers also gained experience from your study.</p>}
      <button className="btn btn-gold w-full" onClick={() => setFx(null)}>To the kingdom</button>
      <span className="hidden">{s.updatedAt}</span>
    </div>
  </div>;
}
