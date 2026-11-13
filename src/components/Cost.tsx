import type { Res } from '../lib/rewards.ts';
import { Icon } from './Icon.tsx';
import { fmt } from './hooks.ts';
export function Cost({ cost, have, n = 1, plus = false, zero = '—' }: { cost: Partial<Res>; have?: Res; n?: number; plus?: boolean; zero?: string }) {
  const ks = (['gold', 'wood', 'stone', 'renown'] as const).filter((k) => (cost[k] ?? 0) !== 0);
  if (!ks.length) return <span className="text-sm opacity-70">{zero}</span>;
  return <span className="inline-flex flex-wrap gap-x-2.5 gap-y-0.5">{ks.map((k) => {
    const v = (cost[k] ?? 0) * n, ok = !have || have[k] >= v;
    return <span key={k} className={`inline-flex items-center gap-0.5 ${ok ? '' : 'text-blood font-bold'}`} title={k}><Icon name={k} size={14} />{plus ? '+' : ''}{fmt(v)}</span>;
  })}</span>;
}
/** Small labelled section used across panels. */
export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return <section className="card p-2.5 space-y-1.5"><div className="flex items-center justify-between gap-2"><h3 className="font-bold">{title}</h3>{right}</div>{children}</section>;
}
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return <div className="flex gap-1">{items.map(([k, l]) => <button key={k} className={`btn flex-1 ${value === k ? 'btn-gold' : ''}`} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Bar({ value, max, color = 'bg-gold' }: { value: number; max: number; color?: string }) {
  return <div className="h-2.5 bg-black/15 rounded-sm overflow-hidden border border-black/20"><div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} /></div>;
}
