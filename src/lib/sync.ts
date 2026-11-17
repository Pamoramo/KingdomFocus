import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { getState, setState, subscribe, newGame, emit, grantCompensation, stableUuid, cloudLacks, NEEDS_SCHEMA, type GameState } from './state.ts';
import type { BKind } from './economy.ts';
import { upgradeWorld } from './war.ts';
import { buildPayload, clearSent, outboxEmpty, adoptSnapshot, heldBack, type Snapshot } from './syncCore.ts';

import { SUPABASE_URL as URL, SUPABASE_ANON_KEY as KEY } from './config.ts';
export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null;
const LS = 'kod-save-v2';
let user: User | null = null, pulled = false, busy = false, failures = 0;
/** The stamp of the cloud world this device last saw or wrote, and when it last heard from the cloud. If another device
 *  has written a newer world since, this device takes that world instead of overwriting it with its stale copy. */
let seen: string | undefined, lastContact = 0, worldAtContact: GameState['world'] | null = null;
const stampOf = (snap: Snapshot) => (snap.kingdom?.world as { stamp?: string } | null | undefined)?.stamp;
const newStamp = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let saveT: ReturnType<typeof setTimeout> | undefined, syncT: ReturnType<typeof setTimeout> | undefined;
export const syncStatus = new EventTarget();
let status = supabase ? 'signed out' : 'local only';
const setStatus = (s: string) => { status = s; syncStatus.dispatchEvent(new Event('change')); };
export const getSyncStatus = () => status;
/** Schema version of the cloud database (null until checked; 0 = older than migration 0005). */
let schema: number | null = null;
export const getSchemaVersion = () => schema;
export const SCHEMA_WANTED = 6;
/** True once the database rejected a study reward for exceeding its (old) ceiling: such rewards wait locally. */
const LEGACY_KEY = 'kod-legacy-ceiling';
let legacy = (() => { try { return localStorage.getItem(LEGACY_KEY) === '1'; } catch { return false; } })(), lastProbe = 0;
const setLegacy = (v: boolean) => { legacy = v; try { v ? localStorage.setItem(LEGACY_KEY, '1') : localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ } };
const CEILING_ERR = /exceeds allowed rate/;
async function checkSchema() {
  if (!supabase || schema !== null) return;
  const { data, error } = await supabase.rpc('kod_schema_version');
  schema = error ? 0 : Number(data) || 0; syncStatus.dispatchEvent(new Event('change'));
  cloudLacks.clear(); for (const [k, v] of Object.entries(NEEDS_SCHEMA)) if (schema < (v ?? 0)) cloudLacks.add(k as BKind);
}
export const getUser = () => user;

const saveLocal = () => { try { localStorage.setItem(LS, JSON.stringify(getState())); } catch { /* storage full or blocked */ } };
const pristine = (s: GameState) => !s.sessions.length && !s.habits.length && !s.squads.length && s.buildings.length === 1 && !s.techs.length;

async function rpc(payload: unknown): Promise<Snapshot> {
  const { data, error } = await supabase!.rpc('sync_kingdom', { p: payload });
  if (error) throw new Error(error.message);
  return data as Snapshot;
}

