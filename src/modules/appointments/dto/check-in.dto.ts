import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckInDto {
  // Receptionist confirms the patient has paid at the desk. For
  // ADVANCE_PAYMENT appointments the order is already PAID, but we still
  // accept the flag from the desk (paper / cash backup) to support
  // walk-in / change-of-method scenarios.
  @ApiProperty({ description: 'Patient has paid at the desk' })
  @IsBoolean()
  payment_confirmed: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
