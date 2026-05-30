import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

// Per-user rate limiter for WebSocket events. Uses Redis INCR with TTL
// so multiple Nest instances share the same budget — local in-memory
// would let a hot client cheat by reconnecting.
@Injectable()
export class WsRateLimiter implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WsRateLimiter.name);
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
      port: parseInt(this.config.get<string>('REDIS_PORT') ?? '6379', 10),
      password: this.config.get<string>('REDIS_PASSWORD'),
      // Don't crash the gateway if Redis blips — `hit()` handles errors
      // by failing-open (allow the event), which is the right default for
      // a rate limiter (better to over-serve than to disconnect users).
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.redis.on('error', (err) => {
      this.logger.warn(`Redis rate-limiter error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  // Atomic increment-and-check. Returns true if the user is still under
  // their quota for this window. The first hit in a new window also sets
  // the TTL so the counter expires on its own.
  async hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      return count <= limit;
    } catch (err) {
      // Fail-open: prefer letting traffic through over disconnecting users
      // when Redis is unhealthy. Logged so ops can see it.
      this.logger.warn(
        `Rate-limit check failed (allowing through): ${(err as Error).message}`,
      );
      return true;
    }
  }
}
