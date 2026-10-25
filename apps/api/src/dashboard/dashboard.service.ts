import { Injectable } from '@nestjs/common';
import type { Prisma } from '@tli/db';
import {
  businessMinutesBetween,
  OPEN_STATUSES,
  type DashboardData,
  type DashboardPeriod,
  type DashboardQuery,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PENDING_INTEGRATION_STATUSES } from '../integrations/integrations.service';
import {
  dayRange,
  doneInRange,
  slaWhere,
  startOfLocalDay,
  todayLocal,
} from '../tickets/ticket-filters';
import type { AuthContext } from '../common/auth-context';

const DAY = 86_400_000;
const PROPOSAL_TYPES = ['AUTOMATION', 'INTEGRATION'] as const;
const WEEKS = 8;

const addDays = (iso: string, n: number) =>
  new Date(startOfLocalDay(iso).getTime() + n * DAY + 3 * 3_600_000).toISOString().slice(0, 10);

/** Primer día del período, en días locales. */
export function periodStart(period: DashboardPeriod, today: string): string {
  switch (period) {
    case '7d':
      return addDays(today, -6);
    case '30d':
      return addDays(today, -29);
    case '90d':
      return addDays(today, -89);
    case 'month':
      return `${today.slice(0, 8)}01`;
    case 'year':
      return `${today.slice(0, 4)}-01-01`;
  }
}

/** Lunes de la semana (local) de un instante, como YYYY-MM-DD. */
export function weekKey(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3_600_000);
  const dow = (local.getUTCDay() + 6) % 7; // lunes = 0
  return new Date(local.getTime() - dow * DAY).toISOString().slice(0, 10);
}

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null);

