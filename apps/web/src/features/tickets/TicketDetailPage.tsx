import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import {
  FREQUENCY_LABELS,
  fixedCategoryFor,
  INTEGRATION_COUNTERPART_LABELS,
  ACCESS_ACTION_LABELS,
  INTEGRATION_DIRECTION_LABELS,
  INTEGRATION_PROCESS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  CATEGORIES_BY_TYPE,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  formatBusinessDuration,
  type TicketDetail,
  type TicketStatus,
  type UserRef,
} from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge, Card, Spinner } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { PriorityLabel, SlaBadge, StatusBadge } from './ui';
import {
  AttachmentList,
  AttachmentPicker,
  useAttachmentUploads,
} from '@/features/attachments/attachments';

const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm aria-[invalid=true]:border-danger';

const EXTRA_LABELS: Record<string, string> = {
  errorMessage: 'Mensaje de error',
  accessAction: 'Pedido',
  forWhom: 'Para quién',
  neededBy: 'Para cuándo',
  currentProcess: 'Cómo se hace hoy',
  frequency: 'Frecuencia',
  minutesPerOccurrence: 'Minutos cada vez',
  expectedBenefit: 'Qué se ganaría',
  counterpartType: 'La integración es con',
  counterpartName: 'Nombre',
  clientName: 'Cliente',
  process: 'Proceso',
  direction: 'Sentido',
  formatOrChannel: 'Formato o canal',
  volume: 'Volumen',
  desiredDate: 'Fecha deseada',
};

function extraValue(key: string, value: unknown): string {
  const v = String(value);
  if (key === 'frequency') return FREQUENCY_LABELS[v as keyof typeof FREQUENCY_LABELS] ?? v;
  if (key === 'accessAction')
    return ACCESS_ACTION_LABELS[v as keyof typeof ACCESS_ACTION_LABELS] ?? v;
  if (key === 'counterpartType')
    return INTEGRATION_COUNTERPART_LABELS[v as keyof typeof INTEGRATION_COUNTERPART_LABELS] ?? v;
  if (key === 'process')
    return INTEGRATION_PROCESS_LABELS[v as keyof typeof INTEGRATION_PROCESS_LABELS] ?? v;
  if (key === 'direction')
    return INTEGRATION_DIRECTION_LABELS[v as keyof typeof INTEGRATION_DIRECTION_LABELS] ?? v;
  return v;
}

function activityText(
  kind: string,
  field: string | null,
  oldValue: string | null,
  newValue: string | null,
): string {
  if (kind === 'CREATED') return 'creó el ticket';
  if (field === 'status') {
    return `cambió el estado de "${TICKET_STATUS_LABELS[oldValue as TicketStatus] ?? oldValue}" a "${TICKET_STATUS_LABELS[newValue as TicketStatus] ?? newValue}"`;
  }
  if (field === 'priority')
    return `fijó la prioridad en ${PRIORITY_LABELS[newValue as keyof typeof PRIORITY_LABELS] ?? newValue}`;
  if (field === 'assignee') return newValue ? 'asignó el ticket' : 'quitó la asignación';
  if (field === 'category')
    return `cambió la categoría a ${TICKET_CATEGORY_LABELS[newValue as keyof typeof TICKET_CATEGORY_LABELS] ?? newValue}`;
  return 'actualizó el ticket';
}

