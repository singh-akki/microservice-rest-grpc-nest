import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
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
    ]),
    AuthModule,
  ],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule { }
