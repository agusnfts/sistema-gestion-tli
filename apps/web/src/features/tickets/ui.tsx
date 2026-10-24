import {
  formatBusinessDuration,
  PRIORITY_LABELS,
  SLA_STATE_LABELS,
  TICKET_STATUS_LABELS,
  type Priority,
  type SlaInfo,
  type SlaState,
  type TicketStatus,
} from '@tli/shared';
import { Badge } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const STATUS_TONES: Record<TicketStatus, Tone> = {
  NEW: 'info',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  WAITING_USER: 'neutral',
  WAITING_VENDOR: 'neutral',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  DERIVED_TO_IMPROVEMENT: 'neutral',
  DERIVED_TO_INTEGRATION: 'neutral',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{TICKET_STATUS_LABELS[status]}</Badge>;
}

export function PriorityLabel({
  priority,
  provisional,
}: {
  priority: Priority;
  provisional?: boolean;
}) {
  return (
    <span className={priority === 'CRITICAL' ? 'font-semibold text-danger' : undefined}>
      {PRIORITY_LABELS[priority]}
      {provisional && (
        <span
          className="ml-1 text-xs text-muted"
          title="Urgencia indicada por el usuario; IT todavía no fijó la prioridad"
        >
          (prov.)
        </span>
      )}
    </span>
  );
}

// El color se usa solo para marcar el estado del SLA: rojo vencido, ámbar por vencer.
const SLA_TONES: Record<SlaState, Tone> = {
  ON_TRACK: 'neutral',
  AT_RISK: 'warning',
  BREACHED: 'danger',
  MET: 'success',
  PAUSED: 'neutral',
  STOPPED: 'neutral',
};

export function SlaBadge({ sla, label }: { sla: SlaInfo; label?: string }) {
  if (sla.state === 'STOPPED' && !sla.dueAt) return <span className="text-xs text-muted">—</span>;
  const remaining =
    sla.remainingMinutes !== null &&
    (sla.state === 'ON_TRACK' || sla.state === 'AT_RISK' || sla.state === 'PAUSED')
      ? ` · ${formatBusinessDuration(sla.remainingMinutes)}`
      : '';
  return (
    <span title={sla.dueAt ? `Vence: ${formatDateTime(sla.dueAt)}` : undefined}>
      <Badge tone={SLA_TONES[sla.state]}>
        {label ? `${label}: ` : ''}
        {SLA_STATE_LABELS[sla.state]}
        {remaining}
      </Badge>
    </span>
  );
}

/** El reloj más urgente de los dos, para las listas. */
export function primarySla(sla: { firstResponse: SlaInfo; resolution: SlaInfo }): {
  info: SlaInfo;
  label: string;
} {
  const pending = (s: SlaInfo) =>
    s.state === 'ON_TRACK' ||
    s.state === 'AT_RISK' ||
    s.state === 'BREACHED' ||
    s.state === 'PAUSED';
  if (
    pending(sla.firstResponse) &&
    sla.firstResponse.state !== 'BREACHED' &&
    sla.resolution.state !== 'BREACHED'
  ) {
    return { info: sla.firstResponse, label: '1ª resp.' };
  }
  if (sla.firstResponse.state === 'BREACHED' && !pending(sla.resolution))
    return { info: sla.firstResponse, label: '1ª resp.' };
  return { info: sla.resolution, label: 'Resol.' };
}
