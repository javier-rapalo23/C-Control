'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import rControlLogo from '../R-CONTROL.png';

type AuthMe = {
  userId: string | null;
  role: string | null;
};

const navigationItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/purchases', label: 'Compras' },
  { href: '/sales', label: 'Ventas' },
  { href: '/expenses', label: 'Reportar gastos' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthMe>({ userId: null, role: null });
  const [loginUserId, setLoginUserId] = useState('admin');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(false);

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

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);

    try {
      setLoadingAuth(true);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: loginUserId }),
      });

      const body = (await response.json()) as { ok: boolean; data?: AuthMe; error?: { message?: string } };
      if (!body.ok || !body.data) {
        throw new Error(body.error?.message ?? 'No se pudo iniciar sesión');
      }

      setAuthUser(body.data);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'No se pudo iniciar sesión');
    } finally {
      setLoadingAuth(false);
    }
  }

  async function logout() {
    setLoadingAuth(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuthUser({ userId: null, role: null });
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
            <form className="auth-form" onSubmit={(event) => void login(event)}>
              <input
                value={loginUserId}
                onChange={(event) => setLoginUserId(event.target.value)}
                placeholder="usuario"
                aria-label="Usuario para iniciar sesión"
              />
              <button className="btn-primary" type="submit" disabled={loadingAuth}>
                Entrar
              </button>
            </form>
          )}
          {loginError ? <span className="auth-error">{loginError}</span> : null}
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
