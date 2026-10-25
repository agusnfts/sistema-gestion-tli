import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { F50ImportService } from './f50-import.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [ClientsController],
  providers: [ClientsService, F50ImportService],
})
export class ClientsModule {}
