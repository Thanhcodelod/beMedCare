import {
  IsDateString,
  IsInt,
  Min,
  Max,
  Matches,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDailyScheduleDto {
  @ApiProperty({
    example: '2026-10-15',
    description: 'Ngày làm việc (YYYY-MM-DD)',
  })
  @IsNotEmpty()
  @IsDateString()
  date: string;

  @ApiProperty({ example: '08:00', description: 'Giờ bắt đầu (HH:mm)' })
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Định dạng giờ phải là HH:mm',
  })
  start_time: string;

  @ApiProperty({ example: '17:00', description: 'Giờ kết thúc (HH:mm)' })
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Định dạng giờ phải là HH:mm',
  })
  end_time: string;

  @ApiProperty({ example: 30, description: 'Thời lượng 1 ca khám (phút)' })
  @IsNotEmpty()
  @IsInt()
  @Min(5)
  @Max(120)
  @Type(() => Number)
  slot_duration: number;

  @ApiProperty({
    example: '12:00',
    description: 'Giờ bắt đầu nghỉ trưa (HH:mm) - Tùy chọn',
    required: false,
  })
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Định dạng giờ phải là HH:mm',
  })
  break_start_time?: string;

  @ApiProperty({
    example: '13:00',
    description: 'Giờ kết thúc nghỉ trưa (HH:mm) - Tùy chọn',
    required: false,
  })
  @IsOptional()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Định dạng giờ phải là HH:mm',
  })
  break_end_time?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;
}
