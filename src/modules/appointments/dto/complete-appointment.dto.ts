import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CompleteAppointmentDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  diagnosis: string;

  @ApiProperty({ required: false, description: 'ICD-10 code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  diagnostic_code?: string;

  // Optional: the doctor may explicitly mark "không cần kê đơn" (e.g.
  // routine follow-up, observation-only). FE either omits the field or
  // sends an empty string when the checkbox is ticked.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  prescription?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  advice?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  treatment?: string;
}
