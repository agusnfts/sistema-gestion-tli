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
import {
  addWorkLogSchema,
  changeImprovementStatusSchema,
  createImprovementSchema,
  linkProblemsSchema,
  linkTicketsSchema,
  listImprovementsQuerySchema,
  updateImprovementSchema,
  type AddWorkLogInput,
  type ChangeImprovementStatusInput,
  type CreateImprovementInput,
  type LinkProblemsInput,
  type LinkTicketsInput,
  type ListImprovementsQuery,
  type UpdateImprovementInput,
} from '@tli/shared';
import { ImprovementsService } from './improvements.service';
import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('improvements')
export class ImprovementsController {
  constructor(private readonly improvements: ImprovementsService) {}

  @Get()
  @RequirePermission('improvement.read')
  list(@Query(new ZodPipe(listImprovementsQuerySchema)) query: ListImprovementsQuery) {
    return this.improvements.list(query);
  }

  @Post()
  @RequirePermission('improvement.manage')
  create(
    @Body(new ZodPipe(createImprovementSchema)) body: CreateImprovementInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.improvements.create(body, auth, meta);
  }

  @Get(':id')
  @RequirePermission('improvement.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.improvements.get(id);
  }

  @Patch(':id')
  @RequirePermission('improvement.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateImprovementSchema)) body: UpdateImprovementInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.improvements.update(id, body, auth, meta);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('improvement.manage')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(changeImprovementStatusSchema)) body: ChangeImprovementStatusInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.improvements.changeStatus(id, body, auth, meta);
  }

  @Post(':id/actions')
  @HttpCode(200)
  @RequirePermission('improvement.manage')
  addAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(addWorkLogSchema)) body: AddWorkLogInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.improvements.addAction(id, body, auth, meta);
  }

  @Post(':id/tickets')
  @HttpCode(200)
  @RequirePermission('improvement.manage')
  linkTickets(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(linkTicketsSchema)) body: LinkTicketsInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.improvements.linkTickets(id, body.ticketIds, auth, meta);
  }

  @Delete(':id/tickets/:ticketId')
  @RequirePermission('improvement.manage')
  unlinkTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.improvements.unlinkTicket(id, ticketId, auth, meta);
  }

  @Post(':id/problems')
  @HttpCode(200)
  @RequirePermission('improvement.manage')
  linkProblems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(linkProblemsSchema)) body: LinkProblemsInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.improvements.linkProblems(id, body.problemIds, auth, meta);
  }

  @Delete(':id/problems/:problemId')
  @RequirePermission('improvement.manage')
  unlinkProblem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('problemId', ParseUUIDPipe) problemId: string,
  ) {
    return this.improvements.unlinkProblem(id, problemId);
  }
}
