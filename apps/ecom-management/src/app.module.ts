import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SrcModule } from './product/src/src.module.js';

@Module({
  imports: [SrcModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
