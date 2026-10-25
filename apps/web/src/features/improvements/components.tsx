import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_SYSTEMS,
  IMPROVEMENT_SYSTEM_LABELS,
  LEVEL_LABELS,
  PRIORITY_LABELS,
  improvementPriority,
  type ImprovementDetail,
  type ImprovementListItem,
  type ImprovementStatus,
  type ImprovementSystem,
  type Paginated,
} from '@tli/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useCatalog } from '@/features/admin/api-hooks';
import { errorText } from '@/features/problems/components';

export const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm disabled:bg-bg';

const TONES: Record<ImprovementStatus, 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  IDEA: 'neutral',
  ANALYSIS: 'info',
  APPROVED: 'info',
  IN_DEVELOPMENT: 'warning',
  TESTING: 'warning',
  IMPLEMENTED: 'success',
  DISCARDED: 'neutral',
};

export function ImprovementStatusBadge({ status }: { status: ImprovementStatus }) {
  return <Badge tone={TONES[status]}>{IMPROVEMENT_STATUS_LABELS[status]}</Badge>;
}

export function LevelSelect({
  value,
  onChange,
  ...props
}: {
  value: number;
  onChange: (v: number) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <Select {...props} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {[3, 2, 1].map((n) => (
        <option key={n} value={n}>
          {LEVEL_LABELS[n]}
        </option>
      ))}
    </Select>
  );
}

/** Mensaje de cierre precargado según cómo termina la mejora. */
export function defaultClosingMessage(status: 'IMPLEMENTED' | 'DISCARDED', code: string): string {
  return status === 'IMPLEMENTED'
    ? `La mejora que pediste ya está implementada (${code}). ` +
        'Contanos si hay algo que no funcione como esperabas.'
    : `Analizamos tu pedido (${code}) y decidimos no avanzar por ahora porque `;
}

/** Alta de una mejora, opcionalmente con tickets o problemas que se derivan a ella. */
export function CreateImprovementDialog({
  ticketIds = [],
  problemIds = [],
  defaults,
  onClose,
}: {
  ticketIds?: string[];
  problemIds?: string[];
  defaults?: { title?: string; system?: ImprovementSystem; currentSituation?: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const areas = useCatalog('areas');
  const [form, setForm] = useState({
    title: defaults?.title ?? '',
    system: defaults?.system ?? ('WMS' as ImprovementSystem),
    requestingAreaId: '',
    currentSituation: defaults?.currentSituation ?? '',
    proposal: '',
    expectedImpact: '',
    impact: 2,
    effort: 2,
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const create = useMutation({
    mutationFn: () =>
      api<ImprovementDetail>('/improvements', {
        method: 'POST',
        body: {
          ...form,
          requestingAreaId: form.requestingAreaId || null,
          expectedImpact: form.expectedImpact || null,
          ticketIds,
          problemIds,
        },
      }),
    onSuccess: (i) => {
      void qc.invalidateQueries({ queryKey: ['improvements'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['problems'] });
      onClose();
      navigate(`/mejoras/${i.id}`);
    },
  });

  const derived = [
    ticketIds.length && `${ticketIds.length} ticket(s)`,
    problemIds.length && 'los tickets abiertos del problema',
  ].filter(Boolean);

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="Nueva mejora"
      description={
        derived.length
          ? `Se derivan ${derived.join(' y ')}: quedan en espera hasta que la mejora se implemente o se descarte.`
          : 'Cambio en un sistema (WMS, TMS, TYT, ruteo…) para trabajar mejor.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Crear mejora
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {create.error && <Alert tone="danger">{errorText(create.error)}</Alert>}
        <Field label="Título" required>
          {(p) => (
            <Input {...p} value={form.title} onChange={(e) => set('title', e.target.value)} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sistema" required>
            {(p) => (
              <Select
                {...p}
                value={form.system}
                onChange={(e) => set('system', e.target.value as ImprovementSystem)}
              >
                {IMPROVEMENT_SYSTEMS.map((s) => (
                  <option key={s} value={s}>
                    {IMPROVEMENT_SYSTEM_LABELS[s]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Área que lo pide">
            {(p) => (
              <Select
                {...p}
                value={form.requestingAreaId}
                onChange={(e) => set('requestingAreaId', e.target.value)}
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
        </div>
        <Field label="Situación actual" required hint="Cómo se trabaja hoy y qué problema trae.">
          {(p) => (
            <textarea
              {...p}
              rows={3}
              className={textareaClass}
              value={form.currentSituation}
              onChange={(e) => set('currentSituation', e.target.value)}
            />
          )}
        </Field>
        <Field label="Propuesta" required hint="Qué cambio se propone.">
          {(p) => (
            <textarea
              {...p}
              rows={3}
              className={textareaClass}
              value={form.proposal}
              onChange={(e) => set('proposal', e.target.value)}
            />
          )}
        </Field>
        <Field label="Impacto esperado" hint="Horas ahorradas, errores evitados, clientes…">
          {(p) => (
            <textarea
              {...p}
              rows={2}
              className={textareaClass}
              value={form.expectedImpact}
              onChange={(e) => set('expectedImpact', e.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Impacto">
            {(p) => <LevelSelect {...p} value={form.impact} onChange={(v) => set('impact', v)} />}
          </Field>
          <Field label="Esfuerzo">
            {(p) => <LevelSelect {...p} value={form.effort} onChange={(v) => set('effort', v)} />}
          </Field>
        </div>
        <p className="text-xs text-muted">
          Prioridad sugerida:{' '}
          <span className="font-medium">
            {PRIORITY_LABELS[improvementPriority(form.impact, form.effort)]}
          </span>{' '}
          (después la podés fijar a mano).
        </p>
      </div>
    </Dialog>
  );
}

/** Deriva tickets a una mejora en curso. */
export function LinkToImprovementDialog({
  ticketIds,
  onClose,
}: {
  ticketIds: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [improvementId, setImprovementId] = useState('');
  const active = useQuery({
    queryKey: ['improvements', 'active-options'],
    queryFn: () =>
      api<Paginated<ImprovementListItem>>('/improvements', {
        query: { state: 'active', pageSize: 100 },
      }),
  });
  const link = useMutation({
    mutationFn: () =>
      api(`/improvements/${improvementId}/tickets`, { method: 'POST', body: { ticketIds } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['improvements'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Derivar a una mejora"
      description={`${ticketIds.length} ticket(s). Quedan en espera y se cierran cuando la mejora termine.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!improvementId} loading={link.isPending} onClick={() => link.mutate()}>
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
      <Field label="Mejora en curso">
        {(p) => (
          <Select {...p} value={improvementId} onChange={(e) => setImprovementId(e.target.value)}>
            <option value="">Elegí una mejora</option>
            {active.data?.items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} · {x.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {active.data?.items.length === 0 && (
        <p className="mt-2 text-sm text-muted">No hay mejoras en curso. Creá una nueva.</p>
      )}
    </Dialog>
  );
}

/** Implementar o descartar: pide el mensaje que reciben los solicitantes de los tickets derivados. */
export function CloseImprovementDialog({
  improvement: i,
  status,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  improvement: Pick<ImprovementListItem, 'code' | 'title' | 'ticketCount'>;
  status: 'IMPLEMENTED' | 'DISCARDED';
  loading: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: (closingMessage: string) => void;
}) {
  const [message, setMessage] = useState(defaultClosingMessage(status, i.code));
  const implemented = status === 'IMPLEMENTED';
  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={implemented ? `Implementar ${i.code}` : `Descartar ${i.code}`}
      description={
        i.ticketCount
          ? `Se cierran los tickets derivados y sus solicitantes reciben este mensaje.`
          : 'No tiene tickets derivados: el mensaje queda registrado en la mejora.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant={implemented ? 'primary' : 'danger'}
            loading={loading}
            onClick={() => onConfirm(message.trim())}
          >
            {implemented ? 'Marcar implementada' : 'Descartar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <Alert tone="danger">{errorText(error)}</Alert> : null}
        <Field
          label="Mensaje de cierre"
          required
          hint={implemented ? 'Qué se hizo y cómo usarlo.' : 'Por qué no se hace.'}
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
      </div>
    </Dialog>
  );
}
