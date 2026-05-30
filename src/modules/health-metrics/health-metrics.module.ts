import { Module } from '@nestjs/common';
import { HealthMetricsService } from './health-metrics.service';
import { HealthMetricsController } from './health-metrics.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HealthMetricsController],
  providers: [HealthMetricsService],
  exports: [HealthMetricsService],
})
export class HealthMetricsModule {}
