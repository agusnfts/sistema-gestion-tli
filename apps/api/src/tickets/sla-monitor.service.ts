import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  businessMinutesBetween,
  formatTicketNumber,
  minutesPerBusinessDay,
  OPEN_STATUSES,
  SLA_AT_RISK_FRACTION,
  slaTargets,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { APP_CONFIG, type AppConfig } from '../config/config';

const INTERVAL_MS = 60_000;

type Clock = 'firstResponse' | 'resolution';

/**
 * Revisa periódicamente los relojes de SLA (alerta al quedar el 25 % y marca de vencido)
 * y el cierre automático de tickets resueltos (si está habilitado).
 * En la Fase 2b esto pasa a un job repetible del worker (BullMQ), que garantiza una sola ejecución
 * aunque haya varias instancias. Mientras tanto, las marcas se escriben con un update condicional,
 * así que dos pasadas simultáneas no notifican dos veces.
 */
@Injectable()
export class SlaMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaMonitorService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (this.config.env === 'test') return;
    this.timer = setInterval(() => {
      this.runOnce(new Date()).catch((err) =>
        this.logger.error(err instanceof Error ? err.stack : String(err)),
      );
    }, INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Una pasada completa. Público para los tests. */
  async runOnce(now: Date): Promise<{ alerts: number; autoClosed: number }> {
    const alerts = await this.checkSla(now);
    const autoClosed = await this.autoClose(now);
    return { alerts, autoClosed };
  }

  private async checkSla(now: Date): Promise<number> {
    const [calendar, policies] = await Promise.all([
      this.settings.getCalendar(),
      this.settings.getSlaPolicies(),
    ]);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: { in: [...OPEN_STATUSES] },
        slaPausedAt: null,
        OR: [
          { firstRespondedAt: null, firstResponseBreachAt: null },
          { resolutionDueAt: { not: null }, resolutionBreachAt: null },
        ],
      },
    });
    let alerts = 0;
    let admins: string[] | null = null;

    for (const t of tickets) {
      const targets = slaTargets(t.type, t.priority, policies);
      const clocks: {
        clock: Clock;
        dueAt: Date | null;
        target: number | null;
        done: boolean;
        riskAt: Date | null;
        breachAt: Date | null;
      }[] = [
        {
          clock: 'firstResponse',
          dueAt: t.firstResponseDueAt,
          target: targets.firstResponseMinutes,
          done: !!t.firstRespondedAt,
          riskAt: t.firstResponseRiskAt,
          breachAt: t.firstResponseBreachAt,
        },
        {
          clock: 'resolution',
          dueAt: t.resolutionDueAt,
          target: targets.resolutionMinutes,
          done: !!t.resolvedAt,
          riskAt: t.resolutionRiskAt,
          breachAt: t.resolutionBreachAt,
        },
      ];
      for (const c of clocks) {
        if (c.done || !c.dueAt || c.target === null || c.breachAt) continue;
        const breached = now > c.dueAt;
        const atRisk =
          !breached &&
          !c.riskAt &&
          businessMinutesBetween(now, c.dueAt, calendar) <= c.target * SLA_AT_RISK_FRACTION;
        if (!breached && !atRisk) continue;

        // Marca condicionada al estado leído: si otra pasada ya la puso, no se notifica dos veces.
        const field = `${c.clock}${breached ? 'BreachAt' : 'RiskAt'}` as const;
        const { count } = await this.prisma.ticket.updateMany({
          where: { id: t.id, [field]: null },
          data: { [field]: now },
        });
        if (!count) continue;

        admins ??= await this.notifications.usersWithPermission('settings.manage');
        const number = formatTicketNumber(t.number);
        const what = c.clock === 'firstResponse' ? 'primera respuesta' : 'resolución';
        await this.notifications.notify([t.assigneeId, ...admins], {
          kind: breached ? 'TICKET_SLA_BREACHED' : 'TICKET_SLA_AT_RISK',
          title: breached
            ? `${number}: SLA de ${what} vencido`
            : `${number}: SLA de ${what} por vencer`,
          body: t.subject,
          link: `/tickets/${t.id}`,
          entityType: 'ticket',
          entityId: t.id,
        });
        alerts++;
      }
    }
    return alerts;
  }

  private async autoClose(now: Date): Promise<number> {
    const config = await this.settings.getAutoClose();
    if (!config.enabled) return 0;
    const calendar = await this.settings.getCalendar();
    const threshold = config.businessDays * minutesPerBusinessDay(calendar);
    const resolved = await this.prisma.ticket.findMany({
      where: { status: 'RESOLVED', resolvedAt: { not: null } },
    });
    let closed = 0;
    for (const t of resolved) {
      if (businessMinutesBetween(t.resolvedAt!, now, calendar) < threshold) continue;
      const { count } = await this.prisma.ticket.updateMany({
        where: { id: t.id, status: 'RESOLVED' },
        data: { status: 'CLOSED', closedAt: now, closeReason: 'AUTO' },
      });
      if (!count) continue;
      await this.prisma.activityEvent.create({
        data: {
          entityType: 'ticket',
          entityId: t.id,
          kind: 'STATUS_CHANGED',
          field: 'status',
          oldValue: 'RESOLVED',
          newValue: 'CLOSED',
          visibility: 'PUBLIC',
          occurredAt: now,
        },
      });
      await this.notifications.notify([t.requesterId], {
        kind: 'TICKET_STATUS_CHANGED',
        title: `${formatTicketNumber(t.number)}: cerrado automáticamente`,
        body: `Pasaron ${config.businessDays} días hábiles desde que se resolvió sin respuesta.`,
        link: `/tickets/${t.id}`,
        entityType: 'ticket',
        entityId: t.id,
      });
      closed++;
    }
    return closed;
  }
}
