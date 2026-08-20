import MaintenanceTabs from '@/components/maintenance-tabs';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('maintenance');

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
