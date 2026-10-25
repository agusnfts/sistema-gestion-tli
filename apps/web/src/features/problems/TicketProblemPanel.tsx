import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SimilarResults, TicketDetail } from '@tli/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/misc';
import { StatusBadge } from '@/features/tickets/ui';
import {
  CreateProblemDialog,
  errorText,
  LinkToProblemDialog,
  ProblemStatusBadge,
} from './components';

/** Panel de IT en el detalle del ticket: problema vinculado y sugerencias de similares. */
export function TicketProblemPanel({ ticket: t }: { ticket: TicketDetail }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'create' | 'link' | null>(null);
  const similar = useQuery({
    queryKey: ['tickets', 'similar', t.id],
    queryFn: () => api<SimilarResults>(`/tickets/${t.id}/similar`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['tickets'] });
    void qc.invalidateQueries({ queryKey: ['problems'] });
  };
  const link = useMutation({
    mutationFn: (problemId: string) =>
      api(`/problems/${problemId}/tickets`, { method: 'POST', body: { ticketIds: [t.id] } }),
    onSuccess: refresh,
  });
  const unlink = useMutation({
    mutationFn: () => api(`/problems/${t.problem!.id}/tickets/${t.id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const error = link.error ?? unlink.error;

  return (
    <Card className="space-y-4 p-4 text-sm">
      <div>
        <p className="mb-1 text-xs text-muted">Problema (causa raíz)</p>
        {error && <Alert tone="danger">{errorText(error)}</Alert>}
        {t.problem ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              to={`/problemas/${t.problem.id}`}
              className="font-medium text-brand hover:underline"
            >
              {t.problem.code} · {t.problem.title}
            </Link>
            <Button
              variant="ghost"
              size="sm"
              loading={unlink.isPending}
              onClick={() => unlink.mutate()}
            >
              Desvincular
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setDialog('link')}>
              Vincular a problema
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDialog('create')}>
              Crear problema
            </Button>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs text-muted">Posibles duplicados o causa común</p>
        {similar.isLoading ? (
          <p className="text-xs text-muted">Buscando…</p>
        ) : !similar.data?.tickets.length && !similar.data?.problems.length ? (
          <p className="text-xs text-muted">No encontramos tickets ni problemas parecidos.</p>
        ) : (
          <ul className="space-y-2">
            {similar.data?.problems.map((p) => (
              <li key={p.id} className="rounded-md bg-bg p-2">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/problemas/${p.id}`} className="min-w-0 hover:underline">
                    <span className="font-mono text-xs text-muted">{p.code}</span>{' '}
                    <span className="font-medium">{p.title}</span>
                  </Link>
                  <ProblemStatusBadge status={p.status} />
                </div>
                {p.status !== 'RESOLVED' && t.problem?.id !== p.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 px-0 text-brand"
                    loading={link.isPending && link.variables === p.id}
                    onClick={() => link.mutate(p.id)}
                  >
                    Vincular a este problema
                  </Button>
                )}
              </li>
            ))}
            {similar.data?.tickets.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2">
                <Link to={`/tickets/${s.id}`} className="min-w-0 hover:underline">
                  <span className="font-mono text-xs text-muted">{s.number}</span> {s.subject}
                  {s.problem && (
                    <span className="block text-xs text-muted">En {s.problem.code}</span>
                  )}
                </Link>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialog === 'create' && (
        <CreateProblemDialog
          ticketIds={[t.id]}
          defaults={{ title: t.subject, category: t.category }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'link' && (
        <LinkToProblemDialog ticketIds={[t.id]} onClose={() => setDialog(null)} />
      )}
    </Card>
  );
}
