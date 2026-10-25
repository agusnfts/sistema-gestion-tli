import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Unlink } from 'lucide-react';
import {
  CURRENCIES,
  IMPROVEMENT_STATUSES,
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_SYSTEMS,
  IMPROVEMENT_SYSTEM_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  improvementPriority,
  isImprovementFinal,
  type ChangeImprovementStatusResponse,
  type ImprovementDetail,
  type ImprovementStatus,
  type Paginated,
  type ProblemListItem,
  type UserRef,
} from '@tli/shared';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, Spinner } from '@/components/ui/misc';
import { useCatalog } from '@/features/admin/api-hooks';
import { AddTicketsCard } from '@/features/tickets/AddTicketsCard';
import { WorkLogCard } from '@/features/work-log/WorkLogCard';
import { useClientOptions } from '@/features/integrations/components';
import { StatusBadge } from '@/features/tickets/ui';
import { errorText, ProblemStatusBadge } from '@/features/problems/components';
import {
  CloseImprovementDialog,
  ImprovementStatusBadge,
  LevelSelect,
  textareaClass,
} from './components';

const FIELD_LABELS: Record<string, string> = {
  title: 'el título',
  system: 'el sistema',
  requestingAreaId: 'el área',
  currentSituation: 'la situación actual',
  proposal: 'la propuesta',
  expectedImpact: 'el impacto esperado',
  impact: 'el impacto',
  effort: 'el esfuerzo',
  priority: 'la prioridad',
  ownerId: 'el responsable',
  providerId: 'el proveedor',
  currency: 'la moneda',
  estimatedCost: 'el costo estimado',
  actualCost: 'el costo real',
  estimatedHours: 'las horas estimadas',
  actualHours: 'las horas reales',
  startDate: 'la fecha de inicio',
  targetDate: 'la fecha objetivo',
};

