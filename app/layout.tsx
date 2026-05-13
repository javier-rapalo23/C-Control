import type { Metadata } from 'next';
import { Space_Grotesk, Newsreader } from 'next/font/google';
import SiteHeader from '@/components/site-header';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-news',
});

export const metadata: Metadata = {
  title: 'R Control | Ledger Diario',
  description: 'Control diario de compras, ventas y gastos.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${spaceGrotesk.variable} ${newsreader.variable}`}>
        <SiteHeader />

        {children}
      </body>
    </html>
  );
}