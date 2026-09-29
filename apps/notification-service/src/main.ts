import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NotificationServiceModule } from './notification-service.module.js';
import { initOpenTelemetry, StructuredLoggerService } from '@app/observability';

async function bootstrap() {
  initOpenTelemetry('notification-service');

  const app = await NestFactory.create(NotificationServiceModule, {
    bufferLogs: true,
  });

  const logger = app.get(StructuredLoggerService);
  logger.setServiceName('notification-service');
  app.useLogger(logger);

  app.connectMicroservice<MicroserviceOptions>({
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
  });

  await app.startAllMicroservices();
  const port = Number(process.env.NOTIFICATION_SERVICE_PORT ?? 3003);
  await app.listen(port);
  logger.log(`Notification Service RabbitMQ consumer listening, HTTP metrics on port ${port}`, 'Bootstrap');
}

await bootstrap();
