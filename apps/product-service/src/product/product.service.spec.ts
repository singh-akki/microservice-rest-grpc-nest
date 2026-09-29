import { Test, TestingModule } from '@nestjs/testing';
import { ProductService } from './product.service.js';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis';

describe('ProductService', () => {
  let service: ProductService;

  const mockDb = {
    product: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    setIfNotExists: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: DatabaseService,
          useValue: mockDb,
        },
        {
          provide: RedisService,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne (with cache and stampede protection)', () => {
    const mockProduct = {
      id: 'prod-1',
      name: 'Test Product',
      price: 99.99,
      stock: 10,
      isActive: true,
    };

    it('should return cached product if cache exists', async () => {
      mockRedis.get.mockResolvedValue(mockProduct);

      const result = await service.findOne('prod-1');

      expect(result).toEqual(mockProduct);
      expect(mockRedis.get).toHaveBeenCalledWith('product:prod-1');
      expect(mockDb.product.findUnique).not.toHaveBeenCalled();
    });

    it('should query DB and cache result when cache misses and lock is acquired', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setIfNotExists.mockResolvedValue(true);
      mockDb.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findOne('prod-1');

      expect(result).toEqual(mockProduct);
      expect(mockDb.product.findUnique).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
      expect(mockRedis.set).toHaveBeenCalledWith('product:prod-1', mockProduct, 300);
      expect(mockRedis.del).toHaveBeenCalledWith('lock:product:prod-1');
    });
  });

  describe('update (with cache invalidation)', () => {
    it('should update product and invalidate cache', async () => {
      const existingProduct = { id: 'prod-1', name: 'Old' };
      const updatedProduct = { id: 'prod-1', name: 'New' };

      mockDb.product.findUnique.mockResolvedValue(existingProduct);
      mockDb.product.update.mockResolvedValue(updatedProduct);

      const result = await service.update('prod-1', { name: 'New' });

      expect(result).toEqual(updatedProduct);
      expect(mockRedis.del).toHaveBeenCalledWith('product:prod-1');
      expect(mockRedis.del).toHaveBeenCalledWith('products:all');
    });
  });

  describe('remove (with cache invalidation)', () => {
    it('should remove product and invalidate cache', async () => {
      const existingProduct = { id: 'prod-1', name: 'Old' };

      mockDb.product.findUnique.mockResolvedValue(existingProduct);
      mockDb.product.delete.mockResolvedValue(existingProduct);

      const result = await service.remove('prod-1');

      expect(result).toEqual(existingProduct);
      expect(mockRedis.del).toHaveBeenCalledWith('product:prod-1');
      expect(mockRedis.del).toHaveBeenCalledWith('products:all');
    });
  });
});
