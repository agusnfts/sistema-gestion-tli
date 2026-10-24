import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  addCommentSchema,
  addTimeEntrySchema,
  changeTicketStatusSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  updateTicketSchema,
  type AddCommentInput,
  type AddTimeEntryInput,
  type ChangeTicketStatusInput,
  type CreateTicketInput,
  type ListTicketsQuery,
  type UpdateTicketInput,
} from '@tli/shared';
import { TicketsService } from './tickets.service';
import {
  CurrentAuth,
  ReqMeta,
  RequireAnyPermission,
  RequirePermission,
} from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  // El alcance ("míos" o "todos") lo controla el servicio según los permisos.
  @Get()
  @RequireAnyPermission('ticket.read.own', 'ticket.read.all')
  list(
    @Query(new ZodPipe(listTicketsQuerySchema)) query: ListTicketsQuery,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.tickets.list(query, auth);
  }

  @Post()
  @RequirePermission('ticket.create')
  create(
    @Body(new ZodPipe(createTicketSchema)) body: CreateTicketInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tickets.create(body, auth, meta);
  }

  @Get('assignees')
  @RequirePermission('ticket.manage')
  assignees() {
    return this.tickets.assignees();
  }

  @Get(':id')
  @RequireAnyPermission('ticket.read.own', 'ticket.read.all')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.tickets.get(id, auth);
  }

  @Patch(':id')
  @RequirePermission('ticket.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateTicketSchema)) body: UpdateTicketInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tickets.update(id, body, auth, meta);
  }

  @Post(':id/status')
  @RequirePermission('ticket.manage')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(changeTicketStatusSchema)) body: ChangeTicketStatusInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tickets.changeStatus(id, body, auth, meta);
  }

  @Post(':id/comments')
  @RequireAnyPermission('ticket.comment.own', 'ticket.manage')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(addCommentSchema)) body: AddCommentInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.tickets.addComment(id, body, auth, meta);
  }

  @Post(':id/time')
  @RequirePermission('ticket.time.log')
  addTime(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(addTimeEntrySchema)) body: AddTimeEntryInput,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.tickets.addTimeEntry(id, body, auth);
  }
}
