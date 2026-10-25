import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { SlaMonitorService } from './sla-monitor.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, SlaMonitorService],
  exports: [SlaMonitorService, TicketsService],
})
export class TicketsModule {}
