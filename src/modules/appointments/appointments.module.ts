import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AppointmentsScheduler } from './appointments.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    PrismaModule,
    OrdersModule,
    BullModule.registerQueue({
      name: 'reminder-queue',
    }),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AppointmentsScheduler],
})
export class AppointmentsModule {}
