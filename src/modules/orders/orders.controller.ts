import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders (SePay QR)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Create an order for the current user (JWT required)' })
  create(@GetUser('id') userId: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(userId, dto);
  }

  @Get(':id')
  // Polling endpoint — FE checks every 5-10s after user transfers money.
  // Budget sized for the realistic worst case (don't fight legitimate UI):
  //   1 order * 1 tab * 8s poll  = ~7.5 req/min
  //   + React-Query retry-once on transient error = ~15
  //   + React StrictMode in dev double-mount      = ~30
  //   + 2-3 tabs of the same user open            = ~60-90
  // 120/min leaves headroom over those without giving up the protection
  // that motivated overriding the global default in the first place.
  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  @ApiOperation({
    summary:
      'Get order status. Only the user who created the order can read it.',
  })
  findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.ordersService.findOne(userId, id);
  }
}
