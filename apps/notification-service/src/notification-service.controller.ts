import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { NotificationServiceService } from './notification-service.service.js';
import type { OrderCreatedEvent } from './notification-service.service.js';

@Controller()
export class NotificationServiceController {
  private readonly logger = new Logger(NotificationServiceController.name);

  constructor(
    private readonly notificationService: NotificationServiceService,
  ) { }

  @EventPattern('order.created')
  async handleOrderCreated(
    @Payload() data: OrderCreatedEvent,
    @Ctx() context: any,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Received order.created event for Order #${data.orderId}`);
      await this.notificationService.processOrderConfirmation(data);

      // Explicit Positive Acknowledgement (ACK)
      channel.ack(originalMsg);
      this.logger.log(`Successfully acknowledged order.created event for Order #${data.orderId}`);
    } catch (error: any) {
      this.logger.error(
        `Error processing notification for Order #${data.orderId}: ${error.message}`,
      );

      const headers = originalMsg.properties?.headers || {};
      const retryCount = (headers['x-retry-count'] || 0) + 1;
      const MAX_RETRIES = 3;

      if (retryCount <= MAX_RETRIES) {
        this.logger.warn(
          `Requeuing order #${data.orderId} for retry (attempt ${retryCount}/${MAX_RETRIES})...`,
        );
        // NACK with requeue=true for retry
        channel.nack(originalMsg, false, true);
      } else {
        this.logger.error(
          `Max retries (${MAX_RETRIES}) reached for Order #${data.orderId}. Routing to Dead Letter Queue (DLQ).`,
        );
        // NACK with requeue=false -> RabbitMQ routes to Dead Letter Exchange (DLX)
        channel.nack(originalMsg, false, false);
      }
    }
  }
}
