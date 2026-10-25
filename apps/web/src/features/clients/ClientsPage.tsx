import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Plus } from 'lucide-react';
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  formatCuit,
  type ClientDetail,
  type ClientListItem,
  type ClientStatus,
  type Paginated,
} from '@tli/shared';
import { api } from '@/lib/api';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useCatalog } from '@/features/admin/api-hooks';
import { errorText } from '@/features/problems/components';
import { ImportF50Dialog } from './ImportF50Dialog';

const TONES: Record<ClientStatus, 'success' | 'info' | 'neutral'> = {
  ACTIVE: 'success',
  ONBOARDING: 'info',
  INACTIVE: 'neutral',
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge tone={TONES[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>;
}

export function ClientsPage() {
  const can = useHasPermission();
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const clients = useQuery({
    queryKey: ['clients', 'list', status, q],
    queryFn: () =>
      api<Paginated<ClientListItem>>('/clients', {
        query: { status: status || undefined, q, pageSize: 100 },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Maestro de clientes, sus contactos, depósitos e integraciones."
        actions={
          <div className="flex flex-wrap gap-2">
            {can('client.import') && (
              <Button variant="secondary" onClick={() => setImporting(true)}>
                <FileSpreadsheet className="size-4" aria-hidden /> Importar F50
              </Button>
            )}
            {can('client.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden /> Nuevo cliente
              </Button>
            )}
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          aria-label="Estado"
          className="w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value as ClientStatus | '')}
        >
          <option value="">Todos los estados</option>
          {CLIENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CLIENT_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Buscar por nombre o CUIT"
          placeholder="Buscar por nombre o CUIT"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {clients.isLoading ? (
        <Spinner />
      ) : clients.data?.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No hay clientes{q || status ? ' que coincidan' : ' cargados todavía'}.
        </Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {clients.data?.items.map((c) => (
              <li key={c.id}>
                <Link to={`/clientes/${c.id}`} className="block">
                  <Card className="space-y-1 p-3 hover:border-brand">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{c.shortName ?? c.legalName}</p>
                      <ClientStatusBadge status={c.status} />
                    </div>
                    <p className="text-xs text-muted">
                      {c.cuit ? formatCuit(c.cuit) : 'Sin CUIT'}
                      {c.warehouses.length > 0 &&
                        ` · ${c.warehouses.map((w) => w.name).join(', ')}`}
                    </p>
                    <p className="text-xs text-muted">
                      {c.pendingIntegrationCount} integraciones pendientes de {c.integrationCount}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>CUIT</Th>
                  <Th>Depósitos</Th>
                  <Th>Estado</Th>
                  <Th>Integraciones</Th>
                </tr>
              </thead>
              <tbody>
                {clients.data?.items.map((c) => (
                  <tr key={c.id} className="hover:bg-bg">
                    <Td>
                      <Link to={`/clientes/${c.id}`} className="font-medium hover:underline">
                        {c.shortName ?? c.legalName}
                      </Link>
                      {c.shortName && (
                        <span className="block text-xs text-muted">{c.legalName}</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs">
                      {c.cuit ? formatCuit(c.cuit) : '—'}
                    </Td>
                    <Td>{c.warehouses.map((w) => w.name).join(', ') || '—'}</Td>
                    <Td>
                      <ClientStatusBadge status={c.status} />
                    </Td>
                    <Td>
                      <span className={c.pendingIntegrationCount ? 'font-medium' : 'text-muted'}>
                        {c.pendingIntegrationCount} pendientes
                      </span>
                      <span className="text-muted"> / {c.integrationCount}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
      {creating && <ClientFormDialog onClose={() => setCreating(false)} />}
      {importing && <ImportF50Dialog onClose={() => setImporting(false)} />}
    </>
  );
}

/** Alta o edición de los datos del cliente. */
export function ClientFormDialog({
  client,
  onClose,
  onSaved,
}: {
  client?: ClientDetail;
  onClose: () => void;
  onSaved?: (c: ClientDetail) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const warehouses = useCatalog('warehouses');
  const [f, setF] = useState({
    legalName: client?.legalName ?? '',
    shortName: client?.shortName ?? '',
    cuit: client?.cuit ? formatCuit(client.cuit) : '',
    status: client?.status ?? ('ACTIVE' as ClientStatus),
    address: client?.address ?? '',
    notes: client?.notes ?? '',
    warehouseIds: client?.warehouses.map((w) => w.id) ?? [],
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      client
        ? api<ClientDetail>(`/clients/${client.id}`, { method: 'PATCH', body: f })
        : api<ClientDetail>('/clients', { method: 'POST', body: f }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
      if (onSaved) onSaved(c);
      else navigate(`/clientes/${c.id}`);
    },
  });

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={client ? 'Editar cliente' : 'Nuevo cliente'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
        <Field label="Razón social" required>
          {(p) => (
            <Input {...p} value={f.legalName} onChange={(e) => set('legalName', e.target.value)} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre corto" hint="Cómo se lo conoce.">
            {(p) => (
              <Input
                {...p}
                value={f.shortName}
                onChange={(e) => set('shortName', e.target.value)}
              />
            )}
          </Field>
          <Field label="CUIT" hint="Se valida el dígito verificador.">
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                placeholder="30-12345678-9"
                value={f.cuit}
                onChange={(e) => set('cuit', e.target.value)}
              />
            )}
          </Field>
          <Field label="Estado">
            {(p) => (
              <Select
                {...p}
                value={f.status}
                onChange={(e) => set('status', e.target.value as ClientStatus)}
              >
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CLIENT_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Domicilio">
          {(p) => (
            <Input {...p} value={f.address} onChange={(e) => set('address', e.target.value)} />
          )}
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Depósitos donde opera</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {warehouses.data?.map((w) => (
              <Checkbox
                key={w.id}
                label={w.name}
                checked={f.warehouseIds.includes(w.id)}
                onChange={(e) =>
                  set(
                    'warehouseIds',
                    e.target.checked
                      ? [...f.warehouseIds, w.id]
                      : f.warehouseIds.filter((x) => x !== w.id),
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <Field label="Notas">
          {(p) => (
            <textarea
              {...p}
              rows={3}
              className="w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm"
              value={f.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
