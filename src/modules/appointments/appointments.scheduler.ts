import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppointmentsService } from './appointments.service';

@Injectable()
export class AppointmentsScheduler {
  private readonly logger = new Logger(AppointmentsScheduler.name);

  constructor(private readonly appointments: AppointmentsService) {}

  // Run every 5 minutes. The cron itself is cheap (one indexed scan over
  // today's PENDING/CONFIRMED OFFLINE appointments). 5-minute resolution
  // is fine for a "patient is late by ~slot" workflow.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoNoShow(): Promise<void> {
    try {
      const { noShowCount } = await this.appointments.sweepNoShows();
      if (noShowCount > 0) {
        this.logger.log(`Cron auto-noshow flipped ${noShowCount} rows`);
      }
    } catch (err) {
      // Never let a cron failure crash the worker. Log and move on —
      // the next tick will retry.
      this.logger.error(
        `Auto-noshow sweep failed: ${(err as Error).message}`,
      );
    }
  }
}
