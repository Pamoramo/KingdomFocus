'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase, signIn, magicLink, signOut, syncNow, getSyncStatus, syncStatus, getUser, getSchemaVersion, SCHEMA_WANTED } from '../lib/sync.ts';
import { setState, newGame, setSettings, unlocked, getState } from '../lib/state.ts';
import { DEFAULT_RATES, RES_KEYS } from '../lib/rewards.ts';
import { useGame } from './hooks.ts';
import { Icon } from './Icon.tsx';
import { Section } from './Cost.tsx';

const sub = (l: () => void) => (syncStatus.addEventListener('change', l), () => syncStatus.removeEventListener('change', l));
export const useSync = () => useSyncExternalStore(sub, getSyncStatus, getSyncStatus);
type BIP = Event & { prompt: () => Promise<void> };
let deferred: BIP | null = null;
if (typeof window !== 'undefined') addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; });

export const THEMES: [string, string, string | null][] = [['parchment', 'Parchment', null], ['stone', 'Castle Stone', 'theme:stone'], ['royal', 'Royal Purple', 'theme:royal'], ['midnight', 'Midnight', 'theme:midnight']];

function Account() {
  const status = useSync(), user = getUser();
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [msg, setMsg] = useState<string | null>(null);
  return <Section title="Account & cloud save">
    <div className="text-sm">Status: <b>{status}</b></div>
    {user && getSchemaVersion() !== null && getSchemaVersion()! < SCHEMA_WANTED && <div className="text-sm border-2 border-blood/60 bg-blood/10 p-2 space-y-1">
      <b>Your cloud database needs an update.</b>
      <p className="text-xs">{getSchemaVersion()! < 5 ? 'It still has an older reward limit, so rewards from long or boosted study sessions are kept on this device until it is updated. ' : ''}It cannot store taverns yet, so you can build one only after updating. Open your Supabase project → <b>SQL Editor</b> → paste the whole of <code>supabase/setup.sql</code> from the game's files → <b>Run</b>. It is safe to run more than once, and nothing is lost.</p>
    </div>}
    {!supabase && <p className="text-xs">Cloud sync is not configured for this deployment (see README). Progress is saved on this device.</p>}
    {supabase && (user ? <>
      <div className="text-sm">Signed in as <b>{user.email}</b>. Your kingdom syncs automatically across devices.</div>
      <div className="flex gap-2"><button className="btn flex-1" onClick={() => syncNow()}>Sync now</button><button className="btn flex-1" onClick={() => signOut()}>Sign out</button></div>
    </> : <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setMsg(await signIn(email, pw, false)); }}>
      <p className="text-xs">Sign in to save your kingdom to the cloud and play on every device. Progress made as a guest is merged into your account.</p>
      <input className="inp" type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="inp" type="password" autoComplete="current-password" placeholder="Password (6+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
      <div className="flex gap-2"><button className="btn btn-gold flex-1">Sign in</button>
        <button type="button" className="btn flex-1" onClick={async () => setMsg(await signIn(email, pw, true))}>Create account</button></div>
      <button type="button" className="btn w-full" onClick={async () => setMsg(await magicLink(email))}>Email me a sign-in link</button>
      {msg && <div className="text-sm text-blood">{msg}</div>}
    </form>)}
  </Section>;
}

