import { type Res, ZERO } from './rewards.ts';

export const MIN = 60_000;
export type CheckIn = { due: number; at?: number; missed: boolean; note?: string };
export type Status = 'running' | 'paused' | 'missed' | 'break' | 'ended';
export interface SessionCfg { intervalMin: number; graceMin: number; pomodoro: boolean; breakMin: number; longBreakMin: number }
export const DEFAULT_CFG: SessionCfg = { intervalMin: 30, graceMin: 2, pomodoro: false, breakMin: 5, longBreakMin: 15 };

export interface Session {
  id: string; subject: string; startedAt: number; endedAt?: number; status: Status; cfg: SessionCfg;
  segStart: number | null;  // wall time the current running segment began
  pendingMs: number;        // unverified running time, excluding current segment
  verifiedMs: number; forfeitedMs: number;
  checkIns: CheckIn[]; lastTick: number; notes: string[];
  breakUntil?: number; pomos: number;
  awarded: Res;             // cumulative rewards already granted for this session
}

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

export function startSession(subject: string, now: number, cfg: SessionCfg = DEFAULT_CFG): Session {
  return { id: uid(), subject, startedAt: now, status: 'running', cfg, segStart: now, pendingMs: 0, verifiedMs: 0, forfeitedMs: 0, checkIns: [], lastTick: now, notes: [], pomos: 0, awarded: { ...ZERO } };
}
const intervalMs = (s: Session) => s.cfg.intervalMin * MIN;
export const pendingAt = (s: Session, now: number) => s.pendingMs + (s.segStart != null ? Math.max(0, now - s.segStart) : 0);
export const dueAt = (s: Session) => (s.segStart != null ? s.segStart + intervalMs(s) - s.pendingMs : null);
export const isAwaiting = (s: Session, now: number) => { const d = dueAt(s); return s.status === 'running' && d != null && now >= d; };
export const totalMs = (s: Session, now: number) => s.verifiedMs + pendingAt(s, now);

/** Applies passage of time: missed check-ins, finished breaks, clock tampering. Pure. */
export function tick(s0: Session, now: number): Session {
  if (s0.status === 'ended') return s0;
  const s = { ...s0 };
  if (now < s.lastTick - 5000 && s.segStart != null) { // clock moved backwards: freeze, credit nothing extra
    s.pendingMs = pendingAt(s, s.lastTick); s.segStart = null; s.status = 'paused'; s.lastTick = now; return s;
  }
  const d = dueAt(s);
  if (s.status === 'running' && d != null && now > d + s.cfg.graceMin * MIN) {
    s.forfeitedMs += intervalMs(s);
    s.checkIns = [...s.checkIns, { due: d, missed: true }];
    s.pendingMs = 0; s.segStart = null; s.status = 'missed';
  }
  s.lastTick = Math.max(s.lastTick, now);
  return s;
}

function verify(s: Session, now: number, note?: string): Session {
  const awaiting = isAwaiting(s, now), p = pendingAt(s, now);
  const out: Session = { ...s, verifiedMs: s.verifiedMs + p, pendingMs: 0 };
  if (out.segStart != null) out.segStart = now;
  if (awaiting) out.checkIns = [...s.checkIns, { due: dueAt(s)!, at: now, missed: false, note }];
  if (note) out.notes = [...s.notes, note];
  return out;
}

/** Active confirmation. Verifies pending time; resumes a missed/paused/finished-break session. */
export function checkIn(s0: Session, now: number, note?: string): Session {
  const s = tick(s0, now);
  if (s.status === 'missed' || s.status === 'paused' || s.status === 'break')
    return { ...s, status: 'running', segStart: now, breakUntil: undefined, notes: note ? [...s.notes, note] : s.notes };
  if (s.status !== 'running') return s;
  return verify(s, now, note);
}
export function pause(s0: Session, now: number): Session {
  const s = tick(s0, now);
  return s.status === 'running' ? { ...verify(s, now), segStart: null, status: 'paused' } : s;
}
/** Pomodoro: confirm the focus block and start a break (break time is never rewarded). */
export function takeBreak(s0: Session, now: number, note?: string): Session {
  const s = tick(s0, now);
  if (s.status !== 'running') return s;
  const pomos = s.pomos + 1, len = pomos % 4 === 0 ? s.cfg.longBreakMin : s.cfg.breakMin;
  return { ...verify(s, now, note), segStart: null, status: 'break', breakUntil: now + len * MIN, pomos };
}
/** For timers that must be kept alive by a click (productive time): once the window passes without one, the session
 *  simply ends at the deadline. Time up to the last click is kept; the unconfirmed rest is not counted. */
export function expire(s: Session, now: number): Session {
  const due = dueAt(s); if (s.status !== 'running' || due == null || now <= due) return s;
  return { ...s, forfeitedMs: s.forfeitedMs + pendingAt(s, due), pendingMs: 0, segStart: null, status: 'ended', endedAt: due, lastTick: Math.max(s.lastTick, now) };
}
export function endSession(s0: Session, now: number): Session {
  let s = tick(s0, now);
  if (s.status === 'running') s = verify(s, now);
  return { ...s, segStart: null, status: 'ended', endedAt: now };
}
