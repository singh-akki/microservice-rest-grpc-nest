import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProductModule } from './product/product.module.js';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
    const app = await NestFactory.createMicroservice<MicroserviceOptions>(ProductModule, {
        transport: Transport.GRPC, options: {
            package: 'product',

            protoPath: join(
                process.cwd(),
                'proto/product.proto',
            ),

            url: '0.0.0.0:50051',
        },
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    await app.listen();
}

bootstrap();