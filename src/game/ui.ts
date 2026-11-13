import type { BKind } from '../lib/economy.ts';
export interface UI { placing: BKind | null; selBat: string | null; selBuilding: string | null; moving: string | null; panel: string | null }
let ui: UI = { placing: null, selBat: null, selBuilding: null, moving: null, panel: null };
const ls = new Set<() => void>();
export const getUI = () => ui;
export const setUI = (p: Partial<UI>) => { ui = { ...ui, ...p }; ls.forEach((l) => l()); };
export const subUI = (l: () => void) => (ls.add(l), () => ls.delete(l));
