import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const type = context.getType();
    if (type !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const start = performance.now();
    const method = req.method;

    return next.handle().pipe(
      tap({
        next: () => {
          const durationSeconds = (performance.now() - start) / 1000;
          // Normalise parameterized route (e.g. /api/products/:id rather than specific UUID) if available
          const route = req.route?.path || req.baseUrl || req.path || 'unknown';
          const statusCode = res.statusCode ?? 200;
          this.metricsService.recordHttpRequest(method, route, statusCode, durationSeconds);
        },
        error: (error) => {
          const durationSeconds = (performance.now() - start) / 1000;
          const route = req.route?.path || req.baseUrl || req.path || 'unknown';
          const statusCode = error.status ?? error.statusCode ?? 500;
          this.metricsService.recordHttpRequest(method, route, statusCode, durationSeconds);
        },
      }),
    );
  }
}
