import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  INTEGRATION_CHANNEL_LABELS,
  INTEGRATION_FLOW_LABELS,
  INTEGRATION_PROCESS_LABELS,
  INTEGRATION_SYSTEMS,
  INTEGRATION_SYSTEM_LABELS,
  NOT_DONE_REASON_LABELS,
  isIntegrationFinal,
  type IntegrationListItem,
  type IntegrationSystem,
  type Paginated,
} from '@tli/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { useCatalog } from '@/features/admin/api-hooks';
import { CreateIntegrationDialog, IntegrationStatusBadge } from './components';

const STATES = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'closed', label: 'Cerradas' },
  { value: 'all', label: 'Todas' },
] as const;

const formatDay = (iso: string) => iso.split('-').reverse().join('/');
export const processList = (i: Pick<IntegrationListItem, 'processes'>) =>
  i.processes.map((p) => INTEGRATION_PROCESS_LABELS[p]).join(', ');
export const systemList = (i: Pick<IntegrationListItem, 'systems'>) =>
  i.systems.map((s) => INTEGRATION_SYSTEM_LABELS[s]).join(', ');

/** Fecha objetivo, marcada si ya pasó y la integración sigue abierta. */
export function TargetDate({ i }: { i: IntegrationListItem }) {
  if (!i.targetDate) return <span className="text-muted">—</span>;
  const overdue =
    !isIntegrationFinal(i.status) && i.targetDate < new Date().toISOString().slice(0, 10);
  return (
    <span className={cn(overdue && 'font-medium text-danger')}>
      {formatDay(i.targetDate)}
      {overdue && ' · vencida'}
    </span>
  );
}

export function IntegrationsTable({ items }: { items: IntegrationListItem[] }) {
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {items.map((i) => (
          <li key={i.id}>
            <Link to={`/integraciones/${i.id}`} className="block">
              <Card className="space-y-1 p-3 hover:border-brand">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted">{i.code}</span>
                  <IntegrationStatusBadge status={i.status} />
                </div>
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-muted">
                  {i.counterpartLabel}
                  {i.platforms.length > 0 &&
                    ` (${i.platforms.map((p) => p.name).join(', ')})`} · {processList(i)} ·{' '}
                  {systemList(i)}
                </p>
                {i.targetDate && (
                  <p className="text-xs">
                    Objetivo: <TargetDate i={i} />
                  </p>
                )}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <thead>
            <tr>
              <Th>Código</Th>
              <Th>Integración</Th>
              <Th>Con</Th>
              <Th>Procesos</Th>
              <Th>Sistemas</Th>
              <Th>Sentido</Th>
              <Th>Canal</Th>
              <Th>Estado</Th>
              <Th>Objetivo</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="hover:bg-bg">
                <Td className="font-mono text-xs">
                  <Link to={`/integraciones/${i.id}`} className="text-brand hover:underline">
                    {i.code}
                  </Link>
                </Td>
                <Td>
                  <Link to={`/integraciones/${i.id}`} className="font-medium hover:underline">
                    {i.name}
                  </Link>
                </Td>
                <Td>
                  {i.client ? (
                    <Link to={`/clientes/${i.client.id}`} className="hover:underline">
                      {i.counterpartLabel}
                    </Link>
                  ) : (
                    i.counterpartLabel
                  )}
                  {i.platforms.length > 0 && (
                    <span className="block text-xs text-muted">
                      {i.platforms.map((p) => p.name).join(', ')}
                    </span>
                  )}
                </Td>
                <Td>{processList(i)}</Td>
                <Td>{systemList(i)}</Td>
                <Td>{i.direction ? INTEGRATION_FLOW_LABELS[i.direction].split(' ')[0] : '—'}</Td>
                <Td>{i.channel ? INTEGRATION_CHANNEL_LABELS[i.channel] : '—'}</Td>
                <Td>
                  <IntegrationStatusBadge status={i.status} />
                  {i.notDoneReason && (
                    <span className="block text-xs text-muted">
                      {NOT_DONE_REASON_LABELS[i.notDoneReason]}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap">
                  <TargetDate i={i} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

export function IntegrationsPage() {
  const can = useHasPermission();
  const [state, setState] = useState<(typeof STATES)[number]['value']>('pending');
  const [system, setSystem] = useState<IntegrationSystem | ''>('');
  const [platformId, setPlatformId] = useState('');
  const platforms = useCatalog('platforms');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const integrations = useQuery({
    queryKey: ['integrations', 'list', state, system, platformId, q],
    queryFn: () =>
      api<Paginated<IntegrationListItem>>('/integrations', {
        query: {
          state,
          system: system || undefined,
          platformId: platformId || undefined,
          q,
          pageSize: 100,
        },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Integraciones"
        description="Intercambios de datos con clientes, expresos y otros, del relevamiento a la puesta en marcha."
        actions={
          can('integration.manage') && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> Nueva integración
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Estado" className="flex gap-1">
          {STATES.map((s) => (
            <button
              key={s.value}
              role="tab"
              aria-selected={state === s.value}
              onClick={() => setState(s.value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                state === s.value
                  ? 'bg-primary-soft font-medium text-primary'
                  : 'text-muted hover:bg-bg',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Select
          aria-label="Sistema"
          className="w-auto"
          value={system}
          onChange={(e) => setSystem(e.target.value as IntegrationSystem | '')}
        >
          <option value="">Todos los sistemas</option>
          {INTEGRATION_SYSTEMS.map((s) => (
            <option key={s} value={s}>
              {INTEGRATION_SYSTEM_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Plataforma"
          className="w-auto"
          value={platformId}
          onChange={(e) => setPlatformId(e.target.value)}
        >
          <option value="">Todas las plataformas</option>
          {platforms.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Buscar por código, nombre o contraparte"
          placeholder="Buscar por código, nombre o contraparte"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {integrations.isLoading ? (
        <Spinner />
      ) : integrations.data?.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No hay integraciones en esta vista.
        </Card>
      ) : (
        <IntegrationsTable items={integrations.data?.items ?? []} />
      )}
      {creating && <CreateIntegrationDialog onClose={() => setCreating(false)} />}
    </>
  );
}
