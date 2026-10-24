import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus } from 'lucide-react';
import { PERMISSION_KEYS, PERMISSIONS, type PermissionKey, type RoleItem } from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui/misc';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { useRoles } from './api-hooks';

const GROUPS: { label: string; prefixes: string[] }[] = [
  { label: 'Tickets', prefixes: ['ticket.'] },
  { label: 'Problemas', prefixes: ['problem.'] },
  { label: 'Mejoras', prefixes: ['improvement.'] },
  { label: 'Clientes e integraciones', prefixes: ['client.', 'integration.'] },
  { label: 'Base de conocimiento', prefixes: ['kb.', 'document.'] },
  { label: 'Dashboard', prefixes: ['dashboard.'] },
  {
    label: 'Administración',
    prefixes: ['catalog.', 'user.', 'role.', 'settings.', 'audit.', 'privacy.'],
  },
];

function groupPermissions(): { label: string; keys: PermissionKey[] }[] {
  return GROUPS.map((g) => ({
    label: g.label,
    keys: PERMISSION_KEYS.filter((k) => g.prefixes.some((p) => k.startsWith(p))),
  }));
}

export function RolesPage() {
  const roles = useRoles();
  const [editing, setEditing] = useState<RoleItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoleItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => {
      setDeleting(null);
      setError(e instanceof ApiError ? e.message : 'No se pudo eliminar el rol');
    },
  });

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Los roles de sistema (Admin, IT, Usuario) se definen en el código. Podés crear roles adicionales."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Nuevo rol
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {roles.isLoading ? (
        <Spinner />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {roles.data?.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 font-medium">
                      {r.isSystem && (
                        <Lock className="size-3.5 text-muted" aria-label="Rol de sistema" />
                      )}
                      {r.name}
                    </p>
                    <p className="text-sm text-muted">{r.description}</p>
                  </div>
                  <Badge>{r.userCount} usuarios</Badge>
                </div>
                <p className="mt-2 text-xs text-muted">{r.permissions.length} permisos</p>
                <div className="mt-auto flex gap-2 pt-3">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(r)}>
                    {r.isSystem ? 'Ver permisos' : 'Editar'}
                  </Button>
                  {!r.isSystem && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(r)}>
                      Eliminar
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RoleDialog role={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="Eliminar rol"
          description={`Se elimina el rol "${deleting.name}". Solo es posible si no tiene usuarios asignados.`}
          confirmLabel="Eliminar"
          danger
          loading={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </>
  );
}

function RoleDialog({ role, onClose }: { role: RoleItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const readOnly = role?.isSystem ?? false;
  const [key, setKey] = useState('');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [permissions, setPermissions] = useState<Set<PermissionKey>>(
    new Set(role?.permissions ?? []),
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, description, permissions: [...permissions] };
      return role
        ? api(`/roles/${role.id}`, { method: 'PATCH', body })
        : api('/roles', { method: 'POST', body: { ...body, key } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      onClose();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError
          ? [e.message, ...e.issues.map((i) => `${i.path}: ${i.message}`)].join(' · ')
          : 'Error',
      ),
  });

  const toggle = (k: PermissionKey, on: boolean) =>
    setPermissions((prev) => {
      const next = new Set(prev);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={
        role ? (readOnly ? `Permisos de ${role.name}` : `Editar rol ${role.name}`) : 'Nuevo rol'
      }
      description={
        readOnly
          ? 'Rol de sistema: solo lectura.'
          : 'Cualquier permiso de gestión hace que el rol requiera MFA.'
      }
      footer={
        readOnly ? (
          <Button onClick={onClose}>Cerrar</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Guardar
            </Button>
          </>
        )
      }
    >
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {!readOnly && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          {!role && (
            <Field label="Clave" required hint="Ej.: comercial. No se puede cambiar después.">
              {(p) => <Input {...p} value={key} onChange={(e) => setKey(e.target.value)} />}
            </Field>
          )}
          <Field label="Nombre" required>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Descripción">
              {(p) => (
                <Input
                  {...p}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              )}
            </Field>
          </div>
        </div>
      )}
      <div className="space-y-4">
        {groupPermissions().map((g) => (
          <fieldset key={g.label}>
            <legend className="mb-1 text-sm font-semibold">{g.label}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {g.keys.map((k) => (
                <Checkbox
                  key={k}
                  disabled={readOnly}
                  checked={permissions.has(k)}
                  onChange={(e) => toggle(k, e.target.checked)}
                  label={
                    <>
                      {PERMISSIONS[k]} <code className="text-xs text-muted">{k}</code>
                    </>
                  }
                />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </Dialog>
  );
}
