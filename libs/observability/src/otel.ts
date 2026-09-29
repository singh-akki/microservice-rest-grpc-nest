import {
  trace,
  context,
  Span,
  SpanStatusCode,
  Tracer,
  propagation,
} from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

let sdk: NodeSDK | null = null;

export function initOpenTelemetry(serviceName: string): NodeSDK | null {
  if (process.env.OTEL_ENABLED === 'false') {
    return null;
  }

  try {
    const otlpEndpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces';

    const traceExporter = new OTLPTraceExporter({
      url: otlpEndpoint,
      timeoutMillis: 2000,
    });

    sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: '1.0.0',
        'deployment.environment': process.env.NODE_ENV ?? 'development',
      }),
      traceExporter,
    });

    sdk.start();

    process.on('SIGTERM', () => {
      sdk
        ?.shutdown()
        .catch(() => {})
        .finally(() => process.exit(0));
    });

    return sdk;
  } catch (error) {
    console.warn(`[OTel] Failed to initialize OpenTelemetry for ${serviceName}:`, error);
    return null;
  }
}

/**
 * Returns a named tracer for manual instrumentation
 */
export function getTracer(name = 'ecommerce-tracer'): Tracer {
  return trace.getTracer(name);
}

/**
 * Wraps an asynchronous operation in an OpenTelemetry active span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      span.setAttributes(attributes);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: any) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message ?? String(error),
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Injects the active trace context into headers (HTTP headers, gRPC metadata, or RMQ headers)
 */
export function injectTraceHeaders(headers: Record<string, any> = {}): Record<string, any> {
  propagation.inject(context.active(), headers);
  return headers;
}

/**
 * Extracts trace context from headers
 */
export function extractTraceHeaders(headers: Record<string, any>) {
  return propagation.extract(context.active(), headers);
}
