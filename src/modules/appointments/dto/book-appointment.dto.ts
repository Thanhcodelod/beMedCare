import {
  IsDateString,
  IsNotEmpty,
  Matches,
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AppointmentType, PaymentMethod } from '@prisma/client';

export class BookAppointmentDto {
  @ApiProperty({ example: 'uuid-doctor-details-id' })
  @IsNotEmpty()
  @IsUUID('4')
  doctor_id: string;

  @ApiProperty({ example: '2026-04-03', description: 'YYYY-MM-DD' })
  @IsNotEmpty()
  @IsDateString({ strict: true })
  appointment_date: string;

  @ApiProperty({ example: '09:00', description: 'HH:mm, 24h' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'start_time must be HH:mm',
  })
  start_time: string;

  @ApiProperty({ enum: AppointmentType })
  @IsNotEmpty()
  @IsEnum(AppointmentType)
  appointment_type: AppointmentType;

  @ApiProperty({ enum: PaymentMethod, required: false })
  @IsOptional()
  @IsEnum(PaymentMethod)
  payment_method?: PaymentMethod;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  patient_note?: string;
}
