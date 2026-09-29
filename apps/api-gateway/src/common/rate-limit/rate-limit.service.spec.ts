import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService } from './rate-limit.service.js';
import { RedisService } from '@app/redis';

describe('RateLimitService', () => {
  let service: RateLimitService;

  const mockRedisService = {
    incrementWithTtl: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should allow requests within limit', async () => {
    mockRedisService.incrementWithTtl.mockResolvedValue(3);
    const result = await service.check('user-1', 5, 60);

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
    expect(result.remaining).toBe(2);
  });

  it('should block requests exceeding limit', async () => {
    mockRedisService.incrementWithTtl.mockResolvedValue(6);
    const result = await service.check('user-1', 5, 60);

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(6);
    expect(result.remaining).toBe(0);
  });

  it('should fail open if Redis is down (count === 0)', async () => {
    mockRedisService.incrementWithTtl.mockResolvedValue(0);
    const result = await service.check('user-1', 5, 60);

    expect(result.allowed).toBe(true);
  });
});
