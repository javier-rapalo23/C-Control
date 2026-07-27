'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Receipt,
  Users,
  Wallet,
  Boxes,
  Building2,
  UserRound,
  Wrench,
  Menu,
  X,
  ChevronLeft,
  LogOut,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import rControlLogo from '../app/icon.png';
import { MODULE_DEFS, isRoleAllowed } from '@/lib/modules';
import type { ModuleAccessDTO } from '@/types/domain';

type AuthMe = {
  userId: string | null;
  role: string | null;
};

const MODULE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  purchases: ShoppingCart,
  sales: Receipt,
  clients: Users,
  expenses: Wallet,
  inventory: Boxes,
  sucursales: Building2,
  personnel: UserRound,
  maintenance: Wrench,
};

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthMe>({ userId: null, role: null });
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [theme, setTheme] = useState('light');
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [moduleRoles, setModuleRoles] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(MODULE_DEFS.map((def) => [def.key, def.defaultRoles])),
  );

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

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/settings/module-access', { cache: 'no-store' });
        const body = (await response.json()) as { ok: boolean; data?: ModuleAccessDTO[] };
        if (body.ok && body.data) {
          setModuleRoles(Object.fromEntries(body.data.map((m) => [m.moduleKey, m.roles])));
        }
      } catch {
        // keep the default roles seeded from MODULE_DEFS
      }
    })();
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
          {isOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
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
        <Menu size={20} aria-hidden="true" />
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
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </div>

        <nav id="main-navigation" className="sidenav-links">
          {MODULE_DEFS.filter((def) => isRoleAllowed(moduleRoles[def.key] ?? def.defaultRoles, authUser.role)).map((def) => {
            const isActive = def.href === '/' ? pathname === '/' : pathname.startsWith(def.href);
            const Icon = MODULE_ICONS[def.key];
            return (
              <Link key={def.href} href={def.href} className={`sidenav-link ${isActive ? 'active' : ''}`}>
                {Icon ? <Icon size={18} aria-hidden="true" /> : null}
                {def.label}
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
                  <LogOut size={16} aria-hidden="true" />
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
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
