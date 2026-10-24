import { Link } from 'react-router';
import { ClipboardList, Shield, Tags, UserCog, Users } from 'lucide-react';
import type { PermissionKey } from '@tli/shared';
import { useHasPermission, useMe } from '@/lib/auth';
import { Card, PageHeader } from '@/components/ui/misc';

type Shortcut = {
  to: string;
  title: string;
  text: string;
  icon: typeof Users;
  permission?: PermissionKey;
};

const SHORTCUTS: Shortcut[] = [
  {
    to: '/admin/usuarios',
    title: 'Usuarios',
    text: 'Altas, roles y reseteos',
    icon: Users,
    permission: 'user.manage',
  },
  {
    to: '/admin/roles',
    title: 'Roles y permisos',
    text: 'Qué puede hacer cada rol',
    icon: Shield,
    permission: 'role.manage',
  },
  {
    to: '/admin/catalogos',
    title: 'Catálogos',
    text: 'Áreas, depósitos y proveedores',
    icon: Tags,
    permission: 'catalog.manage',
  },
  {
    to: '/admin/auditoria',
    title: 'Auditoría',
    text: 'Registro de acciones',
    icon: ClipboardList,
    permission: 'audit.read',
  },
  { to: '/mi-cuenta', title: 'Mi cuenta', text: 'Contraseña y sesiones activas', icon: UserCog },
];

export function HomePage() {
  const { data: me } = useMe();
  const can = useHasPermission();
  const firstName = me?.fullName.split(' ')[0] ?? '';
  const shortcuts = SHORTCUTS.filter((s) => !s.permission || can(s.permission));

  return (
    <>
      <PageHeader
        title={`Hola, ${firstName}`}
        description="Sistema de Gestión TLI · TML Logística"
      />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((s) => (
          <li key={s.to}>
            <Link to={s.to} className="block h-full">
              <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-primary">
                <s.icon className="mt-0.5 size-5 text-primary" aria-hidden />
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-muted">{s.text}</p>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
