import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@app/observability';
import { NotificationServiceController } from './notification-service.controller.js';
import { NotificationServiceService } from './notification-service.service.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ObservabilityModule],
  controllers: [NotificationServiceController, HealthController],
  providers: [NotificationServiceService],
  exports: [NotificationServiceService],
})
export class NotificationServiceModule {}
