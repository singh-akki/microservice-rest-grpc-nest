import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { OrderServiceModule } from './order-service.module.js';

async function bootstrap() {
  const app = await NestFactory.create(OrderServiceModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.ORDER_SERVICE_PORT ?? 3002);
  await app.listen(port);
}

await bootstrap();
