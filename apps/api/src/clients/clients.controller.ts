import {
  BadRequestException,
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import {
  clientSchema,
  contactSchema,
  createDocumentSchema,
  listClientsQuerySchema,
  MAX_IMPORT_BYTES,
  updateClientSchema,
  type ClientParsed,
  type ContactParsed,
  type CreateDocumentParsed,
  type ListClientsQuery,
  type UpdateClientInput,
} from '@tli/shared';
import { ClientsService } from './clients.service';
import { F50ImportService } from './f50-import.service';

import { CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const importQuerySchema = z.object({
  sheet: z.string().trim().max(100).optional(),
  dryRun: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly f50: F50ImportService,
  ) {}

  @Get()
  @RequirePermission('client.read')
  list(@Query(new ZodPipe(listClientsQuerySchema)) query: ListClientsQuery) {
    return this.clients.list(query);
  }

  @Post()
  @RequirePermission('client.manage')
  create(
    @Body(new ZodPipe(clientSchema)) body: ClientParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.clients.create(body, auth, meta);
  }

  /** Importa el F50. Con dryRun=true (por defecto) solo previsualiza. */
  @Post('import')
  @HttpCode(200)
  @RequirePermission('client.import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  import(
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query(new ZodPipe(importQuerySchema)) query: { sheet?: string; dryRun: boolean },
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo');
    return this.f50.import(file.buffer, query, auth, meta);
  }

  @Get(':id')
  @RequirePermission('client.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentAuth() auth: AuthContext) {
    return this.clients.get(id, auth);
  }

  @Patch(':id')
  @RequirePermission('client.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateClientSchema)) body: UpdateClientInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.clients.update(id, body, auth, meta);
  }

  @Post(':id/contacts')
  @HttpCode(200)
  @RequirePermission('client.manage')
  addContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(contactSchema)) body: ContactParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.clients.saveContact(id, null, body, auth, meta);
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermission('client.manage')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(new ZodPipe(contactSchema)) body: ContactParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.clients.saveContact(id, contactId, body, auth, meta);
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermission('client.manage')
  deleteContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.clients.deleteContact(id, contactId, auth, meta);
  }

  @Post(':id/documents')
  @HttpCode(200)
  @RequirePermission('client.manage')
  addDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(createDocumentSchema)) body: CreateDocumentParsed,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.clients.addDocument(id, body, auth, meta);
  }
}
