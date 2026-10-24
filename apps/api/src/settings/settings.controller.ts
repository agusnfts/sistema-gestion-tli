import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  autoCloseSchema,
  businessHoursSchema,
  holidaySchema,
  slaPoliciesSchema,
  type AutoCloseSettings,
  type BusinessHours,
  type HolidayInput,
  type SlaPolicies,
} from '@tli/shared';
import { SettingsService } from './settings.service';
import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('settings')
@RequirePermission('settings.manage')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

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
