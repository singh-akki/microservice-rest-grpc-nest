import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProductModule } from './product/product.module.js';

async function bootstrap() {
    const app = await NestFactory.create(ProductModule);

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    await app.listen(3001);
}

bootstrap();