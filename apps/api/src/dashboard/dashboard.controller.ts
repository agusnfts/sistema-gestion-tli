import { Controller, Get, Query } from '@nestjs/common';
import { dashboardQuerySchema, type DashboardQuery } from '@tli/shared';
import { DashboardService } from './dashboard.service';
import { CurrentAuth, RequirePermission } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import type { AuthContext } from '../common/auth-context';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @RequirePermission('dashboard.view')
  get(
    @Query(new ZodPipe(dashboardQuerySchema)) query: DashboardQuery,
    @CurrentAuth() auth: AuthContext,
  ) {
    return this.dashboard.get(query, auth);
  }
}
