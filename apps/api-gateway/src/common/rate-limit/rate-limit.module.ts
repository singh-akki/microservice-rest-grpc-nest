import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';

@Global()
@Module({
    providers: [RateLimitService, RateLimitGuard],
    exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule { }
