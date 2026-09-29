import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service.js';

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      on = vi.fn();
      get = vi.fn();
      set = vi.fn();
      del = vi.fn();
      eval = vi.fn();
      ping = vi.fn().mockResolvedValue('PONG');
      quit = vi.fn().mockResolvedValue('OK');
      disconnect = vi.fn();
    },
  };
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should ping redis', async () => {
    const healthy = await service.ping();
    expect(healthy).toBe(true);
  });
});
