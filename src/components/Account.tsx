'use client';
import { useState, useSyncExternalStore } from 'react';
import { supabase, signIn, magicLink, signOut, syncNow, getSyncStatus, syncStatus, getUser } from '../lib/sync.ts';
import { setState, newGame } from '../lib/state.ts';
const sub = (l: () => void) => (syncStatus.addEventListener('change', l), () => syncStatus.removeEventListener('change', l));

export function AccountPanel() {
  const status = useSyncExternalStore(sub, getSyncStatus, getSyncStatus), user = getUser();
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState<string | null>(null);
  return <div className="space-y-3 text-sm">
    <div>Cloud status: <b>{status}</b></div>
    {!supabase && <p className="text-xs">Cloud saves are disabled: set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Your progress is saved on this device.</p>}
    {supabase && (user ? <>
      <div>Signed in as <b>{user.email}</b></div>
      <div className="flex gap-2"><button className="btn flex-1" onClick={() => syncNow()}>Sync now</button><button className="btn flex-1" onClick={() => signOut()}>Sign out</button></div>
    </> : <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setMsg(await signIn(email, pw, false)); }}>
      <input className="inp" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="inp" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <div className="flex gap-2"><button className="btn btn-gold flex-1">Sign in</button>
        <button type="button" className="btn flex-1" onClick={async () => setMsg(await signIn(email, pw, true))}>Sign up</button>
        <button type="button" className="btn flex-1" onClick={async () => setMsg(await magicLink(email))}>Magic link</button></div>
      {msg && <div className="text-blood">{msg}</div>}
    </form>)}
    <hr className="border-parch-d" />
    <button className="btn btn-red" onClick={() => confirm('Start a brand new kingdom? This cannot be undone.') && setState(newGame())}>Reset kingdom</button>
  </div>;
}
