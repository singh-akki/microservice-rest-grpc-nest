import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [HttpModule, AuthModule],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService],
})
export class ProductsModule { }
