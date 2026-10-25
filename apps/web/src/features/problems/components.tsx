import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PROBLEM_STATUS_LABELS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  type Paginated,
  type ProblemDetail,
  type ProblemListItem,
  type ProblemStatus,
  type TicketCategory,
} from '@tli/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';

const textareaClass =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-2 text-sm';

const TONES: Record<ProblemStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  OPEN: 'info',
  INVESTIGATING: 'warning',
  ROOT_CAUSE_IDENTIFIED: 'warning',
  RESOLVED: 'success',
};

export function ProblemStatusBadge({ status }: { status: ProblemStatus }) {
  return <Badge tone={TONES[status]}>{PROBLEM_STATUS_LABELS[status]}</Badge>;
}

export function errorText(e: unknown): string {
  return e instanceof ApiError
    ? [e.message, ...e.issues.map((i) => i.message)].join(' · ')
    : 'Error inesperado';
}

/** Alta de un problema, opcionalmente con tickets ya elegidos (desde la bandeja o un ticket). */
export function CreateProblemDialog({
  ticketIds = [],
  defaults,
  onClose,
}: {
  ticketIds?: string[];
  defaults?: { title?: string; category?: TicketCategory };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(defaults?.title ?? '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TicketCategory>(defaults?.category ?? 'WMS');
  const create = useMutation({
    mutationFn: () =>
      api<ProblemDetail>('/problems', {
        method: 'POST',
        body: { title, description, category, ticketIds },
      }),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['problems'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
      navigate(`/problemas/${p.id}`);
    },
  });

  return (
    <Dialog
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title="Nuevo problema"
      description={
        ticketIds.length
          ? `Se van a vincular ${ticketIds.length} ticket(s) que comparten esta causa.`
          : 'Agrupá tickets que comparten una misma causa raíz.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} onClick={() => create.mutate()}>
            Crear problema
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {create.error && <Alert tone="danger">{errorText(create.error)}</Alert>}
        <Field label="Título" required>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Sistema o categoría" required>
          {(p) => (
            <Select
              {...p}
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
            >
              {TICKET_CATEGORIES.filter((c) => c !== 'ACCESS').map((c) => (
                <option key={c} value={c}>
                  {TICKET_CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Descripción" required hint="Qué se observa y desde cuándo.">
          {(p) => (
            <textarea
              {...p}
              rows={4}
              className={textareaClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** Vincula tickets a un problema abierto existente. */
export function LinkToProblemDialog({
  ticketIds,
  onClose,
}: {
  ticketIds: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [problemId, setProblemId] = useState('');
  const open = useQuery({
    queryKey: ['problems', 'open-options'],
    queryFn: () =>
      api<Paginated<ProblemListItem>>('/problems', { query: { state: 'open', pageSize: 100 } }),
  });
  const link = useMutation({
    mutationFn: () =>
      api(`/problems/${problemId}/tickets`, { method: 'POST', body: { ticketIds } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['problems'] });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      onClose();
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Vincular a un problema"
      description={`${ticketIds.length} ticket(s). Si alguno ya estaba en otro problema, se mueve.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!problemId} loading={link.isPending} onClick={() => link.mutate()}>
            Vincular
          </Button>
        </>
      }
    >
      {link.error && (
        <div className="mb-3">
          <Alert tone="danger">{errorText(link.error)}</Alert>
        </div>
      )}
      <Field label="Problema abierto">
        {(p) => (
          <Select {...p} value={problemId} onChange={(e) => setProblemId(e.target.value)}>
            <option value="">Elegí un problema</option>
            {open.data?.items.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} · {x.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {open.data?.items.length === 0 && (
        <p className="mt-2 text-sm text-muted">No hay problemas abiertos. Creá uno nuevo.</p>
      )}
    </Dialog>
  );
}
