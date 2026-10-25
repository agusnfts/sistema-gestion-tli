import { Global, Module } from '@nestjs/common';
import { JobRegistry, QueueService } from './queue.service';

@Global()
@Module({ providers: [JobRegistry, QueueService], exports: [JobRegistry, QueueService] })
export class QueueModule {}
