import { Test, TestingModule } from '@nestjs/testing';
import { OrderServiceController } from './order-service.controller.js';
import { OrderServiceService } from './order-service.service.js';

describe('OrderServiceController', () => {
  let orderServiceController: OrderServiceController;

  const mockOrderService = {
    create: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [OrderServiceController],
      providers: [
        {
          provide: OrderServiceService,
          useValue: mockOrderService,
        },
      ],
    }).compile();

    orderServiceController = app.get<OrderServiceController>(OrderServiceController);
  });

  it('should be defined', () => {
    expect(orderServiceController).toBeDefined();
  });

  it('should find all orders', async () => {
    const result = await orderServiceController.findAll();
    expect(result).toEqual([]);
    expect(mockOrderService.findAll).toHaveBeenCalled();
  });
});
