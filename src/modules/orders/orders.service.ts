import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus, OrderStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { SepayWebhookDto } from './dto/sepay-webhook.dto';

export interface CreateOrderResponse {
  orderId: string;
  amount: number;
  transferCode: string;
  qrUrl: string;
  appointmentId?: string;
}

export interface OrderStatusResponse {
  orderId: string;
  amount: number;
  status: OrderStatus;
  transferCode: string;
  success: boolean;
  appointmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookResult =
  | { success: true; status: 'ok'; orderId: string }
  | { success: false; status: 'ignored'; reason: string }
  | { success: false; status: 'rejected'; reason: string };

// SePay's default payment-code template is "DH<3-10 integer digits>"
// (see SePay dashboard → Cấu trúc mã thanh toán). 8 digits = 100M slots,
// effectively zero collision risk for our scale and fits the default
// template exactly so SePay recognises every order without extra config.
const TRANSFER_CODE_PREFIX = 'DH';
const TRANSFER_CODE_DIGITS = 8;

function generateTransferCode(): string {
  const max = 10 ** TRANSFER_CODE_DIGITS;
  const n = crypto.randomInt(0, max);
  return `${TRANSFER_CODE_PREFIX}${String(n).padStart(TRANSFER_CODE_DIGITS, '0')}`;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<CreateOrderResponse> {
    // If linking to an appointment, make sure it belongs to the same user
    // — otherwise anyone could pay-to-confirm someone else's appointment.
    if (dto.appointmentId) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        select: {
          id: true,
          patient: { select: { profile: { select: { user_id: true } } } },
        },
      });
      if (!appt) throw new NotFoundException('Appointment not found');
      if (appt.patient?.profile?.user_id !== userId) {
        throw new ForbiddenException('Not your appointment');
      }
    }

    return this.createOrderInTx(this.prisma, userId, dto);
  }

  // Same as createOrder but accepts an existing Prisma TX client so the
  // caller can chain it inside a larger transaction (booking flow).
  // Skips ownership check on appointment — caller is responsible for that
  // (in the booking flow we just created the appointment ourselves).
  async createOrderInTx(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    dto: CreateOrderDto,
  ): Promise<CreateOrderResponse> {
    // Retry a couple of times on the unlikely chance of a digit collision.
    let transferCode = generateTransferCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await tx.order.findUnique({
        where: { transfer_code: transferCode },
        select: { id: true },
      });
      if (!exists) break;
      transferCode = generateTransferCode();
    }

    const order = await tx.order.create({
      data: {
        user_id: userId,
        appointment_id: dto.appointmentId,
        amount: dto.amount,
        transfer_code: transferCode,
      },
    });

    return {
      orderId: order.id,
      amount: order.amount,
      transferCode: order.transfer_code,
      qrUrl: this.buildVietQrUrl(order.amount, transferCode),
      appointmentId: order.appointment_id ?? undefined,
    };
  }

  async findOne(userId: string, orderId: string): Promise<OrderStatusResponse> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.user_id !== userId) {
      throw new ForbiddenException('Not your order');
    }

    return {
      orderId: order.id,
      amount: order.amount,
      status: order.status,
      transferCode: order.transfer_code,
      success: order.status === OrderStatus.PAID,
      appointmentId: order.appointment_id,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  async handleSepayWebhook(payload: SepayWebhookDto): Promise<WebhookResult> {
    // Always log the raw payload for audit, regardless of how we resolve it.
    const logBase: Prisma.PaymentLogUncheckedCreateInput = {
      raw_payload: payload as unknown as Prisma.InputJsonValue,
      result: 'ignored',
    };

    if (payload.transferType !== 'in') {
      await this.writeLog({ ...logBase, reason: 'not an incoming transfer' });
      return {
        success: false,
        status: 'ignored',
        reason: 'not an incoming transfer',
      };
    }

    // SePay's default template is "DH<3-10 digit integer>". Match it
    // case-insensitively and tolerate any spaces SePay may leave between
    // the prefix and digits when it forwards the bank memo.
    const match = payload.content.match(
      new RegExp(
        `${TRANSFER_CODE_PREFIX}\\s*(\\d{3,10})`,
        'i',
      ),
    );
    if (!match) {
      await this.writeLog({ ...logBase, reason: 'no transfer code in content' });
      return {
        success: false,
        status: 'ignored',
        reason: 'no transfer code in content',
      };
    }
    const transferCode = `${TRANSFER_CODE_PREFIX}${match[1]}`;

    const order = await this.prisma.order.findUnique({
      where: { transfer_code: transferCode },
    });
    if (!order) {
      await this.writeLog({ ...logBase, reason: 'order not found' });
      return { success: false, status: 'ignored', reason: 'order not found' };
    }

    // Duplicate webhook guard. SePay retries on any non-2xx — a successful
    // response that failed to reach them comes back with the same `id`.
    if (
      order.sepay_txn_id !== null &&
      order.sepay_txn_id === BigInt(payload.id)
    ) {
      await this.writeLog({
        ...logBase,
        order_id: order.id,
        reason: 'duplicate webhook',
      });
      return { success: false, status: 'ignored', reason: 'duplicate webhook' };
    }

    // Strict amount equality. Underpayment AND overpayment both reject —
    // safer for accounting than silently accepting overpayment, since money
    // received but not credited becomes an audit-visible row in payment_logs
    // for an admin to review/refund.
    if (payload.transferAmount !== order.amount) {
      await this.writeLog({
        ...logBase,
        order_id: order.id,
        result: 'rejected',
        reason: `amount mismatch (expected ${order.amount}, got ${payload.transferAmount})`,
      });
      return {
        success: false,
        status: 'rejected',
        reason: 'amount mismatch',
      };
    }

    // All checks passed — atomic claim + cascade to appointment, all in
    // one transaction. updateMany on PENDING ensures only the first
    // concurrent webhook flips the row.
    const result = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING },
        data: { status: OrderStatus.PAID, sepay_txn_id: BigInt(payload.id) },
      });
      if (claim.count === 0) return { claimed: false };

      if (order.appointment_id) {
        await tx.appointment.update({
          where: { id: order.appointment_id },
          data: { status: AppointmentStatus.CONFIRMED },
        });
      }

      await tx.paymentLog.create({
        data: {
          order_id: order.id,
          result: 'ok',
          raw_payload: payload as unknown as Prisma.InputJsonValue,
        },
      });

      return { claimed: true };
    });

    if (!result.claimed) {
      await this.writeLog({
        ...logBase,
        order_id: order.id,
        reason: 'already paid',
      });
      return { success: false, status: 'ignored', reason: 'already paid' };
    }

    this.logger.log(
      `Order ${transferCode} paid by user=${order.user_id} via SePay txn ${payload.id}`,
    );
    return { success: true, status: 'ok', orderId: order.id };
  }

  private async writeLog(data: Prisma.PaymentLogUncheckedCreateInput) {
    // Logs are best-effort — never let an audit-write failure break a
    // webhook response.
    try {
      await this.prisma.paymentLog.create({ data });
    } catch (err) {
      this.logger.error(
        `Failed to write payment log: ${(err as Error).message}`,
      );
    }
  }

  private buildVietQrUrl(amount: number, addInfo: string): string {
    const bank = this.config.get<string>('VIETQR_BANK_BIN');
    const account = this.config.get<string>('VIETQR_ACCOUNT_NUMBER');
    const name = this.config.get<string>('VIETQR_ACCOUNT_NAME') ?? '';
    if (!bank || !account) {
      throw new BadRequestException(
        'Server misconfigured: VIETQR_BANK_BIN / VIETQR_ACCOUNT_NUMBER missing',
      );
    }
    const qs = new URLSearchParams({
      amount: String(amount),
      addInfo,
      accountName: name,
    });
    return `https://img.vietqr.io/image/${bank}-${account}-compact.jpg?${qs.toString()}`;
  }
}
