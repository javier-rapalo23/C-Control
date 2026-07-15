'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import rControlLogo from '../app/icon.png';

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
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const savedTheme = localStorage.getItem('rcontrol-theme');
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }

    setCollapsed(localStorage.getItem('rcontrol-sidenav-collapsed') === 'true');
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('rcontrol-theme', theme);
    }
  }, [theme, mounted]);

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-sidenav', collapsed ? 'collapsed' : 'expanded');
      localStorage.setItem('rcontrol-sidenav-collapsed', String(collapsed));
    }
  }, [collapsed, mounted]);

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
    <>
      <div className="mobile-topbar">
        <Link href="/" className="brand brand--link" aria-label="Ir al inicio">
          <Image src={rControlLogo} width={36} height={36} className="brand-mark" alt="C Control" priority />
          <span>C Control</span>
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={isOpen}
          aria-controls="main-navigation"
          aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span className="menu-toggle__icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <div
        className={`sidenav-overlay ${isOpen ? 'sidenav-overlay--open' : ''}`}
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      <button
        type="button"
        className="sidenav-reopen-btn"
        aria-label="Mostrar menú lateral"
        onClick={() => setCollapsed(false)}
      >
        <span className="menu-toggle__icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <aside className={`sidenav ${isOpen ? 'sidenav--open' : ''}`}>
        <div className="sidenav-brand-row">
          <Link href="/" className="brand brand--link sidenav-brand" aria-label="Ir al inicio">
            <Image src={rControlLogo} width={40} height={40} className="brand-mark" alt="C Control" priority />
            <span>C Control</span>
          </Link>
          <button
            type="button"
            className="sidenav-collapse-btn"
            aria-label="Ocultar menú lateral"
            onClick={() => setCollapsed(true)}
          >
            «
          </button>
        </div>

        <nav id="main-navigation" className="sidenav-links">
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

        <div className="sidenav-footer">
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

          <button type="button" className="theme-toggle-btn" aria-label="Cambiar tema" onClick={toggleTheme}>
            <span aria-hidden="true">{theme === 'dark' ? '🌞' : '🌜'}</span>
            <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
