import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { TICKET_CATEGORY_LABELS, type Paginated, type ProblemListItem } from '@tli/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Card, PageHeader, Spinner, Table, Td, Th } from '@/components/ui/misc';
import { CreateProblemDialog, ProblemStatusBadge } from './components';

const STATES = [
  { value: 'open', label: 'Abiertos' },
  { value: 'resolved', label: 'Resueltos' },
  { value: 'all', label: 'Todos' },
] as const;

export function ProblemsPage() {
  const can = useHasPermission();
  const [state, setState] = useState<(typeof STATES)[number]['value']>('open');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const problems = useQuery({
    queryKey: ['problems', 'list', state, q],
    queryFn: () =>
      api<Paginated<ProblemListItem>>('/problems', { query: { state, q, pageSize: 50 } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Problemas"
        description="Tickets que comparten una misma causa raíz."
        actions={
          can('problem.manage') && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> Nuevo problema
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
        <Input
          aria-label="Buscar por código o título"
          placeholder="Buscar por código o título"
          className="max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {problems.isLoading ? (
        <Spinner />
      ) : problems.data?.items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">No hay problemas en esta vista.</Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {problems.data?.items.map((p) => (
              <li key={p.id}>
                <Link to={`/problemas/${p.id}`} className="block">
                  <Card className="space-y-1 p-3 hover:border-brand">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted">{p.code}</span>
                      <ProblemStatusBadge status={p.status} />
                    </div>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-muted">
                      {p.openTicketCount} abiertos de {p.ticketCount} tickets ·{' '}
                      {TICKET_CATEGORY_LABELS[p.category]}
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
                  <Th>Título</Th>
                  <Th>Sistema</Th>
                  <Th>Estado</Th>
                  <Th>Tickets</Th>
                  <Th>Responsable</Th>
                  <Th>Actualizado</Th>
                </tr>
              </thead>
              <tbody>
                {problems.data?.items.map((p) => (
                  <tr key={p.id} className="hover:bg-bg">
                    <Td className="font-mono text-xs">
                      <Link to={`/problemas/${p.id}`} className="text-brand hover:underline">
                        {p.code}
                      </Link>
                    </Td>
                    <Td>
                      <Link to={`/problemas/${p.id}`} className="font-medium hover:underline">
                        {p.title}
                      </Link>
                    </Td>
                    <Td>{TICKET_CATEGORY_LABELS[p.category]}</Td>
                    <Td>
                      <ProblemStatusBadge status={p.status} />
                    </Td>
                    <Td>
                      <span className={p.openTicketCount ? 'font-medium' : 'text-muted'}>
                        {p.openTicketCount} abiertos
                      </span>
                      <span className="text-muted"> / {p.ticketCount}</span>
                    </Td>
                    <Td>{p.owner?.fullName ?? '—'}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(p.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
      {creating && <CreateProblemDialog onClose={() => setCreating(false)} />}
    </>
  );
}
