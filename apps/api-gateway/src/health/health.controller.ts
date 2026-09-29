import { Controller, Get } from '@nestjs/common';
import { RedisService } from '@app/redis';

@Controller('health')
export class HealthController {
    constructor(
        private readonly redis: RedisService,
    ) { }

    @Get()
    health() {
        return { status: 'ok' };
    }

    @Get('redis')
    async redisHealth() {
        const healthy = await this.redis.ping();
        return {
            redis: healthy ? 'up' : 'down',
            status: healthy ? 'healthy' : 'degraded',
        };
    }
}
