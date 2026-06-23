'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import rControlLogo from '../R-CONTROL.png';

type AuthMe = {
  userId: string | null;
  role: string | null;
};

const navigationItems = [
  { href: '/', label: 'Dashboard', roles: ['admin', 'editor', 'viewer'] },
  { href: '/purchases', label: 'Compras', roles: null },
  { href: '/sales', label: 'Ventas', roles: null },
  { href: '/expenses', label: 'Reportar gastos', roles: null },
  { href: '/inventory', label: 'Inventario', roles: null },
  { href: '/maintenance', label: 'Mantenimiento', roles: ['admin'] },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthMe>({ userId: null, role: null });
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [theme, setTheme] = useState('light');
  const [mounted, setMounted] = useState(false);
  // --- LÓGICA DEL TEMA ---
  

  useEffect(() => {
  setMounted(true); // Avisamos que el componente ya está listo en el cliente
  
  const savedTheme = localStorage.getItem('rcontrol-theme');
  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }
}, []);
useEffect(() => {
  if (mounted) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('rcontrol-theme', theme);
  }
}, [theme, mounted]);

const toggleTheme = () => {
  setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
};

 

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const body = (await response.json()) as { ok: boolean; data?: AuthMe };
        if (body.ok && body.data) {
          setAuthUser(body.data);
        }
      } catch {
        setAuthUser({ userId: null, role: null });
      }
    })();
  }, []);

  useEffect(() => {
    const syncAuth = () => {
      void (async () => {
        try {
          const response = await fetch('/api/auth/me', { cache: 'no-store' });
          const body = (await response.json()) as { ok: boolean; data?: AuthMe };
          if (body.ok && body.data) {
            setAuthUser(body.data);
            return;
          }
        } catch {
          // ignore and fall through
        }

        setAuthUser({ userId: null, role: null });
      })();
    };

    window.addEventListener('rcontrol-auth-changed', syncAuth);
    return () => window.removeEventListener('rcontrol-auth-changed', syncAuth);
  }, []);

  async function logout() {
    setLoadingAuth(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuthUser({ userId: null, role: null });
      window.dispatchEvent(new Event('rcontrol-auth-changed'));
      router.push('/login');
    } finally {
      setLoadingAuth(false);
    }
  }

  return (
    <header className="site-header">
      <div className="site-row">
        <div className="site-topbar">
          <Link href="/" className="brand brand--link" aria-label="Ir al inicio">
            <Image src={rControlLogo} width={44} height={44} className="brand-mark" alt="R Control" priority />
            <span>R Control</span>
          </Link>

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

        <div className="auth-panel">
          {authUser.userId ? (
            <>
              <div className="auth-pill">
                <strong>{authUser.userId}</strong>
                <span>{authUser.role}</span>
              </div>
              <button type="button" className="btn-secondary" onClick={() => void logout()} disabled={loadingAuth}>
                Salir
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-primary auth-link">
              Entrar
            </Link>
          )}
        </div>

        <nav id="main-navigation" className={`nav ${isOpen ? 'nav--open' : ''}`}>
          {navigationItems
            .filter((item) => !item.roles || item.roles.includes(authUser.role ?? ''))
            .map((item) => {
              const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} className={isActive ? 'active' : ''}>
                  {item.label}
                </Link>
              );
            })}
        </nav>

        <button
          type="button"
          className="theme-toggle"
          aria-label="Cambiar tema"
          onClick={toggleTheme}
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            {theme === 'dark' ? '🌞' : '🌜'}
          </span>
        </button>
      </div>
    </header>
  );
}