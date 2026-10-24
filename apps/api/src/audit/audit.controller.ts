import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { auditQuerySchema, type AuditQuery } from '@tli/shared';
import { AuditService } from './audit.service';
import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  list(@Query(new ZodPipe(auditQuerySchema)) query: AuditQuery) {
    return this.audit.list(query);
  }

  @Post('verify')
  @HttpCode(200)
  @RequirePermission('audit.read')
  async verify(@CurrentAuth() auth: AuthContext, @ReqMeta() meta: RequestMeta) {
    const result = await this.audit.verifyChain();
    await this.audit.log({
      action: 'audit.chain.verified',
      actorId: auth.user.id,
      ip: meta.ip,
      metadata: { ok: result.ok, checked: result.checked, brokenAtSeq: result.brokenAtSeq },
    });
    return result;
  }
}
