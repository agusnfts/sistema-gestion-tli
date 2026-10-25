import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import type { Paginated, TicketListItem } from '@tli/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Card, Spinner } from '@/components/ui/misc';
import { StatusBadge } from './ui';

/** Buscador de todos los tickets abiertos para vincular cualquiera, no solo los sugeridos. */
export function AddTicketsCard({
  description,
  meta,
  linkedIds,
  pendingId,
  onLink,
}: {
  description: string;
  /** Dato extra debajo del asunto (ej. el problema en el que ya está). */
  meta?: (t: TicketListItem) => string | null;
  linkedIds: string[];
  pendingId?: string;
  onLink: (ticketId: string) => void;
}) {
  const [q, setQ] = useState('');
  const open = useQuery({
    queryKey: ['tickets', 'all', 'open-search', q],
    queryFn: () =>
      api<Paginated<TicketListItem>>('/tickets', {
        query: { scope: 'all', state: 'open', q, pageSize: 20 },
      }),
    placeholderData: keepPreviousData,
  });
  const items = open.data?.items.filter((t) => !linkedIds.includes(t.id)) ?? [];

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Agregar tickets abiertos</h2>
      <p className="mt-1 text-xs text-muted">{description}</p>
      <Input
        className="mt-3"
        aria-label="Buscar tickets abiertos por número o asunto"
        placeholder="Buscar por número (ej. TLI-000012) o asunto"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {open.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No hay tickets abiertos que coincidan.</p>
      ) : (
        <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto text-sm">
          {items.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link to={`/tickets/${t.id}`} className="hover:underline">
                  <span className="font-mono text-xs text-muted">{t.number}</span> {t.subject}
                </Link>
                <p className="text-xs text-muted">
                  {t.requester.fullName}
                  {meta?.(t) && ` · ${meta(t)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pendingId === t.id}
                  onClick={() => onLink(t.id)}
                >
                  <Link2 className="size-4" aria-hidden /> Vincular
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
