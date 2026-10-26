import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import type { AuthContext, RequestMeta } from '../common/auth-context';

/** Derechos de los titulares: exportación y anonimización (solo Admin). */
@Controller('privacy/users')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get(':id/export')
  @RequirePermission('privacy.export')
  export(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.privacy.export(id, auth, meta);
  }

  @Post(':id/anonymize')
  @HttpCode(200)
  @RequirePermission('privacy.anonymize')
  anonymize(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.privacy.anonymize(id, auth, meta);
  }
}
