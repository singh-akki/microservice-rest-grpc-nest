import { RateLimitGuard } from './rate-limit.guard.js';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service.js';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockReflector: Partial<Reflector>;
  let mockRateLimitService: Partial<RateLimitService>;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: vi.fn(),
    };
    mockRateLimitService = {
      check: vi.fn(),
    };
    guard = new RateLimitGuard(
      mockRateLimitService as RateLimitService,
      mockReflector as Reflector,
    );
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow request if no @RateLimit options are defined', async () => {
    (mockReflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({ ip: '127.0.0.1', headers: {} }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(mockContext);
    expect(result).toBe(true);
  });

  it('should throw HttpException 429 if rate limit is exceeded', async () => {
    (mockReflector.getAllAndOverride as ReturnType<typeof vi.fn>).mockReturnValue({
      limit: 5,
      windowSeconds: 60,
    });
    (mockRateLimitService.check as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      count: 6,
      remaining: 0,
    });

    const mockContext = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({ ip: '127.0.0.1', headers: {} }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS),
    );
  });
});
