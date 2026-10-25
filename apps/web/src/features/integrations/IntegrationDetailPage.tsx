import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, History, Trash2, Unlink } from 'lucide-react';
import {
  CURRENCIES,
  INTEGRATION_CHANNELS,
  INTEGRATION_CHANNEL_LABELS,
  INTEGRATION_COUNTERPART_TYPE_LABELS,
  INTEGRATION_FLOWS,
  INTEGRATION_FLOW_LABELS,
  INTEGRATION_FORMATS,
  INTEGRATION_FORMAT_LABELS,
  INTEGRATION_STATUSES,
  INTEGRATION_STATUS_LABELS,
  NOT_DONE_REASON_LABELS,
  isIntegrationFinal,
  type ChangeIntegrationStatusResponse,
  type Currency,
  type IntegrationDetail,
  type IntegrationStatus,
  type UserRef,
} from '@tli/shared';
import { api } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { useHasPermission } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { Alert, Card, Spinner } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { isRichTextEmpty, RichText, RichTextEditor } from '@/components/ui/rich-text';
import { useCatalog } from '@/features/admin/api-hooks';
import { processList, systemList } from './IntegrationsPage';
import { AddTicketsCard } from '@/features/tickets/AddTicketsCard';
import { StatusBadge } from '@/features/tickets/ui';
import { errorText } from '@/features/problems/components';
import { WorkLogCard } from '@/features/work-log/WorkLogCard';
import { DocumentsCard } from '@/features/documents/DocumentsCard';
import {
  AttachmentList,
  AttachmentPicker,
  useAttachmentUploads,
} from '@/features/attachments/attachments';
import {
  CloseIntegrationDialog,
  IntegrationScopeFields,
  IntegrationStatusBadge,
  useClientOptions,
} from './components';

