import type { Metadata } from 'next';
import { Syne, Plus_Jakarta_Sans } from 'next/font/google';
import SiteHeader from '@/components/site-header';
import './globals.css';

const syne = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-syne',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  title: 'C Control',
  description: 'Control diario de compras, ventas y gastos.',
  icons: {
    icon: '/icon.png', 
    apple: '/apple-touch-icon.png', 
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${syne.variable} ${plusJakarta.variable}`}>
        <div className="app-shell">
          <SiteHeader />
          <div className="app-main">{children}</div>
        </div>
      </body>
    </html>
  );
}