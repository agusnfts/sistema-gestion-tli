import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ANNOUNCEMENT_IMPACTS,
  ANNOUNCEMENT_IMPACT_LABELS,
  ANNOUNCEMENT_STATUS_LABELS,
  BUSINESS_SYSTEMS,
  BUSINESS_SYSTEM_LABELS,
  splitEmails,
  type AnnouncementDetail,
  type AnnouncementImpact,
  type AnnouncementStatus,
  type BusinessSystem,
  type DistributionListItem,
  type SystemInfoItem,
} from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { ChipSelect } from '@/components/ui/chips';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useCatalog } from '@/features/admin/api-hooks';

export const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm';

const TONES: Record<AnnouncementStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  DONE: 'success',
  CANCELLED: 'danger',
};

export function AnnouncementStatusBadge({ status }: { status: AnnouncementStatus }) {
  return <Badge tone={TONES[status]}>{ANNOUNCEMENT_STATUS_LABELS[status]}</Badge>;
}

export function ImpactBadge({ impact }: { impact: AnnouncementImpact }) {
  const label = { NONE: 'Sin corte', DEGRADED: 'Puede andar lento', OUTAGE: 'Fuera de servicio' };
  const tone = { NONE: 'success', DEGRADED: 'warning', OUTAGE: 'danger' } as const;
  return <Badge tone={tone[impact]}>{label[impact]}</Badge>;
}

export function systemNames(systems: BusinessSystem[]): string {
  return systems.map((s) => BUSINESS_SYSTEM_LABELS[s]).join(', ');
}

export function errorText(e: unknown): string {
  return e instanceof ApiError
    ? [e.message, ...e.issues.map((i) => i.message)].join(' · ')
    : 'Error inesperado';
}

export function useSystems() {
  return useQuery({ queryKey: ['systems'], queryFn: () => api<SystemInfoItem[]>('/systems') });
}

export function useDistributionLists(includeInactive = false) {
  return useQuery({
    queryKey: ['distribution-lists', includeInactive],
    queryFn: () =>
      api<DistributionListItem[]>('/distribution-lists', { query: { includeInactive } }),
  });
}

