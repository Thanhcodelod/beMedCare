import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SepayWebhookDto } from './dto/sepay-webhook.dto';
import { OrdersService } from './orders.service';

@ApiTags('Payments (SePay webhook)')
@Controller('payments')
// SePay can legitimately burst many deliveries per minute during a sale —
// skip every named throttler, we rely on the API key check instead.
// (Bare @SkipThrottle() only skips `default`; named buckets still tick.)
@SkipThrottle({ default: true, auth: true, sensitive: true })
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private readonly apiKey?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly ordersService: OrdersService,
  ) {
    this.apiKey = this.config.get<string>('SEPAY_WEBHOOK_API_KEY');
  }

  @Post('webhook')
  // Always respond 200 for the happy path. SePay treats non-2xx as failure
  // and will retry — we don't want a valid "ignored" (e.g. order not found)
  // to cause a retry storm.
  @HttpCode(200)
  @ApiOperation({
    summary: 'SePay payment webhook — verifies API key and marks order PAID',
  })
  async handleWebhook(
    @Headers('authorization') auth: string | undefined,
    @Body() dto: SepayWebhookDto,
  ) {
    if (this.apiKey) {
      // Accept both "Apikey <key>" (SePay's docs) and "ApiKey <key>".
      const m = auth?.match(/^Apikey\s+(.+)$/i);
      if (!m || m[1] !== this.apiKey) {
        this.logger.warn('SePay webhook auth failed');
        throw new UnauthorizedException();
      }
    } else {
      this.logger.warn('SEPAY_WEBHOOK_API_KEY not set — webhook is unprotected');
    }

    this.logger.log(
      `SePay webhook id=${dto.id} type=${dto.transferType} amount=${dto.transferAmount} content="${dto.content}"`,
    );

    return this.ordersService.handleSepayWebhook(dto);
  }
}
