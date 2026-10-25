import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  INTEGRATION_CHANNELS,
  INTEGRATION_CHANNEL_LABELS,
  INTEGRATION_COUNTERPARTS,
  INTEGRATION_COUNTERPART_TYPE_LABELS,
  INTEGRATION_FLOWS,
  INTEGRATION_FLOW_LABELS,
  INTEGRATION_PROCESSES,
  INTEGRATION_PROCESS_LABELS,
  INTEGRATION_STATUS_LABELS,
  INTEGRATION_SYSTEMS,
  INTEGRATION_SYSTEM_LABELS,
  NOT_DONE_REASONS,
  PLATFORM_CATEGORY_LABELS,
  NOT_DONE_REASON_LABELS,
  type ClientListItem,
  type IntegrationChannel,
  type IntegrationCounterpart,
  type IntegrationDetail,
  type IntegrationFlow,
  type IntegrationListItem,
  type IntegrationProcess,
  type IntegrationStatus,
  type IntegrationSystem,
  type NotDoneReason,
  type Paginated,
} from '@tli/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { errorText } from '@/features/problems/components';
import { useCatalog } from '@/features/admin/api-hooks';
import { ChipSelect } from '@/components/ui/chips';

export const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm disabled:bg-bg';

const TONES: Record<IntegrationStatus, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  PENDING_SURVEY: 'neutral',
  PENDING_QUOTE: 'info',
  QUOTED: 'info',
  IN_DEVELOPMENT: 'warning',
  COMPLETED: 'success',
  NOT_DONE: 'neutral',
};

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  return <Badge tone={TONES[status]}>{INTEGRATION_STATUS_LABELS[status]}</Badge>;
}

/** Clientes para elegir en un formulario (el maestro tiene decenas, no miles). */
export function useClientOptions(enabled = true) {
  return useQuery({
    queryKey: ['clients', 'options'],
    queryFn: () =>
      api<Paginated<ClientListItem>>('/clients', { query: { pageSize: 100 } }).then((r) => r.items),
    enabled,
  });
}

export type IntegrationDefaults = {
  name?: string;
  counterpartType?: IntegrationCounterpart;
  clientId?: string;
  counterpartName?: string;
  processes?: IntegrationProcess[];
  direction?: IntegrationFlow | null;
};

/** Procesos, sistemas nuestros y plataformas externas: selección múltiple con chips. */
export function IntegrationScopeFields({
  processes,
  systems,
  platformIds,
  onChange,
  disabled,
}: {
  processes: IntegrationProcess[];
  systems: IntegrationSystem[];
  platformIds: string[];
  onChange: (patch: {
    processes?: IntegrationProcess[];
    systems?: IntegrationSystem[];
    platformIds?: string[];
  }) => void;
  disabled?: boolean;
}) {
  const platforms = useCatalog('platforms');
  // Una plataforma desactivada que ya estaba vinculada se sigue mostrando.
  const options = (platforms.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    group: PLATFORM_CATEGORY_LABELS[p.category ?? 'OTHER'],
  }));
  return (
    <div className="space-y-4">
      <ChipSelect
        label="Procesos"
        required
        disabled={disabled}
        options={INTEGRATION_PROCESSES.map((x) => ({
          value: x,
          label: INTEGRATION_PROCESS_LABELS[x],
        }))}
        value={processes}
        onChange={(v) => onChange({ processes: v })}
      />
      <ChipSelect
        label="Sistemas nuestros"
        required
        disabled={disabled}
        options={INTEGRATION_SYSTEMS.map((x) => ({
          value: x,
          label: INTEGRATION_SYSTEM_LABELS[x],
        }))}
        value={systems}
        onChange={(v) => onChange({ systems: v })}
      />
      <ChipSelect
        label="Plataformas del otro lado"
        hint="E-commerce o ERP de la contraparte. Se agregan más en Administración → Catálogos."
        disabled={disabled}
        options={options}
        value={platformIds}
        onChange={(v) => onChange({ platformIds: v })}
      />
    </div>
  );
}

