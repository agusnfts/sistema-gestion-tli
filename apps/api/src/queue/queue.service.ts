import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, type ConnectionOptions } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/config';

/** Jobs en segundo plano (ADR 0014). */
export type JobName =
  | 'files.scan'
  | 'documents.extract'
  | 'email.send'
  | 'maintenance.sla'
  | 'maintenance.cleanup'
  | 'announcements.reminders';
type Handler = (data: Record<string, unknown>) => Promise<void>;

export const QUEUE_NAME = 'tli';

export function redisConnection(url: string): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
    // BullMQ lo exige para los workers.
    maxRetriesPerRequest: null,
  };
}

/** Cada módulo registra acá cómo se procesa cada job. Lo usan el worker y el modo inline. */
@Injectable()
export class JobRegistry {
  private readonly handlers = new Map<JobName, Handler>();

  register(name: JobName, handler: Handler): void {
    this.handlers.set(name, handler);
  }

  async run(name: string, data: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(name as JobName);
    if (!handler) throw new Error(`No hay handler para el job ${name}`);
    await handler(data);
  }
}

/**
 * Encola jobs en Redis (BullMQ) para que los procese el worker.
 * Con QUEUE_INLINE=true (tests) los ejecuta en el momento, en el mismo proceso.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue?: Queue;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly registry: JobRegistry,
  ) {
    if (!config.queue.inline) {
      this.queue = new Queue(QUEUE_NAME, { connection: redisConnection(config.queue.redisUrl) });
    }
  }

  async add(
    name: JobName,
    data: Record<string, unknown>,
    opts: { attempts?: number } = {},
  ): Promise<void> {
    if (!this.queue) {
      await this.registry.run(name, data);
      return;
    }
    await this.queue.add(name, data, {
      attempts: opts.attempts ?? 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  /** Programa los jobs periódicos (solo lo llama el worker). */
  async scheduleMaintenance(): Promise<void> {
    if (!this.queue) return;
    await this.queue.upsertJobScheduler(
      'sla-cada-minuto',
      { every: 60_000 },
      { name: 'maintenance.sla' },
    );
    await this.queue.upsertJobScheduler(
      'limpieza-cada-hora',
      { every: 3_600_000 },
      { name: 'maintenance.cleanup' },
    );
    await this.queue.upsertJobScheduler(
      'recordatorios-de-avisos',
      { every: 5 * 60_000 },
      { name: 'announcements.reminders' },
    );
    this.logger.log('Jobs periódicos programados');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
