'use client';

import { useModuleGuard } from '@/lib/use-module-guard';
import MaintenanceTabs from '@/components/maintenance-tabs';

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  const roleGuardStatus = useModuleGuard('maintenance');

  if (roleGuardStatus !== 'allowed') return null;

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Mantenimiento</h1>
        <p>Configuración de la empresa, usuarios del sistema y roles.</p>
      </section>

      <MaintenanceTabs />

      {children}
    </main>
  );
}
