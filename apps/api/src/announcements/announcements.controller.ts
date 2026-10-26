import {
  Body,
  Controller,
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
  BUSINESS_SYSTEMS,
  cancelAnnouncementSchema,
  closeAnnouncementSchema,
  createAnnouncementSchema,
  distributionListSchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
  updateDistributionListSchema,
  updateSystemInfoSchema,
  type BusinessSystem,
  type CancelAnnouncementInput,
  type CloseAnnouncementInput,
  type CreateAnnouncementInput,
  type DistributionListInput,
  type ListAnnouncementsQuery,
  type UpdateAnnouncementInput,
  type UpdateDistributionListInput,
  type UpdateSystemInfoInput,
} from '@tli/shared';
import { AnnouncementsService } from './announcements.service';
import { SystemsService } from './systems.service';
import { Authenticated, CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const includeInactivePipe = new ZodPipe(
  z.object({
    includeInactive: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  }),
);

@Controller('systems')
export class SystemsController {
  constructor(private readonly systems: SystemsService) {}

  // Los formularios de mejoras y avisos muestran el proveedor de cada sistema.
  @Get()
  @Authenticated()
  list() {
    return this.systems.listSystems();
  }

  @Patch(':key')
  @RequirePermission('catalog.manage')
  update(
    @Param('key', new ZodPipe(z.enum(BUSINESS_SYSTEMS))) key: BusinessSystem,
    @Body(new ZodPipe(updateSystemInfoSchema)) body: UpdateSystemInfoInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.systems.updateSystem(key, body, auth, meta);
  }
}

@Controller('distribution-lists')
export class DistributionListsController {
  constructor(private readonly systems: SystemsService) {}

  @Get()
  @RequirePermission('announcement.manage')
  list(@Query(includeInactivePipe) query: { includeInactive: boolean }) {
    return this.systems.listDistributionLists(query.includeInactive);
  }

  @Post()
  @RequirePermission('announcement.manage')
  create(
    @Body(new ZodPipe(distributionListSchema)) body: DistributionListInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.systems.createDistributionList(body, auth, meta);
  }

  @Patch(':id')
  @RequirePermission('announcement.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateDistributionListSchema)) body: UpdateDistributionListInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.systems.updateDistributionList(id, body, auth, meta);
  }
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermission('announcement.manage')
  list(@Query(new ZodPipe(listAnnouncementsQuerySchema)) query: ListAnnouncementsQuery) {
    return this.announcements.list(query);
  }

  // Cartel de próximas actualizaciones: lo ve cualquier usuario.
  @Get('upcoming')
  @Authenticated()
  upcoming() {
    return this.announcements.upcoming();
  }

  @Post()
  @RequirePermission('announcement.manage')
  create(
    @Body(new ZodPipe(createAnnouncementSchema)) body: CreateAnnouncementInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.announcements.create(body, auth, meta);
  }

  @Get(':id')
  @RequirePermission('announcement.manage')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcements.get(id);
  }

  @Patch(':id')
  @RequirePermission('announcement.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateAnnouncementSchema)) body: UpdateAnnouncementInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.announcements.update(id, body, auth, meta);
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequirePermission('announcement.manage')
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.announcements.send(id, auth, meta);
  }

  @Post(':id/done')
  @HttpCode(200)
  @RequirePermission('announcement.manage')
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(closeAnnouncementSchema)) body: CloseAnnouncementInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.announcements.complete(id, body, auth, meta);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('announcement.manage')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(cancelAnnouncementSchema)) body: CancelAnnouncementInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.announcements.cancel(id, body, auth, meta);
  }
}
