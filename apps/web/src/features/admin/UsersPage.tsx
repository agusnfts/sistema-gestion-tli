import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Copy, MoreHorizontal, Plus } from 'lucide-react';
import type { Paginated, TemporaryPasswordResponse, UserListItem, UserStatus } from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { useHasPermission, useMe } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Alert, Badge, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { UserFormDialog } from './UserFormDialog';

type Action = {
  kind: 'reset-password' | 'reset-mfa' | 'unlock' | 'toggle-status' | 'anonymize';
  user: UserListItem;
};

const ACTION_COPY: Record<
  Action['kind'],
  (u: UserListItem) => { title: string; description: string; confirm: string; danger?: boolean }
> = {
  'reset-password': (u) => ({
    title: 'Resetear contraseña',
    description: `Se genera una contraseña temporal para ${u.fullName} y se cierran todas sus sesiones.`,
    confirm: 'Resetear',
    danger: true,
  }),
  'reset-mfa': (u) => ({
    title: 'Resetear MFA',
    description: `${u.fullName} va a tener que configurar la verificación en dos pasos de nuevo. Se cierran sus sesiones.`,
    confirm: 'Resetear MFA',
    danger: true,
  }),
  unlock: (u) => ({
    title: 'Desbloquear usuario',
    description: `${u.fullName} va a poder intentar ingresar de nuevo.`,
    confirm: 'Desbloquear',
  }),
  anonymize: (u) => ({
    title: 'Anonimizar titular',
    description:
      `Derecho de supresión (Ley 25.326 / RGPD). Se reemplazan el nombre y el email de ${u.fullName}, ` +
      'se borran sus sesiones, MFA y avisos, y la cuenta queda deshabilitada para siempre. ' +
      'Sus tickets y la auditoría se conservan con el usuario anonimizado. No se puede deshacer.',
    confirm: 'Anonimizar',
    danger: true,
  }),
  'toggle-status': (u) =>
    u.status === 'ACTIVE'
      ? {
          title: 'Deshabilitar usuario',
          description: `${u.fullName} no va a poder ingresar y se cierran sus sesiones.`,
          confirm: 'Deshabilitar',
          danger: true,
        }
      : {
          title: 'Habilitar usuario',
          description: `${u.fullName} va a poder ingresar de nuevo.`,
          confirm: 'Habilitar',
        },
};

