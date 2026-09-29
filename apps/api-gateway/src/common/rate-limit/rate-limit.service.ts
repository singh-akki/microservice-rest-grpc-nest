import { Injectable } from '@nestjs/common';
import { RedisService } from '@app/redis';

@Injectable()
export class RateLimitService {
    constructor(
        private readonly redis: RedisService,
    ) { }

    async check(
        identifier: string,
        limit: number,
        windowSeconds: number,
    ) {
        const key = `rate-limit:${identifier}`;

        const count = await this.redis.incrementWithTtl(
            key,
            windowSeconds,
        );

        // Fallback: If Redis is offline/unreachable (count === 0), fail open gracefully
        if (count === 0) {
            return {
                allowed: true,
                count: 0,
                remaining: limit,
            };
        }

        return {
            allowed: count <= limit,
            count,
            remaining: Math.max(limit - count, 0),
        };
    }
}
