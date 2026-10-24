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
} from '@nestjs/common';
import {
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
} from '@tli/shared';
import { RolesService } from './roles.service';
import {
  CurrentAuth,
  ReqMeta,
  RequireAnyPermission,
  RequirePermission,
} from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext, RequestMeta } from '../common/auth-context';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  // Quien administra usuarios necesita ver los roles para asignarlos.
  @Get()
  @RequireAnyPermission('role.manage', 'user.manage')
  list() {
    return this.roles.list();
  }

  @Post()
  @RequirePermission('role.manage')
  create(
    @Body(new ZodPipe(createRoleSchema)) body: CreateRoleInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.create(body, auth, meta);
  }

  @Patch(':id')
  @RequirePermission('role.manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateRoleSchema)) body: UpdateRoleInput,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.update(id, body, auth, meta);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('role.manage')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuth() auth: AuthContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.roles.remove(id, auth, meta);
  }
}
