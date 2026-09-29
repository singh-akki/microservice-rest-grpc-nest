import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';
import { MetricsController } from './metrics.controller.js';
import { StructuredLoggerService } from './structured-logger.service.js';
import { LoggingInterceptor } from './logging.interceptor.js';
import { MetricsInterceptor } from './metrics.interceptor.js';
import { GrpcObservabilityInterceptor } from './grpc-observability.interceptor.js';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: StructuredLoggerService,
      useFactory: () => new StructuredLoggerService(),
    },
    LoggingInterceptor,
    MetricsInterceptor,
    GrpcObservabilityInterceptor,
  ],
  exports: [
    MetricsService,
    StructuredLoggerService,
    LoggingInterceptor,
    MetricsInterceptor,
    GrpcObservabilityInterceptor,
  ],
})
export class ObservabilityModule {}
