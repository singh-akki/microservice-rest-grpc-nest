import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis';

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [ProductService],
  controllers: [ProductController],
})
export class ProductModule { }
