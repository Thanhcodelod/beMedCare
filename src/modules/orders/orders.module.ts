import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController, WebhookController],
  providers: [OrdersService],
  // Exported so AppointmentsService can issue a SePay order during booking
  // when payment_method = ADVANCE_PAYMENT.
  exports: [OrdersService],
})
export class OrdersModule {}
