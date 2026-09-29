import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { RateLimitService } from '../common/rate-limit/rate-limit.service.js';

describe('OrdersController', () => {
  let controller: OrdersController;

  const mockOrdersService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
  };

  const mockRateLimitService = {
    consume: vi.fn().mockResolvedValue({ isAllowed: true, remaining: 10, resetSeconds: 60 }),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
        {
          provide: RateLimitService,
          useValue: mockRateLimitService,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should use authenticated user.userId and ignore any client userId', async () => {
      const authUser = {
        userId: 'verified-user-123',
        email: 'user@example.com',
        role: 'USER' as const,
      };

      const dto = {
        items: [{ productId: 'prod-1', quantity: 2 }],
      };

      mockOrdersService.create.mockResolvedValue({ id: 'order-1' });

      await controller.create(authUser, dto, 'key-abc');

      expect(mockOrdersService.create).toHaveBeenCalledWith(
        'verified-user-123',
        dto,
        'key-abc',
      );
    });
  });

  describe('findAll', () => {
    it('should restrict regular USER to only their own orders', async () => {
      const regularUser = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'USER' as const,
      };

      await controller.findAll(regularUser, 'other-user');

      expect(mockOrdersService.findAll).toHaveBeenCalledWith('user-1');
    });

    it('should allow ADMIN to filter orders by queryUserId', async () => {
      const adminUser = {
        userId: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN' as const,
      };

      await controller.findAll(adminUser, 'other-user');

      expect(mockOrdersService.findAll).toHaveBeenCalledWith('other-user');
    });
  });

  describe('findOne', () => {
    it('should allow owner to access their order', async () => {
      const user = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'USER' as const,
      };

      mockOrdersService.findOne.mockResolvedValue({ id: 'order-1', userId: 'user-1' });

      const result = await controller.findOne(user, 'order-1');
      expect(result).toHaveProperty('id', 'order-1');
    });

    it('should throw ForbiddenException if regular user attempts to access another user order', async () => {
      const user = {
        userId: 'user-1',
        email: 'user@example.com',
        role: 'USER' as const,
      };

      mockOrdersService.findOne.mockResolvedValue({ id: 'order-1', userId: 'user-999' });

      await expect(controller.findOne(user, 'order-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow ADMIN to view any order', async () => {
      const admin = {
        userId: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN' as const,
      };

      mockOrdersService.findOne.mockResolvedValue({ id: 'order-1', userId: 'user-999' });

      const result = await controller.findOne(admin, 'order-1');
      expect(result).toHaveProperty('id', 'order-1');
    });
  });
});
