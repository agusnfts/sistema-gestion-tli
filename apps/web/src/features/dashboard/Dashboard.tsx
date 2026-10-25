import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, AlertTriangle } from 'lucide-react';
import {
  CLIENT_STATUS_LABELS,
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_LABELS,
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_SYSTEM_LABELS,
  INTEGRATION_STATUS_LABELS,
  PRIORITY_LABELS,
  PROBLEM_STATUS_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_TYPE_LABELS,
  type DashboardData,
  type DashboardPeriod,
  type UserRef,
} from '@tli/shared';
import { api } from '@/lib/api';
import { useHasPermission, useMe } from '@/lib/auth';
import { Select } from '@/components/ui/form';
import { Alert, Spinner } from '@/components/ui/misc';
import { BarList, Metric, Section, StatTile, WeeklyChart } from './charts';

/** Minutos hábiles → "1 h 12 min" / "2 d 3 h" (día hábil de 9 h). */
function formatBusinessMinutes(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const days = Math.floor(m / (9 * 60));
  const hours = Math.floor((m % (9 * 60)) / 60);
  const mins = m % 60;
  if (days) return `${days} d${hours ? ` ${hours} h` : ''}`;
  return `${hours} h${mins ? ` ${mins} min` : ''}`;
}

const pctText = (v: number | null) => (v === null ? '—' : `${v} %`);

/**
 * Dashboard de IT/Admin. Filtros arriba (período y responsable) y guardados en la URL; cada
 * número es un link a la lista filtrada que lo explica.
 */
