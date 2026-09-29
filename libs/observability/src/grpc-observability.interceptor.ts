import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { runWithTraceContext } from './trace-context.js';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class GrpcObservabilityInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'rpc') {
      return next.handle();
    }

    const rpc = context.switchToRpc();
    const metadata = rpc.getContext();
    let correlationId: string | undefined;

    if (metadata && typeof metadata.get === 'function') {
      const values = metadata.get('x-correlation-id');
      if (Array.isArray(values) && values.length > 0) {
        correlationId = String(values[0]);
      } else if (values) {
        correlationId = String(values);
      }
    }

    if (!correlationId) {
      correlationId = randomUUID();
    }

    const handler = context.getHandler().name;
    const service = context.getClass().name;
    const start = performance.now();

    return new Observable((subscriber) => {
      runWithTraceContext(
        {
          correlationId,
          serviceName: process.env.SERVICE_NAME ?? 'product-service',
        },
        () => {
          next.handle().subscribe({
            next: (val) => {
              const durationSec = (performance.now() - start) / 1000;
              this.metrics.recordGrpcRequest(service, handler, 'success', durationSec);
              subscriber.next(val);
            },
            error: (err) => {
              const durationSec = (performance.now() - start) / 1000;
              this.metrics.recordGrpcRequest(service, handler, 'error', durationSec);
              subscriber.error(err);
            },
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
