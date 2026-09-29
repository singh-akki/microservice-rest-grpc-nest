import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { StructuredLoggerService } from './structured-logger.service.js';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new StructuredLoggerService();

  constructor() {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const type = context.getType();
    if (type !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const { method, originalUrl, url } = req;
    const path = originalUrl || url;
    const start = performance.now();

    this.logger.debug(`Incoming ${method} ${path}`, 'LoggingInterceptor');

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Math.round((performance.now() - start) * 100) / 100;
          const statusCode = res.statusCode ?? 200;
          this.logger.log(
            `${method} ${path} ${statusCode} +${durationMs}ms`,
            'LoggingInterceptor',
            { method, path, statusCode, durationMs },
          );
        },
        error: (error) => {
          const durationMs = Math.round((performance.now() - start) * 100) / 100;
          const statusCode = error.status ?? error.statusCode ?? 500;
          this.logger.error(
            `${method} ${path} ${statusCode} +${durationMs}ms: ${error.message}`,
            error.stack,
            'LoggingInterceptor',
          );
        },
      }),
    );
  }
}