const TABS = [
  { id: 'how', label: 'Cómo funciona' },
  { id: 'tech', label: 'Datos técnicos' },
  { id: 'quotes', label: 'Cotizaciones' },
  { id: 'docs', label: 'Documentos' },
  { id: 'follow', label: 'Seguimiento' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const money = (amount: number, currency: Currency) =>
  `${currency} ${amount.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
const formatDay = (iso: string) => iso.split('-').reverse().join('/');

export function IntegrationDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const can = useHasPermission();
  const canManage = can('integration.manage');
  const key = ['integrations', 'detail', id];
  const integration = useQuery({
    queryKey: key,
    queryFn: () => api<IntegrationDetail>(`/integrations/${id}`),
  });
  const [tab, setTab] = useState<Tab>('how');
  const [closing, setClosing] = useState<'COMPLETED' | 'NOT_DONE' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = (data: IntegrationDetail) => {
    qc.setQueryData(key, data);
    void qc.invalidateQueries({ queryKey: ['integrations', 'list'] });
    void qc.invalidateQueries({ queryKey: ['tickets'] });
    void qc.invalidateQueries({ queryKey: ['clients'] });
  };
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<IntegrationDetail>(`/integrations/${id}`, { method: 'PATCH', body }),
    onSuccess: refresh,
  });
  const status = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<ChangeIntegrationStatusResponse>(`/integrations/${id}/status`, {
        method: 'POST',
        body,
      }),
    onSuccess: (res) => {
      refresh(res.integration);
      setClosing(null);
      setNotice(
        res.closedTickets
          ? `Se cerraron ${res.closedTickets} ticket(s) y se avisó a sus solicitantes.`
          : null,
      );
    },
  });

  if (integration.isLoading) return <Spinner />;
  if (!integration.data) return <Alert tone="warning" title="No encontramos la integración" />;
  const i = integration.data;
  const closed = isIntegrationFinal(i.status);
  const error = save.error ?? (closing ? null : status.error);

  return (
    <>
      <Link
        to="/integraciones"
        className="mb-3 inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> Integraciones
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted">
            {i.code} · {INTEGRATION_COUNTERPART_TYPE_LABELS[i.counterpartType]}{' '}
            {i.client ? (
              <Link to={`/clientes/${i.client.id}`} className="text-brand hover:underline">
                {i.counterpartLabel}
              </Link>
            ) : (
              i.counterpartLabel
            )}{' '}
            {i.platforms.length > 0 && ` (${i.platforms.map((p) => p.name).join(', ')})`} ·{' '}
            {processList(i)} · {systemList(i)}
            {i.direction && ` · ${INTEGRATION_FLOW_LABELS[i.direction]}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-brand">{i.name}</h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          {canManage && !closed ? (
            <Select
              aria-label="Estado de la integración"
              className="w-auto font-medium"
              value={i.status}
              disabled={status.isPending}
              onChange={(e) => {
                const next = e.target.value as IntegrationStatus;
                if (next === 'COMPLETED' || next === 'NOT_DONE') setClosing(next);
                else status.mutate({ status: next });
              }}
            >
              {INTEGRATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INTEGRATION_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          ) : (
            <IntegrationStatusBadge status={i.status} />
          )}
          {i.notDoneReason && (
            <span className="text-xs text-muted">
              {NOT_DONE_REASON_LABELS[i.notDoneReason]}
              {i.notDoneNotes && ` · ${i.notDoneNotes}`}
            </span>
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
                {INTEGRATION_STATUS_LABELS[i.status]}
                {i.completedAt && (
                  <span className="font-normal text-muted"> · {formatDateTime(i.completedAt)}</span>
                )}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{i.closingMessage}</p>
            </Card>
          )}

          <div
            role="tablist"
            aria-label="Secciones"
            className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-sm',
                  tab === t.id
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-muted hover:bg-panel',
                )}
              >
                {t.label}
                {t.id === 'quotes' && i.quotes.length > 0 && ` (${i.quotes.length})`}
                {t.id === 'docs' && i.documents.length > 0 && ` (${i.documents.length})`}
              </button>
            ))}
          </div>

          {tab === 'how' && (
            <HowItWorksCard integration={i} canManage={canManage} onSaved={refresh} />
          )}
          {tab === 'tech' && (
            <TechCard
              integration={i}
              canManage={canManage}
              saving={save.isPending}
              onSave={save.mutate}
            />
          )}
          {tab === 'quotes' && (
            <QuotesCard integration={i} canManage={canManage} onSaved={refresh} />
          )}
          {tab === 'docs' && (
            <DocumentsCard
              documents={i.documents}
              endpoint={`/integrations/${id}/documents`}
              canManage={canManage}
              onChanged={() => void qc.invalidateQueries({ queryKey: key })}
            />
          )}
          {tab === 'follow' && (
            <FollowUp integration={i} canManage={canManage} closed={closed} onSaved={refresh} />
          )}
        </div>

        <aside className="order-first space-y-4 lg:order-none">
          <ProjectCard
            integration={i}
            canManage={canManage}
            saving={save.isPending}
            onSave={save.mutate}
          />
        </aside>
      </div>

      {closing && (
        <CloseIntegrationDialog
          integration={i}
          status={closing}
          loading={status.isPending}
          error={status.error}
          onClose={() => setClosing(null)}
          onConfirm={(body) => status.mutate({ status: closing, ...body })}
        />
      )}
    </>
  );
}

