import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelAppointmentDto {
  @ApiProperty({
    example: 'Bận việc đột xuất',
    description: 'Lý do hủy lịch (tùy chọn)',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
