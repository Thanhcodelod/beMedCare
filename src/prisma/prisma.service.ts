import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      // Surface the real cause (bad DATABASE_URL, DB down, wrong creds) in
      // the log instead of letting Nest swallow it under a generic boot
      // failure — otherwise debugging a non-starting container is painful.
      this.logger.error(
        `Database connection failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
