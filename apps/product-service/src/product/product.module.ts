import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ProductService } from './product.service.js';
import { ProductController } from './product.controller.js';
import { HealthController } from '../health.controller.js';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis';
import { ObservabilityModule, GrpcObservabilityInterceptor } from '@app/observability';

@Module({
  imports: [DatabaseModule, RedisModule, ObservabilityModule],
  providers: [
    ProductService,
    {
      provide: APP_INTERCEPTOR,
      useClass: GrpcObservabilityInterceptor,
    },
  ],
  controllers: [ProductController, HealthController],
  exports: [ProductService],
})
export class ProductModule { }
