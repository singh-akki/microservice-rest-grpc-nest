import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { RedisService } from '@app/redis';

describe('HealthController', () => {
  let controller: HealthController;

  const mockRedisService = {
    ping: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return redis up status', async () => {
    const result = await controller.redisHealth();
    expect(result).toEqual({ redis: 'up', status: 'healthy' });
  });
});
