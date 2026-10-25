// Worker: mismo código que la API, otro proceso (ADR 0014). Procesa los jobs de BullMQ:
// antivirus de adjuntos, envío de mails, monitor de SLA y limpieza periódica.
import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/config';
import { JobRegistry, QUEUE_NAME, QueueService, redisConnection } from './queue/queue.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  const config = app.get<AppConfig>(APP_CONFIG);
  if (config.queue.inline) throw new Error('El worker no corre con QUEUE_INLINE=true');

  const registry = app.get(JobRegistry);
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => registry.run(job.name, (job.data ?? {}) as Record<string, unknown>),
    { connection: redisConnection(config.queue.redisUrl), concurrency: 4 },
  );
  worker.on('failed', (job, err) =>
    logger.warn(`Job ${job?.name} falló: ${err.message}`, 'Worker'),
  );
  await app.get(QueueService).scheduleMaintenance();
  logger.log('Worker iniciado', 'Worker');

  const shutdown = async () => {
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void bootstrap();
