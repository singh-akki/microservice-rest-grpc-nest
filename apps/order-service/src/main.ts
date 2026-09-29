import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { OrderServiceModule } from './order-service.module.js';
import { initOpenTelemetry, StructuredLoggerService } from '@app/observability';

async function bootstrap() {
  initOpenTelemetry('order-service');

  const app = await NestFactory.create(OrderServiceModule, {
    bufferLogs: true,
  });

  const logger = app.get(StructuredLoggerService);
  logger.setServiceName('order-service');
  app.useLogger(logger);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.ORDER_SERVICE_PORT ?? 3002);
  await app.listen(port);
  logger.log(`Order Service started successfully on port ${port}`, 'Bootstrap');
}

await bootstrap();
