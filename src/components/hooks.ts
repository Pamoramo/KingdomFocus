import { useEffect, useState, useSyncExternalStore } from 'react';
import { getState, subscribe } from '../lib/state.ts';
import { getUI, subUI } from '../game/ui.ts';
export const useGame = () => useSyncExternalStore(subscribe, getState, getState);
export const useUI = () => useSyncExternalStore(subUI, getUI, getUI);
export function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
export const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.floor(n).toLocaleString());
export const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600); return `${h ? h + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
export const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${Math.round(min % 60)}m` : `${Math.round(min)}m`);
export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
export const mobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

let ac: AudioContext | null = null;
export function chime(kind: 'checkin' | 'reward' | 'break' = 'checkin') {
  try {
    ac ??= new AudioContext();
    const notes = kind === 'reward' ? [523, 659, 784, 1046] : kind === 'break' ? [784, 659, 523] : [660, 880, 1320];
    notes.forEach((f, i) => {
      const o = ac!.createOscillator(), g = ac!.createGain(), t = ac!.currentTime + i * 0.12; o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(ac!.destination); o.start(t); o.stop(t + 0.3);
    });
  } catch { /* audio unavailable */ }
}
