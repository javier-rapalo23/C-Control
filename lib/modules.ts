export const ROLE_KEYS = ['editor', 'viewer', 'comprador'] as const;
export type ConfigurableRole = (typeof ROLE_KEYS)[number];

export type ModuleDef = {
  key: string;
  href: string;
  label: string;
  defaultRoles: ConfigurableRole[];
  locked?: boolean;
};

// `locked` modules always require admin and cannot be reconfigured — this keeps
// Mantenimiento reachable no matter how permissions get misconfigured elsewhere.
export const MODULE_DEFS: ModuleDef[] = [
  { key: 'dashboard', href: '/', label: 'Dashboard', defaultRoles: ['editor', 'viewer'] },
  { key: 'purchases', href: '/purchases', label: 'Compras', defaultRoles: ['editor', 'viewer', 'comprador'] },
  { key: 'sales', href: '/sales', label: 'Ventas', defaultRoles: ['editor', 'viewer', 'comprador'] },
  { key: 'clients', href: '/clients', label: 'Clientes', defaultRoles: [], locked: true },
  { key: 'expenses', href: '/expenses', label: 'Reportar gastos', defaultRoles: ['editor', 'viewer', 'comprador'] },
  { key: 'inventory', href: '/inventory', label: 'Inventario', defaultRoles: ['editor', 'viewer'] },
  { key: 'reports', href: '/reports', label: 'Reportes', defaultRoles: ['editor', 'viewer'] },
  { key: 'cash', href: '/cash', label: 'Caja', defaultRoles: ['editor'] },
  { key: 'sucursales', href: '/sucursales', label: 'Sucursales', defaultRoles: [], locked: true },
  { key: 'personnel', href: '/personnel', label: 'Personal', defaultRoles: [] },
  { key: 'maintenance', href: '/maintenance', label: 'Mantenimiento', defaultRoles: [], locked: true },
];

export function isRoleAllowed(moduleRoles: string[], role: string | null): boolean {
  if (role === 'admin') return true;
  if (!role) return false;
  return moduleRoles.includes(role);
}
