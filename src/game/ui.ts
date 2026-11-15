import type { BKind } from '../lib/economy.ts';
import type { BattlePlay } from '../lib/state.ts';
export interface Inspect { squad: string; idx: number }
export interface UI { view: 'kingdom' | 'world' | 'rival'; visit: string | null; selRival: string | null; battle: { play: BattlePlay; phase: 'playing' | 'report' } | null; placing: BKind | null; selBat: string | null; selArmy: string | null; selBuilding: string | null; moving: string | null; panel: string | null; inspect: Inspect | null; focus: boolean; night: number; weather: string; parade: { mode: 'review' | 'parade' } | null; studySubject?: string }
let ui: UI = { view: 'kingdom', visit: null, selRival: null, battle: null, placing: null, selBat: null, selArmy: null, selBuilding: null, moving: null, panel: null, inspect: null, focus: false, night: 0, weather: 'clear', parade: null };
const ls = new Set<() => void>();
export const getUI = () => ui;
export const setUI = (p: Partial<UI>) => { ui = { ...ui, ...p }; ls.forEach((l) => l()); };
export const subUI = (l: () => void) => (ls.add(l), () => { ls.delete(l); });
/** Lets React ask the scene to pan the camera. */
export const camBus = new EventTarget();
export const focusOn = (x: number, y: number) => camBus.dispatchEvent(new CustomEvent('focus', { detail: { x, y } }));
