import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithTraceContext } from './trace-context.js';
import { trace } from '@opentelemetry/api';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const rawCorrelationId =
      req.headers['x-correlation-id'] ??
      req.headers['x-request-id'];

    const correlationId = Array.isArray(rawCorrelationId)
      ? rawCorrelationId[0]
      : (rawCorrelationId ?? randomUUID());

    // Extract W3C traceparent (format: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01)
    let traceId: string | undefined;
    let spanId: string | undefined;

    const traceparent = req.headers['traceparent'] as string | undefined;
    if (traceparent) {
      const parts = traceparent.split('-');
      if (parts.length >= 4) {
        traceId = parts[1];
        spanId = parts[2];
      }
    }

    if (!traceId) {
      const activeSpan = trace.getActiveSpan()?.spanContext();
      if (activeSpan) {
        traceId = activeSpan.traceId;
        spanId = activeSpan.spanId;
      }
    }

    // Set response headers
    res.setHeader('x-correlation-id', correlationId);
    res.setHeader('x-request-id', correlationId);

    // Bind current execution context
    runWithTraceContext(
      {
        correlationId,
        traceId,
        spanId,
        serviceName: process.env.SERVICE_NAME ?? 'api-gateway',
      },
      () => next(),
    );
  }
}
