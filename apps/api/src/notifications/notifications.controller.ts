import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { Authenticated, CurrentAuth } from '../common/decorators';
import type { AuthContext } from '../common/auth-context';

@Controller('notifications')
@Authenticated()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query('unread') unread?: string) {
    return this.notifications.list(auth.user.id, unread === 'true');
  }

  // La campana consulta periódicamente: no consume el límite general.
  @Get('unread-count')
  @SkipThrottle()
  async unreadCount(@CurrentAuth() auth: AuthContext) {
    return { count: await this.notifications.unreadCount(auth.user.id) };
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(auth.user.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  markAllRead(@CurrentAuth() auth: AuthContext) {
    return this.notifications.markAllRead(auth.user.id);
  }
}
