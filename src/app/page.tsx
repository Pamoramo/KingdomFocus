'use client';
import dynamic from 'next/dynamic';
const Game = dynamic(() => import('../components/Game.tsx'), { ssr: false, loading: () => <div className="h-dvh grid place-items-center text-parch font-title text-4xl">Kingdom of Discipline</div> });
export default function Page() { return <Game />; }
