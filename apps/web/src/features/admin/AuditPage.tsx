import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditLogItem,
  type AuditVerifyResponse,
  type Paginated,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';

export function AuditPage() {
  const [action, setAction] = useState<AuditAction | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const log = useQuery({
    queryKey: ['audit', { action, from, to, page }],
    queryFn: () =>
      api<Paginated<AuditLogItem>>('/audit', {
        query: {
          action,
          from: from ? new Date(`${from}T00:00:00-03:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59.999-03:00`).toISOString() : undefined,
          page,
          pageSize: 50,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const verify = useMutation({
    mutationFn: () => api<AuditVerifyResponse>('/audit/verify', { method: 'POST' }),
  });

  const totalPages = log.data ? Math.max(1, Math.ceil(log.data.total / log.data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Auditoría"
        description="Registro inmutable de acciones relevantes. Cada entrada está encadenada con un hash."
        actions={
          <Button variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
            <ShieldCheck className="size-4" aria-hidden /> Verificar integridad
          </Button>
        }
      />
      {verify.data && (
        <div className="mb-4">
          {verify.data.ok ? (
            <Alert tone="success" title="Integridad verificada">
              Se revisaron {verify.data.checked} entradas y la cadena está intacta.
            </Alert>
          ) : (
            <Alert tone="danger" title="Se detectó una alteración">
              La cadena se rompe en la entrada #{verify.data.brokenAtSeq}. Escalar según el runbook
              de incidentes.
            </Alert>
          )}
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Acción">
          {(p) => (
            <Select
              {...p}
              value={action}
              onChange={(e) => {
                setAction(e.target.value as AuditAction | '');
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {AUDIT_ACTION_LABELS[a]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Desde">
          {(p) => (
            <Input
              {...p}
              type="date"
              value={from}
              onChange={(e) => (setFrom(e.target.value), setPage(1))}
            />
          )}
        </Field>
        <Field label="Hasta">
          {(p) => (
            <Input
              {...p}
              type="date"
              value={to}
              onChange={(e) => (setTo(e.target.value), setPage(1))}
            />
          )}
        </Field>
      </div>
      {log.isLoading ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Acción</Th>
              <Th>Usuario</Th>
              <Th className="hidden md:table-cell">Entidad</Th>
              <Th className="hidden md:table-cell">IP</Th>
              <Th>Detalle</Th>
            </tr>
          </thead>
          <tbody>
            {log.data?.items.map((e) => (
              <tr key={e.seq}>
                <Td className="whitespace-nowrap">{formatDateTime(e.occurredAt)}</Td>
                <Td>{AUDIT_ACTION_LABELS[e.action as AuditAction] ?? e.action}</Td>
                <Td>{e.actor ? e.actor.fullName : <span className="text-muted">—</span>}</Td>
                <Td className="hidden md:table-cell text-xs text-muted">
                  {e.entityType ? `${e.entityType} ${e.entityId?.slice(0, 8) ?? ''}` : '—'}
                </Td>
                <Td className="hidden md:table-cell text-xs">{e.ip ?? '—'}</Td>
                <Td>
                  {Object.keys(e.metadata).length > 0 ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-primary">Ver</summary>
                      <pre className="mt-1 max-w-xs overflow-x-auto text-xs">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
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
    </>
  );
}
