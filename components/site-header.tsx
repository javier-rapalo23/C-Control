'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const navigationItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/purchases', label: 'Compras' },
  { href: '/sales', label: 'Ventas' },
  { href: '/expenses', label: 'Reportar gastos' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <header className="site-header">
      <div className="site-row">
        <div className="site-topbar">
          <div className="brand">R Control</div>

          <button
            type="button"
            className="menu-toggle"
            aria-expanded={isOpen}
            aria-controls="main-navigation"
            onClick={() => setIsOpen((current) => !current)}
          >
            <span className="menu-toggle__icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>{isOpen ? 'Cerrar' : 'Menú'}</span>
          </button>
        </div>

        <nav id="main-navigation" className={`nav ${isOpen ? 'nav--open' : ''}`}>
          {navigationItems.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

            return (
              <Link key={item.href} href={item.href} className={isActive ? 'active' : ''}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
