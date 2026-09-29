import { Injectable, OnModuleInit } from '@nestjs/common';
import client, { Registry, Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // HTTP Metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDurationSeconds: Histogram<string>;

  // gRPC Metrics
  public readonly grpcRequestsTotal: Counter<string>;
  public readonly grpcRequestDurationSeconds: Histogram<string>;

  // Database Metrics
  public readonly dbQueriesTotal: Counter<string>;
  public readonly dbQueryDurationSeconds: Histogram<string>;

  // Business & Messaging Metrics
  public readonly ordersCreatedTotal: Counter<string>;
  public readonly stockReservationsTotal: Counter<string>;
  public readonly rabbitmqMessagesTotal: Counter<string>;
  public readonly rabbitmqProcessingDurationSeconds: Histogram<string>;

  constructor() {
    this.registry = new Registry();

    // Collect default runtime and process metrics (CPU, Memory, Event Loop)
    client.collectDefaultMetrics({
      register: this.registry,
      prefix: 'ecom_',
    });

    // 1. HTTP Metrics
    this.httpRequestsTotal = new Counter({
      name: 'ecom_http_requests_total',
      help: 'Total number of HTTP requests processed',
      labelNames: ['method', 'route', 'status_code', 'service'],
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'ecom_http_request_duration_seconds',
      help: 'HTTP request latency duration in seconds',
      labelNames: ['method', 'route', 'status_code', 'service'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // 2. gRPC Metrics
    this.grpcRequestsTotal = new Counter({
      name: 'ecom_grpc_requests_total',
      help: 'Total number of gRPC requests processed',
      labelNames: ['service', 'method', 'status'],
      registers: [this.registry],
    });

    this.grpcRequestDurationSeconds = new Histogram({
      name: 'ecom_grpc_request_duration_seconds',
      help: 'gRPC request latency duration in seconds',
      labelNames: ['service', 'method', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    // 3. Database Metrics
    this.dbQueriesTotal = new Counter({
      name: 'ecom_database_queries_total',
      help: 'Total database queries executed',
      labelNames: ['operation', 'model', 'status'],
      registers: [this.registry],
    });

    this.dbQueryDurationSeconds = new Histogram({
      name: 'ecom_database_query_duration_seconds',
      help: 'Database query execution duration in seconds',
      labelNames: ['operation', 'model', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
      registers: [this.registry],
    });

    // 4. Business & Messaging Metrics
    this.ordersCreatedTotal = new Counter({
      name: 'ecom_orders_created_total',
      help: 'Total orders created by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.stockReservationsTotal = new Counter({
      name: 'ecom_stock_reservations_total',
      help: 'Total stock reservation attempts by outcome',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.rabbitmqMessagesTotal = new Counter({
      name: 'ecom_rabbitmq_messages_total',
      help: 'Total RabbitMQ messages processed by queue and outcome',
      labelNames: ['queue', 'event', 'status'],
      registers: [this.registry],
    });

    this.rabbitmqProcessingDurationSeconds = new Histogram({
      name: 'ecom_rabbitmq_processing_duration_seconds',
      help: 'RabbitMQ message processing duration in seconds',
      labelNames: ['queue', 'event', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
  }

  onModuleInit() {}

  // Helper recorder methods
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
    service = process.env.SERVICE_NAME ?? 'api-gateway',
  ) {
    const labels = {
      method: method.toUpperCase(),
      route: route || 'unknown',
      status_code: String(statusCode),
      service,
    };
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);
  }

  recordGrpcRequest(
    service: string,
    method: string,
    status: 'success' | 'error',
    durationSeconds: number,
  ) {
    const labels = { service, method, status };
    this.grpcRequestsTotal.inc(labels);
    this.grpcRequestDurationSeconds.observe(labels, durationSeconds);
  }

  recordDbQuery(
    operation: string,
    model: string,
    durationSeconds: number,
    status: 'success' | 'error' = 'success',
  ) {
    const labels = { operation, model, status };
    this.dbQueriesTotal.inc(labels);
    this.dbQueryDurationSeconds.observe(labels, durationSeconds);
  }

  recordOrder(status: 'CONFIRMED' | 'FAILED' | 'CANCELLED') {
    this.ordersCreatedTotal.inc({ status });
  }

  recordStockReservation(status: 'SUCCESS' | 'INSUFFICIENT_STOCK' | 'ERROR') {
    this.stockReservationsTotal.inc({ status });
  }

  recordRabbitMq(
    queue: string,
    event: string,
    status: 'ACK' | 'RETRY' | 'DLQ',
    durationSeconds: number,
  ) {
    const labels = { queue, event, status };
    this.rabbitmqMessagesTotal.inc(labels);
    this.rabbitmqProcessingDurationSeconds.observe(labels, durationSeconds);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

// Global singleton instance for non-DI usages (e.g. Prisma callbacks)
export const globalMetrics = new MetricsService();
