/**
 * Catálogo de permisos granulares. El código chequea permisos, nunca roles.
 * Ver docs/permissions.md.
 */
export const PERMISSIONS = {
  'ticket.create': 'Crear tickets desde el formulario',
  'ticket.read.own': 'Ver sus propios tickets',
  'ticket.comment.own': 'Comentar sus propios tickets y reabrirlos',
  'ticket.read.all': 'Ver todos los tickets',
  'ticket.manage': 'Asignar, priorizar, cambiar estado, derivar y editar tickets',
  'ticket.comment.internal': 'Escribir comentarios internos',
  'ticket.time.log': 'Registrar tiempo invertido',
  'problem.read': 'Ver problemas',
  'problem.manage': 'Gestionar problemas y resolver en bloque',
  'improvement.read': 'Ver mejoras',
  'improvement.manage': 'Gestionar mejoras',
  'client.read': 'Ver el maestro de clientes',
  'client.manage': 'Gestionar clientes y contactos',
  'client.import': 'Importar clientes (F50)',
  'integration.read': 'Ver integraciones',
  'integration.manage': 'Gestionar integraciones y cotizaciones',
  'kb.read.public': 'Ver artículos y documentos públicos',
  'kb.read.internal': 'Ver artículos y documentos internos',
  'kb.manage': 'Crear y editar artículos y documentos',
  'kb.publish': 'Publicar y cambiar visibilidad en la base de conocimiento',
  'document.bulk_upload': 'Carga masiva de documentos',
  'dashboard.view': 'Ver el dashboard',
  'catalog.manage': 'Gestionar áreas, depósitos, proveedores y categorías',
  'user.manage': 'Gestionar usuarios',
  'role.manage': 'Gestionar roles y permisos',
  'settings.manage': 'Gestionar la configuración del sistema',
  'audit.read': 'Consultar el log de auditoría',
  'privacy.export': 'Exportar datos de un titular',
  'privacy.anonymize': 'Anonimizar datos de un titular',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}

/** Permisos de un usuario común. Cualquier permiso fuera de esta lista exige MFA. */
export const STANDARD_PERMISSIONS: readonly PermissionKey[] = [
  'ticket.create',
  'ticket.read.own',
  'ticket.comment.own',
  'kb.read.public',
];

export const SYSTEM_ROLE_KEYS = {
  ADMIN: 'admin',
  IT: 'it',
  USER: 'user',
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[keyof typeof SYSTEM_ROLE_KEYS];

const ADMIN_ONLY: readonly PermissionKey[] = [
  'catalog.manage',
  'user.manage',
  'role.manage',
  'settings.manage',
  'audit.read',
  'privacy.export',
  'privacy.anonymize',
];

export const SYSTEM_ROLES: Record<
  SystemRoleKey,
  { name: string; description: string; permissions: readonly PermissionKey[] }
> = {
  admin: {
    name: 'Admin',
    description: 'Acceso total: usuarios, roles, configuración, auditoría y todo lo de IT',
    permissions: PERMISSION_KEYS,
  },
  it: {
    name: 'IT',
    description: 'Gestión de tickets, problemas, mejoras, clientes, integraciones y conocimiento',
    permissions: PERMISSION_KEYS.filter((p) => !ADMIN_ONLY.includes(p)),
  },
  user: {
    name: 'Usuario',
    description: 'Carga y seguimiento de sus propios tickets, base de conocimiento pública',
    permissions: STANDARD_PERMISSIONS,
  },
};

export function requiresMfa(permissions: Iterable<string>): boolean {
  for (const p of permissions) {
    if (!(STANDARD_PERMISSIONS as readonly string[]).includes(p)) return true;
  }
  return false;
}
