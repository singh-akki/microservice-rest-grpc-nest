import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProductModule } from './product/product.module.js';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { initOpenTelemetry, StructuredLoggerService } from '@app/observability';

async function bootstrap() {
    initOpenTelemetry('product-service');

    const app = await NestFactory.create(ProductModule, {
        bufferLogs: true,
    });

    const logger = app.get(StructuredLoggerService);
    logger.setServiceName('product-service');
    app.useLogger(logger);

    app.connectMicroservice<MicroserviceOptions>({
        transport: Transport.GRPC,
        options: {
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

    await app.startAllMicroservices();
    const port = Number(process.env.PRODUCT_SERVICE_PORT ?? 3001);
    await app.listen(port);
    logger.log(`Product gRPC microservice listening on 0.0.0.0:50051 and HTTP metrics on port ${port}`, 'Bootstrap');
}

bootstrap();