function HowItWorksCard({
  integration: i,
  canManage,
  onSaved,
}: {
  integration: IntegrationDetail;
  canManage: boolean;
  onSaved: (d: IntegrationDetail) => void;
}) {
  const [draft, setDraft] = useState(i.howItWorks);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  useEffect(() => setDraft(i.howItWorks), [i.howItWorks]);
  const save = useMutation({
    mutationFn: () =>
      api<IntegrationDetail>(`/integrations/${i.id}/how-it-works`, {
        method: 'POST',
        body: { howItWorks: draft },
      }),
    onSuccess: (d) => {
      setEditing(false);
      onSaved(d);
    },
  });

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Cómo funciona</h2>
          <p className="text-xs text-muted">
            Lo que necesita saber quien la tenga que revisar o retomar.
          </p>
        </div>
        <div className="flex gap-1">
          {i.revisions.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setHistory(true)}>
              <History className="size-4" aria-hidden /> Historial ({i.revisions.length})
            </Button>
          )}
          {canManage && !editing && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
        </div>
      </div>
      {save.error && (
        <div className="mb-3">
          <Alert tone="danger">{errorText(save.error)}</Alert>
        </div>
      )}
      {editing ? (
        <div className="space-y-2">
          <RichTextEditor
            label="Cómo funciona"
            minHeight="18rem"
            value={draft}
            onChange={setDraft}
          />
          <div className="flex gap-2">
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>
              Guardar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(i.howItWorks);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-bg p-3 text-sm">
          {isRichTextEmpty(i.howItWorks) ? (
            <p className="text-muted">Sin completar.</p>
          ) : (
            <RichText value={i.howItWorks} />
          )}
        </div>
      )}
      {history && (
        <Dialog
          open
          wide
          onOpenChange={(o) => !o && setHistory(false)}
          title="Historial de “Cómo funciona”"
          description="Versiones anteriores, de la más nueva a la más vieja."
        >
          <ol className="max-h-[60vh] space-y-4 overflow-y-auto">
            {i.revisions.map((r) => (
              <li key={r.id}>
                <p className="mb-1 text-xs text-muted">
                  Reemplazada por {r.author.fullName} · {formatDateTime(r.createdAt)}
                </p>
                <div className="rounded-md bg-bg p-3 text-xs">
                  {isRichTextEmpty(r.howItWorks) ? '(vacío)' : <RichText value={r.howItWorks} />}
                </div>
              </li>
            ))}
          </ol>
        </Dialog>
      )}
    </Card>
  );
}

