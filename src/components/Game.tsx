'use client';
import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { KingdomScene } from '../game/KingdomScene.ts';
import { initPersistence } from '../lib/sync.ts';
import { getState, setState, studyTick, fxBus, type Fx } from '../lib/state.ts';
import { isAwaiting, dueAt } from '../lib/study.ts';
import { BUILDINGS } from '../lib/economy.ts';
import { useGame, useUI, fmt, chime } from './hooks.ts';
import { setUI } from '../game/ui.ts';
import { Icon } from './Icon.tsx';
import { StudyPanel, CheckInModal, StudyMini } from './Study.tsx';
import { BuildPanel } from './Build.tsx';
import { ArmyPanel } from './Army.tsx';
import { HabitsPanel } from './Habits.tsx';
import { StatsPanel } from './Stats.tsx';
import { AccountPanel } from './Account.tsx';

const TABS = [['study', 'Study'], ['build', 'Build'], ['army', 'Army'], ['habits', 'Habits'], ['stats', 'Chronicle'], ['account', 'Account']] as const;
const PANELS: Record<string, () => React.ReactNode> = { study: StudyPanel, build: BuildPanel, army: ArmyPanel, habits: HabitsPanel, stats: StatsPanel, account: AccountPanel };

function useCheckInAlerts() {
  const notified = useRef<number | null>(null);
  useEffect(() => {
    const run = () => {
      studyTick();
      const s = getState(), sess = s.session;
      if (sess && isAwaiting(sess, Date.now())) {
        const d = dueAt(sess)!;
        if (notified.current !== d) {
          notified.current = d;
          if (s.sound) chime();
          navigator.vibrate?.([200, 100, 200]);
          if ('Notification' in window && Notification.permission === 'granted' && document.hidden)
            try { new Notification('Kingdom of Discipline: check-in!', { body: 'Confirm you are still studying within 2 minutes.', tag: 'kod-checkin', requireInteraction: true }); } catch {}
        }
      }
    };
    const t = setInterval(run, 1000);
    const vis = () => run();
    document.addEventListener('visibilitychange', vis); addEventListener('focus', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); removeEventListener('focus', vis); };
  }, []);
}

function Toasts() {
  const [items, setItems] = useState<(Fx & { id: number })[]>([]);
  useEffect(() => {
    const on = (e: Event) => { const fx = { ...(e as CustomEvent<Fx>).detail, id: Math.random() }; setItems((x) => [...x.slice(-3), fx]); setTimeout(() => setItems((x) => x.filter((q) => q.id !== fx.id)), 3200); };
    fxBus.addEventListener('fx', on); return () => fxBus.removeEventListener('fx', on);
  }, []);
  return <div className="fixed top-14 left-1/2 -translate-x-1/2 z-40 space-y-1 pointer-events-none w-max max-w-[90vw]">{items.map((t) =>
    <div key={t.id} className={`pop px-3 py-1 rounded text-sm border-2 border-wood-d ${t.kind === 'error' ? 'bg-blood text-parch' : t.kind === 'achieve' ? 'bg-gold' : 'bg-parch'}`}>
      {t.kind === 'build' ? `Built: ${t.text}` : t.text}
      {t.res && <span className="ml-2 inline-flex gap-2">{(['gold', 'wood', 'stone', 'renown'] as const).filter((k) => (t.res![k] ?? 0) > 0).map((k) => <span key={k} className="inline-flex items-center gap-0.5"><Icon name={k} size={12} />+{fmt(t.res![k]!)}</span>)}</span>}
    </div>)}</div>;
}

function ResourceBar() {
  const s = useGame();
  return <div className="wood rounded-b-md flex items-center gap-3 sm:gap-5 px-3 py-1.5 text-sm sm:text-base">
    {(['gold', 'wood', 'stone', 'renown'] as const).map((k) => <span key={k} className="flex items-center gap-1 tabular-nums" title={k}><Icon name={k} size={18} />{fmt(s.res[k])}</span>)}
  </div>;
}

export default function Game() {
  const host = useRef<HTMLDivElement>(null), ui = useUI();
  useCheckInAlerts();
  useEffect(() => {
    initPersistence();
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current!, pixelArt: true, backgroundColor: '#2b2118', scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, scene: [KingdomScene], banner: false, input: { activePointers: 3 } });
    Object.assign(window, { __game: game, __kod: { getState, setState } });
    return () => game.destroy(true);
  }, []);
  const Panel = ui.panel ? PANELS[ui.panel] : null;
  const placing = ui.placing ? BUILDINGS[ui.placing].name : null;
  return <div className="fixed inset-0 overflow-hidden select-none">
    <div ref={host} className="absolute inset-0" />
    <div className="absolute top-0 inset-x-0 flex justify-between items-start gap-2 pointer-events-none px-2">
      <h1 className="hidden md:block font-title text-3xl text-parch drop-shadow-[0_2px_0_#000] pt-1">Kingdom of Discipline</h1>
      <div className="pointer-events-auto mx-auto md:mx-0"><ResourceBar /></div>
      <div className="pointer-events-auto pt-1 hidden md:block"><StudyMini onOpen={() => setUI({ panel: 'study' })} /></div>
    </div>
    <div className="md:hidden absolute top-12 left-2"><StudyMini onOpen={() => setUI({ panel: 'study' })} /></div>
    {(placing || ui.moving || (ui.selBat && !Panel)) && <div className="absolute top-12 right-2 md:top-14 wood rounded px-3 py-1 text-sm flex items-center gap-2 z-30">
      {placing ? `Placing ${placing}: tap the map${ui.placing === 'wall' || ui.placing === 'road' ? ' (drag to paint)' : ''}` : ui.moving ? 'Tap a new spot' : 'Tap map to march'}
      <button className="btn !py-0" onClick={() => setUI({ placing: null, moving: null, selBat: null })}>Done</button></div>}
    {Panel && <div className="absolute z-20 inset-x-0 bottom-16 max-h-[62dvh] md:inset-x-auto md:right-2 md:top-14 md:bottom-16 md:w-[400px] md:max-h-none flex flex-col panel mx-2 md:mx-0">
      <div className="flex items-center justify-between px-3 pt-2"><h2 className="font-title text-3xl">{TABS.find((t) => t[0] === ui.panel)?.[1]}</h2><button className="btn !px-2 !py-0" onClick={() => setUI({ panel: null })} aria-label="close">✕</button></div>
      <div className="overflow-y-auto p-3 pt-1"><Panel /></div>
    </div>}
    <nav className="absolute bottom-0 inset-x-0 z-30 flex justify-center pb-[env(safe-area-inset-bottom)]">
      <div className="wood rounded-t-md flex">{TABS.map(([k, label]) => <button key={k} onClick={() => setUI({ panel: ui.panel === k ? null : k, placing: null, moving: null })}
        className={`flex flex-col items-center px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs ${ui.panel === k ? 'bg-black/30' : ''}`}><Icon name={k} size={24} />{label}</button>)}</div>
    </nav>
    <Toasts />
    <CheckInModal />
  </div>;
}
