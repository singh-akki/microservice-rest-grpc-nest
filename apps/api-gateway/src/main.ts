import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { ApiGatewayModule } from './api-gateway.module.js';
import { initOpenTelemetry, StructuredLoggerService } from '@app/observability';

async function bootstrap() {
  initOpenTelemetry('api-gateway');

  const app = await NestFactory.create(ApiGatewayModule, {
    bufferLogs: true,
  });

  const logger = app.get(StructuredLoggerService);
  logger.setServiceName('api-gateway');
  app.useLogger(logger);

  const config = app.get(ConfigService);
  app.use(helmet());

  const origins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins.length > 0 ? origins : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'x-correlation-id',
      'x-request-id',
      'traceparent',
    ],
  });

  app.setGlobalPrefix('api', {
    exclude: ['metrics', 'metrics/(.*)'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>(
    'API_GATEWAY_PORT',
    3000,
  );

  await app.listen(port);
  logger.log(`API Gateway started successfully on port ${port}`, 'Bootstrap');
}
await bootstrap();
