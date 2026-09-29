import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { DatabaseService } from '@app/database';
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

  const mockGrpcService = {
    checkStock: vi.fn(),
    reserveStock: vi.fn(),
  };

  const mockClientGrpc = {
    getService: vi.fn().mockReturnValue(mockGrpcService),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderServiceService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: 'PRODUCT_PACKAGE',
          useValue: mockClientGrpc,
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

    it('should throw BadRequestException if stock is insufficient', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockGrpcService.checkStock.mockReturnValue(
        of({
          available: false,
          currentStock: 1,
          price: 100,
          name: 'Item A',
          message: 'Insufficient stock',
        }),
      );

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should create order when stock check and reservation succeed', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockGrpcService.checkStock.mockReturnValue(
        of({
          available: true,
          currentStock: 10,
          price: 50,
          name: 'Item A',
          message: 'Stock is available',
        }),
      );
      mockGrpcService.reserveStock.mockReturnValue(
        of({
          success: true,
          message: 'Reserved',
        }),
      );
      mockDb.order.create.mockResolvedValue({
        id: 'order-1',
        userId: 'user-1',
        total: 100,
        items: [{ id: 'item-1', productId: 'prod-1', quantity: 2, price: 50 }],
      });

      const result = await service.create(dto);

      expect(mockGrpcService.checkStock).toHaveBeenCalledWith({
        productId: 'prod-1',
        quantity: 2,
      });
      expect(mockGrpcService.reserveStock).toHaveBeenCalledWith({
        productId: 'prod-1',
        quantity: 2,
      });
      expect(mockDb.order.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          status: 'CONFIRMED',
          total: 100,
          items: {
            create: [
              { productId: 'prod-1', quantity: 2, price: 50 },
            ],
          },
        },
        include: {
          items: true,
        },
      });
      expect(result).toHaveProperty('id', 'order-1');
    });
  });
});