function counts<K extends string>(rows: { key: K | null; _count: { _all: number } }[]) {
  return rows
    .filter((r): r is { key: K; _count: { _all: number } } => r.key !== null)
    .map((r) => ({ key: r.key, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Indicadores del dashboard. Cada número usa los mismos filtros que la lista a la que lleva
 * (ticket-filters), para que el drill-down no muestre otra cosa.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async get(q: DashboardQuery, actor: AuthContext, now = new Date()): Promise<DashboardData> {
    const today = todayLocal(now);
    const from = periodStart(q.period, today);
    const range = dayRange(from, today)!;
    const owner = q.owner === 'me' ? actor.user.id : q.owner;
    const assignee: Prisma.TicketWhereInput = owner ? { assigneeId: owner } : {};
    const own = owner ? { ownerId: owner } : {};
    const open: Prisma.TicketWhereInput = { ...assignee, status: { in: [...OPEN_STATUSES] } };
    const p = this.prisma;

    const weeksFrom = weekKey(new Date(startOfLocalDay(today).getTime() - (WEEKS - 1) * 7 * DAY));
    const [
      openCount,
      unassigned,
      breached,
      atRisk,
      created,
      done,
      createdRows,
      doneRows,
      weeklyCreated,
      weeklyDone,
      byCategory,
      byPriority,
      byAssignee,
      byType,
      calendar,
    ] = await Promise.all([
      p.ticket.count({ where: open }),
      p.ticket.count({ where: { ...open, assigneeId: null } }),
      p.ticket.count({ where: { AND: [assignee, slaWhere('breached')] } }),
      p.ticket.count({ where: { AND: [assignee, slaWhere('at_risk')] } }),
      p.ticket.count({ where: { ...assignee, createdAt: range } }),
      p.ticket.count({ where: { AND: [assignee, doneInRange(range)] } }),
      p.ticket.findMany({
        where: { ...assignee, createdAt: range },
        select: { createdAt: true, firstRespondedAt: true, firstResponseDueAt: true },
      }),
      p.ticket.findMany({
        where: { AND: [assignee, doneInRange(range), { resolutionDueAt: { not: null } }] },
        select: { resolvedAt: true, closedAt: true, resolutionDueAt: true },
      }),
      p.ticket.findMany({
        where: { ...assignee, createdAt: { gte: startOfLocalDay(weeksFrom) } },
        select: { createdAt: true },
      }),
      p.ticket.findMany({
        where: { AND: [assignee, doneInRange({ gte: startOfLocalDay(weeksFrom) })] },
        select: { resolvedAt: true, closedAt: true },
      }),
      p.ticket.groupBy({ by: ['category'], where: open, _count: { _all: true } }),
      p.ticket.groupBy({ by: ['priority'], where: open, _count: { _all: true } }),
      p.ticket.groupBy({ by: ['assigneeId'], where: open, _count: { _all: true } }),
      p.ticket.groupBy({
        by: ['type'],
        where: { ...assignee, createdAt: range },
        _count: { _all: true },
      }),
      this.settings.getCalendar(),
    ]);

    // Primera respuesta: promedio en horas hábiles y % a tiempo (vencidas sin responder cuentan).
    const responded = createdRows.filter((t) => t.firstRespondedAt);
    const frMinutes = responded.map((t) =>
      businessMinutesBetween(t.createdAt, t.firstRespondedAt!, calendar),
    );
    const frDue = createdRows.filter((t) => t.firstRespondedAt || t.firstResponseDueAt < now);
    const frOnTime = frDue.filter(
      (t) => t.firstRespondedAt && t.firstRespondedAt <= t.firstResponseDueAt,
    );
    const resOnTime = doneRows.filter((t) => (t.resolvedAt ?? t.closedAt)! <= t.resolutionDueAt!);

    const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(weeksFrom, i * 7));
    const bucket = (dates: Date[]) => {
      const m = new Map<string, number>();
      for (const d of dates) m.set(weekKey(d), (m.get(weekKey(d)) ?? 0) + 1);
      return m;
    };
    const wc = bucket(weeklyCreated.map((t) => t.createdAt));
    const wd = bucket(weeklyDone.map((t) => (t.resolvedAt ?? t.closedAt)!));

    const assignees = await p.user.findMany({
      where: { id: { in: byAssignee.map((r) => r.assigneeId).filter((x): x is string => !!x) } },
      select: { id: true, fullName: true },
    });

    // Propuestas: pedidos de automatización e integración.
    const proposalWhere: Prisma.TicketWhereInput = {
      ...assignee,
      type: { in: [...PROPOSAL_TYPES] },
      createdAt: range,
    };
    const [received, converted, pendingFirstResponse] = await Promise.all([
      p.ticket.count({ where: proposalWhere }),
      p.ticket.count({
        where: {
          ...proposalWhere,
          OR: [{ improvementId: { not: null } }, { integrationId: { not: null } }],
        },
      }),
      p.ticket.count({
        where: { ...open, type: { in: [...PROPOSAL_TYPES] }, firstRespondedAt: null },
      }),
    ]);

    const [problemsByStatus, openTicketsLinked, problemsResolved] = await Promise.all([
      p.problem.groupBy({ by: ['status'], where: own, _count: { _all: true } }),
      p.ticket.count({
        where: {
          status: { in: [...OPEN_STATUSES] },
          problem: { ...own, status: { not: 'RESOLVED' } },
        },
      }),
      p.problem.count({ where: { ...own, status: 'RESOLVED', resolvedAt: range } }),
    ]);

    const finalImprovements = ['IMPLEMENTED', 'DISCARDED'] as const;
    const [improvementsByStatus, improvementsBySystem, implemented, discarded] = await Promise.all([
      p.improvement.groupBy({ by: ['status'], where: own, _count: { _all: true } }),
      p.improvement.groupBy({
        by: ['system'],
        where: { ...own, status: { notIn: [...finalImprovements] } },
        _count: { _all: true },
      }),
      p.improvement.count({ where: { ...own, status: 'IMPLEMENTED', completedAt: range } }),
      p.improvement.count({ where: { ...own, status: 'DISCARDED', completedAt: range } }),
    ]);

    const pendingWhere = { ...own, status: { in: [...PENDING_INTEGRATION_STATUSES] } };
    const [integrationsByStatus, overdue, completed, notDone, clientsByStatus, withPending] =
      await Promise.all([
        p.integration.groupBy({ by: ['status'], where: own, _count: { _all: true } }),
        p.integration.count({
          where: { ...pendingWhere, targetDate: { lt: startOfLocalDay(today) } },
        }),
        p.integration.findMany({
          where: { ...own, status: 'COMPLETED', completedAt: range },
          select: {
            currency: true,
            actualCost: true,
            quotes: { where: { isSelected: true }, select: { amount: true, currency: true } },
          },
        }),
        p.integration.count({ where: { ...own, status: 'NOT_DONE', completedAt: range } }),
        p.client.groupBy({ by: ['status'], _count: { _all: true } }),
        p.client.count({
          where: { integrations: { some: { status: { in: [...PENDING_INTEGRATION_STATUSES] } } } },
        }),
      ]);

    // Estimado (cotización elegida) vs real, por moneda. Si las monedas no coinciden se
    // informan por separado: no se convierte.
    const costs = new Map<string, { estimated: number; actual: number; count: number }>();
    for (const i of completed) {
      const quote = i.quotes[0];
      const add = (currency: string, field: 'estimated' | 'actual', amount: number) => {
        const c = costs.get(currency) ?? { estimated: 0, actual: 0, count: 0 };
        c[field] += amount;
        costs.set(currency, c);
      };
      if (quote) add(quote.currency, 'estimated', quote.amount.toNumber());
      if (i.actualCost) add(i.currency, 'actual', i.actualCost.toNumber());
      const c = costs.get(quote?.currency ?? i.currency);
      if (c) c.count++;
    }

    const sum = (rows: { _count: { _all: number } }[]) =>
      rows.reduce((a, r) => a + r._count._all, 0);
    return {
      range: { from, to: today },
      tickets: {
        open: openCount,
        unassigned,
        breached,
        atRisk,
        created,
        done,
        firstResponseAvgMinutes: frMinutes.length
          ? Math.round(frMinutes.reduce((a, b) => a + b, 0) / frMinutes.length)
          : null,
        firstResponseOnTimePct: pct(frOnTime.length, frDue.length),
        resolutionOnTimePct: pct(resOnTime.length, doneRows.length),
        weekly: weeks.map((w) => ({ week: w, created: wc.get(w) ?? 0, done: wd.get(w) ?? 0 })),
        openByCategory: counts(byCategory.map((r) => ({ key: r.category, _count: r._count }))),
        openByPriority: counts(byPriority.map((r) => ({ key: r.priority, _count: r._count }))),
        openByAssignee: byAssignee
          .map((r) => ({
            assignee: assignees.find((u) => u.id === r.assigneeId) ?? null,
            count: r._count._all,
          }))
          .sort((a, b) => b.count - a.count),
        createdByType: counts(byType.map((r) => ({ key: r.type, _count: r._count }))),
      },
      proposals: { received, converted, pendingFirstResponse },
      problems: {
        active: sum(problemsByStatus.filter((r) => r.status !== 'RESOLVED')),
        byStatus: counts(problemsByStatus.map((r) => ({ key: r.status, _count: r._count }))),
        openTicketsLinked,
        resolvedInPeriod: problemsResolved,
      },
      improvements: {
        active: sum(
          improvementsByStatus.filter(
            (r) => !(finalImprovements as readonly string[]).includes(r.status),
          ),
        ),
        byStatus: counts(improvementsByStatus.map((r) => ({ key: r.status, _count: r._count }))),
        activeBySystem: counts(
          improvementsBySystem.map((r) => ({ key: r.system, _count: r._count })),
        ),
        implementedInPeriod: implemented,
        discardedInPeriod: discarded,
      },
      integrations: {
        pending: sum(
          integrationsByStatus.filter((r) => PENDING_INTEGRATION_STATUSES.includes(r.status)),
        ),
        overdue,
        byStatus: counts(integrationsByStatus.map((r) => ({ key: r.status, _count: r._count }))),
        completedInPeriod: completed.length,
        notDoneInPeriod: notDone,
        costs: [...costs.entries()].map(([currency, c]) => ({
          currency: currency as 'ARS' | 'USD',
          ...c,
        })),
      },
      clients: {
        byStatus: counts(clientsByStatus.map((r) => ({ key: r.status, _count: r._count }))),
        withPendingIntegrations: withPending,
      },
    };
  }
}
