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
  changeProblemStatusSchema,
  createProblemSchema,
  linkTicketsSchema,
  listProblemsQuerySchema,
  updateProblemSchema,
  type ChangeProblemStatusInput,
  type CreateProblemInput,
  type LinkTicketsInput,
  type ListProblemsQuery,
  type UpdateProblemInput,
} from '@tli/shared';
import { ProblemsService } from './problems.service';
import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Get()
  @RequirePermission('problem.read')
  list(@Query(new ZodPipe(listProblemsQuerySchema)) query: ListProblemsQuery) {
    return this.problems.list(query);
  }

  @Post()
  @RequirePermission('problem.manage')
  create(
    @Body(new ZodPipe(createProblemSchema)) body: CreateProblemInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.problems.create(body, auth, meta);
  }

  @Get(':id')
  @RequirePermission('problem.read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.problems.get(id);
  }

  @Patch(':id')
  @RequirePermission('problem.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateProblemSchema)) body: UpdateProblemInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.problems.update(id, body, auth);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('problem.manage')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(changeProblemStatusSchema)) body: ChangeProblemStatusInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.problems.changeStatus(id, body, auth, meta);
  }

  @Post(':id/tickets')
  @HttpCode(200)
  @RequirePermission('problem.manage')
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(linkTicketsSchema)) body: LinkTicketsInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.problems.link(id, body.ticketIds, auth, meta);
  }

  @Delete(':id/tickets/:ticketId')
  @RequirePermission('problem.manage')
  unlink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.problems.unlink(id, ticketId, auth, meta);
  }

  @Get(':id/suggestions')
  @RequirePermission('problem.read')
  suggestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.problems.suggestions(id);
  }
}
