import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AdminModule } from './modules/admin/admin.module';
import { LeaveRequestsModule } from './modules/leave-requests/leave-requests.module';
import { HealthMetricsModule } from './modules/health-metrics/health-metrics.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { TeleconsultationModule } from './modules/teleconsultation/teleconsultation.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Cron jobs (auto-NO_SHOW for offline appointments past their slot).
    ScheduleModule.forRoot(),

    // Multiple named throttlers; routes can opt into stricter ones with
    // @Throttle({ <name>: { ... } }). The global guard evaluates all of
    // them — the request fails as soon as any is exceeded.
    ThrottlerModule.forRoot({
      throttlers: [
        // Catch-all per-IP rate limit. Bumped from 100 → 300 because a single
        // dashboard load can fan out 20-30 parallel reads (doctors list,
        // profile, schedule preview, etc.) and we don't want the legitimate
        // page-load to trip the limit.
        { name: 'default', ttl: seconds(60), limit: 300 },
        // Tightened bucket auth-specific routes opt into.
        { name: 'auth', ttl: seconds(60), limit: 10 },
        // Very-strict bucket for high-value flows like forgot-password.
        { name: 'sensitive', ttl: seconds(15 * 60), limit: 20 },
      ],
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: parseInt(config.get<string>('REDIS_PORT') ?? '6379', 10),
          password: config.get<string>('REDIS_PASSWORD'),
        },
      }),
    }),

    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    SchedulesModule,
    AppointmentsModule,
    NotificationsModule,
    ReviewsModule,
    AdminModule,
    LeaveRequestsModule,
    HealthMetricsModule,
    AnalyticsModule,
    MedicalRecordsModule,
    TeleconsultationModule,
    OrdersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