export function UsersPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const can = useHasPermission();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserListItem | 'new' | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [tempPassword, setTempPassword] = useState<TemporaryPasswordResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['users', { q, status, page }],
    queryFn: () =>
      api<Paginated<UserListItem>>('/users', { query: { q, status, page, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

  const runAction = useMutation({
    mutationFn: async (a: Action) => {
      if (a.kind === 'toggle-status') {
        return api(`/users/${a.user.id}`, {
          method: 'PATCH',
          body: { status: a.user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' },
        });
      }
      if (a.kind === 'anonymize') {
        return api(`/privacy/users/${a.user.id}/anonymize`, { method: 'POST' });
      }
      return api<unknown>(`/users/${a.user.id}/${a.kind}`, { method: 'POST' });
    },
    onSuccess: (data, a) => {
      setAction(null);
      if (a.kind === 'reset-password') setTempPassword(data as TemporaryPasswordResponse);
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) =>
      setActionError(e instanceof ApiError ? e.message : 'No se pudo completar la acción'),
  });

  /** Derecho de acceso: descarga un JSON con todos los datos personales del titular. */
  async function exportData(u: UserListItem) {
    try {
      const data = await api<unknown>(`/privacy/users/${u.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `datos-${u.email.split('@')[0]}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'No se pudo exportar');
    }
  }

  const copy = action ? ACTION_COPY[action.kind](action.user) : null;
  const totalPages = users.data
    ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Solo un administrador puede dar de alta usuarios. No hay autorregistro."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Nuevo usuario
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          aria-label="Buscar por nombre o email"
          placeholder="Buscar por nombre o email"
          className="max-w-xs"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="Filtrar por estado"
          className="w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as UserStatus | '');
            setPage(1);
          }}
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVE">Activos</option>
          <option value="DISABLED">Deshabilitados</option>
        </Select>
      </div>

      {actionError && (
        <div className="mb-4">
          <Alert tone="danger">{actionError}</Alert>
        </div>
      )}

      {users.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Roles</Th>
              <Th className="hidden md:table-cell">Depósito</Th>
              <Th>Estado</Th>
              <Th className="hidden lg:table-cell">Último acceso</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {users.data?.items.map((u) => (
              <tr key={u.id}>
                <Td>
                  <p className="font-medium">{u.fullName}</p>
                  <p className="text-xs text-muted">{u.email}</p>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r.id}>{r.name}</Badge>
                    ))}
                  </div>
                </Td>
                <Td className="hidden md:table-cell">{u.defaultWarehouse?.name ?? '—'}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.status === 'ACTIVE' ? (
                      <Badge tone="success">Activo</Badge>
                    ) : (
                      <Badge>Deshabilitado</Badge>
                    )}
                    {u.locked && <Badge tone="danger">Bloqueado</Badge>}
                    {u.mfaEnabled && <Badge tone="info">MFA</Badge>}
                  </div>
                </Td>
                <Td className="hidden lg:table-cell">{formatDateTime(u.lastLoginAt)}</Td>
                <Td className="text-right">
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button variant="ghost" size="sm" aria-label={`Acciones para ${u.fullName}`}>
                        <MoreHorizontal className="size-4" aria-hidden />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        className="z-50 min-w-48 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
                      >
                        <MenuItem onSelect={() => setEditing(u)}>Editar</MenuItem>
                        <MenuItem onSelect={() => setAction({ kind: 'reset-password', user: u })}>
                          Resetear contraseña
                        </MenuItem>
                        {u.mfaEnabled && (
                          <MenuItem onSelect={() => setAction({ kind: 'reset-mfa', user: u })}>
                            Resetear MFA
                          </MenuItem>
                        )}
                        {u.locked && (
                          <MenuItem onSelect={() => setAction({ kind: 'unlock', user: u })}>
                            Desbloquear
                          </MenuItem>
                        )}
                        {u.id !== me?.id && (
                          <MenuItem onSelect={() => setAction({ kind: 'toggle-status', user: u })}>
                            {u.status === 'ACTIVE' ? 'Deshabilitar' : 'Habilitar'}
                          </MenuItem>
                        )}
                        {can('privacy.export') && (
                          <MenuItem onSelect={() => void exportData(u)}>
                            Exportar datos (JSON)
                          </MenuItem>
                        )}
                        {can('privacy.anonymize') && u.id !== me?.id && (
                          <MenuItem onSelect={() => setAction({ kind: 'anonymize', user: u })}>
                            Anonimizar…
                          </MenuItem>
                        )}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </Td>
              </tr>
            ))}
            {users.data?.items.length === 0 && (
              <tr>
                <Td className="py-6 text-center text-muted">No hay usuarios que coincidan.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Paginación">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <span>
            Página {page} de {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </nav>
      )}

      {editing && (
        <UserFormDialog
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(res) => setTempPassword(res)}
        />
      )}

      {copy && action && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setAction(null)}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirm}
          danger={copy.danger}
          loading={runAction.isPending}
          onConfirm={() => {
            setActionError(null);
            runAction.mutate(action);
          }}
        />
      )}

      {tempPassword && (
        <Dialog
          open
          onOpenChange={(o) => !o && setTempPassword(null)}
          title="Contraseña temporal"
          description="Se muestra una sola vez. Pasásela a la persona por un canal seguro; se le va a pedir cambiarla al ingresar."
          footer={<Button onClick={() => setTempPassword(null)}>Listo</Button>}
        >
          <p className="text-sm">
            <span className="text-muted">Usuario:</span> {tempPassword.user.email}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded bg-bg p-2 text-center font-mono text-lg tracking-wider">
              {tempPassword.temporaryPassword}
            </code>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Copiar contraseña"
              onClick={() => navigator.clipboard.writeText(tempPassword.temporaryPassword)}
            >
              <Copy className="size-4" aria-hidden />
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

function MenuItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="cursor-pointer rounded px-2 py-1.5 outline-none data-[highlighted]:bg-bg"
    >
      {children}
    </DropdownMenu.Item>
  );
}
