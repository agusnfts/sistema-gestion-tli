import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { ImprovementsController } from './improvements.controller';
import { ImprovementsService } from './improvements.service';

@Module({
  imports: [TicketsModule],
  controllers: [ImprovementsController],
  providers: [ImprovementsService],
})
export class ImprovementsModule {}