/** ISO → valor de <input type="datetime-local"> en la hora de la computadora. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const REMINDER_OPTIONS = [
  { value: '', label: 'Sin recordatorio' },
  { value: '1', label: '1 hora antes' },
  { value: '2', label: '2 horas antes' },
  { value: '12', label: '12 horas antes' },
  { value: '24', label: '1 día antes' },
  { value: '48', label: '2 días antes' },
];

/** Alta y edición de un aviso de actualización. */
export function AnnouncementFormDialog({
  announcement,
  onClose,
}: {
  announcement?: AnnouncementDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const systems = useSystems();
  const lists = useDistributionLists();
  const warehouses = useCatalog('warehouses');
  const areas = useCatalog('areas');
  const a = announcement;
  const [form, setForm] = useState({
    title: a?.title ?? '',
    systems: a?.systems ?? ([] as BusinessSystem[]),
    impact: a?.impact ?? ('OUTAGE' as AnnouncementImpact),
    startsAt: toLocalInput(a?.startsAt ?? null),
    endsAt: toLocalInput(a?.endsAt ?? null),
    reason: a?.reason ?? '',
    details: a?.details ?? '',
    reminderHours: a?.reminderHours ? String(a.reminderHours) : a ? '' : '24',
    distributionListIds: a?.distributionLists.map((l) => l.id) ?? [],
    warehouseIds: a?.warehouses.map((w) => w.id) ?? [],
    areaIds: a?.areas.map((x) => x.id) ?? [],
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const providerOf = new Map(systems.data?.map((s) => [s.key, s.provider?.name]));

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        startsAt: fromLocalInput(form.startsAt),
        endsAt: fromLocalInput(form.endsAt),
        details: form.details || null,
        reminderHours: form.reminderHours ? Number(form.reminderHours) : null,
      };
      return a
        ? api<AnnouncementDetail>(`/announcements/${a.id}`, { method: 'PATCH', body })
        : api<AnnouncementDetail>('/announcements', { method: 'POST', body });
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['announcements'] });
      onClose();
      if (!a) navigate(`/actualizaciones/${saved.id}`);
    },
  });

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={a ? `Editar ${a.code}` : 'Nuevo aviso de actualización'}
      description={
        a?.status === 'SCHEDULED'
          ? 'El aviso ya se envió: si cambiás el horario, reenvialo para que la operación se entere.'
          : 'Queda como borrador hasta que lo envíes.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {a ? 'Guardar cambios' : 'Guardar borrador'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
        <Field label="Qué se actualiza" required hint="Ej.: Nueva versión del WMS (8.2)">
          {(p) => (
            <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} />
          )}
        </Field>
        <ChipSelect
          label="Sistemas"
          required
          options={BUSINESS_SYSTEMS.map((s) => ({
            value: s,
            label: providerOf.get(s)
              ? `${BUSINESS_SYSTEM_LABELS[s]} · ${providerOf.get(s)}`
              : BUSINESS_SYSTEM_LABELS[s],
          }))}
          value={form.systems}
          onChange={(v) => set('systems', v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inicio" required>
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set('startsAt', e.target.value)}
              />
            )}
          </Field>
          <Field label="Fin estimado">
            {(p) => (
              <Input
                {...p}
                type="datetime-local"
                value={form.endsAt}
                min={form.startsAt || undefined}
                onChange={(e) => set('endsAt', e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Impacto en la operación" required>
            {(p) => (
              <Select
                {...p}
                value={form.impact}
                onChange={(e) => set('impact', e.target.value as AnnouncementImpact)}
              >
                {ANNOUNCEMENT_IMPACTS.map((i) => (
                  <option key={i} value={i}>
                    {ANNOUNCEMENT_IMPACT_LABELS[i]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Recordatorio automático" hint="Sale solo si el aviso ya se envió.">
            {(p) => (
              <Select
                {...p}
                value={form.reminderHours}
                onChange={(e) => set('reminderHours', e.target.value)}
              >
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Motivo" required hint="Por qué se actualiza, en palabras de la operación.">
          {(p) => (
            <textarea
              {...p}
              rows={2}
              className={textareaClass}
              value={form.reason}
              onChange={(e) => set('reason', e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Indicaciones para la operación"
          hint="Qué hacer antes o después: cerrar sesión en los handhelds, no facturar, etc."
        >
          {(p) => (
            <textarea
              {...p}
              rows={3}
              className={textareaClass}
              value={form.details}
              onChange={(e) => set('details', e.target.value)}
            />
          )}
        </Field>

        <fieldset className="space-y-3 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">A quiénes avisar</legend>
          {lists.data?.length === 0 ? (
            <p className="text-sm text-muted">
              Todavía no hay listas de distribución. Crealas en la pestaña “Listas de distribución”.
            </p>
          ) : (
            <ChipSelect
              label="Listas de distribución"
              options={(lists.data ?? []).map((l) => ({
                value: l.id,
                label: `${l.name} (${l.emails.length})`,
              }))}
              value={form.distributionListIds}
              onChange={(v) => set('distributionListIds', v)}
            />
          )}
          <ChipSelect
            label="Usuarios del sistema de estos depósitos"
            options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
            value={form.warehouseIds}
            onChange={(v) => set('warehouseIds', v)}
          />
          <ChipSelect
            label="Usuarios del sistema de estas áreas"
            options={(areas.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
            value={form.areaIds}
            onChange={(v) => set('areaIds', v)}
            hint="Los usuarios reciben el mail y además lo ven en la campana."
          />
        </fieldset>
      </div>
    </Dialog>
  );
}

/** Alta y edición de una lista de distribución (mails pegados en bloque). */
export function DistributionListDialog({
  list,
  onClose,
}: {
  list: DistributionListItem | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(list?.name ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const [emails, setEmails] = useState(list?.emails.join('\n') ?? '');
  const parsed = splitEmails(emails);
  const save = useMutation({
    mutationFn: () => {
      const body = { name, description: description || null, emails: parsed };
      return list
        ? api(`/distribution-lists/${list.id}`, { method: 'PATCH', body })
        : api('/distribution-lists', { method: 'POST', body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['distribution-lists'] });
      void qc.invalidateQueries({ queryKey: ['announcements'] });
      onClose();
    },
  });

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={list ? `Editar “${list.name}”` : 'Nueva lista de distribución'}
      description="Puede tener mails de personas o de grupos (ej. operacion@tml.com.ar), tengan o no usuario en el sistema."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {save.error && <Alert tone="danger">{errorText(save.error)}</Alert>}
        <Field label="Nombre" required hint="Ej.: Jefes de depósito, Operación Garín, Facturación">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Descripción">
          {(p) => (
            <Input {...p} value={description} onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>
        <Field
          label="Mails"
          required
          hint={`Uno por renglón, o separados por coma. ${parsed.length} mail(s).`}
        >
          {(p) => (
            <textarea
              {...p}
              rows={8}
              className={`${textareaClass} font-mono`}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder={'jefe.garin@tml.com.ar\noperacion@tml.com.ar'}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** Cierre de una actualización: realizada o cancelada, con mensaje opcional a la operación. */
export function CloseAnnouncementDialog({
  announcement,
  mode,
  onClose,
}: {
  announcement: AnnouncementDetail;
  mode: 'done' | 'cancel';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const wasSent = announcement.sentAt !== null;
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(wasSent);
  const close = useMutation({
    mutationFn: () =>
      api<AnnouncementDetail>(`/announcements/${announcement.id}/${mode}`, {
        method: 'POST',
        body: { note: note || undefined, notify },
      }),
    onSuccess: (a) => {
      qc.setQueryData(['announcements', 'detail', a.id], a);
      void qc.invalidateQueries({ queryKey: ['announcements'] });
      onClose();
    },
  });
  const done = mode === 'done';

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={done ? 'Marcar como realizada' : 'Cancelar la actualización'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button
            variant={done ? 'primary' : 'danger'}
            loading={close.isPending}
            onClick={() => close.mutate()}
          >
            {done ? 'Marcar realizada' : 'Cancelar actualización'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {close.error && <Alert tone="danger">{errorText(close.error)}</Alert>}
        <Field
          label={done ? 'Mensaje para la operación' : 'Motivo de la cancelación'}
          required={!done}
          hint={done ? 'Ej.: Quedó instalada la versión 8.2. Ya se puede trabajar.' : undefined}
        >
          {(p) => (
            <textarea
              {...p}
              rows={3}
              className={textareaClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
        {wasSent ? (
          <Checkbox
            label="Avisar a los mismos destinatarios"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
        ) : (
          <p className="text-xs text-muted">
            El aviso no se había enviado: no se notifica a nadie.
          </p>
        )}
      </div>
    </Dialog>
  );
}
