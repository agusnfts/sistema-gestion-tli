import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tli/db';
import {
  DEFAULT_AUTO_CLOSE,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_SLA_POLICIES,
  SETTING_KEYS,
  type AutoCloseSettings,
  type BusinessCalendar,
  type BusinessHours,
  type Holiday,
  type HolidayInput,
  type SlaPolicies,
} from '@tli/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthContext, RequestMeta } from '../common/auth-context';

type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

const DEFAULTS: Record<SettingKey, unknown> = {
  [SETTING_KEYS.slaPolicies]: DEFAULT_SLA_POLICIES,
  [SETTING_KEYS.businessHours]: DEFAULT_BUSINESS_HOURS,
  [SETTING_KEYS.autoClose]: DEFAULT_AUTO_CLOSE,
};

// La configuración cambia muy poco: se cachea un minuto y se invalida al guardar.
const CACHE_TTL_MS = 60_000;

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async get<T>(key: SettingKey): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const value = (row?.value ?? DEFAULTS[key]) as T;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  private async set(
    key: SettingKey,
    value: unknown,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: actor.user.id },
        update: { value: value as Prisma.InputJsonValue, updatedById: actor.user.id },
      });
      await this.audit.log(
        {
          action: 'settings.updated',
          actorId: actor.user.id,
          entityType: 'setting',
          ip: meta.ip,
          metadata: { key },
        },
        tx,
      );
    });
    this.cache.delete(key);
    this.cache.delete('calendar');
  }

  getSlaPolicies(): Promise<SlaPolicies> {
    return this.get(SETTING_KEYS.slaPolicies);
  }

  getBusinessHours(): Promise<BusinessHours> {
    return this.get(SETTING_KEYS.businessHours);
  }

  getAutoClose(): Promise<AutoCloseSettings> {
    return this.get(SETTING_KEYS.autoClose);
  }

  updateSlaPolicies(value: SlaPolicies, actor: AuthContext, meta: RequestMeta) {
    return this.set(SETTING_KEYS.slaPolicies, value, actor, meta);
  }

  updateBusinessHours(value: BusinessHours, actor: AuthContext, meta: RequestMeta) {
    return this.set(SETTING_KEYS.businessHours, value, actor, meta);
  }

  updateAutoClose(value: AutoCloseSettings, actor: AuthContext, meta: RequestMeta) {
    return this.set(SETTING_KEYS.autoClose, value, actor, meta);
  }

  /** Horario hábil + feriados, listo para el motor de SLA. */
  async getCalendar(): Promise<BusinessCalendar> {
    const hit = this.cache.get('calendar');
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as BusinessCalendar;
    const [hours, holidays] = await Promise.all([
      this.getBusinessHours(),
      this.prisma.holiday.findMany({ select: { date: true } }),
    ]);
    const calendar: BusinessCalendar = {
      ...hours,
      holidays: new Set(holidays.map((h) => h.date.toISOString().slice(0, 10))),
    };
    this.cache.set('calendar', { value: calendar, at: Date.now() });
    return calendar;
  }

  async listHolidays(): Promise<Holiday[]> {
    const rows = await this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    return rows.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name }));
  }

  async createHoliday(
    input: HolidayInput,
    actor: AuthContext,
    meta: RequestMeta,
  ): Promise<Holiday> {
    const date = new Date(input.date);
    if (await this.prisma.holiday.findUnique({ where: { date } })) {
      throw new ConflictException('Ya hay un feriado cargado en esa fecha');
    }
    const row = await this.prisma.holiday.create({ data: { date, name: input.name } });
    await this.audit.log({
      action: 'holiday.created',
      actorId: actor.user.id,
      entityType: 'holiday',
      entityId: row.id,
      ip: meta.ip,
      metadata: { date: input.date },
    });
    this.cache.delete('calendar');
    return { id: row.id, date: input.date, name: row.name };
  }

  async deleteHoliday(id: string, actor: AuthContext, meta: RequestMeta): Promise<void> {
    const row = await this.prisma.holiday.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Feriado inexistente');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.log({
      action: 'holiday.deleted',
      actorId: actor.user.id,
      entityType: 'holiday',
      entityId: id,
      ip: meta.ip,
      metadata: { date: row.date.toISOString().slice(0, 10) },
    });
    this.cache.delete('calendar');
  }
}
