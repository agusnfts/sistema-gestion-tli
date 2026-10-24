import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  TICKET_TYPE_LABELS,
  type ListTicketsQuery,
  type Paginated,
  type TicketListItem,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card, PageHeader, Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { StatusBadge } from './ui';

const STATES: { value: ListTicketsQuery['state']; label: string }[] = [
  { value: 'open', label: 'Abiertos' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'closed', label: 'Cerrados' },
  { value: 'all', label: 'Todos' },
];

/** Inicio del usuario: sus tickets, pensado para leerse bien en el celular. */
export function MyTicketsPage() {
  const can = useHasPermission();
  const [state, setState] = useState<ListTicketsQuery['state']>('open');
  const [page, setPage] = useState(1);
  const tickets = useQuery({
    queryKey: ['tickets', 'mine', state, page],
    queryFn: () =>
      api<Paginated<TicketListItem>>('/tickets', {
        query: { scope: 'mine', state, page, pageSize: 20 },
      }),
    placeholderData: keepPreviousData,
  });
  const totalPages = tickets.data
    ? Math.max(1, Math.ceil(tickets.data.total / tickets.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title="Mis tickets"
        actions={
          can('ticket.create') && (
            <Link to="/tickets/nuevo" className={buttonClasses()}>
              <Plus className="size-4" aria-hidden /> Nuevo ticket
            </Link>
          )
        }
      />
      <div
        role="tablist"
        aria-label="Estado"
        className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border"
      >
        {STATES.map((s) => (
          <button
            key={s.value}
            role="tab"
            aria-selected={state === s.value}
            onClick={() => {
              setState(s.value);
              setPage(1);
            }}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm',
              state === s.value
                ? 'border-brand font-medium text-brand'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      {tickets.isLoading ? (
        <Spinner />
      ) : tickets.data?.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No tenés tickets en esta vista.
          {can('ticket.create') && (
            <>
              {' '}
              <Link to="/tickets/nuevo" className="text-brand hover:underline">
                Crear uno
              </Link>
            </>
          )}
        </Card>
      ) : (
        <ul className="space-y-2">
          {tickets.data?.items.map((t) => (
            <li key={t.id}>
              <Link to={`/tickets/${t.id}`} className="block">
                <Card className="p-4 transition-colors hover:border-brand">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted">{t.number}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="mt-1 font-medium">{t.subject}</p>
                  <p className="mt-1 text-xs text-muted">
                    {TICKET_TYPE_LABELS[t.type].short} · Actualizado {formatDateTime(t.updatedAt)}
                    {t.assignee && ` · Lo atiende ${t.assignee.fullName}`}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
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
