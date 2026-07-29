'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/maintenance', label: 'Empresa' },
  { href: '/maintenance/users', label: 'Usuarios' },
  { href: '/maintenance/roles', label: 'Roles y permisos' },
  { href: '/clients', label: 'Clientes' },
  { href: '/sucursales', label: 'Sucursales' },
];

export default function MaintenanceTabs() {
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