export function SettingsPanel() {
  const s = useGame(), st = s.settings, cfg = st.cfg, [canInstall, setCanInstall] = useState(false);
  useEffect(() => { setCanInstall(!!deferred); }, []);
  const rate = (k: (typeof RES_KEYS)[number], v: number) => setSettings({ rates: { ...st.rates, [k]: Math.max(0, Math.min(DEFAULT_RATES[k] * 2, v)) } });
  return <div className="space-y-3">
    <Account />
    <Section title="Study rewards (per verified minute)">
      <div className="grid grid-cols-2 gap-2 text-sm">{RES_KEYS.map((k) => <label key={k} className="flex items-center gap-1 capitalize"><Icon name={k} size={16} /><input type="number" className="inp" min={0} max={DEFAULT_RATES[k] * 2} step={k === 'renown' ? 0.1 : 1} value={st.rates[k]} onChange={(e) => rate(k, +e.target.value)} /></label>)}</div>
      <p className="text-xs opacity-75">Rewards are strictly proportional to verified minutes. Each rate can be set up to double its default. <button className="underline" onClick={() => setSettings({ rates: { ...DEFAULT_RATES } })}>Reset to 10 / 5 / 3 / 1</button></p>
    </Section>
    <Section title="Check-ins & pomodoro">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>Check-in every<select className="inp" value={cfg.intervalMin} onChange={(e) => setSettings({ cfg: { ...cfg, intervalMin: +e.target.value } })}>{[15, 25, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        <label>Time to respond<select className="inp" value={cfg.graceMin} onChange={(e) => setSettings({ cfg: { ...cfg, graceMin: +e.target.value } })}>{[2, 3, 5].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        <label>Short break<select className="inp" value={cfg.breakMin} onChange={(e) => setSettings({ cfg: { ...cfg, breakMin: +e.target.value } })}>{[5, 10].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
        <label>Long break<select className="inp" value={cfg.longBreakMin} onChange={(e) => setSettings({ cfg: { ...cfg, longBreakMin: +e.target.value } })}>{[15, 20, 30].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.requireNote} onChange={(e) => setSettings({ requireNote: e.target.checked })} /> Ask what I studied at each check-in</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.notify} onChange={(e) => { setSettings({ notify: e.target.checked }); if (e.target.checked && 'Notification' in window) Notification.requestPermission(); }} /> Notifications when a check-in is due</label>
    </Section>
    <Section title="Sound & music">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.sound} onChange={(e) => setSettings({ sound: e.target.checked })} /> All sound</label>
      <label className="flex items-center gap-2 text-sm">Music<input type="range" min={0} max={1} step={0.05} className="flex-1" value={st.music ?? 0.5} onChange={(e) => setSettings({ music: +e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm">Effects<input type="range" min={0} max={1} step={0.05} className="flex-1" value={st.sfx ?? 0.7} onChange={(e) => setSettings({ sfx: +e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.ambience ?? true} onChange={(e) => setSettings({ ambience: e.target.checked })} /> Ambience (birdsong, wind, the forge, the market, crickets at night)</label>
      <label className="flex items-center gap-2 text-sm">Ambience volume <input type="range" className="flex-1" min={0} max={1} step={0.05} value={st.ambVol ?? 0.7} disabled={!(st.ambience ?? true)} onChange={(e) => setSettings({ ambVol: +e.target.value })} /></label>
      <p className="text-xs opacity-75">All music is generated live: a lute, recorder and drum play in a medieval mode that shifts with day, night and war.</p>
    </Section>
    <Section title="Appearance">
      <div className="flex gap-1 flex-wrap">{THEMES.map(([id, name, req]) => { const ok = !req || unlocked(s, req); return <button key={id} disabled={!ok} title={ok ? '' : 'Unlocked by an achievement'} className={`btn text-sm ${st.theme === id ? 'btn-gold' : ''}`} onClick={() => setSettings({ theme: id })}>{name}{ok ? '' : ' (locked)'}</button>; })}</div>
      <div className="flex gap-1">{(['auto', 'day', 'night'] as const).map((m) => <button key={m} className={`btn flex-1 capitalize ${st.dayNight === m ? 'btn-gold' : ''}`} onClick={() => setSettings({ dayNight: m })}>{m === 'auto' ? 'Real time of day' : m}</button>)}</div>
    </Section>
    <Section title="App">
      {canInstall ? <button className="btn w-full" onClick={async () => { await deferred?.prompt(); deferred = null; setCanInstall(false); }}>Install Kingdom of Discipline</button>
        : <p className="text-xs">To install: on iPhone/iPad tap Share → Add to Home Screen; on desktop use the install icon in the address bar.</p>}
      <p className="text-xs opacity-75">Keys: WASD/arrows pan · Q/E zoom · Esc cancel · drag to pan · wheel or pinch to zoom.</p>
      <div className="flex gap-2">
        <button className="btn flex-1" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(getState(), null, 1)], { type: 'application/json' })); a.download = 'kingdom-of-discipline.json'; a.click(); }}>Export save</button>
        {!getUser() && <button className="btn btn-red flex-1" onClick={() => { if (confirm('Start a new kingdom on this device? This erases the local guest kingdom.') && confirm('Are you sure?')) setState(newGame()); }}>New kingdom</button>}
      </div>
    </Section>
  </div>;
}
