import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service.js';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockGrpcService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  const mockClientGrpc = {
    getService: vi.fn().mockReturnValue(mockGrpcService),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: 'PRODUCT_PACKAGE',
          useValue: mockClientGrpc,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
