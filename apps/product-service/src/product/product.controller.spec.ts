import { Test, TestingModule } from '@nestjs/testing';
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';

describe('ProductController', () => {
  let controller: ProductController;

  const mockProductService = {
    create: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        {
          provide: ProductService,
          useValue: mockProductService,
        },
      ],
    }).compile();

    controller = module.get<ProductController>(ProductController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all products', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([]);
    expect(mockProductService.findAll).toHaveBeenCalled();
  });
});
