import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@tli/db';
import type { ApiError } from '@tli/shared';
import type { Response } from 'express';

/** Normaliza errores a { statusCode, message, issues?, code? } sin filtrar detalles internos. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toApiError(exception);
    if (body.statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError & { code?: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') return { statusCode: status, message: response };
      const r = response as {
        message?: string | string[];
        issues?: ApiError['issues'];
        code?: string;
      };
      const message = Array.isArray(r.message)
        ? r.message.join('; ')
        : (r.message ?? exception.message);
      return { statusCode: status, message, issues: r.issues, code: r.code };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return { statusCode: HttpStatus.CONFLICT, message: 'Ya existe un registro con esos datos' };
      }
      if (exception.code === 'P2003') {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referencia a un registro inexistente',
        };
      }
      if (exception.code === 'P2025') {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'No encontrado' };
      }
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Error interno' };
  }
}