const stamped = (sent: ReturnType<typeof buildPayload>) => { const k = sent.payload.kingdom as { world?: object | null }; if (k?.world) k.world = { ...k.world, stamp: newStamp() }; return sent; };
/** Push pending changes in one transaction, then adopt the merged server state when nothing is pending. */
export async function syncNow() {
  if (!supabase || !user || busy) return;
  busy = true; setStatus('syncing…');
  try {
    if (!pulled) {
      const snap = await rpc({});
      let s = getState();
      if (snap.buildings.length && pristine(s)) s = adoptSnapshot({ ...newGame(), owner: user.id, outbox: { ledger: [], dirty: {}, dead: {}, events: [], techs: false } }, snap);
      else {
        const serverCamp = snap.buildings.find((b) => b.kind === 'camp');
        if (serverCamp) { // keep the account's camp; drop this device's duplicate
          const local = s.buildings.find((b) => b.kind === 'camp');
          s = { ...s, buildings: s.buildings.map((b) => (b === local ? { ...b, id: serverCamp.id, x: serverCamp.x, y: serverCamp.y } : b)),
            outbox: { ...s.outbox, dirty: { ...s.outbox.dirty, buildings: (s.outbox.dirty.buildings ?? []).filter((id) => id !== local?.id) } } };
        }
      }
      // the cloud's world is the account's latest: never push this device's old copy over it
      if (snap.kingdom?.world && s.owner === user.id) s = { ...s, world: upgradeWorld(snap.kingdom.world) };
      seen = stampOf(snap); lastContact = Date.now();
      setState({ ...s, owner: user.id }, false); pulled = true; worldAtContact = getState().world;
    } else if (Date.now() - lastContact > 15_000) { // been away: check whether another device moved the world on
      const snap = await rpc({}), st = stampOf(snap);
      if (st && st !== seen && snap.kingdom?.world && getState().world === worldAtContact) { setState({ ...getState(), world: upgradeWorld(snap.kingdom.world) }, false); emit({ kind: 'info', text: 'Loaded newer progress from your other device.' }); }
      seen = st; lastContact = Date.now(); worldAtContact = getState().world;
    }
    await checkSchema().catch(() => {}); // know what the database can store before sending
    // an outdated database rejects big study rewards; send everything else and keep those waiting locally
    const probe = legacy && Date.now() - lastProbe > 10 * 60_000; // every 10 minutes, see whether the database was updated
    let sent = stamped(buildPayload(getState(), legacy && !probe ? heldBack(getState()) : new Set(), cloudLacks)), snap: Snapshot;
    try { snap = await rpc(sent.payload); if (probe && legacy) setLegacy(false); }
    catch (e) {
      if (!CEILING_ERR.test((e as Error).message)) throw e;
      lastProbe = Date.now(); setLegacy(true);
      sent = stamped(buildPayload(getState(), heldBack(getState()), cloudLacks)); snap = await rpc(sent.payload);
    }
    if (probe) lastProbe = Date.now();
    seen = (sent.payload.kingdom as { world?: { stamp?: string } }).world?.stamp; lastContact = Date.now();
    let s = clearSent(getState(), sent);
    const adopted = outboxEmpty(s);
    if (adopted) s = adoptSnapshot(s, snap);
    setState(s, false); saveLocal(); worldAtContact = getState().world;
    if (adopted) compensate(user.id);
    failures = 0;
    const waiting = legacy ? heldBack(getState()).size : 0;
    setStatus(`saved to cloud ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${waiting ? ` · ${waiting} study reward${waiting > 1 ? 's' : ''} waiting: update the database (run supabase/setup.sql)` : ''}`);
  } catch (e) {
    failures++; setStatus(`offline, will retry (${(e as Error).message.slice(0, 60)})`);
    clearTimeout(syncT); syncT = setTimeout(syncNow, Math.min(300_000, 5000 * 2 ** failures));
  } finally { busy = false; }
}

/** One-time grants for players affected by an outage, applied once the account's cloud save is loaded.
 *  The session id is derived from the account, so every device grants the same row and the server keeps one. */
const COMPENSATIONS = [
  { key: 'lan-loading-2026-11', before: Date.parse('2026-11-15T00:00:00Z'), minutes: 60, factor: 3, note: 'could not check in while the game would not load on other devices' },
];
function compensate(uid: string) {
  const s = getState();
  for (const c of COMPENSATIONS) {
    if (Date.now() > c.before + 30 * 86400_000) continue; // offer expires after a month
    if (!s.sessions.some((r) => r.startedAt < c.before)) continue; // only kingdoms that existed at the time
    grantCompensation(stableUuid(`${c.key}:${uid}`), c.minutes, c.factor, s.subjects[0] ?? 'Study', c.note);
  }
}

let started = false;
export function initPersistence() {
  if (started) return; started = true;
  try { const raw = localStorage.getItem(LS); if (raw) { const d = JSON.parse(raw); if (d.v === 2) setState({ ...newGame(), ...d, world: d.world ? upgradeWorld(d.world) : newGame().world }, false); } } catch { /* corrupt save: start fresh */ }
  saveLocal();
  subscribe(() => {
    clearTimeout(saveT); saveT = setTimeout(saveLocal, 250);
    if (user) { clearTimeout(syncT); syncT = setTimeout(syncNow, 4000); }
  });
  addEventListener('pagehide', saveLocal);
  addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(); syncNow(); });
  addEventListener('online', () => syncNow());
  setInterval(() => { if (user && !outboxEmpty(getState())) syncNow(); }, 60_000);
  // keep an open tab current with what your other devices do, so it never shows (or later saves) an old kingdom
  setInterval(() => { if (user && document.visibilityState === 'visible') syncNow(); }, 30_000);
  addEventListener('focus', () => { if (user) syncNow(); });
  if (!supabase) return;
  const onUser = (u: User | null) => {
    const was = user?.id; user = u;
    if (!u) { setStatus('signed out'); return; }
    if (u.id === was) return;
    const s = getState();
    if (s.owner && s.owner !== u.id) { setState(newGame(), false); } // never mix two accounts' kingdoms
    pulled = false; syncNow();
  };
  supabase.auth.getSession().then(({ data }) => onUser(data.session?.user ?? null));
  supabase.auth.onAuthStateChange((_e, sess) => onUser(sess?.user ?? null));
}

export async function signIn(email: string, password: string, signUp: boolean) {
  if (!supabase) return 'Cloud saves are not configured';
  const r = signUp ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
  return r.error?.message ?? (signUp && !r.data.session ? 'Check your email to confirm your account' : null);
}
export async function magicLink(email: string) {
  if (!supabase) return 'Cloud saves are not configured';
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  return error?.message ?? 'Magic link sent: check your email';
}
export async function signOut() {
  await syncNow();
  await supabase?.auth.signOut();
  setState(newGame(), false); saveLocal(); emit({ kind: 'info', text: 'Signed out. Your kingdom is safe in the cloud.' });
}
