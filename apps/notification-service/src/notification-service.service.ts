import { Injectable, Logger } from '@nestjs/common';

export interface OrderCreatedEvent {
  orderId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  total: number;
  items: {
    productId: string;
    quantity: number;
    price: number;
  }[];
  createdAt: string;
}

@Injectable()
export class NotificationServiceService {
  private readonly logger = new Logger(NotificationServiceService.name);

  async processOrderConfirmation(event: OrderCreatedEvent): Promise<void> {
    const recipient = event.userEmail || event.userId;
    const formattedTotal = Number(event.total).toFixed(2);

    this.logger.log(
      `📧 [EMAIL CONFIRMATION DISPATCHED] Order #${event.orderId} for ${event.userName ?? 'Customer'} (${recipient}) | Total: $${formattedTotal} | Items: ${event.items.length}`,
    );
  }
}
