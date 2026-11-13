import type { Metadata, Viewport } from 'next';
import { VT323, Jacquard_12 } from 'next/font/google';
import './globals.css';

const px = VT323({ subsets: ['latin'], weight: '400', variable: '--font-px' });
const tt = Jacquard_12({ subsets: ['latin'], weight: '400', variable: '--font-tt' });
export const metadata: Metadata = { title: 'Kingdom of Discipline', description: 'Study to build your medieval realm.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#2b2118' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${px.variable} ${tt.variable}`}><body>{children}</body></html>;
}