/** Alta de una integración, opcionalmente derivando tickets (ej. un pedido de integración). */
export function CreateIntegrationDialog({
  ticketIds = [],
  defaults,
  onClose,
}: {
  ticketIds?: string[];
  defaults?: IntegrationDefaults;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clients = useClientOptions();
  const [form, setForm] = useState({
    name: defaults?.name ?? '',
    counterpartType: defaults?.counterpartType ?? ('CLIENT' as IntegrationCounterpart),
    clientId: defaults?.clientId ?? '',
    counterpartName: defaults?.counterpartName ?? '',
    processes: defaults?.processes ?? ([] as IntegrationProcess[]),
    systems: ['WMS'] as IntegrationSystem[],
    platformIds: [] as string[],
    direction: (defaults?.direction ?? '') as IntegrationFlow | '',
    channel: '' as IntegrationChannel | '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const create = useMutation({
    mutationFn: () =>
      api<IntegrationDetail>('/integrations', {
        method: 'POST',
        body: {
          ...form,
          clientId: form.counterpartType === 'CLIENT' ? form.clientId || null : null,
          counterpartName: form.counterpartType === 'CLIENT' ? null : form.counterpartName,
          direction: form.direction || null,
          channel: form.channel || null,
          ticketIds,
        },
      }),
    onSuccess: (i) => {
      void qc.invalidateQueries({ queryKey: ['integrations'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
      navigate(`/integraciones/${i.id}`);
    },
  });

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="Nueva integración"
      description={
        ticketIds.length
          ? 'El pedido se deriva a la integración y se cierra cuando quede finalizada o no realizada.'
          : 'Intercambio de datos con un cliente, un expreso u otro.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Crear integración
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {create.error && <Alert tone="danger">{errorText(create.error)}</Alert>}
        <Field label="Nombre" required hint="Ej.: Remitos a Cliente X por FTP.">
          {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Con quién" required>
            {(p) => (
              <Select
                {...p}
                value={form.counterpartType}
                onChange={(e) => set('counterpartType', e.target.value as IntegrationCounterpart)}
              >
                {INTEGRATION_COUNTERPARTS.map((c) => (
                  <option key={c} value={c}>
                    {INTEGRATION_COUNTERPART_TYPE_LABELS[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {form.counterpartType === 'CLIENT' ? (
            <Field
              label="Cliente"
              required
              hint={
                defaults?.counterpartName && !form.clientId
                  ? `El pedido dice: "${defaults.counterpartName}".`
                  : undefined
              }
            >
              {(p) => (
                <Select
                  {...p}
                  value={form.clientId}
                  onChange={(e) => set('clientId', e.target.value)}
                >
                  <option value="">Elegí el cliente</option>
                  {clients.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shortName ?? c.legalName}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <Field label="Nombre" required>
              {(p) => (
                <Input
                  {...p}
                  value={form.counterpartName}
                  onChange={(e) => set('counterpartName', e.target.value)}
                />
              )}
            </Field>
          )}
        </div>
        <IntegrationScopeFields
          processes={form.processes}
          systems={form.systems}
          platformIds={form.platformIds}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sentido">
            {(p) => (
              <Select
                {...p}
                value={form.direction}
                onChange={(e) => set('direction', e.target.value as IntegrationFlow | '')}
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
                value={form.channel}
                onChange={(e) => set('channel', e.target.value as IntegrationChannel | '')}
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
        </div>
      </div>
    </Dialog>
  );
}

/** Deriva tickets a una integración en curso. */
export function LinkToIntegrationDialog({
  ticketIds,
  onClose,
}: {
  ticketIds: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [integrationId, setIntegrationId] = useState('');
  const pending = useQuery({
    queryKey: ['integrations', 'pending-options'],
    queryFn: () =>
      api<Paginated<IntegrationListItem>>('/integrations', {
        query: { state: 'pending', pageSize: 100 },
      }),
  });
  const link = useMutation({
    mutationFn: () =>
      api(`/integrations/${integrationId}/tickets`, { method: 'POST', body: { ticketIds } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['integrations'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Derivar a una integración"
      description="Queda en espera y se cierra cuando la integración termine."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!integrationId} loading={link.isPending} onClick={() => link.mutate()}>
            Derivar
          </Button>
        </>
      }
    >
      {link.error && (
        <div className="mb-3">
          <Alert tone="danger">{errorText(link.error)}</Alert>
        </div>
      )}
      <Field label="Integración en curso">
        {(p) => (
          <Select {...p} value={integrationId} onChange={(e) => setIntegrationId(e.target.value)}>
            <option value="">Elegí una integración</option>
            {pending.data?.items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} · {x.counterpartLabel} · {x.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {pending.data?.items.length === 0 && (
        <p className="mt-2 text-sm text-muted">No hay integraciones en curso. Creá una nueva.</p>
      )}
    </Dialog>
  );
}

/** Finalizar o marcar como no realizada: motivo (si aplica) y mensaje para los solicitantes. */
export function CloseIntegrationDialog({
  integration: i,
  status,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  integration: Pick<IntegrationListItem, 'code' | 'name' | 'ticketCount'>;
  status: 'COMPLETED' | 'NOT_DONE';
  loading: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (body: {
    closingMessage: string;
    notDoneReason?: NotDoneReason;
    notDoneNotes?: string;
  }) => void;
}) {
  const completed = status === 'COMPLETED';
  const [reason, setReason] = useState<NotDoneReason | ''>('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState(
    completed
      ? `La integración que pediste ya está funcionando (${i.code}). Avisanos si ves algo raro en los datos.`
      : `Analizamos el pedido de integración (${i.code}) y por ahora no se va a realizar porque `,
  );
  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={completed ? `Finalizar ${i.code}` : `Marcar ${i.code} como no realizada`}
      description={
        i.ticketCount
          ? 'Se cierran los tickets derivados y sus solicitantes reciben este mensaje.'
          : 'No tiene tickets derivados: el mensaje queda registrado en la integración.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={completed ? 'primary' : 'danger'}
            loading={loading}
            disabled={!completed && !reason}
            onClick={() =>
              onConfirm({
                closingMessage: message.trim(),
                notDoneReason: completed ? undefined : (reason as NotDoneReason),
                notDoneNotes: completed ? undefined : notes.trim() || undefined,
              })
            }
          >
            {completed ? 'Finalizar' : 'No realizada'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{errorText(error)}</Alert> : null}
        {!completed && (
          <>
            <Field label="Motivo" required>
              {(p) => (
                <Select
                  {...p}
                  value={reason}
                  onChange={(e) => setReason(e.target.value as NotDoneReason)}
                >
                  <option value="">Elegí el motivo</option>
                  {NOT_DONE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {NOT_DONE_REASON_LABELS[r]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Detalle del motivo" hint="Interno, no lo ve el solicitante.">
              {(p) => <Input {...p} value={notes} onChange={(e) => setNotes(e.target.value)} />}
            </Field>
          </>
        )}
        <Field label="Mensaje de cierre" required hint="Lo recibe quien pidió la integración.">
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
      </div>
    </Dialog>
  );
}
