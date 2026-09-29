import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'path';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis';
import {
  ObservabilityModule,
  CorrelationIdMiddleware,
  LoggingInterceptor,
  MetricsInterceptor,
} from '@app/observability';
import { OrderServiceController } from './order-service.controller.js';
import { OrderServiceService } from './order-service.service.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
    ObservabilityModule,
    ClientsModule.register([
      {
        name: 'PRODUCT_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'product',
          protoPath: join(process.cwd(), 'proto/product.proto'),
          url: process.env.PRODUCT_GRPC_URL ?? 'localhost:50051',
        },
      },
      {
        name: 'RABBITMQ_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
          queue: 'orders_queue',
          queueOptions: {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': 'orders_dlx',
              'x-dead-letter-routing-key': 'orders_dead_letter',
            },
          },
        },
      },
    ]),
  ],
  controllers: [OrderServiceController, HealthController],
  providers: [
    OrderServiceService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [OrderServiceService],
})
export class OrderServiceModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
