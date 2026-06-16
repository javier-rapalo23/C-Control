'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import rControlLogo from '../../R-CONTROL.png';

type LoginResponse =
  | {
      ok: true;
      data: { userId: string; role: string };
    }
  | {
      ok: false;
      error: { message?: string };
    };

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });

      const body = (await response.json()) as LoginResponse;
      if (!body.ok) {
        throw new Error(body.error.message ?? 'No se pudo iniciar sesión');
      }

      window.dispatchEvent(new Event('rcontrol-auth-changed'));
      router.replace(body.data.role === 'comprador' ? '/purchases' : '/');
      router.refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell login-shell">
      <section className="login-card">
        <div className="login-brand">
          <Image src={rControlLogo} alt="R Control" width={120} height={120} priority />
          <div>
            <h1>Iniciar sesión</h1>
            <p>Ingresa con tu usuario y contraseña autorizados para acceder al sistema.</p>
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="login-form">
          <label>
            Usuario
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="admin"
              autoComplete="username"
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}

          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}