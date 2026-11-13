import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kingdom of Discipline', short_name: 'Kingdom', description: 'Study and keep good habits to build a medieval kingdom.',
    start_url: '/', display: 'standalone', orientation: 'any', background_color: '#2b2118', theme_color: '#2b2118',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
