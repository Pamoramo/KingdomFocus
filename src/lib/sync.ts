import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { getState, setState, subscribe, newGame, emit, type GameState } from './state.ts';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase: SupabaseClient | null = URL && KEY ? createClient(URL, KEY) : null;
const LS = 'kod-save-v1';
let user: User | null = null;
let timer: ReturnType<typeof setTimeout> | undefined, cloudTimer: ReturnType<typeof setTimeout> | undefined;
export const syncStatus = new EventTarget();
let status = supabase ? 'signed out' : 'local only';
const setStatus = (s: string) => { status = s; syncStatus.dispatchEvent(new Event('change')); };
export const getSyncStatus = () => status;
export const getUser = () => user;

function migrate(d: Partial<GameState>): GameState { return { ...newGame(), ...d } as GameState; }

async function pushCloud() {
  if (!supabase || !user) return;
  const s = getState();
  const { error } = await supabase.from('saves').upsert({ user_id: user.id, data: s, updated_at: new Date(s.updatedAt).toISOString() });
  setStatus(error ? `sync error: ${error.message}` : `synced ${new Date().toLocaleTimeString()}`);
}

async function pullCloud() {
  if (!supabase || !user) return;
  setStatus('loading…');
  const { data, error } = await supabase.from('saves').select('data').eq('user_id', user.id).maybeSingle();
  if (error) return setStatus(`sync error: ${error.message}`);
  const remote = data?.data as GameState | undefined;
  if (remote && remote.updatedAt > getState().updatedAt) { setState(migrate(remote), false); emit({ kind: 'info', text: 'Cloud save loaded' }); }
  await pushCloud();
}

let started = false;
export function initPersistence() {
  if (started) return; started = true;
  try { const raw = localStorage.getItem(LS); if (raw) setState(migrate(JSON.parse(raw)), false); } catch {}
  subscribe(() => {
    clearTimeout(timer); timer = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(getState())); } catch {} }, 300);
    if (user) { clearTimeout(cloudTimer); cloudTimer = setTimeout(pushCloud, 3000); }
  });
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(getState())); } catch {} };
  save(); addEventListener('pagehide', save);
  if (!supabase) return;
  supabase.auth.getSession().then(({ data }) => { user = data.session?.user ?? null; if (user) pullCloud(); });
  supabase.auth.onAuthStateChange((_e, sess) => {
    const was = user?.id; user = sess?.user ?? null;
    if (user && user.id !== was) pullCloud();
    if (!user) setStatus('signed out');
  });
}

export async function signIn(email: string, password: string, signUp: boolean) {
  if (!supabase) return 'Cloud not configured';
  const r = signUp ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
  return r.error?.message ?? (signUp && !r.data.session ? 'Check your email to confirm' : null);
}
export async function magicLink(email: string) {
  if (!supabase) return 'Cloud not configured';
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
  return error?.message ?? 'Magic link sent';
}
export const signOut = () => supabase?.auth.signOut();
export const syncNow = () => pullCloud();
