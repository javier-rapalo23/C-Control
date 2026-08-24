'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/personnel', label: 'Empleados' },
  { href: '/personnel/attendance', label: 'Entrada y salida' },
  { href: '/personnel/advances', label: 'Anticipos' },
  { href: '/personnel/payments', label: 'Pagos' },
  { href: '/personnel/payroll', label: 'Planilla semanal' },
];

export default function PersonnelTabs() {
  const pathname = usePathname();

  return (
    <div className="page-tabs">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={pathname === tab.href ? 'active' : ''}>
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
