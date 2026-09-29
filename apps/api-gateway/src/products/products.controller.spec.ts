import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { RateLimitService } from '../common/rate-limit/rate-limit.service.js';
import { Reflector } from '@nestjs/core';

describe('ProductsController', () => {
  let controller: ProductsController;

  const mockProductsService = {
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  const mockRateLimitService = {
    check: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, count: 1 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: ProductsService,
          useValue: mockProductsService,
        },
        {
          provide: RateLimitService,
          useValue: mockRateLimitService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all products', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([]);
    expect(mockProductsService.findAll).toHaveBeenCalled();
  });
});
