import { Controller, Logger, Optional } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { runWithTraceContext, MetricsService } from '@app/observability';
import { NotificationServiceService } from './notification-service.service.js';
import type { OrderCreatedEvent } from './notification-service.service.js';

@Controller()
export class NotificationServiceController {
  private readonly logger = new Logger(NotificationServiceController.name);

  constructor(
    private readonly notificationService: NotificationServiceService,
    @Optional() private readonly metricsService?: MetricsService,
  ) { }

  @EventPattern('order.created')
  async handleOrderCreated(
    @Payload() data: OrderCreatedEvent,
    @Ctx() context: any,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    const headers = originalMsg.properties?.headers || {};

    const correlationId =
      (data as any).correlationId ||
      headers['x-correlation-id'] ||
      randomUUID();

    const start = performance.now();

    return runWithTraceContext(
      {
        correlationId,
        serviceName: 'notification-service',
      },
      async () => {
        try {
          this.logger.log(`Received order.created event for Order #${data.orderId}`);
          await this.notificationService.processOrderConfirmation(data);

          // Explicit Positive Acknowledgement (ACK)
          channel.ack(originalMsg);
          const durationSec = (performance.now() - start) / 1000;
          this.metricsService?.recordRabbitMq('orders_queue', 'order.created', 'ACK', durationSec);
          this.logger.log(`Successfully acknowledged order.created event for Order #${data.orderId}`);
        } catch (error: any) {
          const durationSec = (performance.now() - start) / 1000;
          this.logger.error(
            `Error processing notification for Order #${data.orderId}: ${error.message}`,
          );

          const retryCount = (headers['x-retry-count'] || 0) + 1;
          const MAX_RETRIES = 3;

          if (retryCount <= MAX_RETRIES) {
            this.metricsService?.recordRabbitMq('orders_queue', 'order.created', 'RETRY', durationSec);
            this.logger.warn(
              `Requeuing order #${data.orderId} for retry (attempt ${retryCount}/${MAX_RETRIES})...`,
            );
            // NACK with requeue=true for retry
            channel.nack(originalMsg, false, true);
          } else {
            this.metricsService?.recordRabbitMq('orders_queue', 'order.created', 'DLQ', durationSec);
            this.logger.error(
              `Max retries (${MAX_RETRIES}) reached for Order #${data.orderId}. Routing to Dead Letter Queue (DLQ).`,
            );
            // NACK with requeue=false -> RabbitMQ routes to Dead Letter Exchange (DLX)
            channel.nack(originalMsg, false, false);
          }
        }
      },
    );
  }
}
