import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service.js';

describe('OrdersService', () => {
  let service: OrdersService;

  const mockHttpService = {
    post: vi.fn(),
    get: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('http://localhost:3002'),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should forward order creation to Order Service with verified userId', async () => {
      const orderData = { id: 'order-1', total: 100 };
      mockHttpService.post.mockReturnValue(of({ data: orderData }));

      const dto = {
        items: [{ productId: 'prod-1', quantity: 2 }],
      };

      const result = await service.create('user-123', dto, 'key-abc');

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://localhost:3002/orders',
        {
          items: [{ productId: 'prod-1', quantity: 2 }],
          userId: 'user-123',
          idempotencyKey: 'key-abc',
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'idempotency-key': 'key-abc',
            'x-correlation-id': expect.any(String),
          }),
          timeout: 10000,
        }),
      );
      expect(result).toEqual(orderData);
    });

    it('should translate axios 400 error to BadRequestException', async () => {
      const axiosError = new AxiosError('Bad Request');
      axiosError.response = {
        status: 400,
        data: { message: 'Insufficient stock' },
      } as any;

      mockHttpService.post.mockReturnValue(throwError(() => axiosError));

      await expect(
        service.create('user-123', { items: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should fetch order by ID from Order Service', async () => {
      const orderData = { id: 'order-1', userId: 'user-123' };
      mockHttpService.get.mockReturnValue(of({ data: orderData }));

      const result = await service.findOne('order-1');

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'http://localhost:3002/orders/order-1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-correlation-id': expect.any(String),
          }),
          timeout: 5000,
        }),
      );
      expect(result).toEqual(orderData);
    });

    it('should translate axios 404 error to NotFoundException', async () => {
      const axiosError = new AxiosError('Not Found');
      axiosError.response = {
        status: 404,
        data: { message: 'Order not found' },
      } as any;

      mockHttpService.get.mockReturnValue(throwError(() => axiosError));

      await expect(service.findOne('order-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
