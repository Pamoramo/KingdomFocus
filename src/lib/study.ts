import { type Res, ZERO, rewardsForChains } from './rewards.ts';

export const CHECK_MS = 15 * 60_000;
export const GRACE_MS = 2 * 60_000;
const MIN = 60_000;

export type CheckIn = { due: number; at?: number; missed: boolean; note?: string };
export type Status = 'running' | 'paused' | 'missed' | 'ended';
export interface Session {
  id: string; subject: string; startedAt: number; endedAt?: number; status: Status;
  segStart: number | null; // wall time current running segment began
  pendingMs: number;       // unverified running time (excluding current segment)
  chainMs: number;         // verified time in current uninterrupted chain
  chains: number[];        // closed chains (verified ms)
  verifiedMs: number; forfeitedMs: number;
  checkIns: CheckIn[]; lastTick: number; awarded: Res; notes: string[];
}

export function startSession(subject: string, now: number): Session {
  return {
    id: now.toString(36) + Math.random().toString(36).slice(2, 6), subject, startedAt: now, status: 'running',
    segStart: now, pendingMs: 0, chainMs: 0, chains: [], verifiedMs: 0, forfeitedMs: 0,
    checkIns: [], lastTick: now, awarded: { ...ZERO }, notes: [],
  };
}

export const pendingAt = (s: Session, now: number) =>
  s.pendingMs + (s.segStart != null ? Math.max(0, now - s.segStart) : 0);

/** Wall time the next check-in is due (only while running). */
export const dueAt = (s: Session) => (s.segStart != null ? s.segStart + CHECK_MS - s.pendingMs : null);

export const isAwaiting = (s: Session, now: number) => {
  const d = dueAt(s);
  return s.status === 'running' && d != null && now >= d;
};

/** Apply time passage: detect missed check-ins and clock tampering. Pure. */
export function tick(s0: Session, now: number): Session {
  if (s0.status === 'ended') return s0;
  const s = { ...s0 };
  if (now < s.lastTick - 5000 && s.segStart != null) {
    // clock moved backwards: freeze at last trusted time, do not credit
    s.pendingMs = pendingAt(s, s.lastTick);
    s.segStart = null; s.status = 'paused';
    s.lastTick = now;
    return s;
  }
  const d = dueAt(s);
  if (s.status === 'running' && d != null && now > d + GRACE_MS) {
    s.forfeitedMs += CHECK_MS;
    s.checkIns = [...s.checkIns, { due: d, missed: true }];
    if (s.chainMs > 0) s.chains = [...s.chains, s.chainMs];
    s.chainMs = 0; s.pendingMs = 0; s.segStart = null; s.status = 'missed';
  }
  s.lastTick = Math.max(s.lastTick, now);
  return s;
}

function verify(s: Session, now: number, note?: string): Session {
  const awaiting = isAwaiting(s, now);
  const p = pendingAt(s, now);
  const out = { ...s, verifiedMs: s.verifiedMs + p, chainMs: s.chainMs + p, pendingMs: 0 };
  if (out.segStart != null) out.segStart = now;
  if (awaiting) out.checkIns = [...s.checkIns, { due: dueAt(s)!, at: now, missed: false, note }];
  if (note) out.notes = [...s.notes, note];
  return out;
}

/** Active check-in: verifies pending time, or resumes after a missed check-in. */
export function checkIn(s0: Session, now: number, note?: string): Session {
  const s = tick(s0, now);
  if (s.status === 'missed' || s.status === 'paused')
    return { ...s, status: 'running', segStart: now, notes: note ? [...s.notes, note] : s.notes };
  if (s.status !== 'running') return s;
  return verify(s, now, note);
}

export function pause(s0: Session, now: number): Session {
  const s = tick(s0, now);
  if (s.status !== 'running') return s;
  return { ...verify(s, now), segStart: null, status: 'paused' };
}

export const resume = (s: Session, now: number) => checkIn(s, now);

export function endSession(s0: Session, now: number): Session {
  let s = tick(s0, now);
  if (s.status === 'running') s = verify(s, now);
  return {
    ...s, segStart: null, status: 'ended', endedAt: now,
    chains: s.chainMs > 0 ? [...s.chains, s.chainMs] : s.chains, chainMs: 0,
  };
}

/** Total rewards earned by this session's verified minutes. */
export function sessionRewards(s: Session): Res {
  return rewardsForChains([...s.chains, s.chainMs].map((ms) => Math.floor(ms / MIN)));
}
export const chainMinutes = (s: Session, now: number) => Math.floor((s.chainMs + pendingAt(s, now)) / MIN);
