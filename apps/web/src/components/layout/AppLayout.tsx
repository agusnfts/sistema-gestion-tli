import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as RadixDialog from '@radix-ui/react-dialog';
import {
  BookOpen,
  Building2,
  Cable,
  ChevronDown,
  ClipboardList,
  Home,
  Inbox,
  PlusCircle,
  Puzzle,
  Settings,
  Ticket,
  KeyRound,
  Lightbulb,
  LogOut,
  Menu,
  Shield,
  Tags,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type { PermissionKey } from '@tli/shared';
import { useHasPermission, useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { useLogout } from '@/features/auth/useLogout';
import { NotificationBell } from './NotificationBell';

type NavItem = { to: string; label: string; icon: typeof Home; permission?: PermissionKey };

// Cada fase suma sus módulos acá; un ítem solo se muestra con el permiso correspondiente.
const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, permission: 'dashboard.view' },
  { to: '/tickets', label: 'Tickets', icon: Inbox, permission: 'ticket.read.all' },
  { to: '/problemas', label: 'Problemas', icon: Puzzle, permission: 'problem.read' },
  { to: '/mejoras', label: 'Mejoras', icon: Lightbulb, permission: 'improvement.read' },
  { to: '/integraciones', label: 'Integraciones', icon: Cable, permission: 'integration.read' },
  { to: '/clientes', label: 'Clientes', icon: Building2, permission: 'client.read' },
  { to: '/conocimiento', label: 'Conocimiento', icon: BookOpen, permission: 'kb.read.public' },
  { to: '/mis-tickets', label: 'Mis tickets', icon: Ticket, permission: 'ticket.read.own' },
  { to: '/tickets/nuevo', label: 'Nuevo ticket', icon: PlusCircle, permission: 'ticket.create' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users, permission: 'user.manage' },
  { to: '/admin/roles', label: 'Roles y permisos', icon: Shield, permission: 'role.manage' },
  { to: '/admin/catalogos', label: 'Catálogos', icon: Tags, permission: 'catalog.manage' },
  {
    to: '/admin/configuracion',
    label: 'Configuración',
    icon: Settings,
    permission: 'settings.manage',
  },
  { to: '/admin/auditoria', label: 'Auditoría', icon: ClipboardList, permission: 'audit.read' },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const can = useHasPermission();
  const main = MAIN_NAV.filter((i) => !i.permission || can(i.permission));
  const admin = ADMIN_NAV.filter((i) => !i.permission || can(i.permission));
  const link = (item: NavItem) => (
    <li key={item.to}>
      <NavLink
        to={item.to}
        end={item.to === '/' || item.to === '/tickets'}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
            isActive
              ? 'bg-primary-soft font-medium text-primary shadow-[inset_3px_0_0_var(--color-accent)]'
              : 'text-fg hover:bg-bg',
          )
        }
      >
        <item.icon className="size-4" aria-hidden />
        {item.label}
      </NavLink>
    </li>
  );
  return (
    <nav aria-label="Navegación principal" className="space-y-6">
      <ul className="space-y-1">{main.map(link)}</ul>
      {admin.length > 0 && (
        <div>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Administración
          </p>
          <ul className="space-y-1">{admin.map(link)}</ul>
        </div>
      )}
    </nav>
  );
}

export function AppLayout() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <RadixDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <RadixDialog.Trigger asChild>
            <button className="rounded p-1.5 hover:bg-bg md:hidden" aria-label="Abrir menú">
              <Menu className="size-5" aria-hidden />
            </button>
          </RadixDialog.Trigger>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-40 bg-fg/40 md:hidden" />
            <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 w-72 bg-surface p-4 shadow-xl md:hidden">
              <div className="mb-4 flex items-center justify-between">
                <RadixDialog.Title className="text-sm font-semibold">Menú</RadixDialog.Title>
                <RadixDialog.Close className="rounded p-1.5 hover:bg-bg" aria-label="Cerrar menú">
                  <X className="size-5" aria-hidden />
                </RadixDialog.Close>
              </div>
              <RadixDialog.Description className="sr-only">
                Navegación del sistema
              </RadixDialog.Description>
              <NavList onNavigate={() => setMobileOpen(false)} />
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>

        <Logo className="h-8 w-auto" />
        <span className="hidden border-l border-border pl-3 text-sm font-semibold text-brand sm:inline">
          Sistema de Gestión TLI
        </span>

        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label="Menú de usuario"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg"
            >
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {initials(me?.fullName ?? '')}
              </span>
              <span className="hidden max-w-40 truncate sm:inline">{me?.fullName}</span>
              <ChevronDown className="size-4 text-muted" aria-hidden />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                className="z-50 min-w-52 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
              >
                <div className="px-2 py-1.5 text-xs text-muted">{me?.email}</div>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  onSelect={() => navigate('/mi-cuenta')}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-bg"
                >
                  <UserCog className="size-4" aria-hidden /> Mi cuenta
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => navigate('/mi-cuenta#contrasena')}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-bg"
                >
                  <KeyRound className="size-4" aria-hidden /> Cambiar contraseña
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  onSelect={logout}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-bg"
                >
                  <LogOut className="size-4" aria-hidden /> Cerrar sesión
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border bg-surface p-3 md:block">
          <NavList />
        </aside>
        <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
