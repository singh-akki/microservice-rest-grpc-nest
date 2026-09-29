import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { of } from 'rxjs';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis';
import { OrderServiceService } from './order-service.service.js';

describe('OrderServiceService', () => {
  let service: OrderServiceService;

  const mockDb = {
    user: {
      findUnique: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    setIfNotExists: vi.fn().mockResolvedValue(true),
  };

  const mockGrpcService = {
    checkStock: vi.fn(),
    reserveStock: vi.fn(),
    releaseStock: vi.fn(),
  };

  const mockClientGrpc = {
    getService: vi.fn().mockReturnValue(mockGrpcService),
  };

  const mockRabbitClient = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setIfNotExists.mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderServiceService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: RedisService,
          useValue: mockRedis,
        },
        {
          provide: 'PRODUCT_PACKAGE',
          useValue: mockClientGrpc,
        },
        {
          provide: 'RABBITMQ_SERVICE',
          useValue: mockRabbitClient,
        },
      ],
    }).compile();

    service = module.get<OrderServiceService>(OrderServiceService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const dto = {
      userId: 'user-1',
      items: [
        { productId: 'prod-1', quantity: 2 },
      ],
    };

    it('should throw NotFoundException if user does not exist', async () => {
      mockDb.user.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('should return cached order if idempotency key was previously processed', async () => {
      const cached = { id: 'cached-order-1', total: 100 } as any;
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.create({
        ...dto,
        idempotencyKey: 'idemp-123',
      });

      expect(result).toBe(cached);
      expect(mockDb.order.create).not.toHaveBeenCalled();
      expect(mockGrpcService.reserveStock).not.toHaveBeenCalled();
    });

    it('should merge duplicate product IDs within the same order', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockGrpcService.checkStock.mockReturnValue(
        of({
          allAvailable: true,
          items: [
            {
              productId: 'prod-1',
              available: true,
              currentStock: 10,
              price: 25,
              name: 'Item A',
              message: 'Available',
            },
          ],
        }),
      );
      mockGrpcService.reserveStock.mockReturnValue(
        of({
          success: true,
          message: 'Reserved',
          failedProductId: '',
        }),
      );
      mockDb.order.create.mockResolvedValue({
        id: 'order-1',
        total: 100,
        items: [{ productId: 'prod-1', quantity: 4, price: 25 }],
      });

      // Passing prod-1 twice with quantity 1 and 3 -> should merge to quantity 4
      await service.create({
        userId: 'user-1',
        items: [
          { productId: 'prod-1', quantity: 1 },
          { productId: 'prod-1', quantity: 3 },
        ],
      });

      expect(mockGrpcService.checkStock).toHaveBeenCalledWith({
        items: [{ productId: 'prod-1', quantity: 4 }],
      });
      expect(mockGrpcService.reserveStock).toHaveBeenCalledWith({
        items: [{ productId: 'prod-1', quantity: 4 }],
      });
    });

    it('should throw BadRequestException if any item is out of stock', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockGrpcService.checkStock.mockReturnValue(
        of({
          allAvailable: false,
          items: [
            {
              productId: 'prod-1',
              available: false,
              currentStock: 1,
              price: 100,
              name: 'Item A',
              message: 'Insufficient stock',
            },
          ],
        }),
      );

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(mockGrpcService.reserveStock).not.toHaveBeenCalled();
      expect(mockDb.order.create).not.toHaveBeenCalled();
    });

    it('should compensate by releasing stock if database order creation fails', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockGrpcService.checkStock.mockReturnValue(
        of({
          allAvailable: true,
          items: [
            {
              productId: 'prod-1',
              available: true,
              currentStock: 10,
              price: 50,
              name: 'Item A',
              message: 'Available',
            },
          ],
        }),
      );
      mockGrpcService.reserveStock.mockReturnValue(
        of({
          success: true,
          message: 'Reserved',
          failedProductId: '',
        }),
      );
      mockGrpcService.releaseStock.mockReturnValue(
        of({
          success: true,
          message: 'Released',
        }),
      );

      // Simulate DB write failure
      mockDb.order.create.mockRejectedValue(new Error('DB Connection Timeout'));

      await expect(service.create(dto)).rejects.toThrow(
        InternalServerErrorException,
      );

      // Verify Saga compensating action was called
      expect(mockGrpcService.releaseStock).toHaveBeenCalledWith({
        items: [{ productId: 'prod-1', quantity: 2 }],
      });
    });

    it('should successfully create order and cache idempotency result', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockGrpcService.checkStock.mockReturnValue(
        of({
          allAvailable: true,
          items: [
            {
              productId: 'prod-1',
              available: true,
              currentStock: 10,
              price: 50,
              name: 'Item A',
              message: 'Available',
            },
          ],
        }),
      );
      mockGrpcService.reserveStock.mockReturnValue(
        of({
          success: true,
          message: 'Reserved',
          failedProductId: '',
        }),
      );
      const createdOrder = {
        id: 'order-1',
        userId: 'user-1',
        total: 100,
        createdAt: new Date('2026-09-29T10:00:00.000Z'),
        items: [{ id: 'item-1', productId: 'prod-1', quantity: 2, price: 50 }],
      };
      mockDb.order.create.mockResolvedValue(createdOrder);

      const result = await service.create({
        ...dto,
        idempotencyKey: 'key-123',
      });

      expect(result).toEqual(createdOrder);
      expect(mockRabbitClient.emit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({
          orderId: 'order-1',
          userId: 'user-1',
          total: 100,
        }),
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'idempotency:order:key-123',
        createdOrder,
        86400,
      );
      expect(mockRedis.del).toHaveBeenCalledWith('idempotency:lock:key-123');
    });
  });
});
