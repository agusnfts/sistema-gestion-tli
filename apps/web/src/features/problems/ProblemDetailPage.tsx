import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Unlink } from 'lucide-react';
import {
  PROBLEM_STATUSES,
  PROBLEM_STATUS_LABELS,
  TICKET_CATEGORY_LABELS,
  type ChangeProblemStatusResponse,
  type ProblemDetail,
  type ProblemStatus,
  type SimilarResults,
  type UserRef,
  type Paginated,
  type TicketListItem,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, Spinner } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/features/tickets/ui';
import { errorText, ProblemStatusBadge } from './components';

const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm disabled:bg-bg';

type Editable = {
  rootCause: string;
  workaround: string;
  permanentSolution: string;
};

export function ProblemDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const can = useHasPermission();
  const canManage = can('problem.manage');
  const key = ['problems', 'detail', id];
  const problem = useQuery({ queryKey: key, queryFn: () => api<ProblemDetail>(`/problems/${id}`) });
  const suggestions = useQuery({
    queryKey: ['problems', 'suggestions', id],
    queryFn: () => api<SimilarResults>(`/problems/${id}/suggestions`),
    enabled: canManage,
  });
  const staff = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: () => api<UserRef[]>('/tickets/assignees'),
    enabled: canManage,
  });

  const [draft, setDraft] = useState<Editable | null>(null);
  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (problem.data) {
      setDraft({
        rootCause: problem.data.rootCause ?? '',
        workaround: problem.data.workaround ?? '',
        permanentSolution: problem.data.permanentSolution ?? '',
      });
    }
  }, [problem.data]);

  const refresh = (data: ProblemDetail) => {
    qc.setQueryData(key, data);
    void qc.invalidateQueries({ queryKey: ['problems', 'list'] });
    void qc.invalidateQueries({ queryKey: ['problems', 'suggestions', id] });
    void qc.invalidateQueries({ queryKey: ['tickets'] });
  };

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<ProblemDetail>(`/problems/${id}`, { method: 'PATCH', body }),
    onSuccess: refresh,
  });
  const status = useMutation({
    mutationFn: (body: { status: ProblemStatus; resolveTickets?: boolean; message?: string }) =>
      api<ChangeProblemStatusResponse>(`/problems/${id}/status`, { method: 'POST', body }),
    onSuccess: (res) => {
      refresh(res.problem);
      setResolving(false);
      setNotice(
        res.resolvedTickets
          ? `Problema resuelto. Se resolvieron ${res.resolvedTickets} ticket(s) y se avisó a sus solicitantes.`
          : null,
      );
    },
  });
  const link = useMutation({
    mutationFn: (ticketId: string) =>
      api<ProblemDetail>(`/problems/${id}/tickets`, {
        method: 'POST',
        body: { ticketIds: [ticketId] },
      }),
    onSuccess: refresh,
  });
  const unlink = useMutation({
    mutationFn: (ticketId: string) =>
      api<ProblemDetail>(`/problems/${id}/tickets/${ticketId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  if (problem.isLoading) return <Spinner />;
  if (!problem.data || !draft) return <Alert tone="warning" title="No encontramos el problema" />;
  const p = problem.data;
  const error = save.error ?? status.error ?? link.error ?? unlink.error;
  const dirty =
    draft.rootCause !== (p.rootCause ?? '') ||
    draft.workaround !== (p.workaround ?? '') ||
    draft.permanentSolution !== (p.permanentSolution ?? '');

  return (
    <>
      <Link
        to="/problemas"
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Problemas
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">
            {p.code} · {TICKET_CATEGORY_LABELS[p.category]}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand">{p.title}</h1>
        </div>
        <ProblemStatusBadge status={p.status} />
      </div>

      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="danger">{errorText(error)}</Alert>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <p className="text-xs text-muted">
              Creado por {p.createdBy.fullName} · {formatDateTime(p.createdAt)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{p.description}</p>
          </Card>

          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Análisis</h2>
            {(
              [
                ['rootCause', 'Causa raíz', 'Por qué pasa.'],
                ['workaround', 'Workaround', 'Cómo seguir trabajando mientras tanto.'],
                [
                  'permanentSolution',
                  'Solución definitiva',
                  'Qué se hizo o se va a hacer para que no vuelva a pasar.',
                ],
              ] as const
            ).map(([field, label, hint]) => (
              <Field key={field} label={label} hint={hint}>
                {(fp) => (
                  <textarea
                    {...fp}
                    rows={3}
                    disabled={!canManage}
                    className={textareaClass}
                    value={draft[field]}
                    onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                  />
                )}
              </Field>
            ))}
            {canManage && (
              <Button
                disabled={!dirty}
                loading={save.isPending}
                onClick={() =>
                  save.mutate({
                    rootCause: draft.rootCause || null,
                    workaround: draft.workaround || null,
                    permanentSolution: draft.permanentSolution || null,
                  })
                }
              >
                Guardar análisis
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-semibold">
              Tickets vinculados <span className="text-muted">({p.ticketCount})</span>
            </h2>
            {p.tickets.length === 0 ? (
              <p className="text-sm text-muted">Todavía no hay tickets vinculados.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {p.tickets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <Link to={`/tickets/${t.id}`} className="font-medium hover:underline">
                        <span className="font-mono text-xs text-muted">{t.number}</span> {t.subject}
                      </Link>
                      <p className="text-xs text-muted">
                        {t.requester.fullName} · {formatDateTime(t.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Desvincular ${t.number}`}
                          onClick={() => unlink.mutate(t.id)}
                        >
                          <Unlink className="size-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canManage && p.status !== 'RESOLVED' && (
            <AddTicketsCard
              linkedIds={p.tickets.map((t) => t.id)}
              pendingId={link.isPending ? link.variables : undefined}
              onLink={(ticketId) => link.mutate(ticketId)}
            />
          )}

          {canManage && p.status !== 'RESOLVED' && (
            <Card className="p-5">
              <h2 className="font-semibold">Tickets que podrían tener la misma causa</h2>
              <p className="mt-1 text-xs text-muted">
                Sugerencias por similitud de texto. Revisalos antes de vincular.
              </p>
              {suggestions.isLoading ? (
                <Spinner />
              ) : !suggestions.data?.tickets.length ? (
                <p className="mt-3 text-sm text-muted">
                  No encontramos tickets parecidos sin vincular.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {suggestions.data.tickets.map((t) => (
                    <li
                      key={t.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <Link to={`/tickets/${t.id}`} className="hover:underline">
                          <span className="font-mono text-xs text-muted">{t.number}</span>{' '}
                          {t.subject}
                        </Link>
                        {t.problem && (
                          <p className="text-xs text-muted">Ya está en {t.problem.code}</p>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={link.isPending && link.variables === t.id}
                        onClick={() => link.mutate(t.id)}
                      >
                        <Link2 className="size-4" aria-hidden /> Vincular
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-2 font-semibold">Historial</h2>
            <ol className="space-y-1 text-xs text-muted">
              {p.activity.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.actor?.fullName ?? 'Sistema'}</span>{' '}
                  {a.kind === 'CREATED'
                    ? 'creó el problema'
                    : a.field === 'status'
                      ? `cambió el estado a "${PROBLEM_STATUS_LABELS[a.newValue as ProblemStatus] ?? a.newValue}"`
                      : a.kind === 'LINKED'
                        ? `vinculó ${a.newValue} ticket(s)`
                        : `actualizó ${a.field ?? 'el problema'}`}{' '}
                  · {formatDateTime(a.occurredAt)}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="order-first space-y-4 lg:order-none">
          <Card className="space-y-4 p-4 text-sm">
            <div>
              <p className="text-xs text-muted">Tickets abiertos</p>
              <p className="text-2xl font-semibold">{p.openTicketCount}</p>
            </div>
            {canManage && (
              <div>
                <p className="mb-1 text-xs text-muted">Cambiar estado</p>
                <div className="flex flex-wrap gap-1.5">
                  {PROBLEM_STATUSES.filter((s) => s !== p.status).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={s === 'RESOLVED' ? 'primary' : 'secondary'}
                      disabled={status.isPending}
                      onClick={() =>
                        s === 'RESOLVED' ? setResolving(true) : status.mutate({ status: s })
                      }
                    >
                      {s === 'RESOLVED' ? 'Resolver' : PROBLEM_STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <Field label="Responsable">
              {(fp) => (
                <Select
                  {...fp}
                  disabled={!canManage || save.isPending}
                  value={p.owner?.id ?? ''}
                  onChange={(e) => save.mutate({ ownerId: e.target.value || null })}
                >
                  <option value="">Sin responsable</option>
                  {staff.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {p.resolvedAt && (
              <p className="text-xs text-muted">Resuelto el {formatDateTime(p.resolvedAt)}</p>
            )}
          </Card>
        </aside>
      </div>

      {resolving && (
        <ResolveProblemDialog
          problem={p}
          loading={status.isPending}
          onClose={() => setResolving(false)}
          onConfirm={(resolveTickets, message) =>
            status.mutate({ status: 'RESOLVED', resolveTickets, message: message || undefined })
          }
        />
      )}
    </>
  );
}

function ResolveProblemDialog({
  problem: p,
  loading,
  onClose,
  onConfirm,
}: {
  problem: ProblemDetail;
  loading: boolean;
  onClose: () => void;
  onConfirm: (resolveTickets: boolean, message: string) => void;
}) {
  const solution = p.permanentSolution ?? p.workaround;
  const [resolveTickets, setResolveTickets] = useState(p.openTicketCount > 0);
  const [message, setMessage] = useState(
    `Identificamos la causa de este inconveniente y ya está resuelto. ${solution ? `Solución: ${solution}.` : ''} ` +
      'Si el problema sigue, respondé este ticket y lo reabrimos.',
  );
  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="Resolver problema"
      description={
        solution
          ? undefined
          : 'Primero cargá la solución definitiva o el workaround y guardá el análisis.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!solution}
            loading={loading}
            onClick={() => onConfirm(resolveTickets, message)}
          >
            Resolver
          </Button>
        </>
      }
    >
      {solution && (
        <div className="space-y-4">
          <Checkbox
            label={`Resolver también los ${p.openTicketCount} ticket(s) abiertos vinculados y avisar a sus solicitantes`}
            checked={resolveTickets}
            disabled={p.openTicketCount === 0}
            onChange={(e) => setResolveTickets(e.target.checked)}
          />
          {resolveTickets && (
            <Field
              label="Mensaje para los solicitantes"
              hint="Se publica como respuesta en cada ticket."
            >
              {(fp) => (
                <textarea
                  {...fp}
                  rows={4}
                  className={textareaClass}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              )}
            </Field>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Buscador de todos los tickets abiertos para vincular cualquiera, no solo los sugeridos. */
function AddTicketsCard({
  linkedIds,
  pendingId,
  onLink,
}: {
  linkedIds: string[];
  pendingId?: string;
  onLink: (ticketId: string) => void;
}) {
  const [q, setQ] = useState('');
  const open = useQuery({
    queryKey: ['tickets', 'all', 'open-for-problem', q],
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
      <p className="mt-1 text-xs text-muted">
        Buscá cualquier ticket abierto por número o asunto. Si ya está en otro problema, se mueve a
        este.
      </p>
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
                  {t.problem && ` · Ya está en ${t.problem.code}`}
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
