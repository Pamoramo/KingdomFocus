'use client';
import { useMemo } from 'react';
import { iconCanvas } from '../game/art/misc.ts';
const cache = new Map<string, string>();
export function Icon({ name, size = 20, className = '' }: { name: string; size?: number; className?: string }) {
  const src = useMemo(() => { if (!cache.has(name)) cache.set(name, iconCanvas(name, 4).toDataURL()); return cache.get(name)!; }, [name]);
  return <img src={src} width={size} height={size} alt="" aria-hidden className={`pix inline-block ${className}`} />;
}
const spriteCache = new Map<string, string>();
/** Renders a procedural canvas as a crisp pixel image; `id` caches the result. */
export function Sprite({ id, draw, scale = 2, className = '' }: { id: string; draw: () => HTMLCanvasElement; scale?: number; className?: string }) {
  const [src, w, h] = useMemo(() => {
    if (!spriteCache.has(id)) { const c = draw(); spriteCache.set(id, `${c.width}x${c.height}|${c.toDataURL()}`); }
    const [dim, url] = spriteCache.get(id)!.split('|'); const [cw, ch] = dim.split('x').map(Number); return [url, cw, ch];
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  return <img src={src} width={w * scale} height={h * scale} alt="" className={`pix ${className}`} />;
}
