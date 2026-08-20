import PersonnelTabs from '@/components/personnel-tabs';
import { requireModuleAccess } from '@/lib/require-module-access';

export default async function PersonnelLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('personnel');

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