type TextDraft = {
  title: string;
  currentSituation: string;
  proposal: string;
  expectedImpact: string;
};
type PlanDraft = {
  startDate: string;
  targetDate: string;
  currency: string;
  estimatedCost: string;
  actualCost: string;
  estimatedHours: string;
  actualHours: string;
};

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function ImprovementDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const can = useHasPermission();
  const canManage = can('improvement.manage');
  const key = ['improvements', 'detail', id];
  const improvement = useQuery({
    queryKey: key,
    queryFn: () => api<ImprovementDetail>(`/improvements/${id}`),
  });
  const staff = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: () => api<UserRef[]>('/tickets/assignees'),
    enabled: canManage,
  });
  const providers = useCatalog('providers');
  const areas = useCatalog('areas');

  const [text, setText] = useState<TextDraft | null>(null);
  const [plan, setPlan] = useState<PlanDraft | null>(null);
  const [closing, setClosing] = useState<'IMPLEMENTED' | 'DISCARDED' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const i = improvement.data;
    if (!i) return;
    setText({
      title: i.title,
      currentSituation: i.currentSituation,
      proposal: i.proposal,
      expectedImpact: i.expectedImpact ?? '',
    });
    setPlan({
      startDate: i.startDate ?? '',
      targetDate: i.targetDate ?? '',
      currency: i.currency,
      estimatedCost: i.estimatedCost?.toString() ?? '',
      actualCost: i.actualCost?.toString() ?? '',
      estimatedHours: i.estimatedHours?.toString() ?? '',
      actualHours: i.actualHours?.toString() ?? '',
    });
  }, [improvement.data]);

  const refresh = (data: ImprovementDetail) => {
    qc.setQueryData(key, data);
    void qc.invalidateQueries({ queryKey: ['improvements', 'list'] });
    void qc.invalidateQueries({ queryKey: ['tickets'] });
    void qc.invalidateQueries({ queryKey: ['problems'] });
  };
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<ImprovementDetail>(`/improvements/${id}`, { method: 'PATCH', body }),
    onSuccess: refresh,
  });
  const status = useMutation({
    mutationFn: (body: { status: ImprovementStatus; closingMessage?: string }) =>
      api<ChangeImprovementStatusResponse>(`/improvements/${id}/status`, { method: 'POST', body }),
    onSuccess: (res) => {
      refresh(res.improvement);
      setClosing(null);
      setNotice(
        res.closedTickets
          ? `Se cerraron ${res.closedTickets} ticket(s) y se avisó a sus solicitantes.`
          : null,
      );
    },
  });
  const linkTicket = useMutation({
    mutationFn: (ticketId: string) =>
      api<ImprovementDetail>(`/improvements/${id}/tickets`, {
        method: 'POST',
        body: { ticketIds: [ticketId] },
      }),
    onSuccess: refresh,
  });
  const unlinkTicket = useMutation({
    mutationFn: (ticketId: string) =>
      api<ImprovementDetail>(`/improvements/${id}/tickets/${ticketId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const linkProblem = useMutation({
    mutationFn: (problemId: string) =>
      api<ImprovementDetail>(`/improvements/${id}/problems`, {
        method: 'POST',
        body: { problemIds: [problemId] },
      }),
    onSuccess: refresh,
  });
  const unlinkProblem = useMutation({
    mutationFn: (problemId: string) =>
      api<ImprovementDetail>(`/improvements/${id}/problems/${problemId}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  if (improvement.isLoading) return <Spinner />;
  if (!improvement.data || !text || !plan)
    return <Alert tone="warning" title="No encontramos la mejora" />;
  const i = improvement.data;
  const closed = isImprovementFinal(i.status);
  const editable = canManage && !closed;
  const error =
    save.error ??
    (closing ? null : status.error) ??
    linkTicket.error ??
    unlinkTicket.error ??
    linkProblem.error ??
    unlinkProblem.error;
  const textDirty =
    text.title !== i.title ||
    text.currentSituation !== i.currentSituation ||
    text.proposal !== i.proposal ||
    text.expectedImpact !== (i.expectedImpact ?? '');
  const planDirty =
    plan.startDate !== (i.startDate ?? '') ||
    plan.targetDate !== (i.targetDate ?? '') ||
    plan.currency !== i.currency ||
    plan.estimatedCost !== (i.estimatedCost?.toString() ?? '') ||
    plan.actualCost !== (i.actualCost?.toString() ?? '') ||
    plan.estimatedHours !== (i.estimatedHours?.toString() ?? '') ||
    plan.actualHours !== (i.actualHours?.toString() ?? '');

  return (
    <>
      <Link
        to="/mejoras"
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Mejoras
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted">
            {i.code} · {IMPROVEMENT_SYSTEM_LABELS[i.system]}
            {i.requestingArea && ` · ${i.requestingArea.name}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand">{i.title}</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          {editable ? (
            <Select
              aria-label="Estado de la mejora"
              className="w-auto font-medium"
              value={i.status}
              disabled={status.isPending}
              onChange={(e) => {
                const next = e.target.value as ImprovementStatus;
                if (next === 'IMPLEMENTED' || next === 'DISCARDED') setClosing(next);
                else status.mutate({ status: next });
              }}
            >
              {IMPROVEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {IMPROVEMENT_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          ) : (
            <ImprovementStatusBadge status={i.status} />
          )}
          {editable && (
            <span className="text-xs text-muted">Implementar o descartar cierra los tickets</span>
          )}
        </div>
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
          {closed && i.closingMessage && (
            <Card className="p-5">
              <h2 className="font-semibold">
                {i.status === 'IMPLEMENTED' ? 'Implementada' : 'Descartada'}
                {i.completedAt && (
                  <span className="font-normal text-muted"> · {formatDateTime(i.completedAt)}</span>
                )}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{i.closingMessage}</p>
            </Card>
          )}

          <Card className="space-y-4 p-5">
            <p className="text-xs text-muted">
              Creada por {i.createdBy.fullName} · {formatDateTime(i.createdAt)}
            </p>
            {canManage && (
              <Field label="Título">
                {(fp) => (
                  <Input
                    {...fp}
                    disabled={!editable}
                    value={text.title}
                    onChange={(e) => setText({ ...text, title: e.target.value })}
                  />
                )}
              </Field>
            )}
            {(
              [
                ['currentSituation', 'Situación actual'],
                ['proposal', 'Propuesta'],
                ['expectedImpact', 'Impacto esperado'],
              ] as const
            ).map(([field, label]) => (
              <Field key={field} label={label}>
                {(fp) => (
                  <textarea
                    {...fp}
                    rows={3}
                    disabled={!editable}
                    className={textareaClass}
                    value={text[field]}
                    onChange={(e) => setText({ ...text, [field]: e.target.value })}
                  />
                )}
              </Field>
            ))}
            {editable && (
              <Button
                disabled={!textDirty}
                loading={save.isPending}
                onClick={() =>
                  save.mutate({
                    title: text.title,
                    currentSituation: text.currentSituation,
                    proposal: text.proposal,
                    expectedImpact: text.expectedImpact || null,
                  })
                }
              >
                Guardar
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 font-semibold">
              Tickets derivados <span className="text-muted">({i.ticketCount})</span>
            </h2>
            <p className="mb-3 text-xs text-muted">
              Esperan a que la mejora se implemente o se descarte; ahí se cierran con el mensaje de
              cierre.
            </p>
            {i.tickets.length === 0 ? (
              <p className="text-sm text-muted">No hay tickets derivados.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {i.tickets.map((t) => (
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
                      {editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Quitar ${t.number} de la mejora`}
                          title="Quitar de la mejora (vuelve a En curso)"
                          onClick={() => unlinkTicket.mutate(t.id)}
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

          {editable && (
            <AddTicketsCard
              description="Buscá tickets abiertos para derivarlos a esta mejora. El solicitante recibe un aviso."
              meta={(t) => (t.problem ? `En ${t.problem.code}` : null)}
              linkedIds={i.tickets.map((t) => t.id)}
              pendingId={linkTicket.isPending ? linkTicket.variables : undefined}
              onLink={(ticketId) => linkTicket.mutate(ticketId)}
            />
          )}

          <ProblemsCard
            improvement={i}
            editable={editable}
            showProblems={can('problem.read')}
            onLink={(problemId) => linkProblem.mutate(problemId)}
            onUnlink={(problemId) => unlinkProblem.mutate(problemId)}
            linking={linkProblem.isPending}
          />

          {can('client.read') && (
            <ClientsCard improvement={i} editable={canManage} onSaved={refresh} />
          )}

          <WorkLogCard<ImprovementDetail>
            entries={i.actions}
            endpoint={`/improvements/${id}/actions`}
            canAdd={canManage}
            placeholder="Qué se hizo: reunión con el proveedor, cotización, prueba en QA, puesta en producción…"
            onSaved={refresh}
          />

          <Card className="p-5">
            <h2 className="mb-2 font-semibold">Historial</h2>
            <ol className="space-y-1 text-xs text-muted">
              {i.activity.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.actor?.fullName ?? 'Sistema'}</span>{' '}
                  {a.kind === 'CREATED'
                    ? 'creó la mejora'
                    : a.field === 'status'
                      ? `la pasó a "${IMPROVEMENT_STATUS_LABELS[a.newValue as ImprovementStatus] ?? a.newValue}"`
                      : a.kind === 'LINKED'
                        ? `derivó ${a.newValue} ticket(s)`
                        : a.kind === 'UNLINKED'
                          ? 'quitó un ticket'
                          : `cambió ${FIELD_LABELS[a.field ?? ''] ?? 'la mejora'}`}{' '}
                  · {formatDateTime(a.occurredAt)}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="order-first space-y-4 lg:order-none">
          <Card className="space-y-4 p-4 text-sm">
            <Field
              label="Prioridad"
              hint={
                i.priorityIsManual
                  ? 'Fijada a mano.'
                  : 'Sugerida por impacto y esfuerzo (mucho impacto con poco esfuerzo va primero).'
              }
            >
              {(fp) => (
                <Select
                  {...fp}
                  disabled={!canManage || save.isPending}
                  value={i.priorityIsManual ? i.priority : ''}
                  onChange={(e) => save.mutate({ priority: e.target.value || null })}
                >
                  <option value="">
                    Automática ({PRIORITY_LABELS[improvementPriority(i.impact, i.effort)]})
                  </option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Impacto">
                {(fp) => (
                  <LevelSelect
                    {...fp}
                    disabled={!canManage || save.isPending}
                    value={i.impact}
                    onChange={(impact) => save.mutate({ impact })}
                  />
                )}
              </Field>
              <Field label="Esfuerzo">
                {(fp) => (
                  <LevelSelect
                    {...fp}
                    disabled={!canManage || save.isPending}
                    value={i.effort}
                    onChange={(effort) => save.mutate({ effort })}
                  />
                )}
              </Field>
            </div>
            <Field label="Sistema">
              {(fp) => (
                <Select
                  {...fp}
                  disabled={!canManage || save.isPending}
                  value={i.system}
                  onChange={(e) => save.mutate({ system: e.target.value })}
                >
                  {IMPROVEMENT_SYSTEMS.map((s) => (
                    <option key={s} value={s}>
                      {IMPROVEMENT_SYSTEM_LABELS[s]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Responsable">
              {(fp) => (
                <Select
                  {...fp}
                  disabled={!canManage || save.isPending}
                  value={i.owner?.id ?? ''}
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
            <Field label="Proveedor">
              {(fp) => (
                <Select
                  {...fp}
                  disabled={!canManage || save.isPending}
                  value={i.provider?.id ?? ''}
                  onChange={(e) => save.mutate({ providerId: e.target.value || null })}
                >
                  <option value="">Sin definir</option>
                  {providers.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Área que lo pide">
              {(fp) => (
                <Select
                  {...fp}
                  disabled={!canManage || save.isPending}
                  value={i.requestingArea?.id ?? ''}
                  onChange={(e) => save.mutate({ requestingAreaId: e.target.value || null })}
                >
                  <option value="">Sin área</option>
                  {areas.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </Card>

          <Card className="space-y-3 p-4 text-sm">
            <h2 className="font-semibold">Plan y costos</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inicio">
                {(fp) => (
                  <Input
                    {...fp}
                    type="date"
                    disabled={!canManage}
                    value={plan.startDate}
                    onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Objetivo">
                {(fp) => (
                  <Input
                    {...fp}
                    type="date"
                    disabled={!canManage}
                    value={plan.targetDate}
                    onChange={(e) => setPlan({ ...plan, targetDate: e.target.value })}
                  />
                )}
              </Field>
            </div>
            <Field label="Moneda">
              {(fp) => (
                <Select
                  {...fp}
                  disabled={!canManage}
                  value={plan.currency}
                  onChange={(e) => setPlan({ ...plan, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ['estimatedCost', 'Costo estimado'],
                  ['actualCost', 'Costo real'],
                  ['estimatedHours', 'Horas estimadas'],
                  ['actualHours', 'Horas reales'],
                ] as const
              ).map(([field, label]) => (
                <Field key={field} label={label}>
                  {(fp) => (
                    <Input
                      {...fp}
                      inputMode="decimal"
                      disabled={!canManage}
                      value={plan[field]}
                      onChange={(e) => setPlan({ ...plan, [field]: e.target.value })}
                    />
                  )}
                </Field>
              ))}
            </div>
            {canManage && (
              <Button
                size="sm"
                disabled={!planDirty}
                loading={save.isPending}
                onClick={() =>
                  save.mutate({
                    startDate: plan.startDate || null,
                    targetDate: plan.targetDate || null,
                    currency: plan.currency,
                    estimatedCost: numOrNull(plan.estimatedCost),
                    actualCost: numOrNull(plan.actualCost),
                    estimatedHours: numOrNull(plan.estimatedHours),
                    actualHours: numOrNull(plan.actualHours),
                  })
                }
              >
                Guardar plan
              </Button>
            )}
          </Card>
        </aside>
      </div>

      {closing && (
        <CloseImprovementDialog
          improvement={i}
          status={closing}
          loading={status.isPending}
          error={status.error}
          onClose={() => setClosing(null)}
          onConfirm={(closingMessage) => status.mutate({ status: closing, closingMessage })}
        />
      )}
    </>
  );
}

function ProblemsCard({
  improvement: i,
  editable,
  showProblems,
  linking,
  onLink,
  onUnlink,
}: {
  improvement: ImprovementDetail;
  editable: boolean;
  showProblems: boolean;
  linking: boolean;
  onLink: (problemId: string) => void;
  onUnlink: (problemId: string) => void;
}) {
  const [problemId, setProblemId] = useState('');
  const open = useQuery({
    queryKey: ['problems', 'open-options'],
    queryFn: () =>
      api<Paginated<ProblemListItem>>('/problems', { query: { state: 'open', pageSize: 100 } }),
    enabled: editable && showProblems,
  });
  if (!showProblems) return null;
  const linked = new Set(i.problems.map((p) => p.id));
  const options = open.data?.items.filter((p) => !linked.has(p.id)) ?? [];

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Problemas relacionados</h2>
      {i.problems.length === 0 ? (
        <p className="text-sm text-muted">Ninguno.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {i.problems.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link to={`/problemas/${p.id}`} className="min-w-0 hover:underline">
                <span className="font-mono text-xs text-muted">{p.code}</span> {p.title}
              </Link>
              <div className="flex items-center gap-2">
                <ProblemStatusBadge status={p.status} />
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Desvincular ${p.code}`}
                    onClick={() => onUnlink(p.id)}
                  >
                    <Unlink className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Vincular un problema abierto" hint="Sus tickets abiertos se derivan.">
              {(fp) => (
                <Select {...fp} value={problemId} onChange={(e) => setProblemId(e.target.value)}>
                  <option value="">Elegí un problema</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Button
            variant="secondary"
            disabled={!problemId}
            loading={linking}
            onClick={() => {
              onLink(problemId);
              setProblemId('');
            }}
          >
            Vincular
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Clientes a los que apunta la mejora: la mejora aparece en la ficha de cada uno. */
function ClientsCard({
  improvement: i,
  editable,
  onSaved,
}: {
  improvement: ImprovementDetail;
  editable: boolean;
  onSaved: (d: ImprovementDetail) => void;
}) {
  const [clientId, setClientId] = useState('');
  const clients = useClientOptions(editable);
  const link = useMutation({
    mutationFn: (id: string) =>
      api<ImprovementDetail>(`/improvements/${i.id}/clients`, {
        method: 'POST',
        body: { clientIds: [id] },
      }),
    onSuccess: (d) => {
      setClientId('');
      onSaved(d);
    },
  });
  const unlink = useMutation({
    mutationFn: (id: string) =>
      api<ImprovementDetail>(`/improvements/${i.id}/clients/${id}`, { method: 'DELETE' }),
    onSuccess: onSaved,
  });
  const linked = new Set(i.clients.map((c) => c.id));
  const error = link.error ?? unlink.error;

  return (
    <Card className="p-5">
      <h2 className="mb-3 font-semibold">Clientes</h2>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{errorText(error)}</Alert>
        </div>
      )}
      {i.clients.length === 0 ? (
        <p className="text-sm text-muted">No apunta a un cliente en particular.</p>
      ) : (
        <ul className="flex flex-wrap gap-2 text-sm">
          {i.clients.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-md bg-bg py-1 pl-2 pr-1">
              <Link to={`/clientes/${c.id}`} className="hover:underline">
                {c.shortName ?? c.legalName}
              </Link>
              {editable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1"
                  aria-label={`Quitar ${c.shortName ?? c.legalName}`}
                  onClick={() => unlink.mutate(c.id)}
                >
                  <Unlink className="size-3.5" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Agregar cliente">
              {(fp) => (
                <Select {...fp} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">Elegí un cliente</option>
                  {clients.data
                    ?.filter((c) => !linked.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.shortName ?? c.legalName}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
          <Button
            variant="secondary"
            disabled={!clientId}
            loading={link.isPending}
            onClick={() => link.mutate(clientId)}
          >
            Agregar
          </Button>
        </div>
      )}
    </Card>
  );
}
