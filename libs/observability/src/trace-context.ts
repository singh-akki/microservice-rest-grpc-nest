import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceContext {
  correlationId: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  serviceName?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Returns the active trace context from the current execution context.
 */
export function getTraceContext(): TraceContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Retrieves the active correlation ID or generates a fallback UUID.
 */
export function getCorrelationId(): string {
  const store = asyncLocalStorage.getStore();
  return store?.correlationId ?? randomUUID();
}

/**
 * Retrieves the active trace ID if available.
 */
export function getTraceId(): string | undefined {
  return asyncLocalStorage.getStore()?.traceId;
}

/**
 * Executes a function within the specified trace context.
 */
export function runWithTraceContext<T>(context: TraceContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Updates properties in the current trace context if active.
 */
export function updateTraceContext(partial: Partial<TraceContext>): void {
  const current = asyncLocalStorage.getStore();
  if (current) {
    Object.assign(current, partial);
  }
}