function TechCard({
  integration: i,
  canManage,
  saving,
  onSave,
}: {
  integration: IntegrationDetail;
  canManage: boolean;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const clients = useClientOptions(canManage);
  const initial = () => ({
    name: i.name,
    clientId: i.client?.id ?? '',
    counterpartName: i.counterpartName ?? '',
    processes: i.processes,
    systems: i.systems,
    platformIds: i.platforms.map((p) => p.id),
    direction: i.direction ?? '',
    channel: i.channel ?? '',
    format: i.format ?? '',
    frequency: i.frequency ?? '',
    location: i.location ?? '',
    requiresDevelopment: i.requiresDevelopment,
  });
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial()), [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const disabled = !canManage;

  return (
    <Card className="space-y-4 p-5">
      <h2 className="font-semibold">Datos técnicos</h2>
      <Field label="Nombre">
        {(p) => (
          <Input
            {...p}
            disabled={disabled}
            value={f.name}
            onChange={(e) => set('name', e.target.value)}
          />
        )}
      </Field>
      {i.counterpartType === 'CLIENT' ? (
        <Field label="Cliente">
          {(p) => (
            <Select
              {...p}
              disabled={disabled}
              value={f.clientId}
              onChange={(e) => set('clientId', e.target.value)}
            >
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.shortName ?? c.legalName}
                </option>
              )) ?? <option value={f.clientId}>{i.counterpartLabel}</option>}
            </Select>
          )}
        </Field>
      ) : (
        <Field label={INTEGRATION_COUNTERPART_TYPE_LABELS[i.counterpartType]}>
          {(p) => (
            <Input
              {...p}
              disabled={disabled}
              value={f.counterpartName}
              onChange={(e) => set('counterpartName', e.target.value)}
            />
          )}
        </Field>
      )}
      <IntegrationScopeFields
        disabled={disabled}
        processes={f.processes}
        systems={f.systems}
        platformIds={f.platformIds}
        onChange={(patch) => setF((x) => ({ ...x, ...patch }))}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sentido">
          {(p) => (
            <Select
              {...p}
              disabled={disabled}
              value={f.direction}
              onChange={(e) => set('direction', e.target.value as typeof f.direction)}
            >
              <option value="">A definir</option>
              {INTEGRATION_FLOWS.map((x) => (
                <option key={x} value={x}>
                  {INTEGRATION_FLOW_LABELS[x]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Canal">
          {(p) => (
            <Select
              {...p}
              disabled={disabled}
              value={f.channel}
              onChange={(e) => set('channel', e.target.value as typeof f.channel)}
            >
              <option value="">A definir</option>
              {INTEGRATION_CHANNELS.map((x) => (
                <option key={x} value={x}>
                  {INTEGRATION_CHANNEL_LABELS[x]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Formato">
          {(p) => (
            <Select
              {...p}
              disabled={disabled}
              value={f.format}
              onChange={(e) => set('format', e.target.value as typeof f.format)}
            >
              <option value="">A definir</option>
              {INTEGRATION_FORMATS.map((x) => (
                <option key={x} value={x}>
                  {INTEGRATION_FORMAT_LABELS[x]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Frecuencia" hint="Ej.: cada 15 minutos, diaria a las 6.">
          {(p) => (
            <Input
              {...p}
              disabled={disabled}
              value={f.frequency}
              onChange={(e) => set('frequency', e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Ubicación" hint="Carpeta, endpoint o casilla de mail.">
        {(p) => (
          <Input
            {...p}
            disabled={disabled}
            value={f.location}
            onChange={(e) => set('location', e.target.value)}
          />
        )}
      </Field>
      <Checkbox
        label="Requiere desarrollo"
        disabled={disabled}
        checked={f.requiresDevelopment}
        onChange={(e) => set('requiresDevelopment', e.target.checked)}
      />
      {canManage && (
        <Button
          loading={saving}
          onClick={() =>
            onSave({
              name: f.name,
              ...(i.counterpartType === 'CLIENT'
                ? { clientId: f.clientId || null }
                : { counterpartName: f.counterpartName }),
              processes: f.processes,
              systems: f.systems,
              platformIds: f.platformIds,
              direction: f.direction || null,
              channel: f.channel || null,
              format: f.format || null,
              frequency: f.frequency,
              location: f.location,
              requiresDevelopment: f.requiresDevelopment,
            })
          }
        >
          Guardar datos técnicos
        </Button>
      )}
    </Card>
  );
}

function QuotesCard({
  integration: i,
  canManage,
  onSaved,
}: {
  integration: IntegrationDetail;
  canManage: boolean;
  onSaved: (d: IntegrationDetail) => void;
}) {
  const [adding, setAdding] = useState(false);
  const select = useMutation({
    mutationFn: (quoteId: string | null) =>
      api<IntegrationDetail>(`/integrations/${i.id}/quotes/select`, {
        method: 'POST',
        body: { quoteId },
      }),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: (quoteId: string) =>
      api<IntegrationDetail>(`/integrations/${i.id}/quotes/${quoteId}`, { method: 'DELETE' }),
    onSuccess: onSaved,
  });
  const error = select.error ?? remove.error;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Cotizaciones</h2>
          <p className="text-xs text-muted">La elegida define el costo estimado.</p>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Agregar cotización
          </Button>
        )}
      </div>
      {error && (
        <div className="mb-3">
          <Alert tone="danger">{errorText(error)}</Alert>
        </div>
      )}
      {i.quotes.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay cotizaciones.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {i.quotes.map((q) => (
            <li
              key={q.id}
              className={cn('py-3', q.isSelected && 'rounded-md bg-success-soft px-2')}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {q.provider.name} · {money(q.amount, q.currency)}
                    {q.estimatedHours !== null && (
                      <span className="font-normal text-muted"> · {q.estimatedHours} h</span>
                    )}
                    {q.isSelected && (
                      <span className="ml-2 text-xs font-medium text-success">Elegida</span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {formatDay(q.quotedAt)} · cargada por {q.createdBy.fullName}
                  </p>
                  {q.notes && <p className="mt-1 text-xs">{q.notes}</p>}
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={q.isSelected ? 'ghost' : 'secondary'}
                      loading={
                        select.isPending && select.variables === (q.isSelected ? null : q.id)
                      }
                      onClick={() => select.mutate(q.isSelected ? null : q.id)}
                    >
                      <Check className="size-4" aria-hidden />
                      {q.isSelected ? 'Desmarcar' : 'Elegir'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Borrar cotización de ${q.provider.name}`}
                      onClick={() => remove.mutate(q.id)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
              {q.attachments.length > 0 && (
                <div className="mt-2">
                  <AttachmentList items={q.attachments} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <QuoteDialog
          integrationId={i.id}
          onClose={() => setAdding(false)}
          onSaved={(d) => {
            setAdding(false);
            onSaved(d);
          }}
        />
      )}
    </Card>
  );
}

function QuoteDialog({
  integrationId,
  onClose,
  onSaved,
}: {
  integrationId: string;
  onClose: () => void;
  onSaved: (d: IntegrationDetail) => void;
}) {
  const providers = useCatalog('providers');
  const files = useAttachmentUploads();
  const [f, setF] = useState({
    providerId: '',
    amount: '',
    currency: 'ARS' as Currency,
    estimatedHours: '',
    quotedAt: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      api<IntegrationDetail>(`/integrations/${integrationId}/quotes`, {
        method: 'POST',
        body: {
          providerId: f.providerId,
          amount: numOrNull(f.amount) ?? -1,
          currency: f.currency,
          estimatedHours: numOrNull(f.estimatedHours),
          quotedAt: f.quotedAt,
          notes: f.notes,
          attachmentIds: files.ids,
        },
      }),
    onSuccess: onSaved,
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nueva cotización"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!f.providerId || !f.amount || files.uploading}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4" onPaste={files.onPaste}>
        {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
        <Field label="Proveedor" required>
          {(p) => (
            <Select {...p} value={f.providerId} onChange={(e) => set('providerId', e.target.value)}>
              <option value="">Elegí el proveedor</option>
              {providers.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Monto" required>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={f.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            )}
          </Field>
          <Field label="Moneda">
            {(p) => (
              <Select
                {...p}
                value={f.currency}
                onChange={(e) => set('currency', e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas estimadas">
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={f.estimatedHours}
                onChange={(e) => set('estimatedHours', e.target.value)}
              />
            )}
          </Field>
          <Field label="Fecha" required>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={f.quotedAt}
                onChange={(e) => set('quotedAt', e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Notas">
          {(p) => <Input {...p} value={f.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
        <AttachmentPicker state={files} compact />
      </div>
    </Dialog>
  );
}

function FollowUp({
  integration: i,
  canManage,
  closed,
  onSaved,
}: {
  integration: IntegrationDetail;
  canManage: boolean;
  closed: boolean;
  onSaved: (d: IntegrationDetail) => void;
}) {
  const editable = canManage && !closed;
  const link = useMutation({
    mutationFn: (ticketId: string) =>
      api<IntegrationDetail>(`/integrations/${i.id}/tickets`, {
        method: 'POST',
        body: { ticketIds: [ticketId] },
      }),
    onSuccess: onSaved,
  });
  const unlink = useMutation({
    mutationFn: (ticketId: string) =>
      api<IntegrationDetail>(`/integrations/${i.id}/tickets/${ticketId}`, { method: 'DELETE' }),
    onSuccess: onSaved,
  });
  const error = link.error ?? unlink.error;

  return (
    <>
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">
          Tickets derivados <span className="text-muted">({i.ticketCount})</span>
        </h2>
        <p className="mb-3 text-xs text-muted">
          Se cierran con el mensaje de cierre cuando la integración queda finalizada o no realizada.
        </p>
        {error && (
          <div className="mb-3">
            <Alert tone="danger">{errorText(error)}</Alert>
          </div>
        )}
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
                      aria-label={`Quitar ${t.number} de la integración`}
                      title="Quitar de la integración (vuelve a En curso)"
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
      {editable && (
        <AddTicketsCard
          description="Buscá tickets abiertos (por ejemplo, otro pedido por la misma integración) para derivarlos."
          linkedIds={i.tickets.map((t) => t.id)}
          pendingId={link.isPending ? link.variables : undefined}
          onLink={(ticketId) => link.mutate(ticketId)}
        />
      )}
      <WorkLogCard<IntegrationDetail>
        entries={i.actions}
        endpoint={`/integrations/${i.id}/actions`}
        canAdd={canManage}
        placeholder="Qué se hizo: relevamiento, reunión con el cliente, pruebas, puesta en marcha…"
        onSaved={onSaved}
      />
      <Card className="p-5">
        <h2 className="mb-2 font-semibold">Historial</h2>
        <ol className="space-y-1 text-xs text-muted">
          {i.activity.map((a) => (
            <li key={a.id}>
              <span className="font-medium">{a.actor?.fullName ?? 'Sistema'}</span>{' '}
              {a.kind === 'CREATED'
                ? 'creó la integración'
                : a.field === 'status'
                  ? `la pasó a "${INTEGRATION_STATUS_LABELS[a.newValue as IntegrationStatus] ?? a.newValue}"`
                  : a.kind === 'LINKED'
                    ? `derivó ${a.newValue} ticket(s)`
                    : a.kind === 'UNLINKED'
                      ? 'quitó un ticket'
                      : `cambió ${a.field ?? 'un dato'}`}{' '}
              · {formatDateTime(a.occurredAt)}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function ProjectCard({
  integration: i,
  canManage,
  saving,
  onSave,
}: {
  integration: IntegrationDetail;
  canManage: boolean;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const staff = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: () => api<UserRef[]>('/tickets/assignees'),
    enabled: canManage,
  });
  const initial = () => ({
    startDate: i.startDate ?? '',
    targetDate: i.targetDate ?? '',
    goLiveDate: i.goLiveDate ?? '',
    currency: i.currency,
    estimatedHours: i.estimatedHours?.toString() ?? '',
    actualHours: i.actualHours?.toString() ?? '',
    actualCost: i.actualCost?.toString() ?? '',
  });
  const [p, setP] = useState(initial);
  useEffect(() => setP(initial()), [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof p>(k: K, v: (typeof p)[K]) => setP((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(p) !== JSON.stringify(initial());

  return (
    <Card className="space-y-3 p-4 text-sm">
      <h2 className="font-semibold">Proyecto</h2>
      <div>
        <p className="text-xs text-muted">Costo estimado (cotización elegida)</p>
        <p className="text-lg font-semibold">
          {i.estimatedCost ? money(i.estimatedCost.amount, i.estimatedCost.currency) : '—'}
        </p>
      </div>
      <Field label="Responsable">
        {(fp) => (
          <Select
            {...fp}
            disabled={!canManage || saving}
            value={i.owner?.id ?? ''}
            onChange={(e) => onSave({ ownerId: e.target.value || null })}
          >
            <option value="">Sin responsable</option>
            {(staff.data ?? (i.owner ? [i.owner] : [])).map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Inicio">
          {(fp) => (
            <Input
              {...fp}
              type="date"
              disabled={!canManage}
              value={p.startDate}
              onChange={(e) => set('startDate', e.target.value)}
            />
          )}
        </Field>
        <Field label="Objetivo">
          {(fp) => (
            <Input
              {...fp}
              type="date"
              disabled={!canManage}
              value={p.targetDate}
              onChange={(e) => set('targetDate', e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Puesta en marcha">
        {(fp) => (
          <Input
            {...fp}
            type="date"
            disabled={!canManage}
            value={p.goLiveDate}
            onChange={(e) => set('goLiveDate', e.target.value)}
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Horas estimadas">
          {(fp) => (
            <Input
              {...fp}
              inputMode="decimal"
              disabled={!canManage}
              value={p.estimatedHours}
              onChange={(e) => set('estimatedHours', e.target.value)}
            />
          )}
        </Field>
        <Field label="Horas reales">
          {(fp) => (
            <Input
              {...fp}
              inputMode="decimal"
              disabled={!canManage}
              value={p.actualHours}
              onChange={(e) => set('actualHours', e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Costo real">
          {(fp) => (
            <Input
              {...fp}
              inputMode="decimal"
              disabled={!canManage}
              value={p.actualCost}
              onChange={(e) => set('actualCost', e.target.value)}
            />
          )}
        </Field>
        <Field label="Moneda">
          {(fp) => (
            <Select
              {...fp}
              disabled={!canManage}
              value={p.currency}
              onChange={(e) => set('currency', e.target.value as Currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {canManage && (
        <Button
          size="sm"
          disabled={!dirty}
          loading={saving}
          onClick={() =>
            onSave({
              startDate: p.startDate || null,
              targetDate: p.targetDate || null,
              goLiveDate: p.goLiveDate || null,
              currency: p.currency,
              estimatedHours: numOrNull(p.estimatedHours),
              actualHours: numOrNull(p.actualHours),
              actualCost: numOrNull(p.actualCost),
            })
          }
        >
          Guardar proyecto
        </Button>
      )}
      <p className="text-xs text-muted">
        Creada por {i.createdBy.fullName} · {formatDateTime(i.createdAt)}
      </p>
    </Card>
  );
}
