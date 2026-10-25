import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, List, Plus } from 'lucide-react';
import {
  IMPROVEMENT_STATUSES,
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_SYSTEMS,
  IMPROVEMENT_SYSTEM_LABELS,
  isImprovementFinal,
  type ChangeImprovementStatusResponse,
  type ImprovementListItem,
  type ImprovementStatus,
  type ImprovementSystem,
  type Paginated,
} from '@tli/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Alert, Card, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { PriorityLabel } from '@/features/tickets/ui';
import { errorText } from '@/features/problems/components';
import {
  CloseImprovementDialog,
  CreateImprovementDialog,
  ImprovementStatusBadge,
} from './components';

type View = 'kanban' | 'list';
const VIEW_KEY = 'tli.improvements.view';

function initialView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'kanban' || saved === 'list') return saved;
  } catch {
    // Sin storage (modo privado): se usa el valor por defecto.
  }
  // En el celular el kanban no entra: arranca en lista.
  return window.matchMedia('(min-width: 768px)').matches ? 'kanban' : 'list';
}

const STATES = [
  { value: 'active', label: 'En curso' },
  { value: 'closed', label: 'Cerradas' },
  { value: 'all', label: 'Todas' },
] as const;

export function ImprovementsPage() {
  const can = useHasPermission();
  const canManage = can('improvement.manage');
  const [view, setViewState] = useState<View>(initialView);
  const [system, setSystem] = useState<ImprovementSystem | ''>('');
  const [state, setState] = useState<(typeof STATES)[number]['value']>('active');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Preferencia solo de esta sesión.
    }
  };

  // El kanban muestra todas las columnas, incluidas las cerradas.
  const effectiveState = view === 'kanban' ? 'all' : state;
  const improvements = useQuery({
    queryKey: ['improvements', 'list', effectiveState, system, q],
    queryFn: () =>
      api<Paginated<ImprovementListItem>>('/improvements', {
        query: { state: effectiveState, system: system || undefined, q, pageSize: 100 },
      }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Mejoras"
        description="Cambios en WMS, TMS y demás sistemas, desde la idea hasta la implementación."
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> Nueva mejora
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Vista" className="flex rounded-md border border-border">
          {(
            [
              ['kanban', 'Kanban', Columns3],
              ['list', 'Lista', List],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm',
                view === v ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:bg-bg',
              )}
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <Select
          aria-label="Sistema"
          className="w-auto"
          value={system}
          onChange={(e) => setSystem(e.target.value as ImprovementSystem | '')}
        >
          <option value="">Todos los sistemas</option>
          {IMPROVEMENT_SYSTEMS.map((s) => (
            <option key={s} value={s}>
              {IMPROVEMENT_SYSTEM_LABELS[s]}
            </option>
          ))}
        </Select>
        {view === 'list' && (
          <Select
            aria-label="Estado"
            className="w-auto"
            value={state}
            onChange={(e) => setState(e.target.value as typeof state)}
          >
            {STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
        <Input
          aria-label="Buscar por código o texto"
          placeholder="Buscar por código o texto"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {improvements.isLoading ? (
        <Spinner />
      ) : view === 'kanban' ? (
        <Board items={improvements.data?.items ?? []} canManage={canManage} />
      ) : improvements.data?.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No hay mejoras en esta vista.</Card>
      ) : (
        <ImprovementList items={improvements.data?.items ?? []} />
      )}
      {creating && <CreateImprovementDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function ImprovementCardBody({ i }: { i: ImprovementListItem }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted">{i.code}</span>
        <PriorityLabel priority={i.priority} />
      </div>
      <p className="font-medium leading-snug">{i.title}</p>
      <p className="text-xs text-muted">
        {IMPROVEMENT_SYSTEM_LABELS[i.system]}
        {i.ticketCount > 0 && ` · ${i.ticketCount} ticket(s)`}
        {i.provider && ` · ${i.provider.name}`}
        {i.owner && ` · ${i.owner.fullName}`}
      </p>
    </>
  );
}

function ImprovementList({ items }: { items: ImprovementListItem[] }) {
  return (
    <>
      <ul className="space-y-2 md:hidden">
        {items.map((i) => (
          <li key={i.id}>
            <Link to={`/mejoras/${i.id}`} className="block">
              <Card className="space-y-1 p-3 hover:border-brand">
                <ImprovementCardBody i={i} />
                <ImprovementStatusBadge status={i.status} />
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
              <Th>Título</Th>
              <Th>Sistema</Th>
              <Th>Prioridad</Th>
              <Th>Estado</Th>
              <Th>Tickets</Th>
              <Th>Responsable</Th>
              <Th>Actualizada</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="hover:bg-bg">
                <Td className="font-mono text-xs">
                  <Link to={`/mejoras/${i.id}`} className="text-brand hover:underline">
                    {i.code}
                  </Link>
                </Td>
                <Td>
                  <Link to={`/mejoras/${i.id}`} className="font-medium hover:underline">
                    {i.title}
                  </Link>
                </Td>
                <Td>{IMPROVEMENT_SYSTEM_LABELS[i.system]}</Td>
                <Td>
                  <PriorityLabel priority={i.priority} />
                </Td>
                <Td>
                  <ImprovementStatusBadge status={i.status} />
                </Td>
                <Td>{i.ticketCount}</Td>
                <Td>{i.owner?.fullName ?? '—'}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(i.updatedAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}

/** Kanban por estado. En escritorio se arrastran las tarjetas; en el celular se cambia desde el detalle. */
function Board({ items, canManage }: { items: ImprovementListItem[]; canManage: boolean }) {
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<ImprovementStatus | null>(null);
  const [closing, setClosing] = useState<{
    item: ImprovementListItem;
    status: 'IMPLEMENTED' | 'DISCARDED';
  } | null>(null);
  const move = useMutation({
    mutationFn: (v: { id: string; status: ImprovementStatus; closingMessage?: string }) =>
      api<ChangeImprovementStatusResponse>(`/improvements/${v.id}/status`, {
        method: 'POST',
        body: { status: v.status, closingMessage: v.closingMessage },
      }),
    // La tarjeta se mueve al instante; si la API rechaza el cambio, vuelve con el refetch.
    onMutate: (v) => {
      qc.setQueriesData<Paginated<ImprovementListItem>>(
        { queryKey: ['improvements', 'list'] },
        (old) =>
          old && {
            ...old,
            items: old.items.map((i) => (i.id === v.id ? { ...i, status: v.status } : i)),
          },
      );
    },
    onSuccess: () => setClosing(null),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['improvements'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });

  const drop = (status: ImprovementStatus) => {
    const item = items.find((i) => i.id === dragId);
    setDragId(null);
    setOverColumn(null);
    if (!item || item.status === status || isImprovementFinal(item.status)) return;
    if (status === 'IMPLEMENTED' || status === 'DISCARDED') setClosing({ item, status });
    else move.mutate({ id: item.id, status });
  };

  return (
    <>
      {move.error && !closing && (
        <div className="mb-3">
          <Alert tone="danger">{errorText(move.error)}</Alert>
        </div>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-3">
          {IMPROVEMENT_STATUSES.map((status) => {
            const column = items.filter((i) => i.status === status);
            return (
              <section
                key={status}
                aria-label={IMPROVEMENT_STATUS_LABELS[status]}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setOverColumn(status);
                }}
                onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(status);
                }}
                className={cn(
                  'w-64 shrink-0 rounded-lg bg-panel p-2',
                  overColumn === status && 'ring-2 ring-brand',
                )}
              >
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                  {IMPROVEMENT_STATUS_LABELS[status]}
                  <span className="text-xs font-normal text-muted">{column.length}</span>
                </h2>
                <ul className="space-y-2">
                  {column.map((i) => {
                    const draggable = canManage && !isImprovementFinal(i.status);
                    return (
                      <li
                        key={i.id}
                        draggable={draggable}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          setDragId(i.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverColumn(null);
                        }}
                        className={cn(draggable && 'cursor-grab', dragId === i.id && 'opacity-50')}
                      >
                        <Link to={`/mejoras/${i.id}`} className="block" draggable={false}>
                          <Card className="space-y-1 p-3 text-sm hover:border-brand">
                            <ImprovementCardBody i={i} />
                          </Card>
                        </Link>
                      </li>
                    );
                  })}
                  {column.length === 0 && (
                    <li className="px-1 py-4 text-center text-xs text-muted">Sin mejoras</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      {closing && (
        <CloseImprovementDialog
          improvement={closing.item}
          status={closing.status}
          loading={move.isPending}
          error={move.error}
          onClose={() => setClosing(null)}
          onConfirm={(closingMessage) =>
            move.mutate({ id: closing.item.id, status: closing.status, closingMessage })
          }
        />
      )}
    </>
  );
}