export function Dashboard() {
  const { data: me } = useMe();
  const [params, setParams] = useSearchParams();
  const period = (params.get('period') as DashboardPeriod) || '30d';
  const owner = params.get('owner') ?? '';
  const data = useQuery({
    queryKey: ['dashboard', period, owner],
    queryFn: () =>
      api<DashboardData>('/dashboard', { query: { period, owner: owner || undefined } }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const staff = useQuery({
    queryKey: ['tickets', 'assignees'],
    queryFn: () => api<UserRef[]>('/tickets/assignees'),
  });
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true },
    );

  // Links a las listas: mismos filtros que el número. "Yo" se resuelve al id para las listas
  // que filtran por responsable (la bandeja ya entiende "me").
  const ownerId = owner === 'me' ? (me?.id ?? '') : owner;
  const tk = (qs: string) => `/tickets?${qs}${owner ? `&assignee=${owner}` : ''}`;

  return (
    <section aria-label="Indicadores" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Período"
          className="w-auto"
          value={period}
          onChange={(e) => set('period', e.target.value === '30d' ? '' : e.target.value)}
        >
          {DASHBOARD_PERIODS.map((p) => (
            <option key={p} value={p}>
              {DASHBOARD_PERIOD_LABELS[p]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Responsable"
          className="w-auto"
          value={owner}
          onChange={(e) => set('owner', e.target.value)}
        >
          <option value="">Todos los responsables</option>
          <option value="me">Yo</option>
          {staff.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
        {data.isFetching && !data.isLoading && (
          <span className="text-xs text-muted" role="status">
            Actualizando…
          </span>
        )}
      </div>

      {data.isLoading ? (
        <Spinner />
      ) : data.error || !data.data ? (
        <Alert tone="danger">No se pudieron cargar los indicadores.</Alert>
      ) : (
        <DashboardBody d={data.data} tk={tk} ownerId={ownerId} />
      )}
    </section>
  );
}

function DashboardBody({
  d,
  tk,
  ownerId,
}: {
  d: DashboardData;
  tk: (qs: string) => string;
  ownerId: string;
}) {
  const t = d.tickets;
  const { from, to } = d.range;
  const can = useHasPermission();
  // Problemas, mejoras e integraciones: el responsable es el dueño.
  const o = ownerId ? `&owner=${ownerId}` : '';

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Abiertos"
          value={t.open}
          to={tk('state=open')}
          hint={`${t.unassigned} sin asignar`}
        />
        <StatTile
          label="SLA vencido"
          value={t.breached}
          to={tk('state=all&sla=breached')}
          tone={t.breached ? 'danger' : undefined}
          icon={<AlarmClock className="size-3.5" aria-hidden />}
        />
        <StatTile
          label="Por vencer"
          value={t.atRisk}
          to={tk('state=all&sla=at_risk')}
          tone={t.atRisk ? 'warning' : undefined}
          icon={<AlertTriangle className="size-3.5" aria-hidden />}
        />
        <StatTile
          label="Recibidos"
          value={t.created}
          to={tk(`state=all&createdFrom=${from}&createdTo=${to}`)}
          hint="en el período"
        />
        <StatTile
          label="Cerrados"
          value={t.done}
          to={tk(`state=all&doneFrom=${from}&doneTo=${to}`)}
          hint="resueltos o cerrados"
        />
        <StatTile
          label="1ª respuesta"
          value={formatBusinessMinutes(t.firstResponseAvgMinutes)}
          hint={`promedio hábil · ${pctText(t.firstResponseOnTimePct)} a tiempo`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Section title="Abiertos vs cerrados por semana">
          <WeeklyChart data={t.weekly} />
          <p className="mt-2 text-xs text-muted">
            Resueltos dentro del SLA en el período: {pctText(t.resolutionOnTimePct)}
          </p>
        </Section>
        <Section title="Abiertos por sistema" to={tk('state=open')}>
          <BarList
            rows={t.openByCategory.map((r) => ({
              label: TICKET_CATEGORY_LABELS[r.key],
              value: r.count,
              to: tk(`state=open&category=${r.key}`),
            }))}
            emptyText="No hay tickets abiertos."
          />
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Abiertos por prioridad">
          <BarList
            rows={t.openByPriority.map((r) => ({
              label: PRIORITY_LABELS[r.key],
              value: r.count,
              to: tk(`state=open&priority=${r.key}`),
            }))}
            emptyText="No hay tickets abiertos."
          />
        </Section>
        <Section title="Carga por responsable">
          <BarList
            rows={t.openByAssignee.map((r) => ({
              label: r.assignee?.fullName ?? 'Sin asignar',
              value: r.count,
              to: `/tickets?state=open&assignee=${r.assignee?.id ?? 'none'}`,
            }))}
            emptyText="No hay tickets abiertos."
          />
        </Section>
        <Section title="Recibidos por tipo">
          <BarList
            rows={t.createdByType.map((r) => ({
              label: TICKET_TYPE_LABELS[r.key].short,
              value: r.count,
              to: tk(`state=all&type=${r.key}&createdFrom=${from}&createdTo=${to}`),
            }))}
            emptyText="Nada en el período."
          />
        </Section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Section title="Propuestas">
          <Metric label="Recibidas en el período" value={d.proposals.received} />
          <Metric label="Convertidas en mejora o integración" value={d.proposals.converted} />
          <Metric
            label="Sin primera respuesta"
            value={d.proposals.pendingFirstResponse}
            tone={d.proposals.pendingFirstResponse ? 'danger' : undefined}
          />
          <p className="mt-2 text-xs text-muted">
            Pedidos de automatización e integración (el detalle por tipo está en “Recibidos por
            tipo”).
          </p>
        </Section>

        {can('problem.read') && (
          <Section title="Problemas" to={`/problemas?state=open${o}`}>
            <Metric label="Activos" value={d.problems.active} to={`/problemas?state=open${o}`} />
            <Metric label="Tickets abiertos vinculados" value={d.problems.openTicketsLinked} />
            <Metric
              label="Resueltos en el período"
              value={d.problems.resolvedInPeriod}
              to={`/problemas?state=resolved${o}`}
            />
            <div className="mt-3">
              <BarList
                title="Activos por estado"
                rows={d.problems.byStatus
                  .filter((r) => r.key !== 'RESOLVED')
                  .map((r) => ({
                    label: PROBLEM_STATUS_LABELS[r.key],
                    value: r.count,
                    to: `/problemas?state=all&status=${r.key}${o}`,
                  }))}
                emptyText="Sin problemas activos."
              />
            </div>
          </Section>
        )}

        {can('improvement.read') && (
          <Section title="Mejoras" to={`/mejoras?view=list${o}`}>
            <Metric
              label="En curso"
              value={d.improvements.active}
              to={`/mejoras?view=list&state=active${o}`}
            />
            <Metric
              label="Implementadas en el período"
              value={d.improvements.implementedInPeriod}
            />
            <Metric label="Descartadas en el período" value={d.improvements.discardedInPeriod} />
            <div className="mt-3 space-y-3">
              <BarList
                title="En curso por sistema"
                rows={d.improvements.activeBySystem.map((r) => ({
                  label: IMPROVEMENT_SYSTEM_LABELS[r.key],
                  value: r.count,
                  to: `/mejoras?view=list&state=active&system=${r.key}${o}`,
                }))}
                emptyText="Sin mejoras en curso."
              />
              <BarList
                title="En curso por estado"
                rows={d.improvements.byStatus
                  .filter((r) => r.key !== 'IMPLEMENTED' && r.key !== 'DISCARDED')
                  .map((r) => ({
                    label: IMPROVEMENT_STATUS_LABELS[r.key],
                    value: r.count,
                    to: `/mejoras?view=list&state=all&status=${r.key}${o}`,
                  }))}
              />
            </div>
          </Section>
        )}

        {can('integration.read') && (
          <Section title="Integraciones" to={`/integraciones?state=pending${o}`}>
            <Metric
              label="Pendientes"
              value={d.integrations.pending}
              to={`/integraciones?state=pending${o}`}
            />
            <Metric
              label="Con la fecha objetivo vencida"
              value={d.integrations.overdue}
              to={`/integraciones?overdue=true${o}`}
              tone={d.integrations.overdue ? 'danger' : undefined}
            />
            <Metric label="Finalizadas en el período" value={d.integrations.completedInPeriod} />
            <Metric label="No realizadas en el período" value={d.integrations.notDoneInPeriod} />
            {d.integrations.costs.map((c) => (
              <Metric
                key={c.currency}
                label={`Est. vs real (${c.currency}, ${c.count} finalizadas)`}
                value={`${c.estimated.toLocaleString('es-AR')} / ${c.actual.toLocaleString('es-AR')}`}
              />
            ))}
            <div className="mt-3">
              <BarList
                title="Pendientes por estado"
                rows={d.integrations.byStatus
                  .filter((r) => r.key !== 'COMPLETED' && r.key !== 'NOT_DONE')
                  .map((r) => ({
                    label: INTEGRATION_STATUS_LABELS[r.key],
                    value: r.count,
                    to: `/integraciones?state=all&status=${r.key}${o}`,
                  }))}
                emptyText="Sin integraciones pendientes."
              />
            </div>
          </Section>
        )}
      </div>

      {can('client.read') && (
        <Section title="Clientes" to="/clientes">
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <BarList
              rows={d.clients.byStatus.map((r) => ({
                label: CLIENT_STATUS_LABELS[r.key],
                value: r.count,
                to: `/clientes?status=${r.key}`,
              }))}
              emptyText="Todavía no hay clientes cargados."
            />
            <Metric
              label="Con integraciones pendientes"
              value={d.clients.withPendingIntegrations}
            />
          </div>
        </Section>
      )}
    </>
  );
}
