import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationServiceModule } from './notification-service.module.js';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    NotificationServiceModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
        queue: 'orders_queue',
        noAck: false, // Manual acknowledgements for reliability
        prefetchCount: 10,
        queueOptions: {
          durable: true,
          arguments: {
            'x-dead-letter-exchange': 'orders_dlx',
            'x-dead-letter-routing-key': 'orders_dead_letter',
          },
        },
      },
    },
  );

  await app.listen();
}

await bootstrap();
