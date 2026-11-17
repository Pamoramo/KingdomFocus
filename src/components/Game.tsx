'use client';
import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { KingdomScene } from '../game/KingdomScene.ts';
import { WorldScene } from '../game/WorldScene.ts';
import { BattleScene } from '../game/BattleScene.ts';
import { RivalScene } from '../game/RivalScene.ts';
import { LandScene } from '../game/LandScene.ts';
import { sitesFor } from '../lib/expansion.ts';
import { ParadeScene } from '../game/ParadeScene.ts';
import { audio, type Sfx } from '../game/audio.ts';
import { WEATHER_NAME, type Weather } from '../game/weather.ts';
import { worldTick, journeysTick, breachTick } from '../lib/warActions.ts';
import { clockOf, dayNumber, nextDayAt } from '../lib/war.ts';
import { WorldPanel, BattleReport, worldBadge } from './World.tsx';
import { AssignmentsPanel, assignmentBadge } from './Assignments.tsx';
import { assignmentsTick } from '../lib/assignments.ts';
import { courtTick } from '../lib/realmActions.ts';
import { initPersistence } from '../lib/sync.ts';
import { getState, setState, onDuty, studyTick, fxBus, neglect, idleDays, type Fx } from '../lib/state.ts';
import { isAwaiting, dueAt } from '../lib/study.ts';
import { BUILDINGS, STAGES } from '../lib/economy.ts';
import { useGame, useUI, fmt, useNow, clock } from './hooks.ts';
import { setUI } from '../game/ui.ts';
import { Icon } from './Icon.tsx';
import { StudyPanel, CheckInModal, StudyMini, FocusMode, SessionComplete } from './Study.tsx';
import { BuildPanel } from './Build.tsx';
import { ArmyPanel, SoldierCard } from './Army.tsx';
import { HabitsPanel } from './Habits.tsx';
import { RealmPanel } from './Realm.tsx';
import { ChroniclePanel } from './Chronicle.tsx';
import { SettingsPanel, useSync } from './Settings.tsx';

const TABS = [['study', 'Study', 'study'], ['build', 'Build', 'build'], ['army', 'Army', 'army'], ['world', 'War', 'map'], ['habits', 'Habits', 'habits'], ['tasks', 'Tasks', 'calendar'], ['realm', 'Realm', 'realm'], ['chronicle', 'Chronicle', 'stats'], ['settings', 'Settings', 'account']] as const;
const PANELS: Record<string, () => React.ReactNode> = { world: WorldPanel, study: StudyPanel, build: BuildPanel, army: ArmyPanel, habits: HabitsPanel, tasks: AssignmentsPanel, realm: RealmPanel, chronicle: ChroniclePanel, settings: SettingsPanel };

/** Ticks the study timer, and alerts (sound, vibration, notification) when a check-in is due, even from a background tab. */
function useStudyAlerts() {
  const notified = useRef<number | null>(null);
  useEffect(() => {
    const run = () => {
      studyTick();
      const s = getState(), sess = s.session; if (!sess) return;
      const now = Date.now(), breakOver = sess.status === 'break' && sess.breakUntil && now >= sess.breakUntil;
      if (isAwaiting(sess, now) || breakOver) {
        const key = breakOver ? sess.breakUntil! : dueAt(sess)!;
        if (notified.current !== key) {
          notified.current = key;
          if (s.settings.sound) audio.play(breakOver ? 'break' : 'checkin');
          navigator.vibrate?.([200, 100, 200]);
          if (s.settings.notify && 'Notification' in window && Notification.permission === 'granted' && document.hidden)
            try { new Notification(breakOver ? 'Break is over' : 'Check-in: are you still studying?', { body: breakOver ? 'Return to your studies when ready.' : `Confirm within ${sess.cfg.graceMin} minutes to keep your session running.`, tag: 'kod-checkin', requireInteraction: true }); } catch { /* unsupported */ }
        }
      }
    };
    const t = setInterval(run, 1000), vis = () => run();
    document.addEventListener('visibilitychange', vis); addEventListener('focus', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); removeEventListener('focus', vis); };
  }, []);
}

