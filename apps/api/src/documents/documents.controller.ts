import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { newDocumentVersionSchema, type NewDocumentVersionInput } from '@tli/shared';
import { DocumentsService } from './documents.service';
import { Authenticated, CurrentAuth, ReqMeta } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  // El permiso depende de a qué está vinculado el documento: lo chequea el servicio.
  @Post(':id/versions')
  @HttpCode(204)
  @Authenticated()
  addVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(newDocumentVersionSchema)) body: NewDocumentVersionInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.documents.addVersion(id, body, auth, meta);
  }
}
