import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service.js';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from './rate-limit.decorator.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly reflector: Reflector,
  ) { }

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      );

    // No custom limit → allow request
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const forwarded = request.headers['x-forwarded-for'];
    const ip =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ||
      request.ip ||
      request.socket?.remoteAddress ||
      'unknown';

    const result = await this.rateLimit.check(
      ip,
      options.limit,
      options.windowSeconds,
    );

    if (!result.allowed) {
      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}