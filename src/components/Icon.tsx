'use client';
import { useMemo } from 'react';
import { iconCanvas } from '../game/art.ts';
const cache = new Map<string, string>();
export function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const src = useMemo(() => { if (!cache.has(name)) cache.set(name, iconCanvas(name, 4).toDataURL()); return cache.get(name)!; }, [name]);
  return <img src={src} width={size} height={size} alt={name} className={`pix inline-block ${className}`} />;
}
export function Sprite({ canvas, scale = 2, className = '' }: { canvas: () => HTMLCanvasElement; scale?: number; className?: string }) {
  const c = useMemo(canvas, [canvas]);
  const src = useMemo(() => c.toDataURL(), [c]);
  return <img src={src} width={c.width * scale} height={c.height * scale} alt="" className={`pix ${className}`} />;
}
