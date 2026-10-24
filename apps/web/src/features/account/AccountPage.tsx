import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionInfo } from '@tli/shared';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { Alert, Badge, Card, PageHeader, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';

export function AccountPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [passwordChanged, setPasswordChanged] = useState(false);
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api<SessionInfo[]>('/auth/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/auth/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }),
  });

  return (
    <>
      <PageHeader title="Mi cuenta" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">Datos</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted">Nombre</dt>
              <dd>{me?.fullName}</dd>
            </div>
            <div>
              <dt className="text-muted">Email</dt>
              <dd>{me?.email}</dd>
            </div>
            <div>
              <dt className="text-muted">Roles</dt>
              <dd className="flex flex-wrap gap-1">
                {me?.roles.map((r) => (
                  <Badge key={r.key}>{r.name}</Badge>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Verificación en dos pasos</dt>
              <dd>
                {me?.mfaEnabled ? (
                  <Badge tone="success">Activa</Badge>
                ) : (
                  <Badge>No configurada</Badge>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-5" id="contrasena">
          <h2 className="mb-3 font-semibold">Cambiar contraseña</h2>
          {passwordChanged && (
            <div className="mb-3">
              <Alert tone="success">Contraseña actualizada. Se cerraron tus otras sesiones.</Alert>
            </div>
          )}
          <ChangePasswordForm
            onDone={async () => {
              setPasswordChanged(true);
              await qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
            }}
          />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Sesiones activas</h2>
          {sessions.isLoading ? (
            <Spinner />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {sessions.data?.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium">
                      {describeAgent(s.userAgent)}{' '}
                      {s.current && <Badge tone="info">Esta sesión</Badge>}
                    </p>
                    <p className="text-muted">
                      IP {s.ip ?? '—'} · Iniciada {formatDateTime(s.createdAt)} · Última actividad{' '}
                      {formatDateTime(s.lastSeenAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={revoke.isPending && revoke.variables === s.id}
                      onClick={() => revoke.mutate(s.id)}
                    >
                      Cerrar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function describeAgent(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} en ${os}` : browser;
}
