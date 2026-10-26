import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { AnnouncementListItem, DistributionListItem, Paginated } from '@tli/shared';
import { useUrlState } from '@/lib/url-state';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge, Card, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import {
  AnnouncementFormDialog,
  AnnouncementStatusBadge,
  DistributionListDialog,
  ImpactBadge,
  systemNames,
  useDistributionLists,
} from './components';

const TABS = [
  { value: 'avisos', label: 'Avisos' },
  { value: 'listas', label: 'Listas de distribución' },
] as const;

const STATES = [
  { value: 'open', label: 'Próximas' },
  { value: 'closed', label: 'Realizadas y canceladas' },
  { value: 'all', label: 'Todas' },
] as const;

export function AnnouncementsPage() {
  const [tab, setTab] = useUrlState<(typeof TABS)[number]['value']>('tab', 'avisos');
  const [creating, setCreating] = useState(false);
  const [editingList, setEditingList] = useState<DistributionListItem | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Actualizaciones"
        description="Avisos a la operación cuando se actualiza el WMS, TMS, TYT o el ruteador."
        actions={
          tab === 'avisos' ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> Nuevo aviso
            </Button>
          ) : (
            <Button onClick={() => setEditingList('new')}>
              <Plus className="size-4" aria-hidden /> Nueva lista
            </Button>
          )
        }
      />
      <div role="tablist" aria-label="Sección" className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === t.value
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'avisos' ? <AnnouncementsList /> : <DistributionLists onEdit={setEditingList} />}
      {creating && <AnnouncementFormDialog onClose={() => setCreating(false)} />}
      {editingList && (
        <DistributionListDialog
          list={editingList === 'new' ? null : editingList}
          onClose={() => setEditingList(null)}
        />
      )}
    </>
  );
}

function AnnouncementsList() {
  const [state, setState] = useUrlState<(typeof STATES)[number]['value']>('state', 'open');
  const list = useQuery({
    queryKey: ['announcements', 'list', state],
    queryFn: () =>
      api<Paginated<AnnouncementListItem>>('/announcements', { query: { state, pageSize: 50 } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <div role="tablist" aria-label="Estado" className="mb-4 flex flex-wrap gap-1">
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
      {list.isLoading ? (
        <Spinner />
      ) : list.data?.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No hay avisos en esta vista.</Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {list.data?.items.map((a) => (
              <li key={a.id}>
                <Link to={`/actualizaciones/${a.id}`} className="block">
                  <Card className="space-y-1 p-3 hover:border-brand">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted">{a.code}</span>
                      <AnnouncementStatusBadge status={a.status} />
                    </div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-xs text-muted">
                      {systemNames(a.systems)} · {formatDateTime(a.startsAt)}
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
                  <Th>Código</Th>
                  <Th>Qué se actualiza</Th>
                  <Th>Sistemas</Th>
                  <Th>Inicio</Th>
                  <Th>Impacto</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {list.data?.items.map((a) => (
                  <tr key={a.id} className="hover:bg-bg">
                    <Td className="font-mono text-xs">
                      <Link to={`/actualizaciones/${a.id}`} className="text-brand hover:underline">
                        {a.code}
                      </Link>
                    </Td>
                    <Td>
                      <Link to={`/actualizaciones/${a.id}`} className="font-medium hover:underline">
                        {a.title}
                      </Link>
                    </Td>
                    <Td>{systemNames(a.systems)}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(a.startsAt)}</Td>
                    <Td>
                      <ImpactBadge impact={a.impact} />
                    </Td>
                    <Td>
                      <AnnouncementStatusBadge status={a.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}

function DistributionLists({ onEdit }: { onEdit: (l: DistributionListItem) => void }) {
  const lists = useDistributionLists(true);
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (l: DistributionListItem) =>
      api(`/distribution-lists/${l.id}`, { method: 'PATCH', body: { active: !l.active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['distribution-lists'] }),
  });

  if (lists.isLoading) return <Spinner />;
  if (lists.data?.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted">
        Todavía no hay listas. Creá una por grupo al que avisás seguido: jefes de depósito,
        facturación, operación de cada planta…
      </Card>
    );
  }
  return (
    <Table>
      <thead>
        <tr>
          <Th>Nombre</Th>
          <Th>Mails</Th>
          <Th>Estado</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {lists.data?.map((l) => (
          <tr key={l.id}>
            <Td>
              <p className="font-medium">{l.name}</p>
              {l.description && <p className="text-xs text-muted">{l.description}</p>}
            </Td>
            <Td>
              <span title={l.emails.join(', ')}>{l.emails.length}</span>
            </Td>
            <Td>{l.active ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>}</Td>
            <Td className="space-x-2 whitespace-nowrap text-right">
              <Button variant="ghost" size="sm" onClick={() => onEdit(l)}>
                Editar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggle.mutate(l)}>
                {l.active ? 'Desactivar' : 'Activar'}
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
