import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  autoCloseSchema,
  emailSettingsSchema,
  businessHoursSchema,
  holidaySchema,
  slaPoliciesSchema,
  type AutoCloseSettings,
  type BusinessHours,
  type EmailSettings,
  type EmailSettingsResponse,
  type HolidayInput,
  type SlaPolicies,
} from '@tli/shared';
import { SettingsService } from './settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('settings')
@RequirePermission('settings.manage')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async emailStatus(): Promise<EmailSettingsResponse> {
    return {
      ...(await this.settings.getEmailSettings()),
      smtpConfigured: this.notifications.emailConfigured,
      from: this.config.smtp?.from ?? null,
    };
  }

  @Get('email')
  getEmail() {
    return this.emailStatus();
  }

  @Put('email')
  async putEmail(
    @Body(new ZodPipe(emailSettingsSchema)) body: EmailSettings,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.settings.updateEmailSettings(body, auth, meta);
    return this.emailStatus();
  }

  @Post('email/test')
  @HttpCode(200)
  async testEmail(@CurrentAuth() auth: AuthContext) {
    if (!this.notifications.emailConfigured) {
      throw new BadRequestException(
        'No hay servidor SMTP configurado (variables SMTP_* del servidor)',
      );
    }
    try {
      await this.notifications.sendTestEmail(auth.user.email);
    } catch (e) {
      throw new BadRequestException(
        `No se pudo enviar: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return { sentTo: auth.user.email };
  }

  @Get('sla')
  getSla() {
    return this.settings.getSlaPolicies();
  }

  @Put('sla')
  async putSla(
    @Body(new ZodPipe(slaPoliciesSchema)) body: SlaPolicies,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.settings.updateSlaPolicies(body, auth, meta);
    return body;
  }

  @Get('business-hours')
  getBusinessHours() {
    return this.settings.getBusinessHours();
  }

  @Put('business-hours')
  async putBusinessHours(
    @Body(new ZodPipe(businessHoursSchema)) body: BusinessHours,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.settings.updateBusinessHours(body, auth, meta);
    return body;
  }

  @Get('auto-close')
  getAutoClose() {
    return this.settings.getAutoClose();
  }

  @Put('auto-close')
  async putAutoClose(
    @Body(new ZodPipe(autoCloseSchema)) body: AutoCloseSettings,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    await this.settings.updateAutoClose(body, auth, meta);
    return body;
  }

  @Get('holidays')
  listHolidays() {
    return this.settings.listHolidays();
  }

  @Post('holidays')
  createHoliday(
    @Body(new ZodPipe(holidaySchema)) body: HolidayInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settings.createHoliday(body, auth, meta);
  }

  @Delete('holidays/:id')
  @HttpCode(204)
  deleteHoliday(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settings.deleteHoliday(id, auth, meta);
  }
}
