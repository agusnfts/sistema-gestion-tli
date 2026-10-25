import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MAX_ATTACHMENT_BYTES } from '@tli/shared';
import { FilesService, type UploadedFile as Upload } from './files.service';
import { CurrentAuth, ReqMeta, RequireAnyPermission } from '../common/decorators';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const CAN_ATTACH = ['ticket.create', 'ticket.comment.own', 'ticket.manage'] as const;

@Controller('attachments')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @RequireAnyPermission(...CAN_ATTACH)
  // Sin destino, multer guarda en memoria: el límite es 25 MB y el archivo va directo a cuarentena.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    }),
  )
  upload(@UploadedFile() file: Upload | undefined, @CurrentAuth() auth: AuthContext) {
    return this.files.upload(file, auth);
  }

  @Get('status')
  @RequireAnyPermission(...CAN_ATTACH)
  status(@Query('ids') ids: string | undefined, @CurrentAuth() auth: AuthContext) {
    const list = (ids ?? '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x));
    return this.files.statusOf(list, auth);
  }

  @Get(':id')
  @RequireAnyPermission('ticket.read.own', 'ticket.read.all')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('inline') inline: string | undefined,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.files.open(id, auth, inline === '1', meta);
    res.set({
      'Content-Type': f.mimeType,
      'Content-Length': String(f.size),
      'Content-Disposition': `${f.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'X-Content-Type-Options': 'nosniff',
      // Aunque el archivo se abra en el navegador, no puede ejecutar nada.
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, max-age=300',
    });
    return new StreamableFile(f.stream);
  }
}
