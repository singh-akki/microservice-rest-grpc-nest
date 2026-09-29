import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { NotificationServiceController } from './notification-service.controller.js';
import { NotificationServiceService, OrderCreatedEvent } from './notification-service.service.js';

describe('NotificationServiceController', () => {
  let controller: NotificationServiceController;

  const mockNotificationService = {
    processOrderConfirmation: vi.fn(),
  };

  const mockChannel = {
    ack: vi.fn(),
    nack: vi.fn(),
  };

  const createMockContext = (retryCount = 0) => {
    const mockMessage = {
      fields: { deliveryTag: 1 },
      properties: {
        headers: {
          'x-retry-count': retryCount,
        },
      },
    };

    return {
      getChannelRef: vi.fn().mockReturnValue(mockChannel),
      getMessage: vi.fn().mockReturnValue(mockMessage),
    } as unknown as RmqContext;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationServiceController],
      providers: [
        {
          provide: NotificationServiceService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    controller = module.get<NotificationServiceController>(
      NotificationServiceController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  const eventPayload: OrderCreatedEvent = {
    orderId: 'order-123',
    userId: 'user-1',
    userEmail: 'user@example.com',
    userName: 'John Doe',
    total: 99.99,
    items: [{ productId: 'prod-1', quantity: 2, price: 49.99 }],
    createdAt: new Date().toISOString(),
  };

  it('should process order confirmation and send positive ACK', async () => {
    const context = createMockContext(0);
    mockNotificationService.processOrderConfirmation.mockResolvedValue(undefined);

    await controller.handleOrderCreated(eventPayload, context);

    expect(mockNotificationService.processOrderConfirmation).toHaveBeenCalledWith(
      eventPayload,
    );
    expect(mockChannel.ack).toHaveBeenCalled();
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('should NACK with requeue=true for retry when processing fails on first attempt', async () => {
    const context = createMockContext(0); // attempt 1
    mockNotificationService.processOrderConfirmation.mockRejectedValue(
      new Error('Email provider timeout'),
    );

    await controller.handleOrderCreated(eventPayload, context);

    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockChannel.nack).toHaveBeenCalledWith(
      context.getMessage(),
      false,
      true, // requeue = true
    );
  });

  it('should NACK with requeue=false (routing to DLQ) when max retries exceeded', async () => {
    const context = createMockContext(3); // attempt 4 > max 3
    mockNotificationService.processOrderConfirmation.mockRejectedValue(
      new Error('Permanent failure'),
    );

    await controller.handleOrderCreated(eventPayload, context);

    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockChannel.nack).toHaveBeenCalledWith(
      context.getMessage(),
      false,
      false, // requeue = false -> sent to DLQ
    );
  });
});
