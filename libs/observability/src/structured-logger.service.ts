import { Injectable, LoggerService } from '@nestjs/common';
import { getCorrelationId, getTraceContext } from './trace-context.js';
import { trace } from '@opentelemetry/api';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  context?: string;
  message: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private serviceName = process.env.SERVICE_NAME ?? 'ecommerce-service';
  private readonly isJson = process.env.LOG_FORMAT !== 'pretty';
  private defaultContext?: string;

  setContext(context: string) {
    this.defaultContext = context;
  }

  setServiceName(name: string) {
    this.serviceName = name;
  }

  private formatEntry(
    level: LogLevel,
    message: any,
    context?: string,
    metadata?: Record<string, unknown>,
  ): StructuredLogEntry {
    const activeSpan = trace.getActiveSpan()?.spanContext();
    const traceCtx = getTraceContext();

    const traceId = activeSpan?.traceId ?? traceCtx?.traceId;
    const spanId = activeSpan?.spanId ?? traceCtx?.spanId;
    const correlationId = traceCtx?.correlationId ?? getCorrelationId();

    const textMessage =
      typeof message === 'object' && message !== null
        ? (message.message ?? JSON.stringify(message))
        : String(message);

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      context: context ?? this.defaultContext ?? 'Application',
      message: textMessage,
      correlationId,
      ...(traceId && { traceId }),
      ...(spanId && { spanId }),
    };

    if (metadata && typeof metadata === 'object') {
      Object.assign(entry, metadata);
    }

    if (typeof message === 'object' && message !== null && !metadata) {
      const { message: _, ...rest } = message;
      if (Object.keys(rest).length > 0) {
        Object.assign(entry, rest);
      }
    }

    return entry;
  }

  private output(entry: StructuredLogEntry) {
    if (this.isJson) {
      const line = JSON.stringify(entry);
      if (entry.level === 'ERROR' || entry.level === 'FATAL') {
        process.stderr.write(line + '\n');
      } else {
        process.stdout.write(line + '\n');
      }
    } else {
      const time = entry.timestamp.split('T')[1]?.replace('Z', '') ?? entry.timestamp;
      const ctx = entry.context ? `[${entry.context}] ` : '';
      const corr = entry.correlationId ? `(cid: ${entry.correlationId.slice(0, 8)}) ` : '';
      const line = `[${time}] ${entry.level.padEnd(5)} [${entry.service}] ${ctx}${corr}${entry.message}`;
      if (entry.level === 'ERROR' || entry.level === 'FATAL') {
        console.error(line);
      } else {
        console.log(line);
      }
    }
  }

  log(message: any, context?: string, metadata?: Record<string, unknown>): void;
  log(message: any, ...optionalParams: any[]): void {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : undefined;
    const metadata = typeof optionalParams[0] === 'object' ? optionalParams[0] : optionalParams[1];
    this.output(this.formatEntry('INFO', message, context, metadata));
  }

  error(message: any, stack?: string, context?: string, metadata?: Record<string, unknown>): void;
  error(message: any, ...optionalParams: any[]): void {
    let stack: string | undefined;
    let context: string | undefined;
    let metadata: Record<string, unknown> | undefined;

    if (typeof optionalParams[0] === 'string') {
      if (optionalParams[0].includes('\n') || optionalParams[0].includes('Error:')) {
        stack = optionalParams[0];
        context = typeof optionalParams[1] === 'string' ? optionalParams[1] : undefined;
      } else {
        context = optionalParams[0];
      }
    } else if (typeof optionalParams[0] === 'object') {
      metadata = optionalParams[0];
    }

    const entry = this.formatEntry('ERROR', message, context, {
      ...(stack ? { stack } : {}),
      ...metadata,
    });
    this.output(entry);
  }

  warn(message: any, context?: string, metadata?: Record<string, unknown>): void;
  warn(message: any, ...optionalParams: any[]): void {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : undefined;
    const metadata = typeof optionalParams[0] === 'object' ? optionalParams[0] : optionalParams[1];
    this.output(this.formatEntry('WARN', message, context, metadata));
  }

  debug(message: any, context?: string, metadata?: Record<string, unknown>): void;
  debug(message: any, ...optionalParams: any[]): void {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : undefined;
    const metadata = typeof optionalParams[0] === 'object' ? optionalParams[0] : optionalParams[1];
    this.output(this.formatEntry('DEBUG', message, context, metadata));
  }

  verbose(message: any, context?: string): void;
  verbose(message: any, ...optionalParams: any[]): void {
    const context = typeof optionalParams[0] === 'string' ? optionalParams[0] : undefined;
    this.output(this.formatEntry('DEBUG', message, context));
  }

  fatal(message: any, context?: string): void {
    this.output(this.formatEntry('FATAL', message, context));
  }
}
