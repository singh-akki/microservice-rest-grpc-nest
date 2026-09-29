import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis';
import { OrderServiceController } from './order-service.controller.js';
import { OrderServiceService } from './order-service.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    RedisModule,
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
  controllers: [OrderServiceController],
  providers: [OrderServiceService],
  exports: [OrderServiceService],
})
export class OrderServiceModule {}
