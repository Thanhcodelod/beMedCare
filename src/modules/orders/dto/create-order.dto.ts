import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateOrderDto {
  // VietQR accepts 1,000 — 500,000,000 VND. Stay inside that range so the
  // returned QR image is always payable.
  @ApiProperty({ example: 50000, minimum: 1000, maximum: 500000000 })
  @IsInt()
  @Min(1000)
  @Max(500_000_000)
  amount: number;

  // Optional: link this order to an existing appointment so paying it
  // automatically confirms the appointment.
  @ApiProperty({ required: false, description: 'Existing appointment id' })
  @IsOptional()
  @IsUUID('4')
  appointmentId?: string;
}