export function TicketDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const ticket = useQuery({
    queryKey: ['tickets', 'detail', id],
    queryFn: () => api<TicketDetail>(`/tickets/${id}`),
    // La conversación se actualiza sola; más seguido mientras hay adjuntos en análisis.
    refetchInterval: (q) => {
      const d = q.state.data;
      const all = d ? [...d.attachments, ...d.comments.flatMap((c) => c.attachments)] : [];
      return all.some((a) => a.scanStatus === 'PENDING_SCAN') ? 3_000 : 20_000;
    },
  });

  const setData = (data: TicketDetail) => {
    qc.setQueryData(['tickets', 'detail', id], data);
    void qc.invalidateQueries({
      queryKey: ['tickets'],
      predicate: (q) => q.queryKey[1] === 'mine' || q.queryKey[1] === 'all',
    });
  };

  if (ticket.isLoading) return <Spinner />;
  if (ticket.error || !ticket.data) {
    return (
      <Alert tone="warning" title="No encontramos el ticket">
        Puede que no exista o que no tengas acceso.{' '}
        <Link to="/" className="underline">
          Volver al inicio
        </Link>
      </Alert>
    );
  }
  const t = ticket.data;
  // Se muestran en el orden del formulario (jsonb no conserva el orden de las claves).
  const extras = Object.keys(EXTRA_LABELS)
    .map((k) => [k, t.extraFields[k]] as const)
    .filter(([, v]) => v !== undefined && v !== null && v !== '');

  // Hilo: comentarios y eventos en orden cronológico.
  const thread = [
    ...t.comments.map((c) => ({ at: c.createdAt, kind: 'comment' as const, c })),
    ...t.activity.map((a) => ({ at: a.occurredAt, kind: 'event' as const, a })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <>
      <Link
        to={t.canManage ? '/tickets' : '/mis-tickets'}
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Volver
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">
            {t.number} · {TICKET_TYPE_LABELS[t.type].short}
            {!fixedCategoryFor(t.type) && ` · ${TICKET_CATEGORY_LABELS[t.category]}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand">{t.subject}</h1>
        </div>
        <StatusBadge status={t.status} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <p className="text-xs text-muted">
              {t.requester.fullName} · {formatDateTime(t.createdAt)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{t.description}</p>
            <AttachmentList items={t.attachments} />
            {extras.length > 0 && (
              <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
                {extras.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted">{EXTRA_LABELS[k] ?? k}</dt>
                    <dd className="whitespace-pre-wrap">{extraValue(k, v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          {t.resolutionSolution && (
            <Card className="border-success/30 bg-success-soft p-5 text-sm">
              <p className="font-semibold text-success">Resolución</p>
              <p className="mt-2">
                <span className="text-muted">Causa: </span>
                {t.resolutionCause}
              </p>
              <p className="mt-1">
                <span className="text-muted">Qué se hizo: </span>
                {t.resolutionSolution}
              </p>
            </Card>
          )}

          <section aria-label="Conversación">
            <h2 className="mb-2 text-sm font-semibold">Conversación</h2>
            <ol className="space-y-3">
              {thread.map((item) =>
                item.kind === 'comment' ? (
                  <li key={item.c.id}>
                    <Card
                      className={cn(
                        'p-4',
                        item.c.visibility === 'INTERNAL' && 'border-warning/40 bg-warning-soft',
                        item.c.fromStaff &&
                          item.c.visibility === 'PUBLIC' &&
                          'border-l-4 border-l-brand',
                      )}
                    >
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className="font-medium text-fg">{item.c.author.fullName}</span>
                        {item.c.fromStaff && <Badge tone="info">IT</Badge>}
                        {item.c.visibility === 'INTERNAL' && (
                          <Badge tone="warning">
                            <Lock className="mr-1 size-3" aria-hidden /> Interno
                          </Badge>
                        )}
                        <span>{formatDateTime(item.c.createdAt)}</span>
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{item.c.body}</p>
                      <AttachmentList items={item.c.attachments} />
                    </Card>
                  </li>
                ) : (
                  <li key={item.a.id} className="px-1 text-xs text-muted">
                    <span className="font-medium">{item.a.actor?.fullName ?? 'Sistema'}</span>{' '}
                    {activityText(item.a.kind, item.a.field, item.a.oldValue, item.a.newValue)} ·{' '}
                    {formatDateTime(item.a.occurredAt)}
                  </li>
                ),
              )}
            </ol>
          </section>

          {t.canComment ? (
            <ReplyBox ticket={t} onSaved={setData} />
          ) : (
            t.status === 'CLOSED' && (
              <Alert tone="info">
                El ticket está cerrado. Si el problema vuelve, creá un ticket nuevo.
              </Alert>
            )
          )}
        </div>

        {/* En el celular el panel (estado, SLA, asignación) va arriba de la conversación. */}
        <aside className="order-first space-y-4 lg:order-none">
          {t.canManage ? (
            <ManagePanel ticket={t} onSaved={setData} />
          ) : (
            <RequesterPanel ticket={t} />
          )}
          {t.timeEntries && <TimePanel ticket={t} onSaved={setData} />}
        </aside>
      </div>
    </>
  );
}

function RequesterPanel({ ticket: t }: { ticket: TicketDetail }) {
  return (
    <Card className="space-y-3 p-4 text-sm">
      <div>
        <p className="text-xs text-muted">Estado</p>
        <StatusBadge status={t.status} />
      </div>
      <div>
        <p className="text-xs text-muted">Lo atiende</p>
        <p>{t.assignee?.fullName ?? 'Todavía sin asignar'}</p>
      </div>
      {(t.warehouse || t.area) && (
        <div>
          <p className="text-xs text-muted">Sector</p>
          <p>{t.warehouse?.name ?? t.area?.name}</p>
        </div>
      )}
      <div>
        <p className="text-xs text-muted">Prioridad</p>
        <PriorityLabel priority={t.priority} provisional={t.priorityIsProvisional} />
      </div>
      <div>
        <p className="text-xs text-muted">Creado</p>
        <p>{formatDateTime(t.createdAt)}</p>
      </div>
    </Card>
  );
}

function useTicketMutation(id: string, onSaved: (d: TicketDetail) => void) {
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: unknown;
      method?: 'POST' | 'PATCH';
    }) => api<TicketDetail>(`/tickets/${id}${path}`, { method, body }),
    onSuccess: (data) => {
      setError(null);
      onSaved(data);
    },
    onError: (e) =>
      setError(
        e instanceof ApiError
          ? [e.message, ...e.issues.map((i) => i.message)].join(' · ')
          : 'Error inesperado',
      ),
  });
  return { ...m, error, setError };
}

function ManagePanel({
  ticket: t,
  onSaved,
}: {
  ticket: TicketDetail;
  onSaved: (d: TicketDetail) => void;
}) {
  const assignees = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: () => api<UserRef[]>('/tickets/assignees'),
  });
  const m = useTicketMutation(t.id, onSaved);
  const [resolving, setResolving] = useState(false);
  const closed = t.status === 'CLOSED';

  return (
    <Card className="space-y-4 p-4 text-sm">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <div className="space-y-2">
        <p className="text-xs text-muted">SLA</p>
        <div className="flex flex-wrap gap-1">
          <SlaBadge sla={t.sla.firstResponse} label="1ª respuesta" />
          <SlaBadge sla={t.sla.resolution} label="Resolución" />
        </div>
        {t.sla.resolution.dueAt && (
          <p className="text-xs text-muted">
            Resolución vence: {formatDateTime(t.sla.resolution.dueAt)}
          </p>
        )}
      </div>

      {t.allowedTransitions.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted">Cambiar estado</p>
          <div className="flex flex-wrap gap-1.5">
            {t.allowedTransitions.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'RESOLVED' ? 'primary' : 'secondary'}
                disabled={m.isPending}
                onClick={() =>
                  s === 'RESOLVED'
                    ? setResolving(true)
                    : m.mutate({ path: '/status', body: { status: s } })
                }
              >
                {TICKET_STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Field label="Asignado">
        {(p) => (
          <Select
            {...p}
            disabled={closed || m.isPending}
            value={t.assignee?.id ?? ''}
            onChange={(e) =>
              m.mutate({ path: '', method: 'PATCH', body: { assigneeId: e.target.value || null } })
            }
          >
            <option value="">Sin asignar</option>
            {assignees.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Prioridad"
        hint={
          t.priorityIsProvisional
            ? `Provisoria: el usuario indicó ${PRIORITY_LABELS[t.userUrgency].toLowerCase()}.`
            : undefined
        }
      >
        {(p) => (
          <Select
            {...p}
            disabled={closed || m.isPending}
            value={t.priorityIsProvisional ? '' : t.priority}
            onChange={(e) =>
              e.target.value &&
              m.mutate({ path: '', method: 'PATCH', body: { priority: e.target.value } })
            }
          >
            {t.priorityIsProvisional && <option value="">Elegí la prioridad</option>}
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Categoría"
        hint={fixedCategoryFor(t.type) ? 'Fija para los pedidos de integración.' : undefined}
      >
        {(p) => (
          <Select
            {...p}
            disabled={closed || m.isPending || !!fixedCategoryFor(t.type)}
            value={t.category}
            onChange={(e) =>
              m.mutate({ path: '', method: 'PATCH', body: { category: e.target.value } })
            }
          >
            {/* Las del tipo de ticket, más la actual por si quedó de antes del cambio de reglas. */}
            {[...new Set([...CATEGORIES_BY_TYPE[t.type], t.category])].map((c) => (
              <option key={c} value={c}>
                {TICKET_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="border-t border-border pt-3 text-xs text-muted">
        <p>Solicitante: {t.requester.fullName}</p>
        {(t.warehouse || t.area) && <p>Sector: {t.warehouse?.name ?? t.area?.name}</p>}
        <p>Creado: {formatDateTime(t.createdAt)}</p>
      </div>
      {resolving && (
        <ResolveDialog
          onClose={() => setResolving(false)}
          loading={m.isPending}
          onSubmit={(cause, solution) =>
            m.mutate(
              {
                path: '/status',
                body: { status: 'RESOLVED', resolutionCause: cause, resolutionSolution: solution },
              },
              { onSuccess: () => setResolving(false) },
            )
          }
        />
      )}
    </Card>
  );
}

function ResolveDialog({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (cause: string, solution: string) => void;
  loading: boolean;
}) {
  const [cause, setCause] = useState('');
  const [solution, setSolution] = useState('');
  const valid = cause.trim().length >= 3 && solution.trim().length >= 3;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Resolver ticket"
      description="La causa y la solución quedan registradas y después alimentan la base de conocimiento."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!valid} loading={loading} onClick={() => onSubmit(cause, solution)}>
            Resolver
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Causa" required>
          {(p) => (
            <textarea
              {...p}
              rows={3}
              className={textareaClass}
              value={cause}
              onChange={(e) => setCause(e.target.value)}
            />
          )}
        </Field>
        <Field label="Qué se hizo" required>
          {(p) => (
            <textarea
              {...p}
              rows={3}
              className={textareaClass}
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function ReplyBox({
  ticket: t,
  onSaved,
}: {
  ticket: TicketDetail;
  onSaved: (d: TicketDetail) => void;
}) {
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const attachments = useAttachmentUploads();
  const m = useTicketMutation(t.id, (d) => {
    setBody('');
    attachments.clear();
    onSaved(d);
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return m.setError('Escribí un comentario');
    m.mutate({
      path: '/comments',
      body: { body, visibility: internal ? 'INTERNAL' : 'PUBLIC', attachmentIds: attachments.ids },
    });
  }

  return (
    <form onSubmit={submit} onPaste={attachments.onPaste} className="space-y-2">
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {t.canManage && (
        <div role="radiogroup" aria-label="Tipo de comentario" className="flex gap-1">
          {[
            { v: false, label: 'Respuesta al usuario' },
            { v: true, label: 'Nota interna' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={internal === o.v}
              onClick={() => setInternal(o.v)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                internal === o.v
                  ? o.v
                    ? 'bg-warning-soft font-medium text-warning'
                    : 'bg-primary-soft font-medium text-primary'
                  : 'text-muted hover:bg-bg',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="reply" className="sr-only">
        Comentario
      </label>
      <textarea
        id="reply"
        rows={4}
        className={cn(textareaClass, internal && 'bg-warning-soft')}
        placeholder={internal ? 'Solo lo ve el equipo de IT' : 'Escribí tu respuesta'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <AttachmentPicker state={attachments} compact />
      <Button type="submit" loading={m.isPending} disabled={attachments.uploading}>
        {internal ? 'Guardar nota interna' : 'Enviar respuesta'}
      </Button>
    </form>
  );
}

function TimePanel({
  ticket: t,
  onSaved,
}: {
  ticket: TicketDetail;
  onSaved: (d: TicketDetail) => void;
}) {
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const m = useTicketMutation(t.id, (d) => {
    setMinutes('');
    setNote('');
    onSaved(d);
  });
  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold">Tiempo invertido</p>
        <p className="text-muted">{formatBusinessDuration(t.totalMinutes ?? 0, 24 * 60)}</p>
      </div>
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      {t.status !== 'CLOSED' && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate({
              path: '/time',
              body: { minutes: Number(minutes), note: note || undefined },
            });
          }}
        >
          <div className="w-24">
            <Field label="Minutos">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                />
              )}
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <Field label="Nota">
              {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          </div>
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            loading={m.isPending}
            disabled={!minutes}
          >
            Sumar
          </Button>
        </form>
      )}
      {t.timeEntries && t.timeEntries.length > 0 && (
        <ul className="divide-y divide-border text-xs">
          {t.timeEntries.map((e) => (
            <li key={e.id} className="py-1.5">
              <span className="font-medium">{e.minutes} min</span> · {e.user.fullName} ·{' '}
              {e.workDate}
              {e.note && <span className="block text-muted">{e.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