function Toasts() {
  const [items, setItems] = useState<(Fx & { key: number })[]>([]);
  useEffect(() => {
    const on = (e: Event) => { const fx = { ...(e as CustomEvent<Fx>).detail, key: Math.random() }; if (fx.big && fx.kind === 'reward') return; setItems((x) => [...x.slice(-3), fx]); setTimeout(() => setItems((x) => x.filter((q) => q.key !== fx.key)), fx.kind === 'stage' ? 6000 : 3200); };
    fxBus.addEventListener('fx', on); return () => fxBus.removeEventListener('fx', on);
  }, []);
  return <div className="fixed top-24 md:top-16 left-1/2 -translate-x-1/2 z-[55] space-y-1 pointer-events-none w-max max-w-[92vw]" aria-live="polite">{items.map((t) =>
    <div key={t.key} className={`pop px-3 py-1 rounded border-2 border-wood-d ${t.kind === 'error' ? 'bg-blood text-parch' : t.kind === 'stage' ? 'bg-gold text-xl font-title px-5 py-2' : t.kind === 'achieve' || t.kind === 'promote' ? 'bg-gold' : 'bg-parch text-ink'}`}>
      {t.kind === 'build' ? `Construction: ${t.text}` : t.kind === 'stage' ? `Your realm has grown! ${t.text}` : t.text}
      {t.res && <span className="ml-2 inline-flex gap-2">{(['gold', 'wood', 'stone', 'renown'] as const).filter((k) => (t.res![k] ?? 0) > 0).map((k) => <span key={k} className="inline-flex items-center gap-0.5"><Icon name={k} size={12} />+{fmt(t.res![k]!)}</span>)}</span>}
    </div>)}</div>;
}

function Counter({ k, v }: { k: string; v: number }) {
  const [shown, setShown] = useState(v), [flash, setFlash] = useState(0);
  useEffect(() => {
    if (v === shown) return; setFlash(v > shown ? 1 : -1);
    const start = shown, t0 = performance.now(); let id = 0;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 700); setShown(Math.round(start + (v - start) * p)); if (p < 1) id = requestAnimationFrame(step); else setTimeout(() => setFlash(0), 300); };
    id = requestAnimationFrame(step); return () => cancelAnimationFrame(id);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span className={`flex items-center gap-1 tabular-nums transition-colors ${flash > 0 ? 'text-gold' : flash < 0 ? 'text-red-300' : ''}`} title={k}><Icon name={k} size={18} />{fmt(shown)}</span>;
}

function TopBar() {
  const s = useGame(), sync = useSync(), ui = useUI();
  return <div className="absolute top-0 inset-x-0 z-30 flex flex-wrap justify-between items-start gap-2 pointer-events-none px-2 pt-[env(safe-area-inset-top)]">
    <div className="pointer-events-auto hidden lg:flex flex-col pt-1">
      <h1 className="font-title text-3xl text-parch drop-shadow-[0_2px_0_#000] leading-none">Kingdom of Discipline</h1>
      <button className="text-left text-parch/90 text-sm drop-shadow-[0_1px_0_#000]" onClick={() => setUI({ panel: 'realm' })}>Stage {s.stage}: {STAGES[s.stage - 1].name}</button>
    </div>
    <div className="pointer-events-auto mx-auto lg:mx-0 wood rounded-b-md flex items-center gap-3 sm:gap-5 px-3 py-1.5">
      {(['gold', 'wood', 'stone', 'renown'] as const).map((k) => <Counter key={k} k={k} v={s.res[k]} />)}
      <span className={`w-2 h-2 rounded-full ${sync.startsWith('saved') ? 'bg-green-400' : sync.startsWith('offline') || sync.startsWith('sync error') ? 'bg-red-400' : 'bg-yellow-300'}`} title={`Cloud: ${sync}`} />
      <DayCounter />
      <span title={WEATHER_NAME[ui.weather as Weather] ?? 'Clear skies'} className="flex"><Icon name={ui.weather === 'clear' || !ui.weather ? (ui.night > 0.5 ? 'moon' : 'sun') : ui.weather} size={16} /></span>
    </div>
    <div className="pointer-events-auto pt-1 w-full lg:w-auto flex justify-center gap-1.5 flex-wrap">
      <StudyMini onOpen={() => setUI({ panel: 'study' })} />
      {ui.view === 'rival' && <span className="wood rounded px-2.5 py-1 text-sm">Visiting {s.world.rivals.find((r) => r.id === ui.visit)?.name}</span>}
      {ui.view === 'land' && <span className="wood rounded px-2.5 py-1 text-sm">Visiting {sitesFor(s.world.seed, s.world.rivals).find((x) => x.id === ui.visit)?.name}</span>}
      {ui.view !== 'world' && <button className="wood rounded px-2.5 py-1 flex items-center gap-1 text-sm" onClick={() => setUI({ view: 'world' })}><Icon name="map" size={18} />World</button>}
      {ui.view !== 'kingdom' && <button className="wood rounded px-2.5 py-1 flex items-center gap-1 text-sm" onClick={() => setUI({ view: 'kingdom' })}><Icon name="realm" size={18} />Kingdom</button>}
      {neglect(s) > 0 && <button className="rounded px-2.5 py-1 text-sm bg-[#6a3a1a] text-parch border-2 border-black" title="Study to calm the realm" onClick={() => setUI({ panel: 'study' })}>Restless realm · {idleDays(s)} idle days</button>}
      {s.world.threat && <button className="rounded px-2.5 py-1 text-sm bg-blood text-parch border-2 border-black pulse" onClick={() => setUI({ panel: 'world' })}>Under siege!</button>}
      {s.world.campaign && <button className="wood rounded px-2.5 py-1 text-sm" onClick={() => setUI({ panel: 'world' })}>{s.world.campaign.phase === 'field' ? 'Battle awaits' : `Siege day ${s.world.campaign.day}`}</button>}
    </div>
  </div>;
}

