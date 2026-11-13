import type { Metadata, Viewport } from 'next';
import { VT323, Jacquard_12 } from 'next/font/google';
import './globals.css';

const px = VT323({ subsets: ['latin'], weight: '400', variable: '--font-px' });
const tt = Jacquard_12({ subsets: ['latin'], weight: '400', variable: '--font-tt' });
export const metadata: Metadata = {
  title: 'Kingdom of Discipline', description: 'Study and keep good habits to build a medieval kingdom.',
  icons: { icon: '/icons/favicon-32.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Kingdom', statusBarStyle: 'black-translucent' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover', themeColor: '#2b2118' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${px.variable} ${tt.variable}`}><body>{children}</body></html>;
}
