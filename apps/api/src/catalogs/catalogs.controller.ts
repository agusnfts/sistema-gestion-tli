import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  CATALOG_KINDS,
  catalogItemSchema,
  updateCatalogItemSchema,
  type CatalogItemInput,
  type CatalogKind,
  type UpdateCatalogItemInput,
} from '@tli/shared';
import { CatalogsService } from './catalogs.service';
import { Authenticated, CurrentAuth, ReqMeta, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

const kindPipe = new ZodPipe(z.enum(CATALOG_KINDS));
const listQueryPipe = new ZodPipe(
  z.object({
    includeInactive: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  }),
);

@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  // Los catálogos activos los usan los formularios de cualquier usuario.
  @Get(':kind')
  @Authenticated()
  list(
    @Param('kind', kindPipe) kind: CatalogKind,
    @Query(listQueryPipe) query: { includeInactive: boolean },
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.catalogs.list(
      kind,
      query.includeInactive && auth.permissions.has('catalog.manage'),
    );
  }

  @Post(':kind')
  @RequirePermission('catalog.manage')
  create(
    @Param('kind', kindPipe) kind: CatalogKind,
    @Body(new ZodPipe(catalogItemSchema)) body: CatalogItemInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.create(kind, body, auth, meta);
  }

  @Patch(':kind/:id')
  @RequirePermission('catalog.manage')
  update(
    @Param('kind', kindPipe) kind: CatalogKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateCatalogItemSchema)) body: UpdateCatalogItemInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalogs.update(kind, id, body, auth, meta);
  }
}