function Welcome() {
  const s = useGame(), [open, setOpen] = useState(true);
  if (!open || s.sessions.length || s.buildings.length > 1) return null;
  return <div className="fixed inset-0 z-[65] grid place-items-center bg-black/50 p-4"><div className="panel pop max-w-md p-5 space-y-3">
    <h2 className="font-title text-4xl text-center">Kingdom of Discipline</h2>
    <p>Your realm begins as a barren camp on cracked earth. <b>Every minute you study</b> earns gold, wood, stone and renown, and trains your soldiers. Good habits earn more.</p>
    <p>Spend your earnings to build huts, farms and walls, raise battalions, and grow a camp into a Royal Citadel over the coming months.</p>
    <ul className="text-sm list-disc pl-5"><li>Drag to pan, scroll or pinch to zoom.</li><li>The timer asks you to check in now and then; answer to keep earning.</li><li>Rest days never cost you anything.</li></ul>
    <button className="btn btn-gold w-full text-lg" onClick={() => { setOpen(false); setUI({ panel: 'study' }); }}>Begin my first study session</button>
    <button className="btn w-full" onClick={() => setOpen(false)}>Look around first</button>
  </div></div>;
}

/** The day of the realm, and how long until the next one (tap to change how long a day lasts). The world turns the moment a day ends. */
function DayCounter() {
  const s = useGame(), now = useNow(1000), c = clockOf(s.world), n = dayNumber(c, now), left = nextDayAt(c, now) - now;
  useEffect(() => { worldTick(); }, [n]);
  return <button className="flex flex-col items-center leading-none text-parch" title={`Day ${n} of your reign. The next day begins in ${clock(left)}. Tap to change how long a day lasts.`} onClick={() => setUI({ panel: 'settings' })}>
    <span className="text-sm font-bold whitespace-nowrap">Day {n}</span><span className="text-[10px] opacity-80 tabular-nums">{clock(left)}</span></button>;
}

