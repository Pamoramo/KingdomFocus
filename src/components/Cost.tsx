import type { Res } from '../lib/rewards.ts';
import { Icon } from './Icon.tsx';
import { fmt } from './hooks.ts';
export function Cost({ cost, have, n = 1 }: { cost: Partial<Res>; have?: Res; n?: number }) {
  const ks = (['gold', 'wood', 'stone', 'renown'] as const).filter((k) => (cost[k] ?? 0) > 0);
  if (!ks.length) return <span className="text-xs opacity-70">free</span>;
  return <span className="inline-flex flex-wrap gap-2 text-sm">{ks.map((k) => {
    const v = (cost[k] ?? 0) * n, ok = !have || have[k] >= v;
    return <span key={k} className={`inline-flex items-center gap-0.5 ${ok ? '' : 'text-blood font-bold'}`}><Icon name={k} size={14} />{fmt(v)}</span>;
  })}</span>;
}
