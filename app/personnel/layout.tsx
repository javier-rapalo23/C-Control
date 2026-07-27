'use client';

import { useModuleGuard } from '@/lib/use-module-guard';
import PersonnelTabs from '@/components/personnel-tabs';

export default function PersonnelLayout({ children }: { children: React.ReactNode }) {
  const roleGuardStatus = useModuleGuard('personnel');

  if (roleGuardStatus !== 'allowed') return null;

  return (
    <main className="page-shell">
      <section className="hero">
        <h1>Personal</h1>
        <p>Directorio de empleados, entrada y salida, anticipos y pagos.</p>
      </section>

      <PersonnelTabs />

      {children}
    </main>
  );
}
