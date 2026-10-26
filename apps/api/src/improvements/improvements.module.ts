import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { ImprovementsController } from './improvements.controller';
import { ImprovementsService } from './improvements.service';

@Module({
  imports: [TicketsModule, AnnouncementsModule],
  controllers: [ImprovementsController],
  providers: [ImprovementsService],
})
export class ImprovementsModule {}
