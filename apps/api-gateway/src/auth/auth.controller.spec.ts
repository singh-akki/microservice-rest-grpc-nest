import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RateLimitService } from '../common/rate-limit/rate-limit.service.js';
import { Reflector } from '@nestjs/core';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };

  const mockRateLimitService = {
    check: vi.fn().mockResolvedValue({ allowed: true, count: 1, remaining: 4 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: RateLimitService,
          useValue: mockRateLimitService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
