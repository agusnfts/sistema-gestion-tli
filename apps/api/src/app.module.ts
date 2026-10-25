import { Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { APP_CONFIG, type AppConfig } from './config/config';
import { PrismaModule } from './prisma/prisma.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AccessGuard } from './auth/access.guard';
import { CsrfGuard } from './auth/csrf.guard';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { CatalogsModule } from './catalogs/catalogs.module';
import { SettingsModule } from './settings/settings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TicketsModule } from './tickets/tickets.module';
import { QueueModule } from './queue/queue.module';
import { FilesModule } from './files/files.module';
import { SearchModule } from './search/similarity.service';
import { ProblemsModule } from './problems/problems.module';
import { ImprovementsModule } from './improvements/improvements.module';
import { DocumentsModule } from './documents/documents.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ClientsModule } from './clients/clients.module';
import { IndexingModule } from './knowledge/indexing.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthController } from './health/health.controller';
import { HttpExceptionFilter } from './common/http-exception.filter';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        // Sintaxis de rutas de Express 5 / path-to-regexp v8 (evita el aviso de ruta legacy "*").
        forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
        pinoHttp: {
          level: config.logLevel,
          transport: config.env === 'development' ? { target: 'pino-pretty' } : undefined,
          autoLogging: { ignore: (req) => req.url === '/api/health' },
          // Nunca loguear credenciales ni cookies.
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.headers["x-csrf-token"]',
            'res.headers["set-cookie"]',
          ],
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
          },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => [
        { name: 'default', ttl: 60_000, limit: config.throttle.defaultLimit },
      ],
    }),
    PrismaModule,
    QueueModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    CatalogsModule,
    SettingsModule,
    NotificationsModule,
    TicketsModule,
    FilesModule,
    SearchModule,
    ProblemsModule,
    ImprovementsModule,
    DocumentsModule,
    IntegrationsModule,
    ClientsModule,
    IndexingModule,
    KnowledgeModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    // Orden: rate limit → CSRF → autenticación/autorización.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: AccessGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
