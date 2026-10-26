import { Module } from '@nestjs/common';
import {
  AnnouncementsController,
  DistributionListsController,
  SystemsController,
} from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { SystemsService } from './systems.service';

@Module({
  controllers: [SystemsController, DistributionListsController, AnnouncementsController],
  providers: [AnnouncementsService, SystemsService],
  exports: [SystemsService],
})
export class AnnouncementsModule {}
