import { useEffect, useState, useSyncExternalStore } from 'react';
import { getState, subscribe } from '../lib/state.ts';
import { getUI, subUI } from '../game/ui.ts';
export const useGame = () => useSyncExternalStore(subscribe, getState, getState);
export const useUI = () => useSyncExternalStore(subUI, getUI, getUI);
export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
export const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.floor(n).toLocaleString());
export const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); return `${h ? h + ':' : ''}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

let ac: AudioContext | null = null;
export function chime() {
  try {
    ac ??= new AudioContext();
    [660, 880, 1320].forEach((f, i) => {
      const o = ac!.createOscillator(), g = ac!.createGain(); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.06, ac!.currentTime + i * 0.12); g.gain.exponentialRampToValueAtTime(0.001, ac!.currentTime + i * 0.12 + 0.25);
      o.connect(g).connect(ac!.destination); o.start(ac!.currentTime + i * 0.12); o.stop(ac!.currentTime + i * 0.12 + 0.3);
    });
  } catch {}
}