export default function Game() {
  const host = useRef<HTMLDivElement>(null), ui = useUI(), s = useGame(), gameRef = useRef<Phaser.Game | null>(null);
  useStudyAlerts();
  useEffect(() => {
    initPersistence();
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current!, pixelArt: true, backgroundColor: '#2b2118', scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, scene: [KingdomScene, WorldScene, RivalScene, LandScene, BattleScene, ParadeScene], banner: false, input: { activePointers: 3 }, fps: { target: 60 } });
    gameRef.current = game;
    worldTick(); courtTick(); const wt = setInterval(() => { worldTick(); courtTick(); }, 60000); const jt = setInterval(() => { journeysTick(); assignmentsTick(); breachTick(); }, 2000);
    const wake = () => { audio.start(); const st = getState().settings; audio.setVolumes({ music: st.music ?? 0.5, sfx: st.sfx ?? 0.7, ambience: st.ambience ?? true, ambVol: st.ambVol ?? 0.7 }); };
    addEventListener('pointerdown', wake); addEventListener('keydown', wake);
    const click = (e: MouseEvent) => { if ((e.target as HTMLElement).closest?.('.btn')) audio.play('click'); };
    addEventListener('click', click, true);
    const SFX: Partial<Record<Fx['kind'], Sfx>> = { reward: 'coin', build: 'build', promote: 'promote', achieve: 'achieve', stage: 'stage', error: 'error', war: 'horn' };
    const onFx = (e: Event) => {
      const fx = (e as CustomEvent<Fx>).detail;
      if (fx.kind === 'battle' && fx.battle) { setUI({ battle: { play: fx.battle, phase: 'playing' }, panel: null }); game.scene.start('battle', fx.battle); game.scene.bringToTop('battle'); return; }
      if (!getState().settings.sound) return;
      if (fx.kind === 'info' && fx.text.startsWith('Recruited')) audio.play('recruit');
      else if (fx.kind === 'reward' && fx.big) audio.play('reward');
      else { const k = SFX[fx.kind]; if (k) audio.play(k); }
    };
    fxBus.addEventListener('fx', onFx);
    Object.assign(window, { __game: game, __kod: { getState, setState, setUI } });
    const keys = (e: KeyboardEvent) => {
      const el = document.activeElement; if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      const i = +e.key - 1; if (i >= 0 && i < TABS.length) setUI({ panel: TABS[i][0] });
    };
    addEventListener('keydown', keys);
    if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { game.destroy(true); removeEventListener('keydown', keys); clearInterval(wt); clearInterval(jt); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); removeEventListener('click', click, true); fxBus.removeEventListener('fx', onFx); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = s.settings.theme; }, [s.settings.theme]);
  useEffect(() => { audio.setVolumes({ music: s.settings.sound ? s.settings.music ?? 0.5 : 0, sfx: s.settings.sound ? s.settings.sfx ?? 0.7 : 0, ambience: s.settings.sound && (s.settings.ambience ?? true), ambVol: s.settings.ambVol ?? 0.7 }); }, [s.settings.ambVol, s.settings.music, s.settings.sfx, s.settings.ambience, s.settings.sound]);
  // the parade ground: start the scene when a review or parade is called, stop it when dismissed
  useEffect(() => { const g = gameRef.current; if (!g) return;
    if (ui.parade) { g.scene.start('parade', { mode: ui.parade.mode }); g.scene.bringToTop('parade'); } else if (g.scene.isActive('parade')) g.scene.stop('parade');
  }, [ui.parade?.mode, !!ui.parade]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { audio.setMood(s.world.campaign || s.world.threat || ui.battle ? 'war' : ui.night > 0.5 ? 'night' : 'day'); }, [!!s.world.campaign, !!s.world.threat, !!ui.battle, ui.night]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const g = gameRef.current; if (!g) return;
    const show = (k: string) => { if (g.scene.isSleeping(k)) g.scene.wake(k); else if (!g.scene.isActive(k)) g.scene.run(k); };
    if (ui.view !== 'kingdom') g.scene.sleep('kingdom');
    if (ui.view !== 'world' && g.scene.isActive('world')) g.scene.sleep('world');
    if (ui.view !== 'rival' && (g.scene.isActive('rival') || g.scene.isSleeping('rival'))) g.scene.stop('rival');
    if (ui.view !== 'land' && (g.scene.isActive('land') || g.scene.isSleeping('land'))) g.scene.stop('land');
    if (ui.view === 'kingdom') show('kingdom');
    if (ui.view === 'world') show('world');
    if (ui.view === 'rival' && ui.visit) { g.scene.start('rival', { id: ui.visit }); g.scene.bringToTop('battle'); }
    if (ui.view === 'land' && ui.visit) { g.scene.start('land', { id: ui.visit }); g.scene.bringToTop('battle'); }
  }, [ui.view, ui.visit]);
  const Panel = ui.panel ? PANELS[ui.panel] : null;
  const placing = ui.placing ? BUILDINGS[ui.placing].name : null;
  const hint = placing ? `Placing ${placing}: tap the map${BUILDINGS[ui.placing!].paint ? ' or drag to paint' : ''}` : ui.moving ? 'Tap a new spot for the building' : ui.selArmy ? `Tap the map to march the ${ui.selArmy}` : ui.selBat && !Panel ? (() => { const st = getState(), b = st.battalions.find((x) => x.id === ui.selBat); return b && onDuty(st, b) ? 'This battalion is on duty (patrol, guard or quarters): give it Hold formation orders to march it' : 'Tap the map to march the battalion'; })() : null;
  return <div className="fixed inset-0 overflow-hidden select-none">
    <div ref={host} className="absolute inset-0" />
    <TopBar />
    {hint && <div className="absolute top-28 lg:top-14 right-2 wood rounded px-3 py-1 text-sm flex items-center gap-2 z-30 max-w-[90vw]">{hint}
      <button className="btn !py-0" onClick={() => setUI({ placing: null, moving: null, selBat: null, selArmy: null })}>Done</button></div>}
    {Panel && <aside className="absolute z-20 inset-x-0 bottom-[60px] max-h-[62dvh] md:inset-x-auto md:right-2 md:top-14 md:bottom-[68px] md:w-[420px] md:max-h-none flex flex-col panel mx-1 md:mx-0">
      <div className="flex items-center justify-between px-3 pt-2"><h2 className="font-title text-3xl">{TABS.find((t) => t[0] === ui.panel)?.[1]}</h2><button className="btn !px-2 !py-0" onClick={() => setUI({ panel: null, selBuilding: null })} aria-label="Close panel">✕</button></div>
      <div className="overflow-y-auto overscroll-contain p-3 pt-1"><Panel /></div>
    </aside>}
    <nav className="absolute bottom-0 inset-x-0 z-30 flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className="wood rounded-t-md flex max-w-full overflow-x-auto">{TABS.map(([k, label, icon]) => <button key={k} onClick={() => setUI({ panel: ui.panel === k ? null : k, placing: null, moving: null, selArmy: null })}
        className={`relative flex flex-col items-center px-2 sm:px-3.5 py-1 text-xs sm:text-sm ${ui.panel === k ? 'bg-black/30' : ''}`} aria-pressed={ui.panel === k}><Icon name={icon} size={24} />{label}{k === 'world' && worldBadge(s) > 0 && <span className="absolute top-0 right-1 bg-blood text-parch rounded-full text-[10px] px-1">{worldBadge(s)}</span>}{k === 'tasks' && assignmentBadge(s) > 0 && <span className="absolute top-0 right-1 bg-blood text-parch rounded-full text-[10px] px-1">{assignmentBadge(s)}</span>}</button>)}</div>
    </nav>
    {ui.clearing?.length ? <div className="absolute z-[72] bottom-20 left-1/2 -translate-x-1/2 flex items-center gap-2 wood px-3 py-1.5 rounded text-parch text-sm"><span>Drag a box to clear {ui.clearing.length > 1 ? 'walls & more' : 'tiles'}</span><button className="btn btn-red !py-0" onClick={() => setUI({ clearing: null })}>Done clearing</button></div> : null}
    {ui.parade && <button className="absolute z-[72] bottom-20 right-3 btn btn-gold" onClick={() => (gameRef.current?.scene.getScene('parade') as ParadeScene | undefined)?.finish()}>{ui.parade.mode === 'review' ? 'Dismiss the army' : 'Leave the parade'}</button>}
    {ui.battle?.phase === 'playing' && <button className="absolute z-[72] bottom-20 right-3 btn btn-gold" onClick={() => (gameRef.current?.scene.getScene('battle') as BattleScene | undefined)?.finish()}>Skip battle</button>}
    <BattleReport />
    <SoldierCard />
    <Toasts />
    {ui.focus && <FocusMode />}
    <CheckInModal />
    <SessionComplete />
    <Welcome />
  </div>;
}
