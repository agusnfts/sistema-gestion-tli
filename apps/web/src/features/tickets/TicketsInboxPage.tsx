import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_TYPE_LABELS,
  TICKET_TYPES,
  type Paginated,
  type TicketListItem,
} from '@tli/shared';
import { api } from '@/lib/api';
import { useHasPermission } from '@/lib/auth';
import { CreateProblemDialog, LinkToProblemDialog } from '@/features/problems/components';
import { cn, formatDateTime } from '@/lib/utils';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Card, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { PriorityLabel, primarySla, SlaBadge, StatusBadge } from './ui';

const FILTER_KEYS = ['state', 'type', 'priority', 'category', 'assignee', 'sla', 'q'] as const;

/** Bandeja de IT. Los filtros viven en la URL para poder compartir o volver a una vista. */
export function TicketsInboxPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const page = Number(params.get('page') ?? '1');
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined]));
  filters.state ??= 'open';
  const activeFilters = FILTER_KEYS.filter(
    (k) => k !== 'q' && filters[k] && !(k === 'state' && filters[k] === 'open'),
  ).length;

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Cambiar un filtro vuelve a la primera página.
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const tickets = useQuery({
    queryKey: ['tickets', 'all', filters, page],
    queryFn: () =>
      api<Paginated<TicketListItem>>('/tickets', {
        query: { scope: 'all', ...filters, page, pageSize: 25 },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  // Selección para acciones en bloque (vincular a un problema; en la Fase 4, crear mejora).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'create-problem' | 'link-problem' | null>(null);
  const canProblems = useHasPermission()('problem.manage');
  const pageIds = tickets.data?.items.map((t) => t.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const totalPages = tickets.data
    ? Math.max(1, Math.ceil(tickets.data.total / tickets.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader title="Tickets" description="Bandeja de IT" />
      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Acciones con los seleccionados"
          className="sticky top-16 z-20 mb-3 hidden flex-wrap items-center gap-2 rounded-md border border-brand bg-primary-soft p-2 text-sm md:flex"
        >
          <span className="font-medium">{selected.size} seleccionado(s)</span>
          <Button size="sm" onClick={() => setBulk('create-problem')}>
            Crear problema
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setBulk('link-problem')}>
            Vincular a problema
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Quitar selección
          </Button>
        </div>
      )}
      {bulk === 'create-problem' && (
        <CreateProblemDialog
          ticketIds={[...selected]}
          onClose={() => {
            setBulk(null);
            setSelected(new Set());
          }}
        />
      )}
      {bulk === 'link-problem' && (
        <LinkToProblemDialog
          ticketIds={[...selected]}
          onClose={() => {
            setBulk(null);
            setSelected(new Set());
          }}
        />
      )}
      <form
        className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter('q', search);
        }}
      >
        <Input
          aria-label="Buscar por número o asunto"
          placeholder="Buscar por número o asunto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => setFilter('q', search)}
        />
        {/* En el celular los filtros se pliegan detrás de un botón para ver los tickets primero. */}
        <Button
          variant="secondary"
          className="sm:hidden"
          aria-expanded={filtersOpen}
          aria-controls="inbox-filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {filtersOpen ? 'Ocultar filtros' : 'Filtros'}
          {activeFilters > 0 && ` (${activeFilters})`}
        </Button>
        <div id="inbox-filters" className={cn(filtersOpen ? 'contents' : 'hidden sm:contents')}>
          <Select
            aria-label="Estado"
            value={filters.state}
            onChange={(e) => setFilter('state', e.target.value)}
          >
            <option value="open">Abiertos</option>
            <option value="resolved">Resueltos</option>
            <option value="closed">Cerrados y derivados</option>
            <option value="all">Todos</option>
          </Select>
          <Select
            aria-label="Asignado"
            value={filters.assignee ?? ''}
            onChange={(e) => setFilter('assignee', e.target.value)}
          >
            <option value="">Cualquier asignado</option>
            <option value="me">Asignados a mí</option>
            <option value="none">Sin asignar</option>
          </Select>
          <Select
            aria-label="SLA"
            value={filters.sla ?? ''}
            onChange={(e) => setFilter('sla', e.target.value)}
          >
            <option value="">Cualquier SLA</option>
            <option value="at_risk">Por vencer</option>
            <option value="breached">Vencidos</option>
          </Select>
          <Select
            aria-label="Tipo"
            value={filters.type ?? ''}
            onChange={(e) => setFilter('type', e.target.value)}
          >
            <option value="">Todos los tipos</option>
            {TICKET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TICKET_TYPE_LABELS[t].short}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Prioridad"
            value={filters.priority ?? ''}
            onChange={(e) => setFilter('priority', e.target.value)}
          >
            <option value="">Todas las prioridades</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Categoría"
            value={filters.category ?? ''}
            onChange={(e) => setFilter('category', e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
      </form>

      {tickets.isLoading ? (
        <Spinner />
      ) : (
        <>
          <ul className="space-y-2 md:hidden" aria-label="Tickets">
            {tickets.data?.items.map((t) => {
              const sla = primarySla(t.sla);
              return (
                <li key={t.id}>
                  <Link to={`/tickets/${t.id}`} className="block">
                    <Card className="space-y-2 p-3 transition-colors hover:border-brand">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted">{t.number}</span>
                        <StatusBadge status={t.status} />
                      </div>
                      <p className="font-medium leading-snug">{t.subject}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span>{TICKET_TYPE_LABELS[t.type].short}</span>
                        <PriorityLabel
                          priority={t.priority}
                          provisional={t.priorityIsProvisional}
                        />
                        <span>{t.assignee?.fullName ?? 'Sin asignar'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted">{t.requester.fullName}</span>
                        <SlaBadge sla={sla.info} label={sla.label} />
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
            {tickets.data?.items.length === 0 && (
              <li>
                <Card className="p-6 text-center text-sm text-muted">
                  No hay tickets con estos filtros.
                </Card>
              </li>
            )}
          </ul>
          <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  {canProblems && (
                    <Th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los de esta página"
                        className="size-4 accent-primary"
                        checked={allSelected}
                        onChange={() =>
                          setSelected(allSelected ? new Set() : new Set([...selected, ...pageIds]))
                        }
                      />
                    </Th>
                  )}
                  <Th>N°</Th>
                  <Th>Asunto</Th>
                  <Th className="hidden lg:table-cell">Tipo</Th>
                  <Th>Prioridad</Th>
                  <Th>Estado</Th>
                  <Th>SLA</Th>
                  <Th className="hidden md:table-cell">Asignado</Th>
                  <Th className="hidden xl:table-cell">Creado</Th>
                </tr>
              </thead>
              <tbody>
                {tickets.data?.items.map((t) => {
                  const sla = primarySla(t.sla);
                  return (
                    <tr
                      key={t.id}
                      className={cn('hover:bg-bg', selected.has(t.id) && 'bg-primary-soft')}
                    >
                      {canProblems && (
                        <Td>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${t.number}`}
                            className="size-4 accent-primary"
                            checked={selected.has(t.id)}
                            onChange={() => toggle(t.id)}
                          />
                        </Td>
                      )}
                      <Td className="whitespace-nowrap font-mono text-xs">
                        <Link to={`/tickets/${t.id}`} className="text-brand hover:underline">
                          {t.number}
                        </Link>
                      </Td>
                      <Td>
                        <Link to={`/tickets/${t.id}`} className="font-medium hover:underline">
                          {t.subject}
                        </Link>
                        <p className="text-xs text-muted">{t.requester.fullName}</p>
                      </Td>
                      <Td className="hidden lg:table-cell">{TICKET_TYPE_LABELS[t.type].short}</Td>
                      <Td>
                        <PriorityLabel
                          priority={t.priority}
                          provisional={t.priorityIsProvisional}
                        />
                      </Td>
                      <Td>
                        <StatusBadge status={t.status} />
                      </Td>
                      <Td>
                        <SlaBadge sla={sla.info} label={sla.label} />
                      </Td>
                      <Td className="hidden md:table-cell">
                        {t.assignee?.fullName ?? <span className="text-muted">Sin asignar</span>}
                      </Td>
                      <Td className="hidden whitespace-nowrap xl:table-cell">
                        {formatDateTime(t.createdAt)}
                      </Td>
                    </tr>
                  );
                })}
                {tickets.data?.items.length === 0 && (
                  <tr>
                    <Td className="py-6 text-center text-muted">
                      No hay tickets con estos filtros.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </>
      )}
      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-end gap-2 text-sm" aria-label="Paginación">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setFilter('page', String(page - 1))}
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
            onClick={() => setFilter('page', String(page + 1))}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </>
  );
}
