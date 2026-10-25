import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  addWorkLogSchema,
  changeIntegrationStatusSchema,
  createDocumentSchema,
  createIntegrationSchema,
  howItWorksSchema,
  linkTicketsSchema,
  listIntegrationsQuerySchema,
  quoteSchema,
  updateIntegrationSchema,
  uuidSchema,
  type AddWorkLogInput,
  type ChangeIntegrationStatusInput,
  type CreateDocumentParsed,
  type CreateIntegrationParsed,
  type HowItWorksInput,
  type LinkTicketsInput,
  type ListIntegrationsQuery,
  type QuoteParsed,
  type UpdateIntegrationInput,
} from '@tli/shared';
import { IntegrationsService } from './integrations.service';
import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const selectQuoteSchema = z.object({ quoteId: uuidSchema.nullable() });

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermission('integration.read')
  list(@Query(new ZodPipe(listIntegrationsQuerySchema)) query: ListIntegrationsQuery) {
    return this.integrations.list(query);
  }

  @Post()
  @RequirePermission('integration.manage')
  create(
    @Body(new ZodPipe(createIntegrationSchema)) body: CreateIntegrationParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.create(body, auth, meta);
  }

  @Get(':id')
  @RequirePermission('integration.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.integrations.get(id);
  }

  @Patch(':id')
  @RequirePermission('integration.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateIntegrationSchema)) body: UpdateIntegrationInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.update(id, body, auth, meta);
  }

  @Post(':id/how-it-works')
  @HttpCode(200)
  @RequirePermission('integration.manage')
  setHowItWorks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(howItWorksSchema)) body: HowItWorksInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.setHowItWorks(id, body.howItWorks, auth, meta);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('integration.manage')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(changeIntegrationStatusSchema)) body: ChangeIntegrationStatusInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.changeStatus(id, body, auth, meta);
  }

  @Post(':id/quotes')
  @HttpCode(200)
  @RequirePermission('integration.manage')
  addQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(quoteSchema)) body: QuoteParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.addQuote(id, body, auth, meta);
  }

  @Post(':id/quotes/select')
  @HttpCode(200)
  @RequirePermission('integration.manage')
  selectQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(selectQuoteSchema)) body: { quoteId: string | null },
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.selectQuote(id, body.quoteId, auth, meta);
  }

  @Delete(':id/quotes/:quoteId')
  @RequirePermission('integration.manage')
  deleteQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.deleteQuote(id, quoteId, auth, meta);
  }

  @Post(':id/actions')
  @HttpCode(200)
  @RequirePermission('integration.manage')
  addAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(addWorkLogSchema)) body: AddWorkLogInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.addAction(id, body, auth, meta);
  }

  @Post(':id/tickets')
  @HttpCode(200)
  @RequirePermission('integration.manage')
  linkTickets(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(linkTicketsSchema)) body: LinkTicketsInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.linkTickets(id, body.ticketIds, auth, meta);
  }

  @Delete(':id/tickets/:ticketId')
  @RequirePermission('integration.manage')
  unlinkTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.unlinkTicket(id, ticketId, auth, meta);
  }

  @Post(':id/documents')
  @HttpCode(200)
  @RequirePermission('integration.manage')
  addDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createDocumentSchema)) body: CreateDocumentParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.integrations.addDocument(id, body, auth, meta);
  }
}
