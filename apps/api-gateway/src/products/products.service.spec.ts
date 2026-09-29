import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service.js';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockHttpService = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn().mockReturnValue('http://localhost:3001'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
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

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
