import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  constructor() {
    const rawUrl = process.env.REDIS_URL;
    const redisUrl =
      rawUrl && (rawUrl.startsWith('redis://') || rawUrl.startsWith('rediss://'))
        ? rawUrl
        : 'redis://localhost:6379';

    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.redis.on('ready', () => {
      this.logger.log('Redis ready');
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis error: ${error.message}`);
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Redis GET failed for key "${key}": ${(error as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      this.logger.error(`Redis SET failed for key "${key}": ${(error as Error).message}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Redis DEL failed for key "${key}": ${(error as Error).message}`);
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.logger.error(`Redis delPattern failed for pattern "${pattern}": ${(error as Error).message}`);
    }
  }

  async incrementWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const script = `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return count
    `;

    try {
      const result = await this.redis.eval(script, 1, key, ttlSeconds);
      return typeof result === 'number' ? result : Number(result);
    } catch (error) {
      this.logger.error(`Redis incrementWithTtl failed for key "${key}": ${(error as Error).message}`);
      // Fallback: return 0 so rate limit fails open when Redis is unavailable
      return 0;
    }
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(`Redis setIfNotExists failed for key "${key}": ${(error as Error).message}`);
      // Fallback: allow proceeding if Redis lock cannot be acquired due to outage
      return true;
    }
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
